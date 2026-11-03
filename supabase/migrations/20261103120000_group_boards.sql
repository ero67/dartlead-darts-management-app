-- Per-group boards: a manager can confine a group to some of the boards
-- (group A on boards 1-2, group B on 3-4) and auto-assign respects it.
-- NULL / empty = any board, which is today's behaviour, so installed APKs
-- and the old frontend see no change. Safe to re-run.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS boards smallint[];

-- The 3-argument signature must go before the 4-argument one exists, or
-- PostgREST sees two overloads and rejects the call. Old callers pass three
-- named arguments, which the defaulted fourth accepts.
DROP FUNCTION IF EXISTS public.set_match_boards(uuid, integer, jsonb);

-- Sets the tournament's board count, the board of waiting matches and the
-- boards of groups.
-- p_assignments: { "<match id>": <board> | null }. Only pending matches
-- change, so live and finished matches keep the board they were played on.
-- First-round playoff matches have no matches row until they start; the row
-- is created from the bracket (as complete_playoff_match does for later
-- rounds) so the assignment has somewhere to live.
-- p_group_boards: { "<group id>": [1, 2] }; NULL leaves groups untouched, an
-- empty array means any board. Boards above the count are rejected, and
-- lowering the count prunes stored group boards above it.
CREATE OR REPLACE FUNCTION public.set_match_boards(
  p_tournament_id uuid,
  p_board_count integer,
  p_assignments jsonb DEFAULT '{}'::jsonb,
  p_group_boards jsonb DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow public.tournaments%ROWTYPE;
  a record;
  g record;
  board smallint;
  bm jsonb;
  gb smallint[];
BEGIN
  IF NOT public.can_manage_tournament(p_tournament_id) THEN
    RAISE EXCEPTION 'Only a tournament manager can assign boards' USING ERRCODE = '42501';
  END IF;
  IF p_board_count IS NOT NULL AND (p_board_count < 1 OR p_board_count > 99) THEN
    RAISE EXCEPTION 'Board count must be between 1 and 99' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournaments SET board_count = p_board_count
  WHERE id = p_tournament_id
  RETURNING * INTO trow;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'P0002';
  END IF;

  FOR g IN SELECT key, value FROM jsonb_each(COALESCE(p_group_boards, '{}'::jsonb)) LOOP
    IF jsonb_typeof(g.value) <> 'array' THEN
      RAISE EXCEPTION 'Group boards must be an array' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(b::smallint) INTO gb FROM jsonb_array_elements_text(g.value) b;
    IF gb IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(gb) b WHERE b < 1 OR b > COALESCE(p_board_count, 99)) THEN
      RAISE EXCEPTION 'Group board must be between 1 and the board count' USING ERRCODE = '22023';
    END IF;
    UPDATE public.groups SET boards = NULLIF(gb, '{}'::smallint[])
    WHERE id = g.key::uuid AND tournament_id = p_tournament_id;
  END LOOP;

  IF p_board_count IS NOT NULL THEN
    UPDATE public.groups
    SET boards = NULLIF((SELECT array_agg(b) FROM unnest(boards) b WHERE b <= p_board_count), '{}'::smallint[])
    WHERE tournament_id = p_tournament_id AND boards IS NOT NULL;
  END IF;

  FOR a IN SELECT key, value FROM jsonb_each(COALESCE(p_assignments, '{}'::jsonb)) LOOP
    board := CASE WHEN jsonb_typeof(a.value) = 'number' THEN (a.value #>> '{}')::smallint END;
    IF board IS NOT NULL AND (board < 1 OR board > 99) THEN
      RAISE EXCEPTION 'Board must be between 1 and 99' USING ERRCODE = '22023';
    END IF;

    UPDATE public.matches SET assigned_board = board
    WHERE id = a.key::uuid AND tournament_id = p_tournament_id AND status = 'pending';

    IF NOT FOUND AND board IS NOT NULL THEN
      SELECT m INTO bm
      FROM jsonb_array_elements(COALESCE(trow.playoffs -> 'rounds', '[]'::jsonb)) r,
           jsonb_array_elements(COALESCE(r -> 'matches', '[]'::jsonb)) m
      WHERE m ->> 'id' = a.key
      LIMIT 1;
      IF bm IS NOT NULL
         AND bm -> 'player1' ->> 'id' IS NOT NULL
         AND bm -> 'player2' ->> 'id' IS NOT NULL
         AND COALESCE(bm ->> 'status', 'pending') = 'pending' THEN
        INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, is_playoff,
                                    playoff_round, playoff_match_number, legs_to_win, starting_score, assigned_board)
        VALUES (
          a.key::uuid,
          p_tournament_id,
          (bm -> 'player1' ->> 'id')::uuid,
          (bm -> 'player2' ->> 'id')::uuid,
          'pending',
          true,
          (bm ->> 'playoffRound')::int,
          (bm ->> 'playoffMatchNumber')::int,
          COALESCE(trow.legs_to_win, 3),
          COALESCE(trow.starting_score, 501),
          board
        )
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_match_boards(uuid, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_match_boards(uuid, integer, jsonb, jsonb) TO authenticated;

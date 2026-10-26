-- Board scheduling: a manager tells waiting matches which dartboard they go
-- to, so players see "where do I play next" on the cards and the TV.
-- Only nullable columns: installed APKs (select('*')) ignore them, and a
-- match started on any device still records its real board in
-- live_board_number. Safe to re-run.

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS assigned_board smallint;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS board_count smallint;

-- Sets the tournament's board count and the board of waiting matches.
-- p_assignments: { "<match id>": <board> | null }. Only pending matches
-- change, so live and finished matches keep the board they were played on.
-- First-round playoff matches have no matches row until they start; the row
-- is created from the bracket (as complete_playoff_match does for later
-- rounds) so the assignment has somewhere to live. startMatch re-applies the
-- round's format when the match starts.
CREATE OR REPLACE FUNCTION public.set_match_boards(
  p_tournament_id uuid,
  p_board_count integer,
  p_assignments jsonb DEFAULT '{}'::jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow public.tournaments%ROWTYPE;
  a record;
  board smallint;
  bm jsonb;
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

REVOKE EXECUTE ON FUNCTION public.set_match_boards(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_match_boards(uuid, integer, jsonb) TO authenticated;

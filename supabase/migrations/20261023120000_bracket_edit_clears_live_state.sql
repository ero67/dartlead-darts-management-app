-- Editing a playoff match's players reset legs and the result, but left the
-- live columns (starter, current leg/player, scores, live_state, device)
-- from the previous pair. A device resuming the row, or the TV, then showed
-- the old pair's board (for Cricket a whole marks table) until the new pair's
-- first visit. Now a bracket edit resets the row the way resetMatchToPending
-- does. Otherwise identical to 20260905160000.
CREATE OR REPLACE FUNCTION public.set_playoff_match_players(
  t_id uuid,
  m_id uuid,
  p1 jsonb,
  p2 jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow          RECORD;
  po            jsonb;
  rounds        jsonb;
  round_matches jsonb;
  match         jsonb;
  ri            int := -1;
  mi            int := -1;
  r             int;
  m             int;
  p1n           jsonb;
  p2n           jsonb;
BEGIN
  IF NOT public.can_manage_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Normalise "no player" to JSON null (what the app stores for empty slots).
  p1n := CASE WHEN p1 IS NULL OR jsonb_typeof(p1) <> 'object' THEN 'null'::jsonb ELSE p1 END;
  p2n := CASE WHEN p2 IS NULL OR jsonb_typeof(p2) <> 'object' THEN 'null'::jsonb ELSE p2 END;
  IF p1n ->> 'id' IS NOT NULL AND p1n ->> 'id' = p2n ->> 'id' THEN
    RETURN jsonb_build_object('success', false, 'error', 'same_player');
  END IF;

  SELECT t.id, t.playoffs INTO trow
  FROM public.tournaments t WHERE t.id = t_id FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;

  po := trow.playoffs;
  rounds := po -> 'rounds';
  IF po IS NULL OR rounds IS NULL OR jsonb_typeof(rounds) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_playoffs');
  END IF;

  FOR r IN 0 .. jsonb_array_length(rounds) - 1 LOOP
    round_matches := rounds -> r -> 'matches';
    CONTINUE WHEN round_matches IS NULL OR jsonb_typeof(round_matches) <> 'array';
    FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
      IF round_matches -> m ->> 'id' = m_id::text THEN
        ri := r; mi := m; EXIT;
      END IF;
    END LOOP;
    EXIT WHEN ri <> -1;
  END LOOP;
  IF ri = -1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Editing players always resets the match to pending (a single player is a
  -- bye, advanced separately) and drops any previous result.
  match := (rounds -> ri -> 'matches' -> mi)
           || jsonb_build_object('player1', p1n, 'player2', p2n, 'status', 'pending', 'result', 'null'::jsonb);
  rounds := jsonb_set(rounds, ARRAY[ri::text, 'matches', mi::text], match);
  po := jsonb_set(po, ARRAY['rounds'], rounds);

  UPDATE public.tournaments SET playoffs = po, updated_at = now() WHERE id = t_id;

  -- Keep an existing matches row in step (rows are created lazily on first
  -- start, so there may be none yet — that is fine).
  UPDATE public.matches
  SET player1_id = (p1n ->> 'id')::uuid,
      player2_id = (p2n ->> 'id')::uuid,
      status = 'pending',
      winner_id = NULL,
      player1_legs = 0,
      player2_legs = 0,
      result = NULL,
      match_starter = NULL,
      current_leg = 1,
      current_player = 0,
      player1_current_score = NULL,
      player2_current_score = NULL,
      live_state = NULL,
      live_device_id = NULL,
      live_device_name = NULL,
      live_board_number = NULL,
      live_started_at = NULL,
      updated_at = now()
  WHERE id = m_id AND tournament_id = t_id;

  RETURN jsonb_build_object('success', true, 'playoffs', po);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_playoff_match_players(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_playoff_match_players(uuid, uuid, jsonb, jsonb) TO authenticated;

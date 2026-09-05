-- Atomic playoff advancement.
--
-- Until now every scoring device applied a completed playoff match to ITS OWN
-- copy of tournaments.playoffs and wrote the whole JSONB back. Two boards
-- finishing the two quarterfinals of one semifinal pair therefore raced:
-- the device that saved last had never seen the other winner (the realtime
-- listener only runs on the management page, not on the match screen) and
-- overwrote that semifinal slot with null. Same for the next-round matches
-- row, which was upserted with both player columns from the stale copy.
--
-- complete_playoff_match() moves the read-modify-write into one transaction
-- that locks the tournament row, so concurrent completions serialise and each
-- one only touches the slots it owns. The client keeps applying the same
-- transform locally for instant feedback, then replaces its bracket with what
-- this function returns.
--
-- Mirrors applyMatchCompletion() in src/contexts/TournamentContext.jsx:
--   * mark the match completed and store the result
--   * winner -> next round, non-third-place match floor(idx / 2),
--     slot player1 for even idx, player2 for odd idx
--   * semifinal loser -> third-place match (idx 0 -> player1, 1 -> player2)
--   * bump playoffs.currentRound once every non-third match of the current
--     round is completed
--   * tournament status -> 'completed' once the final (and third-place match,
--     if present) are completed

CREATE OR REPLACE FUNCTION public.complete_playoff_match(
  t_id uuid,
  m_id uuid,
  p_result jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow            RECORD;
  po              jsonb;       -- working copy of tournaments.playoffs
  rounds          jsonb;
  n_rounds        int;
  ri              int := -1;   -- round index of the completed match
  mi              int := -1;   -- match index (within round.matches) of the completed match
  bracket_idx     int := -1;   -- index among the round's non-third-place matches
  n_non_third     int := 0;
  match           jsonb;
  winner_id       uuid;
  winner_obj      jsonb;
  loser_obj       jsonb;
  r               int;
  m               int;
  k               int;
  round_matches   jsonb;
  cur             jsonb;
  -- next-round placement
  next_mi         int := -1;
  next_slot       text;        -- 'player1' | 'player2'
  next_match      jsonb;
  -- third-place placement
  final_ri        int;
  third_mi        int := -1;
  third_slot      text;
  third_match     jsonb;
  -- bookkeeping
  cur_round       int;
  cr_idx          int;
  all_done        boolean;
  final_done      boolean := false;
  third_done      boolean := true;
  new_status      text;
BEGIN
  IF NOT public.can_score_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_result IS NULL OR p_result ->> 'winner' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_winner');
  END IF;
  winner_id := (p_result ->> 'winner')::uuid;

  -- Serialise concurrent completions on this tournament.
  SELECT t.id, t.playoffs, t.status, t.legs_to_win, t.starting_score
  INTO trow
  FROM public.tournaments t
  WHERE t.id = t_id
  FOR UPDATE;

  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;

  po := trow.playoffs;
  rounds := po -> 'rounds';
  IF po IS NULL OR rounds IS NULL OR jsonb_typeof(rounds) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_playoffs');
  END IF;
  n_rounds := jsonb_array_length(rounds);

  -- Locate the match.
  FOR r IN 0 .. n_rounds - 1 LOOP
    round_matches := rounds -> r -> 'matches';
    CONTINUE WHEN round_matches IS NULL OR jsonb_typeof(round_matches) <> 'array';
    FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
      IF round_matches -> m ->> 'id' = m_id::text THEN
        ri := r;
        mi := m;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN ri <> -1;
  END LOOP;

  IF ri = -1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  match := rounds -> ri -> 'matches' -> mi;

  -- Idempotent: a replay (offline queue flush, double tap) with the same
  -- winner must not re-run advancement over a bracket the manager may have
  -- edited since.
  IF match ->> 'status' = 'completed' AND match -> 'result' ->> 'winner' = winner_id::text THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true,
                              'playoffs', po, 'status', trow.status);
  END IF;

  -- Winner / loser as {id, name}. Prefer the bracket's own player objects; fall
  -- back to the ids/names carried in the result (bracket edited mid-match).
  IF match -> 'player1' ->> 'id' = winner_id::text THEN
    winner_obj := jsonb_build_object('id', winner_id, 'name', COALESCE(match -> 'player1' ->> 'name', p_result ->> 'player1Name'));
    loser_obj  := CASE WHEN match -> 'player2' ->> 'id' IS NOT NULL
                       THEN jsonb_build_object('id', match -> 'player2' ->> 'id', 'name', COALESCE(match -> 'player2' ->> 'name', p_result ->> 'player2Name'))
                       ELSE NULL END;
  ELSIF match -> 'player2' ->> 'id' = winner_id::text THEN
    winner_obj := jsonb_build_object('id', winner_id, 'name', COALESCE(match -> 'player2' ->> 'name', p_result ->> 'player2Name'));
    loser_obj  := CASE WHEN match -> 'player1' ->> 'id' IS NOT NULL
                       THEN jsonb_build_object('id', match -> 'player1' ->> 'id', 'name', COALESCE(match -> 'player1' ->> 'name', p_result ->> 'player1Name'))
                       ELSE NULL END;
  ELSIF p_result ->> 'player1Id' = winner_id::text THEN
    winner_obj := jsonb_build_object('id', winner_id, 'name', p_result ->> 'player1Name');
    loser_obj  := CASE WHEN p_result ->> 'player2Id' IS NOT NULL
                       THEN jsonb_build_object('id', p_result ->> 'player2Id', 'name', p_result ->> 'player2Name')
                       ELSE NULL END;
  ELSE
    winner_obj := jsonb_build_object('id', winner_id, 'name', p_result ->> 'player2Name');
    loser_obj  := CASE WHEN p_result ->> 'player1Id' IS NOT NULL
                       THEN jsonb_build_object('id', p_result ->> 'player1Id', 'name', p_result ->> 'player1Name')
                       ELSE NULL END;
  END IF;

  -- 1. Mark the match completed.
  match := match || jsonb_build_object('status', 'completed', 'result', p_result);
  rounds := jsonb_set(rounds, ARRAY[ri::text, 'matches', mi::text], match);

  -- Position among non-third-place matches of this round.
  round_matches := rounds -> ri -> 'matches';
  k := 0;
  FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
    cur := round_matches -> m;
    CONTINUE WHEN COALESCE((cur ->> 'isThirdPlaceMatch')::boolean, false);
    IF m = mi THEN
      bracket_idx := k;
    END IF;
    k := k + 1;
  END LOOP;
  n_non_third := k;

  -- 2. Winner into the next round.
  IF ri < n_rounds - 1 AND bracket_idx <> -1 THEN
    round_matches := rounds -> (ri + 1) -> 'matches';
    IF round_matches IS NOT NULL AND jsonb_typeof(round_matches) = 'array' THEN
      k := 0;
      FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
        cur := round_matches -> m;
        CONTINUE WHEN COALESCE((cur ->> 'isThirdPlaceMatch')::boolean, false);
        IF k = bracket_idx / 2 THEN
          next_mi := m;
          EXIT;
        END IF;
        k := k + 1;
      END LOOP;

      IF next_mi <> -1 THEN
        next_slot := CASE WHEN bracket_idx % 2 = 0 THEN 'player1' ELSE 'player2' END;
        next_match := (round_matches -> next_mi)
                      || jsonb_build_object(next_slot, winner_obj, 'status', 'pending');
        rounds := jsonb_set(rounds, ARRAY[(ri + 1)::text, 'matches', next_mi::text], next_match);
      END IF;
    END IF;
  END IF;

  -- 3. Semifinal loser into the third-place match (lives in the final round).
  final_ri := n_rounds - 1;
  IF n_non_third = 2 AND ri < final_ri AND loser_obj IS NOT NULL AND bracket_idx IN (0, 1) THEN
    round_matches := rounds -> final_ri -> 'matches';
    IF round_matches IS NOT NULL AND jsonb_typeof(round_matches) = 'array' THEN
      FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
        IF COALESCE((round_matches -> m ->> 'isThirdPlaceMatch')::boolean, false) THEN
          third_mi := m;
          EXIT;
        END IF;
      END LOOP;

      IF third_mi <> -1 THEN
        third_slot := CASE WHEN bracket_idx = 0 THEN 'player1' ELSE 'player2' END;
        third_match := (round_matches -> third_mi) || jsonb_build_object(third_slot, loser_obj);
        IF third_match -> 'player1' ->> 'id' IS NOT NULL AND third_match -> 'player2' ->> 'id' IS NOT NULL THEN
          third_match := third_match || jsonb_build_object('status', 'pending');
        END IF;
        rounds := jsonb_set(rounds, ARRAY[final_ri::text, 'matches', third_mi::text], third_match);
      END IF;
    END IF;
  END IF;

  po := jsonb_set(po, ARRAY['rounds'], rounds);

  -- 4. Advance currentRound once the whole current round is played.
  IF jsonb_typeof(po -> 'currentRound') = 'number' THEN
    cur_round := (po ->> 'currentRound')::int;
    IF cur_round > 0 THEN
      cr_idx := GREATEST(0, LEAST(cur_round - 1, n_rounds - 1));
      round_matches := rounds -> cr_idx -> 'matches';
      IF round_matches IS NOT NULL AND jsonb_array_length(round_matches) > 0 THEN
        all_done := true;
        FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
          cur := round_matches -> m;
          CONTINUE WHEN COALESCE((cur ->> 'isThirdPlaceMatch')::boolean, false);
          IF cur ->> 'status' <> 'completed' OR cur ->> 'status' IS NULL THEN
            all_done := false;
            EXIT;
          END IF;
        END LOOP;
        IF all_done AND cur_round < n_rounds THEN
          po := jsonb_set(po, ARRAY['currentRound'], to_jsonb(cur_round + 1));
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. Tournament completed when the final (and 3rd place, if any) are done.
  round_matches := rounds -> final_ri -> 'matches';
  IF round_matches IS NOT NULL THEN
    FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
      cur := round_matches -> m;
      IF COALESCE((cur ->> 'isThirdPlaceMatch')::boolean, false) THEN
        third_done := (cur ->> 'status' = 'completed');
      ELSE
        final_done := (cur ->> 'status' = 'completed');
      END IF;
    END LOOP;
  END IF;
  new_status := CASE WHEN final_done AND third_done THEN 'completed' ELSE trow.status END;

  UPDATE public.tournaments
  SET playoffs = po,
      status = new_status,
      updated_at = now()
  WHERE id = t_id;

  -- 6. Keep the matches rows in step, touching only the slot this result owns.
  IF next_mi <> -1 THEN
    INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, is_playoff,
                                playoff_round, playoff_match_number, legs_to_win, starting_score)
    VALUES (
      (next_match ->> 'id')::uuid,
      t_id,
      CASE WHEN next_slot = 'player1' THEN winner_id ELSE NULL END,
      CASE WHEN next_slot = 'player2' THEN winner_id ELSE NULL END,
      'pending',
      true,
      (next_match ->> 'playoffRound')::int,
      (next_match ->> 'playoffMatchNumber')::int,
      COALESCE(trow.legs_to_win, 3),
      COALESCE(trow.starting_score, 501)
    )
    ON CONFLICT (id) DO UPDATE
    SET player1_id = CASE WHEN next_slot = 'player1' THEN EXCLUDED.player1_id ELSE public.matches.player1_id END,
        player2_id = CASE WHEN next_slot = 'player2' THEN EXCLUDED.player2_id ELSE public.matches.player2_id END,
        updated_at = now()
    WHERE public.matches.status = 'pending';
  END IF;

  IF third_mi <> -1 THEN
    INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, is_playoff,
                                playoff_round, playoff_match_number, legs_to_win, starting_score)
    VALUES (
      (third_match ->> 'id')::uuid,
      t_id,
      CASE WHEN third_slot = 'player1' THEN (loser_obj ->> 'id')::uuid ELSE NULL END,
      CASE WHEN third_slot = 'player2' THEN (loser_obj ->> 'id')::uuid ELSE NULL END,
      'pending',
      true,
      (third_match ->> 'playoffRound')::int,
      (third_match ->> 'playoffMatchNumber')::int,
      COALESCE(trow.legs_to_win, 3),
      COALESCE(trow.starting_score, 501)
    )
    ON CONFLICT (id) DO UPDATE
    SET player1_id = CASE WHEN third_slot = 'player1' THEN EXCLUDED.player1_id ELSE public.matches.player1_id END,
        player2_id = CASE WHEN third_slot = 'player2' THEN EXCLUDED.player2_id ELSE public.matches.player2_id END,
        updated_at = now()
    WHERE public.matches.status = 'pending';
  END IF;

  RETURN jsonb_build_object('success', true, 'playoffs', po, 'status', new_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_playoff_match(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_playoff_match(uuid, uuid, jsonb) TO authenticated;

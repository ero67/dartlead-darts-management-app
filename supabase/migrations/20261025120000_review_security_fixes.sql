-- Fixes from the 2026-10-23 review (docs/REVIEW_2026-10-23.md): H1, H2, M1,
-- M2, M3, M8 (server half), M15, M18 (server half), M26 and two lows.
-- Installed APKs keep talking to this database, so nothing here changes a
-- table shape, renames a column or removes an RPC an older app calls.

-- ---------------------------------------------------------------------------
-- H2. Column guard on tournaments and leagues.
-- The UPDATE policies let any scorer (tournaments) or co-manager (leagues)
-- rewrite every column, including ownership and the league link. RLS cannot
-- compare OLD and NEW, so a trigger does it. SECURITY INVOKER on purpose:
-- inside SECURITY DEFINER RPCs current_user is the function owner, and those
-- RPCs do their own authorization (adopt, delete_my_account, playoffs), so
-- the guard only applies to direct client writes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tournaments_guard_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.league_id IS NOT NULL AND NOT public.can_manage_league(NEW.league_id) THEN
      RAISE EXCEPTION 'Not allowed to create a tournament in this league' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a tournament''s owner' USING ERRCODE = '42501';
  END IF;

  IF NEW.league_id IS DISTINCT FROM OLD.league_id
     AND NOT (public.can_manage_tournament(OLD.id)
              AND (NEW.league_id IS NULL OR public.can_manage_league(NEW.league_id))) THEN
    RAISE EXCEPTION 'Not allowed to change this tournament''s league' USING ERRCODE = '42501';
  END IF;

  IF (NEW.deleted IS DISTINCT FROM OLD.deleted
      OR NEW.game_type IS DISTINCT FROM OLD.game_type
      OR NEW.league_points_calculated IS DISTINCT FROM OLD.league_points_calculated)
     AND NOT public.can_manage_tournament(OLD.id) THEN
    RAISE EXCEPTION 'Only a tournament manager can change this' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tournaments_guard_columns
  BEFORE INSERT OR UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.tournaments_guard_columns();

CREATE OR REPLACE FUNCTION public.leagues_guard_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a league''s owner' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leagues_guard_columns
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.leagues_guard_columns();

-- ---------------------------------------------------------------------------
-- H1. adopt_tournament_into_league: only the caller's own tournaments, or
-- ones the league's creator ran. Body otherwise unchanged from 20261001120000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adopt_tournament_into_league(t_id uuid, l_id uuid, player_map jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid  uuid := (SELECT auth.uid());
  trow RECORD;
  prow RECORD;
  po   jsonb;
  r    int;
  m    int;
  q    int;
  nm   text;
  n    int;
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF player_map IS NULL OR jsonb_typeof(player_map) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_map');
  END IF;

  SELECT t.id, t.league_id, t.playoffs, t.user_id INTO trow
  FROM public.tournaments t
  WHERE t.id = t_id AND COALESCE(t.deleted, false) = false
  FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF trow.league_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_linked');
  END IF;
  -- Only tournaments the caller owns, or that the league's own creator ran.
  -- Co-managers are added without their consent, so a co-manager link is not
  -- consent to have their tournaments rewritten; they adopt their own.
  IF NOT (public.is_admin()
          OR trow.user_id = uid
          OR trow.user_id = (SELECT l.created_by FROM public.leagues l WHERE l.id = l_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_tournament_owner');
  END IF;

  CREATE TEMP TABLE pm (old_id uuid, new_id uuid, new_name text) ON COMMIT DROP;
  INSERT INTO pg_temp.pm (old_id, new_id)
  SELECT x."from", CASE WHEN x."to" = 'new' THEN NULL ELSE x."to"::uuid END
  FROM jsonb_to_recordset(player_map) AS x("from" uuid, "to" text);

  -- Exactly the tournament's players, each once.
  IF (SELECT count(*) FROM pg_temp.pm) <> (SELECT count(DISTINCT old_id) FROM pg_temp.pm)
     OR EXISTS (SELECT 1 FROM public.tournament_players tp
                WHERE tp.tournament_id = t_id
                  AND NOT EXISTS (SELECT 1 FROM pg_temp.pm p WHERE p.old_id = tp.player_id))
     OR EXISTS (SELECT 1 FROM pg_temp.pm p
                WHERE NOT EXISTS (SELECT 1 FROM public.tournament_players tp
                                  WHERE tp.tournament_id = t_id AND tp.player_id = p.old_id))
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'incomplete_map');
  END IF;

  -- "new": a player in the caller's roster under the source name, made a member.
  INSERT INTO public.players (name, owner_id)
  SELECT DISTINCT src.name, uid
  FROM pg_temp.pm p JOIN public.players src ON src.id = p.old_id
  WHERE p.new_id IS NULL
  ON CONFLICT (owner_id, name) DO NOTHING;

  UPDATE pg_temp.pm p SET new_id = np.id
  FROM public.players src, public.players np
  WHERE p.new_id IS NULL AND src.id = p.old_id AND np.owner_id = uid AND np.name = src.name;

  INSERT INTO public.league_members (league_id, player_id)
  SELECT l_id, p.new_id
  FROM pg_temp.pm p
  JOIN jsonb_to_recordset(player_map) AS x("from" uuid, "to" text) ON x."from" = p.old_id
  WHERE x."to" = 'new' AND p.new_id IS NOT NULL
  ON CONFLICT (league_id, player_id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM pg_temp.pm p
             WHERE p.new_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.league_members lm
                               WHERE lm.league_id = l_id AND lm.player_id = p.new_id))
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;
  IF (SELECT count(*) FROM pg_temp.pm) <> (SELECT count(DISTINCT new_id) FROM pg_temp.pm) THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_target');
  END IF;
  -- No swaps: a target already in the tournament must map to itself, or the
  -- composite keys on tournament_players/group_players collide mid-update.
  IF EXISTS (SELECT 1 FROM pg_temp.pm p
             JOIN public.tournament_players tp ON tp.tournament_id = t_id AND tp.player_id = p.new_id
             WHERE p.old_id <> p.new_id)
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_already_in_tournament');
  END IF;

  DELETE FROM pg_temp.pm WHERE old_id = new_id;
  UPDATE pg_temp.pm p SET new_name = np.name FROM public.players np WHERE np.id = p.new_id;
  SELECT count(*) INTO n FROM pg_temp.pm;

  UPDATE public.tournament_players tp SET player_id = p.new_id
  FROM pg_temp.pm p WHERE tp.tournament_id = t_id AND tp.player_id = p.old_id;

  UPDATE public.group_players gp SET player_id = p.new_id
  FROM pg_temp.pm p, public.groups g
  WHERE g.tournament_id = t_id AND gp.group_id = g.id AND gp.player_id = p.old_id;

  UPDATE public.group_standings gs SET player_id = p.new_id
  FROM pg_temp.pm p, public.groups g
  WHERE g.tournament_id = t_id AND gs.group_id = g.id AND gs.player_id = p.old_id;

  UPDATE public.tournament_stats ts SET player_id = p.new_id
  FROM pg_temp.pm p WHERE ts.tournament_id = t_id AND ts.player_id = p.old_id;

  UPDATE public.matches mt SET
    player1_id = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = mt.player1_id), mt.player1_id),
    player2_id = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = mt.player2_id), mt.player2_id),
    winner_id  = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = mt.winner_id),  mt.winner_id)
  WHERE mt.tournament_id = t_id;
  -- matches.result embeds the winner id; rewrite it by text replace.
  FOR prow IN SELECT old_id, new_id FROM pg_temp.pm LOOP
    UPDATE public.matches mt
    SET result = replace(mt.result::text, prow.old_id::text, prow.new_id::text)::jsonb
    WHERE mt.tournament_id = t_id AND mt.result IS NOT NULL
      AND mt.result::text LIKE '%' || prow.old_id::text || '%';
  END LOOP;

  UPDATE public.legs lg SET
    player1_id = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = lg.player1_id), lg.player1_id),
    player2_id = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = lg.player2_id), lg.player2_id),
    winner_id  = COALESCE((SELECT new_id FROM pg_temp.pm WHERE old_id = lg.winner_id),  lg.winner_id)
  WHERE lg.match_id IN (SELECT id FROM public.matches WHERE tournament_id = t_id);

  UPDATE public.match_player_stats ms SET player_id = p.new_id
  FROM pg_temp.pm p
  WHERE ms.player_id = p.old_id
    AND ms.match_id IN (SELECT id FROM public.matches WHERE tournament_id = t_id);

  UPDATE public.dart_throws dt SET player_id = p.new_id
  FROM pg_temp.pm p
  WHERE dt.player_id = p.old_id
    AND dt.leg_id IN (SELECT lg.id FROM public.legs lg
                      JOIN public.matches mt ON mt.id = lg.match_id
                      WHERE mt.tournament_id = t_id);

  -- Playoff bracket JSONB: ids by text replace (player1/player2/result.winner/
  -- qualifyingPlayers/anything else), then the embedded display names.
  po := trow.playoffs;
  IF po IS NOT NULL THEN
    FOR prow IN SELECT old_id, new_id FROM pg_temp.pm LOOP
      po := replace(po::text, prow.old_id::text, prow.new_id::text)::jsonb;
    END LOOP;

    IF jsonb_typeof(po -> 'rounds') = 'array' THEN
      FOR r IN 0 .. jsonb_array_length(po -> 'rounds') - 1 LOOP
        IF jsonb_typeof(po -> 'rounds' -> r -> 'matches') <> 'array' THEN CONTINUE; END IF;
        FOR m IN 0 .. jsonb_array_length(po -> 'rounds' -> r -> 'matches') - 1 LOOP
          SELECT new_name INTO nm FROM pg_temp.pm WHERE new_id::text = po -> 'rounds' -> r -> 'matches' -> m -> 'player1' ->> 'id';
          IF nm IS NOT NULL THEN
            po := jsonb_set(po, ARRAY['rounds', r::text, 'matches', m::text, 'player1', 'name'], to_jsonb(nm));
          END IF;
          SELECT new_name INTO nm FROM pg_temp.pm WHERE new_id::text = po -> 'rounds' -> r -> 'matches' -> m -> 'player2' ->> 'id';
          IF nm IS NOT NULL THEN
            po := jsonb_set(po, ARRAY['rounds', r::text, 'matches', m::text, 'player2', 'name'], to_jsonb(nm));
          END IF;
        END LOOP;
      END LOOP;
    END IF;

    IF jsonb_typeof(po -> 'qualifyingPlayers') = 'array' THEN
      FOR q IN 0 .. jsonb_array_length(po -> 'qualifyingPlayers') - 1 LOOP
        SELECT new_name INTO nm FROM pg_temp.pm WHERE new_id::text = po -> 'qualifyingPlayers' -> q ->> 'id';
        IF nm IS NOT NULL THEN
          po := jsonb_set(po, ARRAY['qualifyingPlayers', q::text, 'name'], to_jsonb(nm));
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.tournaments
  SET league_id = l_id, league_points_calculated = false, playoffs = po, updated_at = now()
  WHERE id = t_id;

  RETURN jsonb_build_object('success', true, 'remapped', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- M8. complete_playoff_match refuses a winner that disagrees with the match
-- row. Body otherwise unchanged from 20261011120000.
-- ---------------------------------------------------------------------------
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

  -- The match row is the source of truth: another device (or a manager
  -- correction, which updates the row first) may have completed it with a
  -- different winner. Advancing this one would split bracket and row.
  IF EXISTS (SELECT 1 FROM public.matches mr
             WHERE mr.id = m_id AND mr.status = 'completed'
               AND mr.winner_id IS NOT NULL AND mr.winner_id <> (p_result ->> 'winner')::uuid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'winner_mismatch');
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
      CASE WHEN next_slot = 'player1' THEN winner_id ELSE (next_match -> 'player1' ->> 'id')::uuid END,
      CASE WHEN next_slot = 'player2' THEN winner_id ELSE (next_match -> 'player2' ->> 'id')::uuid END,
      'pending',
      true,
      (next_match ->> 'playoffRound')::int,
      (next_match ->> 'playoffMatchNumber')::int,
      COALESCE(trow.legs_to_win, 3),
      COALESCE(trow.starting_score, 501)
    )
    ON CONFLICT (id) DO UPDATE
    SET player1_id = CASE WHEN next_slot = 'player1' THEN EXCLUDED.player1_id ELSE COALESCE(public.matches.player1_id, EXCLUDED.player1_id) END,
        player2_id = CASE WHEN next_slot = 'player2' THEN EXCLUDED.player2_id ELSE COALESCE(public.matches.player2_id, EXCLUDED.player2_id) END,
        updated_at = now()
    WHERE public.matches.status = 'pending';
  END IF;

  IF third_mi <> -1 THEN
    INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, is_playoff,
                                playoff_round, playoff_match_number, legs_to_win, starting_score)
    VALUES (
      (third_match ->> 'id')::uuid,
      t_id,
      CASE WHEN third_slot = 'player1' THEN (loser_obj ->> 'id')::uuid ELSE (third_match -> 'player1' ->> 'id')::uuid END,
      CASE WHEN third_slot = 'player2' THEN (loser_obj ->> 'id')::uuid ELSE (third_match -> 'player2' ->> 'id')::uuid END,
      'pending',
      true,
      (third_match ->> 'playoffRound')::int,
      (third_match ->> 'playoffMatchNumber')::int,
      COALESCE(trow.legs_to_win, 3),
      COALESCE(trow.starting_score, 501)
    )
    ON CONFLICT (id) DO UPDATE
    SET player1_id = CASE WHEN third_slot = 'player1' THEN EXCLUDED.player1_id ELSE COALESCE(public.matches.player1_id, EXCLUDED.player1_id) END,
        player2_id = CASE WHEN third_slot = 'player2' THEN EXCLUDED.player2_id ELSE COALESCE(public.matches.player2_id, EXCLUDED.player2_id) END,
        updated_at = now()
    WHERE public.matches.status = 'pending';
  END IF;

  RETURN jsonb_build_object('success', true, 'playoffs', po, 'status', new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- M3. record_league_tournament_results: only the tournament's own players,
-- points capped at the league's highest configured value, and once points
-- are recorded only a manager may rewrite them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_league_tournament_results(t_id uuid, results jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow  RECORD;
  n     int;
  max_p numeric;
BEGIN
  IF NOT public.can_score_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF results IS NULL OR jsonb_typeof(results) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_results');
  END IF;

  SELECT t.id, t.league_id, t.status, t.league_points_calculated INTO trow
  FROM public.tournaments t WHERE t.id = t_id FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF trow.league_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_league');
  END IF;
  IF trow.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_completed');
  END IF;
  IF COALESCE(trow.league_points_calculated, false) AND NOT public.can_manage_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_calculated');
  END IF;

  -- Highest number anywhere in placementPoints (incl. roundPoints, defaults).
  SELECT max((v #>> '{}')::numeric) INTO max_p
  FROM public.leagues l,
       jsonb_path_query(l.scoring_rules -> 'placementPoints', 'strict $.**') AS v
  WHERE l.id = trow.league_id AND jsonb_typeof(v) = 'number';

  INSERT INTO public.league_tournament_results (league_id, tournament_id, player_id, placement, points_awarded)
  SELECT trow.league_id, t_id, x.player_id, x.placement,
         GREATEST(0, LEAST(COALESCE(x.points_awarded, 0), COALESCE(max_p, x.points_awarded, 0)))::int
  FROM jsonb_to_recordset(results) AS x(player_id uuid, placement int, points_awarded int)
  WHERE x.player_id IS NOT NULL AND x.placement IS NOT NULL AND x.placement > 0
    AND EXISTS (SELECT 1 FROM public.tournament_players tp
                WHERE tp.tournament_id = t_id AND tp.player_id = x.player_id)
  ON CONFLICT (league_id, tournament_id, player_id) DO UPDATE
  SET placement = EXCLUDED.placement,
      points_awarded = EXCLUDED.points_awarded,
      updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.tournaments SET league_points_calculated = true WHERE id = t_id;

  PERFORM public.rebuild_league_leaderboard(trow.league_id);

  RETURN jsonb_build_object('success', true, 'count', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- M15. Soft-deleting (or restoring) a league tournament rebuilds that
-- league's leaderboard, whoever does it. The rebuild already skips deleted
-- tournaments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tournaments_rebuild_league_on_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  PERFORM public.rebuild_league_leaderboard(NEW.league_id);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tournaments_rebuild_league_on_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER tournaments_rebuild_league_on_delete
  AFTER UPDATE OF deleted ON public.tournaments
  FOR EACH ROW
  WHEN (NEW.league_id IS NOT NULL AND NEW.deleted IS DISTINCT FROM OLD.deleted)
  EXECUTE FUNCTION public.tournaments_rebuild_league_on_delete();

-- ---------------------------------------------------------------------------
-- M1. search_users: server-side minimum length, LIKE wildcards escaped, role
-- only for admins. Same signature and columns, so older apps keep working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_users(search_term text)
  RETURNS TABLE (id uuid, email text, full_name text, role text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  term     text := btrim(COALESCE(search_term, ''));
  pattern  text;
  admin    boolean := public.is_admin();
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Only managers and administrators can search users';
  END IF;
  IF length(term) < 3 THEN
    RETURN;
  END IF;
  pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    public.user_display_name(u.raw_user_meta_data),
    CASE WHEN admin THEN COALESCE(u.raw_app_meta_data ->> 'role', 'user') END::text
  FROM auth.users u
  WHERE u.email ILIKE pattern
     OR public.user_display_name(u.raw_user_meta_data) ILIKE pattern
     OR u.raw_user_meta_data ->> 'full_name' ILIKE pattern
     OR u.raw_user_meta_data ->> 'name' ILIKE pattern
  ORDER BY u.created_at DESC
  LIMIT CASE WHEN admin THEN 20 ELSE 10 END;
END;
$$;

-- ---------------------------------------------------------------------------
-- M2. Registrations: only the applicant and the people who manage the
-- tournament / league can read them (was: anyone, including anon).
-- ---------------------------------------------------------------------------
DROP POLICY "Anyone can view tournament registrations" ON public.tournament_registrations;
CREATE POLICY "Applicants and managers can view tournament registrations" ON public.tournament_registrations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.can_manage_tournament(tournament_id)));

DROP POLICY "Anyone can view league registrations" ON public.league_registrations;
CREATE POLICY "Applicants and managers can view league registrations" ON public.league_registrations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.can_manage_league(league_id)));

REVOKE SELECT ON public.tournament_registrations, public.league_registrations FROM anon;

-- ---------------------------------------------------------------------------
-- M26. Apps older than 1.7.0 score a Cricket match as X01 and save an X01
-- result. Refuse that save so the match stays open for an up-to-date device.
-- Manager corrections patch the result without a gameType and stay allowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.matches_reject_x01_result_for_cricket()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF NEW.game_type = 'cricket'
     AND NEW.status = 'completed'
     AND NEW.result IS NOT NULL
     AND NEW.result ->> 'gameType' IS DISTINCT FROM 'cricket'
     AND NOT COALESCE((NEW.result ->> 'manuallyCorrected')::boolean, false)
     AND NOT COALESCE((NEW.result ->> 'isBye')::boolean, false) THEN
    RAISE EXCEPTION 'This is a Cricket match. Update the DartLead app to score it.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER matches_reject_x01_result_for_cricket
  BEFORE INSERT OR UPDATE OF status, result ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_reject_x01_result_for_cricket();

-- ---------------------------------------------------------------------------
-- M18. Find-or-create the player for a league member. Rosters are per
-- manager, so a co-manager's name lookup missed the owner's row and created
-- a duplicate. Looks in the league first (case-insensitive), then in the
-- caller's roster, then creates. Links the account when given.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.league_member_player(l_id uuid, p_name text, p_user_id uuid DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid  uuid := (SELECT auth.uid());
  nm   text := btrim(COALESCE(p_name, ''));
  prow RECORD;
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF nm = '' THEN
    RAISE EXCEPTION 'MISSING_PLAYER_NAME';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT p.id INTO prow FROM public.players p WHERE p.user_id = p_user_id LIMIT 1;
    IF prow.id IS NOT NULL THEN
      RETURN prow.id;
    END IF;
  END IF;

  SELECT p.id, p.user_id INTO prow
  FROM public.league_members lm
  JOIN public.players p ON p.id = lm.player_id
  WHERE lm.league_id = l_id AND lower(p.name) = lower(nm)
  ORDER BY (p.owner_id = uid) DESC, lm.left_at NULLS FIRST
  LIMIT 1;

  IF prow.id IS NULL THEN
    SELECT p.id, p.user_id INTO prow
    FROM public.players p WHERE p.owner_id = uid AND p.name = nm;
  END IF;

  IF prow.id IS NULL THEN
    INSERT INTO public.players (name, owner_id, user_id)
    VALUES (nm, uid, p_user_id)
    RETURNING id, user_id INTO prow;
    RETURN prow.id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF prow.user_id IS NOT NULL AND prow.user_id <> p_user_id THEN
      RAISE EXCEPTION 'PLAYER_NAME_TAKEN';
    END IF;
    IF prow.user_id IS NULL THEN
      UPDATE public.players SET user_id = p_user_id WHERE id = prow.id;
    END IF;
  END IF;
  RETURN prow.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.league_member_player(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_member_player(uuid, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Low: account deletion also drops the email from the admin audit log.
-- Body otherwise unchanged from 20260910120000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  released_tournaments int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Release ownership instead of cascading deletes.
  UPDATE public.tournaments SET user_id = NULL WHERE user_id = uid;
  GET DIAGNOSTICS released_tournaments = ROW_COUNT;
  -- leagues.created_by is ON DELETE SET NULL; league_managers cascades.

  -- References without an ON DELETE rule would block the delete.
  UPDATE public.matches SET started_by_user_id = NULL WHERE started_by_user_id = uid;
  UPDATE public.tournament_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;
  UPDATE public.league_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;

  -- Personal data the FKs do not reach.
  UPDATE public.admin_audit_log SET target_email = NULL WHERE target_user_id = uid;

  -- Everything else cascades or nulls out through the FKs.
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'released_tournaments', released_tournaments);
END;
$$;

-- ---------------------------------------------------------------------------
-- Low: indexes for player-centric reads (profiles, head-to-head, history).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_match_player_stats_player_id ON public.match_player_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_completed ON public.matches (player1_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_player2_completed ON public.matches (player2_id, completed_at DESC);

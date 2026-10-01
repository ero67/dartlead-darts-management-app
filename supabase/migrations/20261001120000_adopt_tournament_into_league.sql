-- Adopt a tournament that was played outside the league into it.
--
-- Rosters are per manager, so a tournament another manager ran references
-- *their* player rows. Linking it as-is would put duplicate players on the
-- leaderboard, and the leg counts / recent form (joined by player id from
-- matches) would never reach the real members. This rewrites every player id
-- the tournament carries onto the league members chosen by the caller, then
-- links it. Points are recorded afterwards by the existing
-- record_league_tournament_results path (league_points_calculated = false).
--
-- player_map: [{"from": "<tournament player id>", "to": "<member player id>" | "new"}, ...]
-- Every tournament player must appear exactly once. "new" creates a player in
-- the caller's roster under the same name and makes them a league member.

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

  SELECT t.id, t.league_id, t.playoffs INTO trow
  FROM public.tournaments t
  WHERE t.id = t_id AND COALESCE(t.deleted, false) = false
  FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF trow.league_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_linked');
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

REVOKE EXECUTE ON FUNCTION public.adopt_tournament_into_league(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adopt_tournament_into_league(uuid, uuid, jsonb) TO authenticated;

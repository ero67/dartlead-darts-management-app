-- Self-check for 20261027140000_league_seasons.sql against the local Supabase
-- stack (migrations applied). One transaction, rolled back, no data left:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/league_seasons.sql
-- Expect the last line: ALL ASSERTS PASSED

BEGIN;

-- Users: owner (manager), co-manager, outsider (another manager).
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',    '{"role":"manager"}', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'comanager@test.local', '{}', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'outsider@test.local', '{"role":"manager"}', '{}');

INSERT INTO public.leagues (id, name, created_by, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Season league', '00000000-0000-0000-0000-0000000000a1', '2025-09-01');
INSERT INTO public.league_managers (league_id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2');

INSERT INTO public.players (id, name, owner_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Anna',  '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000002', 'Boris', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000003', 'Cyril', '00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.league_members (league_id, player_id)
SELECT '10000000-0000-0000-0000-000000000001', id FROM public.players WHERE owner_id = '00000000-0000-0000-0000-0000000000a1';

-- Season 1: R1 Anna beats Boris 3:1, R2 Cyril beats Anna 3:2. R3 is open
-- for registration (set up for next season), R4 is running.
INSERT INTO public.tournaments (id, name, user_id, league_id, status) VALUES
  ('20000000-0000-0000-0000-000000000001', 'R1', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'completed'),
  ('20000000-0000-0000-0000-000000000002', 'R2', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'completed'),
  ('20000000-0000-0000-0000-000000000003', 'R3', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'open_for_registration'),
  ('20000000-0000-0000-0000-000000000004', 'R4', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'started');
INSERT INTO public.tournament_players (tournament_id, player_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003');
INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, winner_id, player1_legs, player2_legs) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'completed', 'a0000000-0000-0000-0000-000000000001', 3, 1),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'completed', 'a0000000-0000-0000-0000-000000000003', 3, 2);
INSERT INTO public.league_tournament_results (league_id, tournament_id, player_id, placement, points_awarded) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 12),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 2, 9),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 1, 12),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2, 9);
INSERT INTO public.league_leaderboard (league_id, player_id, manual_points) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 5);
SELECT public.rebuild_league_leaderboard('10000000-0000-0000-0000-000000000001');

CREATE FUNCTION pg_temp.act_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.raises(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END $$;
-- Live table as "name:points:legs_won:legs_lost" in rank order.
CREATE FUNCTION pg_temp.live() RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(p.name || ':' || lb.total_points || ':' || lb.legs_won || ':' || lb.legs_lost, ' ' ORDER BY lb.total_points DESC, p.name), '')
  FROM public.league_leaderboard lb JOIN public.players p ON p.id = lb.player_id
  WHERE lb.league_id = '10000000-0000-0000-0000-000000000001';
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

DO $$ BEGIN
  ASSERT pg_temp.live() = 'Anna:21:5:4 Boris:14:1:3 Cyril:12:3:2', 'season 1 table: ' || pg_temp.live();
END $$;

-- Non-managers cannot roll over (outsider gets refused, anon cannot call it).
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (public.end_league_season('10000000-0000-0000-0000-000000000001', 'Hijack') ->> 'error') = 'not_authorized', 'outsider ended the season';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT pg_temp.raises($q$SELECT public.end_league_season('10000000-0000-0000-0000-000000000001', 'Hijack')$q$), 'anon may call end_league_season';
END $$;
RESET ROLE;

-- The co-manager may; a running round blocks it first.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (public.end_league_season('10000000-0000-0000-0000-000000000001', 'Season 2025/26') ->> 'error') = 'round_in_progress', 'running round not refused';
  ASSERT (public.end_league_season('10000000-0000-0000-0000-000000000001', '  ') ->> 'error') = 'bad_name', 'empty name accepted';
END $$;
RESET ROLE;
UPDATE public.tournaments SET deleted = true WHERE id = '20000000-0000-0000-0000-000000000004';

SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := public.end_league_season('10000000-0000-0000-0000-000000000001', ' Season 2025/26 ', 'Season 2026/27');
  ASSERT (r ->> 'success')::boolean, 'rollover failed: ' || r::text;
  ASSERT (r ->> 'rounds')::int = 3, 'R1, R2 and the deleted R4 archived: ' || r::text;
  ASSERT (public.end_league_season('10000000-0000-0000-0000-000000000001', 'Again') ->> 'error') = 'empty_season', 'second rollover allowed';
END $$;
RESET ROLE;

-- Snapshot correctness, live reset, rounds tagged, nothing deleted.
DO $$ DECLARE s RECORD; BEGIN
  SELECT * INTO s FROM public.league_seasons WHERE league_id = '10000000-0000-0000-0000-000000000001';
  ASSERT s.name = 'Season 2025/26', 'name not trimmed: ' || s.name;
  ASSERT s.started_at = '2025-09-01'::timestamptz, 'started_at should be the league creation';
  ASSERT s.ended_by = '00000000-0000-0000-0000-0000000000a2', 'ended_by';
  ASSERT jsonb_array_length(s.standings) = 3, 'standings rows';
  ASSERT s.standings -> 0 @> '{"rank":1,"name":"Anna","points":21,"played":2,"legs_won":5,"legs_lost":4,"best":1}', 'champion: ' || (s.standings -> 0)::text;
  ASSERT s.standings -> 1 @> '{"rank":2,"name":"Boris","points":14,"manual_points":5,"played":1}', 'second: ' || (s.standings -> 1)::text;
  ASSERT s.standings -> 2 @> '{"rank":3,"name":"Cyril","points":12}', 'third: ' || (s.standings -> 2)::text;
  ASSERT pg_temp.live() = '', 'live table not reset: ' || pg_temp.live();
  ASSERT (SELECT count(*) FROM public.tournaments WHERE season_id = s.id) = 3, 'rounds not tagged';
  ASSERT (SELECT season_id FROM public.tournaments WHERE id = '20000000-0000-0000-0000-000000000003') IS NULL, 'upcoming round archived';
  ASSERT (SELECT count(*) FROM public.league_tournament_results WHERE league_id = '10000000-0000-0000-0000-000000000001') = 4, 'results deleted';
  ASSERT (SELECT season_name FROM public.leagues WHERE id = '10000000-0000-0000-0000-000000000001') = 'Season 2026/27', 'next season name';
END $$;

-- A round after the rollover counts only in the new season: R3, Boris beats Cyril 3:0.
UPDATE public.tournaments SET status = 'completed' WHERE id = '20000000-0000-0000-0000-000000000003';
INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, winner_id, player1_legs, player2_legs) VALUES
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'completed', 'a0000000-0000-0000-0000-000000000002', 3, 0);
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (public.record_league_tournament_results('20000000-0000-0000-0000-000000000003',
          '[{"player_id":"a0000000-0000-0000-0000-000000000002","placement":1,"points_awarded":12},
            {"player_id":"a0000000-0000-0000-0000-000000000003","placement":2,"points_awarded":9}]') ->> 'success')::boolean, 'recording R3 failed';
  ASSERT pg_temp.live() = 'Boris:12:3:0 Cyril:9:0:3', 'new season table: ' || pg_temp.live();
-- Recalculate (new app) does not resurrect old points.
  ASSERT (public.refresh_league_leaderboard('10000000-0000-0000-0000-000000000001') ->> 'success')::boolean, 'refresh failed';
  ASSERT pg_temp.live() = 'Boris:12:3:0 Cyril:9:0:3', 'refresh resurrected: ' || pg_temp.live();

-- Old app (<= 1.7.0) Recalculate: recalculateAllResults re-upserts results of
-- every completed round (archived ones too), then updateLeaderboardCache
-- upserts totals summed over ALL rounds and prunes nothing it still sees.
  INSERT INTO public.league_tournament_results (league_id, tournament_id, player_id, placement, points_awarded) VALUES
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 12),
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 2, 9)
  ON CONFLICT (league_id, tournament_id, player_id) DO UPDATE SET placement = EXCLUDED.placement, points_awarded = EXCLUDED.points_awarded;
  INSERT INTO public.league_leaderboard (league_id, player_id, total_points, manual_points, tournaments_played, legs_won, legs_lost) VALUES
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 21, 0, 2, 5, 4),
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 21, 0, 2, 4, 3),
    ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 21, 0, 2, 3, 5)
  ON CONFLICT (league_id, player_id) DO UPDATE SET total_points = EXCLUDED.total_points, manual_points = EXCLUDED.manual_points,
    tournaments_played = EXCLUDED.tournaments_played, legs_won = EXCLUDED.legs_won, legs_lost = EXCLUDED.legs_lost;
  ASSERT pg_temp.live() = 'Boris:12:3:0 Cyril:9:0:3', 'old app pulled archived points back: ' || pg_temp.live();

-- Old app manual points (AdminPanel setManualPoints) still work; its total is recomputed.
  UPDATE public.league_leaderboard SET manual_points = 3, total_points = 999
  WHERE league_id = '10000000-0000-0000-0000-000000000001' AND player_id = 'a0000000-0000-0000-0000-000000000002';
  ASSERT pg_temp.live() = 'Boris:15:3:0 Cyril:9:0:3', 'manual points: ' || pg_temp.live();

-- Clients cannot move rounds between seasons.
  UPDATE public.tournaments SET season_id = NULL WHERE id = '20000000-0000-0000-0000-000000000001';
  ASSERT (SELECT season_id FROM public.tournaments WHERE id = '20000000-0000-0000-0000-000000000001') IS NOT NULL, 'client un-archived a round';
  INSERT INTO public.tournaments (id, name, user_id, league_id, season_id)
  SELECT '20000000-0000-0000-0000-000000000005', 'R5', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', id
  FROM public.league_seasons WHERE league_id = '10000000-0000-0000-0000-000000000001';
  ASSERT (SELECT season_id FROM public.tournaments WHERE id = '20000000-0000-0000-0000-000000000005') IS NULL, 'client created an archived round';

-- Managers rename a season, nothing else.
  UPDATE public.league_seasons SET name = 'Jeseň-jar 2025/26' WHERE league_id = '10000000-0000-0000-0000-000000000001';
  ASSERT pg_temp.raises($q$UPDATE public.league_seasons SET standings = '[]' WHERE league_id = '10000000-0000-0000-0000-000000000001'$q$), 'standings editable';
  ASSERT pg_temp.raises($q$DELETE FROM public.league_seasons$q$), 'season deletable';
END $$;
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
SET LOCAL ROLE authenticated;
UPDATE public.league_seasons SET name = 'Hijack';
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT name FROM public.league_seasons WHERE league_id = '10000000-0000-0000-0000-000000000001') = 'Jeseň-jar 2025/26', 'outsider renamed the season';
END $$;

-- Admin undo (SQL editor, as postgres): manual points back from the snapshot,
-- drop the season row (rounds return through ON DELETE SET NULL), rebuild.
DO $$ DECLARE s RECORD; BEGIN
  SELECT * INTO s FROM public.league_seasons WHERE league_id = '10000000-0000-0000-0000-000000000001' ORDER BY ended_at DESC LIMIT 1;
  INSERT INTO public.league_leaderboard (league_id, player_id, manual_points)
  SELECT s.league_id, (e ->> 'player_id')::uuid, (e ->> 'manual_points')::int
  FROM jsonb_array_elements(s.standings) e WHERE (e ->> 'manual_points')::int <> 0
  ON CONFLICT (league_id, player_id) DO UPDATE SET manual_points = public.league_leaderboard.manual_points + EXCLUDED.manual_points;
  UPDATE public.leagues SET season_name = s.name, season_started_at = s.started_at WHERE id = s.league_id;
  DELETE FROM public.league_seasons WHERE id = s.id;
  PERFORM public.rebuild_league_leaderboard(s.league_id);
  ASSERT pg_temp.live() = 'Boris:29:4:3 Anna:21:5:4 Cyril:21:3:5', 'undo: ' || pg_temp.live();
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

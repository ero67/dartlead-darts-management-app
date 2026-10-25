-- Self-check for 20261025120000_review_security_fixes.sql against the local
-- Supabase stack (npx supabase start; migrations applied). Runs in one
-- transaction and rolls back, so it leaves no data behind:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/review_security_fixes.sql
-- Expect the last line: ALL ASSERTS PASSED

BEGIN;

-- Users: owner (manager), victim (manager), scorer, admin.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',  '{"role":"manager"}', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'victim@test.local', '{"role":"manager"}', '{"full_name":"Victor Victim"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'scorer@test.local', '{}', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@test.local',  '{"role":"admin"}', '{}');

INSERT INTO public.leagues (id, name, created_by) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Owner league',  '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000002', 'Victim league', '00000000-0000-0000-0000-0000000000b1');

INSERT INTO public.players (id, name, owner_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Anna',  '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000002', 'Boris', '00000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-000000000001', 'Vera',  '00000000-0000-0000-0000-0000000000b1');
INSERT INTO public.league_members (league_id, player_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

-- Owner's league tournament (completed), victim's unlinked tournament.
INSERT INTO public.tournaments (id, name, user_id, league_id, status, playoffs) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Owner round', '00000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-000000000001', 'completed',
   '{"rounds":[{"matches":[{"id":"30000000-0000-0000-0000-000000000001","player1":{"id":"a0000000-0000-0000-0000-000000000001","name":"Anna"},"player2":{"id":"a0000000-0000-0000-0000-000000000002","name":"Boris"}}]}]}'),
  ('20000000-0000-0000-0000-000000000002', 'Victim cup', '00000000-0000-0000-0000-0000000000b1', NULL, 'completed', NULL);
INSERT INTO public.tournament_players (tournament_id, player_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001');
INSERT INTO public.tournament_scorers (tournament_id, user_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1');
INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, winner_id, is_playoff) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'completed',
   'a0000000-0000-0000-0000-000000000001', true);
INSERT INTO public.tournament_registrations (tournament_id, user_id, player_name) VALUES
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'Scorer Sam');

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
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- H2: scorer may complete, may not take ownership, delete or relink.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.raises($q$UPDATE public.tournaments SET user_id = '00000000-0000-0000-0000-0000000000c1' WHERE id = '20000000-0000-0000-0000-000000000001'$q$), 'scorer took ownership';
  ASSERT pg_temp.raises($q$UPDATE public.tournaments SET deleted = true WHERE id = '20000000-0000-0000-0000-000000000001'$q$), 'scorer soft-deleted';
  ASSERT pg_temp.raises($q$UPDATE public.tournaments SET league_id = NULL WHERE id = '20000000-0000-0000-0000-000000000001'$q$), 'scorer unlinked league';
  ASSERT NOT pg_temp.raises($q$UPDATE public.tournaments SET status = 'completed', playoffs = playoffs WHERE id = '20000000-0000-0000-0000-000000000001'$q$), 'scorer blocked from normal write';
END $$;
RESET ROLE;

-- H2: owner cannot create in, or move into, another manager's league.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.raises($q$INSERT INTO public.tournaments (name, user_id, league_id) VALUES ('x', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002')$q$), 'insert into foreign league allowed';
  ASSERT pg_temp.raises($q$UPDATE public.tournaments SET league_id = '10000000-0000-0000-0000-000000000002' WHERE id = '20000000-0000-0000-0000-000000000001'$q$), 'move into foreign league allowed';
  ASSERT NOT pg_temp.raises($q$INSERT INTO public.tournaments (name, user_id, league_id) VALUES ('y', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001')$q$), 'insert into own league blocked';
  ASSERT pg_temp.raises($q$UPDATE public.leagues SET created_by = '00000000-0000-0000-0000-0000000000c1' WHERE id = '10000000-0000-0000-0000-000000000001'$q$), 'league owner change allowed';
END $$;

-- H1: adopting someone else's tournament is refused.
DO $$ BEGIN
  ASSERT (public.adopt_tournament_into_league('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
          '[{"from":"b0000000-0000-0000-0000-000000000001","to":"new"}]') ->> 'error') = 'not_tournament_owner', 'foreign adoption allowed';
END $$;

-- M3: non-participant ignored, points capped at the league max (12 by default).
DO $$ DECLARE r jsonb; BEGIN
  r := public.record_league_tournament_results('20000000-0000-0000-0000-000000000001',
       '[{"player_id":"a0000000-0000-0000-0000-000000000001","placement":1,"points_awarded":9999},
         {"player_id":"b0000000-0000-0000-0000-000000000001","placement":2,"points_awarded":9}]');
  ASSERT (r ->> 'count')::int = 1, 'non-participant recorded: ' || r::text;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT points_awarded FROM public.league_tournament_results
          WHERE tournament_id = '20000000-0000-0000-0000-000000000001' AND player_id = 'a0000000-0000-0000-0000-000000000001') = 12, 'points not capped';
END $$;

-- M3: once calculated, a plain scorer cannot rewrite.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (public.record_league_tournament_results('20000000-0000-0000-0000-000000000001', '[]') ->> 'error') = 'already_calculated', 'scorer rewrote points';
-- M8: a different winner than the match row is refused.
  ASSERT (public.complete_playoff_match('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
          '{"winner":"a0000000-0000-0000-0000-000000000002"}') ->> 'error') = 'winner_mismatch', 'conflicting winner advanced';
  ASSERT (public.complete_playoff_match('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
          '{"winner":"a0000000-0000-0000-0000-000000000001"}') ->> 'success')::boolean, 'matching winner refused';
-- M2: a non-manager sees only their own registration.
  ASSERT (SELECT count(*) FROM public.tournament_registrations) = 1, 'own registration hidden';
END $$;
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.tournament_registrations) = 0, 'other manager sees registrations';
-- M1: short and wildcard terms return nothing; role hidden from managers.
  ASSERT (SELECT count(*) FROM public.search_users('')) = 0, 'empty search lists users';
  ASSERT (SELECT count(*) FROM public.search_users('%%%')) = 0, 'wildcard search lists users';
  ASSERT (SELECT role FROM public.search_users('victim@test') LIMIT 1) IS NULL, 'role leaked to manager';
-- M18: a case-insensitive name already in the league is reused.
  ASSERT public.league_member_player('10000000-0000-0000-0000-000000000001', ' anna ') = 'a0000000-0000-0000-0000-000000000001', 'duplicate player created';
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT pg_temp.raises('SELECT 1 FROM public.league_registrations'), 'anon can read registrations';
END $$;
RESET ROLE;

-- M26: an X01-shaped result on a Cricket match is refused; corrections pass.
UPDATE public.tournaments SET game_type = 'cricket' WHERE id = '20000000-0000-0000-0000-000000000002';
INSERT INTO public.matches (id, tournament_id, player1_id, status) VALUES
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'in_progress');
DO $$ BEGIN
  ASSERT pg_temp.raises($q$UPDATE public.matches SET status = 'completed', result = '{"winner":"x","player1Legs":3}' WHERE id = '30000000-0000-0000-0000-000000000002'$q$), 'x01 result saved on cricket match';
  ASSERT NOT pg_temp.raises($q$UPDATE public.matches SET status = 'completed', result = '{"gameType":"cricket"}' WHERE id = '30000000-0000-0000-0000-000000000002'$q$), 'cricket result refused';
  ASSERT NOT pg_temp.raises($q$UPDATE public.matches SET result = '{"manuallyCorrected":true}' WHERE id = '30000000-0000-0000-0000-000000000002'$q$), 'correction refused';
END $$;

-- M15: soft-deleting the league round drops its points from the leaderboard.
UPDATE public.tournaments SET deleted = true WHERE id = '20000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.league_leaderboard WHERE league_id = '10000000-0000-0000-0000-000000000001' AND total_points > 0), 'deleted round still on leaderboard';
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

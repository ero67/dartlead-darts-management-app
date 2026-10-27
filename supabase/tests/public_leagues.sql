-- Self-check for 20261027160000_public_leagues.sql against the local stack.
-- One transaction, rolled back:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/public_leagues.sql
-- Expect the last line: ALL ASSERTS PASSED

BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'owner@public.test', '{"role":"manager"}', '{}');
INSERT INTO public.leagues (id, name, created_by) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'Open league', '00000000-0000-0000-0000-0000000000e1');
INSERT INTO public.leagues (id, name, created_by, is_public) VALUES
  ('e1000000-0000-0000-0000-000000000002', 'Members-only league', '00000000-0000-0000-0000-0000000000e1', false);
INSERT INTO public.leagues (id, name, created_by, deleted) VALUES
  ('e1000000-0000-0000-0000-000000000003', 'Deleted league', '00000000-0000-0000-0000-0000000000e1', true);
INSERT INTO public.players (id, name, owner_id) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'Public Pat', '00000000-0000-0000-0000-0000000000e1');
INSERT INTO public.league_members (league_id, player_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001');
INSERT INTO public.league_leaderboard (league_id, player_id, total_points) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 12),
  ('e1000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 9);
INSERT INTO public.league_registrations (league_id, user_id, player_name) VALUES
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Applicant');
INSERT INTO public.league_managers (league_id, user_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1');

SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.leagues WHERE id::text LIKE 'e1000000%') = 1, 'anon should see exactly the public, live league';
  ASSERT (SELECT count(*) FROM public.league_members WHERE league_id::text LIKE 'e1000000%') = 1, 'members of the members-only league leaked';
  ASSERT (SELECT total_points FROM public.league_leaderboard WHERE league_id = 'e1000000-0000-0000-0000-000000000001') = 12, 'public leaderboard hidden';
  ASSERT NOT EXISTS (SELECT 1 FROM public.league_leaderboard WHERE league_id = 'e1000000-0000-0000-0000-000000000002'), 'members-only leaderboard leaked';
  ASSERT (SELECT count(*) FROM public.league_seasons) >= 0, 'seasons not readable';
  ASSERT NOT EXISTS (SELECT 1 FROM public.league_managers WHERE league_id::text LIKE 'e1000000%'), 'co-managers leaked';
  ASSERT NOT EXISTS (SELECT 1 FROM public.league_scorers), 'scorers leaked';
END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.league_registrations;
  RAISE EXCEPTION 'registrations readable by anon';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

-- New leagues are public by default.
DO $$ BEGIN
  ASSERT (SELECT is_public FROM public.leagues WHERE id = 'e1000000-0000-0000-0000-000000000001'), 'default should be public';
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

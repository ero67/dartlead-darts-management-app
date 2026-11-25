-- Self-check for 20261125120000_manager_leagues.sql (get_manager_leagues).
-- One transaction, rolled back. Runs on staging through the Supabase MCP
-- execute_sql, or locally:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/manager_leagues.sql
-- Expect the last row: ALL ASSERTS PASSED

BEGIN;

-- A is an admin, M a manager who owns two leagues, C a manager who
-- co-manages one of them.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000a1a1', 'a@mleagues.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-00000000a1b1', 'm@mleagues.test', '{"role":"manager"}', '{}'),
  ('00000000-0000-0000-0000-00000000a1c1', 'c@mleagues.test', '{"role":"manager"}', '{}');

INSERT INTO public.leagues (id, name, status, created_by, created_at) VALUES
  ('30000000-0000-0000-0000-00000000a001', 'Old league', 'completed', '00000000-0000-0000-0000-00000000a1b1', now() - interval '30 days'),
  ('30000000-0000-0000-0000-00000000a002', 'New league', 'active',    '00000000-0000-0000-0000-00000000a1b1', now()),
  ('30000000-0000-0000-0000-00000000a003', 'Gone league', 'active',   '00000000-0000-0000-0000-00000000a1b1', now());
UPDATE public.leagues SET deleted = true WHERE id = '30000000-0000-0000-0000-00000000a003';

INSERT INTO public.league_managers (league_id, user_id) VALUES
  ('30000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a1c1');

-- New league: two active members and one who left; one live and one deleted tournament.
INSERT INTO public.players (id, name) VALUES
  ('40000000-0000-0000-0000-00000000a001', 'P1'),
  ('40000000-0000-0000-0000-00000000a002', 'P2'),
  ('40000000-0000-0000-0000-00000000a003', 'P3');
INSERT INTO public.league_members (league_id, player_id, is_active) VALUES
  ('30000000-0000-0000-0000-00000000a002', '40000000-0000-0000-0000-00000000a001', true),
  ('30000000-0000-0000-0000-00000000a002', '40000000-0000-0000-0000-00000000a002', true),
  ('30000000-0000-0000-0000-00000000a002', '40000000-0000-0000-0000-00000000a003', false);
INSERT INTO public.tournaments (name, league_id, deleted) VALUES
  ('T live', '30000000-0000-0000-0000-00000000a002', false),
  ('T gone', '30000000-0000-0000-0000-00000000a002', true);

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

-- A manager may not list other people's leagues; anon may not call it at all.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a1b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.raises('SELECT * FROM public.get_manager_leagues()'), 'manager can list leagues';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT pg_temp.raises('SELECT * FROM public.get_manager_leagues()'), 'anon can list leagues';
END $$;
RESET ROLE;

-- Admin: sees M's two live leagues, newest first, with the right counts.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a1a1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  names text[];
  r record;
BEGIN
  SELECT array_agg(name ORDER BY created_at DESC) INTO names
  FROM public.get_manager_leagues() WHERE created_by = '00000000-0000-0000-0000-00000000a1b1';
  ASSERT names = ARRAY['New league', 'Old league'], format('owned leagues wrong: %s', names);

  SELECT * INTO r FROM public.get_manager_leagues() WHERE league_id = '30000000-0000-0000-0000-00000000a002';
  ASSERT r.member_count = 2, format('member_count %s, want 2', r.member_count);
  ASSERT r.tournament_count = 1, format('tournament_count %s, want 1', r.tournament_count);
  ASSERT r.co_manager_ids = ARRAY['00000000-0000-0000-0000-00000000a1c1'::uuid], 'co-manager missing';
  ASSERT r.status = 'active', 'status wrong';

  SELECT * INTO r FROM public.get_manager_leagues() WHERE league_id = '30000000-0000-0000-0000-00000000a001';
  ASSERT r.member_count = 0 AND r.tournament_count = 0 AND r.co_manager_ids = '{}', 'empty league counts wrong';
END $$;
RESET ROLE;

SELECT 'ALL ASSERTS PASSED' AS result;
ROLLBACK;

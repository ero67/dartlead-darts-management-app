-- Self-check for 20261117120000_match_stats_cleanup.sql against the local
-- Supabase stack (npx supabase start; migrations applied). Runs in one
-- transaction and rolls back, so it leaves no data behind:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/match_stats_cleanup.sql
-- Expect the last line: ALL ASSERTS PASSED

BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'manager@test.local', '{"role":"manager"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@test.local',   '{"role":"admin"}',   '{}');

INSERT INTO public.leagues (id, name, created_by) VALUES
  ('10000000-0000-0000-0000-000000000001', 'L', '00000000-0000-0000-0000-0000000000a1');

INSERT INTO public.players (id, name, owner_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'P1', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000002', 'P2', '00000000-0000-0000-0000-0000000000a1'),
  ('a0000000-0000-0000-0000-000000000003', 'P3', '00000000-0000-0000-0000-0000000000a1');

-- T1, T2: X01 rounds. TC: Cricket round.
INSERT INTO public.tournaments (id, name, user_id, league_id, status, game_type) VALUES
  ('20000000-0000-0000-0000-000000000001', 'T1', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'completed', 'x01'),
  ('20000000-0000-0000-0000-000000000002', 'T2', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'completed', 'x01'),
  ('20000000-0000-0000-0000-00000000000c', 'TC', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'completed', 'cricket');

-- MF: fake (almost all visits 60), one checkout stored as a string.
-- MN: normal. MR: result entered without stats. MT2: normal, other round. MC: Cricket.
INSERT INTO public.matches (id, tournament_id, player1_id, player2_id, status, winner_id, player1_legs, player2_legs, result) VALUES
  ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'completed',
   'a0000000-0000-0000-0000-000000000001', 2, 0,
   '{"winner":"a0000000-0000-0000-0000-000000000001","player1Legs":2,"player2Legs":0,
     "player1Stats":{"average":70,"totalScore":1002,"totalDarts":43,"oneEighties":0,
       "visitScores":[60,60,60,60,60,60,60,60,60,60,100,45],
       "checkouts":[{"leg":1,"checkout":"141"},{"leg":2,"checkout":81}],
       "legs":[{"leg":1,"darts":21,"isWin":true},{"leg":2,"darts":22,"isWin":true}]},
     "player2Stats":{"average":60,"totalScore":800,"totalDarts":40,"oneEighties":1,
       "visitScores":[60,60,60,60,60,60,60,60,60,60,60,60],
       "checkouts":[],"legs":[{"leg":1,"darts":21,"isWin":false},{"leg":2,"darts":19,"isWin":false}]}}'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'completed',
   'a0000000-0000-0000-0000-000000000002', 1, 2,
   '{"player1Stats":{"average":40.08,"totalScore":1002,"totalDarts":75,"oneEighties":0,
       "visitScores":[26,41,45,60,22,81,100,19,57,85,40,30],"checkouts":[{"leg":2,"checkout":40}],
       "legs":[{"leg":1,"darts":30,"isWin":false},{"leg":2,"darts":27,"isWin":true}]},
     "player2Stats":{"average":41,"totalScore":1503,"totalDarts":110,"oneEighties":0,
       "visitScores":[26,41,45,60,22,81,100,19,57,85,40,30],"checkouts":[{"leg":1,"checkout":32}],
       "legs":[{"leg":1,"darts":33,"isWin":true}]}}'),
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'completed',
   'a0000000-0000-0000-0000-000000000003', 0, 2,
   '{"winner":"a0000000-0000-0000-0000-000000000003","player1Legs":0,"player2Legs":2}'),
  ('30000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'completed',
   'a0000000-0000-0000-0000-000000000001', 2, 0,
   '{"player1Stats":{"average":40,"totalScore":1002,"totalDarts":75,"oneEighties":0,
       "visitScores":[26,41,45,60,22,81,100,19,57,85,40,30],"checkouts":[],"legs":[]},
     "player2Stats":{"average":30,"totalScore":800,"totalDarts":80,"oneEighties":0,
       "visitScores":[26,41,45,60,22,81,100,19,57,85,40,30],"checkouts":[],"legs":[]}}'),
  ('30000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000c',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'completed',
   'a0000000-0000-0000-0000-000000000001', 1, 0,
   '{"gameType":"cricket","player1Stats":{"marks":30},"player2Stats":{"marks":20}}');

INSERT INTO public.match_player_stats (match_id, player_id, legs_won, legs_lost, total_darts, total_score, average, highest_checkout) VALUES
  ('30000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 2, 0, 43, 1002, 70, 141),
  ('30000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000002', 0, 2, 40, 800, 60, 0),
  ('30000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000001', 1, 2, 75, 1002, 40.08, 40);

CREATE FUNCTION pg_temp.act_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
-- SQLSTATE the statement raised, or NULL when it ran fine.
CREATE FUNCTION pg_temp.sqlstate_of(stmt text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- A manager (not admin) is refused by every function.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.sqlstate_of($q$SELECT * FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001')$q$) = '42501', 'manager ran review';
  ASSERT pg_temp.sqlstate_of($q$SELECT public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000f1']::uuid[])$q$) = '42501', 'manager ran clear';
  ASSERT pg_temp.sqlstate_of($q$SELECT public.admin_restore_match_stats(ARRAY['30000000-0000-0000-0000-0000000000f1']::uuid[])$q$) = '42501', 'manager ran restore';
END $$;
RESET ROLE;

-- Review as admin.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001') WHERE match_id = '30000000-0000-0000-0000-0000000000f1';
  ASSERT r.has_stats AND NOT r.stats_cleared, 'MF should have stats, not cleared';
  ASSERT (r.p1->>'repetitive')::boolean, 'MF p1 should be repetitive';
  ASSERT (r.p2->>'repetitive')::boolean, 'MF p2 should be repetitive';
  ASSERT (r.p1->>'bestCheckout')::numeric = 141, 'best checkout must compare numerically: ' || (r.p1->>'bestCheckout');
  ASSERT (r.p1->>'fewestDarts')::int = 21, 'fewest darts';
  ASSERT (r.p2->>'oneEighties')::int = 1, '180s';
  ASSERT (r.p1->>'aboveAverage')::boolean, 'MF p1 70 vs own ~40 should be above average';
  ASSERT round((r.p1->>'ownAverage')::numeric) = 40, 'own average excludes this match: ' || (r.p1->>'ownAverage');
  ASSERT r.p1->>'name' = 'P1' AND (r.p1->>'legs')::int = 2, 'name/legs';

  SELECT * INTO r FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001') WHERE match_id = '30000000-0000-0000-0000-0000000000a2';
  ASSERT NOT (r.p1->>'repetitive')::boolean AND NOT (r.p2->>'repetitive')::boolean, 'MN not repetitive';
  ASSERT NOT (r.p1->>'aboveAverage')::boolean, 'MN not above average';

  SELECT * INTO r FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001') WHERE match_id = '30000000-0000-0000-0000-0000000000e1';
  ASSERT NOT r.has_stats, 'MR has no stats';
  ASSERT NOT COALESCE((r.p1->>'repetitive')::boolean, false), 'MR not flagged';

  ASSERT NOT EXISTS (SELECT 1 FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001') WHERE match_id = '30000000-0000-0000-0000-0000000000c1'), 'cricket match listed';

  ASSERT pg_temp.sqlstate_of($q$SELECT public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000b2']::uuid[])$q$) = '22023', 'mixed tournaments accepted';
  ASSERT pg_temp.sqlstate_of($q$SELECT public.admin_clear_match_stats(array_fill('30000000-0000-0000-0000-0000000000a2'::uuid, ARRAY[21]))$q$) = '22023', '21 ids accepted';
END $$;

-- Clear MF + MR.
SELECT set_config('t.clear1', public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000f1','30000000-0000-0000-0000-0000000000e1']::uuid[])::text, true);
SELECT set_config('t.clear2', public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000f1']::uuid[])::text, true);
SELECT set_config('t.clearc', public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000c1']::uuid[])::text, true);
DO $$ BEGIN
  ASSERT (SELECT stats_cleared FROM public.admin_match_stats_review('10000000-0000-0000-0000-000000000001') WHERE match_id = '30000000-0000-0000-0000-0000000000f1'), 'review should show MF cleared';
END $$;
RESET ROLE;

DO $$
DECLARE c jsonb := current_setting('t.clear1')::jsonb;
        m public.matches;
BEGIN
  ASSERT c->'cleared' = '["30000000-0000-0000-0000-0000000000f1"]'::jsonb, 'cleared: ' || c::text;
  ASSERT c->'skipped' @> '[{"match_id":"30000000-0000-0000-0000-0000000000e1","reason":"no_stats"}]'::jsonb, 'MR skip: ' || c::text;
  ASSERT current_setting('t.clear2')::jsonb->'skipped' @> '[{"reason":"already_cleared"}]'::jsonb, 'second clear: ' || current_setting('t.clear2');
  ASSERT current_setting('t.clearc')::jsonb->'skipped' @> '[{"reason":"cricket"}]'::jsonb, 'cricket clear: ' || current_setting('t.clearc');

  SELECT * INTO m FROM public.matches WHERE id = '30000000-0000-0000-0000-0000000000f1';
  ASSERT NOT (m.result ? 'player1Stats') AND NOT (m.result ? 'player2Stats'), 'stats still in result';
  ASSERT m.result->>'winner' = 'a0000000-0000-0000-0000-000000000001', 'result winner lost';
  ASSERT m.winner_id = 'a0000000-0000-0000-0000-000000000001' AND m.player1_legs = 2 AND m.player2_legs = 0 AND m.status = 'completed', 'result columns changed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.match_player_stats WHERE match_id = m.id
                     AND (total_darts <> 0 OR total_score <> 0 OR average <> 0 OR highest_checkout <> 0)), 'stats rows not zeroed';
  ASSERT (SELECT legs_won FROM public.match_player_stats WHERE match_id = m.id AND player_id = 'a0000000-0000-0000-0000-000000000001') = 2, 'legs_won changed';
  ASSERT (SELECT count(*) FROM public.match_stats_backups WHERE match_id = m.id AND restored_at IS NULL) = 1, 'expected one open backup';
  ASSERT (SELECT count(*) FROM public.admin_audit_log WHERE action = 'clear_match_stats' AND details->>'match_id' = m.id::text) = 1, 'audit row';
END $$;

-- Restore MF; clear MN, re-score it, then restore must refuse.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
SET LOCAL ROLE authenticated;
SELECT set_config('t.restore1', public.admin_restore_match_stats(ARRAY['30000000-0000-0000-0000-0000000000f1']::uuid[])::text, true);
SELECT public.admin_clear_match_stats(ARRAY['30000000-0000-0000-0000-0000000000a2']::uuid[]);
RESET ROLE;
UPDATE public.matches SET result = result || '{"player1Stats":{"average":1}}' WHERE id = '30000000-0000-0000-0000-0000000000a2';
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
SET LOCAL ROLE authenticated;
SELECT set_config('t.restore2', public.admin_restore_match_stats(ARRAY['30000000-0000-0000-0000-0000000000a2']::uuid[])::text, true);
RESET ROLE;

DO $$
DECLARE m public.matches;
BEGIN
  ASSERT current_setting('t.restore1')::jsonb->'restored' = '["30000000-0000-0000-0000-0000000000f1"]'::jsonb, 'restore1: ' || current_setting('t.restore1');
  SELECT * INTO m FROM public.matches WHERE id = '30000000-0000-0000-0000-0000000000f1';
  ASSERT (m.result->'player1Stats'->>'average')::numeric = 70, 'p1 stats not restored';
  ASSERT m.result->'player1Stats'->'checkouts'->0->>'checkout' = '141', 'checkouts not restored';
  ASSERT (m.result->'player2Stats'->>'oneEighties')::int = 1, 'p2 stats not restored';
  ASSERT (SELECT total_darts = 43 AND total_score = 1002 AND average = 70 AND highest_checkout = 141
          FROM public.match_player_stats WHERE match_id = m.id AND player_id = 'a0000000-0000-0000-0000-000000000001'), 'stats row not restored';
  ASSERT NOT EXISTS (SELECT 1 FROM public.match_stats_backups WHERE match_id = m.id AND restored_at IS NULL), 'backup still open';
  ASSERT (SELECT count(*) FROM public.admin_audit_log WHERE action = 'restore_match_stats' AND details->>'match_id' = m.id::text) = 1, 'restore audit row';

  ASSERT current_setting('t.restore2')::jsonb->'skipped' @> '[{"reason":"rescored"}]'::jsonb, 'restore2: ' || current_setting('t.restore2');
  ASSERT (SELECT result->'player1Stats'->>'average' FROM public.matches WHERE id = '30000000-0000-0000-0000-0000000000a2') = '1', 'rescored stats overwritten';
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

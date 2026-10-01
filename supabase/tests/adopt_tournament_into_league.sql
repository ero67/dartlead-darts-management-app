-- Self-check for adopt_tournament_into_league() against a throwaway Postgres
-- (stub tables only; no Supabase stack needed):
--   docker run -d --name adopt-test -e POSTGRES_PASSWORD=x postgres:16
--   docker cp supabase/migrations/20261001120000_adopt_tournament_into_league.sql adopt-test:/mig.sql
--   docker cp supabase/tests/adopt_tournament_into_league.sql adopt-test:/test.sql
--   docker exec adopt-test psql -U postgres -v ON_ERROR_STOP=1 -q -f /test.sql   # expect: ALL ASSERTS PASSED
--   docker rm -f adopt-test

-- Stub schema: only the tables/constraints adopt_tournament_into_league touches.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid', true)::uuid $$;

CREATE TABLE public.players (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, owner_id uuid);
CREATE UNIQUE INDEX players_owner_name_key ON public.players (owner_id, name);
CREATE TABLE public.leagues (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.league_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), league_id uuid, player_id uuid, UNIQUE (league_id, player_id));
CREATE TABLE public.tournaments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), league_id uuid, deleted boolean DEFAULT false, playoffs jsonb, league_points_calculated boolean DEFAULT false, updated_at timestamptz);
CREATE TABLE public.tournament_players (tournament_id uuid, player_id uuid, PRIMARY KEY (tournament_id, player_id));
CREATE TABLE public.groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid);
CREATE TABLE public.group_players (group_id uuid, player_id uuid, PRIMARY KEY (group_id, player_id));
CREATE TABLE public.group_standings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid, player_id uuid);
CREATE TABLE public.tournament_stats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid, player_id uuid);
CREATE TABLE public.matches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid, player1_id uuid, player2_id uuid, winner_id uuid, result jsonb);
CREATE TABLE public.legs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid, player1_id uuid, player2_id uuid, winner_id uuid);
CREATE TABLE public.match_player_stats (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid, player_id uuid);
CREATE TABLE public.dart_throws (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leg_id uuid, player_id uuid);
CREATE FUNCTION public.can_manage_league(l_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.manager', true) = 'yes' $$;

\i /mig.sql

-- Fixture: league with members A, B owned by me; a tournament run by someone
-- else with their own rows a1 ("Jan Novak" vs member "Jan Novák"), b1, c1.
SET test.uid = '00000000-0000-0000-0000-00000000aaaa';
SET test.manager = 'yes';
INSERT INTO players (id, name, owner_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Jan Novák', '00000000-0000-0000-0000-00000000aaaa'),
  ('a0000000-0000-0000-0000-000000000002', 'Peter',     '00000000-0000-0000-0000-00000000aaaa'),
  ('b0000000-0000-0000-0000-000000000001', 'Jan Novak', '00000000-0000-0000-0000-00000000bbbb'),
  ('b0000000-0000-0000-0000-000000000002', 'peter',     '00000000-0000-0000-0000-00000000bbbb'),
  ('b0000000-0000-0000-0000-000000000003', 'Milan',     '00000000-0000-0000-0000-00000000bbbb');
INSERT INTO leagues (id) VALUES ('10000000-0000-0000-0000-000000000000');
INSERT INTO league_members (league_id, player_id) VALUES
  ('10000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002');
INSERT INTO tournaments (id, playoffs) VALUES ('20000000-0000-0000-0000-000000000000',
  '{"rounds":[{"matches":[{"id":"m1","player1":{"id":"b0000000-0000-0000-0000-000000000001","name":"Jan Novak"},"player2":{"id":"b0000000-0000-0000-0000-000000000003","name":"Milan"},"status":"completed","result":{"winner":"b0000000-0000-0000-0000-000000000001"}}]}],"qualifyingPlayers":[{"id":"b0000000-0000-0000-0000-000000000002","name":"peter"}]}');
INSERT INTO tournament_players VALUES
  ('20000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003');
INSERT INTO groups (id, tournament_id) VALUES ('30000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000000');
INSERT INTO group_players VALUES ('30000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001'), ('30000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002');
INSERT INTO group_standings (group_id, player_id) VALUES ('30000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001');
INSERT INTO tournament_stats (tournament_id, player_id) VALUES ('20000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003');
INSERT INTO matches (id, tournament_id, player1_id, player2_id, winner_id, result) VALUES
  ('40000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   '{"winner":"b0000000-0000-0000-0000-000000000002","player1Legs":1,"player2Legs":3}');
INSERT INTO legs (id, match_id, player1_id, player2_id, winner_id) VALUES
  ('50000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000000',
   'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002');
INSERT INTO match_player_stats (match_id, player_id) VALUES ('40000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001');
INSERT INTO dart_throws (leg_id, player_id) VALUES ('50000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002');

-- Negative cases
SET test.manager = 'no';
SELECT 'not_authorized' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000', '[]'::jsonb) ->> 'error' AS got;
SET test.manager = 'yes';
SELECT 'incomplete_map' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000',
  '[{"from":"b0000000-0000-0000-0000-000000000001","to":"a0000000-0000-0000-0000-000000000001"}]'::jsonb) ->> 'error' AS got;
SELECT 'duplicate_target' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000',
  '[{"from":"b0000000-0000-0000-0000-000000000001","to":"a0000000-0000-0000-0000-000000000001"},
    {"from":"b0000000-0000-0000-0000-000000000002","to":"a0000000-0000-0000-0000-000000000001"},
    {"from":"b0000000-0000-0000-0000-000000000003","to":"a0000000-0000-0000-0000-000000000002"}]'::jsonb) ->> 'error' AS got;
SELECT 'not_a_member' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000',
  '[{"from":"b0000000-0000-0000-0000-000000000001","to":"a0000000-0000-0000-0000-000000000001"},
    {"from":"b0000000-0000-0000-0000-000000000002","to":"a0000000-0000-0000-0000-000000000002"},
    {"from":"b0000000-0000-0000-0000-000000000003","to":"b0000000-0000-0000-0000-000000000003"}]'::jsonb) ->> 'error' AS got;

-- Happy path: a1->A, b1->B, c1->new
SELECT 'success' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000',
  '[{"from":"b0000000-0000-0000-0000-000000000001","to":"a0000000-0000-0000-0000-000000000001"},
    {"from":"b0000000-0000-0000-0000-000000000002","to":"a0000000-0000-0000-0000-000000000002"},
    {"from":"b0000000-0000-0000-0000-000000000003","to":"new"}]'::jsonb) AS got;

DO $$
DECLARE milan uuid; po jsonb;
BEGIN
  SELECT id INTO milan FROM players WHERE name = 'Milan' AND owner_id = '00000000-0000-0000-0000-00000000aaaa';
  ASSERT milan IS NOT NULL, 'new player created in caller roster';
  ASSERT EXISTS (SELECT 1 FROM league_members WHERE league_id = '10000000-0000-0000-0000-000000000000' AND player_id = milan), 'new player is a member';
  ASSERT (SELECT league_id FROM tournaments WHERE id = '20000000-0000-0000-0000-000000000000') = '10000000-0000-0000-0000-000000000000', 'linked';
  ASSERT (SELECT array_agg(player_id ORDER BY player_id) FROM tournament_players WHERE tournament_id = '20000000-0000-0000-0000-000000000000')
       = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002', milan]::uuid[]) x), 'tournament_players remapped';
  ASSERT NOT EXISTS (SELECT 1 FROM group_players WHERE player_id::text LIKE 'b0%'), 'group_players remapped';
  ASSERT NOT EXISTS (SELECT 1 FROM group_standings WHERE player_id::text LIKE 'b0%'), 'group_standings remapped';
  ASSERT (SELECT player_id FROM tournament_stats) = milan, 'tournament_stats remapped';
  ASSERT (SELECT player1_id::text || player2_id::text || winner_id::text || (result ->> 'winner') FROM matches)
       = 'a0000000-0000-0000-0000-000000000001a0000000-0000-0000-0000-000000000002a0000000-0000-0000-0000-000000000002a0000000-0000-0000-0000-000000000002', 'matches remapped';
  ASSERT (SELECT result ->> 'player2Legs' FROM matches) = '3', 'result otherwise intact';
  ASSERT (SELECT winner_id FROM legs) = 'a0000000-0000-0000-0000-000000000002', 'legs remapped';
  ASSERT (SELECT player_id FROM match_player_stats) = 'a0000000-0000-0000-0000-000000000001', 'match_player_stats remapped';
  ASSERT (SELECT player_id FROM dart_throws) = 'a0000000-0000-0000-0000-000000000002', 'dart_throws remapped';
  SELECT playoffs INTO po FROM tournaments WHERE id = '20000000-0000-0000-0000-000000000000';
  ASSERT po -> 'rounds' -> 0 -> 'matches' -> 0 -> 'player1' ->> 'id' = 'a0000000-0000-0000-0000-000000000001', 'bracket p1 id';
  ASSERT po -> 'rounds' -> 0 -> 'matches' -> 0 -> 'player1' ->> 'name' = 'Jan Novák', 'bracket p1 name';
  ASSERT po -> 'rounds' -> 0 -> 'matches' -> 0 -> 'player2' ->> 'id' = milan::text, 'bracket p2 id (new)';
  ASSERT po -> 'rounds' -> 0 -> 'matches' -> 0 -> 'result' ->> 'winner' = 'a0000000-0000-0000-0000-000000000001', 'bracket winner';
  ASSERT po -> 'qualifyingPlayers' -> 0 ->> 'name' = 'Peter', 'qualifier name';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pm' AND schemaname LIKE 'pg_temp%'), 'temp table dropped';
  RAISE NOTICE 'ALL ASSERTS PASSED';
END $$;

SELECT 'already_linked' AS expect, adopt_tournament_into_league('20000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000', '[]'::jsonb) ->> 'error' AS got;

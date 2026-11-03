-- Self-check for 20261103120000_group_boards.sql against a throwaway Postgres
-- (stub tables only; no Supabase stack needed):
--   docker run -d --name boards-test -e POSTGRES_PASSWORD=x postgres:16
--   docker cp supabase/migrations/20261027130000_board_scheduling.sql boards-test:/mig0.sql
--   docker cp supabase/migrations/20261103120000_group_boards.sql boards-test:/mig.sql
--   docker cp supabase/tests/group_boards.sql boards-test:/test.sql
--   docker exec boards-test psql -U postgres -v ON_ERROR_STOP=1 -q -f /test.sql   # expect: ALL ASSERTS PASSED
--   docker rm -f boards-test

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.tournaments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), playoffs jsonb, legs_to_win int, starting_score int);
CREATE TABLE public.groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid);
CREATE TABLE public.matches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tournament_id uuid, player1_id uuid, player2_id uuid,
  status text DEFAULT 'pending', is_playoff boolean, playoff_round int, playoff_match_number int, legs_to_win int, starting_score int);
CREATE FUNCTION public.can_manage_tournament(t_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.manager', true) = 'yes' $$;

\i /mig0.sql
\i /mig.sql

INSERT INTO public.tournaments (id) VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO public.groups (id, tournament_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.matches (id, tournament_id) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
SET test.manager = 'yes';

-- Only one signature exists (no PostgREST overload ambiguity).
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'set_match_boards') = 1, 'one set_match_boards';
END $$;

-- The old 3-argument call still works.
SELECT public.set_match_boards('10000000-0000-0000-0000-000000000001', 4, '{"30000000-0000-0000-0000-000000000001": 2}');
DO $$ BEGIN
  ASSERT (SELECT assigned_board FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000001') = 2, '3-arg call assigns';
  ASSERT (SELECT board_count FROM public.tournaments WHERE id = '10000000-0000-0000-0000-000000000001') = 4, '3-arg call sets count';
END $$;

-- Group boards are stored; an empty array means any board (NULL).
SELECT public.set_match_boards('10000000-0000-0000-0000-000000000001', 4, '{}',
  '{"20000000-0000-0000-0000-000000000001": [3, 4], "20000000-0000-0000-0000-000000000002": []}');
DO $$ BEGIN
  ASSERT (SELECT boards FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000001') = '{3,4}'::smallint[], 'group boards stored';
  ASSERT (SELECT boards FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000002') IS NULL, 'empty means any';
END $$;

-- Lowering the count prunes boards above it; a group left empty becomes any board.
SELECT public.set_match_boards('10000000-0000-0000-0000-000000000001', 3, '{}');
DO $$ BEGIN
  ASSERT (SELECT boards FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000001') = '{3}'::smallint[], 'pruned to count';
END $$;
SELECT public.set_match_boards('10000000-0000-0000-0000-000000000001', 2, '{}');
DO $$ BEGIN
  ASSERT (SELECT boards FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000001') IS NULL, 'all pruned means any';
END $$;

-- A board above the count is rejected.
DO $$ BEGIN
  BEGIN
    PERFORM public.set_match_boards('10000000-0000-0000-0000-000000000001', 2, '{}', '{"20000000-0000-0000-0000-000000000001": [5]}');
    ASSERT false, 'board above count accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;

-- A group of another tournament is never touched.
INSERT INTO public.tournaments (id) VALUES ('10000000-0000-0000-0000-000000000002');
INSERT INTO public.groups (id, tournament_id, boards) VALUES ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', '{1}');
SELECT public.set_match_boards('10000000-0000-0000-0000-000000000001', 2, '{}', '{"20000000-0000-0000-0000-000000000009": [2]}');
DO $$ BEGIN
  ASSERT (SELECT boards FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000009') = '{1}'::smallint[], 'other tournament untouched';
END $$;

-- Non-managers are refused.
SET test.manager = 'no';
DO $$ BEGIN
  BEGIN
    PERFORM public.set_match_boards('10000000-0000-0000-0000-000000000001', 2, '{}', '{}');
    ASSERT false, 'non-manager accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;

SELECT 'ALL ASSERTS PASSED' AS result;

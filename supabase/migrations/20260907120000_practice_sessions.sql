-- Practice mode, cloud history.
--
-- Practice sessions (solo X01, checkout trainer, 121, Around the Clock) have
-- lived only in the device's localStorage so far. This table lets a signed-in
-- player keep them across devices. It is strictly personal data: a row is
-- visible to, and editable by, its owner only — no manager, scorer or admin
-- path, and no relation to tournament tables. Personal bests are computed in
-- the client from the rows, so there is no server-side aggregation to keep in
-- step with the JavaScript engines.
--
-- client_id is the id the device generated when the session finished; the
-- upload is an upsert on (user_id, client_id), so retries after a flaky
-- connection never duplicate a session and a history accumulated while logged
-- out can be pushed after signing in.

CREATE TABLE public.practice_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   text        NOT NULL,
  game        text        NOT NULL CHECK (game IN ('x01', 'checkout', 'oneTwentyOne', 'aroundTheClock')),
  settings    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  stats       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  started_at  timestamptz,
  finished_at timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_sessions_user_client_key UNIQUE (user_id, client_id),
  CONSTRAINT practice_sessions_client_id_len CHECK (char_length(client_id) BETWEEN 1 AND 64),
  CONSTRAINT practice_sessions_settings_size CHECK (pg_column_size(settings) < 4096),
  CONSTRAINT practice_sessions_stats_size CHECK (pg_column_size(stats) < 8192)
);

COMMENT ON TABLE public.practice_sessions IS 'Finished practice-mode sessions per account (device-generated client_id, settings and stats as produced by the client engines); owner-only';

-- The one read path: "my sessions, newest first".
CREATE INDEX idx_practice_sessions_user_finished
  ON public.practice_sessions (user_id, finished_at DESC);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view practice sessions" ON public.practice_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Owners can insert practice sessions" ON public.practice_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Owners can update practice sessions" ON public.practice_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Owners can delete practice sessions" ON public.practice_sessions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Newer Supabase projects no longer expose public tables to the Data API by
-- default; be explicit. Anonymous visitors practice offline only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_sessions TO authenticated;
REVOKE ALL ON public.practice_sessions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.practice_sessions FROM authenticated;

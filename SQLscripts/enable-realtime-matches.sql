-- Enable Postgres realtime for live match score updates.
--
-- The Live Matches view subscribes to postgres_changes on the `matches` table
-- so other devices see scores update instantly (without this, the app falls
-- back to a 5s poll). Run this once in the Supabase SQL editor.

-- Add `matches` to the realtime publication (no-op if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE matches;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'matches already in supabase_realtime publication';
END
$$;

-- REPLICA IDENTITY FULL ensures UPDATE payloads include all columns
-- (needed so the client receives current scores, winner_id, result, etc.).
ALTER TABLE matches REPLICA IDENTITY FULL;

-- Verify
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'matches';

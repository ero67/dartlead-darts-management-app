-- Add optional user_id to players table to link players to auth accounts.
-- Nullable so manually-added players (by manager) remain unlinked.

ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial unique index: one auth user can only link to one player record,
-- but many players can have NULL user_id (manual players).
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id) WHERE user_id IS NOT NULL;

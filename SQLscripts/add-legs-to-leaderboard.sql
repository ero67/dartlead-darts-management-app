-- Add legs_won and legs_lost columns to league_leaderboard
ALTER TABLE league_leaderboard
ADD COLUMN IF NOT EXISTS legs_won INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS legs_lost INTEGER DEFAULT 0;

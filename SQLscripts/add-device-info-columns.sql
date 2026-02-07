-- Add device info columns for tournament board tracking
-- Run this script in Supabase SQL Editor

-- Add device name column (user-friendly name like "Tablet pri okne")
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_device_name VARCHAR(100);

-- Add board number column (e.g., 1, 2, 3 for different dart boards)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_board_number INTEGER;

-- Add comments to describe the columns
COMMENT ON COLUMN matches.live_device_name IS 'User-friendly name of the device running the match';
COMMENT ON COLUMN matches.live_board_number IS 'Board/target number where the match is being played (for tournament display)';

-- Create index for faster queries on board number
CREATE INDEX IF NOT EXISTS idx_matches_board_number ON matches(live_board_number) WHERE live_board_number IS NOT NULL;

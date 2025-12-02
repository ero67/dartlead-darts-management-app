-- Add tournament_id column to matches table
-- This allows direct linking of matches (including playoff matches) to tournaments

-- Add the column (nullable initially for existing matches)
ALTER TABLE matches 
ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);

-- Update existing group matches to have tournament_id from their group
UPDATE matches m
SET tournament_id = g.tournament_id
FROM groups g
WHERE m.group_id = g.id 
  AND m.tournament_id IS NULL;

-- For playoff matches, we need to determine tournament_id from players
-- This query finds playoff matches where both players are in the same tournament
-- and updates the tournament_id accordingly
UPDATE matches m
SET tournament_id = tp1.tournament_id
FROM tournament_players tp1
JOIN tournament_players tp2 ON tp1.tournament_id = tp2.tournament_id
WHERE m.is_playoff = true
  AND m.tournament_id IS NULL
  AND m.player1_id = tp1.player_id
  AND m.player2_id = tp2.player_id
  AND tp1.tournament_id = tp2.tournament_id
  AND NOT EXISTS (
    -- Ensure this is the only tournament both players share
    SELECT 1 
    FROM tournament_players tp3
    JOIN tournament_players tp4 ON tp3.tournament_id = tp4.tournament_id
    WHERE tp3.player_id = m.player1_id
      AND tp4.player_id = m.player2_id
      AND tp3.tournament_id = tp4.tournament_id
      AND tp3.tournament_id != tp1.tournament_id
  );

-- Add comment to document the column
COMMENT ON COLUMN matches.tournament_id IS 'Direct reference to tournament. For group matches, this matches the group.tournament_id. For playoff matches, this links the match directly to the tournament.';


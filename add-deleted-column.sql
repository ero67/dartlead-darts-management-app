-- Add deleted column to tournaments table for soft delete
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tournaments_deleted ON tournaments(deleted) WHERE deleted = FALSE;

-- Update existing tournaments to have deleted = false
UPDATE tournaments SET deleted = FALSE WHERE deleted IS NULL;


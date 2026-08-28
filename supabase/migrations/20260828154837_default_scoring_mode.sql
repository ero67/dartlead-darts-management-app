-- Per-tournament default for the match scoring input:
--   'dart'      = dart-by-dart entry
--   'turnTotal' = enter the 3-dart visit total
-- The scorer can still switch modes on the match-start screen; this only sets
-- what is preselected. Leagues store the same key inside
-- default_tournament_settings (JSONB), so no column is needed there.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS default_scoring_mode text NOT NULL DEFAULT 'dart'
  CONSTRAINT tournaments_default_scoring_mode_check
  CHECK (default_scoring_mode IN ('dart', 'turnTotal'));

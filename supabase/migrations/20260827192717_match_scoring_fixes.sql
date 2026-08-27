-- Match scoring integrity fixes.
--
-- match_starter: who threw first in leg 1 (0 = player1, 1 = player2). Leg
-- starters alternate off this value. It previously lived only in localStorage,
-- so crash recovery on another device past leg 1 could not know the starter —
-- the UI either picked the wrong starter or deadlocked with a null player.
ALTER TABLE public.matches
  ADD COLUMN match_starter smallint;

COMMENT ON COLUMN public.matches.match_starter IS 'Player index (0/1) who started leg 1; leg starters alternate from this';

-- completed_at: referenced by matchService.completeMatch and ordered on by
-- getLeaderboard''s recent-form query, but the column never existed in this
-- database — the code paths silently failed or sorted on NULLs.
ALTER TABLE public.matches
  ADD COLUMN completed_at timestamptz;

UPDATE public.matches
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

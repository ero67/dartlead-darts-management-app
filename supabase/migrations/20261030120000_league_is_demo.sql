-- Marks sales-demo leagues (docs/DEMO_LEAGUE.md), so the AI assistant can leave them, their tournaments and their
-- fictional players out of its searches, lists and records. Only the assistant reads it; the app shows demo leagues
-- as before. Additive, so installed Android apps are unaffected.

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leagues.is_demo IS 'Sales demo with fictional players (scripts/seed-demo-league.mjs); hidden from the assistant.';

-- Production's demo league. Staging's keeps the default: the assistant's eval cases are built on it.
UPDATE public.leagues SET is_demo = true WHERE id = '2deabfb9-4718-4b42-a081-b356864316d2';

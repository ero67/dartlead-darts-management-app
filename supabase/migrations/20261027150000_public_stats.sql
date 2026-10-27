-- Public usage numbers for the landing page: completed matches, players who
-- played them and leagues with a finished round.
--
-- Only completed, non-deleted tournaments count, so abandoned test rounds are
-- left out. Everything owned by the demo account (email demo@..., see
-- docs/DEMO_LEAGUE.md) is left out too. A player is one roster row, so the
-- same person in two organisers' rosters counts twice.
--
-- SECURITY DEFINER because logged-out visitors cannot read these tables; it
-- returns only three totals.
--
-- Idempotent: safe to run twice.

CREATE OR REPLACE FUNCTION public.get_public_stats()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  WITH counted AS (
    SELECT t.id, t.league_id
    FROM public.tournaments t
    JOIN auth.users u ON u.id = t.user_id
    WHERE t.status = 'completed'
      AND NOT coalesce(t.deleted, false)
      AND u.email NOT ILIKE 'demo@%'
  ), played AS (
    SELECT m.player1_id, m.player2_id
    FROM public.matches m
    JOIN counted c ON c.id = m.tournament_id
    WHERE m.status = 'completed'
  )
  SELECT jsonb_build_object(
    'matches', (SELECT count(*) FROM played),
    'players', (SELECT count(*) FROM (
      SELECT player1_id AS id FROM played UNION SELECT player2_id FROM played
    ) p WHERE p.id IS NOT NULL),
    'leagues', (SELECT count(*) FROM public.leagues l
      WHERE NOT coalesce(l.deleted, false)
        AND EXISTS (SELECT 1 FROM counted c WHERE c.league_id = l.id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_stats() TO anon, authenticated;

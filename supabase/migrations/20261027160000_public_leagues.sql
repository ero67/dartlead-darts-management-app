-- Public leagues: anyone (no login) can see a league's page, leaderboard,
-- members, results and past seasons, the way tournament pages already are
-- public; the league data is derived from those public results anyway.
-- Public by default, existing leagues included; an organiser can switch a
-- league to members-only. Registrations, co-managers and scorers stay private.
-- Installed Android apps keep working: one new column with a default, and the
-- existing policies for signed-in users are unchanged. Idempotent.

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.leagues.is_public IS 'Visible without login (league page, leaderboard, members, results, seasons)';

-- SECURITY DEFINER so anon can evaluate it without reading leagues itself.
CREATE OR REPLACE FUNCTION public.is_public_league(l_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = l_id AND l.is_public AND NOT COALESCE(l.deleted, false)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_public_league(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_league(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view public leagues" ON public.leagues;
CREATE POLICY "Anyone can view public leagues" ON public.leagues
  FOR SELECT TO anon
  USING (is_public AND NOT COALESCE(deleted, false));

DROP POLICY IF EXISTS "Anyone can view public league members" ON public.league_members;
CREATE POLICY "Anyone can view public league members" ON public.league_members
  FOR SELECT TO anon
  USING ((SELECT public.is_public_league(league_id)));

DROP POLICY IF EXISTS "Anyone can view public league leaderboard" ON public.league_leaderboard;
CREATE POLICY "Anyone can view public league leaderboard" ON public.league_leaderboard
  FOR SELECT TO anon
  USING ((SELECT public.is_public_league(league_id)));

DROP POLICY IF EXISTS "Anyone can view public league results" ON public.league_tournament_results;
CREATE POLICY "Anyone can view public league results" ON public.league_tournament_results
  FOR SELECT TO anon
  USING ((SELECT public.is_public_league(league_id)));

DROP POLICY IF EXISTS "Anyone can view public league seasons" ON public.league_seasons;
CREATE POLICY "Anyone can view public league seasons" ON public.league_seasons
  FOR SELECT TO anon
  USING ((SELECT public.is_public_league(league_id)));
GRANT SELECT ON public.league_seasons TO anon;

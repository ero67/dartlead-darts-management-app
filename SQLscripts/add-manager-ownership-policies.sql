-- Make league-related tables publicly readable (matching tournament pattern from enable-public-viewing.sql)
-- Managers can still only UPDATE/DELETE their own leagues (existing policies handle this)

-- Leagues: allow public SELECT (was auth-gated)
DROP POLICY IF EXISTS "Authenticated users can view all leagues" ON leagues;
CREATE POLICY "Anyone can view leagues" ON leagues FOR SELECT USING (true);

-- League members: allow public SELECT
DROP POLICY IF EXISTS "Authenticated users can view league members" ON league_members;
CREATE POLICY "Anyone can view league members" ON league_members FOR SELECT USING (true);

-- League tournament results: allow public SELECT
DROP POLICY IF EXISTS "Authenticated users can view league tournament results" ON league_tournament_results;
CREATE POLICY "Anyone can view league tournament results" ON league_tournament_results FOR SELECT USING (true);

-- League leaderboard: allow public SELECT
DROP POLICY IF EXISTS "Authenticated users can view league leaderboard" ON league_leaderboard;
CREATE POLICY "Anyone can view league leaderboard" ON league_leaderboard FOR SELECT USING (true);

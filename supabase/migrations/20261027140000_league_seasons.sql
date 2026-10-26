-- League seasons: an organiser ends a season, its final table is archived
-- and the live leaderboard starts from zero with the same members.
--
-- Data model
--   league_seasons     one row per ENDED season: name, dates and a frozen
--                      snapshot of the final table (standings jsonb).
--   tournaments.season_id
--                      NULL = the current season (what every older app writes
--                      when it creates a round); set to an ended season's id
--                      when the season is ended. Results are never deleted.
--   leagues.season_name / season_started_at
--                      the current season's name (NULL = the app shows a
--                      default like "Season 2026/27") and start.
--
-- The server is the source of truth for the live table: the rebuild only
-- counts current-season rounds, and installed apps (<= 1.7.0) that still
-- aggregate the leaderboard on the device (Recalculate) have their write
-- recomputed by a trigger, so they cannot pull archived points back in.
--
-- Undo the latest rollover of a league (admin, SQL editor), see PR text:
--   restore manual points from the snapshot, DELETE the league_seasons row
--   (tournaments.season_id goes back to NULL through the FK), restore
--   leagues.season_name/season_started_at, then rebuild_league_leaderboard().
--
-- Idempotent: safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  started_at timestamptz NOT NULL,
  ended_at   timestamptz NOT NULL DEFAULT now(),
  ended_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- [{rank, player_id, name, points, manual_points, played, legs_won, legs_lost, best, avg}]
  standings  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.league_seasons IS 'Ended league seasons with their frozen final standings. The current season is the league''s tournaments with season_id IS NULL.';

CREATE INDEX IF NOT EXISTS idx_league_seasons_league_id ON public.league_seasons (league_id, ended_at DESC);

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS season_name text CHECK (season_name IS NULL OR char_length(season_name) <= 100),
  ADD COLUMN IF NOT EXISTS season_started_at timestamptz;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.league_seasons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_season_id ON public.tournaments (season_id) WHERE season_id IS NOT NULL;

-- Readable like leagues; only the name is editable (by the league's
-- managers); rows are created by end_league_season() only.
ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view league seasons" ON public.league_seasons;
CREATE POLICY "Authenticated users can view league seasons" ON public.league_seasons
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "League managers can rename seasons" ON public.league_seasons;
CREATE POLICY "League managers can rename seasons" ON public.league_seasons
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

REVOKE ALL ON public.league_seasons FROM anon, authenticated;
GRANT SELECT ON public.league_seasons TO authenticated;
GRANT UPDATE (name) ON public.league_seasons TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Clients cannot move a round between seasons. Moving a tournament to
-- another league (unlink / adopt) puts it in that league's current season.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tournaments_guard_season()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.league_id IS DISTINCT FROM OLD.league_id THEN
    NEW.season_id := NULL;
  ELSIF current_user IN ('authenticated', 'anon') THEN
    NEW.season_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.season_id END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournaments_guard_season ON public.tournaments;
CREATE TRIGGER tournaments_guard_season
  BEFORE INSERT OR UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.tournaments_guard_season();

-- ---------------------------------------------------------------------------
-- 3. Rebuild counts the current season only. Otherwise unchanged from
-- 20260905160000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_league_leaderboard(l_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  WITH res AS (
    SELECT r.player_id, r.points_awarded, r.placement, t.created_at
    FROM public.league_tournament_results r
    JOIN public.tournaments t ON t.id = r.tournament_id
    WHERE r.league_id = l_id AND COALESCE(t.deleted, false) = false AND t.season_id IS NULL
  ),
  agg AS (
    SELECT player_id,
           SUM(COALESCE(points_awarded, 0))::int AS pts,
           COUNT(*)::int                         AS played,
           MIN(placement)                        AS best,
           MAX(placement)                        AS worst,
           AVG(placement)::numeric(5,2)          AS avgp,
           MAX(created_at)                       AS last_at
    FROM res GROUP BY player_id
  ),
  leg_rows AS (
    SELECT m.player1_id AS player_id, COALESCE(m.player1_legs, 0) AS won, COALESCE(m.player2_legs, 0) AS lost
    FROM public.matches m JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE t.league_id = l_id AND t.status = 'completed' AND COALESCE(t.deleted, false) = false
      AND t.season_id IS NULL
      AND m.status = 'completed' AND m.player1_id IS NOT NULL
    UNION ALL
    SELECT m.player2_id, COALESCE(m.player2_legs, 0), COALESCE(m.player1_legs, 0)
    FROM public.matches m JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE t.league_id = l_id AND t.status = 'completed' AND COALESCE(t.deleted, false) = false
      AND t.season_id IS NULL
      AND m.status = 'completed' AND m.player2_id IS NOT NULL
  ),
  legs AS (
    SELECT player_id, SUM(won)::int AS won, SUM(lost)::int AS lost FROM leg_rows GROUP BY player_id
  ),
  manual AS (
    SELECT player_id, COALESCE(manual_points, 0) AS manual_points
    FROM public.league_leaderboard WHERE league_id = l_id
  ),
  players AS (
    SELECT player_id FROM agg
    UNION
    SELECT player_id FROM manual WHERE manual_points > 0
  )
  INSERT INTO public.league_leaderboard
    (league_id, player_id, total_points, manual_points, tournaments_played,
     best_placement, worst_placement, avg_placement, last_tournament_at,
     legs_won, legs_lost, updated_at)
  SELECT l_id, pl.player_id,
         COALESCE(a.pts, 0) + COALESCE(mn.manual_points, 0),
         COALESCE(mn.manual_points, 0),
         COALESCE(a.played, 0),
         a.best, a.worst, a.avgp, a.last_at,
         COALESCE(lg.won, 0), COALESCE(lg.lost, 0), now()
  FROM players pl
  LEFT JOIN agg    a  ON a.player_id  = pl.player_id
  LEFT JOIN manual mn ON mn.player_id = pl.player_id
  LEFT JOIN legs   lg ON lg.player_id = pl.player_id
  ON CONFLICT (league_id, player_id) DO UPDATE
  SET total_points       = EXCLUDED.total_points,
      manual_points      = EXCLUDED.manual_points,
      tournaments_played = EXCLUDED.tournaments_played,
      best_placement     = EXCLUDED.best_placement,
      worst_placement    = EXCLUDED.worst_placement,
      avg_placement      = EXCLUDED.avg_placement,
      last_tournament_at = EXCLUDED.last_tournament_at,
      legs_won           = EXCLUDED.legs_won,
      legs_lost          = EXCLUDED.legs_lost,
      updated_at         = now();

  -- Ghost rows: no results in a live current-season tournament and no manual points.
  DELETE FROM public.league_leaderboard lb
  WHERE lb.league_id = l_id
    AND COALESCE(lb.manual_points, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.league_tournament_results r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.league_id = l_id AND r.player_id = lb.player_id
        AND COALESCE(t.deleted, false) = false AND t.season_id IS NULL
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rebuild_league_leaderboard(uuid) FROM PUBLIC, anon, authenticated;

-- The app's Recalculate: rebuild on the server instead of aggregating on the device.
CREATE OR REPLACE FUNCTION public.refresh_league_leaderboard(l_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  PERFORM public.rebuild_league_leaderboard(l_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_league_leaderboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_league_leaderboard(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Old apps write the leaderboard cache themselves, summed over ALL rounds
-- of the league (leagueService.updateLeaderboardCache in <= 1.7.0). Any
-- direct client write is followed by a server rebuild in the same statement,
-- which keeps the client's manual_points and recomputes everything else for
-- the current season (and prunes rows the client created for players with
-- archived results only). Writes made inside SECURITY DEFINER functions run
-- as the owner, so the WHEN clause skips them and nothing recurses.
-- Transition tables allow one event per trigger, hence two triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.league_leaderboard_server_totals()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  l uuid;
BEGIN
  FOR l IN SELECT DISTINCT league_id FROM changed WHERE league_id IS NOT NULL LOOP
    PERFORM public.rebuild_league_leaderboard(l);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.league_leaderboard_server_totals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS league_leaderboard_server_totals_ins ON public.league_leaderboard;
CREATE TRIGGER league_leaderboard_server_totals_ins
  AFTER INSERT ON public.league_leaderboard
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT
  WHEN (current_user IN ('authenticated', 'anon'))
  EXECUTE FUNCTION public.league_leaderboard_server_totals();

DROP TRIGGER IF EXISTS league_leaderboard_server_totals_upd ON public.league_leaderboard;
CREATE TRIGGER league_leaderboard_server_totals_upd
  AFTER UPDATE ON public.league_leaderboard
  REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT
  WHEN (current_user IN ('authenticated', 'anon'))
  EXECUTE FUNCTION public.league_leaderboard_server_totals();

-- ---------------------------------------------------------------------------
-- 5. End the current season (atomic). Any league manager (owner or
-- co-manager) may do it: co-managers can already delete rounds and the
-- league itself, and this deletes nothing — an admin can undo it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_league_season(l_id uuid, ended_name text, next_name text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  lrow RECORD;
  sid  uuid;
  nm   text := btrim(COALESCE(ended_name, ''));
  nx   text := NULLIF(btrim(COALESCE(next_name, '')), '');
  n    int;
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF nm = '' OR char_length(nm) > 100 OR char_length(COALESCE(nx, '')) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_name');
  END IF;

  -- Serialises concurrent rollovers (and double taps) of this league.
  SELECT l.id, l.created_at, l.season_started_at INTO lrow
  FROM public.leagues l
  WHERE l.id = l_id AND COALESCE(l.deleted, false) = false
  FOR UPDATE;
  IF lrow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'league_not_found');
  END IF;

  -- A round still being played would otherwise score into the wrong season.
  IF EXISTS (SELECT 1 FROM public.tournaments t
             WHERE t.league_id = l_id AND t.season_id IS NULL AND COALESCE(t.deleted, false) = false
               AND t.status IN ('started', 'in_progress', 'active')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_in_progress');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments t
                 WHERE t.league_id = l_id AND t.season_id IS NULL AND COALESCE(t.deleted, false) = false
                   AND t.status = 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'empty_season');
  END IF;

  -- Snapshot what the server says, not whatever the cache holds.
  PERFORM public.rebuild_league_leaderboard(l_id);

  INSERT INTO public.league_seasons (league_id, name, started_at, ended_by, standings)
  SELECT l_id, nm, COALESCE(lrow.season_started_at, lrow.created_at), (SELECT auth.uid()),
         COALESCE(jsonb_agg(jsonb_build_object(
           'rank', s.rank, 'player_id', s.player_id, 'name', s.name,
           'points', s.total_points, 'manual_points', s.manual_points,
           'played', s.tournaments_played, 'legs_won', s.legs_won, 'legs_lost', s.legs_lost,
           'best', s.best_placement, 'avg', s.avg_placement) ORDER BY s.rank), '[]'::jsonb)
  FROM (
    -- Same order as the app's leaderboard: points, leg difference, legs won.
    SELECT lb.*, p.name,
           row_number() OVER (ORDER BY COALESCE(lb.total_points, 0) DESC,
                                       COALESCE(lb.legs_won, 0) - COALESCE(lb.legs_lost, 0) DESC,
                                       COALESCE(lb.legs_won, 0) DESC, p.name) AS rank
    FROM public.league_leaderboard lb
    JOIN public.players p ON p.id = lb.player_id
    WHERE lb.league_id = l_id
  ) s
  RETURNING id INTO sid;

  -- Finished (and soft-deleted) rounds belong to the ended season; rounds
  -- open for registration were set up for the next one.
  UPDATE public.tournaments t
  SET season_id = sid
  WHERE t.league_id = l_id AND t.season_id IS NULL
    AND (t.status = 'completed' OR COALESCE(t.deleted, false));
  GET DIAGNOSTICS n = ROW_COUNT;

  -- The live table restarts; its last state (incl. manual points) is in the snapshot.
  DELETE FROM public.league_leaderboard WHERE league_id = l_id;

  UPDATE public.leagues
  SET season_name = nx, season_started_at = now(), updated_at = now()
  WHERE id = l_id;

  RETURN jsonb_build_object('success', true, 'season_id', sid, 'rounds', n);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.end_league_season(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_league_season(uuid, text, text) TO authenticated;

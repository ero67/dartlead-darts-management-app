-- 1. set_playoff_match_players(): manual bracket edits done atomically.
--    Editing a playoff match's players used to rewrite the whole playoffs
--    JSONB from the manager's device — the same last-writer-wins race that
--    lost semifinal players when boards finished at the same time. Now the
--    row is locked and only the edited match changes.
--
-- 2. record_league_tournament_results() + rebuild_league_leaderboard():
--    league points used to be written by the device that finished the last
--    match, under RLS that only lets LEAGUE MANAGERS write results and the
--    leaderboard. A scorer finishing the final therefore failed silently and
--    the league table stayed stale until someone pressed Recalculate.
--    Placements are still computed in the app (leagueService.extractPlacements
--    knows the bracket and standings rules); this RPC lets any authorised
--    scorer of the tournament persist them, and rebuilds the leaderboard
--    cache server-side with the same aggregation updateLeaderboardCache used.
--
-- 3. Realtime for tournaments / tournament_players / tournament_registrations
--    so other devices see bracket edits, settings and registrations without
--    reloading (the client re-fetches the tournament on any change).

-- ---------------------------------------------------------------------------
-- 1. Bracket edit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_playoff_match_players(
  t_id uuid,
  m_id uuid,
  p1 jsonb,
  p2 jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow          RECORD;
  po            jsonb;
  rounds        jsonb;
  round_matches jsonb;
  match         jsonb;
  ri            int := -1;
  mi            int := -1;
  r             int;
  m             int;
  p1n           jsonb;
  p2n           jsonb;
BEGIN
  IF NOT public.can_manage_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Normalise "no player" to JSON null (what the app stores for empty slots).
  p1n := CASE WHEN p1 IS NULL OR jsonb_typeof(p1) <> 'object' THEN 'null'::jsonb ELSE p1 END;
  p2n := CASE WHEN p2 IS NULL OR jsonb_typeof(p2) <> 'object' THEN 'null'::jsonb ELSE p2 END;
  IF p1n ->> 'id' IS NOT NULL AND p1n ->> 'id' = p2n ->> 'id' THEN
    RETURN jsonb_build_object('success', false, 'error', 'same_player');
  END IF;

  SELECT t.id, t.playoffs INTO trow
  FROM public.tournaments t WHERE t.id = t_id FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;

  po := trow.playoffs;
  rounds := po -> 'rounds';
  IF po IS NULL OR rounds IS NULL OR jsonb_typeof(rounds) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_playoffs');
  END IF;

  FOR r IN 0 .. jsonb_array_length(rounds) - 1 LOOP
    round_matches := rounds -> r -> 'matches';
    CONTINUE WHEN round_matches IS NULL OR jsonb_typeof(round_matches) <> 'array';
    FOR m IN 0 .. jsonb_array_length(round_matches) - 1 LOOP
      IF round_matches -> m ->> 'id' = m_id::text THEN
        ri := r; mi := m; EXIT;
      END IF;
    END LOOP;
    EXIT WHEN ri <> -1;
  END LOOP;
  IF ri = -1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Editing players always resets the match to pending (a single player is a
  -- bye, advanced separately) and drops any previous result.
  match := (rounds -> ri -> 'matches' -> mi)
           || jsonb_build_object('player1', p1n, 'player2', p2n, 'status', 'pending', 'result', 'null'::jsonb);
  rounds := jsonb_set(rounds, ARRAY[ri::text, 'matches', mi::text], match);
  po := jsonb_set(po, ARRAY['rounds'], rounds);

  UPDATE public.tournaments SET playoffs = po, updated_at = now() WHERE id = t_id;

  -- Keep an existing matches row in step (rows are created lazily on first
  -- start, so there may be none yet — that is fine).
  UPDATE public.matches
  SET player1_id = (p1n ->> 'id')::uuid,
      player2_id = (p2n ->> 'id')::uuid,
      status = 'pending',
      winner_id = NULL,
      player1_legs = 0,
      player2_legs = 0,
      result = NULL,
      updated_at = now()
  WHERE id = m_id AND tournament_id = t_id;

  RETURN jsonb_build_object('success', true, 'playoffs', po);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_playoff_match_players(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_playoff_match_players(uuid, uuid, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. League results + leaderboard cache
-- ---------------------------------------------------------------------------

-- Same aggregation as leagueService.updateLeaderboardCache(): points and
-- placements from results of non-deleted tournaments, legs from completed
-- matches of completed league tournaments, manual_points preserved, players
-- with neither results nor manual points pruned.
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
    WHERE r.league_id = l_id AND COALESCE(t.deleted, false) = false
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
      AND m.status = 'completed' AND m.player1_id IS NOT NULL
    UNION ALL
    SELECT m.player2_id, COALESCE(m.player2_legs, 0), COALESCE(m.player1_legs, 0)
    FROM public.matches m JOIN public.tournaments t ON t.id = m.tournament_id
    WHERE t.league_id = l_id AND t.status = 'completed' AND COALESCE(t.deleted, false) = false
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

  -- Ghost rows: no results in a live tournament and no manual points.
  DELETE FROM public.league_leaderboard lb
  WHERE lb.league_id = l_id
    AND COALESCE(lb.manual_points, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.league_tournament_results r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.league_id = l_id AND r.player_id = lb.player_id
        AND COALESCE(t.deleted, false) = false
    );
END;
$$;

-- Internal: only callable through the SECURITY DEFINER RPC below (and by the
-- owner). Managers rebuild through the app's existing Recalculate path.
REVOKE EXECUTE ON FUNCTION public.rebuild_league_leaderboard(uuid) FROM PUBLIC, anon, authenticated;

-- results: [{ "player_id": uuid, "placement": int, "points_awarded": int }, ...]
CREATE OR REPLACE FUNCTION public.record_league_tournament_results(t_id uuid, results jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  trow RECORD;
  n    int;
BEGIN
  IF NOT public.can_score_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF results IS NULL OR jsonb_typeof(results) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'bad_results');
  END IF;

  SELECT t.id, t.league_id, t.status INTO trow
  FROM public.tournaments t WHERE t.id = t_id FOR UPDATE;
  IF trow IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
  END IF;
  IF trow.league_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_in_league');
  END IF;
  IF trow.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_completed');
  END IF;

  INSERT INTO public.league_tournament_results (league_id, tournament_id, player_id, placement, points_awarded)
  SELECT trow.league_id, t_id, x.player_id, x.placement, COALESCE(x.points_awarded, 0)
  FROM jsonb_to_recordset(results) AS x(player_id uuid, placement int, points_awarded int)
  WHERE x.player_id IS NOT NULL AND x.placement IS NOT NULL
  ON CONFLICT (league_id, tournament_id, player_id) DO UPDATE
  SET placement = EXCLUDED.placement,
      points_awarded = EXCLUDED.points_awarded,
      updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.tournaments SET league_points_calculated = true WHERE id = t_id;

  PERFORM public.rebuild_league_leaderboard(trow.league_id);

  RETURN jsonb_build_object('success', true, 'count', n);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_league_tournament_results(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_league_tournament_results(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Realtime: clients re-fetch the open tournament on any change to these.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY ARRAY['tournaments', 'tournament_players', 'tournament_registrations'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- The tournament and league lists show what a round or league is about, not
-- just counts: who won a finished round, who leads a league and when its next
-- round is planned.
--
-- 1. get_tournaments_summary gains winner_id and winner_name. The winner is
--    the winner of the final (highest playoff_round, playoff_match_number 1),
--    else the league-recorded 1st place, as on the player profile
--    (tournamentService.getPlayerProfile). Only completed rounds have one.
-- 2. get_leagues_summary gains leader_name, leader_points (league_leaderboard
--    order: points, then leg difference, then legs won; only with points > 0)
--    and next_round_at (the soonest planned round that has not started).
--
-- Both only gain trailing columns, so installed Android apps keep working.
-- RETURNS TABLE changes need DROP + CREATE. Idempotent.

DROP FUNCTION IF EXISTS public.get_tournaments_summary();

CREATE FUNCTION public.get_tournaments_summary()
  RETURNS TABLE (
    id                  uuid,
    name                text,
    status              text,
    legs_to_win         integer,
    starting_score      integer,
    group_settings      jsonb,
    playoff_settings    jsonb,
    tournament_type     text,
    league_id           uuid,
    user_id             uuid,
    created_at          timestamp with time zone,
    updated_at          timestamp with time zone,
    group_count         bigint,
    player_count        bigint,
    total_matches       bigint,
    completed_matches   bigint,
    pending_matches     bigint,
    in_progress_matches bigint,
    game_type           text,
    starts_at           timestamp with time zone,
    venue               text,
    winner_id           uuid,
    winner_name         text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = 'public'
  AS $function$
    SELECT
        t.id,
        t.name::TEXT,
        t.status::TEXT,
        t.legs_to_win,
        t.starting_score,
        -- group_settings is stored as JSONB in some rows and TEXT in others;
        -- coerce to JSONB defensively so the client always gets JSON.
        CASE
            WHEN t.group_settings IS NULL THEN NULL
            WHEN pg_typeof(t.group_settings) = 'jsonb'::regtype THEN t.group_settings
            ELSE t.group_settings::TEXT::JSONB
        END AS group_settings,
        t.playoff_settings,
        t.tournament_type::TEXT,
        t.league_id,
        t.user_id,
        t.created_at,
        t.updated_at,
        COALESCE(g.group_count, 0) AS group_count,
        COALESCE(tp.player_count, 0) AS player_count,
        COALESCE(m.total_matches, 0) AS total_matches,
        COALESCE(m.completed_matches, 0) AS completed_matches,
        COALESCE(m.pending_matches, 0) AS pending_matches,
        COALESCE(m.in_progress_matches, 0) AS in_progress_matches,
        t.game_type,
        t.starts_at,
        t.venue,
        w.winner_id,
        wp.name::TEXT AS winner_name
    FROM tournaments t
    LEFT JOIN (
        SELECT tournament_id, COUNT(*) AS group_count
        FROM groups
        GROUP BY tournament_id
    ) g ON g.tournament_id = t.id
    LEFT JOIN (
        SELECT tournament_id, COUNT(*) AS player_count
        FROM tournament_players
        GROUP BY tournament_id
    ) tp ON tp.tournament_id = t.id
    LEFT JOIN (
        SELECT
            tournament_id,
            COUNT(*) AS total_matches,
            COUNT(*) FILTER (WHERE status = 'completed')   AS completed_matches,
            COUNT(*) FILTER (WHERE status = 'pending')     AS pending_matches,
            COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_matches
        FROM matches
        GROUP BY tournament_id
    ) m ON m.tournament_id = t.id
    LEFT JOIN LATERAL (
        SELECT COALESCE(
            (SELECT f.winner_id FROM matches f
             WHERE f.tournament_id = t.id AND f.playoff_round IS NOT NULL
               AND COALESCE(f.playoff_match_number, 1) = 1
             ORDER BY f.playoff_round DESC
             LIMIT 1),
            (SELECT r.player_id FROM league_tournament_results r
             WHERE r.tournament_id = t.id AND r.placement = 1
             LIMIT 1)
        ) AS winner_id
    ) w ON t.status = 'completed'
    LEFT JOIN players wp ON wp.id = w.winner_id
    WHERE t.deleted = FALSE
    ORDER BY t.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_tournaments_summary() TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_leagues_summary();

CREATE FUNCTION public.get_leagues_summary()
  RETURNS TABLE (
    league_id        uuid,
    member_count     bigint,
    tournament_count bigint,
    leader_name      text,
    leader_points    integer,
    next_round_at    timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $$
  SELECT
    l.id,
    (SELECT count(*) FROM public.league_members lm
      WHERE lm.league_id = l.id AND lm.left_at IS NULL),
    (SELECT count(*) FROM public.tournaments t
      WHERE t.league_id = l.id AND t.deleted = false),
    lead.name::text,
    lead.total_points,
    (SELECT min(t.starts_at) FROM public.tournaments t
      WHERE t.league_id = l.id AND t.deleted = false
        AND t.status = 'open_for_registration' AND t.starts_at > now())
  FROM public.leagues l
  LEFT JOIN LATERAL (
    SELECT p.name, lb.total_points
    FROM public.league_leaderboard lb
    JOIN public.players p ON p.id = lb.player_id
    WHERE lb.league_id = l.id AND COALESCE(lb.total_points, 0) > 0
    ORDER BY lb.total_points DESC,
             COALESCE(lb.legs_won, 0) - COALESCE(lb.legs_lost, 0) DESC,
             COALESCE(lb.legs_won, 0) DESC
    LIMIT 1
  ) lead ON true
  WHERE l.deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_leagues_summary() TO anon, authenticated;

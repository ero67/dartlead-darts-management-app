-- Lightweight tournaments list summary.
--
-- The tournaments list / dashboard only needs per-tournament AGGREGATES
-- (progress %, group count, active-match badge) -- never the nested match
-- rows. Previously the client fetched every group/match/player across ALL
-- tournaments and filtered in JS, which silently truncated at Supabase's
-- 1000-row default once the data grew (the "only 1 match shows" bug).
--
-- This function returns one row per non-deleted tournament with the base
-- columns the list needs plus cheap COUNT aggregates computed in the DB.
-- Full groups/matches are loaded lazily only when a single tournament is
-- opened (see getTournament(id) in tournamentService.js).
--
-- Public viewing is enabled (see enable-public-viewing.sql), so this is
-- granted to both anon and authenticated.

CREATE OR REPLACE FUNCTION get_tournaments_summary()
RETURNS TABLE (
    id UUID,
    name TEXT,
    status TEXT,
    legs_to_win INTEGER,
    starting_score INTEGER,
    group_settings JSONB,
    playoff_settings JSONB,
    tournament_type TEXT,
    league_id UUID,
    user_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    group_count BIGINT,
    player_count BIGINT,
    total_matches BIGINT,
    completed_matches BIGINT,
    pending_matches BIGINT,
    in_progress_matches BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
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
        COALESCE(m.in_progress_matches, 0) AS in_progress_matches
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
    WHERE t.deleted = FALSE
    ORDER BY t.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_tournaments_summary() TO anon, authenticated;

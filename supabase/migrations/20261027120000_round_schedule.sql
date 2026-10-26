-- Dates and venues for rounds: organisers plan when and where each round
-- (tournament) is played, players see what is coming up.
--
-- Installed Android apps (1.7.0) read tournaments with select('*') and call
-- get_tournaments_summary(); both only gain nullable columns here, so old
-- clients keep working. The league's default venue lives in the existing
-- leagues.default_tournament_settings JSONB (key "venue"), no new column.
-- Idempotent so it can be re-applied safely.

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS venue text;

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_venue_length_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_venue_length_check
  CHECK (venue IS NULL OR char_length(venue) <= 200);

-- The list view sorts and filters upcoming rounds client-side from this RPC.
-- RETURNS TABLE gains two trailing columns, which needs DROP + CREATE; the
-- existing columns keep their names, types and order for old callers.
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
    venue               text
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
        t.venue
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_tournaments_summary() TO anon, authenticated, service_role;

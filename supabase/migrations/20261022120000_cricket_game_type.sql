-- Cricket as a second game type. Additive only: installed Android apps keep
-- talking to this database, and every existing row stays 'x01'.
--
-- 1. tournaments.game_type is the source of truth ('x01' | 'cricket').
-- 2. matches.game_type is a copy, set by a BEFORE INSERT trigger from the
--    tournament: old apps, startTournament and complete_playoff_match insert
--    matches without it. matches.live_state holds the Cricket marks of the
--    match in progress (null for X01).
-- 3. practice_sessions accepts 'cricket'.
-- 4. get_tournaments_summary() also returns game_type (the RETURNS TABLE
--    changes, so it is dropped and recreated; otherwise identical to
--    20260827181008 plus the search_path from 20260827184510).

-- ---------------------------------------------------------------------------
-- 1 + 2. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.tournaments
  ADD COLUMN game_type text NOT NULL DEFAULT 'x01'
    CONSTRAINT tournaments_game_type_check CHECK (game_type IN ('x01', 'cricket'));

ALTER TABLE public.matches
  ADD COLUMN game_type text NOT NULL DEFAULT 'x01'
    CONSTRAINT matches_game_type_check CHECK (game_type IN ('x01', 'cricket')),
  ADD COLUMN live_state jsonb;

COMMENT ON COLUMN public.tournaments.game_type IS 'x01 or cricket; one game type per tournament';
COMMENT ON COLUMN public.matches.game_type IS 'Copied from the tournament on insert (trigger matches_inherit_game_type)';
COMMENT ON COLUMN public.matches.live_state IS 'Cricket only: marks/points/visit of the match in progress; null for x01';

-- The tournament always wins over whatever the client sent, so a match can
-- never disagree with its tournament.
CREATE OR REPLACE FUNCTION public.matches_inherit_game_type()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NEW.tournament_id IS NOT NULL THEN
    SELECT t.game_type INTO NEW.game_type
    FROM public.tournaments t WHERE t.id = NEW.tournament_id;
  END IF;
  NEW.game_type := COALESCE(NEW.game_type, 'x01');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.matches_inherit_game_type() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER matches_inherit_game_type
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_inherit_game_type();

-- ---------------------------------------------------------------------------
-- 3. Practice sessions (inline CHECK from 20260907120000, auto-named)
-- ---------------------------------------------------------------------------
ALTER TABLE public.practice_sessions DROP CONSTRAINT practice_sessions_game_check;
ALTER TABLE public.practice_sessions ADD CONSTRAINT practice_sessions_game_check
  CHECK (game IN ('x01', 'checkout', 'oneTwentyOne', 'aroundTheClock', 'cricket'));

-- ---------------------------------------------------------------------------
-- 4. Tournament list summary
-- ---------------------------------------------------------------------------
DROP FUNCTION public.get_tournaments_summary();

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
    game_type           text
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
        t.game_type
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

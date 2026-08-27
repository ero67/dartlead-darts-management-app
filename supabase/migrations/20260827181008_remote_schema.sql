SET local check_function_bodies = off;

CREATE TABLE "public"."dart_throws" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "leg_id"       uuid,
  "player_id"    uuid,
  "throw_number" integer                  NOT NULL,
  "dart1_score"  integer,
  "dart2_score"  integer,
  "dart3_score"  integer,
  "total_score"  integer,
  "is_bust"      boolean                  DEFAULT false,
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "dart_throws_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."dart_throws"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."group_players" (
  "group_id"  uuid NOT NULL,
  "player_id" uuid NOT NULL,
  CONSTRAINT "group_players_pkey" PRIMARY KEY (group_id, player_id)
);

ALTER TABLE "public"."group_players"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."group_standings" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "group_id"       uuid,
  "player_id"      uuid,
  "position"       integer                  NOT NULL,
  "matches_played" integer                  DEFAULT 0,
  "matches_won"    integer                  DEFAULT 0,
  "matches_lost"   integer                  DEFAULT 0,
  "legs_won"       integer                  DEFAULT 0,
  "legs_lost"      integer                  DEFAULT 0,
  "points"         integer                  DEFAULT 0,
  "average"        numeric(5,2)             DEFAULT 0,
  "created_at"     timestamp with time zone DEFAULT now(),
  "updated_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "group_standings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."group_standings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."groups" (
  "id"            uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "tournament_id" uuid,
  "name"          character varying(100)   NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now(),
  CONSTRAINT "groups_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."groups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."league_leaderboard" (
  "id"                 uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "league_id"          uuid,
  "player_id"          uuid,
  "total_points"       integer                  DEFAULT 0,
  "tournaments_played" integer                  DEFAULT 0,
  "best_placement"     integer,
  "worst_placement"    integer,
  "avg_placement"      numeric(5,2),
  "last_tournament_at" timestamp with time zone,
  "updated_at"         timestamp with time zone DEFAULT now(),
  "manual_points"      integer                  NOT NULL DEFAULT 0,
  "legs_won"           integer                  DEFAULT 0,
  "legs_lost"          integer                  DEFAULT 0,
  CONSTRAINT "league_leaderboard_league_id_player_id_key" UNIQUE (league_id, player_id),
  CONSTRAINT "league_leaderboard_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."league_leaderboard"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."league_members" (
  "id"        uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "league_id" uuid,
  "player_id" uuid,
  "role"      character varying(50)    DEFAULT 'player'::character varying,
  "is_active" boolean                  DEFAULT true,
  "joined_at" timestamp with time zone DEFAULT now(),
  "left_at"   timestamp with time zone,
  CONSTRAINT "league_members_league_id_player_id_key" UNIQUE (league_id, player_id),
  CONSTRAINT "league_members_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."league_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."league_tournament_results" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "league_id"      uuid,
  "tournament_id"  uuid,
  "player_id"      uuid,
  "placement"      integer                  NOT NULL,
  "points_awarded" integer                  DEFAULT 0,
  "notes"          text,
  "created_at"     timestamp with time zone DEFAULT now(),
  "updated_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "league_tournament_results_league_id_tournament_id_player_id_key" UNIQUE (league_id, tournament_id, player_id),
  CONSTRAINT "league_tournament_results_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."league_tournament_results"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."leagues" (
  "id"                          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"                        character varying(255)   NOT NULL,
  "description"                 text,
  "status"                      character varying(50)    DEFAULT 'active'::character varying,
  "manager_ids"                 uuid[]                   DEFAULT ARRAY[]::uuid[],
  "created_by"                  uuid,
  "default_tournament_settings" jsonb,
  "scoring_rules"               jsonb                    DEFAULT '{"placementPoints": {"1": 12, "2": 9, "3": 7, "4": 5, "5": 3, "default": 1}, "allowManualOverride": true}'::jsonb,
  "deleted"                     boolean                  DEFAULT false,
  "created_at"                  timestamp with time zone DEFAULT now(),
  "updated_at"                  timestamp with time zone DEFAULT now(),
  CONSTRAINT "leagues_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."leagues"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."legs" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "match_id"         uuid,
  "leg_number"       integer                  NOT NULL,
  "player1_id"       uuid,
  "player2_id"       uuid,
  "winner_id"        uuid,
  "player1_score"    integer                  DEFAULT 501,
  "player2_score"    integer                  DEFAULT 501,
  "player1_darts"    integer                  DEFAULT 0,
  "player2_darts"    integer                  DEFAULT 0,
  "player1_average"  numeric(5,2)             DEFAULT 0,
  "player2_average"  numeric(5,2)             DEFAULT 0,
  "player1_checkout" character varying(50),
  "player2_checkout" character varying(50),
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "legs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."legs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."match_player_stats" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "match_id"         uuid,
  "player_id"        uuid,
  "legs_won"         integer                  DEFAULT 0,
  "legs_lost"        integer                  DEFAULT 0,
  "total_darts"      integer                  DEFAULT 0,
  "total_score"      integer                  DEFAULT 0,
  "average"          numeric(5,2)             DEFAULT 0,
  "highest_checkout" integer                  DEFAULT 0,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "match_player_stats_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."match_player_stats"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."matches" (
  "id"                    uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "group_id"              uuid,
  "player1_id"            uuid,
  "player2_id"            uuid,
  "winner_id"             uuid,
  "started_by_user_id"    uuid,
  "status"                character varying(50)    DEFAULT 'pending'::character varying,
  "player1_legs"          integer                  DEFAULT 0,
  "player2_legs"          integer                  DEFAULT 0,
  "legs_to_win"           integer                  DEFAULT 3,
  "starting_score"        integer                  DEFAULT 501,
  "is_playoff"            boolean                  DEFAULT false,
  "playoff_round"         integer,
  "playoff_match_number"  integer,
  "created_at"            timestamp with time zone DEFAULT now(),
  "updated_at"            timestamp with time zone DEFAULT now(),
  "current_leg"           integer                  DEFAULT 1,
  "player1_current_score" integer                  DEFAULT 501,
  "player2_current_score" integer                  DEFAULT 501,
  "current_player"        integer                  DEFAULT 0,
  "last_activity_at"      timestamp with time zone DEFAULT now(),
  "live_device_id"        character varying(255),
  "live_started_at"       timestamp with time zone,
  "result"                jsonb,
  "tournament_id"         uuid,
  "live_device_name"      character varying(100),
  "live_board_number"     integer,
  CONSTRAINT "matches_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."matches"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."matches"
  REPLICA IDENTITY FULL;

CREATE TABLE "public"."players" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"       character varying(255)   NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "players_name_key" UNIQUE (name),
  CONSTRAINT "players_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."players"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tournament_players" (
  "tournament_id" uuid NOT NULL,
  "player_id"     uuid NOT NULL,
  CONSTRAINT "tournament_players_pkey" PRIMARY KEY (tournament_id, player_id)
);

ALTER TABLE "public"."tournament_players"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tournament_stats" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "tournament_id"    uuid,
  "player_id"        uuid,
  "matches_played"   integer                  DEFAULT 0,
  "matches_won"      integer                  DEFAULT 0,
  "matches_lost"     integer                  DEFAULT 0,
  "legs_won"         integer                  DEFAULT 0,
  "legs_lost"        integer                  DEFAULT 0,
  "total_darts"      integer                  DEFAULT 0,
  "total_score"      integer                  DEFAULT 0,
  "average"          numeric(5,2)             DEFAULT 0,
  "highest_checkout" integer                  DEFAULT 0,
  "final_position"   integer,
  "created_at"       timestamp with time zone DEFAULT now(),
  "updated_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "tournament_stats_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tournament_stats"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tournaments" (
  "id"                       uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"                     character varying(255)   NOT NULL,
  "legs_to_win"              integer                  DEFAULT 3,
  "starting_score"           integer                  DEFAULT 501,
  "group_settings"           jsonb,
  "playoff_settings"         jsonb,
  "playoffs"                 jsonb,
  "user_id"                  uuid,
  "status"                   character varying(50)    DEFAULT 'active'::character varying,
  "created_at"               timestamp with time zone DEFAULT now(),
  "updated_at"               timestamp with time zone DEFAULT now(),
  "deleted"                  boolean                  DEFAULT false,
  "tournament_type"          text                     DEFAULT 'groups_with_playoffs'::text,
  "league_id"                uuid,
  "league_points_calculated" boolean                  DEFAULT false,
  CONSTRAINT "tournaments_pkey" PRIMARY KEY (id),
  CONSTRAINT "tournaments_tournament_type_check" CHECK ((tournament_type = ANY (ARRAY['groups_with_playoffs'::text, 'playoff_only'::text])))
);

ALTER TABLE "public"."tournaments"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_all_users()
  RETURNS TABLE (
    id         uuid,
    email      text,
    full_name  text,
    role       text,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  caller_record RECORD;
BEGIN
  -- Get the caller's user record
  SELECT * INTO caller_record
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Check if caller is admin
  IF caller_record IS NULL OR (
    COALESCE(caller_record.raw_user_meta_data->>'role', '') != 'admin' AND
    COALESCE(caller_record.raw_app_meta_data->>'role', '') != 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can view all users';
  END IF;

  -- Return all users
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      NULL
    )::TEXT as full_name,
    COALESCE(
      u.raw_user_meta_data->>'role',
      u.raw_app_meta_data->>'role',
      'user'
    )::TEXT as role,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC
  LIMIT 1000;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tournaments_summary()
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
    in_progress_matches bigint
  )
  LANGUAGE sql
  SECURITY DEFINER
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
$function$;

CREATE OR REPLACE FUNCTION public.get_users_by_role (
  role_name text
)
  RETURNS TABLE (
    id         uuid,
    email      text,
    full_name  text,
    role       text,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      NULL
    )::TEXT as full_name,
    COALESCE(
      u.raw_user_meta_data->>'role',
      u.raw_app_meta_data->>'role',
      NULL
    )::TEXT as role,
    u.created_at
  FROM auth.users u
  WHERE 
    (u.raw_user_meta_data->>'role' = role_name)
    OR (u.raw_app_meta_data->>'role' = role_name)
  ORDER BY u.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  AS $function$
DECLARE
  user_record RECORD;
BEGIN
  -- Get current user's metadata
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = auth.uid();

  -- Check if user exists and has admin role
  IF user_record IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check multiple metadata locations for admin role
  RETURN (
    COALESCE(user_record.raw_user_meta_data->>'role', '') = 'admin' OR
    COALESCE(user_record.raw_app_meta_data->>'role', '') = 'admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_role (
  user_email text,
  user_role  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  user_record RECORD;
  result JSONB;
BEGIN
  -- Find user by email
  SELECT * INTO user_record
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  -- If user not found, return error
  IF user_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Update user metadata with role
  IF user_role IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      to_jsonb(user_role)
    )
    WHERE id = user_record.id;
  ELSE
    -- Remove role if user_role is NULL
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data - 'role'
    WHERE id = user_record.id;
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_record.id,
    'email', user_record.email,
    'role', user_role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_user_role_secure (
  user_email text,
  user_role  text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  user_record RECORD;
  caller_record RECORD;
  result JSONB;
BEGIN
  -- Get the caller's user record
  SELECT * INTO caller_record
  FROM auth.users
  WHERE id = auth.uid();

  -- Check if caller is admin
  IF caller_record IS NULL OR (
    COALESCE(caller_record.raw_user_meta_data->>'role', '') != 'admin' AND
    COALESCE(caller_record.raw_app_meta_data->>'role', '') != 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only administrators can set user roles'
    );
  END IF;

  -- Find user by email
  SELECT * INTO user_record
  FROM auth.users
  WHERE email = user_email
  LIMIT 1;

  -- If user not found, return error
  IF user_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Update user metadata with role
  IF user_role IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      to_jsonb(user_role)
    )
    WHERE id = user_record.id;
  ELSE
    -- Remove role if user_role is NULL
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data - 'role'
    WHERE id = user_record.id;
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_record.id,
    'email', user_record.email,
    'role', user_role
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

ALTER TABLE "public"."group_players"
  ADD CONSTRAINT "group_players_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."group_standings"
  ADD CONSTRAINT "group_standings_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."leagues"
  ADD CONSTRAINT "leagues_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."league_leaderboard"
  ADD CONSTRAINT "league_leaderboard_league_id_fkey" FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;

ALTER TABLE "public"."league_members"
  ADD CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;

ALTER TABLE "public"."league_tournament_results"
  ADD CONSTRAINT "league_tournament_results_league_id_fkey" FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE CASCADE;

ALTER TABLE "public"."dart_throws"
  ADD CONSTRAINT "dart_throws_leg_id_fkey" FOREIGN KEY (leg_id) REFERENCES public.legs(id) ON DELETE CASCADE;

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."legs"
  ADD CONSTRAINT "legs_match_id_fkey" FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE "public"."match_player_stats"
  ADD CONSTRAINT "match_player_stats_match_id_fkey" FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_started_by_user_id_fkey" FOREIGN KEY (started_by_user_id) REFERENCES auth.users(id);

ALTER TABLE "public"."dart_throws"
  ADD CONSTRAINT "dart_throws_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id);

ALTER TABLE "public"."group_players"
  ADD CONSTRAINT "group_players_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE "public"."group_standings"
  ADD CONSTRAINT "group_standings_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id);

ALTER TABLE "public"."league_leaderboard"
  ADD CONSTRAINT "league_leaderboard_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE "public"."league_members"
  ADD CONSTRAINT "league_members_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE "public"."league_tournament_results"
  ADD CONSTRAINT "league_tournament_results_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE "public"."legs"
  ADD CONSTRAINT "legs_player1_id_fkey" FOREIGN KEY (player1_id) REFERENCES public.players(id);

ALTER TABLE "public"."legs"
  ADD CONSTRAINT "legs_player2_id_fkey" FOREIGN KEY (player2_id) REFERENCES public.players(id);

ALTER TABLE "public"."legs"
  ADD CONSTRAINT "legs_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.players(id);

ALTER TABLE "public"."match_player_stats"
  ADD CONSTRAINT "match_player_stats_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id);

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_player1_id_fkey" FOREIGN KEY (player1_id) REFERENCES public.players(id);

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_player2_id_fkey" FOREIGN KEY (player2_id) REFERENCES public.players(id);

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.players(id);

ALTER TABLE "public"."tournament_players"
  ADD CONSTRAINT "tournament_players_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE "public"."tournament_stats"
  ADD CONSTRAINT "tournament_stats_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id);

ALTER TABLE "public"."tournaments"
  ADD CONSTRAINT "tournaments_league_id_fkey" FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE SET NULL;

ALTER TABLE "public"."groups"
  ADD CONSTRAINT "groups_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE "public"."league_tournament_results"
  ADD CONSTRAINT "league_tournament_results_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE "public"."tournament_players"
  ADD CONSTRAINT "tournament_players_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE "public"."tournament_stats"
  ADD CONSTRAINT "tournament_stats_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

ALTER TABLE "public"."tournaments"
  ADD CONSTRAINT "tournaments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_dart_throws_leg_id ON public.dart_throws USING btree (leg_id);

CREATE INDEX idx_group_players_group_id ON public.group_players USING btree (group_id);

CREATE INDEX idx_group_players_player_id ON public.group_players USING btree (player_id);

CREATE INDEX idx_group_standings_group_id ON public.group_standings USING btree (group_id);

CREATE INDEX idx_groups_tournament_id ON public.groups USING btree (tournament_id);

CREATE INDEX idx_league_leaderboard_league_id ON public.league_leaderboard USING btree (league_id);

CREATE INDEX idx_league_leaderboard_player_id ON public.league_leaderboard USING btree (player_id);

CREATE INDEX idx_league_members_is_active ON public.league_members USING btree (is_active);

CREATE INDEX idx_league_members_league_id ON public.league_members USING btree (league_id);

CREATE INDEX idx_league_members_player_id ON public.league_members USING btree (player_id);

CREATE INDEX idx_league_tournament_results_league_id ON public.league_tournament_results USING btree (league_id);

CREATE INDEX idx_league_tournament_results_player_id ON public.league_tournament_results USING btree (player_id);

CREATE INDEX idx_league_tournament_results_tournament_id ON public.league_tournament_results USING btree (tournament_id);

CREATE INDEX idx_leagues_created_by ON public.leagues USING btree (created_by);

CREATE INDEX idx_leagues_deleted ON public.leagues USING btree (deleted);

CREATE INDEX idx_leagues_status ON public.leagues USING btree (status);

CREATE INDEX idx_legs_match_id ON public.legs USING btree (match_id);

CREATE INDEX idx_match_player_stats_match_id ON public.match_player_stats USING btree (match_id);

CREATE INDEX idx_matches_board_number ON public.matches USING btree (live_board_number)
  WHERE (live_board_number IS NOT NULL);

CREATE INDEX idx_matches_group_id ON public.matches USING btree (group_id);

CREATE INDEX idx_matches_is_playoff ON public.matches USING btree (is_playoff);

CREATE INDEX idx_matches_live_device ON public.matches USING btree (live_device_id)
  WHERE (live_device_id IS NOT NULL);

CREATE INDEX idx_matches_live_status ON public.matches USING btree (status, last_activity_at)
  WHERE ((status)::text = 'in_progress'::text);

CREATE INDEX idx_matches_started_by_user_id ON public.matches USING btree (started_by_user_id);

CREATE INDEX idx_matches_status ON public.matches USING btree (status);

CREATE INDEX idx_matches_tournament_id ON public.matches USING btree (tournament_id);

CREATE INDEX idx_tournament_players_player_id ON public.tournament_players USING btree (player_id);

CREATE INDEX idx_tournament_players_tournament_id ON public.tournament_players USING btree (tournament_id);

CREATE INDEX idx_tournament_stats_tournament_id ON public.tournament_stats USING btree (tournament_id);

CREATE INDEX idx_tournaments_deleted ON public.tournaments USING btree (deleted)
  WHERE (deleted = false);

CREATE INDEX idx_tournaments_league_id ON public.tournaments USING btree (league_id);

CREATE INDEX idx_tournaments_status ON public.tournaments USING btree (status);

CREATE INDEX idx_tournaments_user_id ON public.tournaments USING btree (user_id);

CREATE TRIGGER update_group_standings_updated_at
  BEFORE UPDATE ON public.group_standings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_league_leaderboard_updated_at
  BEFORE UPDATE ON public.league_leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_league_tournament_results_updated_at
  BEFORE UPDATE ON public.league_tournament_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leagues_updated_at
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tournament_stats_updated_at
  BEFORE UPDATE ON public.tournament_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Anyone can view dart throws" ON "public"."dart_throws"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create dart throws" ON "public"."dart_throws"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Anyone can view group players" ON "public"."group_players"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create group players for their tournaments" ON "public"."group_players"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.groups
     JOIN public.tournaments ON ((tournaments.id = groups.tournament_id)))
  WHERE ((groups.id = group_players.group_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Users can delete group players from their tournaments" ON "public"."group_players"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (public.groups
     JOIN public.tournaments ON ((tournaments.id = groups.tournament_id)))
  WHERE ((groups.id = group_players.group_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Anyone can view group standings" ON "public"."group_standings"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create group standings for their tournaments" ON "public"."group_standings"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.groups
     JOIN public.tournaments ON ((tournaments.id = groups.tournament_id)))
  WHERE ((groups.id = group_standings.group_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Users can update group standings of their tournaments" ON "public"."group_standings"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (public.groups
     JOIN public.tournaments ON ((tournaments.id = groups.tournament_id)))
  WHERE ((groups.id = group_standings.group_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Anyone can view groups" ON "public"."groups"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create groups for their tournaments" ON "public"."groups"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = groups.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Users can update groups of their tournaments" ON "public"."groups"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = groups.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Authenticated users can view league leaderboard" ON "public"."league_leaderboard"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "System can update league leaderboard" ON "public"."league_leaderboard"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can view league members" ON "public"."league_members"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Managers can add league members" ON "public"."league_members"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.leagues
  WHERE ((leagues.id = league_members.league_id) AND ((leagues.created_by = auth.uid()) OR (auth.uid() = ANY (leagues.manager_ids)))))));

CREATE POLICY "Managers can remove league members" ON "public"."league_members"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.leagues
  WHERE ((leagues.id = league_members.league_id) AND ((leagues.created_by = auth.uid()) OR (auth.uid() = ANY (leagues.manager_ids)))))));

CREATE POLICY "Managers can update league members" ON "public"."league_members"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.leagues
  WHERE ((leagues.id = league_members.league_id) AND ((leagues.created_by = auth.uid()) OR (auth.uid() = ANY (leagues.manager_ids)))))));

CREATE POLICY "Authenticated users can view league tournament results" ON "public"."league_tournament_results"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Managers can create league tournament results" ON "public"."league_tournament_results"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.leagues
  WHERE ((leagues.id = league_tournament_results.league_id) AND ((leagues.created_by = auth.uid()) OR (auth.uid() = ANY (leagues.manager_ids)))))));

CREATE POLICY "Managers can update league tournament results" ON "public"."league_tournament_results"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.leagues
  WHERE ((leagues.id = league_tournament_results.league_id) AND ((leagues.created_by = auth.uid()) OR (auth.uid() = ANY (leagues.manager_ids)))))));

CREATE POLICY "Authenticated users can view all leagues" ON "public"."leagues"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Managers can delete their leagues" ON "public"."leagues"
  FOR DELETE
  TO PUBLIC
  USING (((auth.uid() = created_by) OR (auth.uid() = ANY (manager_ids))));

CREATE POLICY "Managers can update their leagues" ON "public"."leagues"
  FOR UPDATE
  TO PUBLIC
  USING (((auth.uid() = created_by) OR (auth.uid() = ANY (manager_ids))));

CREATE POLICY "Users can create leagues" ON "public"."leagues"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = created_by));

CREATE POLICY "Anyone can view legs" ON "public"."legs"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create legs" ON "public"."legs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can update legs" ON "public"."legs"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Anyone can view match player stats" ON "public"."match_player_stats"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create match player stats" ON "public"."match_player_stats"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can update match player stats" ON "public"."match_player_stats"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Anyone can view matches" ON "public"."matches"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create matches" ON "public"."matches"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can update matches" ON "public"."matches"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Anyone can view players" ON "public"."players"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Authenticated users can create players" ON "public"."players"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Authenticated users can update players" ON "public"."players"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Anyone can view tournament players" ON "public"."tournament_players"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create tournament players for their tournaments" ON "public"."tournament_players"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = tournament_players.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Users can delete tournament players from their tournaments" ON "public"."tournament_players"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = tournament_players.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Anyone can view tournament stats" ON "public"."tournament_stats"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create tournament stats for their tournaments" ON "public"."tournament_stats"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = tournament_stats.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Users can update tournament stats of their tournaments" ON "public"."tournament_stats"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = tournament_stats.tournament_id) AND (tournaments.user_id = auth.uid())))));

CREATE POLICY "Anyone can view tournaments" ON "public"."tournaments"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "Users can create their own tournaments" ON "public"."tournaments"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own tournaments" ON "public"."tournaments"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own tournaments" ON "public"."tournaments"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_admin() OR (auth.uid() = user_id)));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."matches";

COMMENT ON COLUMN "public"."leagues"."default_tournament_settings" IS 'JSONB containing default tournament settings (legsToWin, startingScore, groupSettings, playoffSettings, etc.)';

COMMENT ON COLUMN "public"."leagues"."scoring_rules" IS 'JSONB containing scoring rules (placementPoints map, allowManualOverride flag)';

COMMENT ON COLUMN "public"."matches"."current_leg" IS 'Current leg number being played';

COMMENT ON COLUMN "public"."matches"."current_player" IS 'Current player turn (0 for player1, 1 for player2)';

COMMENT ON COLUMN "public"."matches"."group_id" IS 'Group ID for group stage matches, NULL for playoff matches';

COMMENT ON COLUMN "public"."matches"."is_playoff" IS 'Boolean flag indicating if this is a playoff match';

COMMENT ON COLUMN "public"."matches"."last_activity_at" IS 'Timestamp of last match activity for live tracking';

COMMENT ON COLUMN "public"."matches"."live_board_number" IS 'Board/target number where the match is being played (for tournament display)';

COMMENT ON COLUMN "public"."matches"."live_device_id" IS 'Device ID of the device currently playing this match';

COMMENT ON COLUMN "public"."matches"."live_device_name" IS 'User-friendly name of the device running the match';

COMMENT ON COLUMN "public"."matches"."live_started_at" IS 'Timestamp when the match went live';

COMMENT ON COLUMN "public"."matches"."player1_current_score" IS 'Player 1 current score in the current leg';

COMMENT ON COLUMN "public"."matches"."player2_current_score" IS 'Player 2 current score in the current leg';

COMMENT ON COLUMN "public"."matches"."playoff_match_number" IS 'Match number within the playoff round';

COMMENT ON COLUMN "public"."matches"."playoff_round" IS 'Round number for playoff matches (1, 2, 3, etc.)';

COMMENT ON COLUMN "public"."matches"."result" IS 'Full match result data including player stats, checkouts, and leg averages';

COMMENT ON COLUMN "public"."matches"."tournament_id" IS 'Direct reference to tournament. For group matches, this matches the group.tournament_id. For playoff matches, this links the match directly to the tournament.';

COMMENT ON COLUMN "public"."tournaments"."playoff_settings" IS 'JSONB containing playoff configuration (enabled, playersPerGroup, playoffLegsToWin)';

COMMENT ON COLUMN "public"."tournaments"."playoffs" IS 'JSONB containing playoff bracket data (qualifyingPlayers, rounds, currentRound, etc.)';

COMMENT ON TABLE "public"."league_leaderboard" IS 'Cached leaderboard data aggregated from league_tournament_results';

COMMENT ON TABLE "public"."league_members" IS 'Junction table linking players to leagues with role and active status';

COMMENT ON TABLE "public"."league_tournament_results" IS 'Records tournament results and points awarded to players in league tournaments';

COMMENT ON TABLE "public"."leagues" IS 'Leagues table for organizing tournaments and tracking player standings';

COMMENT ON TABLE "public"."matches" IS 'Matches table supporting both group stage and playoff matches';

COMMENT ON TABLE "public"."tournaments" IS 'Main tournaments table with playoff settings and bracket data';

GRANT EXECUTE ON FUNCTION "public"."get_all_users"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_tournaments_summary"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_users_by_role"(text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_user_role"(text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_user_role_secure"(text, text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."dart_throws" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."group_players" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."group_standings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."groups" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."league_leaderboard" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."league_members" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."league_tournament_results" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leagues" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."legs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."match_player_stats" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."players" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tournament_players" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tournament_stats" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tournaments" TO "anon", "authenticated", "postgres", "service_role";


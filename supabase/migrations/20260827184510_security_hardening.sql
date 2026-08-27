-- ============================================================================
-- SECURITY HARDENING
--
-- 1. Roles move from user_metadata (user-editable!) to app_metadata.
-- 2. Drop the unguarded set_user_role RPC; admin-gate get_users_by_role.
-- 3. Scorer allowlists (tournament_scorers, league_scorers) + management RPCs.
-- 4. Tenant-scoped write policies on the match layer (matches, legs,
--    dart_throws, match_player_stats, group_standings, tournament_stats).
-- 5. Per-manager player rosters (players.owner_id, unique name per owner).
-- 6. Schema drift fix: tournament_registrations, league_registrations,
--    players.user_id, search_users existed only in SQLscripts/, never in prod.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLES -> app_metadata
-- user_metadata is editable by the user via auth.updateUser(); any role stored
-- there is self-assignable. app_metadata is only writable server-side.
-- ----------------------------------------------------------------------------

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  raw_user_meta_data -> 'role'
)
WHERE raw_user_meta_data ? 'role';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'role'
WHERE raw_user_meta_data ? 'role';

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT u.raw_app_meta_data ->> 'role'
     FROM auth.users u
     WHERE u.id = (SELECT auth.uid())),
    ''
  ) = 'admin';
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT u.raw_app_meta_data ->> 'role'
     FROM auth.users u
     WHERE u.id = (SELECT auth.uid())),
    ''
  ) IN ('admin', 'manager');
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Role-management RPCs: drop the unguarded one, admin-gate the rest,
--    write roles to app_metadata only.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.set_user_role(text, text);

CREATE OR REPLACE FUNCTION public.set_user_role_secure(user_email text, user_role text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only administrators can set user roles');
  END IF;

  IF user_role IS NOT NULL AND user_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  SELECT * INTO user_record
  FROM auth.users
  WHERE lower(email) = lower(user_email)
  LIMIT 1;

  IF user_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF user_role IS NOT NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data = jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', to_jsonb(user_role))
    WHERE id = user_record.id;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = user_record.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_record.id,
    'email', user_record.email,
    'role', user_role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_role_secure(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role_secure(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_all_users()
  RETURNS TABLE (id uuid, email text, full_name text, role text, created_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can view all users';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
    COALESCE(u.raw_app_meta_data ->> 'role', 'user')::text,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC
  LIMIT 1000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_users_by_role(role_name text)
  RETURNS TABLE (id uuid, email text, full_name text, role text, created_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can list users by role';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
    (u.raw_app_meta_data ->> 'role')::text,
    u.created_at
  FROM auth.users u
  WHERE u.raw_app_meta_data ->> 'role' = role_name
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_users_by_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_by_role(text) TO authenticated;

-- search_users: called by the app (player-account linking) but never deployed.
-- Manager/admin gated; needed to add scorers and link accounts by email.
CREATE OR REPLACE FUNCTION public.search_users(search_term text)
  RETURNS TABLE (id uuid, email text, full_name text, role text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Only managers and administrators can search users';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
    COALESCE(u.raw_app_meta_data ->> 'role', 'user')::text
  FROM auth.users u
  WHERE u.email ILIKE '%' || search_term || '%'
     OR u.raw_user_meta_data ->> 'full_name' ILIKE '%' || search_term || '%'
     OR u.raw_user_meta_data ->> 'name' ILIKE '%' || search_term || '%'
  ORDER BY u.created_at DESC
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Scorer allowlists.
-- A scorer is a registered user the manager authorizes to run the scoring UI
-- for one tournament, or for every tournament of a league.
-- ----------------------------------------------------------------------------

CREATE TABLE public.tournament_scorers (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE INDEX idx_tournament_scorers_user_id ON public.tournament_scorers (user_id);

ALTER TABLE public.tournament_scorers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.league_scorers (
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

CREATE INDEX idx_league_scorers_user_id ON public.league_scorers (user_id);

ALTER TABLE public.league_scorers ENABLE ROW LEVEL SECURITY;

-- Who manages a tournament: its owner, the linked league's managers, or admin.
CREATE OR REPLACE FUNCTION public.can_manage_tournament(t_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.tournaments t
    LEFT JOIN public.leagues l ON l.id = t.league_id
    WHERE t.id = t_id
      AND (
        t.user_id = (SELECT auth.uid())
        OR l.created_by = (SELECT auth.uid())
        OR (SELECT auth.uid()) = ANY (l.manager_ids)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_tournament(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_league(l_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.leagues l
    WHERE l.id = l_id
      AND (l.created_by = (SELECT auth.uid()) OR (SELECT auth.uid()) = ANY (l.manager_ids))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_league(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_league(uuid) TO authenticated;

-- Who may write scoring data for a tournament: managers (above) + scorers.
CREATE OR REPLACE FUNCTION public.can_score_tournament(t_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.can_manage_tournament(t_id)
    OR EXISTS (
      SELECT 1 FROM public.tournament_scorers ts
      WHERE ts.tournament_id = t_id AND ts.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.tournaments t
      JOIN public.league_scorers ls ON ls.league_id = t.league_id
      WHERE t.id = t_id AND ls.user_id = (SELECT auth.uid())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_score_tournament(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_score_tournament(uuid) TO authenticated;

-- Scorer table policies: visible to signed-in users, managed by managers.
CREATE POLICY "Authenticated users can view tournament scorers" ON public.tournament_scorers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can add tournament scorers" ON public.tournament_scorers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Managers can remove tournament scorers" ON public.tournament_scorers
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Authenticated users can view league scorers" ON public.league_scorers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can add league scorers" ON public.league_scorers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can remove league scorers" ON public.league_scorers
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)));

-- Scorer management by email (client cannot query auth.users directly).
CREATE OR REPLACE FUNCTION public.add_tournament_scorer(t_id uuid, user_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  target RECORD;
BEGIN
  IF NOT public.can_manage_tournament(t_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') AS full_name
  INTO target
  FROM auth.users u
  WHERE lower(u.email) = lower(user_email)
  LIMIT 1;

  IF target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.tournament_scorers (tournament_id, user_id, added_by)
  VALUES (t_id, target.id, (SELECT auth.uid()))
  ON CONFLICT (tournament_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', target.id, 'email', target.email, 'full_name', target.full_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_tournament_scorer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_tournament_scorer(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_league_scorer(l_id uuid, user_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  target RECORD;
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') AS full_name
  INTO target
  FROM auth.users u
  WHERE lower(u.email) = lower(user_email)
  LIMIT 1;

  IF target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.league_scorers (league_id, user_id, added_by)
  VALUES (l_id, target.id, (SELECT auth.uid()))
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', target.id, 'email', target.email, 'full_name', target.full_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_league_scorer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_league_scorer(uuid, text) TO authenticated;

-- Listing includes emails, so it is gated to the people who manage the entity.
CREATE OR REPLACE FUNCTION public.list_tournament_scorers(t_id uuid)
  RETURNS TABLE (user_id uuid, email text, full_name text, created_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_tournament(t_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT ts.user_id, u.email::text,
         COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
         ts.created_at
  FROM public.tournament_scorers ts
  JOIN auth.users u ON u.id = ts.user_id
  WHERE ts.tournament_id = t_id
  ORDER BY ts.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_tournament_scorers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tournament_scorers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_league_scorers(l_id uuid)
  RETURNS TABLE (user_id uuid, email text, full_name text, created_at timestamptz)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT ls.user_id, u.email::text,
         COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
         ls.created_at
  FROM public.league_scorers ls
  JOIN auth.users u ON u.id = ls.user_id
  WHERE ls.league_id = l_id
  ORDER BY ls.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_league_scorers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_league_scorers(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Tenant-scoped write policies on the match layer.
-- Reads stay public (intended). Writes require can_score_tournament():
-- owner, league co-manager, admin, or an authorized scorer.
-- ----------------------------------------------------------------------------

-- matches -------------------------------------------------------------------
DROP POLICY "Authenticated users can create matches" ON public.matches;
DROP POLICY "Authenticated users can update matches" ON public.matches;

CREATE POLICY "Scorers can create matches" ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(tournament_id)));

CREATE POLICY "Scorers can update matches" ON public.matches
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(tournament_id)))
  WITH CHECK ((SELECT public.can_score_tournament(tournament_id)));

CREATE POLICY "Managers can delete matches" ON public.matches
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)));

-- legs ----------------------------------------------------------------------
DROP POLICY "Authenticated users can create legs" ON public.legs;
DROP POLICY "Authenticated users can update legs" ON public.legs;

CREATE POLICY "Scorers can create legs" ON public.legs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

CREATE POLICY "Scorers can update legs" ON public.legs
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))))
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

-- saveMatchResult and resetMatchToPending delete + re-insert legs; without a
-- DELETE policy those deletes silently match 0 rows.
CREATE POLICY "Scorers can delete legs" ON public.legs
  FOR DELETE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

-- dart_throws ---------------------------------------------------------------
DROP POLICY "Authenticated users can create dart throws" ON public.dart_throws;

CREATE POLICY "Scorers can create dart throws" ON public.dart_throws
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id
     FROM public.legs lg JOIN public.matches m ON m.id = lg.match_id
     WHERE lg.id = leg_id))));

CREATE POLICY "Scorers can update dart throws" ON public.dart_throws
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id
     FROM public.legs lg JOIN public.matches m ON m.id = lg.match_id
     WHERE lg.id = leg_id))))
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id
     FROM public.legs lg JOIN public.matches m ON m.id = lg.match_id
     WHERE lg.id = leg_id))));

CREATE POLICY "Scorers can delete dart throws" ON public.dart_throws
  FOR DELETE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id
     FROM public.legs lg JOIN public.matches m ON m.id = lg.match_id
     WHERE lg.id = leg_id))));

-- match_player_stats ---------------------------------------------------------
DROP POLICY "Authenticated users can create match player stats" ON public.match_player_stats;
DROP POLICY "Authenticated users can update match player stats" ON public.match_player_stats;

CREATE POLICY "Scorers can create match player stats" ON public.match_player_stats
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

CREATE POLICY "Scorers can update match player stats" ON public.match_player_stats
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))))
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

CREATE POLICY "Scorers can delete match player stats" ON public.match_player_stats
  FOR DELETE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT m.tournament_id FROM public.matches m WHERE m.id = match_id))));

-- group_standings (written by the scoring device on match completion) --------
DROP POLICY "Users can create group standings for their tournaments" ON public.group_standings;
DROP POLICY "Users can update group standings of their tournaments" ON public.group_standings;

CREATE POLICY "Scorers can create group standings" ON public.group_standings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))));

CREATE POLICY "Scorers can update group standings" ON public.group_standings
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))))
  WITH CHECK ((SELECT public.can_score_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))));

CREATE POLICY "Scorers can delete group standings" ON public.group_standings
  FOR DELETE TO authenticated
  USING ((SELECT public.can_score_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))));

-- tournament_stats ------------------------------------------------------------
DROP POLICY "Users can create tournament stats for their tournaments" ON public.tournament_stats;
DROP POLICY "Users can update tournament stats of their tournaments" ON public.tournament_stats;

CREATE POLICY "Scorers can create tournament stats" ON public.tournament_stats
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_score_tournament(tournament_id)));

CREATE POLICY "Scorers can update tournament stats" ON public.tournament_stats
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(tournament_id)))
  WITH CHECK ((SELECT public.can_score_tournament(tournament_id)));

CREATE POLICY "Scorers can delete tournament stats" ON public.tournament_stats
  FOR DELETE TO authenticated
  USING ((SELECT public.can_score_tournament(tournament_id)));

-- tournaments: the scoring device writes playoffs JSONB, live-match columns
-- and status on completion, so scorers need UPDATE here too.
DROP POLICY "Users can update their own tournaments" ON public.tournaments;

CREATE POLICY "Scorers can update tournaments" ON public.tournaments
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_score_tournament(id)))
  WITH CHECK ((SELECT public.can_score_tournament(id)));

-- groups / group_players / tournament_players: previously creator-only, which
-- locked out league co-managers and admins; deletes had no policy at all.
DROP POLICY "Users can create groups for their tournaments" ON public.groups;
DROP POLICY "Users can update groups of their tournaments" ON public.groups;

CREATE POLICY "Managers can create groups" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Managers can update groups" ON public.groups
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)))
  WITH CHECK ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Managers can delete groups" ON public.groups
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)));

DROP POLICY "Users can create group players for their tournaments" ON public.group_players;
DROP POLICY "Users can delete group players from their tournaments" ON public.group_players;

CREATE POLICY "Managers can create group players" ON public.group_players
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))));

CREATE POLICY "Managers can delete group players" ON public.group_players
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(
    (SELECT g.tournament_id FROM public.groups g WHERE g.id = group_id))));

DROP POLICY "Users can create tournament players for their tournaments" ON public.tournament_players;
DROP POLICY "Users can delete tournament players from their tournaments" ON public.tournament_players;

CREATE POLICY "Managers can create tournament players" ON public.tournament_players
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Managers can delete tournament players" ON public.tournament_players
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)));

-- league_leaderboard: was writable by ANY authenticated user.
DROP POLICY "System can update league leaderboard" ON public.league_leaderboard;

CREATE POLICY "League managers can insert leaderboard" ON public.league_leaderboard
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "League managers can update leaderboard" ON public.league_leaderboard
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "League managers can delete leaderboard" ON public.league_leaderboard
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)));

-- league_tournament_results: unlink flow deletes rows; no DELETE policy existed.
CREATE POLICY "League managers can delete tournament results" ON public.league_tournament_results
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)));

-- ----------------------------------------------------------------------------
-- 5. Per-manager player rosters.
-- ----------------------------------------------------------------------------

ALTER TABLE public.players
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: each player belongs to the owner of the earliest tournament they
-- appear in; players never used in a tournament go to the (first) admin.
UPDATE public.players p
SET owner_id = sub.user_id
FROM (
  SELECT DISTINCT ON (tp.player_id) tp.player_id, t.user_id
  FROM public.tournament_players tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE t.user_id IS NOT NULL
  ORDER BY tp.player_id, t.created_at ASC
) sub
WHERE p.id = sub.player_id;

UPDATE public.players
SET owner_id = (
  SELECT id FROM auth.users
  WHERE raw_app_meta_data ->> 'role' = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE owner_id IS NULL;

-- Names unique per manager instead of globally.
ALTER TABLE public.players DROP CONSTRAINT players_name_key;
CREATE UNIQUE INDEX players_owner_name_key ON public.players (owner_id, name);
CREATE INDEX idx_players_owner_id ON public.players (owner_id);

DROP POLICY "Authenticated users can create players" ON public.players;
DROP POLICY "Authenticated users can update players" ON public.players;

CREATE POLICY "Owners can create players" ON public.players
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY "Owners can update players" ON public.players
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- mergePlayers (admin feature) deletes the source player.
CREATE POLICY "Owners can delete players" ON public.players
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- ----------------------------------------------------------------------------
-- 6. Schema drift: objects the app already calls but prod never had.
-- ----------------------------------------------------------------------------

-- players.user_id: optional link between a player and an auth account.
ALTER TABLE public.players
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_players_user_id ON public.players (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE public.tournament_registrations (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name   varchar(255) NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES auth.users(id),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX idx_tournament_registrations_tournament ON public.tournament_registrations (tournament_id);
CREATE INDEX idx_tournament_registrations_user ON public.tournament_registrations (user_id);
CREATE INDEX idx_tournament_registrations_status ON public.tournament_registrations (status);

ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tournament registrations" ON public.tournament_registrations
  FOR SELECT USING (true);

CREATE POLICY "Users can register for tournaments" ON public.tournament_registrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Managers can review tournament registrations" ON public.tournament_registrations
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_tournament(tournament_id)))
  WITH CHECK ((SELECT public.can_manage_tournament(tournament_id)));

CREATE POLICY "Users can withdraw pending tournament registrations" ON public.tournament_registrations
  FOR DELETE TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND status = 'pending')
    OR (SELECT public.can_manage_tournament(tournament_id))
  );

CREATE TABLE public.league_registrations (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  league_id   uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name varchar(255) NOT NULL,
  status      varchar(20) NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  UNIQUE (league_id, user_id)
);

CREATE INDEX idx_league_registrations_league ON public.league_registrations (league_id);
CREATE INDEX idx_league_registrations_user ON public.league_registrations (user_id);
CREATE INDEX idx_league_registrations_status ON public.league_registrations (status);

ALTER TABLE public.league_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view league registrations" ON public.league_registrations
  FOR SELECT USING (true);

CREATE POLICY "Users can register for leagues" ON public.league_registrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Managers can review league registrations" ON public.league_registrations
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Users can withdraw pending league registrations" ON public.league_registrations
  FOR DELETE TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND status = 'pending')
    OR (SELECT public.can_manage_league(league_id))
  );

-- ----------------------------------------------------------------------------
-- 7. Advisor cleanups on remaining baseline policies:
--    auth.uid() wrapped in (SELECT ...) so it evaluates once per query, and
--    manager checks routed through can_manage_league().
-- ----------------------------------------------------------------------------

DROP POLICY "Authenticated users can view all leagues" ON public.leagues;
CREATE POLICY "Authenticated users can view all leagues" ON public.leagues
  FOR SELECT TO authenticated USING (true);

DROP POLICY "Users can create leagues" ON public.leagues;
CREATE POLICY "Users can create leagues" ON public.leagues
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY "Managers can update their leagues" ON public.leagues;
CREATE POLICY "Managers can update their leagues" ON public.leagues
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(id)))
  WITH CHECK ((SELECT public.can_manage_league(id)));

DROP POLICY "Managers can delete their leagues" ON public.leagues;
CREATE POLICY "Managers can delete their leagues" ON public.leagues
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(id)));

DROP POLICY "Authenticated users can view league members" ON public.league_members;
CREATE POLICY "Authenticated users can view league members" ON public.league_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY "Managers can add league members" ON public.league_members;
CREATE POLICY "Managers can add league members" ON public.league_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

DROP POLICY "Managers can update league members" ON public.league_members;
CREATE POLICY "Managers can update league members" ON public.league_members
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

DROP POLICY "Managers can remove league members" ON public.league_members;
CREATE POLICY "Managers can remove league members" ON public.league_members
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)));

DROP POLICY "Authenticated users can view league tournament results" ON public.league_tournament_results;
CREATE POLICY "Authenticated users can view league tournament results" ON public.league_tournament_results
  FOR SELECT TO authenticated USING (true);

DROP POLICY "Managers can create league tournament results" ON public.league_tournament_results;
CREATE POLICY "Managers can create league tournament results" ON public.league_tournament_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

DROP POLICY "Managers can update league tournament results" ON public.league_tournament_results;
CREATE POLICY "Managers can update league tournament results" ON public.league_tournament_results
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

DROP POLICY "Authenticated users can view league leaderboard" ON public.league_leaderboard;
CREATE POLICY "Authenticated users can view league leaderboard" ON public.league_leaderboard
  FOR SELECT TO authenticated USING (true);

DROP POLICY "Users can create their own tournaments" ON public.tournaments;
CREATE POLICY "Users can create their own tournaments" ON public.tournaments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY "Users can delete their own tournaments" ON public.tournaments;
CREATE POLICY "Managers can delete tournaments" ON public.tournaments
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_tournament(id)));

-- group_standings/dart_throws/etc. "Anyone can view" policies keep USING (true)
-- (no auth call, nothing to optimize). Pin search_path on baseline functions.
ALTER FUNCTION public.update_updated_at_column() SET search_path = 'public';
ALTER FUNCTION public.get_tournaments_summary() SET search_path = 'public';

-- ----------------------------------------------------------------------------
-- 8. Privilege hygiene: client roles never need DDL-adjacent table privileges.
-- (RLS does not apply to TRUNCATE; these were granted broadly.)
-- ----------------------------------------------------------------------------

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- League co-managers.
--
-- Several people can run one league on a single manager subscription. The
-- league creator (created_by) stays the paying "primary" manager; everyone in
-- league_managers is a co-manager with the same rights inside that league
-- (members, tournaments, scoring, settings) but no role of their own and no
-- subscription row. Only the creator or an admin can add/remove co-managers,
-- so the paying manager keeps control of who rides on their subscription.
--
-- Replaces leagues.manager_ids uuid[] (no FK, no index, nothing ever wrote to
-- it after creation) with a proper join table shaped like league_scorers.

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE public.league_managers (
  league_id  uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

COMMENT ON TABLE public.league_managers IS 'Co-managers of a league: full manage rights inside the league, no own role or subscription. Creator (leagues.created_by) is implicit and not stored here.';

CREATE INDEX idx_league_managers_user_id ON public.league_managers (user_id);

ALTER TABLE public.league_managers ENABLE ROW LEVEL SECURITY;

-- Same visibility manager_ids had (leagues are readable by every signed-in
-- user and the app uses the ids to decide whether to show the manage UI).
-- Writes go through the RPCs below only.
CREATE POLICY "Authenticated users can view league managers" ON public.league_managers
  FOR SELECT TO authenticated
  USING (true);

-- Migrate existing co-managers; the creator is implicit, dangling ids are dropped.
INSERT INTO public.league_managers (league_id, user_id)
SELECT l.id, m.uid
FROM public.leagues l
CROSS JOIN LATERAL unnest(l.manager_ids) AS m(uid)
JOIN auth.users u ON u.id = m.uid
WHERE m.uid IS DISTINCT FROM l.created_by
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Authorization helpers
-- ----------------------------------------------------------------------------
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
      AND (
        l.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.league_managers lm
          WHERE lm.league_id = l.id AND lm.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

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
        OR EXISTS (
          SELECT 1 FROM public.league_managers lm
          WHERE lm.league_id = l.id AND lm.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

-- Owner = the paying manager (creator) or an admin. Only owners edit the
-- co-manager list. Internal helper, not exposed to clients.
CREATE OR REPLACE FUNCTION public.is_league_owner(l_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.leagues l
    WHERE l.id = l_id AND l.created_by = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_league_owner(uuid) FROM PUBLIC, anon, authenticated;

-- Does the current user co-manage at least one live league? Lets the app
-- open the manager UI for people without the manager role.
CREATE OR REPLACE FUNCTION public.manages_any_league()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.league_managers lm
    JOIN public.leagues l ON l.id = lm.league_id
    WHERE lm.user_id = (SELECT auth.uid())
      AND COALESCE(l.deleted, false) = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.manages_any_league() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manages_any_league() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Policies that still read manager_ids -> route through can_manage_league()
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers can add league members" ON public.league_members;
DROP POLICY IF EXISTS "Managers can remove league members" ON public.league_members;
DROP POLICY IF EXISTS "Managers can update league members" ON public.league_members;
DROP POLICY IF EXISTS "Managers can create league tournament results" ON public.league_tournament_results;
DROP POLICY IF EXISTS "Managers can update league tournament results" ON public.league_tournament_results;
DROP POLICY IF EXISTS "Managers can delete their leagues" ON public.leagues;
DROP POLICY IF EXISTS "Managers can update their leagues" ON public.leagues;

CREATE POLICY "Managers can add league members" ON public.league_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can remove league members" ON public.league_members
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can update league members" ON public.league_members
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can create league tournament results" ON public.league_tournament_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can update league tournament results" ON public.league_tournament_results
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(league_id)))
  WITH CHECK ((SELECT public.can_manage_league(league_id)));

CREATE POLICY "Managers can delete their leagues" ON public.leagues
  FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_league(id)));

CREATE POLICY "Managers can update their leagues" ON public.leagues
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_league(id)))
  WITH CHECK ((SELECT public.can_manage_league(id)));

-- ----------------------------------------------------------------------------
-- 4. RPCs (same shape as the scorer RPCs)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_league_manager(l_id uuid, user_email text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  target RECORD;
  owner uuid;
BEGIN
  IF NOT public.is_league_owner(l_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT u.id, u.email, public.user_display_name(u.raw_user_meta_data) AS full_name
  INTO target
  FROM auth.users u
  WHERE lower(u.email) = lower(user_email)
  LIMIT 1;

  IF target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  SELECT created_by INTO owner FROM public.leagues WHERE id = l_id;
  IF owner = target.id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owner');
  END IF;

  INSERT INTO public.league_managers (league_id, user_id, added_by)
  VALUES (l_id, target.id, (SELECT auth.uid()))
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', target.id, 'email', target.email, 'full_name', target.full_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_league_manager(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_league_manager(uuid, text) TO authenticated;

-- Owners remove anyone; a co-manager may remove themselves (leave).
CREATE OR REPLACE FUNCTION public.remove_league_manager(l_id uuid, target_user_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT (public.is_league_owner(l_id) OR target_user_id = (SELECT auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  DELETE FROM public.league_managers
  WHERE league_id = l_id AND user_id = target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_league_manager(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_league_manager(uuid, uuid) TO authenticated;

-- Owner first (is_owner = true), then co-managers in the order they were added.
-- Includes emails, so gated to the people who manage the league.
CREATE OR REPLACE FUNCTION public.list_league_managers(l_id uuid)
  RETURNS TABLE (user_id uuid, email text, full_name text, is_owner boolean, created_at timestamptz)
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
  SELECT u.id, u.email::text, public.user_display_name(u.raw_user_meta_data), true, l.created_at
  FROM public.leagues l
  JOIN auth.users u ON u.id = l.created_by
  WHERE l.id = l_id
  UNION ALL
  SELECT lm.user_id, u.email::text, public.user_display_name(u.raw_user_meta_data), false, lm.created_at
  FROM public.league_managers lm
  JOIN auth.users u ON u.id = lm.user_id
  WHERE lm.league_id = l_id
  ORDER BY 4 DESC, 5;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_league_managers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_league_managers(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Account deletion no longer touches manager_ids (league_managers cascades)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  released_tournaments int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Release ownership instead of cascading deletes.
  UPDATE public.tournaments SET user_id = NULL WHERE user_id = uid;
  GET DIAGNOSTICS released_tournaments = ROW_COUNT;
  -- leagues.created_by is ON DELETE SET NULL; league_managers cascades.

  -- References without an ON DELETE rule would block the delete.
  UPDATE public.matches SET started_by_user_id = NULL WHERE started_by_user_id = uid;
  UPDATE public.tournament_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;
  UPDATE public.league_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;

  -- Everything else cascades or nulls out through the FKs.
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'released_tournaments', released_tournaments);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Drop the array column
-- ----------------------------------------------------------------------------
ALTER TABLE public.leagues DROP COLUMN manager_ids;

-- ----------------------------------------------------------------------------
-- User-editable display name
--
-- Problem: the app shows COALESCE(full_name, name) from auth.users metadata,
-- but Supabase re-copies the Google identity (full_name, name, avatar_url…)
-- into raw_user_meta_data on every OAuth sign-in, so any edit a Google user
-- makes to full_name is silently reverted at their next login.
--
-- Fix: the app writes the chosen name to a provider-neutral key
-- `display_name` (never touched by OAuth) and every function that exposes a
-- user's name prefers it. The linked players row is renamed through an RPC
-- because players RLS only lets the owner/admin update rows, and a player's
-- own row is usually owned by the manager who first registered them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_display_name(meta jsonb)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path = ''
AS $$
  SELECT NULLIF(btrim(COALESCE(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name')), '');
$$;

-- ----------------------------------------------------------------------------
-- rename_my_player: a signed-in user renames the player row linked to them.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_my_player(new_name text)
  RETURNS TABLE (id uuid, name text, user_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  cleaned text := btrim(regexp_replace(COALESCE(new_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF length(cleaned) < 2 OR length(cleaned) > 60 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  RETURN QUERY
  UPDATE public.players p
  SET name = cleaned
  WHERE p.user_id = (SELECT auth.uid())
  RETURNING p.id, p.name, p.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_my_player(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_my_player(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Re-declare every reader of the user's name to go through user_display_name.
-- Bodies are otherwise identical to 20260827184510 / 20260827200208.
-- ----------------------------------------------------------------------------

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
    public.user_display_name(u.raw_user_meta_data),
    COALESCE(u.raw_app_meta_data ->> 'role', 'user')::text,
    u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC
  LIMIT 1000;
END;
$$;

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
    public.user_display_name(u.raw_user_meta_data),
    (u.raw_app_meta_data ->> 'role')::text,
    u.created_at
  FROM auth.users u
  WHERE u.raw_app_meta_data ->> 'role' = role_name
  ORDER BY u.created_at DESC;
END;
$$;

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
    public.user_display_name(u.raw_user_meta_data),
    COALESCE(u.raw_app_meta_data ->> 'role', 'user')::text
  FROM auth.users u
  WHERE u.email ILIKE '%' || search_term || '%'
     OR public.user_display_name(u.raw_user_meta_data) ILIKE '%' || search_term || '%'
     OR u.raw_user_meta_data ->> 'full_name' ILIKE '%' || search_term || '%'
     OR u.raw_user_meta_data ->> 'name' ILIKE '%' || search_term || '%'
  ORDER BY u.created_at DESC
  LIMIT 20;
END;
$$;

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

  SELECT u.id, u.email, public.user_display_name(u.raw_user_meta_data) AS full_name
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

  SELECT u.id, u.email, public.user_display_name(u.raw_user_meta_data) AS full_name
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
         public.user_display_name(u.raw_user_meta_data),
         ts.created_at
  FROM public.tournament_scorers ts
  JOIN auth.users u ON u.id = ts.user_id
  WHERE ts.tournament_id = t_id
  ORDER BY ts.created_at;
END;
$$;

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
         public.user_display_name(u.raw_user_meta_data),
         ls.created_at
  FROM public.league_scorers ls
  JOIN auth.users u ON u.id = ls.user_id
  WHERE ls.league_id = l_id
  ORDER BY ls.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_manager_overview()
  RETURNS TABLE (
    user_id          uuid,
    email            text,
    full_name        text,
    role             text,
    is_banned        boolean,
    paid_until       date,
    notes            text,
    tournament_count bigint,
    league_count     bigint,
    created_at       timestamptz,
    last_sign_in_at  timestamptz
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    public.user_display_name(u.raw_user_meta_data),
    (u.raw_app_meta_data ->> 'role')::text,
    COALESCE(u.banned_until > now(), false),
    s.paid_until,
    s.notes,
    COALESCE(t.cnt, 0),
    COALESCE(l.cnt, 0),
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.manager_subscriptions s ON s.user_id = u.id
  LEFT JOIN (
    SELECT tr.user_id AS owner_id, count(*) AS cnt
    FROM public.tournaments tr
    WHERE tr.deleted = false
    GROUP BY tr.user_id
  ) t ON t.owner_id = u.id
  LEFT JOIN (
    SELECT lg.created_by AS owner_id, count(*) AS cnt
    FROM public.leagues lg
    WHERE lg.deleted = false
    GROUP BY lg.created_by
  ) l ON l.owner_id = u.id
  WHERE u.raw_app_meta_data ->> 'role' IN ('manager', 'admin')
  ORDER BY u.created_at;
END;
$$;

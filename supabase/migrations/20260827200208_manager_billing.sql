-- Manager billing & account administration.
--
-- Billing model: monthly per manager, invoiced manually by the admin. Nothing
-- is enforced automatically (admin decision) — the subscription row is the
-- admin's ledger of who is paid up, surfaced in the admin panel.
--
-- Adds: manager_subscriptions (paid_until per manager, 30-day trial on role
-- grant), admin_audit_log (role changes / bans / subscription edits),
-- admin_set_user_ban (GoTrue banned_until + session revocation), and
-- get_manager_overview (managers with billing + resource counts in one call).

-- ----------------------------------------------------------------------------
-- manager_subscriptions
-- ----------------------------------------------------------------------------

CREATE TABLE public.manager_subscriptions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  paid_until date,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.manager_subscriptions IS 'Admin-maintained ledger of manager payments (manual monthly invoicing); paid_until is informational, not enforced';

CREATE TRIGGER update_manager_subscriptions_updated_at
  BEFORE UPDATE ON public.manager_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manager_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and owners can view subscriptions" ON public.manager_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY "Admins can insert subscriptions" ON public.manager_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can update subscriptions" ON public.manager_subscriptions
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can delete subscriptions" ON public.manager_subscriptions
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.manager_subscriptions FROM anon, authenticated;

-- Existing managers start with a 30-day trial window from today; the admin
-- replaces it with real invoice dates.
INSERT INTO public.manager_subscriptions (user_id, paid_until, notes)
SELECT id, (now() + interval '30 days')::date, 'Backfilled on billing rollout'
FROM auth.users
WHERE raw_app_meta_data ->> 'role' = 'manager'
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- admin_audit_log
-- ----------------------------------------------------------------------------

CREATE TABLE public.admin_audit_log (
  id             uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  actor_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action         text NOT NULL,
  target_user_id uuid,
  target_email   text,
  details        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for admins; rows are written exclusively by SECURITY DEFINER
-- functions (which bypass RLS as table owner) — no client INSERT policy.
CREATE POLICY "Admins can read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.admin_audit_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_target_user_id uuid,
  p_target_email text,
  p_details jsonb DEFAULT NULL
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = ''
AS $$
  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, target_email, details)
  VALUES ((SELECT auth.uid()), p_action, p_target_user_id, p_target_email, p_details);
$$;

-- Internal helper: only callable from other definer functions, never clients.
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- set_user_role_secure: auto-create the 30-day trial on manager grant + audit
-- ----------------------------------------------------------------------------

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

    -- New managers start on a 30-day trial; re-grants keep the existing ledger
    IF user_role = 'manager' THEN
      INSERT INTO public.manager_subscriptions (user_id, paid_until, notes)
      VALUES (user_record.id, (now() + interval '30 days')::date, '30-day trial')
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = user_record.id;
  END IF;

  PERFORM public.log_admin_action(
    'set_role',
    user_record.id,
    user_record.email,
    jsonb_build_object('role', user_role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', user_record.id,
    'email', user_record.email,
    'role', user_role
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- admin_set_user_ban: block/unblock login (GoTrue banned_until) + revoke sessions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_ban(user_email text, banned boolean)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  user_record RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO user_record
  FROM auth.users
  WHERE lower(email) = lower(user_email)
  LIMIT 1;

  IF user_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Never ban an admin (including yourself) from here — demote first.
  IF COALESCE(user_record.raw_app_meta_data ->> 'role', '') = 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_ban_admin');
  END IF;

  IF banned THEN
    UPDATE auth.users
    SET banned_until = now() + interval '100 years'
    WHERE id = user_record.id;

    -- Kill existing sessions so the ban takes effect immediately, not at
    -- next token refresh (refresh tokens cascade with their session rows).
    DELETE FROM auth.sessions WHERE user_id = user_record.id;
  ELSE
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = user_record.id;
  END IF;

  PERFORM public.log_admin_action(
    CASE WHEN banned THEN 'ban_user' ELSE 'unban_user' END,
    user_record.id,
    user_record.email,
    NULL
  );

  RETURN jsonb_build_object('success', true, 'user_id', user_record.id, 'email', user_record.email, 'banned', banned);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_ban(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_ban(text, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- admin_update_subscription: set paid_until / notes through the audit trail
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_subscription(
  target_user_id uuid,
  new_paid_until date,
  new_notes text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  target_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;
  IF target_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.manager_subscriptions (user_id, paid_until, notes)
  VALUES (target_user_id, new_paid_until, new_notes)
  ON CONFLICT (user_id) DO UPDATE
  SET paid_until = EXCLUDED.paid_until,
      notes = COALESCE(EXCLUDED.notes, public.manager_subscriptions.notes);

  PERFORM public.log_admin_action(
    'update_subscription',
    target_user_id,
    target_email,
    jsonb_build_object('paid_until', new_paid_until, 'notes', new_notes)
  );

  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'paid_until', new_paid_until);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_subscription(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription(uuid, date, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- get_manager_overview: managers + admins with billing state and resource counts
-- ----------------------------------------------------------------------------

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
    COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
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

REVOKE EXECUTE ON FUNCTION public.get_manager_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_overview() TO authenticated;

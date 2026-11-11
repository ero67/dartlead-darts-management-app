-- Manager billing: payment date + paid period, hiding test accounts from the
-- admin overview, co-managers listed under their paying manager, and a
-- subscription status that co-managers can read.
--
-- Additive only: admin_update_subscription(uuid, date, text) and every existing
-- column of get_manager_overview() stay as the last tagged app expects them.
-- Still nothing enforces paid_until; it remains the admin's ledger.

-- ----------------------------------------------------------------------------
-- 1. Ledger columns
-- ----------------------------------------------------------------------------
-- paid_at / period_months describe the latest payment; the history of payments
-- is the admin_audit_log. hidden_from_overview is written directly by admins
-- (the existing RLS policies already allow it), so it needs no RPC.
ALTER TABLE public.manager_subscriptions
  ADD COLUMN paid_at date,
  ADD COLUMN period_months integer CHECK (period_months > 0),
  ADD COLUMN hidden_from_overview boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. admin_record_payment: store a payment through the audit trail
-- ----------------------------------------------------------------------------
-- The admin panel computes new_paid_until (period start + months) and shows it
-- before saving, so what the admin confirmed is exactly what is stored.
CREATE FUNCTION public.admin_record_payment(
  target_user_id uuid,
  paid_on date,
  months integer,
  new_paid_until date
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

  IF paid_on IS NULL OR months IS NULL OR months <= 0
     OR new_paid_until IS NULL OR new_paid_until <= paid_on THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payment');
  END IF;

  SELECT email INTO target_email FROM auth.users WHERE id = target_user_id;
  IF target_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.manager_subscriptions (user_id, paid_until, paid_at, period_months)
  VALUES (target_user_id, new_paid_until, paid_on, months)
  ON CONFLICT (user_id) DO UPDATE
  SET paid_until = EXCLUDED.paid_until,
      paid_at = EXCLUDED.paid_at,
      period_months = EXCLUDED.period_months;

  PERFORM public.log_admin_action(
    'record_payment',
    target_user_id,
    target_email,
    jsonb_build_object('paid_at', paid_on, 'period_months', months, 'paid_until', new_paid_until)
  );

  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'paid_until', new_paid_until);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_record_payment(uuid, date, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid, date, integer, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_my_subscription_status: what the warning banner reads
-- ----------------------------------------------------------------------------
-- A manager gets their own row; a co-manager gets one row per paying manager
-- whose league they co-manage. manager_subscriptions RLS only shows a user
-- their own row, so co-managers need this definer function. It exposes the
-- paying manager's name, the shared league names and paid_until, nothing else.
CREATE FUNCTION public.get_my_subscription_status()
  RETURNS TABLE (owner_id uuid, owner_name text, is_own boolean, paid_until date, league_names text[])
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT u.id, public.user_display_name(u.raw_user_meta_data), true, s.paid_until, NULL::text[]
  FROM auth.users u
  JOIN public.manager_subscriptions s ON s.user_id = u.id
  WHERE u.id = (SELECT auth.uid())
    AND u.raw_app_meta_data ->> 'role' = 'manager'
  UNION ALL
  SELECT o.id, public.user_display_name(o.raw_user_meta_data), false, s.paid_until,
         array_agg(l.name::text ORDER BY l.name)
  FROM public.league_managers lm
  JOIN public.leagues l ON l.id = lm.league_id AND COALESCE(l.deleted, false) = false
  JOIN auth.users o ON o.id = l.created_by AND o.raw_app_meta_data ->> 'role' = 'manager'
  JOIN public.manager_subscriptions s ON s.user_id = o.id
  WHERE lm.user_id = (SELECT auth.uid())
  GROUP BY o.id, s.paid_until;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_subscription_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_status() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. get_manager_overview: payment columns, hidden flag, co-managers
-- ----------------------------------------------------------------------------
-- Return type grows, so the function is dropped and recreated in the same
-- transaction; the existing 15 columns keep their names, types and order.
--
-- Usage change: a tournament inside a league now counts for the league's
-- creator (the paying manager), also when a co-manager created it. Before, it
-- counted for whoever created the tournament, so co-managers' work was missing.
DROP FUNCTION IF EXISTS public.get_manager_overview();

CREATE FUNCTION public.get_manager_overview()
  RETURNS TABLE (
    user_id              uuid,
    email                text,
    full_name            text,
    role                 text,
    is_banned            boolean,
    paid_until           date,
    notes                text,
    tournament_count     bigint,
    league_count         bigint,
    created_at           timestamptz,
    last_sign_in_at      timestamptz,
    tournaments_30d      bigint,
    matches_30d          bigint,
    players_30d          bigint,
    last_activity_at     timestamptz,
    paid_at              date,
    period_months        integer,
    hidden_from_overview boolean,
    co_managers          jsonb
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
  WITH owned AS (
    -- aliased: created_at/updated_at would collide with the OUT columns in plpgsql
    SELECT tr.id, COALESCE(lg.created_by, tr.user_id) AS owner_id,
           tr.created_at AS t_created, tr.updated_at AS t_updated
    FROM public.tournaments tr
    LEFT JOIN public.leagues lg ON lg.id = tr.league_id AND COALESCE(lg.deleted, false) = false
    WHERE COALESCE(tr.deleted, false) = false
      AND COALESCE(lg.created_by, tr.user_id) IS NOT NULL
  ),
  t_all AS (
    SELECT owner_id, count(*) AS cnt FROM owned GROUP BY owner_id
  ),
  t_30 AS (
    SELECT owner_id, count(*) AS cnt FROM owned WHERE t_created >= now() - interval '30 days' GROUP BY owner_id
  ),
  m_30 AS (
    SELECT o.owner_id,
           count(DISTINCT m.id) AS matches,          -- the lateral doubles rows per match
           count(DISTINCT p.player_id) AS players,
           max(m.completed_at) AS last_completed
    FROM public.matches m
    JOIN owned o ON o.id = m.tournament_id
    CROSS JOIN LATERAL (VALUES (m.player1_id), (m.player2_id)) AS p(player_id)
    WHERE m.status = 'completed'
      AND m.completed_at >= now() - interval '30 days'
      AND p.player_id IS NOT NULL
    GROUP BY o.owner_id
  ),
  m_any AS (
    SELECT o.owner_id, max(m.completed_at) AS last_completed
    FROM public.matches m JOIN owned o ON o.id = m.tournament_id
    WHERE m.status = 'completed'
    GROUP BY o.owner_id
  ),
  t_last AS (
    SELECT owner_id, max(t_updated) AS last_updated FROM owned GROUP BY owner_id
  ),
  l_all AS (
    SELECT lg.created_by AS owner_id, count(*) AS cnt
    FROM public.leagues lg WHERE COALESCE(lg.deleted, false) = false GROUP BY lg.created_by
  ),
  co_leagues AS (
    -- one row per (paying manager, co-manager) with the leagues they share
    SELECT lg.created_by AS owner_id,
           cu.id AS co_id,
           cu.email::text AS co_email,
           public.user_display_name(cu.raw_user_meta_data) AS co_name,
           (cu.raw_app_meta_data ->> 'role')::text AS co_role,
           jsonb_agg(lg.name ORDER BY lg.name) AS co_league_names
    FROM public.league_managers lm
    JOIN public.leagues lg ON lg.id = lm.league_id
    JOIN auth.users cu ON cu.id = lm.user_id
    WHERE COALESCE(lg.deleted, false) = false AND lg.created_by IS NOT NULL
    GROUP BY lg.created_by, cu.id
  ),
  co AS (
    SELECT cl.owner_id,
           jsonb_agg(jsonb_build_object(
             'user_id', cl.co_id,
             'email', cl.co_email,
             'full_name', cl.co_name,
             'role', cl.co_role,
             'leagues', cl.co_league_names
           ) ORDER BY cl.co_name NULLS LAST, cl.co_email) AS list
    FROM co_leagues cl
    GROUP BY cl.owner_id
  )
  SELECT
    u.id,
    u.email::text,
    public.user_display_name(u.raw_user_meta_data),
    (u.raw_app_meta_data ->> 'role')::text,
    COALESCE(u.banned_until > now(), false),
    s.paid_until,
    s.notes,
    COALESCE(t_all.cnt, 0),
    COALESCE(l_all.cnt, 0),
    u.created_at,
    u.last_sign_in_at,
    COALESCE(t_30.cnt, 0),
    COALESCE(m_30.matches, 0),
    COALESCE(m_30.players, 0),
    GREATEST(t_last.last_updated, m_any.last_completed),
    s.paid_at,
    s.period_months,
    COALESCE(s.hidden_from_overview, false),
    COALESCE(co.list, '[]'::jsonb)
  FROM auth.users u
  LEFT JOIN public.manager_subscriptions s ON s.user_id = u.id
  LEFT JOIN t_all  ON t_all.owner_id  = u.id
  LEFT JOIN t_30   ON t_30.owner_id   = u.id
  LEFT JOIN m_30   ON m_30.owner_id   = u.id
  LEFT JOIN m_any  ON m_any.owner_id  = u.id
  LEFT JOIN t_last ON t_last.owner_id = u.id
  LEFT JOIN l_all  ON l_all.owner_id  = u.id
  LEFT JOIN co     ON co.owner_id     = u.id
  WHERE u.raw_app_meta_data ->> 'role' IN ('manager', 'admin')
  ORDER BY u.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_manager_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_overview() TO authenticated;

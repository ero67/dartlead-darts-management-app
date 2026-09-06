-- Admin overview: extend get_manager_overview() with recent-usage figures so
-- the admin panel can show subscription health (trial ending, expired,
-- inactive) and usage per manager (what the invoice buys them) without extra
-- round trips. Return type changes, so the function is dropped first.
--
-- Usage window: last 30 days. "Activity" = a tournament they own being
-- created/updated or a match in it completing.
DROP FUNCTION IF EXISTS public.get_manager_overview();

CREATE FUNCTION public.get_manager_overview()
  RETURNS TABLE (
    user_id            uuid,
    email              text,
    full_name          text,
    role               text,
    is_banned          boolean,
    paid_until         date,
    notes              text,
    tournament_count   bigint,
    league_count       bigint,
    created_at         timestamptz,
    last_sign_in_at    timestamptz,
    tournaments_30d    bigint,
    matches_30d        bigint,
    players_30d        bigint,
    last_activity_at   timestamptz
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
    SELECT tr.id, tr.user_id AS owner_id, tr.created_at AS t_created, tr.updated_at AS t_updated
    FROM public.tournaments tr
    WHERE COALESCE(tr.deleted, false) = false AND tr.user_id IS NOT NULL
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
    GREATEST(t_last.last_updated, m_any.last_completed)
  FROM auth.users u
  LEFT JOIN public.manager_subscriptions s ON s.user_id = u.id
  LEFT JOIN t_all  ON t_all.owner_id  = u.id
  LEFT JOIN t_30   ON t_30.owner_id   = u.id
  LEFT JOIN m_30   ON m_30.owner_id   = u.id
  LEFT JOIN m_any  ON m_any.owner_id  = u.id
  LEFT JOIN t_last ON t_last.owner_id = u.id
  LEFT JOIN l_all  ON l_all.owner_id  = u.id
  WHERE u.raw_app_meta_data ->> 'role' IN ('manager', 'admin')
  ORDER BY u.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_manager_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_overview() TO authenticated;

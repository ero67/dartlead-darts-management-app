-- Admin "Managers" tab: every non-deleted league with its creator, its
-- co-managers and its size, so the admin can see per manager what they created
-- and when. One row per league; the client groups by created_by (leagues
-- created) and by co_manager_ids (leagues co-managed) and joins the billing
-- columns from get_manager_overview().
--
-- Additive only: a new function, nothing existing changes.
CREATE FUNCTION public.get_manager_leagues()
  RETURNS TABLE (
    league_id        uuid,
    name             text,
    status           text,
    is_demo          boolean,
    created_by       uuid,
    created_at       timestamptz,
    member_count     bigint,
    tournament_count bigint,
    co_manager_ids   uuid[]
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
    l.id,
    l.name::text,
    l.status::text,
    COALESCE(l.is_demo, false),
    l.created_by,
    l.created_at,
    (SELECT count(*) FROM public.league_members m WHERE m.league_id = l.id AND m.is_active),
    (SELECT count(*) FROM public.tournaments t WHERE t.league_id = l.id AND COALESCE(t.deleted, false) = false),
    COALESCE((SELECT array_agg(lm.user_id ORDER BY lm.created_at) FROM public.league_managers lm WHERE lm.league_id = l.id), '{}')
  FROM public.leagues l
  WHERE COALESCE(l.deleted, false) = false
  ORDER BY l.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_manager_leagues() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_leagues() TO authenticated;

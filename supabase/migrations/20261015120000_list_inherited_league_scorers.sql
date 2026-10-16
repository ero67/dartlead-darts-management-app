-- A tournament inside a league inherits the league's scorers for permission
-- purposes (can_score_tournament), but list_tournament_scorers only returned
-- the tournament's own allowlist, so the Scorers panel looked empty while
-- league scorers could already count. Return both, tagged by `source`, so the
-- panel can show inherited scorers read-only. A user on both lists shows once,
-- as the tournament's own entry (that is the row the manager can remove).
--
-- The return type changes, so the function is dropped first. Older installed
-- apps only read user_id/email/full_name and keep working.

DROP FUNCTION IF EXISTS public.list_tournament_scorers(uuid);

CREATE FUNCTION public.list_tournament_scorers(t_id uuid)
  RETURNS TABLE (user_id uuid, email text, full_name text, created_at timestamptz, source text)
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
  WITH own AS (
    SELECT ts.user_id, ts.created_at, 'tournament'::text AS source
    FROM public.tournament_scorers ts
    WHERE ts.tournament_id = t_id
  ),
  inherited AS (
    SELECT ls.user_id, ls.created_at, 'league'::text AS source
    FROM public.tournaments t
    JOIN public.league_scorers ls ON ls.league_id = t.league_id
    WHERE t.id = t_id
      AND NOT EXISTS (SELECT 1 FROM own WHERE own.user_id = ls.user_id)
  ),
  rows AS (SELECT * FROM own UNION ALL SELECT * FROM inherited)
  SELECT r.user_id, u.email::text,
         public.user_display_name(u.raw_user_meta_data),
         r.created_at, r.source
  FROM rows r
  JOIN auth.users u ON u.id = r.user_id
  ORDER BY r.source DESC, r.created_at;  -- own ('tournament') first, then inherited ('league')
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_tournament_scorers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tournament_scorers(uuid) TO authenticated;

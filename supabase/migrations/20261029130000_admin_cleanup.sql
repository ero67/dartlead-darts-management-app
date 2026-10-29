-- Admin cleanup of test data. Deleting a tournament in the app only hides it
-- (tournaments.deleted), so test players stay pinned by its matches, which
-- block deleting a player (no ON DELETE on matches/legs/dart_throws).
--
-- 1. admin_deleted_tournaments() lists hidden tournaments; purge_tournaments()
--    removes them for good (matches, legs, throws, stats cascade). One whose
--    results still count in a live league is skipped.
-- 2. player_delete_block(p) says why a player can't go (NULL = deletable);
--    delete_players() deletes the deletable ones and reports the rest.
-- 3. admin_player_directory() gains delete_block and counts only tournaments
--    and matches that are still visible.
-- Each removal is logged in admin_audit_log. Installed Android apps don't call
-- any of these. Idempotent.

CREATE OR REPLACE FUNCTION public.admin_deleted_tournaments()
  RETURNS TABLE (
    id uuid, name text, created_at timestamptz, status text, owner_name text,
    players int, matches int, in_live_league boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.name::text, t.created_at, t.status::text,
    COALESCE(public.user_display_name(o.raw_user_meta_data), o.email::text),
    (SELECT count(*)::int FROM public.tournament_players tp WHERE tp.tournament_id = t.id),
    (SELECT count(*)::int FROM public.matches m WHERE m.tournament_id = t.id AND m.status = 'completed'),
    EXISTS (SELECT 1 FROM public.league_tournament_results r
            JOIN public.leagues l ON l.id = r.league_id
            WHERE r.tournament_id = t.id AND NOT COALESCE(l.deleted, false))
  FROM public.tournaments t
  LEFT JOIN auth.users o ON o.id = t.user_id
  WHERE t.deleted
  ORDER BY t.created_at DESC, t.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_deleted_tournaments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_deleted_tournaments() TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_tournaments(ids uuid[])
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  t       public.tournaments;
  purged  jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  FOR t IN SELECT * FROM public.tournaments WHERE id = ANY(ids) FOR UPDATE LOOP
    IF NOT t.deleted THEN
      skipped := skipped || jsonb_build_object('name', t.name, 'reason', 'not_deleted');
    ELSIF EXISTS (SELECT 1 FROM public.league_tournament_results r
                  JOIN public.leagues l ON l.id = r.league_id
                  WHERE r.tournament_id = t.id AND NOT COALESCE(l.deleted, false)) THEN
      skipped := skipped || jsonb_build_object('name', t.name, 'reason', 'in_live_league');
    ELSE
      DELETE FROM public.tournaments WHERE id = t.id;
      INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, details)
      VALUES ((SELECT auth.uid()), 'purge_tournament', t.user_id,
              jsonb_build_object('tournament_id', t.id, 'name', t.name, 'created_at', t.created_at));
      purged := purged || to_jsonb(t.name);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('purged', purged, 'skipped', skipped);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_tournaments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_tournaments(uuid[]) TO authenticated;

-- Why a player can't be deleted, or NULL. Hidden tournaments and leagues
-- don't count: deleting the player just drops those rows with them.
CREATE OR REPLACE FUNCTION public.player_delete_block(p_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT CASE
    WHEN p.user_id IS NOT NULL THEN 'has_account'
    WHEN EXISTS (SELECT 1 FROM public.matches m
                 LEFT JOIN public.tournaments t ON t.id = m.tournament_id
                 WHERE p_id IN (m.player1_id, m.player2_id, m.winner_id)
                   AND NOT COALESCE(t.deleted, false)) THEN 'has_matches'
    -- Gone once its hidden tournaments are purged.
    WHEN EXISTS (SELECT 1 FROM public.matches m
                 WHERE p_id IN (m.player1_id, m.player2_id, m.winner_id)) THEN 'hidden_matches'
    WHEN EXISTS (SELECT 1 FROM public.tournament_players tp
                 JOIN public.tournaments t ON t.id = tp.tournament_id
                 WHERE tp.player_id = p_id AND NOT COALESCE(t.deleted, false)) THEN 'in_tournament'
    WHEN EXISTS (SELECT 1 FROM public.tournaments t
                 WHERE NOT COALESCE(t.deleted, false) AND t.playoffs::text LIKE '%' || p_id::text || '%') THEN 'in_bracket'
    WHEN EXISTS (SELECT 1 FROM public.leagues l
                 WHERE NOT COALESCE(l.deleted, false) AND (
                   EXISTS (SELECT 1 FROM public.league_members x WHERE x.league_id = l.id AND x.player_id = p_id)
                   OR EXISTS (SELECT 1 FROM public.league_tournament_results x WHERE x.league_id = l.id AND x.player_id = p_id)
                   OR EXISTS (SELECT 1 FROM public.league_leaderboard x WHERE x.league_id = l.id AND x.player_id = p_id)
                   OR EXISTS (SELECT 1 FROM public.league_seasons s
                              WHERE s.league_id = l.id AND s.standings::text LIKE '%' || p_id::text || '%'))) THEN 'in_league'
  END
  FROM public.players p WHERE p.id = p_id;
$$;
REVOKE EXECUTE ON FUNCTION public.player_delete_block(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.delete_players(ids uuid[])
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  p       public.players;
  reason  text;
  deleted jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  FOR p IN SELECT * FROM public.players WHERE id = ANY(ids) FOR UPDATE LOOP
    reason := public.player_delete_block(p.id);
    IF reason IS NULL THEN
      BEGIN
        DELETE FROM public.players WHERE id = p.id;
        INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, details)
        VALUES ((SELECT auth.uid()), 'delete_player', NULL, jsonb_build_object('source', to_jsonb(p)));
        deleted := deleted || to_jsonb(p.name);
      EXCEPTION WHEN foreign_key_violation THEN
        reason := 'in_use';  -- a table the checks above don't know about
      END;
    END IF;
    IF reason IS NOT NULL THEN
      skipped := skipped || jsonb_build_object('name', p.name, 'reason', reason);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('deleted', deleted, 'skipped', skipped);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_players(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_players(uuid[]) TO authenticated;

-- Return type changes, so drop first. Only the admin panel calls it.
DROP FUNCTION IF EXISTS public.admin_player_directory();
CREATE FUNCTION public.admin_player_directory()
  RETURNS TABLE (
    id uuid, name text, user_id uuid, account_email text, account_name text,
    last_sign_in_at timestamptz, owner_name text, created_at timestamptz,
    tournaments int, matches int, delete_block text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name::text, p.user_id,
    u.email::text, public.user_display_name(u.raw_user_meta_data), u.last_sign_in_at,
    COALESCE(public.user_display_name(o.raw_user_meta_data), o.email::text),
    p.created_at,
    (SELECT count(*)::int FROM public.tournament_players tp
     JOIN public.tournaments t ON t.id = tp.tournament_id
     WHERE tp.player_id = p.id AND NOT COALESCE(t.deleted, false)),
    (SELECT count(*)::int FROM public.matches m
     LEFT JOIN public.tournaments t ON t.id = m.tournament_id
     WHERE m.status = 'completed' AND NOT COALESCE(t.deleted, false) AND (m.player1_id = p.id OR m.player2_id = p.id)),
    public.player_delete_block(p.id)
  FROM public.players p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN auth.users o ON o.id = p.owner_id
  ORDER BY p.name, p.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_player_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_player_directory() TO authenticated;

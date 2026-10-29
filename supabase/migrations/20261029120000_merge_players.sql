-- Duplicate player records: one person stored as several players rows splits
-- their statistics. Two causes: per-manager rosters (a second manager typing a
-- known name gets a new row) and exact, case-sensitive name matching ("mauro"
-- vs "Mauro", a self-registration typed in capitals).
--
-- 1. merge_players(source, target): admin-only, one transaction. Repoints every
--    foreign key to players (discovered from the catalog, so a future table is
--    covered too), rewrites ids inside JSONB (brackets, match results, season
--    standings), keeps the account link, and rebuilds affected leaderboards.
--    Replaces the client-side merge, which missed brackets, could drop the
--    account link and could stop half-way.
-- 2. admin_player_directory(): every player with its account (email, name,
--    last sign-in), owner and usage, so the admin can tell duplicates apart.
-- 3. league_member_player: the own-roster fallback matches names ignoring case,
--    like the league lookup above it already does.
-- Installed Android apps keep working: only new functions and a body change
-- with the same signature. Idempotent.

CREATE OR REPLACE FUNCTION public.merge_players(source_id uuid, target_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  src     public.players;
  tgt     public.players;
  fk      record;
  n       int;
  l_id    uuid;
  moved   jsonb := '{}'::jsonb;
  src_txt text := source_id::text;
  tgt_txt text := target_id::text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF source_id = target_id THEN
    RAISE EXCEPTION 'SAME_PLAYER';
  END IF;

  SELECT * INTO src FROM public.players WHERE id = source_id FOR UPDATE;
  SELECT * INTO tgt FROM public.players WHERE id = target_id FOR UPDATE;
  IF src.id IS NULL OR tgt.id IS NULL THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;
  IF src.user_id IS NOT NULL AND tgt.user_id IS NOT NULL AND src.user_id <> tgt.user_id THEN
    RAISE EXCEPTION 'BOTH_LINKED';
  END IF;

  -- Rows where both records exist under the same unique key: the target's row
  -- stays, enriched with what the source's row had.
  UPDATE public.league_members t
  SET is_active = true, left_at = NULL, joined_at = LEAST(t.joined_at, s.joined_at)
  FROM public.league_members s
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.league_id = s.league_id
    AND s.is_active AND NOT t.is_active;
  UPDATE public.league_leaderboard t
  SET manual_points = COALESCE(t.manual_points, 0) + COALESCE(s.manual_points, 0)
  FROM public.league_leaderboard s
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.league_id = s.league_id
    AND COALESCE(s.manual_points, 0) <> 0;

  DELETE FROM public.tournament_players s USING public.tournament_players t
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.tournament_id = s.tournament_id;
  DELETE FROM public.group_players s USING public.group_players t
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.group_id = s.group_id;
  DELETE FROM public.league_members s USING public.league_members t
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.league_id = s.league_id;
  DELETE FROM public.league_leaderboard s USING public.league_leaderboard t
  WHERE s.player_id = source_id AND t.player_id = target_id AND t.league_id = s.league_id;
  DELETE FROM public.league_tournament_results s USING public.league_tournament_results t
  WHERE s.player_id = source_id AND t.player_id = target_id
    AND t.league_id = s.league_id AND t.tournament_id = s.tournament_id;

  -- players.user_id is uniquely indexed: free it on the source first.
  IF src.user_id IS NOT NULL AND tgt.user_id IS NULL THEN
    UPDATE public.players SET user_id = NULL WHERE id = source_id;
    UPDATE public.players SET user_id = src.user_id WHERE id = target_id;
    moved := moved || jsonb_build_object('account_link', 1);
  END IF;

  FOR fk IN
    SELECT DISTINCT c.conrelid::regclass::text AS tbl, a.attname::text AS col
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.players'::regclass
      AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.col, fk.col)
      USING target_id, source_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      moved := moved || jsonb_build_object(fk.tbl || '.' || fk.col, n);
    END IF;
  END LOOP;

  -- Ids copied into JSONB (a uuid's text never occurs by accident).
  UPDATE public.tournaments SET playoffs = replace(playoffs::text, src_txt, tgt_txt)::jsonb
  WHERE playoffs::text LIKE '%' || src_txt || '%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('tournaments.playoffs', n); END IF;

  UPDATE public.matches SET result = replace(result::text, src_txt, tgt_txt)::jsonb
  WHERE result::text LIKE '%' || src_txt || '%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('matches.result', n); END IF;

  UPDATE public.matches SET live_state = replace(live_state::text, src_txt, tgt_txt)::jsonb
  WHERE live_state::text LIKE '%' || src_txt || '%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('matches.live_state', n); END IF;

  UPDATE public.league_seasons SET standings = replace(standings::text, src_txt, tgt_txt)::jsonb
  WHERE standings::text LIKE '%' || src_txt || '%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN moved := moved || jsonb_build_object('league_seasons.standings', n); END IF;

  DELETE FROM public.players WHERE id = source_id;

  FOR l_id IN
    SELECT league_id FROM public.league_members WHERE player_id = target_id
    UNION
    SELECT league_id FROM public.league_tournament_results WHERE player_id = target_id
  LOOP
    PERFORM public.rebuild_league_leaderboard(l_id);
  END LOOP;

  -- The deleted row is kept here, so a merge can be traced and undone by hand.
  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, details)
  VALUES ((SELECT auth.uid()), 'merge_players', COALESCE(tgt.user_id, src.user_id),
          jsonb_build_object('source', to_jsonb(src), 'target_id', target_id, 'moved', moved));

  RETURN jsonb_build_object('success', true, 'moved', moved);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.merge_players(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_players(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_player_directory()
  RETURNS TABLE (
    id uuid, name text, user_id uuid, account_email text, account_name text,
    last_sign_in_at timestamptz, owner_name text, created_at timestamptz,
    tournaments int, matches int
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
    (SELECT count(*)::int FROM public.tournament_players tp WHERE tp.player_id = p.id),
    (SELECT count(*)::int FROM public.matches m
     WHERE m.status = 'completed' AND (m.player1_id = p.id OR m.player2_id = p.id))
  FROM public.players p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN auth.users o ON o.id = p.owner_id
  ORDER BY p.name, p.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_player_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_player_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.league_member_player(l_id uuid, p_name text, p_user_id uuid DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid  uuid := (SELECT auth.uid());
  nm   text := btrim(COALESCE(p_name, ''));
  prow RECORD;
BEGIN
  IF NOT public.can_manage_league(l_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF nm = '' THEN
    RAISE EXCEPTION 'MISSING_PLAYER_NAME';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT p.id INTO prow FROM public.players p WHERE p.user_id = p_user_id LIMIT 1;
    IF prow.id IS NOT NULL THEN
      RETURN prow.id;
    END IF;
  END IF;

  SELECT p.id, p.user_id INTO prow
  FROM public.league_members lm
  JOIN public.players p ON p.id = lm.player_id
  WHERE lm.league_id = l_id AND lower(p.name) = lower(nm)
  ORDER BY (p.owner_id = uid) DESC, lm.left_at NULLS FIRST
  LIMIT 1;

  IF prow.id IS NULL THEN
    SELECT p.id, p.user_id INTO prow
    FROM public.players p WHERE p.owner_id = uid AND lower(btrim(p.name)) = lower(nm)
    ORDER BY (p.name = nm) DESC, p.created_at
    LIMIT 1;
  END IF;

  IF prow.id IS NULL THEN
    INSERT INTO public.players (name, owner_id, user_id)
    VALUES (nm, uid, p_user_id)
    RETURNING id, user_id INTO prow;
    RETURN prow.id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF prow.user_id IS NOT NULL AND prow.user_id <> p_user_id THEN
      RAISE EXCEPTION 'PLAYER_NAME_TAKEN';
    END IF;
    IF prow.user_id IS NULL THEN
      UPDATE public.players SET user_id = p_user_id WHERE id = prow.id;
    END IF;
  END IF;
  RETURN prow.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.league_member_player(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_member_player(uuid, text, uuid) TO authenticated;

-- Admin cleanup of made-up match stats. When a board misbehaves, managers
-- sometimes click a match through with invented visits: the winner and legs
-- are real, the averages, checkouts and darts are not, and they end up on the
-- league top-10 boards.
--
-- 1. admin_match_stats_review(league) lists a league's completed X01 matches
--    with each side's numbers and two hints: "repetitive" (half or more of the
--    visits share one score, at least 8 visits) and "aboveAverage" (match
--    average 15+ over the player's average in their other league matches).
-- 2. admin_clear_match_stats(ids) backs the stats up into match_stats_backups
--    and removes them in the same transaction: the result JSONB loses
--    player1Stats/player2Stats, match_player_stats keeps its legs but zeroes
--    darts, score, average and checkout. Winner, legs and status stay.
-- 3. admin_restore_match_stats(ids) puts the backup back, unless the match
--    has stats again (re-scored since), which it leaves alone.
-- Every reader already skips matches without stats. Each clear/restore is
-- logged in admin_audit_log. Installed Android apps don't call any of these.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.match_stats_backups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  result_stats  jsonb NOT NULL,
  player_stats  jsonb NOT NULL,
  cleared_by    uuid,
  cleared_at    timestamptz NOT NULL DEFAULT now(),
  restored_by   uuid,
  restored_at   timestamptz
);
-- Read and written only through the functions below.
ALTER TABLE public.match_stats_backups ENABLE ROW LEVEL SECURITY;
-- One open backup per match: a second clear can't replace it with nothing.
CREATE UNIQUE INDEX IF NOT EXISTS match_stats_backups_open_idx
  ON public.match_stats_backups (match_id) WHERE restored_at IS NULL;

-- Text to numeric, NULL for anything else (legacy checkouts are "T20 + D20").
CREATE OR REPLACE FUNCTION public.safe_numeric(v text)
  RETURNS numeric
  LANGUAGE sql
  IMMUTABLE
  SET search_path = ''
AS $$
  SELECT CASE WHEN v ~ '^-?[0-9]+(\.[0-9]+)?$' THEN v::numeric END;
$$;

CREATE OR REPLACE FUNCTION public.admin_match_stats_review(p_league_id uuid)
  RETURNS TABLE (
    match_id uuid, tournament_id uuid, tournament_name text,
    tournament_created_at timestamptz, completed_at timestamptz,
    is_playoff boolean, has_stats boolean, stats_cleared boolean,
    p1 jsonb, p2 jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lm AS (
    SELECT mt.id AS mid, mt.tournament_id AS tid, t.name::text AS tname, t.created_at AS tcreated,
           mt.completed_at AS done_at, COALESCE(mt.is_playoff, false) AS playoff,
           mt.player1_id, mt.player2_id, mt.player1_legs, mt.player2_legs, mt.result
    FROM public.matches mt
    JOIN public.tournaments t ON t.id = mt.tournament_id
    WHERE t.league_id = p_league_id
      AND NOT COALESCE(t.deleted, false)
      AND COALESCE(t.game_type, 'x01') <> 'cricket'
      AND mt.status = 'completed'
  ),
  sides AS (
    SELECT lm.mid, s.n, pl.id AS pid, pl.name::text AS pname,
           CASE s.n WHEN 1 THEN lm.player1_legs ELSE lm.player2_legs END AS legs,
           CASE WHEN jsonb_typeof(lm.result -> ('player' || s.n || 'Stats')) = 'object'
                THEN lm.result -> ('player' || s.n || 'Stats') END AS st
    FROM lm
    CROSS JOIN (VALUES (1), (2)) AS s(n)
    LEFT JOIN public.players pl ON pl.id = CASE s.n WHEN 1 THEN lm.player1_id ELSE lm.player2_id END
  ),
  calc AS (
    SELECT sd.mid, sd.n, sd.pid, sd.pname, sd.legs, sd.st IS NOT NULL AS has,
           public.safe_numeric(sd.st ->> 'average') AS avg,
           public.safe_numeric(sd.st ->> 'totalScore') AS score,
           public.safe_numeric(sd.st ->> 'totalDarts') AS darts,
           public.safe_numeric(sd.st ->> 'oneEighties') AS o180,
           (SELECT max(public.safe_numeric(c ->> 'checkout'))
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sd.st -> 'checkouts') = 'array'
                                             THEN sd.st -> 'checkouts' ELSE '[]'::jsonb END) c) AS best_co,
           (SELECT min(public.safe_numeric(l ->> 'darts'))
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sd.st -> 'legs') = 'array'
                                             THEN sd.st -> 'legs' ELSE '[]'::jsonb END) l
             WHERE l ->> 'isWin' = 'true') AS fewest,
           COALESCE(v.visits, 0) AS visits, v.top
    FROM sides sd
    LEFT JOIN LATERAL (
      SELECT sum(g.cnt)::int AS visits, max(g.cnt)::int AS top
      FROM (SELECT count(*) AS cnt
              FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(sd.st -> 'visitScores') = 'array'
                                                  THEN sd.st -> 'visitScores' ELSE '[]'::jsonb END) x
             GROUP BY x) g
    ) v ON true
  ),
  -- Each player's league totals; the side's own match is subtracted below.
  tot AS (
    SELECT c.pid, sum(c.score) AS s, sum(c.darts) AS d
    FROM calc c
    WHERE c.pid IS NOT NULL AND c.darts > 0 AND c.score IS NOT NULL
    GROUP BY c.pid
  ),
  side AS (
    SELECT c.*,
           CASE WHEN tot.d - (CASE WHEN c.darts > 0 AND c.score IS NOT NULL THEN c.darts ELSE 0 END) > 0
                THEN round((tot.s - (CASE WHEN c.darts > 0 AND c.score IS NOT NULL THEN c.score ELSE 0 END))
                           / (tot.d - (CASE WHEN c.darts > 0 AND c.score IS NOT NULL THEN c.darts ELSE 0 END)) * 3, 2)
           END AS own
    FROM calc c
    LEFT JOIN tot ON tot.pid = c.pid
  ),
  js AS (
    SELECT side.mid, side.n, side.has,
           jsonb_build_object(
             'id', side.pid, 'name', side.pname, 'legs', side.legs,
             'average', round(side.avg, 2), 'bestCheckout', side.best_co,
             'fewestDarts', side.fewest, 'oneEighties', side.o180,
             'visits', side.visits,
             'repeatShare', CASE WHEN side.visits > 0 THEN round(side.top::numeric / side.visits, 2) END,
             'ownAverage', side.own,
             'repetitive', side.visits >= 8 AND side.top::numeric / side.visits >= 0.5,
             'aboveAverage', COALESCE(side.avg >= side.own + 15, false)
           ) AS j
    FROM side
  )
  SELECT lm.mid, lm.tid, lm.tname, lm.tcreated, lm.done_at, lm.playoff,
         a.has OR b.has,
         EXISTS (SELECT 1 FROM public.match_stats_backups bk WHERE bk.match_id = lm.mid AND bk.restored_at IS NULL),
         a.j, b.j
  FROM lm
  JOIN js a ON a.mid = lm.mid AND a.n = 1
  JOIN js b ON b.mid = lm.mid AND b.n = 2
  ORDER BY lm.tcreated, lm.done_at, lm.mid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_match_stats_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_match_stats_review(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_clear_match_stats(p_match_ids uuid[])
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  mid     uuid;
  m       public.matches;
  owner   uuid;
  gtype   text;
  cleared jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_match_ids), 0) > 20 THEN
    RAISE EXCEPTION 'too_many_matches' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT mt.tournament_id) FROM public.matches mt WHERE mt.id = ANY (p_match_ids)) > 1 THEN
    RAISE EXCEPTION 'mixed_tournaments' USING ERRCODE = '22023';
  END IF;

  FOR mid IN SELECT DISTINCT unnest(p_match_ids) LOOP
    SELECT * INTO m FROM public.matches WHERE id = mid FOR UPDATE;
    IF NOT FOUND THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'not_found');
      CONTINUE;
    END IF;
    SELECT t.user_id, t.game_type INTO owner, gtype FROM public.tournaments t WHERE t.id = m.tournament_id;

    IF m.status IS DISTINCT FROM 'completed' THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'not_completed');
    ELSIF gtype = 'cricket' OR m.game_type = 'cricket' OR m.result ->> 'gameType' = 'cricket' THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'cricket');
    ELSIF EXISTS (SELECT 1 FROM public.match_stats_backups b WHERE b.match_id = mid AND b.restored_at IS NULL) THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'already_cleared');
    ELSIF NOT COALESCE(m.result ? 'player1Stats' OR m.result ? 'player2Stats', false) THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'no_stats');
    ELSE
      INSERT INTO public.match_stats_backups (match_id, result_stats, player_stats, cleared_by)
      VALUES (
        mid,
        jsonb_build_object('player1Stats', m.result -> 'player1Stats', 'player2Stats', m.result -> 'player2Stats'),
        COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM public.match_player_stats s WHERE s.match_id = mid), '[]'::jsonb),
        (SELECT auth.uid())
      );
      UPDATE public.matches SET result = result - 'player1Stats' - 'player2Stats' WHERE id = mid;
      UPDATE public.match_player_stats
         SET total_darts = 0, total_score = 0, average = 0, highest_checkout = 0
       WHERE match_id = mid;
      INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, details)
      VALUES ((SELECT auth.uid()), 'clear_match_stats', owner,
              jsonb_build_object('match_id', mid, 'tournament_id', m.tournament_id));
      cleared := cleared || to_jsonb(mid);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('cleared', cleared, 'skipped', skipped);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_clear_match_stats(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_match_stats(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restore_match_stats(p_match_ids uuid[])
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  mid      uuid;
  m        public.matches;
  bk       public.match_stats_backups;
  owner    uuid;
  restored jsonb := '[]'::jsonb;
  skipped  jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_match_ids), 0) > 20 THEN
    RAISE EXCEPTION 'too_many_matches' USING ERRCODE = '22023';
  END IF;

  FOR mid IN SELECT DISTINCT unnest(p_match_ids) LOOP
    SELECT * INTO bk FROM public.match_stats_backups b
     WHERE b.match_id = mid AND b.restored_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'no_backup');
      CONTINUE;
    END IF;
    SELECT * INTO m FROM public.matches WHERE id = mid FOR UPDATE;
    IF COALESCE(m.result ? 'player1Stats' OR m.result ? 'player2Stats', false) THEN
      skipped := skipped || jsonb_build_object('match_id', mid, 'reason', 'rescored');
      CONTINUE;
    END IF;

    UPDATE public.matches
       SET result = COALESCE(result, '{}'::jsonb) || jsonb_strip_nulls(bk.result_stats)
     WHERE id = mid;
    UPDATE public.match_player_stats s
       SET total_darts      = (e ->> 'total_darts')::int,
           total_score      = (e ->> 'total_score')::int,
           average          = (e ->> 'average')::numeric,
           highest_checkout = (e ->> 'highest_checkout')::int
      FROM jsonb_array_elements(bk.player_stats) e
     WHERE s.id = (e ->> 'id')::uuid;
    UPDATE public.match_stats_backups
       SET restored_by = (SELECT auth.uid()), restored_at = now()
     WHERE id = bk.id;
    SELECT t.user_id INTO owner FROM public.tournaments t WHERE t.id = m.tournament_id;
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, details)
    VALUES ((SELECT auth.uid()), 'restore_match_stats', owner,
            jsonb_build_object('match_id', mid, 'tournament_id', m.tournament_id));
    restored := restored || to_jsonb(mid);
  END LOOP;

  RETURN jsonb_build_object('restored', restored, 'skipped', skipped);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_restore_match_stats(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_match_stats(uuid[]) TO authenticated;

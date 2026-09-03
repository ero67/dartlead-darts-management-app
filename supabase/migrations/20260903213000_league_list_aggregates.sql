-- ----------------------------------------------------------------------------
-- Aggregates for the league list and leaderboard form indicator.
--
-- getLeagues used to run two COUNT round-trips per league on every app load,
-- and getLeaderboard pulled up to 10k match rows just to derive each
-- player's last five results. Both are plain SECURITY INVOKER functions:
-- RLS on the underlying tables still applies to the caller.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_leagues_summary()
  RETURNS TABLE (league_id uuid, member_count bigint, tournament_count bigint)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $$
  SELECT
    l.id,
    (SELECT count(*) FROM public.league_members lm
      WHERE lm.league_id = l.id AND lm.left_at IS NULL),
    (SELECT count(*) FROM public.tournaments t
      WHERE t.league_id = l.id AND t.deleted = false)
  FROM public.leagues l
  WHERE l.deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_leagues_summary() TO anon, authenticated;

-- Last five completed results per player in a league, newest first.
CREATE OR REPLACE FUNCTION public.get_league_recent_form(l_id uuid)
  RETURNS TABLE (player_id uuid, last5 boolean[])
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
AS $$
  WITH played AS (
    SELECT
      p.player_id,
      (m.winner_id = p.player_id) AS won,
      row_number() OVER (
        PARTITION BY p.player_id
        ORDER BY m.completed_at DESC NULLS LAST, m.updated_at DESC
      ) AS rn
    FROM public.matches m
    JOIN public.tournaments t
      ON t.id = m.tournament_id AND t.league_id = l_id AND t.deleted = false
    CROSS JOIN LATERAL (VALUES (m.player1_id), (m.player2_id)) AS p(player_id)
    WHERE m.status = 'completed' AND p.player_id IS NOT NULL
  )
  SELECT player_id, array_agg(won ORDER BY rn)
  FROM played
  WHERE rn <= 5
  GROUP BY player_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_recent_form(uuid) TO anon, authenticated;

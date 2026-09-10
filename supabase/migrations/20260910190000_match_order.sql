-- Explicit play order for group matches.
--
-- Group matches are generated in an order that avoids the same player in
-- consecutive matches, but that order only lived in row insert order: the
-- fetches had no ORDER BY, so the list showed arbitrary order and the
-- suggested-scorer rotation sorted by id — three orders that disagreed, which
-- is why the advised referee was often someone playing the previous or next
-- match. match_order is set at generation time; existing rows are backfilled
-- from their insert order (created_at, then id).

ALTER TABLE public.matches ADD COLUMN match_order integer;

COMMENT ON COLUMN public.matches.match_order IS 'Intended play order within a group (1-based); NULL for playoff matches, which order by playoff_round/playoff_match_number';

WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY group_id ORDER BY created_at, id) AS rn
  FROM public.matches
  WHERE group_id IS NOT NULL
)
UPDATE public.matches m
SET match_order = ordered.rn
FROM ordered
WHERE m.id = ordered.id;

CREATE INDEX idx_matches_group_order ON public.matches (group_id, match_order);

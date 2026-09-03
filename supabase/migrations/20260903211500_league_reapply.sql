-- ----------------------------------------------------------------------------
-- Let players apply to a league again.
--
-- registerForLeague deletes the caller's own previous registration when it
-- was rejected, or approved but the membership has since been removed, and
-- inserts a fresh pending one. The delete policy only allowed pending rows,
-- so those users were locked out of the league for good.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can withdraw pending league registrations" ON public.league_registrations;

CREATE POLICY "Users can withdraw or reset their league registrations" ON public.league_registrations
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT public.can_manage_league(league_id))
  );

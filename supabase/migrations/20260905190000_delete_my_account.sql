-- Account self-deletion (Google Play requires in-app account deletion for any
-- app with sign-up; it is also the GDPR right to erasure).
--
-- What goes: the auth user (email, password hash, Google identity, display
-- name in metadata), their registrations, scorer entries, subscription ledger
-- rows — all via existing FK cascades once the user row is deleted.
--
-- What stays: tournaments, leagues, matches and player records. Those are the
-- organiser's/venue's records of events that happened; results keep showing
-- the player's name. The player row is merely unlinked from the account
-- (players.user_id / owner_id are ON DELETE SET NULL).
--
-- Without the first UPDATE the FK on tournaments.user_id (ON DELETE CASCADE)
-- would erase every tournament the person ever created — a manager deleting
-- their account must not take a venue's history with them. Ownerless
-- tournaments remain manageable by admins and by league co-managers.
CREATE OR REPLACE FUNCTION public.delete_my_account()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  released_tournaments int := 0;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Release ownership instead of cascading deletes.
  UPDATE public.tournaments SET user_id = NULL WHERE user_id = uid;
  GET DIAGNOSTICS released_tournaments = ROW_COUNT;
  UPDATE public.leagues SET manager_ids = array_remove(manager_ids, uid) WHERE uid = ANY (manager_ids);
  -- leagues.created_by is ON DELETE SET NULL.

  -- References without an ON DELETE rule would block the delete.
  UPDATE public.matches SET started_by_user_id = NULL WHERE started_by_user_id = uid;
  UPDATE public.tournament_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;
  UPDATE public.league_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;

  -- Everything else cascades or nulls out through the FKs.
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'released_tournaments', released_tournaments);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

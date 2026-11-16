-- League logos and player photos (docs/superpowers/specs/2026-11-16-league-logos-and-player-photos-design.md).
-- Files live in the public `media` bucket as avatars/{user_id}.webp and
-- logos/{league_id}.webp; the rows keep the full public URL plus a ?v= stamp.
-- Additive only: older app builds ignore the new columns.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', true, 1048576, '{image/webp}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS logo_url text
  CHECK (logo_url IS NULL OR logo_url LIKE '%/storage/v1/object/public/media/logos/%');
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS avatar_url text;

-- Reads are public (public bucket). Writes: your own avatar, or a logo of a
-- league you manage. FOR ALL covers the SELECT that upsert needs.
CREATE POLICY "media: own avatar" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'media' AND name = 'avatars/' || (SELECT auth.uid()) || '.webp')
  WITH CHECK (bucket_id = 'media' AND name = 'avatars/' || (SELECT auth.uid()) || '.webp');

CREATE POLICY "media: managed league logo" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'media' AND name ~ '^logos/[0-9a-f-]{36}\.webp$'
         AND public.can_manage_league(substring(name from 7 for 36)::uuid))
  WITH CHECK (bucket_id = 'media' AND name ~ '^logos/[0-9a-f-]{36}\.webp$'
              AND public.can_manage_league(substring(name from 7 for 36)::uuid));

-- A signed-in player sets (or with NULL clears) the photo on every player row
-- linked to their account. Only their own file in the bucket is accepted.
CREATE OR REPLACE FUNCTION public.set_my_avatar(url text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF url IS NOT NULL AND url NOT LIKE '%/storage/v1/object/public/media/avatars/' || uid || '.webp%' THEN
    RAISE EXCEPTION 'invalid_avatar_url';
  END IF;
  UPDATE public.players SET avatar_url = url WHERE user_id = uid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_my_avatar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;

-- Account deletion also clears the photo link (the file is removed by the app
-- first). Body otherwise unchanged from 20261025120000.
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
  -- leagues.created_by is ON DELETE SET NULL; league_managers cascades.

  -- References without an ON DELETE rule would block the delete.
  UPDATE public.matches SET started_by_user_id = NULL WHERE started_by_user_id = uid;
  UPDATE public.tournament_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;
  UPDATE public.league_registrations SET reviewed_by = NULL WHERE reviewed_by = uid;

  -- Personal data the FKs do not reach.
  UPDATE public.admin_audit_log SET target_email = NULL WHERE target_user_id = uid;
  UPDATE public.players SET avatar_url = NULL WHERE user_id = uid;

  -- Everything else cascades or nulls out through the FKs.
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'released_tournaments', released_tournaments);
END;
$$;

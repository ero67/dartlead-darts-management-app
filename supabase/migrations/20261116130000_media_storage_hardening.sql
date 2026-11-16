-- Review fixes for 20261116120000_media_storage.sql.

-- Safari cannot encode WebP, so the app falls back to JPEG (photos) or PNG (logos).
UPDATE storage.buckets SET allowed_mime_types = '{image/webp,image/png,image/jpeg}' WHERE id = 'media';

-- Anchored URL check: only the caller's own file on a Supabase host, with the
-- ?v= stamp the app adds. The old LIKE '%…' let any host carry the right path.
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
  IF url IS NOT NULL AND url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/avatars/' || uid || '\.webp\?v=[0-9]+$') THEN
    RAISE EXCEPTION 'invalid_avatar_url';
  END IF;
  UPDATE public.players SET avatar_url = url WHERE user_id = uid;
END;
$$;

-- Only set_my_avatar (definer rights) may set a photo; app users, including
-- the row's owner, can only clear it (unlinking a player from an account).
CREATE OR REPLACE FUNCTION public.players_guard_avatar()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.avatar_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url) THEN
    RAISE EXCEPTION 'A player photo can only be set by the player' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER players_guard_avatar
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.players_guard_avatar();

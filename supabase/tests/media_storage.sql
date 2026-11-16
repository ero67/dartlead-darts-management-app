-- Self-check for 20261116120000_media_storage.sql (media bucket policies,
-- set_my_avatar, delete_my_account clearing the photo). One transaction,
-- rolled back. Runs on staging through the Supabase MCP execute_sql, or locally:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/media_storage.sql
-- Expect the last row: ALL ASSERTS PASSED

BEGIN;

-- A and B are players with accounts; M manages league L.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000a0a1', 'a@media.test', '{}', '{}'),
  ('00000000-0000-0000-0000-00000000b0b1', 'b@media.test', '{}', '{}'),
  ('00000000-0000-0000-0000-00000000c0c1', 'm@media.test', '{"role":"manager"}', '{}');
INSERT INTO public.leagues (id, name, created_by) VALUES
  ('10000000-0000-0000-0000-00000000aaa1', 'Media league', '00000000-0000-0000-0000-00000000c0c1');
INSERT INTO public.players (id, name, owner_id, user_id) VALUES
  ('a0000000-0000-0000-0000-00000000aaa1', 'Media A', '00000000-0000-0000-0000-00000000c0c1', '00000000-0000-0000-0000-00000000a0a1'),
  ('b0000000-0000-0000-0000-00000000bbb1', 'Media B', '00000000-0000-0000-0000-00000000c0c1', '00000000-0000-0000-0000-00000000b0b1');

CREATE FUNCTION pg_temp.act_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.raises(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Player A: own avatar only, no logos, own URL only in set_my_avatar.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a0a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'avatars/00000000-0000-0000-0000-00000000a0a1.webp')$q$), 'own avatar upload blocked';
  ASSERT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'avatars/00000000-0000-0000-0000-00000000b0b1.webp')$q$), 'foreign avatar upload allowed';
  ASSERT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'logos/10000000-0000-0000-0000-00000000aaa1.webp')$q$), 'non-manager logo upload allowed';
  ASSERT pg_temp.raises($q$SELECT public.set_my_avatar('https://evil.example/p.png')$q$), 'foreign avatar URL accepted';
  ASSERT pg_temp.raises($q$SELECT public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/media/avatars/00000000-0000-0000-0000-00000000b0b1.webp?v=1')$q$), 'someone else''s avatar URL accepted';
  PERFORM public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/media/avatars/00000000-0000-0000-0000-00000000a0a1.webp?v=1');
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT avatar_url FROM public.players WHERE id = 'a0000000-0000-0000-0000-00000000aaa1')
         = 'https://x.supabase.co/storage/v1/object/public/media/avatars/00000000-0000-0000-0000-00000000a0a1.webp?v=1', 'own avatar URL not saved';
  ASSERT (SELECT avatar_url FROM public.players WHERE id = 'b0000000-0000-0000-0000-00000000bbb1') IS NULL, 'other player changed';
END $$;

-- set_my_avatar(NULL) clears it.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a0a1');
SET LOCAL ROLE authenticated;
SELECT public.set_my_avatar(NULL);
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT avatar_url FROM public.players WHERE id = 'a0000000-0000-0000-0000-00000000aaa1') IS NULL, 'avatar not cleared';
END $$;

-- Manager M: own league's logo only, well-formed name only; logo_url must point at the bucket.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000c0c1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'logos/10000000-0000-0000-0000-00000000aaa1.webp')$q$), 'manager logo upload blocked';
  ASSERT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'logos/not-a-uuid.webp')$q$), 'malformed logo name allowed';
  ASSERT pg_temp.raises($q$UPDATE public.leagues SET logo_url = 'https://evil.example/l.png' WHERE id = '10000000-0000-0000-0000-00000000aaa1'$q$), 'foreign logo URL accepted';
  ASSERT NOT pg_temp.raises($q$UPDATE public.leagues SET logo_url = 'https://x.supabase.co/storage/v1/object/public/media/logos/10000000-0000-0000-0000-00000000aaa1.webp?v=1' WHERE id = '10000000-0000-0000-0000-00000000aaa1'$q$), 'own logo URL rejected';
END $$;
RESET ROLE;

-- Deleting A's account clears the photo link on A's player row.
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a0a1');
SET LOCAL ROLE authenticated;
SELECT public.set_my_avatar('https://x.supabase.co/storage/v1/object/public/media/avatars/00000000-0000-0000-0000-00000000a0a1.webp?v=2');
SELECT public.delete_my_account();
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT avatar_url FROM public.players WHERE id = 'a0000000-0000-0000-0000-00000000aaa1') IS NULL, 'avatar kept after account deletion';
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

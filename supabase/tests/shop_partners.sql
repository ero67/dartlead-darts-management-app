-- Self-check for 20261122120000_shop_partners.sql (partners, partner_settings,
-- get_active_partner, partner image uploads). One transaction, rolled back.
-- Runs on staging through the Supabase MCP execute_sql, or locally:
--   docker exec -i supabase_db_dartlead-darts-management-app psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/shop_partners.sql
-- Expect the last row: ALL ASSERTS PASSED

BEGIN;

-- A is an admin, P a plain player.
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000ad0a1', 'a@partners.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000ad0b1', 'p@partners.test', '{}', '{}');

CREATE FUNCTION pg_temp.act_as(u text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
$$;
CREATE FUNCTION pg_temp.raises(stmt text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END $$;
CREATE FUNCTION pg_temp.visible() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.get_active_partner();
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- Fixed partner id so the storage path can be named.
INSERT INTO public.partners (id, name, code, discount_label, url) VALUES
  ('20000000-0000-0000-0000-00000000d001', 'Darteg', 'DARTLEAD', '−10 %', 'https://darteg.sk');
UPDATE public.partner_settings SET audience = 'everyone', active_partner_id = '20000000-0000-0000-0000-00000000d001';

-- Player P: cannot read, write or upload anything; settings untouched.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT pg_temp.raises($q$INSERT INTO public.partners (name, code, discount_label, url) VALUES ('X', 'X', 'X', 'https://x.sk')$q$), 'player inserted a partner';
  ASSERT (SELECT count(*) FROM public.partners) = 0, 'player can read partners';
  ASSERT (SELECT count(*) FROM public.partner_settings) = 0, 'player can read partner settings';
  ASSERT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'partners/20000000-0000-0000-0000-00000000d001.webp')$q$), 'player uploaded a partner image';
END $$;
UPDATE public.partner_settings SET audience = 'off';
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT audience FROM public.partner_settings) = 'everyone', 'player changed partner settings';
END $$;

-- Admin A: full access; URL rules hold.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.partners) = 1, 'admin cannot read partners';
  ASSERT NOT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'partners/20000000-0000-0000-0000-00000000d001.webp')$q$), 'admin partner image upload blocked';
  ASSERT pg_temp.raises($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('media', 'partners/not-a-uuid.webp')$q$), 'malformed partner image name allowed';
  ASSERT pg_temp.raises($q$INSERT INTO public.partners (name, code, discount_label, url) VALUES ('X', 'X', 'X', 'http://x.sk')$q$), 'http URL accepted';
  ASSERT pg_temp.raises($q$UPDATE public.partners SET image_url = 'https://evil.example/storage/v1/object/public/media/partners/20000000-0000-0000-0000-00000000d001.webp?v=1'$q$), 'foreign image host accepted';
  ASSERT NOT pg_temp.raises($q$UPDATE public.partners SET image_url = 'https://x.supabase.co/storage/v1/object/public/media/partners/20000000-0000-0000-0000-00000000d001.webp?v=1'$q$), 'own image URL rejected';
END $$;
RESET ROLE;

-- Audience 'off': nobody gets the partner.
UPDATE public.partner_settings SET audience = 'off';
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.visible() = 0, 'off: admin sees partner'; END $$;
RESET ROLE;
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.visible() = 0, 'off: player sees partner'; END $$;
RESET ROLE;
SELECT pg_temp.as_anon();
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT pg_temp.visible() = 0, 'off: anon sees partner'; END $$;
RESET ROLE;

-- Audience 'admins': only the admin.
UPDATE public.partner_settings SET audience = 'admins';
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0a1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.visible() = 1, 'admins: admin does not see partner'; END $$;
RESET ROLE;
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT pg_temp.visible() = 0, 'admins: player sees partner'; END $$;
RESET ROLE;
SELECT pg_temp.as_anon();
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT pg_temp.visible() = 0, 'admins: anon sees partner';
  ASSERT pg_temp.raises($q$SELECT * FROM public.partners$q$), 'anon can query partners';
END $$;
RESET ROLE;

-- Audience 'everyone': player and anon get Darteg.
UPDATE public.partner_settings SET audience = 'everyone';
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0b1');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT name FROM public.get_active_partner()) = 'Darteg', 'everyone: player does not see Darteg';
END $$;
RESET ROLE;
SELECT pg_temp.as_anon();
SET LOCAL ROLE anon;
DO $$ BEGIN ASSERT pg_temp.visible() = 1, 'everyone: anon does not see partner'; END $$;
RESET ROLE;

-- No active partner: nothing, even for everyone.
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000ad0a1');
SET LOCAL ROLE authenticated;
DELETE FROM public.partners WHERE id = '20000000-0000-0000-0000-00000000d001';
DO $$ BEGIN ASSERT pg_temp.visible() = 0, 'deleted partner still visible'; END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT active_partner_id FROM public.partner_settings) IS NULL, 'active partner id kept after delete';
END $$;

SELECT 'ALL ASSERTS PASSED';
ROLLBACK;

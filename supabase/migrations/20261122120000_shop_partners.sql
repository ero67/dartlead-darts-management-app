-- Shop partners (docs/superpowers/specs/2026-11-22-partner-darteg-design.md).
-- Admins keep a list of partners and pick at most one active, shown to nobody,
-- admins only or everyone. Players never read the tables: get_active_partner()
-- returns the active one only when the visibility allows it.
-- Additive only and idempotent: safe to run twice; older app builds ignore it.

CREATE TABLE IF NOT EXISTS public.partners (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL CHECK (length(btrim(name)) > 0),
  code           text        NOT NULL CHECK (length(btrim(code)) > 0),
  discount_label text        NOT NULL CHECK (length(btrim(discount_label)) > 0),
  url            text        NOT NULL CHECK (url ~ '^https://'),
  -- Anchored like set_my_avatar: only this bucket's partners/ folder on a Supabase host.
  image_url      text        CHECK (image_url IS NULL OR image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/partners/[0-9a-f-]{36}\.webp\?v=[0-9]+$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_settings (
  id                boolean     PRIMARY KEY DEFAULT true CHECK (id),
  audience          text        NOT NULL DEFAULT 'off' CHECK (audience IN ('off', 'admins', 'everyone')),
  active_partner_id uuid        REFERENCES public.partners (id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.partner_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage partners" ON public.partners;
CREATE POLICY "Admins manage partners" ON public.partners
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins manage partner settings" ON public.partner_settings;
CREATE POLICY "Admins manage partner settings" ON public.partner_settings
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

REVOKE ALL ON public.partners, public.partner_settings FROM anon;

-- The one way players see a partner.
CREATE OR REPLACE FUNCTION public.get_active_partner()
  RETURNS TABLE (id uuid, name text, code text, discount_label text, url text, image_url text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT p.id, p.name, p.code, p.discount_label, p.url, p.image_url
  FROM public.partner_settings s
  JOIN public.partners p ON p.id = s.active_partner_id
  WHERE s.audience = 'everyone'
     OR (s.audience = 'admins' AND (SELECT public.is_admin()));
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_partner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_partner() TO anon, authenticated;

-- Partner images: media/partners/{partner_id}.webp, admins only. Reads stay public (public bucket).
DROP POLICY IF EXISTS "media: partner images (admin)" ON storage.objects;
CREATE POLICY "media: partner images (admin)" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'media' AND name ~ '^partners/[0-9a-f-]{36}\.webp$' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'media' AND name ~ '^partners/[0-9a-f-]{36}\.webp$' AND (SELECT public.is_admin()));

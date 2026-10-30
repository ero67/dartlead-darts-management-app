-- AI assistant (assistant/ folder): who may use it, a daily question limit,
-- and a private schema for its conversation memory.
--
-- assistant_settings: one row. audience 'admins' shows the assistant to
-- admins only, 'everyone' to every signed-in user. Admins change it in the
-- admin panel; anyone may read it (the landing page shows its section only
-- when audience is 'everyone').
--
-- use_assistant_question(): the API calls it, as the user, before every
-- answer. It checks the audience and counts the question against the day's
-- limit in one statement, so two parallel questions cannot both slip past it.
-- Days are UTC days.
--
-- Schema assistant: the LangGraph Postgres checkpointer keeps conversations
-- here (it creates its own tables on start). It is not in the API's exposed
-- schemas, and the assistant_checkpointer role can use nothing else. Its
-- password is set outside migrations:
--   ALTER ROLE assistant_checkpointer WITH PASSWORD '...';
--
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.assistant_settings (
  id                boolean     PRIMARY KEY DEFAULT true CHECK (id),
  audience          text        NOT NULL DEFAULT 'admins' CHECK (audience IN ('admins', 'everyone')),
  daily_limit       integer     NOT NULL DEFAULT 30 CHECK (daily_limit >= 0),
  admin_daily_limit integer     NOT NULL DEFAULT 200 CHECK (admin_daily_limit >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.assistant_settings DEFAULT VALUES ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read assistant settings" ON public.assistant_settings;
CREATE POLICY "Anyone can read assistant settings" ON public.assistant_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update assistant settings" ON public.assistant_settings;
CREATE POLICY "Admins can update assistant settings" ON public.assistant_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE TABLE IF NOT EXISTS public.assistant_usage (
  user_id   uuid    NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day       date    NOT NULL,
  questions integer NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- No policies: only use_assistant_question() writes or reads it.
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.use_assistant_question()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user     uuid := (SELECT auth.uid());
  v_admin    boolean := public.is_admin();
  v_settings public.assistant_settings;
  v_limit    integer;
  v_used     integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to use the assistant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settings FROM public.assistant_settings WHERE id;
  IF v_settings.audience IS DISTINCT FROM 'everyone' AND NOT v_admin THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'disabled');
  END IF;

  v_limit := CASE WHEN v_admin THEN v_settings.admin_daily_limit ELSE v_settings.daily_limit END;
  IF v_limit < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit', 'limit', v_limit);
  END IF;

  -- Counts the question unless the limit is reached; then the WHERE skips the
  -- update, nothing is returned and v_used stays NULL.
  INSERT INTO public.assistant_usage AS u (user_id, day, questions)
  VALUES (v_user, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET questions = u.questions + 1
  WHERE u.questions < v_limit
  RETURNING u.questions INTO v_used;

  IF v_used IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit', 'limit', v_limit);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
END;
$$;

-- Supabase grants new functions to anon directly, so PUBLIC alone is not enough.
REVOKE EXECUTE ON FUNCTION public.use_assistant_question() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_assistant_question() TO authenticated;

CREATE SCHEMA IF NOT EXISTS assistant;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_checkpointer') THEN
    CREATE ROLE assistant_checkpointer LOGIN NOINHERIT;
  END IF;
END;
$$;

GRANT USAGE, CREATE ON SCHEMA assistant TO assistant_checkpointer;
ALTER ROLE assistant_checkpointer SET search_path = assistant;

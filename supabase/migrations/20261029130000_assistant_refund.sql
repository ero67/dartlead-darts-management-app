-- AI assistant: give the question back when an answer fails.
--
-- use_assistant_question() now also writes a row to assistant_question_log and
-- returns its id as question_id. refund_assistant_question(id) deletes that row
-- and takes one off today's count.
--
-- Users cannot refund themselves: the API only holds the anon key plus the
-- user's own JWT, and nobody can read the log table (RLS on, no policies, no
-- grants), so the random question_id is a capability only the server sees. A
-- refund also needs the id to be the caller's own, under 10 minutes old, and
-- works once (the row is deleted). Log rows older than a day are deleted by the
-- user's next question, so the table stays small without a cron job.
--
-- Same name, arguments and grants as before for use_assistant_question().
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.assistant_question_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No policies: only the two functions below touch it.
ALTER TABLE public.assistant_question_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_question_log FROM anon, authenticated;

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
  v_question uuid;
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

  DELETE FROM public.assistant_question_log
  WHERE user_id = v_user AND created_at < now() - interval '1 day';

  INSERT INTO public.assistant_question_log (user_id) VALUES (v_user)
  RETURNING id INTO v_question;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'question_id', v_question);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_assistant_question(p_question_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user    uuid := (SELECT auth.uid());
  v_deleted integer;
BEGIN
  DELETE FROM public.assistant_question_log
  WHERE id = p_question_id
    AND user_id = v_user
    AND created_at > now() - interval '10 minutes';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.assistant_usage
  SET questions = greatest(questions - 1, 0)
  WHERE user_id = v_user AND day = (now() AT TIME ZONE 'utc')::date;
  RETURN true;
END;
$$;

-- Supabase grants new functions to anon directly, so PUBLIC alone is not enough.
REVOKE EXECUTE ON FUNCTION public.use_assistant_question() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_assistant_question() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_assistant_question(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_assistant_question(uuid) TO authenticated;

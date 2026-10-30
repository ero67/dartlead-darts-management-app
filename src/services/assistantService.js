import { supabase } from '../lib/supabase';

// The assistant service (assistant/ folder, FastAPI). Unset = the assistant is hidden.
export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL;

export const assistantService = {
  // Who sees the assistant ('admins' | 'everyone') and the daily question limits; one row, readable by anyone.
  async getSettings() {
    try {
      const { data, error } = await supabase.from('assistant_settings').select('audience, daily_limit, admin_daily_limit').single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error loading assistant settings:', error);
      return null;
    }
  },

  // Admins only (RLS).
  async updateSettings(changes) {
    const { data, error } = await supabase
      .from('assistant_settings')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('audience, daily_limit, admin_daily_limit')
      .single();
    if (error) throw error;
    return data;
  },

  // Sends one message and calls onEvent for every event of the run as it streams in (NDJSON, one JSON
  // object per line): step, sources, tool_start, tool_end, text, done, error.
  // The user's access token goes along, so the assistant only sees what this user may see.
  // `page` ({ kind, id }, optional) is the page the user is on, so "who leads?" means that league.
  async streamChat({ message, threadId, page, onEvent }) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in to use the assistant.');

      const response = await fetch(`${ASSISTANT_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message, thread_id: threadId, ...(page && { page }) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // status 429 = daily limit reached, 403 = not available for this account (see use_assistant_question).
        throw Object.assign(new Error(typeof body.detail === 'string' ? body.detail : `Assistant error ${response.status}`),
          { status: response.status });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // A network chunk can end mid-line: keep the unfinished tail for the next chunk.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.filter(Boolean).forEach(line => onEvent(JSON.parse(line)));
      }
      if (buffer.trim()) onEvent(JSON.parse(buffer));
    } catch (error) {
      console.error('Error chatting with the assistant:', error);
      throw error;
    }
  },

  // Thumbs up (value 1) or down (0) on one answer, with an optional comment. Becomes a Langfuse score on that trace.
  async sendFeedback({ traceId, value, comment }) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sign in to use the assistant.');

      const response = await fetch(`${ASSISTANT_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ trace_id: traceId, value, comment: comment || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(typeof body.detail === 'string' ? body.detail : `Assistant error ${response.status}`),
          { status: response.status });
      }
    } catch (error) {
      console.error('Error sending assistant feedback:', error);
      throw error;
    }
  },
};

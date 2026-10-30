import { supabase } from '../lib/supabase';
import { leagueService } from './leagueService';
import { matchService } from './tournamentService';

// The assistant service (assistant/ folder, FastAPI). Unset = the assistant is hidden.
export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL;

// The two top names of a league table, as { a, b } (none when it has fewer than two).
async function topTwo(leagueId) {
  const [first, second] = await leagueService.getLeaderboard(leagueId);
  return first?.player?.name && second?.player?.name ? { a: first.player.name, b: second.player.name } : {};
}

// The final's winner and loser as { a, b }: the final from the bracket (playoffs JSON), with its live
// matches row laid over it (the JSON can be stale, as TournamentSummary knows); {} until it is played.
async function finalists(playoffs) {
  const rounds = playoffs?.rounds;
  const bracket = rounds?.[rounds.length - 1]?.matches?.find(m => !m.isThirdPlaceMatch);
  if (!bracket) return {};
  const { data: row, error } = await supabase
    .from('matches')
    .select('status, winner_id, player1:players!matches_player1_id_fkey(id, name), player2:players!matches_player2_id_fkey(id, name)')
    .eq('id', bracket.id)
    .maybeSingle();
  if (error) throw error;
  const status = row?.status ?? bracket.status;
  const winnerId = row?.winner_id ?? bracket.result?.winner;
  const player1 = row?.player1 || bracket.player1;
  const player2 = row?.player2 || bracket.player2;
  if (status !== 'completed' || !winnerId) return {};
  const [winner, loser] = winnerId === player1?.id ? [player1, player2] : [player2, player1];
  return winner?.name && loser?.name ? { a: winner.name, b: loser.name } : {};
}

// The opponent this player met most often in their recent X01 matches (Cricket is not in the totals), or undefined.
function mostFrequentOpponent(history = []) {
  const counts = new Map();
  history.forEach(m => m.opponentId && counts.set(m.opponentId, (counts.get(m.opponentId) || 0) + 1));
  return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0];
}

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

  // Real names for the suggestions and the "Looking at" chip of this page: { a, b } (head-to-head),
  // { player, opponent } and `label` (the league, tournament or player name). Any of them may be
  // missing, and a failure is just {}: the plain suggestions still work.
  async getSuggestionNames(page) {
    try {
      switch (page?.kind) {
        case 'league': {
          const [leagues, top] = await Promise.all([leagueService.getLeagues(), topTwo(page.id)]);
          return { ...top, label: leagues.find(l => l.id === page.id)?.name };
        }
        case 'tournament': {
          const { data: tournament, error } = await supabase.from('tournaments').select('name, playoffs').eq('id', page.id).eq('deleted', false).maybeSingle();
          if (error) throw error;
          // The name survives a failed final lookup.
          const top = await finalists(tournament?.playoffs).catch(() => ({}));
          return { ...top, label: tournament?.name };
        }
        case 'player': {
          // The name survives a failed history lookup: no opponent then, so the plain question.
          const totals = await matchService.getRecentMatchTotals([page.id], 60).catch(() => null);
          const opponentId = mostFrequentOpponent(totals?.get(page.id));
          const { data, error } = await supabase.from('players').select('id, name').in('id', [page.id, opponentId].filter(Boolean));
          if (error) throw error;
          const nameOf = (id) => data.find(p => p.id === id)?.name;
          const opponent = opponentId && nameOf(opponentId);
          return { label: nameOf(page.id), player: nameOf(page.id), ...(opponent && { opponent }) };
        }
        case 'practice':
          return {};
        default: {
          // Home and other routes: the top two of the newest active league.
          const league = (await leagueService.getLeagues()).find(l => l.status === 'active');
          return league ? await topTwo(league.id) : {};
        }
      }
    } catch (error) {
      console.error('Error loading assistant suggestion names:', error);
      return {};
    }
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

import { supabase } from '../lib/supabase';
import { leagueService } from './leagueService';
import { matchService, tournamentService } from './tournamentService';

// The assistant service (assistant/ folder, FastAPI). Unset = the assistant is hidden.
export const ASSISTANT_URL = import.meta.env.VITE_ASSISTANT_URL;

// The two top names of a league table, as { a, b } (none when it has fewer than two).
async function topTwo(leagueId) {
  const [first, second] = await leagueService.getLeaderboard(leagueId);
  return first?.player?.name && second?.player?.name ? { a: first.player.name, b: second.player.name } : {};
}

// The final's winner and loser, from the bracket with the fresh playoff match rows laid over it
// (as TournamentSummary does); none until the final is played.
function finalists(tournament) {
  const rounds = tournament.playoffs?.rounds;
  const bracketFinal = rounds?.[rounds.length - 1]?.matches?.find(m => !m.isThirdPlaceMatch);
  const final = { ...bracketFinal, ...tournament.playoffMatches.find(m => m.id === bracketFinal?.id) };
  const winnerId = final.result?.winner;
  if (final.status !== 'completed' || !winnerId) return {};
  const [winner, loser] = winnerId === final.player1?.id ? [final.player1, final.player2] : [final.player2, final.player1];
  return winner?.name && loser?.name ? { a: winner.name, b: loser.name } : {};
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
          const tournament = await tournamentService.getTournament(page.id);
          return { ...finalists(tournament), label: tournament.name };
        }
        case 'player': {
          const [profile, totals] = await Promise.all([tournamentService.getPlayerProfile(page.id), matchService.getRecentMatchTotals([page.id], 60)]);
          const counts = new Map();
          (totals.get(page.id) || []).forEach(m => m.opponentId && counts.set(m.opponentId, (counts.get(m.opponentId) || 0) + 1));
          const [opponentId] = [...counts].sort((x, y) => y[1] - x[1])[0] || [];
          // The profile's last 10 matches usually name them; otherwise their own profile does.
          const opponent = opponentId && (profile.recentMatches.find(m => m.opponentId === opponentId)?.opponentName
            ?? (await tournamentService.getPlayerProfile(opponentId)).player?.name);
          return { label: profile.player?.name, player: profile.player?.name, ...(opponent && { opponent }) };
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

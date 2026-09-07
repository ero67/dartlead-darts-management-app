import { supabase } from '../lib/supabase';
import {
  loadHistory, mergeHistory, markSynced, removeHistoryEntry
} from '../lib/practiceStorage';

// Cloud copy of the practice history for signed-in players. The device stays
// the source of truth while playing; this module pushes finished sessions up
// (idempotent upsert on client_id) and pulls the account's sessions down so a
// second device shows the same history.

const PULL_LIMIT = 1000;

const toRow = (userId, entry) => ({
  user_id: userId,
  client_id: entry.id,
  game: entry.game,
  settings: entry.settings || {},
  stats: entry.stats || {},
  started_at: entry.startedAt ? new Date(entry.startedAt).toISOString() : null,
  finished_at: new Date(entry.finishedAt || Date.now()).toISOString()
});

const fromRow = (row) => ({
  id: row.client_id,
  game: row.game,
  settings: row.settings || {},
  stats: row.stats || {},
  startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
  finishedAt: new Date(row.finished_at).getTime(),
  synced: true
});

export const practiceService = {
  // Upload every local session not yet marked synced. Returns how many went up.
  async pushPending(userId) {
    if (!userId) return 0;
    const pending = loadHistory().filter(e => !e.synced);
    if (pending.length === 0) return 0;
    const { error } = await supabase
      .from('practice_sessions')
      .upsert(pending.map(e => toRow(userId, e)), { onConflict: 'user_id,client_id', ignoreDuplicates: false });
    if (error) throw error;
    markSynced(pending.map(e => e.id));
    return pending.length;
  },

  // Download the account's sessions and merge them into the local history.
  async pullAll(userId) {
    if (!userId) return loadHistory();
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('client_id, game, settings, stats, started_at, finished_at')
      .eq('user_id', userId)
      .order('finished_at', { ascending: false })
      .limit(PULL_LIMIT);
    if (error) throw error;
    return mergeHistory((data || []).map(fromRow));
  },

  // Push then pull; the normal "open the practice page while signed in" path.
  async sync(userId) {
    await this.pushPending(userId);
    return this.pullAll(userId);
  },

  // Upload one just-finished session; failures leave it pending for later.
  async uploadSession(userId, entry) {
    if (!userId || !entry) return false;
    const { error } = await supabase
      .from('practice_sessions')
      .upsert(toRow(userId, entry), { onConflict: 'user_id,client_id' });
    if (error) throw error;
    markSynced([entry.id]);
    return true;
  },

  async deleteSession(userId, id) {
    const history = removeHistoryEntry(id);
    if (userId) {
      const { error } = await supabase
        .from('practice_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('client_id', id);
      if (error) throw error;
    }
    return history;
  },

  async deleteAll(userId) {
    if (!userId) return;
    const { error } = await supabase.from('practice_sessions').delete().eq('user_id', userId);
    if (error) throw error;
  }
};

// Practice sessions live on the device for now: the session in progress (so a
// crash or an accidental back gesture never loses a leg) and a capped history
// of finished sessions. Cloud sync per account is a later phase; keeping the
// shape here stable makes that a straight upload.

const ACTIVE_KEY = 'dartlead-practice-active';
const HISTORY_KEY = 'dartlead-practice-history';
const HISTORY_LIMIT = 1000;

const read = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — practice still works, it just won't survive a reload.
  }
};

export const loadActiveSession = () => {
  const saved = read(ACTIVE_KEY);
  if (!saved || typeof saved !== 'object' || !saved.game || !saved.state) return null;
  return saved;
};

export const saveActiveSession = (game, state) => write(ACTIVE_KEY, { game, state, savedAt: Date.now() });

export const clearActiveSession = () => write(ACTIVE_KEY, null);

export const loadHistory = () => {
  const saved = read(HISTORY_KEY);
  return Array.isArray(saved) ? saved : [];
};

// `entry` = { id, game, settings, stats, startedAt, finishedAt }
export const appendHistory = (entry) => {
  const history = [entry, ...loadHistory().filter(e => e.id !== entry.id)].slice(0, HISTORY_LIMIT);
  write(HISTORY_KEY, history);
  return history;
};

// Union of the local history and entries pulled from the account, newest
// first, deduplicated by id. A local copy wins over the remote one except for
// the synced flag, which is true as soon as the row exists remotely.
export const mergeHistory = (remoteEntries) => {
  const byId = new Map();
  for (const e of remoteEntries || []) byId.set(e.id, { ...e, synced: true });
  for (const e of loadHistory()) {
    const remote = byId.get(e.id);
    byId.set(e.id, remote ? { ...e, synced: true } : e);
  }
  const merged = [...byId.values()].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, HISTORY_LIMIT);
  write(HISTORY_KEY, merged);
  return merged;
};

export const markSynced = (ids) => {
  const set = new Set(ids);
  const history = loadHistory().map(e => (set.has(e.id) ? { ...e, synced: true } : e));
  write(HISTORY_KEY, history);
  return history;
};

export const countPendingSync = () => loadHistory().filter(e => !e.synced).length;

export const removeHistoryEntry = (id) => {
  const history = loadHistory().filter(e => e.id !== id);
  write(HISTORY_KEY, history);
  return history;
};

export const clearHistory = () => write(HISTORY_KEY, null);

export const newSessionId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Last-used settings per game, so "play again" and the setup form start from
// what the player chose last time.
const settingsKey = (game) => `dartlead-practice-settings-${game}`;
export const loadGameSettings = (game) => read(settingsKey(game));
export const saveGameSettings = (game, settings) => write(settingsKey(game), settings);

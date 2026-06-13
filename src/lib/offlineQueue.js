import { supabase } from './supabase.js';
import { matchService } from '../services/tournamentService.js';

// A small, durable queue for Supabase writes that must not be lost on bad WiFi.
//
// Match scoring already persists per-match to localStorage, but DB writes were
// previously fire-and-forget: a failed saveMatchResult while offline was gone
// forever. This queue persists pending writes to localStorage and retries them
// when connectivity returns (online event + periodic retry + on app boot).
//
// All queued writes are ABSOLUTE writes keyed by match id (update/upsert by id),
// so replaying one is idempotent — it overwrites with the same data and never
// double-counts. We also dedupe by a per-operation key so only the latest write
// of each kind per match is kept.

const STORAGE_KEY = 'dartlead-write-queue';
const RETRY_INTERVAL_MS = 20000;

const QUEUE_TYPES = {
  saveMatchResult: 'saveMatchResult',
  liveSync: 'liveSync',
  startLiveMatch: 'startLiveMatch',
  playoffSync: 'playoffSync'
};

let listeners = new Set();
let flushing = false;
let initialized = false;

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

function writeQueue(queue) {
  try {
    if (queue.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error('Error writing offline queue:', error);
  }
  notify(queue.length);
}

function notify(length) {
  listeners.forEach(cb => {
    try {
      cb(length);
    } catch (error) {
      console.error('Offline queue listener error:', error);
    }
  });
}

// Generate a queue item id without Date.now()/Math.random() concerns — a simple
// counter + timestamp suffix is fine here (runs only in the browser).
let itemCounter = 0;
function makeItemId() {
  itemCounter += 1;
  return `q_${Date.now()}_${itemCounter}`;
}

/**
 * Enqueue a write to be (re)tried until it succeeds.
 * @param {string} type one of QUEUE_TYPES
 * @param {object} payload the data needed to perform the write
 * @param {string} dedupeKey replace any existing queued item with this key
 *   (last-write-wins). E.g. `result:<matchId>`, `live:<matchId>`.
 */
export function enqueueWrite(type, payload, dedupeKey) {
  if (!QUEUE_TYPES[type]) {
    console.error('enqueueWrite: unknown type', type);
    return;
  }
  const queue = readQueue();
  const item = {
    id: makeItemId(),
    type,
    payload,
    dedupeKey: dedupeKey || null,
    attempts: 0,
    createdAt: new Date().toISOString()
  };

  let next;
  if (dedupeKey) {
    // Drop any existing item with the same dedupeKey (keep only the latest)
    next = queue.filter(q => q.dedupeKey !== dedupeKey);
  } else {
    next = [...queue];
  }
  next.push(item);
  writeQueue(next);

  // Try to flush right away (no-op if offline / already flushing)
  flushQueue();
}

export function hasPending() {
  return readQueue().length > 0;
}

export function getQueueLength() {
  return readQueue().length;
}

/**
 * Subscribe to queue-length changes. Returns an unsubscribe fn.
 */
export function subscribe(callback) {
  listeners.add(callback);
  // Emit current length immediately
  try {
    callback(getQueueLength());
  } catch (error) {
    console.error('Offline queue listener error:', error);
  }
  return () => listeners.delete(callback);
}

// Perform the actual Supabase write for a queued item. Throws on failure so the
// item stays in the queue for retry.
async function performWrite(item) {
  switch (item.type) {
    case QUEUE_TYPES.saveMatchResult:
      await matchService.saveMatchResult(item.payload);
      return;

    case QUEUE_TYPES.startLiveMatch: {
      const { matchId, deviceId, deviceName, boardNumber } = item.payload;
      await matchService.startLiveMatch(matchId, deviceId, deviceName, boardNumber);
      return;
    }

    case QUEUE_TYPES.liveSync: {
      const { matchId, update } = item.payload;
      const { error } = await supabase
        .from('matches')
        .update(update)
        .eq('id', matchId);
      if (error) throw error;
      return;
    }

    case QUEUE_TYPES.playoffSync: {
      const { error } = await supabase
        .from('matches')
        .upsert(item.payload, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    default:
      // Unknown type — drop it (return without throwing)
      console.error('performWrite: unknown queue item type', item.type);
      return;
  }
}

/**
 * Flush the queue in order. Items that succeed are removed; items that fail stay
 * for the next attempt. Guarded so only one flush runs at a time.
 */
export async function flushQueue() {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  let queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  try {
    // Process oldest-first; stop early on the first failure to preserve order
    // (a failure usually means we're offline again).
    for (const item of queue) {
      try {
        await performWrite(item);
        // Remove this item on success
        queue = readQueue().filter(q => q.id !== item.id);
        writeQueue(queue);
      } catch (error) {
        // Bump attempt count and keep the item; stop the run.
        const current = readQueue();
        const updated = current.map(q =>
          q.id === item.id ? { ...q, attempts: (q.attempts || 0) + 1 } : q
        );
        writeQueue(updated);
        console.warn(
          `Offline queue: write failed (type=${item.type}, attempts=${(item.attempts || 0) + 1}), will retry.`,
          error?.message || error
        );
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * Initialize flush triggers exactly once: flush on reconnect, periodically while
 * pending, and once on boot. Safe to call multiple times.
 */
export function initOfflineQueue() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('online', () => {
    flushQueue();
  });

  // Periodic retry while there are pending items (covers flaky reconnects where
  // the 'online' event doesn't fire reliably). Runs for the app's lifetime.
  setInterval(() => {
    if (hasPending()) {
      flushQueue();
    }
  }, RETRY_INTERVAL_MS);

  // Flush anything left over from a previous session / crash.
  flushQueue();
}

export { QUEUE_TYPES };

// Pure decisions for the offline write queue (no imports, so
// scripts/check-offline-queue.mjs can test them under plain node).

// After this many failed attempts an item no longer holds up the items behind it.
export const MAX_BLOCKING_ATTEMPTS = 8;

// Errors that no retry can fix: the row is gone or this account may not write
// it. Network and "Authentication required" errors are not in here: they heal.
const TERMINAL_CODES = new Set(['42501', 'PGRST116']);
const TERMINAL_MESSAGE = /winner_mismatch|not_authorized|tournament_not_found|match_not_found|no_playoffs|missing_winner|Match not found in database|RLS policy blocking update|Match not found or RLS policy blocking: .*(single JSON object|\(or no\) rows)/;

export function isTerminalWriteError(error) {
  if (!error) return false;
  if (TERMINAL_CODES.has(error.code)) return true;
  return TERMINAL_MESSAGE.test(error.message || String(error));
}

// An item queued while another account was signed in must not be replayed
// under the current one; it waits until its owner signs in again. Items from
// before owners were recorded (no userId) replay as before.
export function belongsToOtherUser(item, currentUserId) {
  return Boolean(item.userId) && item.userId !== currentUserId;
}

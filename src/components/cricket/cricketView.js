import { CRICKET_NUMBERS } from '../../lib/cricket';

// Cricket targets top to bottom as on a scoreboard (20..15, then the bull).
export const CRICKET_ROWS = CRICKET_NUMBERS;

// Marks on `n` capped at 3 (the engine keeps the raw count). `m` may come
// from live_state JSON, where the keys are strings: plain lookup handles both.
export const markCount = (m, n) => Math.min(3, Number(m?.[n]) || 0);

// One number seen by `thrower`: 'open' | 'scoring' (thrower closed, opponent
// open) | 'danger' (opponent closed, thrower open) | 'dead' (both closed).
export const numberState = (marks, thrower, n) => {
  const mine = markCount(marks?.[thrower], n) >= 3;
  const theirs = markCount(marks?.[1 - thrower], n) >= 3;
  if (mine && theirs) return 'dead';
  if (mine) return 'scoring';
  return theirs ? 'danger' : 'open';
};

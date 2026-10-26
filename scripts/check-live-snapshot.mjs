#!/usr/bin/env node
// Self-check for the scorers' crash-recovery vs. row decision and the X01
// live_state round trip (no database):
//   node scripts/check-live-snapshot.mjs
import assert from 'node:assert/strict';
import { isLocalSnapshotStale, x01StateFromRow } from '../src/components/match/liveSnapshot.js';

// PostgREST timestamptz format (microseconds, +00:00).
const T1 = '2026-10-25T10:00:00.123456+00:00';
const T2 = '2026-10-25T10:00:05.000001+00:00';

// Another device scored on (or a manager reset): the row is newer -> stale.
assert.equal(isLocalSnapshotStale({ serverUpdatedAt: T1 }, { updated_at: T2 }), true);
// This device made the last write: same stamp -> keep local.
assert.equal(isLocalSnapshotStale({ serverUpdatedAt: T2 }, { updated_at: T2 }), false);
assert.equal(isLocalSnapshotStale({ serverUpdatedAt: T2 }, { updated_at: T1 }), false);
// Nothing to compare: no snapshot, no row stamp, or a snapshot from before the stamp existed.
assert.equal(isLocalSnapshotStale(null, { updated_at: T2 }), false);
assert.equal(isLocalSnapshotStale({ serverUpdatedAt: T1 }, { updated_at: null }), false);
assert.equal(isLocalSnapshotStale({ currentLeg: 2 }, { updated_at: T2 }), false);

// X01 resume on another device keeps the running totals from live_state,
// while the columns stay authoritative for legs and remaining score.
const legScores = {
  player1: { legs: 1, currentScore: 141, totalScore: 861, totalDarts: 24, legDarts: 9, oneEighties: 1, visitScores: [180, 100], doubleAttempts: 3, legAverages: [55], checkouts: [{ score: 40 }], legDetails: [{ darts: 15 }] },
  player2: { legs: 0, currentScore: 301, totalScore: 700, totalDarts: 21, legDarts: 6, oneEighties: 0, visitScores: [100, 100], doubleAttempts: 0, legAverages: [], checkouts: [], legDetails: [] }
};
const visitLog = [[1, 0, 180], [1, 1, 100]];
const row = JSON.parse(JSON.stringify({
  player1_legs: 1, player2_legs: 0, player1_current_score: 141, player2_current_score: 301,
  live_state: { legScores, visitLog }
}));
const r = x01StateFromRow(row, 501);
assert.deepEqual(r.legScores, legScores);
assert.deepEqual(r.visitLog, visitLog);

// An older app scored on without writing live_state: the columns moved past
// it, so its totals are dropped (zero, as before) rather than misapplied.
const r2 = x01StateFromRow({ ...row, player1_legs: 2, player1_current_score: 501 }, 501);
assert.equal(r2.legScores.player1.legs, 2);
assert.equal(r2.legScores.player1.currentScore, 501);
assert.equal(r2.legScores.player1.totalDarts, 0);
assert.deepEqual(r2.visitLog, []);

// A row without live_state (older app) resumes with zero totals, as before.
const r3 = x01StateFromRow({ player1_legs: 1, player2_legs: 0, player1_current_score: null, player2_current_score: 77 }, 501);
assert.equal(r3.legScores.player1.currentScore, 501);
assert.equal(r3.legScores.player2.currentScore, 77);
assert.equal(r3.legScores.player1.totalDarts, 0);
assert.deepEqual(r3.legScores.player1.visitScores, []);
assert.deepEqual(r3.visitLog, []);

// A Cricket-shaped live_state on an X01 row is ignored.
const r4 = x01StateFromRow({ player1_legs: 0, player2_legs: 0, live_state: { marks: [{}, {}] } }, 301);
assert.equal(r4.legScores.player2.currentScore, 301);
assert.equal(r4.legScores.player2.totalScore, 0);

console.log('live snapshot checks passed');

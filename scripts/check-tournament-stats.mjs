#!/usr/bin/env node
// Self-check for the X01 leaderboards shared by the Statistics tab and TV:
//   node scripts/check-tournament-stats.mjs
import assert from 'node:assert/strict';
import { x01Leaderboards } from '../src/utils/tournamentStats.js';

const ana = { id: 'a', name: 'Ana' };
const bo = { id: 'b', name: 'Bo' };
const cy = { id: 'c', name: 'Cy' };

const match = (id, p1, p2, s1, s2, status = 'completed') => ({
  id, status, startingScore: 501, player1: p1, player2: p2,
  result: { player1Stats: s1, player2Stats: s2 },
});

const matches = [
  match('m1', ana, bo,
    { average: 60.5, checkouts: [{ checkout: 121, leg: 1 }], legs: [{ isWin: true, darts: 18, leg: 1 }], visitScores: [180, 100] },
    { average: 55, checkouts: [{ checkout: 40, leg: 2 }], legs: [{ isWin: true, darts: 24, leg: 2 }], visitScores: [180, 180] }),
  match('m2', ana, cy,
    { average: 72.1, checkouts: [{ checkout: 'T20 + T20 + D18' }], legs: [{ isWin: true, darts: 15, leg: 1 }, { isWin: true, darts: 1, leg: 2 }], visitScores: [60] },
    { average: 80, checkouts: [], legs: [], visitScores: [] }),
  // Not finished: ignored
  match('m3', bo, cy, { average: 99 }, { average: 99 }, 'in_progress'),
  // Completed without result data: skipped, no crash
  { id: 'm4', status: 'completed', player1: bo, player2: cy },
];

const lb = x01Leaderboards(matches, { limit: 5 });

// One row per player, their best match average
assert.deepEqual(lb.bestAverages.map((e) => [e.player.id, e.average]), [['c', 80], ['a', 72.1], ['b', 55]]);
// Checkouts over 50 only, legacy strings parsed (T20+T20+D18 = 156)
assert.deepEqual(lb.bestCheckouts.map((e) => [e.player.id, e.checkouts]), [['a', [156, 121]]]);
// Fewest darts per player; the impossible 1-dart leg is dropped
assert.deepEqual(lb.fewestDarts.map((e) => [e.player.id, e.darts]), [['a', 15], ['b', 24]]);
// 180s ranked first
assert.deepEqual(lb.highScores.map((e) => [e.player.id, e.bands[180]]), [['b', 2], ['a', 1]]);
// Limit applies to every board
assert.equal(x01Leaderboards(matches, { limit: 1 }).bestAverages.length, 1);
// Unknown opponent name is configurable
assert.equal(x01Leaderboards([match('m5', ana, null, { average: 50 }, null)], { unknownName: '?' }).bestAverages[0].opponent, '?');

console.log('tournament stats: all checks passed');

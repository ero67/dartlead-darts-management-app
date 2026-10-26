#!/usr/bin/env node
// Self-check for the shared standings order (no database):
//   node scripts/check-standings.mjs
import assert from 'node:assert/strict';
import { sortStandings } from '../src/utils/standings.js';

const match = (p1, p2, l1, l2) => ({
  player1: { id: p1 }, player2: { id: p2 }, status: 'completed',
  result: { winner: l1 > l2 ? p1 : p2, player1Legs: l1, player2Legs: l2 }
});
const row = (id, matchesWon, legsWon, legsLost, average) => ({ player: { id }, matchesWon, legsWon, legsLost, average });
const ids = (rows) => rows.map((r) => r.player.id).join('');
const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) =>
  permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

// Circular tie: A beat B, B beat C, C beat A; everyone beat D.
const groupMatches = [
  match('A', 'B', 2, 1), match('B', 'C', 2, 1), match('C', 'A', 2, 1),
  match('A', 'D', 2, 0), match('B', 'D', 2, 1), match('C', 'D', 2, 0)
];
const groupRows = [row('A', 2, 5, 3, 60), row('B', 2, 5, 4, 70), row('C', 2, 5, 3, 50), row('D', 0, 1, 6, 40)];

// Head-to-head before leg difference: the A/B/C mini-table is level (1 win,
// +0 legs each), so overall legs then average decide, whatever the input order.
const h2hFirst = ['matchesWon', 'headToHead', 'legDifference', 'average'];
for (const input of permutations(groupRows)) {
  assert.equal(ids(sortStandings(input, h2hFirst, groupMatches)), 'ACBD', `circular tie from input ${ids(input)}`);
}

// Default order: A and C level on wins and legs, average splits them.
assert.equal(ids(sortStandings(groupRows, null, groupMatches)), 'ACBD');
// Same averages: head-to-head decides, C beat A.
const sameAverage = groupRows.map((r) => (r.player.id === 'C' ? { ...r, average: 60 } : r));
for (const input of permutations(sameAverage)) {
  assert.equal(ids(sortStandings(input, null, groupMatches)), 'CABD', `h2h after average from input ${ids(input)}`);
}

// Two-way tie on everything else: the winner of their match goes first.
const pair = [row('E', 1, 4, 4, 50), row('F', 1, 4, 4, 50)];
const pairMatches = [match('E', 'F', 2, 3)];
assert.equal(ids(sortStandings(pair, null, pairMatches)), 'FE');
assert.equal(ids(sortStandings([...pair].reverse(), null, pairMatches)), 'FE');
// Without head-to-head in the order, a full tie keeps input order.
assert.equal(ids(sortStandings(pair, ['matchesWon', 'legDifference'], pairMatches)), 'EF');

// Configurable order: average first.
assert.equal(ids(sortStandings(groupRows, ['average', 'matchesWon'], groupMatches)), 'BACD');
// Unknown criteria are skipped; input is not mutated.
const before = ids(groupRows);
assert.equal(ids(sortStandings(groupRows, ['bogus', 'legDifference', 'average'], groupMatches)), 'ACBD');
assert.equal(ids(groupRows), before);

console.log('standings checks passed');

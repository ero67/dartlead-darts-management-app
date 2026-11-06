#!/usr/bin/env node
// Self-check for who advances from the groups (no database):
//   node scripts/check-qualifiers.mjs
import assert from 'node:assert/strict';
import { getQualifyingPlayers } from '../src/utils/qualifiers.js';

// A group whose players are already in finishing order (more wins = higher).
const group = (name, size) => ({
  id: name,
  name,
  matches: [],
  standings: Array.from({ length: size }, (_, i) => ({
    player: { id: `${name}${i + 1}` }, matchesWon: size - i, legsWon: size - i, legsLost: i, average: 50
  }))
});
const tournament = (groups, playoffSettings) => ({ groups, playoffSettings: { enabled: true, ...playoffSettings } });
const ids = (t) => getQualifyingPlayers(t).map((p) => p.id);

// The reported case: groups of 8 and 7, total mode with 16 lets all 15 through,
// even though the per-group setting left over from before still says 4.
const eightAndSeven = [group('A', 8), group('B', 7)];
assert.equal(ids(tournament(eightAndSeven, { qualificationMode: 'totalPlayers', totalPlayersToAdvance: 16, playersPerGroup: 4 })).length, 15);

// Per-group mode: 4 from each, and "All" (9999) takes everyone.
assert.equal(ids(tournament(eightAndSeven, { qualificationMode: 'perGroup', playersPerGroup: 4 })).length, 8);
assert.equal(ids(tournament(eightAndSeven, { qualificationMode: 'perGroup', playersPerGroup: 9999 })).length, 15);

// Total mode with a remainder: 10 over four groups of 4 is two from each group
// plus the two best third-placed players, not ceil(10 / 4) = 3 from each.
const four = ['A', 'B', 'C', 'D'].map((n) => group(n, 4));
four[2].standings[2].legsWon = 9; // C3 and A3 are the best thirds on leg difference
four[0].standings[2].legsWon = 8;
const ten = ids(tournament(four, { qualificationMode: 'totalPlayers', totalPlayersToAdvance: 10 }));
assert.equal(ten.length, 10);
assert.deepEqual(ten.filter((id) => id.endsWith('3')).sort(), ['A3', 'C3']);

// Group winners seed first.
assert.deepEqual(ten.slice(0, 4).map((id) => id.at(-1)), ['1', '1', '1', '1']);

console.log('check-qualifiers: all good');

#!/usr/bin/env node
// Self-check for group-stage rounds (no database):
//   node scripts/check-group-rounds.mjs
import assert from 'node:assert/strict';
import { roundRobinRounds, roundByMatch } from '../src/utils/groupRounds.js';

const toMatches = (pairs) => pairs.map(([a, b], i) => ({ id: `m${i + 1}`, player1: { id: a }, player2: { id: b } }));

for (let n = 2; n <= 12; n++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const rounds = roundRobinRounds(ids);
  assert.equal(rounds.length, n % 2 ? n : n - 1, `n=${n}: round count`);

  for (const round of rounds) {
    const inRound = round.flat();
    assert.equal(new Set(inRound).size, inRound.length, `n=${n}: someone plays twice in a round`);
    assert.equal(round.length, Math.floor(n / 2), `n=${n}: matches per round`);
  }

  const pairs = rounds.flat();
  const keys = pairs.map((p) => [...p].sort().join('-'));
  assert.equal(new Set(keys).size, (n * (n - 1)) / 2, `n=${n}: every pair exactly once`);

  for (let i = 1; i < pairs.length; i++) {
    const shared = pairs[i].some((p) => pairs[i - 1].includes(p));
    if (n >= 5) assert.ok(!shared, `n=${n}: back to back at match ${i + 1}`);
  }

  const byMatch = roundByMatch(toMatches(pairs));
  if (n >= 4) {
    assert.ok(byMatch, `n=${n}: generated order reads back as rounds`);
    assert.equal(Math.max(...byMatch.values()), rounds.length, `n=${n}: last round number`);
  } else {
    assert.equal(byMatch, null, `n=${n}: no headings for tiny groups`);
  }
}

// Old (pre-rounds) order from a production group of 8: the first block of 4
// has p1 twice, and p8 only plays at match 16.
const old = [[1, 2], [3, 4], [5, 6], [1, 7], [2, 3], [4, 5], [1, 6], [8, 2]]
  .map(([a, b]) => [`p${a}`, `p${b}`]);
assert.equal(roundByMatch(toMatches(old)), null, 'old order shows without rounds');

console.log('group rounds: all checks passed');

#!/usr/bin/env node
// Self-check for the win-chance maths (no database):
//   node scripts/check-win-chance.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { liveMatchChance } from '../src/lib/legChance.js';
import { matchWinProbability, playerStrength, FIELD_AVERAGE } from '../src/lib/winProbability.js';

const checkouts = JSON.parse(readFileSync(new URL('../src/data/checkouts.json', import.meta.url), 'utf8'));
const base = { strengths: [50, 45], legsToWin: 3, startingScore: 501, checkouts };

// Strength: shrunk toward the field, recent matches count more.
assert.equal(playerStrength([]), FIELD_AVERAGE);
const oneBig = playerStrength([{ score: 51 * 30, darts: 51 }]); // one 90-average match
assert.ok(oneBig > FIELD_AVERAGE && oneBig < 60, `one strong match stays modest: ${oneBig}`);
const formUp = playerStrength([{ score: 1000, darts: 50 }, { score: 700, darts: 50 }]);
const formDown = playerStrength([{ score: 700, darts: 50 }, { score: 1000, darts: 50 }]);
assert.ok(formUp > formDown, 'the newest match weighs more');

// Match chance: symmetric, finished matches are certain, unknowns give none.
assert.ok(Math.abs(matchWinProbability(55, 45) + matchWinProbability(45, 55) - 1) < 1e-12);
assert.equal(matchWinProbability(undefined, 45), null);

// Live: leg start equals the tested model (no starter edge), scores move it.
const start = liveMatchChance({ ...base, legs: [0, 0], remaining: [501, 501], thrower: 0 });
assert.ok(Math.abs(start - matchWinProbability(50, 45)) < 1e-12);
assert.ok(liveMatchChance({ ...base, legs: [0, 0], remaining: [40, 301], thrower: 0 }) > start);
assert.ok(liveMatchChance({ ...base, legs: [0, 0], remaining: [301, 40], thrower: 1 }) < start);
assert.equal(liveMatchChance({ ...base, legs: [3, 1], remaining: [501, 501], thrower: 0 }), 1);
assert.equal(liveMatchChance({ ...base, strengths: [undefined, 45], legs: [0, 0], remaining: [501, 501], thrower: 0 }), null);
// Same position, same number: no jitter between re-renders.
const pos = { ...base, legs: [1, 1], remaining: [140, 96], thrower: 1 };
assert.equal(liveMatchChance(pos), liveMatchChance(pos));

console.log('win chance checks ok');

// After-match line: replays a stored visit log, refuses partial logs.
const { winChanceLine } = await import('../src/utils/winChanceLine.js');
// First to 1 leg from 101: A 60, B 41, A 41 checks out.
const lineArgs = { strengths: [50, 45], legsToWin: 1, startingScore: 101, checkouts, finalLegs: [1, 0] };
const line = winChanceLine({ ...lineArgs, visits: [[1, 0, 60], [1, 1, 41], [1, 0, 41]] });
assert.equal(line.points.length, 4);
assert.equal(line.points.at(-1).p, 1);
assert.ok(line.turningPoint && line.turningPoint.index >= 1);
assert.equal(winChanceLine({ ...lineArgs, visits: [[2, 0, 60]] }), null, 'log starting mid-match');
assert.equal(winChanceLine({ ...lineArgs, visits: [[1, 0, 60]] }), null, 'log that does not reach the result');
assert.equal(winChanceLine({ ...lineArgs, strengths: [undefined, 45], visits: [[1, 0, 101]] }), null);
console.log('win chance line checks ok');

// Generates winprob_cases.json: the JS win model run on fixed inputs, so tests/test_winprob.py can pin the Python port to it.
// Run from the repo root after changing src/lib/winProbability.js or src/utils/upsets.js:
//   node assistant/tests/winprob_cases.mjs
// args are the JS positional arguments (a trailing object is the options, camelCase keys). For biggestUpset they are the
// flat Python shape; the app-shaped matches the JS needs are built from them below.
import { writeFileSync } from 'node:fs';
import { chanceToWinFirst, legWinProbability, matchWinProbability, playerStrength, strengthHistory } from '../../src/lib/winProbability.js';
import { biggestUpset } from '../../src/utils/upsets.js';

// mulberry32: a tiny seeded PRNG, so the history (and the JSON) is the same on every run.
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const history = (n, seed) => {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const darts = 30 + Math.floor(r() * 40);
    const avg = 25 + r() * 40;
    return { score: Math.round((avg * darts) / 3), darts, at: new Date(Date.UTC(2026, 9, 28) - i * 86400000).toISOString() };
  });
};

const cases = [];
const add = (fn, args, expected) => cases.push({ fn, args, expected });

for (const [a, b] of [[40, 40], [50, 49], [50, 40], [60, 30], [30, 60], [90, 20]]) add('legWinProbability', [a, b], legWinProbability(a, b));
add('legWinProbability', [50, 40, 10], legWinProbability(50, 40, 10));

for (const [a, b] of [[40, 40], [41, 40], [50, 40], [70, 40]]) {
  for (const legsToWin of [1, 2, 3, 5, 7]) add('matchWinProbability', [a, b, { legsToWin }], matchWinProbability(a, b, { legsToWin }));
}
add('matchWinProbability', [45, 40], matchWinProbability(45, 40));
add('matchWinProbability', [45, 40, { legsToWin: 4, legsA: 2, legsB: 1 }], matchWinProbability(45, 40, { legsToWin: 4, legsA: 2, legsB: 1 }));
add('matchWinProbability', [40, 45, { legsToWin: 4, legsA: 3, legsB: 3 }], matchWinProbability(40, 45, { legsToWin: 4, legsA: 3, legsB: 3 }));
add('matchWinProbability', [45, 40, { legsToWin: 3, scale: 12 }], matchWinProbability(45, 40, { legsToWin: 3, scale: 12 }));
add('matchWinProbability', [null, 40], matchWinProbability(null, 40));
add('matchWinProbability', [45, 0], matchWinProbability(45, 0));

for (const [p, a, b] of [[0.5, 0, 3], [0.5, 3, 0], [0.5, -1, 2], [0.7, 1, 1], [0.7, 3, 3], [0.3, 4, 2], [0.9, 7, 7]]) {
  add('chanceToWinFirst', [p, a, b], chanceToWinFirst(p, a, b));
}

for (const [n, seed] of [[0, 1], [1, 2], [30, 3], [70, 4]]) add('playerStrength', [history(n, seed)], playerStrength(history(n, seed)));
add('playerStrength', [history(30, 3), { halfLife: 5, priorDarts: 100, fieldAverage: 45 }], playerStrength(history(30, 3), { halfLife: 5, priorDarts: 100, fieldAverage: 45 }));

for (const [n, seed, count] of [[30, 3, 5], [3, 5, 5], [0, 6, 5]]) add('strengthHistory', [history(n, seed), count], strengthHistory(history(n, seed), count));

// biggestUpset: flat input (Python) -> app-shaped (JS).
const flat = (id, p1, p2, winner, l1, l2, legsToWin, gameType = 'x01', status = 'completed') => ({
  id, player1_id: p1, player2_id: p2, winner_id: winner, player1_legs: l1, player2_legs: l2, legs_to_win: legsToWin, game_type: gameType, status
});
const toApp = (m) => ({
  id: m.id,
  status: m.status,
  gameType: m.game_type,
  legsToWin: m.legs_to_win,
  player1: { id: m.player1_id },
  player2: { id: m.player2_id },
  result: m.winner_id ? { winner: m.winner_id, player1Legs: m.player1_legs, player2Legs: m.player2_legs } : null
});
const addUpset = (matches, strengths, maxChance) => {
  const best = biggestUpset(matches.map(toApp), strengths, maxChance);
  const expected = best && { winner_id: best.winner.id, loser_id: best.loser.id, score: best.score, chance: best.chance };
  cases.push({ fn: 'biggestUpset', args: maxChance === undefined ? [matches, strengths] : [matches, strengths, maxChance], expected });
};
const S = { a: 60, b: 40, c: 45, d: 45, e: 30 };
addUpset([flat('m1', 'a', 'b', 'a', 3, 1, 3)], S); // favourite won: no upset
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3)], S); // player2 upsets player1
addUpset([flat('m1', 'b', 'a', 'b', 3, 2, 3)], S); // player1 upsets player2
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3), flat('m2', 'a', 'e', 'e', 0, 3, 3)], S); // two upsets: the bigger one
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3, 'cricket')], S); // Cricket skipped
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3, 'x01', 'in_progress')], S); // not completed
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3)], { a: 60 }); // missing strength
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, null)], S); // legs to win from the score
addUpset([flat('m1', 'c', 'd', 'c', 3, 0, 3)], S); // 50% is not below 0.4
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3)], S, 0.001); // stricter limit
// A tie at max chance: the first of two identical upsets stays.
addUpset([flat('m1', 'a', 'b', 'b', 1, 3, 3), flat('m2', 'a', 'b', 'b', 2, 3, 3)], S);
// A tie exactly at maxChance is not an upset (chance < maxChance).
addUpset([flat('m1', 'c', 'd', 'd', 1, 3, 3)], S, 0.5);
addUpset([], S);

writeFileSync(new URL('./winprob_cases.json', import.meta.url), JSON.stringify(cases, null, 1) + '\n');
console.log(`wrote ${cases.length} cases`);

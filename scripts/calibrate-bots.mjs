#!/usr/bin/env node
// Calibrates BOT_LEVELS in src/lib/botPlayer.js: for every level, finds the
// scatter radius (sigma, mm) at which a full 501 leg averages the level's
// target 3-dart average with that level's strategy tier, and picks the naive
// tier's best scoring target for that accuracy. Prints the table to paste
// into BOT_LEVELS. Deterministic (fixed seeds); the optimiser tiers make it
// slow, about 4 minutes.
//
//   node scripts/calibrate-bots.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BOT_LEVELS, simulateLeg, throwAt } from '../src/lib/botPlayer.js';

const root = dirname(fileURLToPath(import.meta.url));
const checkouts = JSON.parse(readFileSync(join(root, '../src/data/checkouts.json'), 'utf8'));

const LEGS = 1500;

const legAverage = (level) => {
  let darts = 0, scored = 0, attempts = 0, legs = 0, seed = 1234567;
  for (let i = 0; i < LEGS; i++) {
    const r = simulateLeg({ level, checkouts, seed });
    seed = r.seed; darts += r.darts; scored += r.scored; attempts += r.checkoutAttempts; legs += r.finished ? 1 : 0;
  }
  return { average: (scored / darts) * 3, checkoutPct: (legs / attempts) * 100, dartsPerLeg: darts / legs };
};

// Expected single-dart score for aiming at a label with this sigma.
const expectedScore = (label, sigma) => {
  let total = 0, seed = 42;
  for (let i = 0; i < 6000; i++) { const r = throwAt(label, sigma, seed); seed = r.seed; total += r.dart.value; }
  return total / 6000;
};
const bestScoringTarget = (sigma) =>
  ['T20', 'T19', 'Bull'].map((l) => [l, expectedScore(l, sigma)]).sort((a, b) => b[1] - a[1])[0][0];

const calibrated = [];
for (const base of BOT_LEVELS) {
  let lo = 3, hi = 80;
  let level = { ...base };
  for (let iter = 0; iter < 18; iter++) {
    const sigma = (lo + hi) / 2;
    level = { ...base, sigma, scoringTarget: base.tier === 'naive' ? bestScoringTarget(sigma) : 'T20' };
    const { average } = legAverage(level);
    if (average > base.average) lo = sigma; else hi = sigma;
  }
  const sigma = Math.round(((lo + hi) / 2) * 10) / 10;
  level = { ...base, sigma, scoringTarget: base.tier === 'naive' ? bestScoringTarget(sigma) : 'T20' };
  const r = legAverage(level);
  calibrated.push({ ...level, measured: r });
  console.log(`level ${base.level}  target ${base.average}  sigma ${sigma.toFixed(1)}  aim ${level.scoringTarget.padEnd(4)}  avg ${r.average.toFixed(1)}  checkout ${r.checkoutPct.toFixed(0)}%  darts/leg ${r.dartsPerLeg.toFixed(1)}`);
}

console.log('\nPaste into BOT_LEVELS:');
for (const l of calibrated) {
  console.log(`  { level: ${l.level}, average: ${l.average}, tier: '${l.tier}', sigma: ${l.sigma.toFixed(1)}, doubleFactor: ${l.doubleFactor}, scoringTarget: '${l.scoringTarget}' },`);
}

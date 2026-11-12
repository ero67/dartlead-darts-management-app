#!/usr/bin/env node
// Calibrates BOT_LEVELS in src/lib/botPlayer.js: for every level, finds the
// scatter radius (sigma, mm) at which the bot posts the level's target 3-dart
// average in a best-of-5 match against itself with that level's strategy
// tier, and picks the naive tier's best scoring target for that accuracy.
// Prints the table to paste into BOT_LEVELS. Deterministic (fixed seeds); the
// optimiser tiers make it slow, several minutes.
//
//   node scripts/calibrate-bots.mjs           # recalibrate
//   node scripts/calibrate-bots.mjs --check   # verify the current table (±3, few dragging legs), exit 1 if off
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BOT_LEVELS, simulateLeg, simulateMatch, throwAt } from '../src/lib/botPlayer.js';

const root = dirname(fileURLToPath(import.meta.url));
const checkouts = JSON.parse(readFileSync(join(root, '../src/data/checkouts.json'), 'utf8'));

const MATCHES = 400;
const SOLO_LEGS = 1000;

const matchAverage = (level) => {
  let darts = 0, scored = 0, attempts = 0, legs = 0, seed = 1234567;
  for (let i = 0; i < MATCHES; i++) {
    const r = simulateMatch({ level, checkouts, seed });
    seed = r.seed; darts += r.darts; scored += r.scored; attempts += r.checkoutAttempts; legs += r.legsWon;
  }
  return { average: (scored / darts) * 3, checkoutPct: (legs / attempts) * 100 };
};

if (process.argv.includes('--check')) {
  let ok = true;
  for (const level of BOT_LEVELS) {
    const { average } = matchAverage(level);
    // Legs the bot has to finish itself (the opponent never checks out): how
    // far below the label they average, and how many drag on (steadying).
    let seed = 99, darts = 0, dragging = 0;
    for (let i = 0; i < SOLO_LEGS; i++) {
      const leg = simulateLeg({ level, checkouts, seed });
      seed = leg.seed; darts += leg.darts;
      if ((leg.scored / leg.darts) * 3 < level.average * 0.7) dragging++;
    }
    const solo = ((501 * SOLO_LEGS) / darts) * 3;
    const draggingPct = (dragging / SOLO_LEGS) * 100;
    const off = Math.abs(average - level.average) > 3 || draggingPct > 3;
    ok &&= !off;
    console.log(`level ${level.level}  target ${level.average}  measured ${average.toFixed(1)}  full legs ${solo.toFixed(1)}  legs under 70% of target ${draggingPct.toFixed(1)}%${off ? '  OFF' : ''}`);
  }
  process.exit(ok ? 0 : 1);
}

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
  for (let iter = 0; iter < 14; iter++) {
    const sigma = (lo + hi) / 2;
    level = { ...base, sigma, scoringTarget: base.tier === 'naive' ? bestScoringTarget(sigma) : 'T20' };
    const { average } = matchAverage(level);
    if (average > base.average) lo = sigma; else hi = sigma;
  }
  const sigma = Math.round(((lo + hi) / 2) * 10) / 10;
  level = { ...base, sigma, scoringTarget: base.tier === 'naive' ? bestScoringTarget(sigma) : 'T20' };
  const r = matchAverage(level);
  calibrated.push({ ...level, measured: r });
  console.log(`level ${base.level}  target ${base.average}  sigma ${sigma.toFixed(1)}  aim ${level.scoringTarget.padEnd(4)}  avg ${r.average.toFixed(1)}  checkout ${r.checkoutPct.toFixed(0)}%`);
}

console.log('\nPaste into BOT_LEVELS:');
for (const l of calibrated) {
  console.log(`  { level: ${l.level}, average: ${l.average}, tier: '${l.tier}', sigma: ${l.sigma.toFixed(1)}, scoringTarget: '${l.scoringTarget}' },`);
}

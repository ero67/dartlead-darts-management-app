#!/usr/bin/env node
// Scores the win-chance model the way the app uses it: every completed match
// is predicted only from matches that finished before it, then compared with
// the legs actually won. Matches are split by time: settings are fitted on the
// older 75% and judged on the newer 25% they never saw. Compares ways of
// estimating a player's strength (src/lib/winProbability.js, playerStrength):
//   scope       "tournament" = this tournament only (what the TV showed),
//               "all" = every earlier match of the player
//   half-life   recency weighting, in matches (∞ = plain average)
//   prior       darts at the field average mixed in (0 = none)
// and prints the settings to paste into src/lib/winProbability.js.
//
//   node scripts/calibrate-win-probability.mjs [.env.staging.local]
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { legWinProbability, matchWinProbability, playerStrength } from '../src/lib/winProbability.js';

const envFile = process.argv[2] || '.env.production.local';
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  })
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Only the numbers needed, not the whole result JSON.
const COLUMNS = 'id, tournament_id, player1_id, player2_id, legs_to_win, completed_at, created_at, '
  + 's1:result->player1Stats->totalScore, d1:result->player1Stats->totalDarts, '
  + 's2:result->player2Stats->totalScore, d2:result->player2Stats->totalDarts, '
  + 'l1:result->player1Legs, l2:result->player2Legs, '
  + 'a1:result->player1Stats->doubleAttempts, a2:result->player2Stats->doubleAttempts';
const PAGE = 1000;
const rows = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase.from('matches').select(COLUMNS)
    .eq('status', 'completed').not('result', 'is', null).range(from, from + PAGE - 1);
  if (error) throw error;
  rows.push(...data);
  if (data.length < PAGE) break;
}
const matches = rows
  .map(r => ({ ...r, t: Date.parse(r.completed_at || r.created_at), s1: +r.s1, d1: +r.d1, s2: +r.s2, d2: +r.d2, l1: +r.l1 || 0, l2: +r.l2 || 0, a1: +r.a1 || 0, a2: +r.a2 || 0 }))
  .filter(m => m.player1_id && m.player2_id && m.d1 > 0 && m.d2 > 0 && m.l1 + m.l2 > 0 && Number.isFinite(m.t))
  .sort((a, b) => a.t - b.t);
const cut = Math.floor(matches.length * 0.75);
const train = matches.slice(0, cut);
const fieldAverage = (train.reduce((s, m) => s + m.s1 + m.s2, 0) / train.reduce((s, m) => s + m.d1 + m.d2, 0)) * 3;
console.log(`matches ${matches.length} (train ${cut} up to ${new Date(matches[cut - 1].t).toISOString().slice(0, 10)}, test ${matches.length - cut}), field average ${fieldAverage.toFixed(1)}`);

const configs = [];
for (const scope of ['tournament', 'all'])
  for (const halfLife of [Infinity, 5, 10, 20, 40])
    for (const priorDarts of [0, 30, 60, 120, 240, 480])
      configs.push({ scope, halfLife, priorDarts });

// Walk forward: predict each match from histories so far, then add it.
const byPlayer = new Map();       // player → [{score, darts}] newest first
const byTournament = new Map();   // tournament:player → same
const push = (map, key, entry) => { if (!map.has(key)) map.set(key, []); map.get(key).unshift(entry); };
const preds = configs.map(() => []);  // per config: { diff, known } per match
const seenBefore = [];                // both players have an earlier match anywhere
for (const m of matches) {
  seenBefore.push(byPlayer.has(m.player1_id) && byPlayer.has(m.player2_id));
  configs.forEach((c, i) => {
    const hist = (pid) => (c.scope === 'all' ? byPlayer.get(pid) : byTournament.get(`${m.tournament_id}:${pid}`)) || [];
    const a = playerStrength(hist(m.player1_id), { ...c, fieldAverage });
    const b = playerStrength(hist(m.player2_id), { ...c, fieldAverage });
    preds[i].push(a != null && b != null ? a - b : 0); // unknown player → 50:50
  });
  push(byPlayer, m.player1_id, { score: m.s1, darts: m.d1 });
  push(byPlayer, m.player2_id, { score: m.s2, darts: m.d2 });
  push(byTournament, `${m.tournament_id}:${m.player1_id}`, { score: m.s1, darts: m.d1 });
  push(byTournament, `${m.tournament_id}:${m.player2_id}`, { score: m.s2, darts: m.d2 });
}

const clamp = (p) => Math.min(1 - 1e-9, Math.max(1e-9, p));
// Per-leg log loss (lower is better) over a slice of matches.
const legLoss = (diffs, from, to, scale, only) => {
  let loss = 0, legs = 0;
  for (let j = from; j < to; j++) {
    if (only && !only[j]) continue;
    const m = matches[j];
    const p = clamp(legWinProbability(diffs[j], 0, scale));
    loss -= m.l1 * Math.log(p) + m.l2 * Math.log(1 - p);
    legs += m.l1 + m.l2;
  }
  return loss / legs;
};
// Match Brier score: squared error of the pre-match win chance.
const brier = (diffs, from, to, scale, only) => {
  let sum = 0, n = 0;
  for (let j = from; j < to; j++) {
    if (only && !only[j]) continue;
    const m = matches[j];
    const p = matchWinProbability(diffs[j] + 50, 50, { legsToWin: m.legs_to_win || Math.max(m.l1, m.l2), scale });
    sum += (p - (m.l1 > m.l2 ? 1 : 0)) ** 2;
    n++;
  }
  return sum / n;
};

const results = configs.map((c, i) => {
  let best = { scale: 0, loss: Infinity };
  for (let scale = 3; scale <= 30; scale += 0.5) {
    const loss = legLoss(preds[i], 0, cut, scale);
    if (loss < best.loss) best = { scale, loss };
  }
  const n = matches.length;
  return {
    ...c, scale: best.scale, train: best.loss,
    test: legLoss(preds[i], cut, n, best.scale),
    testSeen: legLoss(preds[i], cut, n, best.scale, seenBefore),
    brier: brier(preds[i], cut, n, best.scale)
  };
});

const fmt = (r) => `${r.scope.padEnd(10)} ${String(r.halfLife).padStart(8)} ${String(r.priorDarts).padStart(5)} ${String(r.scale).padStart(5)}  ${r.train.toFixed(4)}  ${r.test.toFixed(4)}  ${r.testSeen.toFixed(4)}  ${r.brier.toFixed(4)}`;
const header = 'scope      half-life prior scale  train   test    test*   brier';
const coin = Math.log(2);
console.log(`\ncoin flip leg log loss ${coin.toFixed(4)}; test* = only test matches where both players had played before (${seenBefore.slice(cut).filter(Boolean).length} of ${matches.length - cut})`);
console.log('\ncurrent app (tournament only, plain average, no prior):');
console.log(header);
const baseline = results.find(r => r.scope === 'tournament' && r.halfLife === Infinity && r.priorDarts === 0);
console.log(fmt(baseline));
console.log('\nbest 10 by train loss:');
console.log(header);
const ranked = [...results].sort((a, b) => a.train - b.train);
ranked.slice(0, 10).forEach(r => console.log(fmt(r)));
const pick = ranked[0];
console.log(`\npick (chosen on train only): scope ${pick.scope}, HALF_LIFE ${pick.halfLife}, PRIOR_DARTS ${pick.priorDarts}, AVG_SCALE ${pick.scale}, FIELD_AVERAGE ${fieldAverage.toFixed(0)}`);
console.log(`held-out leg log loss ${pick.test.toFixed(4)} vs current ${baseline.test.toFixed(4)} (${(((baseline.test - pick.test) / baseline.test) * 100).toFixed(1)}% better); brier ${pick.brier.toFixed(4)} vs ${baseline.brier.toFixed(4)}`);

// What each ingredient adds, and whether the pick's match chances come true.
console.log('\nstep by step (held-out):');
console.log(header);
for (const [scope, halfLife, priorDarts] of [['tournament', Infinity, 0], ['all', Infinity, 0], ['all', pick.halfLife, 0], ['all', pick.halfLife, pick.priorDarts]]) {
  console.log(fmt(results.find(r => r.scope === scope && r.halfLife === halfLife && r.priorDarts === priorDarts)));
}
const pi = configs.indexOf(configs.find(c => c.scope === pick.scope && c.halfLife === pick.halfLife && c.priorDarts === pick.priorDarts));
const buckets = new Map();
for (let j = cut; j < matches.length; j++) {
  const m = matches[j];
  const p = matchWinProbability(preds[pi][j] + 50, 50, { legsToWin: m.legs_to_win || Math.max(m.l1, m.l2), scale: pick.scale });
  const fav = Math.max(p, 1 - p);
  const favWon = (p >= 0.5) === (m.l1 > m.l2);
  const b = Math.min(9, Math.floor(fav * 10));
  const row = buckets.get(b) || { won: 0, n: 0, sum: 0 };
  row.won += favWon ? 1 : 0; row.n++; row.sum += fav;
  buckets.set(b, row);
}
console.log('\nheld-out matches: favourite\'s predicted vs actual win rate');
console.log('predicted  actual  matches');
for (const [, { won, n, sum }] of [...buckets].sort((a, b) => a[0] - b[0])) {
  console.log(`${((sum / n) * 100).toFixed(0).padStart(8)}%  ${((won / n) * 100).toFixed(0).padStart(5)}%  ${String(n).padStart(7)}`);
}

// Finishing: does a player's checkout rate (legs won per double attempt,
// recency weighted like the average, shrunk to the field rate) add anything
// on top of the picked average model? logit p = Δstrength/scale + β·Δlogit(rate)
// 2026-10-21: no (β = 0 on 312 train matches). Rerun as attempts accumulate.
const logit = (p) => Math.log(p / (1 - p));
const finishHist = new Map();
const finishDiff = [];
const rateOf = (hist, prior) => {
  let won = prior * fieldRate, att = prior;
  hist.forEach((h, i) => { const w = 0.5 ** (i / pick.halfLife); won += w * h.won; att += w * h.att; });
  return won / att;
};
// Only matches where both sides recorded double attempts carry the signal
// (recorded since mid-September), so the finishing test splits those by time.
const fIdx = matches.map((m, j) => (m.a1 > 0 && m.a2 > 0 ? j : -1)).filter(j => j >= 0);
const fCut = Math.floor(fIdx.length * 0.75);
const fTrain = fIdx.slice(0, fCut), fTest = fIdx.slice(fCut);
const fieldRate = fTrain.reduce((s, j) => s + matches[j].l1 + matches[j].l2, 0) / fTrain.reduce((s, j) => s + matches[j].a1 + matches[j].a2, 0);
const FINISH_PRIORS = [10, 25, 50, 100, 200];
const finishPreds = FINISH_PRIORS.map(() => []);
for (const m of matches) {
  const h1 = finishHist.get(m.player1_id) || [], h2 = finishHist.get(m.player2_id) || [];
  FINISH_PRIORS.forEach((k, i) => finishPreds[i].push(logit(rateOf(h1, k)) - logit(rateOf(h2, k))));
  for (const [pid, won, att] of [[m.player1_id, m.l1, m.a1], [m.player2_id, m.l2, m.a2]]) {
    if (att <= 0) continue;
    if (!finishHist.has(pid)) finishHist.set(pid, []);
    finishHist.get(pid).unshift({ won, att });
  }
}
const lossWith = (fd, beta, scale, idx) => {
  let loss = 0, legs = 0;
  for (const j of idx) {
    const m = matches[j];
    const p = clamp(1 / (1 + Math.exp(-(preds[pi][j] / scale + beta * fd[j]))));
    loss -= m.l1 * Math.log(p) + m.l2 * Math.log(1 - p);
    legs += m.l1 + m.l2;
  }
  return loss / legs;
};
let bestF = { train: Infinity };
let bestNoF = { train: Infinity };
FINISH_PRIORS.forEach((k, i) => {
  for (let beta = 0; beta <= 1.5; beta += 0.05)
    for (let scale = pick.scale - 2; scale <= pick.scale + 3; scale += 0.5) {
      const tr = lossWith(finishPreds[i], beta, scale, fTrain);
      if (tr < bestF.train) bestF = { prior: k, beta, scale, train: tr, i };
      if (beta === 0 && tr < bestNoF.train) bestNoF = { scale, train: tr };
    }
});
const finishTest = lossWith(finishPreds[bestF.i], bestF.beta, bestF.scale, fTest);
const noFinishTest = lossWith(finishPreds[0], 0, bestNoF.scale, fTest);
console.log(`\nfinishing: ${fIdx.length} matches with attempts (train ${fTrain.length}, test ${fTest.length}); field checkout rate ${(fieldRate * 100).toFixed(1)}%`);
console.log(`best on train: prior ${bestF.prior} attempts, beta ${bestF.beta.toFixed(2)}, scale ${bestF.scale}`);
console.log(`held-out leg log loss ${finishTest.toFixed(4)} with finishing vs ${noFinishTest.toFixed(4)} without (same matches)`);

// Leg in progress (src/lib/legChance.js): fit SPREAD so the simulated
// leg-start chance (both throw orders averaged) matches the picked model,
// then score the simulation's leg-start chances on the held-out matches.
const { legWinChance } = await import('../src/lib/legChance.js');
const checkouts = JSON.parse(readFileSync(new URL('../src/data/checkouts.json', import.meta.url), 'utf8'));
const simStart = (a, b, spread, sims) => (
  legWinChance({ remaining: [501, 501], thrower: 0, strengths: [a, b], checkouts, sims, spread })
  + legWinChance({ remaining: [501, 501], thrower: 1, strengths: [a, b], checkouts, sims, spread })) / 2;
const PAIRS = [[40, 35], [45, 40], [50, 40], [55, 45], [45, 30], [60, 45], [65, 50], [70, 55]];
let bestSpread = { err: Infinity };
for (let spread = 1; spread <= 2.01; spread += 0.05) {
  const err = PAIRS.reduce((e, [a, b]) => e + (logit(clamp(simStart(a, b, spread, 1000))) - logit(legWinProbability(a, b, pick.scale))) ** 2, 0);
  if (err < bestSpread.err) bestSpread = { spread: Math.round(spread * 100) / 100, err };
}
console.log(`\nleg in progress: SPREAD ${bestSpread.spread} makes the simulated leg start match the model`);
for (const [a, b] of PAIRS.slice(0, 4)) console.log(`  ${a} vs ${b}: sim ${(simStart(a, b, bestSpread.spread, 2000) * 100).toFixed(0)}%  model ${(legWinProbability(a, b, pick.scale) * 100).toFixed(0)}%`);
let simLoss = 0, simLegs = 0;
for (let j = cut; j < matches.length; j++) {
  const m = matches[j];
  const a = 50 + preds[pi][j] / 2, b = 50 - preds[pi][j] / 2;
  const p = clamp(simStart(a, b, bestSpread.spread, 300));
  simLoss -= m.l1 * Math.log(p) + m.l2 * Math.log(1 - p);
  simLegs += m.l1 + m.l2;
}
console.log(`held-out leg log loss of the simulated leg start ${(simLoss / simLegs).toFixed(4)} vs model ${pick.test.toFixed(4)}`);

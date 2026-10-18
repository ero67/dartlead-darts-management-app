#!/usr/bin/env node
// Fits AVG_SCALE in src/lib/winProbability.js against completed matches in
// the database named by an env file (default .env.production.local; read
// access is public under RLS). Each player's strength is their average over
// the *other* matches of the same tournament (leave-one-out), and every leg
// is a Bernoulli trial. Prints the best scale and a calibration table.
//
//   node scripts/calibrate-win-probability.mjs [.env.staging.local]
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envFile = process.argv[2] || '.env.production.local';
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  })
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const PAGE = 1000;
const matches = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, tournament_id, player1_id, player2_id, result')
    .eq('status', 'completed')
    .not('result', 'is', null)
    .range(from, from + PAGE - 1);
  if (error) throw error;
  matches.push(...data);
  if (data.length < PAGE) break;
}

// Per tournament + player: total score and darts across all matches.
const totals = new Map();
const key = (m, pid) => `${m.tournament_id}:${pid}`;
const add = (k, s) => {
  const t = totals.get(k) || { score: 0, darts: 0 };
  t.score += s?.totalScore || 0; t.darts += s?.totalDarts || 0;
  totals.set(k, t);
};
for (const m of matches) { add(key(m, m.player1_id), m.result.player1Stats); add(key(m, m.player2_id), m.result.player2Stats); }

const looAvg = (m, pid, s) => {
  const t = totals.get(key(m, pid));
  const darts = t.darts - (s?.totalDarts || 0);
  return darts >= 60 ? ((t.score - (s?.totalScore || 0)) / darts) * 3 : null; // ≥ 60 other darts, else too noisy
};
const trials = [];
for (const m of matches) {
  const a = looAvg(m, m.player1_id, m.result.player1Stats);
  const b = looAvg(m, m.player2_id, m.result.player2Stats);
  const la = m.result.player1Legs || 0, lb = m.result.player2Legs || 0;
  if (a && b && la + lb > 0) trials.push({ diff: a - b, la, lb });
}
console.log(`matches ${matches.length}, usable ${trials.length}, legs ${trials.reduce((n, t) => n + t.la + t.lb, 0)}`);

const logLik = (scale) => trials.reduce((ll, { diff, la, lb }) => {
  const p = 1 / (1 + Math.exp(-diff / scale));
  return ll + la * Math.log(p) + lb * Math.log(1 - p);
}, 0);
let best = { scale: 0, ll: -Infinity };
for (let scale = 2; scale <= 30; scale += 0.5) {
  const ll = logLik(scale);
  if (ll > best.ll) best = { scale, ll };
}
console.log(`best AVG_SCALE ${best.scale}  (log-likelihood ${best.ll.toFixed(1)})`);

// Calibration: predicted leg win % vs observed, per bucket of difference.
const buckets = new Map();
for (const { diff, la, lb } of trials) {
  const b = Math.round(diff / 5) * 5;
  const row = buckets.get(b) || { won: 0, n: 0 };
  row.won += la; row.n += la + lb; buckets.set(b, row);
}
console.log('avg diff  predicted  observed  legs');
for (const [b, { won, n }] of [...buckets].sort((x, y) => x[0] - y[0])) {
  const pred = 1 / (1 + Math.exp(-b / best.scale));
  console.log(`${String(b).padStart(8)}  ${(pred * 100).toFixed(0).padStart(8)}%  ${((won / n) * 100).toFixed(0).padStart(7)}%  ${n}`);
}

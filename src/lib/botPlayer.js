// Computer opponent for X01 practice. Pure: no React, no storage, no globals.
//
// The bot is a thrower, not a dice roll: every dart is aimed at a point on a
// real dartboard and lands with two-dimensional Gaussian scatter, then the
// landing point is scored by geometry. Difficulty is the scatter radius in
// millimetres (`sigma`); everything a player would recognise — averages,
// 180s, missed doubles, the odd bust — falls out of that one number. Doubles
// get a slightly wider scatter (`doubleFactor`) because real players finish
// worse than their scoring suggests.
//
// Strategy comes in three tiers so weak bots are weak for the right reasons:
//   naive      scores at whatever its accuracy makes best (T19 / bull rather
//              than T20), finishes only from even numbers ≤ 40 and 50
//   chart      T20 scoring, follows the checkout table, sets up finishes
//   optimiser  before every dart under 230, samples its own scatter at each
//              candidate target and picks the best expected outcome
//
// Randomness is a seeded generator whose state lives in the match, so undoing
// and replaying gives the same visit (no undo-until-the-bot-misses).
//
// `checkouts` is the app's checkout table (src/data/checkouts.json), passed in
// by the caller so this module stays importable from Node for calibration and
// tests (scripts/calibrate-bots.mjs).

// ---- Board geometry (mm, standard board) -----------------------------------
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const R_DOUBLE_BULL = 6.35;
const R_SINGLE_BULL = 15.9;
const R_TRIPLE_IN = 99;
const R_TRIPLE_OUT = 107;
const R_DOUBLE_IN = 162;
const R_DOUBLE_OUT = 170;
const SEGMENT_DEG = 18;

const RING_RADIUS = { T: (R_TRIPLE_IN + R_TRIPLE_OUT) / 2, D: (R_DOUBLE_IN + R_DOUBLE_OUT) / 2, S: 135 };

// Aim point for a target label: 'T20', 'D16', 'S5' or '5', '25' (single
// bull), 'Bull' / 'D25' (double bull).
export const aimPoint = (label) => {
  if (label === 'Bull' || label === 'D25' || label === '50') return { x: 0, y: 0 };
  if (label === '25') return { x: 0, y: (R_SINGLE_BULL + R_DOUBLE_BULL) / 2 };
  const ring = /^[TDS]/.test(label) ? label[0] : 'S';
  const number = Number.parseInt(ring === label[0] && /^[TDS]/.test(label) ? label.slice(1) : label, 10);
  const idx = SEGMENTS.indexOf(number);
  if (idx < 0) return { x: 0, y: 0 };
  const angle = (idx * SEGMENT_DEG * Math.PI) / 180; // 0 = straight up = 20
  const radius = RING_RADIUS[ring];
  return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius };
};

// Score a landing point in the engine's dart format ({ value, label, number, multiplier }).
export const scorePoint = (x, y) => {
  const r = Math.hypot(x, y);
  if (r <= R_DOUBLE_BULL) return { value: 50, label: 'D25', number: 25, multiplier: 2 };
  if (r <= R_SINGLE_BULL) return { value: 25, label: '25', number: 25, multiplier: 1 };
  if (r > R_DOUBLE_OUT) return { value: 0, label: '0', number: 0, multiplier: 1 };
  let deg = (Math.atan2(x, y) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const number = SEGMENTS[Math.round(deg / SEGMENT_DEG) % 20];
  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return { value: number * 3, label: `T${number}`, number, multiplier: 3 };
  if (r >= R_DOUBLE_IN && r <= R_DOUBLE_OUT) return { value: number * 2, label: `D${number}`, number, multiplier: 2 };
  return { value: number, label: `S${number}`, number, multiplier: 1 };
};

// ---- Seeded randomness -----------------------------------------------------
// mulberry32: tiny, good enough, and the whole state is one 32-bit integer
// that can sit in the match state.
export const nextRandom = (seed) => {
  let s = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: s };
};

export const newSeed = () => (Math.floor(Math.random() * 0xffffffff) | 0);

// Box–Muller; returns two standard normals and the advanced seed.
const gaussianPair = (seed) => {
  const a = nextRandom(seed);
  const b = nextRandom(a.seed);
  const radius = Math.sqrt(-2 * Math.log(1 - a.value));
  const angle = 2 * Math.PI * b.value;
  return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle), seed: b.seed };
};

// One throw at `label` with scatter `sigma`. Returns the engine dart and the new seed.
export const throwAt = (label, sigma, seed) => {
  const aim = aimPoint(label);
  const g = gaussianPair(seed);
  return { dart: scorePoint(aim.x + g.dx * sigma, aim.y + g.dy * sigma), seed: g.seed };
};

// ---- Levels ----------------------------------------------------------------
// sigma / doubleFactor / scoringTarget are produced by scripts/calibrate-bots.mjs
// so that a full 501 leg averages `average` (±3) with this strategy tier.
// Measured checkout rates run from 11% (level 1) to 44% (level 8).
export const BOT_LEVELS = [
  { level: 1, average: 35, tier: 'naive', sigma: 20.4, doubleFactor: 1.3, scoringTarget: 'T19' },
  { level: 2, average: 42, tier: 'naive', sigma: 17.2, doubleFactor: 1.3, scoringTarget: 'T19' },
  { level: 3, average: 50, tier: 'naive', sigma: 14.6, doubleFactor: 1.25, scoringTarget: 'T20' },
  { level: 4, average: 58, tier: 'chart', sigma: 13.3, doubleFactor: 1.2, scoringTarget: 'T20' },
  { level: 5, average: 66, tier: 'chart', sigma: 11.4, doubleFactor: 1.2, scoringTarget: 'T20' },
  { level: 6, average: 75, tier: 'chart', sigma: 9.7, doubleFactor: 1.15, scoringTarget: 'T20' },
  { level: 7, average: 85, tier: 'optimiser', sigma: 7.3, doubleFactor: 1.15, scoringTarget: 'T20' },
  { level: 8, average: 95, tier: 'optimiser', sigma: 6.3, doubleFactor: 1.1, scoringTarget: 'T20' }
];

export const getBotLevel = (level) => BOT_LEVELS.find((l) => l.level === level) || BOT_LEVELS[3];

// ---- Strategy --------------------------------------------------------------
const BOGEY = new Set([169, 168, 166, 165, 163, 162, 159]);
const isFinishable = (n) => n >= 2 && n <= 170 && !BOGEY.has(n);
const isDoubleOut = (n) => (n % 2 === 0 && n >= 2 && n <= 40) || n === 50;
const isDoubleLabel = (label) => label.startsWith('D') || label === 'Bull';

const singleValue = (label) => {
  if (label === '25') return 25;
  if (label === 'Bull') return 50;
  const m = /^([TDS]?)(\d+)$/.exec(label);
  if (!m) return 0;
  const n = Number(m[2]);
  return m[1] === 'T' ? n * 3 : m[1] === 'D' ? n * 2 : n;
};

// Chart route for a remaining score, from the app's table: ['T20','T11','D14'].
const routeFor = (checkouts, remaining) => (checkouts && checkouts[String(remaining)]) || null;

// Scoring shot that cannot bust from `remaining` and, for the chart tier,
// prefers to leave a finish.
const setupShot = (remaining, scoringTarget, careful) => {
  if (remaining > 230 || !careful) {
    // Too far out to plan, or a bot that does not plan: just score.
    // Guard the obvious bust: never aim a treble that could leave 0/1/negative.
    return remaining <= 62 ? 'S20' : scoringTarget;
  }
  for (const label of ['T20', 'T19', 'T18', 'T17', 'S20', 'S19']) {
    const leave = remaining - singleValue(label);
    if (leave > 1 && (leave > 170 || isFinishable(leave))) return label;
  }
  return 'S1';
};

const naiveTarget = (remaining, level) => {
  if (remaining === 50) return 'Bull';
  if (isDoubleOut(remaining)) return `D${remaining / 2}`;
  if (remaining <= 40) return 'S1'; // odd: knock one off to reach a double
  if (remaining <= 62) return 'S20';
  return level.scoringTarget;
};

const chartTarget = (remaining, dartsLeft, level, checkouts) => {
  if (remaining === 50) return 'Bull';
  if (isDoubleOut(remaining)) return `D${remaining / 2}`;
  const route = routeFor(checkouts, remaining);
  if (route) {
    // With fewer darts than the route needs, still play its first step: it
    // sets up the leg even when it cannot finish this visit.
    return route[0] === 'Bull' ? 'Bull' : /^\d+$/.test(route[0]) ? `S${route[0]}` : route[0];
  }
  return setupShot(remaining, level.scoringTarget, true);
};

// How good is it to stand on `remaining` with `dartsLeft` darts still in hand
// this visit? 1 = leg won, 0 = bust-like. Heuristic, tuned for the optimiser.
const leaveValue = (remaining, dartsLeft) => {
  if (remaining === 0) return 1;
  if (remaining < 2) return 0;
  if (isDoubleOut(remaining)) return dartsLeft > 0 ? 0.82 : 0.7;
  if (remaining <= 60 && remaining % 2 === 1) return dartsLeft > 1 ? 0.55 : 0.42;
  if (remaining <= 60) return dartsLeft > 1 ? 0.6 : 0.5;
  if (remaining <= 110 && isFinishable(remaining)) return dartsLeft > 1 ? 0.45 : 0.36;
  if (isFinishable(remaining)) return 0.3;
  if (remaining <= 170) return 0.12; // bogey
  if (remaining <= 230) return 0.22;
  return 0.2 - remaining / 5000; // further out is (slightly) worse
};

const OPTIMISER_SAMPLES = 160;

const optimiserTarget = (remaining, dartsLeft, level, checkouts, seed) => {
  if (remaining > 230) return { label: level.scoringTarget, seed };
  const candidates = new Set(['T20', 'T19', 'T18', 'T17', 'S20', 'S19', 'S18', 'S17', 'S16', 'S8', '25', 'Bull']);
  if (isDoubleOut(remaining)) candidates.add(remaining === 50 ? 'Bull' : `D${remaining / 2}`);
  const route = routeFor(checkouts, remaining);
  if (route) candidates.add(route[0] === 'Bull' ? 'Bull' : /^\d+$/.test(route[0]) ? `S${route[0]}` : route[0]);
  // Singles that leave a double this visit
  for (const d of [40, 32, 36, 24, 20, 16, 8]) {
    const need = remaining - d;
    if (need >= 1 && need <= 20) candidates.add(`S${need}`);
  }

  let best = null;
  let bestScore = -Infinity;
  let s = seed;
  for (const label of candidates) {
    const sigma = level.sigma * (isDoubleLabel(label) ? level.doubleFactor : 1);
    let total = 0;
    for (let i = 0; i < OPTIMISER_SAMPLES; i++) {
      const r = throwAt(label, sigma, s);
      s = r.seed;
      const after = remaining - r.dart.value;
      if (after === 0) total += r.dart.multiplier === 2 ? 1 : -0.5;
      else if (after < 2) total += -0.5;
      else total += leaveValue(after, dartsLeft - 1) * 0.92; // a dart spent is a dart spent
    }
    const score = total / OPTIMISER_SAMPLES;
    if (score > bestScore) { bestScore = score; best = label; }
  }
  return { label: best, seed: s };
};

// Where the bot aims from `remaining` with `dartsLeft` (3, 2 or 1) in the visit.
export const chooseTarget = ({ remaining, dartsLeft, level, checkouts, seed }) => {
  if (level.tier === 'naive') return { label: naiveTarget(remaining, level), seed };
  if (level.tier === 'chart') return { label: chartTarget(remaining, dartsLeft, level, checkouts), seed };
  return optimiserTarget(remaining, dartsLeft, level, checkouts, seed);
};

// One dart: pick a target, throw at it. Returns { dart, target, seed }.
export const botThrow = ({ remaining, dartsLeft, level, checkouts, seed }) => {
  const choice = chooseTarget({ remaining, dartsLeft, level, checkouts, seed });
  const sigma = level.sigma * (isDoubleLabel(choice.label) ? level.doubleFactor : 1);
  const thrown = throwAt(choice.label, sigma, choice.seed);
  return { dart: thrown.dart, target: choice.label, seed: thrown.seed };
};

// A whole visit from `remaining`: up to three darts, stopping on a checkout or
// a bust the same way the engine would. Returns the darts in engine format
// (the caller feeds them to the engine one by one), the outcome and the seed.
export const botVisit = ({ remaining, level, checkouts, seed }) => {
  const darts = [];
  let left = remaining;
  let s = seed;
  let outcome = 'visit';
  for (let i = 0; i < 3; i++) {
    const t = botThrow({ remaining: left, dartsLeft: 3 - i, level, checkouts, seed: s });
    s = t.seed;
    darts.push({ ...t.dart, target: t.target });
    const after = left - t.dart.value;
    if (after < 0 || after === 1 || (after === 0 && t.dart.multiplier !== 2)) { outcome = 'bust'; break; }
    if (after === 0) { outcome = 'checkout'; break; }
    left = after;
  }
  return { darts, outcome, seed: s };
};

// Simulate a full leg alone; used by calibration and tests.
export const simulateLeg = ({ startingScore = 501, level, checkouts, seed }) => {
  let remaining = startingScore;
  let darts = 0;
  let scored = 0;
  let s = seed;
  let visits = 0;
  let checkoutAttempts = 0;
  while (remaining > 0 && visits < 200) {
    if (isFinishable(remaining)) checkoutAttempts++;
    const v = botVisit({ remaining, level, checkouts, seed: s });
    s = v.seed;
    visits++;
    darts += v.darts.length;
    if (v.outcome === 'bust') continue;
    const visitScore = v.darts.reduce((sum, d) => sum + d.value, 0);
    scored += visitScore;
    remaining -= visitScore;
  }
  return { darts, scored, checkoutAttempts, seed: s, finished: remaining === 0 };
};

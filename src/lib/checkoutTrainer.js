// Checkout trainer: random finishes, three darts per attempt. Pure state
// machine, dart-by-dart only (a turn total cannot tell a double from a bust).

import { isFinishable, isBustScore } from './x01Engine.js';

const UNDO_LIMIT = 300;

export const CHECKOUT_RANGES = {
  doubles: { min: 2, max: 50, oneDartOnly: true },
  low: { min: 2, max: 60 },
  mid: { min: 61, max: 100 },
  high: { min: 101, max: 170 },
  all: { min: 2, max: 170 }
};
export const ATTEMPT_OPTIONS = [10, 20, 50, null];

export const isOneDartOut = (n) => n === 50 || (n % 2 === 0 && n >= 2 && n <= 40);

export const finishableTargets = ({ min, max, oneDartOnly = false }) => {
  const out = [];
  for (let n = Math.max(2, min); n <= Math.min(170, max); n++) {
    if (oneDartOnly ? isOneDartOut(n) : isFinishable(n)) out.push(n);
  }
  return out;
};

// Never repeats the previous target; a degenerate rng must not loop forever.
const pickTarget = (settings, previous, rng = Math.random) => {
  const pool = finishableTargets(settings);
  if (pool.length === 0) return 40;
  if (pool.length === 1) return pool[0];
  let idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  if (pool[idx] === previous) idx = (idx + 1) % pool.length;
  return pool[idx];
};

export const createCheckoutTrainer = ({ min = 2, max = 170, oneDartOnly = false, attemptsTarget = 20 } = {}, rng) => {
  const settings = { min, max, oneDartOnly, attemptsTarget };
  return {
    settings,
    attempts: [],
    current: { target: pickTarget(settings, null, rng), darts: [] },
    startedAt: Date.now(),
    finishedAt: null,
    undoStack: []
  };
};

const withoutStack = (state) => {
  // eslint-disable-next-line no-unused-vars
  const { undoStack, ...rest } = state;
  return rest;
};
const pushUndo = (state) => {
  const stack = [...state.undoStack, withoutStack(state)];
  return stack.length > UNDO_LIMIT ? stack.slice(-UNDO_LIMIT) : stack;
};

const remainingOf = (current) => current.target - current.darts.reduce((sum, d) => sum + d.value, 0);
export const liveRemaining = (state) => remainingOf(state.current);

// Returns { state, outcome } with outcome 'dart' | 'hit' | 'miss' | 'bust' | null.
export const applyDart = (state, dart, rng) => {
  if (!dart || state.finishedAt || state.current.darts.length >= 3) return { state, outcome: null };
  const before = remainingOf(state.current);
  const darts = [...state.current.darts, { ...dart, atDouble: isOneDartOut(before) }];
  const after = before - dart.value;

  let outcome = 'dart';
  if (isBustScore(after) || (after === 0 && dart.multiplier !== 2)) outcome = 'bust';
  else if (after === 0) outcome = 'hit';
  else if (darts.length === 3) outcome = 'miss';

  if (outcome === 'dart') {
    return { state: { ...state, current: { ...state.current, darts }, undoStack: pushUndo(state) }, outcome };
  }

  const attempt = { target: state.current.target, darts, hit: outcome === 'hit', bust: outcome === 'bust', dartsUsed: darts.length };
  const attempts = [...state.attempts, attempt];
  const complete = state.settings.attemptsTarget !== null && attempts.length >= state.settings.attemptsTarget;
  return {
    state: {
      ...state,
      attempts,
      current: { target: pickTarget(state.settings, state.current.target, rng), darts: [] },
      finishedAt: complete ? Date.now() : null,
      undoStack: pushUndo(state)
    },
    outcome
  };
};

export const canUndo = (state) => state.undoStack.length > 0;
export const undo = (state) => {
  if (!canUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

export const isSessionComplete = (state) =>
  state.settings.attemptsTarget !== null && state.attempts.length >= state.settings.attemptsTarget;

const round1 = (n) => Math.round(n * 10) / 10;

export const computeStats = (state) => {
  const { attempts } = state;
  const hits = attempts.filter(a => a.hit).length;
  const allDarts = attempts.flatMap(a => a.darts);
  const dartsAtDouble = allDarts.filter(d => d.atDouble).length;
  const doublesHit = attempts.filter(a => a.hit).length; // every hit is a dart at a double that landed
  const totalDarts = allDarts.length + state.current.darts.length;
  let streak = 0, bestStreak = 0;
  for (const a of attempts) { streak = a.hit ? streak + 1 : 0; if (streak > bestStreak) bestStreak = streak; }
  const missesByTarget = {};
  for (const a of attempts) if (!a.hit) missesByTarget[a.target] = (missesByTarget[a.target] || 0) + 1;
  const hardest = Object.entries(missesByTarget).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([target, misses]) => ({ target: Number(target), misses }));
  const dartsOnHits = attempts.filter(a => a.hit).reduce((sum, a) => sum + a.dartsUsed, 0);
  return {
    attempts: attempts.length,
    hits,
    hitPercent: attempts.length ? round1((hits / attempts.length) * 100) : null,
    dartsAtDouble,
    doublesHit,
    doublePercent: dartsAtDouble ? round1((doublesHit / dartsAtDouble) * 100) : null,
    avgDartsPerHit: hits ? round1(dartsOnHits / hits) : null,
    bestStreak,
    totalDarts,
    busts: attempts.filter(a => a.bust).length,
    hardest
  };
};

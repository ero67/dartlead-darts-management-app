// The 121 game: check out the target within three visits (nine darts). Make
// it and the target goes up by one; miss and it drops by one (or stays, per
// settings). The starting target is also the floor: a miss there leaves the
// target where it is, so a 121 session never drops to 120. Each round is one
// X01 leg run by x01Engine; this module tracks the rounds and owns undo.

import { createSoloX01, applyDart as x01ApplyDart, applyVisitTotal as x01ApplyVisitTotal } from './x01Engine.js';

const UNDO_LIMIT = 300;
const VISITS_PER_ROUND = 3;
export const ROUND_OPTIONS = [10, 20, null];
export const MIN_TARGET = 41;
export const MAX_TARGET = 170;
const BOGEY = new Set([169, 168, 166, 165, 163, 162, 159]);

const clampTarget = (n) => {
  let t = Math.max(MIN_TARGET, Math.min(MAX_TARGET, n));
  while (BOGEY.has(t)) t += 1;
  return Math.min(MAX_TARGET, t);
};
// Never below the floor (the target the session started on).
const stepDown = (n, floor) => { let t = n - 1; while (BOGEY.has(t)) t -= 1; return Math.max(floor, t); };
const stepUp = (n) => { let t = n + 1; while (BOGEY.has(t)) t += 1; return Math.min(MAX_TARGET, t); };

const newRound = (target, scoringMode) => ({ ...createSoloX01({ startingScore: target, legsTarget: 1, scoringMode }), undoStack: [] });

export const createOneTwentyOne = ({ startTarget = 121, roundsTarget = 10, scoringMode = 'dart', onFail = 'down' } = {}) => {
  const settings = { startTarget: clampTarget(startTarget), roundsTarget, scoringMode, onFail };
  return {
    settings,
    rounds: [],
    target: settings.startTarget,
    round: newRound(settings.startTarget, scoringMode),
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

// Settle the round if the leg is won or the visits are used up.
const settle = (state, roundState, outcome) => {
  const legWon = roundState.legs.length === 1;
  const visitsUsed = roundState.current.visits.length;
  const roundOver = legWon || visitsUsed >= VISITS_PER_ROUND;
  if (!roundOver) {
    return { state: { ...state, round: { ...roundState, undoStack: [] }, undoStack: pushUndo(state) }, outcome };
  }
  const darts = legWon
    ? roundState.legs[0].darts
    : roundState.current.visits.reduce((sum, v) => sum + v.darts, 0);
  const roundRecord = { target: state.target, success: legWon, darts, visits: legWon ? roundState.legs[0].visits.length : visitsUsed };
  const rounds = [...state.rounds, roundRecord];
  const nextTarget = legWon
    ? stepUp(state.target)
    : (state.settings.onFail === 'down' ? stepDown(state.target, state.settings.startTarget) : state.target);
  const complete = state.settings.roundsTarget !== null && rounds.length >= state.settings.roundsTarget;
  return {
    state: {
      ...state,
      rounds,
      target: nextTarget,
      round: newRound(nextTarget, state.settings.scoringMode),
      finishedAt: complete ? Date.now() : null,
      undoStack: pushUndo(state)
    },
    outcome: legWon ? 'success' : 'fail'
  };
};

export const applyDart = (state, dart) => {
  if (state.finishedAt) return { state, outcome: null };
  const r = x01ApplyDart(state.round, dart);
  if (r.outcome === null) return { state, outcome: null };
  return settle(state, r.state, r.outcome);
};

export const applyVisitTotal = (state, total, opts) => {
  if (state.finishedAt) return { state, outcome: null };
  const r = x01ApplyVisitTotal(state.round, total, opts);
  if (r.outcome === null) return { state, outcome: null };
  return settle(state, r.state, r.outcome);
};

export const canUndo = (state) => state.undoStack.length > 0;
export const undo = (state) => {
  if (!canUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

export const isSessionComplete = (state) =>
  state.settings.roundsTarget !== null && state.rounds.length >= state.settings.roundsTarget;

export const visitsLeft = (state) => VISITS_PER_ROUND - state.round.current.visits.length;

const round1 = (n) => Math.round(n * 10) / 10;

export const computeStats = (state) => {
  const { rounds } = state;
  const successes = rounds.filter(r => r.success).length;
  const highestTarget = rounds.reduce((max, r) => Math.max(max, r.target), state.settings.startTarget);
  const highestSuccess = rounds.filter(r => r.success).reduce((max, r) => Math.max(max, r.target), 0);
  let streak = 0, bestStreak = 0;
  for (const r of rounds) { streak = r.success ? streak + 1 : 0; if (streak > bestStreak) bestStreak = streak; }
  const totalDarts = rounds.reduce((sum, r) => sum + r.darts, 0)
    + state.round.current.visits.reduce((sum, v) => sum + v.darts, 0)
    + state.round.current.visit.darts.length;
  const dartsOnSuccess = rounds.filter(r => r.success).reduce((sum, r) => sum + r.darts, 0);
  return {
    rounds: rounds.length,
    successes,
    successPercent: rounds.length ? round1((successes / rounds.length) * 100) : null,
    highestTarget,
    highestSuccess: highestSuccess || null,
    finalTarget: state.target,
    bestStreak,
    totalDarts,
    avgDartsPerSuccess: successes ? round1(dartsOnSuccess / successes) : null
  };
};

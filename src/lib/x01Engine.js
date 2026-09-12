// Pure X01 scoring engine: no React, no storage, no network.
//
// Used by practice mode (solo X01) and meant to become the single source of
// the X01 rules that MatchInterface currently implements inline: bust on
// remaining < 0 or === 1, a checkout must end on a double, a bust restores the
// score to the start of the visit but still counts the darts thrown.
//
// State is treated as immutable: every action returns a new object. Undo is
// snapshot-based (the state is tiny), capped to keep localStorage small.

export const DART_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 0];
export const INPUT_MODES = ['single', 'double', 'triple'];
export const SCORING_MODES = ['dart', 'turnTotal'];
export const STARTING_SCORES = [501, 301, 170, 121];

const UNDO_LIMIT = 300;

// Scores that cannot be finished with three darts.
const BOGEY_NUMBERS = new Set([169, 168, 166, 165, 163, 162, 159]);

export const isFinishable = (remaining) =>
  Number.isInteger(remaining) && remaining >= 2 && remaining <= 170 && !BOGEY_NUMBERS.has(remaining);

// Scores that can be finished with a single dart: any even number up to 40,
// or the bull. A dart thrown on one of these is a dart at a double.
export const isOneDartOut = (remaining) =>
  remaining === 50 || (Number.isInteger(remaining) && remaining % 2 === 0 && remaining >= 2 && remaining <= 40);

// Build a dart entry from a keypad press. Returns null for an impossible dart
// (there is no triple bull).
export const dartFromInput = (number, inputMode = 'single') => {
  if (number === 0) return { value: 0, label: '0', number: 0, multiplier: 1 };
  if (number === 25) {
    if (inputMode === 'triple') return null;
    return inputMode === 'double'
      ? { value: 50, label: 'D25', number: 25, multiplier: 2 }
      : { value: 25, label: '25', number: 25, multiplier: 1 };
  }
  const multiplier = inputMode === 'double' ? 2 : inputMode === 'triple' ? 3 : 1;
  const prefix = multiplier === 2 ? 'D' : multiplier === 3 ? 'T' : 'S';
  return { value: number * multiplier, label: `${prefix}${number}`, number, multiplier };
};

// Keypad labels drop the S prefix for singles, keep D and T.
export const displayLabel = (label) => {
  if (!label) return '';
  return label.startsWith('S') ? label.slice(1) : label;
};

export const isBustScore = (remainingAfter) => remainingAfter < 0 || remainingAfter === 1;

const newLeg = (startingScore) => ({
  startRemaining: startingScore,
  remaining: startingScore,
  visits: [],
  visit: { darts: [] }
});

export const createSoloX01 = ({ startingScore = 501, legsTarget = null, scoringMode = 'dart' } = {}) => ({
  settings: { startingScore, legsTarget, scoringMode },
  legs: [],
  current: newLeg(startingScore),
  startedAt: Date.now(),
  finishedAt: null,
  undoStack: []
});

export const isSessionComplete = (state) =>
  state.settings.legsTarget !== null && state.legs.length >= state.settings.legsTarget;

const withoutStack = (state) => {
  // eslint-disable-next-line no-unused-vars
  const { undoStack, ...rest } = state;
  return rest;
};

const pushUndo = (state) => {
  const stack = [...state.undoStack, withoutStack(state)];
  return stack.length > UNDO_LIMIT ? stack.slice(stack.length - UNDO_LIMIT) : stack;
};

// Close the current visit with the given outcome and return the new state.
const settleVisit = (state, { darts, score, dartsCount, outcome, startRemaining }) => {
  const visit = {
    score,
    darts: dartsCount,
    startRemaining,
    isBust: outcome === 'bust',
    isCheckout: outcome === 'checkout',
    dartsList: darts
  };
  const visits = [...state.current.visits, visit];

  if (outcome === 'checkout') {
    const legDarts = visits.reduce((sum, v) => sum + v.darts, 0);
    const completedLeg = {
      startRemaining: state.current.startRemaining,
      visits,
      darts: legDarts,
      checkout: score
    };
    const legs = [...state.legs, completedLeg];
    const complete = state.settings.legsTarget !== null && legs.length >= state.settings.legsTarget;
    return {
      ...state,
      legs,
      current: newLeg(state.settings.startingScore),
      finishedAt: complete ? Date.now() : null,
      undoStack: pushUndo(state)
    };
  }

  return {
    ...state,
    current: {
      ...state.current,
      // A bust restores the score to the start of the visit.
      remaining: outcome === 'bust' ? startRemaining : startRemaining - score,
      visits,
      visit: { darts: [] }
    },
    undoStack: pushUndo(state)
  };
};

// Dart-by-dart input. Returns { state, outcome } where outcome is
// 'dart' (visit continues), 'visit' (three darts thrown), 'bust' or 'checkout'.
export const applyDart = (state, dart) => {
  if (!dart || state.finishedAt) return { state, outcome: null };
  const { current } = state;
  if (current.visit.darts.length >= 3) return { state, outcome: null };

  const darts = [...current.visit.darts, dart];
  const visitScore = darts.reduce((sum, d) => sum + d.value, 0);
  const startRemaining = current.remaining;
  const after = startRemaining - visitScore;

  if (isBustScore(after) || (after === 0 && dart.multiplier !== 2)) {
    return {
      state: settleVisit(state, { darts, score: 0, dartsCount: darts.length, outcome: 'bust', startRemaining }),
      outcome: 'bust'
    };
  }
  if (after === 0) {
    return {
      state: settleVisit(state, { darts, score: visitScore, dartsCount: darts.length, outcome: 'checkout', startRemaining }),
      outcome: 'checkout'
    };
  }
  if (darts.length === 3) {
    return {
      state: settleVisit(state, { darts, score: visitScore, dartsCount: 3, outcome: 'visit', startRemaining }),
      outcome: 'visit'
    };
  }
  // Mid-visit: keep the partial visit, remaining shown live.
  return {
    state: {
      ...state,
      current: { ...current, visit: { darts } },
      undoStack: pushUndo(state)
    },
    outcome: 'dart'
  };
};

// Three-dart total input. `dartsUsed` and `finishedOnDouble` only matter when
// the total reaches exactly zero.
export const applyVisitTotal = (state, total, { dartsUsed = 3, finishedOnDouble = false } = {}) => {
  if (state.finishedAt) return { state, outcome: null };
  if (!Number.isInteger(total) || total < 0 || total > 180) return { state, outcome: null };
  if (![1, 2, 3].includes(dartsUsed)) return { state, outcome: null };

  const startRemaining = state.current.remaining;
  const after = startRemaining - total;
  const entry = { value: total, label: String(total), number: null, multiplier: finishedOnDouble ? 2 : 1, isTurnTotal: true };

  if (isBustScore(after) || (after === 0 && !finishedOnDouble)) {
    return {
      state: settleVisit(state, { darts: [entry], score: 0, dartsCount: dartsUsed, outcome: 'bust', startRemaining }),
      outcome: 'bust'
    };
  }
  if (after === 0) {
    return {
      state: settleVisit(state, { darts: [entry], score: total, dartsCount: dartsUsed, outcome: 'checkout', startRemaining }),
      outcome: 'checkout'
    };
  }
  return {
    state: settleVisit(state, { darts: [entry], score: total, dartsCount: 3, outcome: 'visit', startRemaining }),
    outcome: 'visit'
  };
};

// The opponent checked out: close this player's unfinished leg as lost so its
// visits and darts still count towards averages, then start the next leg.
export const abandonLeg = (state) => {
  const { current } = state;
  const visits = current.visit.darts.length > 0
    ? [...current.visits, {
        score: 0, darts: current.visit.darts.length, startRemaining: current.remaining,
        isBust: false, isCheckout: false, isPartial: true, dartsList: current.visit.darts
      }]
    : current.visits;
  const lostLeg = {
    startRemaining: current.startRemaining,
    visits,
    darts: visits.reduce((sum, v) => sum + v.darts, 0),
    checkout: 0,
    lost: true
  };
  return {
    ...state,
    legs: [...state.legs, lostLeg],
    current: newLeg(state.settings.startingScore),
    undoStack: pushUndo(state)
  };
};

export const canUndo = (state) => state.undoStack.length > 0;

export const undo = (state) => {
  if (!canUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

// Remaining score as it should be displayed: live during a visit.
export const liveRemaining = (state) =>
  state.current.remaining - state.current.visit.darts.reduce((sum, d) => sum + d.value, 0);

// Labels of the darts thrown in the visit in progress, or of the last
// completed visit when none is in progress (same as the match screen).
export const lastVisitLabels = (state) => {
  const { visit, visits } = state.current;
  if (visit.darts.length > 0) return visit.darts.map(d => displayLabel(d.label));
  const last = visits[visits.length - 1];
  if (last) return last.dartsList.map(d => displayLabel(d.label));
  return [];
};

const round1 = (n) => Math.round(n * 10) / 10;

export const computeStats = (state) => {
  // Legs lost to an opponent (abandonLeg) count for darts and averages but
  // are not checkouts, best legs or won legs.
  const completedLegs = state.legs.filter(leg => !leg.lost);
  const legsForVisits = [...state.legs, state.current];
  const allVisits = legsForVisits.flatMap(l => l.visits);

  const totalDarts = allVisits.reduce((sum, v) => sum + v.darts, 0);
  const totalScore = allVisits.reduce((sum, v) => sum + v.score, 0);
  const average = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;

  let firstNineScore = 0;
  let firstNineDarts = 0;
  for (const leg of legsForVisits) {
    for (const v of leg.visits.slice(0, 3)) {
      firstNineScore += v.score;
      firstNineDarts += v.darts;
    }
  }
  const firstNineAverage = firstNineDarts > 0 ? (firstNineScore / firstNineDarts) * 3 : 0;

  const scored = allVisits.filter(v => !v.isBust);
  const oneEighties = scored.filter(v => v.score === 180).length;
  const oneForties = scored.filter(v => v.score >= 140 && v.score < 180).length;
  const tons = scored.filter(v => v.score >= 100 && v.score < 140).length;
  const highestVisit = scored.reduce((max, v) => Math.max(max, v.score), 0);

  // A checkout attempt is a visit started on a finishable score.
  const checkoutAttempts = allVisits.filter(v => isFinishable(v.startRemaining)).length;
  const checkoutsHit = completedLegs.length;
  const checkoutPercent = checkoutAttempts > 0 ? (checkoutsHit / checkoutAttempts) * 100 : null;

  const bestLegDarts = completedLegs.reduce((best, leg) => (best === null || leg.darts < best ? leg.darts : best), null);
  const highestCheckout = completedLegs.reduce((max, leg) => Math.max(max, leg.checkout), 0);
  const busts = allVisits.filter(v => v.isBust).length;

  return {
    legs: completedLegs.length,
    totalDarts,
    totalScore,
    average: round1(average),
    firstNineAverage: round1(firstNineAverage),
    oneEighties,
    oneForties,
    tons,
    highestVisit,
    checkoutAttempts,
    checkoutsHit,
    checkoutPercent: checkoutPercent === null ? null : round1(checkoutPercent),
    bestLegDarts,
    highestCheckout,
    busts
  };
};

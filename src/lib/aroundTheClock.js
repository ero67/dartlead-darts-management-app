// Around the Clock: hit 1 to 20 in order, then bull. Input is hit / miss per
// dart. Timer runs from the first dart.

const UNDO_LIMIT = 400;
export const ATC_MODES = ['singles', 'doubles', 'trebles'];

const buildTargets = (includeBull) => {
  const t = Array.from({ length: 20 }, (_, i) => i + 1);
  if (includeBull) t.push(25);
  return t;
};

export const createAroundTheClock = ({ mode = 'singles', includeBull = true } = {}) => ({
  settings: { mode: ATC_MODES.includes(mode) ? mode : 'singles', includeBull: mode === 'trebles' ? false : includeBull },
  targets: buildTargets(mode === 'trebles' ? false : includeBull),
  targetIndex: 0,
  dartsPerTarget: [],       // darts thrown at each completed target
  currentDarts: 0,          // darts thrown at the current target so far
  startedAt: Date.now(),
  firstDartAt: null,
  finishedAt: null,
  undoStack: []
});

const withoutStack = (state) => {
  // eslint-disable-next-line no-unused-vars
  const { undoStack, ...rest } = state;
  return rest;
};
const pushUndo = (state) => {
  const stack = [...state.undoStack, withoutStack(state)];
  return stack.length > UNDO_LIMIT ? stack.slice(-UNDO_LIMIT) : stack;
};

export const currentTarget = (state) => state.targets[state.targetIndex] ?? null;
export const isComplete = (state) => state.targetIndex >= state.targets.length;

// hit: true / false. Returns { state, outcome: 'hit' | 'miss' | 'finished' | null }.
export const applyThrow = (state, hit, now = Date.now()) => {
  if (isComplete(state) || state.finishedAt) return { state, outcome: null };
  const base = { ...state, firstDartAt: state.firstDartAt ?? now, undoStack: pushUndo(state) };
  if (!hit) return { state: { ...base, currentDarts: state.currentDarts + 1 }, outcome: 'miss' };
  const dartsPerTarget = [...state.dartsPerTarget, state.currentDarts + 1];
  const targetIndex = state.targetIndex + 1;
  const finished = targetIndex >= state.targets.length;
  return {
    state: { ...base, dartsPerTarget, targetIndex, currentDarts: 0, finishedAt: finished ? now : null },
    outcome: finished ? 'finished' : 'hit'
  };
};

export const canUndo = (state) => state.undoStack.length > 0;
export const undo = (state) => {
  if (!canUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

const round1 = (n) => Math.round(n * 10) / 10;

export const computeStats = (state) => {
  const totalDarts = state.dartsPerTarget.reduce((sum, d) => sum + d, 0) + state.currentDarts;
  const completed = state.dartsPerTarget.length;
  const hardest = state.dartsPerTarget
    .map((darts, i) => ({ target: state.targets[i], darts }))
    .sort((a, b) => b.darts - a.darts)
    .slice(0, 3);
  const firstDartHits = state.dartsPerTarget.filter(d => d === 1).length;
  const end = state.finishedAt ?? Date.now();
  const seconds = state.firstDartAt ? Math.round((end - state.firstDartAt) / 1000) : 0;
  return {
    totalDarts,
    targetsCompleted: completed,
    targetsTotal: state.targets.length,
    avgDartsPerTarget: completed ? round1(totalDarts / completed) : null,
    firstDartHits,
    hardest,
    seconds
  };
};

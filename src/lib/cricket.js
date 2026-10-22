// Two-player Cricket (standard, with points). Pure: no React, no storage, so
// the tournament scoring screen, practice 1v1 / bot and node self-checks
// (scripts/check-cricket.mjs) share one rulebook.
//
// Targets are 15–20 and the bull, closed in any order. A single is one mark,
// a double two, a treble three; the outer bull is one mark, the inner bull
// two. Three marks close (open) a number for the thrower. Further marks on it
// score its face value (25 per bull mark) while the opponent still has it
// open; once both have closed it the number is dead. A leg is won the moment
// the thrower has closed everything with points >= the opponent's.
//
// Darts use the app's dart format ({ value, label, number, multiplier }, see
// x01Engine.dartFromInput) so keypads and the bot thrower plug straight in.
//
// MPR (marks per round of three darts) counts effective marks only: marks
// that close a number or score. Hits on a dead number, or past three when
// the opponent has closed it too, are not marks.

import { throwAt } from './botPlayer.js';

export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];
export const CRICKET_LEG_OPTIONS = [1, 2, 3, 4, 5, 7, 10];
const UNDO_LIMIT = 300;

const emptyMarks = () => Object.fromEntries(CRICKET_NUMBERS.map((n) => [n, 0]));
const newLegState = (players) => ({
  marks: players.map(emptyMarks),
  points: players.map(() => 0),
  visit: { darts: [], marks: 0 },
  visits: [] // { player, darts: [label], marks, points } of this leg
});
const emptyTotals = () => ({ darts: 0, marks: 0, points: 0, visits: 0, visitMarks: [] });

export const isCricketNumber = (n) => CRICKET_NUMBERS.includes(n);
export const isClosed = (marks, n) => marks[n] >= 3;
export const allClosed = (marks) => CRICKET_NUMBERS.every((n) => marks[n] >= 3);
export const pointValue = (n) => (n === 25 ? 25 : n);

// players: [{ id, name, kind: 'human' | 'bot', level? }, { ... }]
// `starter` is a player index, or 'bullup' (wait for matchSetStarter).
export const createCricketMatch = ({ legsTarget = 3, players, starter = 0, seed = 0 }) => ({
  kind: 'cricket',
  settings: { legsTarget, players, starter },
  seed,
  leg: newLegState(players),
  totals: players.map(emptyTotals),
  starterPending: starter === 'bullup',
  turn: starter === 'bullup' ? 0 : starter,
  legStarter: starter === 'bullup' ? 0 : starter,
  legNumber: 1,
  legsWon: players.map(() => 0),
  legLog: [],
  winner: null,
  startedAt: Date.now(),
  finishedAt: null,
  undoStack: []
});

export const isCricketState = (state) => state?.kind === 'cricket';

// Game type of a tournament / match row ('x01' when unset: every row before
// Cricket existed is X01).
export const GAME_TYPES = ['x01', 'cricket'];
export const isCricketGame = (gameType) => gameType === 'cricket';

const withoutStack = (state) => {
  // eslint-disable-next-line no-unused-vars
  const { undoStack, ...rest } = state;
  return rest;
};
const pushUndo = (state) => {
  const stack = [...state.undoStack, withoutStack(state)];
  return stack.length > UNDO_LIMIT ? stack.slice(stack.length - UNDO_LIMIT) : stack;
};

// What one dart does for `thrower` given both players' marks. Pure helper the
// engine, the bot and the board preview share.
export const scoreDart = (marks, thrower, dart) => {
  const n = dart?.number;
  if (!isCricketNumber(n) || !dart.multiplier) return { marks: 0, points: 0 };
  const before = marks[thrower][n];
  const closing = Math.min(3, before + dart.multiplier) - Math.min(3, before);
  const extra = Math.max(0, before + dart.multiplier - 3) - Math.max(0, before - 3);
  const opponentOpen = marks.some((m, i) => i !== thrower && m[n] < 3);
  return opponentOpen
    ? { marks: closing + extra, points: extra * pointValue(n) }
    : { marks: closing, points: 0 };
};

const legWonBy = (leg, player) =>
  allClosed(leg.marks[player]) && leg.points.every((p, i) => i === player || leg.points[player] >= p);

// The visit in progress is folded into the leg log and the thrower's totals.
const closeVisit = (state, leg, totals) => {
  const { turn } = state;
  const v = leg.visit;
  const visits = [...leg.visits, { player: turn, darts: v.darts, marks: v.marks, points: v.points || 0 }];
  const t = totals[turn];
  const nextTotals = totals.map((x, i) => (i === turn ? { ...t, visits: t.visits + 1, visitMarks: [...t.visitMarks, v.marks] } : x));
  return { leg: { ...leg, visits, visit: { darts: [], marks: 0 } }, totals: nextTotals };
};

const closeLeg = (state, leg, totals, winner, { byBullup }) => {
  const legsWon = state.legsWon.map((n, i) => (i === winner ? n + 1 : n));
  const legLog = [...state.legLog, {
    leg: state.legNumber,
    winner,
    starter: state.legStarter,
    darts: leg.visits.filter((v) => v.player === winner).reduce((s, v) => s + v.darts.length, 0),
    // per player, for leg rows and leg tables
    playerDarts: leg.points.map((_, p) => leg.visits.filter((v) => v.player === p).reduce((s, v) => s + v.darts.length, 0)),
    playerMarks: leg.points.map((_, p) => leg.visits.filter((v) => v.player === p).reduce((s, v) => s + v.marks, 0)),
    points: leg.points,
    marks: leg.marks,
    byBullup
  }];
  const finished = legsWon[winner] >= state.settings.legsTarget;
  const nextStarter = (state.legStarter + 1) % state.settings.players.length;
  return {
    ...state,
    totals,
    legsWon,
    legLog,
    leg: finished ? leg : newLegState(state.settings.players),
    winner: finished ? winner : null,
    finishedAt: finished ? Date.now() : null,
    legStarter: finished ? state.legStarter : nextStarter,
    turn: finished ? winner : nextStarter,
    legNumber: finished ? state.legNumber : state.legNumber + 1
  };
};

// Returns { state, outcome: 'dart' | 'visit' | 'leg' | 'match' | null }.
export const cricketApplyDart = (state, dart) => {
  if (!dart || state.finishedAt || state.starterPending) return { state, outcome: null };
  const { turn } = state;
  const effect = scoreDart(state.leg.marks, turn, dart);
  const marks = state.leg.marks.map((m, i) => (i === turn && isCricketNumber(dart.number)
    ? { ...m, [dart.number]: m[dart.number] + dart.multiplier }
    : m));
  const points = state.leg.points.map((p, i) => (i === turn ? p + effect.points : p));
  const visit = {
    darts: [...state.leg.visit.darts, dart.label],
    marks: state.leg.visit.marks + effect.marks,
    points: (state.leg.visit.points || 0) + effect.points
  };
  let leg = { ...state.leg, marks, points, visit };
  let totals = state.totals.map((t, i) => (i === turn
    ? { ...t, darts: t.darts + 1, marks: t.marks + effect.marks, points: t.points + effect.points }
    : t));
  const base = { ...state, undoStack: pushUndo(state) };

  if (legWonBy(leg, turn)) {
    ({ leg, totals } = closeVisit(state, leg, totals));
    const next = closeLeg(base, leg, totals, turn, { byBullup: false });
    return { state: next, outcome: next.finishedAt ? 'match' : 'leg' };
  }
  if (visit.darts.length < 3) return { state: { ...base, leg, totals }, outcome: 'dart' };
  ({ leg, totals } = closeVisit(state, leg, totals));
  return { state: { ...base, leg, totals, turn: (turn + 1) % state.settings.players.length }, outcome: 'visit' };
};

// "Next player": the rest of the visit is misses.
export const cricketEndVisit = (state) => {
  let current = state;
  const thrower = state.turn;
  let guard = 0;
  while (!current.finishedAt && current.turn === thrower && current.legNumber === state.legNumber && guard++ < 3) {
    current = cricketApplyDart(current, { value: 0, label: '0', number: 0, multiplier: 1 }).state;
  }
  // one undo step for the whole fill
  return current === state ? state : { ...current, undoStack: pushUndo(state) };
};

// A leg that ran too long, decided at the bull.
export const cricketAwardLegByBullup = (state, winner) => {
  if (state.finishedAt) return state;
  const { leg, totals } = state.leg.visit.darts.length ? closeVisit(state, state.leg, state.totals) : state;
  return closeLeg({ ...state, undoStack: pushUndo(state) }, leg, totals, winner, { byBullup: true });
};

export const cricketSetStarter = (state, starter) => ({
  ...state,
  settings: { ...state.settings, starter },
  starterPending: false,
  turn: starter,
  legStarter: starter
});

export const cricketCanUndo = (state) => state.undoStack.length > 0;
export const cricketUndo = (state) => {
  if (!cricketCanUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

export const isCricketBotTurn = (state) =>
  isCricketState(state) && !state.finishedAt && !state.starterPending && state.settings.players[state.turn]?.kind === 'bot';

// Undo for the human: also steps back over bot visits (see x01Match.matchUndoHuman).
export const cricketUndoHuman = (state) => {
  let current = cricketUndo(state);
  let guard = 0;
  while (isCricketBotTurn(current) && cricketCanUndo(current) && guard++ < 10) current = cricketUndo(current);
  return current;
};

// Visits in the current leg (for "bull-up after N visits" like X01).
export const cricketLegVisits = (state) => state.leg.visits.length;

const round2 = (n) => Math.round(n * 100) / 100;
export const mprOf = (marks, darts) => (darts > 0 ? round2((marks / darts) * 3) : 0);

// Per-player stats for result screens and the match result payload.
export const cricketPlayerStats = (totals, legsWon) => ({
  darts: totals.darts,
  marks: totals.marks,
  points: totals.points,
  mpr: mprOf(totals.marks, totals.darts),
  legsWon,
  bestVisit: totals.visitMarks.length ? Math.max(...totals.visitMarks) : 0,
  fiveMarkVisits: totals.visitMarks.filter((m) => m >= 5).length,
  nineMarkVisits: totals.visitMarks.filter((m) => m === 9).length
});

export const computeCricketStats = (state) => {
  const players = state.totals.map((t, i) => cricketPlayerStats(t, state.legsWon[i]));
  return {
    players,
    legsWon: state.legsWon,
    winner: state.winner,
    legsFor: state.legsWon[0],
    legsAgainst: state.legsWon[1] ?? 0,
    won: state.winner === null ? null : state.winner === 0
  };
};

// ---- Bot --------------------------------------------------------------------
// Standard "lead and close" play: when ahead (or level), close the most
// valuable number still open for you, preferring ones the opponent scores on;
// when behind, score on your best number the opponent has not closed, or
// close one of theirs if you have none. Accuracy comes from the level's
// sigma via botPlayer.throwAt, so levels play the same "strength" as in X01.
const aimFor = (n) => (n === 25 ? 'Bull' : `T${n}`);

export const cricketBotTarget = (marks, points, me) => {
  const opp = 1 - me;
  const mineOpen = CRICKET_NUMBERS.filter((n) => marks[me][n] < 3);
  const scoring = CRICKET_NUMBERS.filter((n) => marks[me][n] >= 3 && marks[opp][n] < 3);
  const behind = points[me] < points[opp];
  if (behind && scoring.length) return aimFor(scoring[0]);
  if (behind && !scoring.length && mineOpen.length) return aimFor(mineOpen[0]);
  // Ahead / level: close what the opponent can score on first.
  const theirs = mineOpen.filter((n) => marks[opp][n] >= 3);
  if (theirs.length) return aimFor(theirs[0]);
  if (mineOpen.length) return aimFor(mineOpen[0]);
  return scoring.length ? aimFor(scoring[0]) : 'Bull';
};

// The bot's whole visit as ONE undo step; returns intermediate states for
// dart-by-dart animation and the final state carrying the advanced seed.
export const cricketBotVisit = (state, level) => {
  const states = [];
  let current = state;
  let seed = state.seed;
  const thrower = state.turn;
  for (let i = 0; i < 3; i++) {
    if (current.finishedAt || current.turn !== thrower || current.legNumber !== state.legNumber) break;
    const target = cricketBotTarget(current.leg.marks, current.leg.points, thrower);
    const thrown = throwAt(target, level.sigma, seed);
    seed = thrown.seed;
    const result = cricketApplyDart(current, thrown.dart);
    if (result.outcome === null) break;
    current = result.state;
    states.push(current);
  }
  return { states, final: { ...current, seed, undoStack: pushUndo(state) } };
};

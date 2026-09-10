// Two-player X01 on one device (practice "1v1" and, later, bots). Pure: no
// React, no storage. Each player is a solo x01Engine state so scoring rules,
// visit bookkeeping and per-player stats are the same code as solo practice;
// this module only adds turns, legs and the match result.
//
// A leg ends when the thrower checks out: the opponent's unfinished leg is
// closed as lost (abandonLeg) so their darts still count. Legs alternate the
// starter. First to `legsTarget` legs wins.
//
// Undo is snapshot-based at match level (the per-player undo stacks are kept
// empty so snapshots stay small).

import { createSoloX01, applyDart, applyVisitTotal, abandonLeg, computeStats } from './x01Engine.js';

export const MATCH_LEG_OPTIONS = [1, 3, 5, 7];
const UNDO_LIMIT = 300;

const stripStack = (playerState) => ({ ...playerState, undoStack: [] });

// players: [{ id, name, kind: 'human' | 'bot', level? }, { ... }]
export const createX01Match = ({ startingScore = 501, legsTarget = 3, scoringMode = 'dart', players, starter = 0 }) => ({
  kind: 'match',
  settings: { startingScore, legsTarget, scoringMode, players, starter },
  players: players.map(() => stripStack(createSoloX01({ startingScore, legsTarget: null, scoringMode }))),
  turn: starter,
  legStarter: starter,
  legNumber: 1,
  legsWon: players.map(() => 0),
  legLog: [],
  winner: null,
  startedAt: Date.now(),
  finishedAt: null,
  undoStack: []
});

export const isMatch = (state) => state?.kind === 'match';

const withoutStack = (state) => {
  // eslint-disable-next-line no-unused-vars
  const { undoStack, ...rest } = state;
  return rest;
};

const pushUndo = (state) => {
  const stack = [...state.undoStack, withoutStack(state)];
  return stack.length > UNDO_LIMIT ? stack.slice(stack.length - UNDO_LIMIT) : stack;
};

// Fold the thrower's new solo state and the visit outcome into the match.
const settle = (state, playerState, outcome) => {
  const { turn } = state;
  const players = state.players.map((p, i) => (i === turn ? stripStack(playerState) : p));
  const undoStack = pushUndo(state);

  if (outcome === 'dart') {
    return { ...state, players, undoStack };
  }

  if (outcome === 'visit' || outcome === 'bust') {
    return { ...state, players, turn: (turn + 1) % players.length, undoStack };
  }

  // checkout: leg over
  const legsWon = state.legsWon.map((n, i) => (i === turn ? n + 1 : n));
  const wonLeg = playerState.legs[playerState.legs.length - 1];
  const closed = players.map((p, i) => (i === turn ? p : stripStack(abandonLeg(p))));
  const legLog = [...state.legLog, {
    leg: state.legNumber,
    winner: turn,
    starter: state.legStarter,
    darts: wonLeg?.darts ?? null,
    checkout: wonLeg?.checkout ?? null
  }];
  const finished = legsWon[turn] >= state.settings.legsTarget;
  const nextStarter = (state.legStarter + 1) % players.length;
  return {
    ...state,
    players: closed,
    legsWon,
    legLog,
    winner: finished ? turn : null,
    finishedAt: finished ? Date.now() : null,
    legStarter: finished ? state.legStarter : nextStarter,
    turn: finished ? turn : nextStarter,
    legNumber: finished ? state.legNumber : state.legNumber + 1,
    undoStack
  };
};

export const matchApplyDart = (state, dart) => {
  if (!dart || state.finishedAt) return { state, outcome: null };
  const result = applyDart(state.players[state.turn], dart);
  if (result.outcome === null) return { state, outcome: null };
  return { state: settle(state, result.state, result.outcome), outcome: result.outcome };
};

export const matchApplyVisitTotal = (state, total, options) => {
  if (state.finishedAt) return { state, outcome: null };
  const result = applyVisitTotal(state.players[state.turn], total, options);
  if (result.outcome === null) return { state, outcome: null };
  return { state: settle(state, result.state, result.outcome), outcome: result.outcome };
};

export const matchCanUndo = (state) => state.undoStack.length > 0;

export const matchUndo = (state) => {
  if (!matchCanUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

export const currentPlayerState = (state) => state.players[state.turn];

// Per-player stats plus the result, from the first player's point of view
// (that is the device owner in practice).
export const computeMatchStats = (state) => {
  const players = state.players.map(computeStats);
  return {
    players,
    legsWon: state.legsWon,
    winner: state.winner,
    legsFor: state.legsWon[0],
    legsAgainst: state.legsWon[1] ?? 0,
    won: state.winner === null ? null : state.winner === 0
  };
};

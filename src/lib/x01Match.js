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
// `seed` drives a bot opponent's throws (see botPlayer.js). It is part of the
// state, so undo snapshots restore it and a replayed bot visit is identical.
export const createX01Match = ({ startingScore = 501, legsTarget = 3, scoringMode = 'dart', players, starter = 0, seed = 0 }) => ({
  kind: 'match',
  settings: { startingScore, legsTarget, scoringMode, players, starter },
  seed,
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

// Apply a bot's whole visit (darts already thrown by botPlayer) as ONE undo
// step, so the human's undo never lands in the middle of the bot's turn.
// Returns every intermediate state (for animating dart by dart) and the final
// state carrying the advanced seed; only the final state should be committed.
export const matchApplySequence = (state, darts, seed) => {
  const states = [];
  let current = state;
  for (const dart of darts) {
    const result = matchApplyDart(current, dart);
    if (result.outcome === null) break;
    current = result.state;
    states.push(current);
  }
  const final = { ...current, seed, undoStack: pushUndo(state) };
  return { states, final };
};

export const isBotTurn = (state) => isMatch(state) && !state.finishedAt && state.settings.players[state.turn]?.kind === 'bot';

export const matchCanUndo = (state) => state.undoStack.length > 0;

export const matchUndo = (state) => {
  if (!matchCanUndo(state)) return state;
  const previous = state.undoStack[state.undoStack.length - 1];
  return { ...previous, undoStack: state.undoStack.slice(0, -1) };
};

// Undo for the human: steps back over any bot visits as well, so one press
// always removes the human's own last dart (a bot would otherwise just
// replay the same visit at once).
export const matchUndoHuman = (state) => {
  let current = matchUndo(state);
  let guard = 0;
  while (isBotTurn(current) && matchCanUndo(current) && guard++ < 10) current = matchUndo(current);
  return current;
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

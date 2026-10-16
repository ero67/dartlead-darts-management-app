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

import { createSoloX01, applyDart, applyVisitTotal, abandonLeg, awardLegByBullup, computeStats } from './x01Engine.js';

export const MATCH_LEG_OPTIONS = [1, 2, 3, 4, 5, 7, 10];
const UNDO_LIMIT = 300;

const stripStack = (playerState) => ({ ...playerState, undoStack: [] });

// players: [{ id, name, kind: 'human' | 'bot', level? }, { ... }]
// `seed` drives a bot opponent's throws (see botPlayer.js). It is part of the
// state, so undo snapshots restore it and a replayed bot visit is identical.
// `starter` is a player index, or 'bullup' when the players decide at the
// bull once the match is open: the state then waits (starterPending) for
// matchSetStarter before anyone throws.
export const createX01Match = ({ startingScore = 501, legsTarget = 3, scoringMode = 'dart', players, starter = 0, seed = 0 }) => ({
  kind: 'match',
  settings: { startingScore, legsTarget, scoringMode, players, starter },
  seed,
  players: players.map(() => stripStack(createSoloX01({ startingScore, legsTarget: null, scoringMode }))),
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
  const closed = players.map((p, i) => (i === turn ? p : stripStack(abandonLeg(p))));
  return closeLeg({ ...state, undoStack }, closed, turn, { byBullup: false });
};

// Leg over for `winner`: count it, log it, hand the next leg to the other
// starter, or finish the match. `players` already have the leg closed.
const closeLeg = (state, players, winner, { byBullup }) => {
  const legsWon = state.legsWon.map((n, i) => (i === winner ? n + 1 : n));
  const wonLeg = players[winner].legs[players[winner].legs.length - 1];
  const legLog = [...state.legLog, {
    leg: state.legNumber,
    winner,
    starter: state.legStarter,
    darts: wonLeg?.darts ?? null,
    checkout: byBullup ? null : (wonLeg?.checkout ?? null),
    byBullup
  }];
  const finished = legsWon[winner] >= state.settings.legsTarget;
  const nextStarter = (state.legStarter + 1) % players.length;
  return {
    ...state,
    players,
    legsWon,
    legLog,
    winner: finished ? winner : null,
    finishedAt: finished ? Date.now() : null,
    legStarter: finished ? state.legStarter : nextStarter,
    turn: finished ? winner : nextStarter,
    legNumber: finished ? state.legNumber : state.legNumber + 1
  };
};

// The leg ran too long and was decided at the bull: `winner` takes it with
// no checkout recorded; both players' darts so far still count.
export const matchAwardLegByBullup = (state, winner) => {
  const players = state.players.map((p, i) => stripStack(i === winner ? awardLegByBullup(p) : abandonLeg(p)));
  return closeLeg({ ...state, undoStack: pushUndo(state) }, players, winner, { byBullup: true });
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

export const isBotTurn = (state) => isMatch(state) && !state.finishedAt && !state.starterPending && state.settings.players[state.turn]?.kind === 'bot';

// Who won the bull-up throws first. Only meaningful before the first dart.
export const matchSetStarter = (state, starter) => ({
  ...state,
  settings: { ...state.settings, starter },
  starterPending: false,
  turn: starter,
  legStarter: starter
});

// The starter dialog also lets players switch dart-by-dart / turn total; the
// engine only stores the mode, the keypad reads it.
export const matchSetScoringMode = (state, scoringMode) => ({
  ...state,
  settings: { ...state.settings, scoringMode },
  players: state.players.map((p) => ({ ...p, settings: { ...p.settings, scoringMode } }))
});

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

// Pure glue between the Cricket engine (lib/cricket.js) and the tournament
// match row: live sync payload, crash recovery, the match result. No React,
// so scripts/check-cricket-match.mjs can exercise it.
import { CRICKET_NUMBERS, createCricketMatch, computeCricketStats, mprOf } from '../../../lib/cricket.js';

// Undo snapshots kept in localStorage: about two legs of darts. The engine
// keeps up to 300 in memory; storing them all would be a few hundred KB per match.
const STORED_UNDO = 100;

export const storableCricketState = (state) => ({
  ...state,
  undoStack: state.undoStack.slice(-STORED_UNDO)
});

// A bracket match restored after a refresh has no legsToWin in props; the
// row's value has to reach the snapshots too, or an undo would bring 3 back.
export const withLegsTarget = (state, legsTarget) => {
  const fix = (s) => ({ ...s, settings: { ...s.settings, legsTarget } });
  return { ...fix(state), undoStack: state.undoStack.map(fix) };
};

// The `matches` columns written after every visit (see the shared contract).
// The *_current_score columns hold Cricket POINTS.
export const cricketLiveUpdate = (state) => {
  const { leg } = state;
  return {
    current_leg: state.legNumber,
    player1_current_score: leg.points[0],
    player2_current_score: leg.points[1],
    player1_legs: state.legsWon[0],
    player2_legs: state.legsWon[1],
    current_player: state.starterPending ? null : state.turn,
    last_activity_at: new Date().toISOString(),
    live_state: {
      marks: leg.marks,
      points: leg.points,
      visit: leg.visit.darts,
      lastVisit: leg.visits[leg.visits.length - 1] || null
    }
  };
};

const toMarks = (m) => Object.fromEntries(CRICKET_NUMBERS.map((n) => [n, Number(m?.[n]) || 0]));

// Another device (or a cleared browser) resumes from the row: marks, points,
// legs and turn survive; per-dart stats and undo before this point are lost,
// as with X01's loadMatchStateFromDatabase.
export const cricketStateFromRow = (row, { legsTarget, players }) => {
  const live = row.live_state || {};
  const starter = row.match_starter === 0 || row.match_starter === 1 ? row.match_starter : null;
  const legNumber = row.current_leg || 1;
  const turn = row.current_player === 0 || row.current_player === 1 ? row.current_player : (starter ?? 0);
  const fresh = createCricketMatch({ legsTarget, players, starter: starter ?? turn });
  return {
    ...fresh,
    legNumber,
    // Legs alternate from the match starter, as in the engine.
    legStarter: starter === null ? turn : (legNumber % 2 === 1 ? starter : 1 - starter),
    turn,
    legsWon: [row.player1_legs || 0, row.player2_legs || 0],
    leg: {
      ...fresh.leg,
      marks: [0, 1].map((i) => toMarks(live.marks?.[i])),
      points: [0, 1].map((i) => Number(live.points?.[i] ?? row[`player${i + 1}_current_score`]) || 0),
      visit: { darts: Array.isArray(live.visit) ? live.visit.slice(0, 2) : [], marks: 0, points: 0 }
    }
  };
};

// Contract-shaped result for onMatchComplete / saveMatchResult.
export const cricketMatchResult = (state, match) => {
  const stats = computeCricketStats(state);
  const playerStats = (p) => {
    // eslint-disable-next-line no-unused-vars
    const { legsWon, ...s } = stats.players[p];
    return {
      ...s,
      legs: state.legLog.map((l) => ({
        leg: l.leg,
        darts: l.playerDarts[p],
        marks: l.playerMarks[p],
        mpr: mprOf(l.playerMarks[p], l.playerDarts[p]),
        points: l.points[p],
        isWin: l.winner === p,
        byBullup: l.byBullup
      }))
    };
  };
  return {
    matchId: match.id,
    gameType: 'cricket',
    groupId: match.groupId || match.group?.id,
    winner: state.winner === 0 ? match.player1?.id : match.player2?.id,
    player1Id: match.player1?.id,
    player2Id: match.player2?.id,
    player1Name: match.player1?.name,
    player2Name: match.player2?.name,
    player1Legs: state.legsWon[0],
    player2Legs: state.legsWon[1],
    isPlayoff: match.isPlayoff || false,
    playoffRound: match.playoffRound,
    playoffMatchNumber: match.playoffMatchNumber,
    player1Stats: playerStats(0),
    player2Stats: playerStats(1)
  };
};

// Simulated tournament matches for scripts/seed-demo-league.mjs. Pure, runs in
// Node: the app's own engines play the match (x01Match / cricket with the
// botPlayer thrower) and the result is shaped exactly like the scoring screens
// hand it to onMatchComplete (MatchInterface.completeMatch, cricketMatchResult),
// so saveMatchResult stores it the same way as a real match.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOT_LEVELS, botVisit, nextRandom } from '../src/lib/botPlayer.js';
import { createX01Match, matchApplySequence } from '../src/lib/x01Match.js';
import { createCricketMatch, cricketBotVisit } from '../src/lib/cricket.js';
import { cricketMatchResult } from '../src/components/match/cricket/cricketMatchState.js';
import { visitCheckoutAttempts } from '../src/utils/dartStats.js';

const checkouts = JSON.parse(readFileSync(new URL('../src/data/checkouts.json', import.meta.url), 'utf8'));

// FNV-1a: a stable 32-bit seed from any key, so reruns replay the same darts.
export const seedFrom = (key) => {
  let h = 0x811c9dc5;
  for (const ch of String(key)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return h | 0;
};

// Seeded Math.random replacement for the script's own choices.
export const rngFrom = (key) => {
  let seed = seedFrom(key);
  return () => {
    const r = nextRandom(seed);
    seed = r.seed;
    return r.value;
  };
};

// A thrower for a target 3-dart average: the bot level's sigma interpolated
// between the two calibrated levels around it (strategy tier of the nearer one).
export const skillFor = (average) => {
  const hi = BOT_LEVELS.find((l) => l.average >= average) || BOT_LEVELS[BOT_LEVELS.length - 1];
  const lo = [...BOT_LEVELS].reverse().find((l) => l.average <= average) || BOT_LEVELS[0];
  const t = hi === lo ? 0 : (average - lo.average) / (hi.average - lo.average);
  return { ...(t < 0.5 ? lo : hi), average, sigma: lo.sigma + t * (hi.sigma - lo.sigma) };
};

const stripUndo = (state) => ({ ...state, undoStack: [] });

// match: { id, player1: {id,name}, player2: {id,name}, legsToWin, startingScore, groupId?, isPlayoff?, ... }
// skills: [player1 skill, player2 skill]
export const simulateX01 = (match, skills, key) => {
  const startingScore = match.startingScore || 501;
  const seed = seedFrom(key);
  let state = createX01Match({
    startingScore,
    legsTarget: match.legsToWin,
    players: [match.player1, match.player2].map((p) => ({ ...p, kind: 'bot' })),
    starter: (seed >>> 0) % 2, // the bull-up winner
    seed
  });
  const visits = []; // MatchInterface's visit log: [leg, player, score applied]
  while (!state.finishedAt) {
    const player = state.turn;
    const v = botVisit({ remaining: state.players[player].current.remaining, level: skills[player], checkouts, seed: state.seed });
    const score = v.outcome === 'bust' ? 0 : v.darts.reduce((sum, d) => sum + d.value, 0);
    visits.push([state.legNumber, player, score]);
    state = stripUndo(matchApplySequence(state, v.darts, v.seed).final);
    assert.ok(visits.length < 2000, 'runaway leg');
  }
  return x01MatchResult(state, match, visits);
};

// The legScores bookkeeping MatchInterface does visit by visit, read back from
// the engine's per-player legs, then the same matchResult it builds.
const x01PlayerStats = (playerState, startingScore) => {
  const s = {
    totalScore: 0, totalDarts: 0, oneEighties: 0, visitScores: [], doubleAttempts: 0,
    legAverages: [], checkouts: [], legs: []
  };
  playerState.legs.forEach((leg, i) => {
    const legNo = i + 1;
    for (const v of leg.visits) {
      s.totalScore += v.score;
      s.totalDarts += v.darts;
      s.doubleAttempts += visitCheckoutAttempts(v.startRemaining, v.dartsList);
      if (!v.isBust) s.visitScores.push(v.score);
      if (!v.isBust && !v.isCheckout && v.score === 180) s.oneEighties += 1;
    }
    const scored = leg.visits.reduce((sum, v) => sum + v.score, 0);
    if (leg.lost) {
      const remainingScore = startingScore - scored;
      const average = leg.darts > 0 ? (scored / leg.darts) * 3 : 0;
      s.legs.push({ leg: legNo, darts: leg.darts, checkout: null, average, isWin: false, remainingScore });
    } else {
      assert.equal(scored, startingScore, 'a won leg scores exactly the starting score');
      const average = (startingScore / leg.darts) * 3;
      s.legAverages.push(average);
      s.legs.push({ leg: legNo, darts: leg.darts, checkout: leg.checkout, average, isWin: true });
      s.checkouts.push({ leg: legNo, checkout: leg.checkout, darts: leg.visits[leg.visits.length - 1].darts, totalDarts: leg.darts });
    }
  });
  return {
    totalScore: s.totalScore,
    totalDarts: s.totalDarts,
    average: s.totalDarts > 0 ? (s.totalScore / s.totalDarts) * 3 : 0,
    oneEighties: s.oneEighties,
    visitScores: s.visitScores,
    doubleAttempts: s.doubleAttempts,
    checkoutBasis: 'darts',
    legAverages: s.legAverages,
    checkouts: s.checkouts,
    legs: s.legs
  };
};

const x01MatchResult = (state, match, visits) => {
  const startingScore = state.settings.startingScore;
  const [p1, p2] = state.players.map((p) => x01PlayerStats(p, startingScore));
  assert.equal(p1.checkouts.length, state.legsWon[0]);
  assert.equal(p2.checkouts.length, state.legsWon[1]);
  return {
    matchId: match.id,
    visits,
    groupId: match.groupId || match.group?.id,
    winner: state.winner === 0 ? match.player1.id : match.player2.id,
    player1Id: match.player1.id,
    player2Id: match.player2.id,
    player1Name: match.player1.name,
    player2Name: match.player2.name,
    player1Legs: state.legsWon[0],
    player2Legs: state.legsWon[1],
    isPlayoff: match.isPlayoff || false,
    playoffRound: match.playoffRound,
    playoffMatchNumber: match.playoffMatchNumber,
    player1Stats: p1,
    player2Stats: p2
  };
};

export const simulateCricket = (match, skills, key) => {
  const seed = seedFrom(key);
  let state = createCricketMatch({
    legsTarget: match.legsToWin,
    players: [match.player1, match.player2].map((p) => ({ ...p, kind: 'bot' })),
    starter: (seed >>> 0) % 2,
    seed
  });
  let guard = 0;
  while (!state.finishedAt) {
    state = stripUndo(cricketBotVisit(state, skills[state.turn]).final);
    assert.ok(guard++ < 2000, 'runaway cricket leg');
  }
  return cricketMatchResult(state, match);
};

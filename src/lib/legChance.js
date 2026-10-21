// Chance to win the leg in progress, from both remaining scores and who is
// on throw, by playing the rest of the leg out with the practice bot's
// thrower (src/lib/botPlayer.js) set to each player's strength. The bots are
// calibrated to post their 3-dart average in a match, so a bot "at" a
// player's strength scores and finishes like that player on average.
// Pure like botPlayer: the caller passes the checkout table
// (src/data/checkouts.json).
import { BOT_LEVELS, botVisit } from './botPlayer.js';
import { chanceToWinFirst, legWinProbability } from './winProbability.js';

const SIMS = 400;
const MAX_VISITS = 120;

// Strengths are shrunk toward the field average, so the gap between two
// players is smaller than the gap between how they actually throw. The bots
// are set this many times further apart, which makes the simulated leg-start
// chance match the held-out-tested model (lib/winProbability.js). Fitted by
// scripts/calibrate-win-probability.mjs.
export const SPREAD = 1.55;

// A thrower for any average: scatter interpolated (in log space) between the
// two calibrated levels around it, strategy tier of the weaker one.
export const throwerFor = (average) => {
  const levels = BOT_LEVELS;
  let i = levels.findIndex((l) => l.average > average) - 1;
  if (i < 0) i = average <= levels[0].average ? 0 : levels.length - 2;
  const lo = levels[i];
  const hi = levels[i + 1];
  const t = (average - lo.average) / (hi.average - lo.average);
  const sigma = Math.exp(Math.log(lo.sigma) + t * (Math.log(hi.sigma) - Math.log(lo.sigma)));
  return { ...lo, average, sigma: Math.min(60, Math.max(3, sigma)) };
};

// Seed from the state, so the same position always shows the same number
// instead of jittering on every re-render.
const seedFor = (parts) => parts.reduce((h, p) => (Math.imul(h ^ Math.round(p * 10), 16777619) >>> 0), 2166136261) | 0;

export const legWinChance = ({ remaining, thrower, strengths, checkouts, sims = SIMS, spread = SPREAD }) => {
  const [rA, rB] = remaining;
  if (rA <= 0) return 1;
  if (rB <= 0) return 0;
  const mid = (strengths[0] + strengths[1]) / 2;
  const throwers = strengths.map((s) => throwerFor(mid + spread * (s - mid)));
  let seed = seedFor([rA, rB, thrower, strengths[0], strengths[1]]);
  let wins = 0;
  for (let n = 0; n < sims; n++) {
    const left = [rA, rB];
    let turn = thrower;
    for (let v = 0; v < MAX_VISITS; v++) {
      const visit = botVisit({ remaining: left[turn], level: throwers[turn], checkouts, seed });
      seed = visit.seed;
      if (visit.outcome !== 'bust') left[turn] -= visit.darts.reduce((s, d) => s + d.value, 0);
      if (left[turn] === 0) { if (turn === 0) wins++; break; }
      turn = 1 - turn;
    }
  }
  return wins / sims;
};

// Match chance during play: the leg in progress from the scores (the tested
// leg model while both are still on the starting score, so the starter gets
// no edge), every later leg from the tested model.
export const liveMatchChance = ({ strengths, legsToWin, legs, remaining, thrower, startingScore, checkouts }) => {
  const [sA, sB] = strengths;
  if (!(sA > 0) || !(sB > 0)) return null;
  const needA = legsToWin - legs[0];
  const needB = legsToWin - legs[1];
  if (needA <= 0 || needB <= 0) return needA <= 0 ? 1 : 0;
  const pLeg = legWinProbability(sA, sB);
  const atStart = remaining[0] === startingScore && remaining[1] === startingScore;
  const pNow = atStart || (thrower !== 0 && thrower !== 1)
    ? pLeg
    : legWinChance({ remaining, thrower, strengths, checkouts });
  return pNow * chanceToWinFirst(pLeg, needA - 1, needB) + (1 - pNow) * chanceToWinFirst(pLeg, needA, needB - 1);
};

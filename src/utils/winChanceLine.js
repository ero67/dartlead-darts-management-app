// The match win chance of player 1 after every visit of a finished match,
// replayed from the visit log saved with the result ([leg, player, score]).
// Returns null when the log cannot be trusted to cover the whole match:
// matches scored before the log existed, resumed on another device (the log
// starts mid-match) or with a leg decided at the bull (no checkout to replay).
import { liveMatchChance } from '../lib/legChance.js';

const LINE_SIMS = 200; // ~100 positions per match; the line only needs the shape

export const winChanceLine = ({ visits, strengths, legsToWin, startingScore = 501, finalLegs, checkouts }) => {
  if (!Array.isArray(visits) || visits.length === 0 || visits[0][0] !== 1) return null;
  if (!(strengths[0] > 0) || !(strengths[1] > 0)) return null;
  const chance = (legs, remaining, thrower) => liveMatchChance({ strengths, legsToWin, legs, remaining, thrower, startingScore, checkouts, sims: LINE_SIMS });

  const legs = [0, 0];
  let remaining = [startingScore, startingScore];
  let leg = 1;
  const points = [{ p: chance(legs, remaining, visits[0][1]), leg: 1, player: null, score: null }];
  for (let i = 0; i < visits.length; i++) {
    const [visitLeg, player, score] = visits[i];
    if (visitLeg !== leg) return null; // a leg ended without a checkout in the log
    remaining = [...remaining];
    remaining[player] -= score;
    if (remaining[player] < 0) return null;
    if (remaining[player] === 0) {
      legs[player]++;
      leg++;
      remaining = [startingScore, startingScore];
    }
    const done = legs[0] >= legsToWin || legs[1] >= legsToWin;
    const next = visits[i + 1]?.[1] ?? 1 - player;
    points.push({ p: done ? (legs[0] >= legsToWin ? 1 : 0) : chance([...legs], remaining, next), leg: visitLeg, player, score });
  }
  if (legs[0] !== finalLegs[0] || legs[1] !== finalLegs[1]) return null;

  // Turning point: the visit that moved the chance most toward the winner.
  const winner = legs[0] > legs[1] ? 0 : 1;
  let turn = null;
  for (let i = 1; i < points.length; i++) {
    const swing = (points[i].p - points[i - 1].p) * (winner === 0 ? 1 : -1);
    if (swing > 0 && (!turn || swing > turn.swing)) turn = { index: i, swing };
  }
  return { points, turningPoint: turn };
};

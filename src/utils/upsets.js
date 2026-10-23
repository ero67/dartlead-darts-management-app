// The completed match whose winner had the lowest chance beforehand, below
// `maxChance`, or null. `strengths` should be as they were before the
// tournament (usePlayerStrengths with `before`), so the day's own results do
// not explain away the surprise.
import { matchWinProbability } from '../lib/winProbability.js';

export const biggestUpset = (matches, strengths, maxChance = 0.4) => {
  let best = null;
  for (const m of matches) {
    const r = m.result;
    if (m.status !== 'completed' || !r?.winner || !m.player1?.id || !m.player2?.id) continue;
    const legs = [Number(r.player1Legs) || 0, Number(r.player2Legs) || 0];
    const p1 = matchWinProbability(strengths[m.player1.id], strengths[m.player2.id], { legsToWin: m.legsToWin || Math.max(...legs) });
    if (p1 === null) continue;
    const isP1 = r.winner === m.player1.id;
    const chance = isP1 ? p1 : 1 - p1;
    if (chance < maxChance && (!best || chance < best.chance)) {
      best = {
        match: m,
        chance,
        winner: isP1 ? m.player1 : m.player2,
        loser: isP1 ? m.player2 : m.player1,
        score: isP1 ? `${legs[0]}:${legs[1]}` : `${legs[1]}:${legs[0]}`
      };
    }
  }
  return best;
};

// Moment the tournament started being played: just before its first result.
export const firstResultAt = (matches) => {
  const times = matches.map((m) => Date.parse(m.completedAt || '')).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
};

// "23%", and "<1%" rather than a misleading "0%".
export const formatChance = (p) => (p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

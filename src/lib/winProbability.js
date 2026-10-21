// Win chances from 3-dart averages. A leg is a logistic on the average
// difference; a match is "first to N legs" on top of that, so it also works
// mid-match (pass the legs already won). Returns null without two averages.

// Points of average per logit. Fitted 2026-10-21 together with the strength
// settings below by scripts/calibrate-win-probability.mjs on 1,597 matches,
// predicting each from earlier matches only: held-out leg log loss 0.622 vs
// 0.654 for this-tournament averages. Refit when there is a lot more data.
export const AVG_SCALE = 6;

export const legWinProbability = (avgA, avgB, scale = AVG_SCALE) => 1 / (1 + Math.exp(-(avgA - avgB) / scale));

export const matchWinProbability = (avgA, avgB, { legsToWin = 3, legsA = 0, legsB = 0, scale = AVG_SCALE } = {}) => {
  if (!(avgA > 0) || !(avgB > 0)) return null;
  return chanceToWinFirst(legWinProbability(avgA, avgB, scale), legsToWin - legsA, legsToWin - legsB);
};

// Chance A wins needA legs before B wins needB, each leg won with chance p.
export const chanceToWinFirst = (p, needA, needB) => {
  if (needA <= 0) return 1;
  if (needB <= 0) return 0;
  // A wins exactly needA legs before B wins needB: negative binomial tail.
  let total = 0;
  let combos = 1; // C(needA - 1 + k, k)
  for (let k = 0; k < needB; k++) {
    if (k > 0) combos = (combos * (needA - 1 + k)) / k;
    total += combos * p ** needA * (1 - p) ** k;
  }
  return total;
};

// A player's strength as a 3-dart average from their match history (newest
// first, each { score, darts }). Recent matches weigh more (a match HALF_LIFE
// matches back counts half), and PRIOR_DARTS darts thrown at the field
// average are mixed in, so two strong matches do not make a 70 player.
// Fitted together with AVG_SCALE by scripts/calibrate-win-probability.mjs.
export const HALF_LIFE = 10;
export const PRIOR_DARTS = 240;
export const FIELD_AVERAGE = 41;
// Matches back that still matter: at HALF_LIFE 10, the 60th weighs 1.6%.
export const HISTORY_MATCHES = 60;

export const playerStrength = (history, { halfLife = HALF_LIFE, priorDarts = PRIOR_DARTS, fieldAverage = FIELD_AVERAGE } = {}) => {
  let score = (priorDarts * fieldAverage) / 3;
  let darts = priorDarts;
  history.forEach((m, i) => {
    const w = Number.isFinite(halfLife) ? 0.5 ** (i / halfLife) : 1;
    score += w * m.score;
    darts += w * m.darts;
  });
  return darts > 0 ? (score / darts) * 3 : null;
};

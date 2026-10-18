// Win chances from 3-dart averages. A leg is a logistic on the average
// difference; a match is "first to N legs" on top of that, so it also works
// mid-match (pass the legs already won). Returns null without two averages.

// ponytail: single fitted constant (points of average per logit); refit with
// scripts/calibrate-win-probability.mjs when there is a lot more match data.
export const AVG_SCALE = 8; // fitted 2026-10-18 on 1,492 matches

export const legWinProbability = (avgA, avgB) => 1 / (1 + Math.exp(-(avgA - avgB) / AVG_SCALE));

export const matchWinProbability = (avgA, avgB, { legsToWin = 3, legsA = 0, legsB = 0 } = {}) => {
  if (!(avgA > 0) || !(avgB > 0)) return null;
  const needA = legsToWin - legsA;
  const needB = legsToWin - legsB;
  if (needA <= 0) return 1;
  if (needB <= 0) return 0;
  const p = legWinProbability(avgA, avgB);
  // A wins exactly needA legs before B wins needB: negative binomial tail.
  let total = 0;
  let combos = 1; // C(needA - 1 + k, k)
  for (let k = 0; k < needB; k++) {
    if (k > 0) combos = (combos * (needA - 1 + k)) / k;
    total += combos * p ** needA * (1 - p) ** k;
  }
  return total;
};

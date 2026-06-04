// Utilities for validating darts statistics and filtering out impossible
// (data-entry / corruption) values before they reach leaderboards and records.

const DEFAULT_STARTING_SCORE = 501;

/**
 * The minimum number of darts physically required to win a leg from a given
 * starting score. A double-out finish lets a player score at most 180 in the
 * first turns and must finish on a double, so the theoretical minimum is:
 *
 *   ceil((startingScore - 50) / 60) + 1
 *
 * Examples: 501 -> 9, 301 -> 6, 701 -> 12.
 *
 * @param {number} [startingScore=501]
 * @returns {number} minimum valid dart count for a winning leg
 */
export const minDartsForLeg = (startingScore = DEFAULT_STARTING_SCORE) => {
  const score = Number(startingScore) || DEFAULT_STARTING_SCORE;
  return Math.ceil((score - 50) / 60) + 1;
};

/**
 * Whether a recorded dart count for a WON leg is physically possible.
 * Anything below the theoretical minimum (e.g. a "1-dart leg") is treated as
 * corrupt data and excluded from statistics.
 *
 * @param {number} darts - darts used to win the leg
 * @param {number} [startingScore=501]
 * @returns {boolean}
 */
export const isValidLegDartCount = (darts, startingScore = DEFAULT_STARTING_SCORE) => {
  const count = Number(darts);
  if (!Number.isFinite(count) || count <= 0) return false;
  return count >= minDartsForLeg(startingScore);
};

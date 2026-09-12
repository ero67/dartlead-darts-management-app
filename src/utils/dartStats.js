// Utilities for darts statistics: validating leg dart counts, and the
// per-visit scoring stats (high-score bands, checkout percentage) shown on the
// match and tournament statistics screens.

import { isFinishable, isOneDartOut, isBustScore } from '../lib/x01Engine.js';

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

/* ---------------------------------------------------------------------------
   Scoring statistics computed from a match result.
   --------------------------------------------------------------------------- */

/**
 * High-score bands counted per visit. Cumulative: a 180 also counts towards
 * 170+, 133+, 95+ and 80+, so the counts read "how many visits of at least
 * this much".
 */
export const HIGH_SCORE_BANDS = [80, 95, 133, 170, 180];

/**
 * Count each band in a list of visit scores (busts excluded by the caller).
 *
 * @param {number[]} visitScores - score of every non-bust visit, in order
 * @returns {Object} band threshold -> count, e.g. { 80: 12, 95: 9, ... }
 */
export const countHighScores = (visitScores) => {
  const counts = Object.fromEntries(HIGH_SCORE_BANDS.map(band => [band, 0]));
  if (!Array.isArray(visitScores)) return counts;
  for (const raw of visitScores) {
    const score = Number(raw);
    if (!Number.isFinite(score)) continue;
    for (const band of HIGH_SCORE_BANDS) {
      if (score >= band) counts[band] += 1;
    }
  }
  return counts;
};

/** Add the second band map into the first (used to total a tournament). */
export const addHighScores = (into, more) => {
  for (const band of HIGH_SCORE_BANDS) into[band] = (into[band] || 0) + (more?.[band] || 0);
  return into;
};

/**
 * Checkout attempts in ONE visit — the denominator of the checkout percentage.
 *
 * Dart by dart we can count it the way the PDC does: every dart thrown while
 * the remaining score can be finished with that single dart is a dart at a
 * double. The visit ends on a checkout or a bust, so darts after that don't
 * count.
 *
 * A 3-dart total says nothing about the individual darts, so a visit that
 * started on a finishable score (2–170, not a bogey number) counts as one
 * attempt — the definition scoring apps without dart-by-dart input use.
 *
 * @param {number} turnStartScore - the player's score before the visit
 * @param {Array} darts - the visit's dart entries ({ value, isTurnTotal? })
 * @returns {number}
 */
export const visitCheckoutAttempts = (turnStartScore, darts) => {
  const start = Number(turnStartScore);
  if (!Number.isFinite(start)) return 0;
  if (!Array.isArray(darts) || darts.length === 0) return 0;

  if (darts.length === 1 && darts[0]?.isTurnTotal) {
    return isFinishable(start) ? 1 : 0;
  }

  let remaining = start;
  let attempts = 0;
  for (const dart of darts) {
    if (isOneDartOut(remaining)) attempts += 1;
    remaining -= Number(dart?.value) || 0;
    if (remaining === 0 || isBustScore(remaining)) break;
  }
  return attempts;
};

/**
 * Checkout percentage from the stored match stats: legs won (every leg won is
 * one converted finish) over the attempts counted above.
 *
 * @returns {{ percent: number|null, hits: number, attempts: number }}
 */
export const checkoutRate = (playerStats) => {
  const attempts = Number(playerStats?.doubleAttempts);
  const hits = (playerStats?.checkouts || []).length;
  if (!Number.isFinite(attempts) || attempts <= 0) return { percent: null, hits, attempts: 0 };
  return { percent: (hits / attempts) * 100, hits, attempts };
};

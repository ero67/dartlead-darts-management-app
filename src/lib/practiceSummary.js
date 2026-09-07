// Personal bests and totals across finished practice sessions. Runs on the
// merged local + cloud history in the client, so anonymous and signed-in
// players get the same numbers from the same code.

const MIN_X01_DARTS = 9;          // a "best average" from three darts is noise
const MIN_CHECKOUT_ATTEMPTS = 10; // same for hit rates
const DAY_MS = 24 * 60 * 60 * 1000;

const better = (current, candidate, pick) =>
  candidate === null || candidate === undefined ? current : (current === null ? candidate : pick(current, candidate));
const max = (a, b) => Math.max(a, b);
const min = (a, b) => Math.min(a, b);

export const computePracticeSummary = (entries, now = Date.now()) => {
  const summary = {
    sessions: 0,
    totalDarts: 0,
    last30Days: 0,
    x01: { sessions: 0, bestAverage: null, bestFirstNine: null, oneEighties: 0, highestCheckout: null, bestCheckoutPercent: null, bestLegDarts: null },
    checkout: { sessions: 0, bestHitPercent: null, bestStreak: null, totalHits: 0 },
    oneTwentyOne: { sessions: 0, highestSuccess: null, bestStreak: null },
    aroundTheClock: { sessions: 0, fewestDarts: null, fastestSeconds: null }
  };
  for (const entry of entries || []) {
    const s = entry.stats || {};
    summary.sessions += 1;
    summary.totalDarts += s.totalDarts || 0;
    if (entry.finishedAt && now - entry.finishedAt <= 30 * DAY_MS) summary.last30Days += 1;
    switch (entry.game) {
      case 'x01': {
        const g = summary.x01;
        g.sessions += 1;
        if ((s.totalDarts || 0) >= MIN_X01_DARTS) {
          g.bestAverage = better(g.bestAverage, s.average, max);
          g.bestFirstNine = better(g.bestFirstNine, s.firstNineAverage, max);
        }
        g.oneEighties += s.oneEighties || 0;
        if (s.highestCheckout) g.highestCheckout = better(g.highestCheckout, s.highestCheckout, max);
        if ((s.checkoutAttempts || 0) >= 5) g.bestCheckoutPercent = better(g.bestCheckoutPercent, s.checkoutPercent, max);
        if (s.bestLegDarts) g.bestLegDarts = better(g.bestLegDarts, s.bestLegDarts, min);
        break;
      }
      case 'checkout': {
        const g = summary.checkout;
        g.sessions += 1;
        if ((s.attempts || 0) >= MIN_CHECKOUT_ATTEMPTS) g.bestHitPercent = better(g.bestHitPercent, s.hitPercent, max);
        g.bestStreak = better(g.bestStreak, s.bestStreak, max);
        g.totalHits += s.hits || 0;
        break;
      }
      case 'oneTwentyOne': {
        const g = summary.oneTwentyOne;
        g.sessions += 1;
        g.highestSuccess = better(g.highestSuccess, s.highestSuccess, max);
        g.bestStreak = better(g.bestStreak, s.bestStreak, max);
        break;
      }
      case 'aroundTheClock': {
        const g = summary.aroundTheClock;
        g.sessions += 1;
        if (s.targetsCompleted && s.targetsCompleted === s.targetsTotal) {
          g.fewestDarts = better(g.fewestDarts, s.totalDarts, min);
          g.fastestSeconds = better(g.fastestSeconds, s.seconds, min);
        }
        break;
      }
      default:
        break;
    }
  }
  return summary;
};

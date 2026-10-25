// Crash-recovery snapshot vs. the matches row, shared by the X01 and Cricket
// scorers. No React, so scripts/check-live-snapshot.mjs can exercise it.

// The snapshot remembers the row's updated_at (server clock, bumped by a
// trigger on every write) as of this device's last read or write. A newer row
// means another device scored on, or a manager reset the match: the local
// state is stale and must not be restored or written back.
export const isLocalSnapshotStale = (snapshot, row) => {
  if (!snapshot || !row?.updated_at) return false;
  // shortcut: snapshots saved before this field existed keep winning, drop once old ones are gone
  if (!snapshot.serverUpdatedAt) return false;
  return Date.parse(row.updated_at) > Date.parse(snapshot.serverUpdatedAt);
};

// Record the row's updated_at in an existing snapshot (never recreate one a
// completed match already removed).
export const rememberServerStamp = (storageKey, updatedAt) => {
  if (!updatedAt) return;
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    localStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(stored), serverUpdatedAt: updatedAt }));
  } catch (error) {
    console.error('Error saving match snapshot stamp:', error);
  }
};

const num = (v) => (Number.isFinite(v) ? v : 0);
const list = (v) => (Array.isArray(v) ? v : []);

// X01 resume from the row on another device. live_state carries the running
// totals (darts, 180s, visits, finished legs) so the finishing leg and the
// match average keep the darts thrown before the swap; the columns stay
// authoritative for legs and remaining score. Rows without live_state (older
// apps) resume with zero totals, as before.
export const x01StateFromRow = (row, startingScore) => {
  // An older app scoring on writes the columns but not live_state: totals from
  // another point of the match would be applied to this leg, so drop them.
  const isCurrent = [1, 2].every((i) => {
    const p = row.live_state?.legScores?.[`player${i}`];
    return p && p.legs === (row[`player${i}_legs`] || 0) && p.currentScore === row[`player${i}_current_score`];
  });
  const live = isCurrent ? row.live_state : {};
  const player = (i) => {
    const p = live.legScores?.[`player${i}`] || {};
    const score = row[`player${i}_current_score`];
    return {
      legs: row[`player${i}_legs`] || 0,
      currentScore: score !== null && score !== undefined ? score : startingScore,
      totalScore: num(p.totalScore),
      totalDarts: num(p.totalDarts),
      legDarts: num(p.legDarts),
      oneEighties: num(p.oneEighties),
      visitScores: list(p.visitScores),
      doubleAttempts: num(p.doubleAttempts),
      legAverages: list(p.legAverages),
      checkouts: list(p.checkouts),
      legDetails: list(p.legDetails)
    };
  };
  return { legScores: { player1: player(1), player2: player(2) }, visitLog: list(live.visitLog) };
};

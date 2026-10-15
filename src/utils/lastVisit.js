// Live match rows carry only the current scores, and the scorer syncs them once
// per completed turn (see MatchInterface). So what a player just threw is the
// drop of the on-throw player's score between two snapshots of the same row.
//
// snapshot(row) → { leg, player, scores: [p1, p2], legs: [p1, p2] }
// diffVisit(prev, next) → { player, kind: 'score' | 'bust' | 'leg', value } | null
//   score: a normal visit of `value` points
//   bust:  the turn passed and the score did not move
//   leg:   the on-throw player won the leg; `value` is the checkout
export const snapshotLiveRow = (row) => ({
  leg: row.current_leg ?? null,
  player: row.current_player ?? null,
  scores: [row.player1_current_score ?? null, row.player2_current_score ?? null],
  legs: [row.player1_legs ?? 0, row.player2_legs ?? 0]
});

export function diffVisit(prev, next) {
  if (!prev || prev.player !== 0 && prev.player !== 1) return null;
  const thrower = prev.player;
  if (next.legs[thrower] > prev.legs[thrower]) {
    return { player: thrower, kind: 'leg', value: prev.scores[thrower] };
  }
  if (next.leg !== prev.leg) return null; // new-leg reset, not a visit
  const before = prev.scores[thrower];
  const after = next.scores[thrower];
  if (before === null || after === null) return null;
  const drop = before - after;
  // > 180 cannot be one visit: a stale watcher catching up on several turns.
  if (drop > 0 && drop <= 180) return { player: thrower, kind: 'score', value: drop };
  if (drop === 0 && next.player !== thrower) return { player: thrower, kind: 'bust' };
  return null; // undo (score went up) or no change
}

// ponytail: self-check, run with `node src/utils/lastVisit.js`
if (globalThis.process?.argv?.[1]?.endsWith('lastVisit.js')) {
  const row = (o) => snapshotLiveRow({ current_leg: 1, current_player: 0, player1_current_score: 301, player2_current_score: 220, player1_legs: 0, player2_legs: 1, ...o });
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  console.assert(eq(diffVisit(row(), row({ player1_current_score: 241, current_player: 1 })), { player: 0, kind: 'score', value: 60 }), 'visit');
  console.assert(eq(diffVisit(row(), row({ current_player: 1 })), { player: 0, kind: 'bust' }), 'bust');
  console.assert(eq(diffVisit(row(), row({ player1_legs: 1, current_leg: 2, player1_current_score: 501, player2_current_score: 501 })), { player: 0, kind: 'leg', value: 301 }), 'leg');
  console.assert(diffVisit(row(), row({ current_leg: 2, player1_current_score: 501, player2_current_score: 501 })) === null, 'new leg reset');
  console.assert(diffVisit(row(), row({ player1_current_score: 361 })) === null, 'undo');
  console.assert(diffVisit(row(), row({ player1_current_score: 20, current_player: 1 })) === null, 'stale catch-up');
  console.assert(diffVisit(row(), row()) === null, 'no change');
  console.assert(diffVisit(null, row()) === null, 'first sight');
  console.log('lastVisit self-check passed');
}

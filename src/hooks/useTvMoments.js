import { useCallback, useEffect, useRef, useState } from 'react';
import { diffVisit, snapshotLiveRow } from '../utils/lastVisit';
import { boardNumberOf } from '../utils/tvStage';

const SHOW_MS = 4500;
const MAX_QUEUED = 6;

// Peak moments for the TV, shown one at a time for a few seconds:
//   180       a maximum on any board
//   checkout  a leg finished with 100 or more
//   match     a live match completed (it left the live list and the
//             tournament now has it completed with a winner)
// `completedById` maps match id -> completed match ({ player1, player2, result }).
// Returns the moment to show now, or null.
export function useTvMoments(liveMatches, completedById) {
  const prevRef = useRef(null);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map((liveMatches || []).map((row) => [row.id, { snap: snapshotLiveRow(row), row }]));
    prevRef.current = next;
    if (!prev) return; // first load: nothing just happened

    const found = [];
    for (const [id, { snap, row }] of next) {
      const visit = diffVisit(prev.get(id)?.snap, snap);
      if (!visit) continue;
      const player = visit.player === 0 ? row.player1 : row.player2;
      const board = boardNumberOf(row);
      if (visit.kind === 'score' && visit.value === 180) found.push({ kind: '180', value: 180, player, board });
      else if (visit.kind === 'leg' && visit.value >= 100) found.push({ kind: 'checkout', value: visit.value, player, board });
    }
    for (const [id, { row }] of prev) {
      if (next.has(id)) continue;
      const match = completedById.get(id);
      const winnerId = match?.result?.winner;
      if (!winnerId) continue;
      const isP1 = match.player1?.id === winnerId;
      const legs = [match.result.player1Legs ?? row.player1_legs ?? 0, match.result.player2Legs ?? row.player2_legs ?? 0];
      found.push({
        kind: 'match',
        player: isP1 ? match.player1 : match.player2,
        opponent: isP1 ? match.player2 : match.player1,
        score: isP1 ? `${legs[0]}:${legs[1]}` : `${legs[1]}:${legs[0]}`,
        board: boardNumberOf(row)
      });
    }
    if (found.length === 0) return;
    const stamp = Date.now();
    setQueue((q) => [...q, ...found.map((m, i) => ({ ...m, key: `${stamp}-${i}` }))].slice(-MAX_QUEUED));
  }, [liveMatches, completedById]);

  const current = queue[0] || null;
  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [current]);

  // `?preview=moments`: lets an organiser (or a reviewer) see the takeovers
  // without a live 180; pushes a sample every few seconds.
  const push = useCallback((moment) => setQueue((q) => [...q, { ...moment, key: `${Date.now()}` }].slice(-MAX_QUEUED)), []);
  return { current, push };
}

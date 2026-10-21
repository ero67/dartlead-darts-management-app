import { useEffect, useMemo, useState } from 'react';
import { matchService } from '../services/tournamentService';
import { HISTORY_MATCHES, playerStrength } from '../lib/winProbability';

// Recent completed matches per player id ({ score, darts, at, won,
// opponentId }, newest first), from matches anywhere. Players with none get
// no entry. Refetches when the set of ids or `refreshKey` changes (e.g. a
// match completed); `before` (a timestamp) gives them as they were then.
export function usePlayerHistories(playerIds, refreshKey = 0, before = null) {
  const [histories, setHistories] = useState({});
  const key = [...new Set(playerIds.filter(Boolean))].sort().join(',');

  useEffect(() => {
    if (!key) return undefined;
    let isCurrent = true;
    matchService.getRecentMatchTotals(key.split(','), HISTORY_MATCHES, { before })
      .then((totals) => {
        if (!isCurrent) return;
        const next = {};
        totals.forEach((history, id) => { if (history.length) next[id] = history; });
        setHistories(next);
      })
      .catch((err) => console.error('Loading player histories failed:', err));
    return () => { isCurrent = false; };
  }, [key, refreshKey, before]);

  return histories;
}

export const strengthsOf = (histories) => Object.fromEntries(Object.entries(histories).map(([id, h]) => [id, playerStrength(h)]));

// Win-chance strength (3-dart average, recency weighted, pulled toward the
// field) per player id; players with no completed match get no entry, so no
// chance is shown for them.
export function usePlayerStrengths(playerIds, refreshKey = 0, before = null) {
  const histories = usePlayerHistories(playerIds, refreshKey, before);
  return useMemo(() => strengthsOf(histories), [histories]);
}

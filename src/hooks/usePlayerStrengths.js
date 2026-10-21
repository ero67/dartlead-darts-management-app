import { useEffect, useState } from 'react';
import { matchService } from '../services/tournamentService';
import { HISTORY_MATCHES, playerStrength } from '../lib/winProbability';

// Win-chance strength (3-dart average, recency weighted, pulled toward the
// field) per player id, from their completed matches anywhere. Players with
// no completed match get no entry, so no chance is shown for them. Refetches
// when the set of ids or `refreshKey` changes (e.g. a match completed).
export function usePlayerStrengths(playerIds, refreshKey = 0) {
  const [strengths, setStrengths] = useState({});
  const key = [...new Set(playerIds.filter(Boolean))].sort().join(',');

  useEffect(() => {
    if (!key) return undefined;
    let isCurrent = true;
    matchService.getRecentMatchTotals(key.split(','), HISTORY_MATCHES)
      .then((totals) => {
        if (!isCurrent) return;
        const next = {};
        totals.forEach((history, id) => { if (history.length) next[id] = playerStrength(history); });
        setStrengths(next);
      })
      .catch((err) => console.error('Loading player strengths failed:', err));
    return () => { isCurrent = false; };
  }, [key, refreshKey]);

  return strengths;
}

import { useEffect, useState } from 'react';
import { matchService } from '../services/tournamentService';
import { HISTORY_MATCHES, strengthHistory } from '../lib/winProbability';

const TREND_MATCHES = 30;
const CHANGE_OVER = 10;
const MIN_MATCHES = 3;

// The player's form rating: the strength the win chances use (recent 3-dart
// average, newer matches weigh more, settled toward the field while there are
// few matches), its change over the last 10 matches and a trend line. X01 only
// (getRecentMatchTotals skips Cricket).
// Returns { status: 'loading' | 'none' | 'ready', ... } so the profile hero can
// place the number and the trend line itself.
export function useFormRating(playerId) {
  // Keyed by player, so switching profiles never shows the previous player's form
  const [loaded, setLoaded] = useState({ playerId: null, points: null });

  useEffect(() => {
    if (!playerId) return undefined;
    let isCurrent = true;
    // Enough history for the oldest trend point to be rated on a full window.
    matchService.getRecentMatchTotals([playerId], HISTORY_MATCHES + TREND_MATCHES)
      .then((totals) => { if (isCurrent) setLoaded({ playerId, points: strengthHistory(totals.get(playerId) || [], TREND_MATCHES) }); })
      .catch((err) => { console.error('Loading form rating failed:', err); if (isCurrent) setLoaded({ playerId, points: [] }); });
    return () => { isCurrent = false; };
  }, [playerId]);

  if (loaded.playerId !== playerId) return { status: 'loading' };
  const { points } = loaded;
  if (points.length < MIN_MATCHES) return { status: 'none' };

  const now = points.at(-1).strength;
  const then = points[Math.max(0, points.length - 1 - CHANGE_OVER)].strength;
  const values = points.map((p) => p.strength);
  return {
    status: 'ready',
    points,
    now,
    delta: now - then,
    count: Math.min(CHANGE_OVER, points.length - 1),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

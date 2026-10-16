import { useEffect, useRef, useState } from 'react';
import { diffVisit, snapshotLiveRow } from '../utils/lastVisit';

const SHOW_MS = 4000;

// What each live match's on-throw player just scored, for a few seconds after
// the row changed. Keyed by match id: { player: 0|1, kind, value }. Works for
// any array of live match rows, whether patched by realtime or re-fetched.
export function useLastVisits(matches) {
  const prevRef = useRef(new Map());
  const [visits, setVisits] = useState({});

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map();
    const found = [];
    for (const row of matches || []) {
      const snap = snapshotLiveRow(row);
      next.set(row.id, snap);
      const visit = diffVisit(prev.get(row.id), snap);
      if (visit) found.push([row.id, { ...visit, at: Date.now() }]);
    }
    prevRef.current = next;
    if (found.length === 0) return;
    setVisits((v) => ({ ...v, ...Object.fromEntries(found) }));
    // Each bubble clears itself; a newer one for the same match wins.
    found.forEach(([id, visit]) => {
      setTimeout(() => setVisits((v) => {
        if (v[id] !== visit) return v;
        const { [id]: _gone, ...rest } = v;
        return rest;
      }), SHOW_MS);
    });
  }, [matches]);

  return visits;
}

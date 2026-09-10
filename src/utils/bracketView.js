// Read-only helpers for showing a playoff bracket.
//
// The bracket lives twice: as the tournaments.playoffs JSONB (the structure,
// written when a match completes) and as rows in `matches` (authoritative
// status and players). Displays that mixed the two could show a player in the
// next round while the match that decides that slot was still being played
// (stale JSONB after a reset/correction, or an optimistic local copy). These
// helpers merge both and only ever show a player in round n+1 once the
// feeding match in round n has actually completed.

const isThird = (m) => !!m?.isThirdPlaceMatch;

// Merge DB rows into the bracket entries and clear next-round slots whose
// feeder match is not completed. Returns new round/match objects; the input
// is not mutated.
export function mergeBracketRounds(rounds, playoffMatches = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) return [];
  const rowById = new Map((playoffMatches || []).map((m) => [m.id, m]));

  const merged = rounds.map((round) => ({
    ...round,
    matches: (round.matches || []).map((m) => {
      const row = rowById.get(m.id);
      if (!row) return { ...m };
      return {
        ...m,
        player1: row.player1 || m.player1 || null,
        player2: row.player2 || m.player2 || null,
        status: row.status || m.status || 'pending',
        result: row.result || m.result || null
      };
    })
  }));

  const done = (m) => !!m && m.status === 'completed';

  for (let r = 1; r < merged.length; r++) {
    const feeders = merged[r - 1].matches.filter((m) => !isThird(m));
    const mains = merged[r].matches.filter((m) => !isThird(m));

    mains.forEach((m, i) => {
      // A match that already started or finished keeps its players: at that
      // point the row is the truth even if a feeder was reopened afterwards.
      if (m.status === 'in_progress' || m.status === 'completed') return;
      const f1 = feeders[i * 2];
      const f2 = feeders[i * 2 + 1];
      if (f1 && !done(f1)) m.player1 = null;
      if (f2 && !done(f2)) m.player2 = null;
    });

    // Third-place match: fed by the losers of the two semifinals (the
    // non-third matches of the round it sits in).
    merged[r].matches.filter(isThird).forEach((m) => {
      if (m.status === 'in_progress' || m.status === 'completed') return;
      const semis = merged[r].matches.filter((x) => !isThird(x));
      if (semis.length >= 2) {
        if (!done(semis[0])) m.player1 = null;
        if (!done(semis[1])) m.player2 = null;
      } else if (!feeders.every(done)) {
        m.player1 = null;
        m.player2 = null;
      }
    });
  }

  return merged;
}

// The playoff matches that can be played next: pending with both players
// known, in bracket order. After mergeBracketRounds a next-round match only
// has both players once both feeders completed, so no round filter is needed
// (a semifinal may legitimately start while the last quarterfinal is on).
export function upcomingPlayoffMatches(mergedRounds) {
  const items = [];
  for (const round of mergedRounds || []) {
    for (const m of round.matches || []) {
      if (m.status === 'pending' && m.player1 && m.player2) items.push({ ...m, roundName: round.name });
    }
  }
  return items;
}

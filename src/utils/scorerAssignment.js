// Suggested-scorer assignment ("Automatic scorer assignment" setting).
//
// Assignments are computed deterministically from match data — nothing is
// stored, and every device derives the same names from the same tournament
// state. Both functions return a Map of matchId -> player.

// Play order of a group's matches: match_order from the DB, then insert
// order, then id. Mirrors sortByPlayOrder in tournamentService so the hint
// follows the order the matches are listed (and played) in.
const byPlayOrder = (a, b) => {
  const ao = a.matchOrder ?? Number.MAX_SAFE_INTEGER;
  const bo = b.matchOrder ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const at = a.createdAt ? Date.parse(a.createdAt) : 0;
  const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
  if (at !== bt) return at - bt;
  return String(a.id).localeCompare(String(b.id));
};

const playsIn = (match, playerId) =>
  !!match && (match.player1?.id === playerId || match.player2?.id === playerId);

// Group stage: each match gets a scorer from the same group who isn't playing
// in it. Matches are walked in play order; a player who is in the match just
// before (still finishing) or just after (about to start) is avoided, then the
// duty rotates to whoever has scored the least so far.
export const assignGroupScorers = (groups) => {
  const byMatch = new Map();
  for (const group of groups || []) {
    const players = group.players || [];
    const matches = [...(group.matches || [])].sort(byPlayOrder);
    const counts = new Map();
    matches.forEach((match, index) => {
      const candidates = players.filter(
        (p) => p.id !== match.player1?.id && p.id !== match.player2?.id
      );
      if (candidates.length === 0) return; // 2-player group: nobody free
      const prev = matches[index - 1];
      const next = matches[index + 1];
      const busy = (p) => (playsIn(prev, p.id) ? 1 : 0) + (playsIn(next, p.id) ? 1 : 0);
      candidates.sort(
        (a, b) =>
          busy(a) - busy(b) ||
          (counts.get(a.id) || 0) - (counts.get(b.id) || 0) ||
          String(a.id).localeCompare(String(b.id))
      );
      const scorer = candidates[0];
      counts.set(scorer.id, (counts.get(scorer.id) || 0) + 1);
      byMatch.set(match.id, scorer);
    });
  }
  return byMatch;
};

const loserOf = (match) => {
  const winnerId = match?.result?.winner;
  if (!winnerId || !match.player1 || !match.player2 || match.result?.isBye) return null;
  if (winnerId === match.player1.id) return match.player2;
  if (winnerId === match.player2.id) return match.player1;
  return null;
};

// Playoffs: the scorer is a player knocked out in the previous round — they
// just played, so they are still at the venue (group-stage non-qualifiers may
// already have left). The first playoff round gets no suggestion. The
// third-place match is played BY the semifinal losers, so it gets a
// quarterfinal loser instead, and the final prefers the third-place loser
// (that match finishes right before it).
export const assignPlayoffScorers = (playoffs) => {
  const byMatch = new Map();
  const rounds = playoffs?.rounds || [];

  rounds.forEach((round, roundIndex) => {
    if (roundIndex === 0) return;
    const matches = round.matches || [];
    const prevBracket = (rounds[roundIndex - 1].matches || []).filter((m) => !m.isThirdPlaceMatch);
    const bracket = matches.filter((m) => !m.isThirdPlaceMatch);
    const thirdPlace = matches.find((m) => m.isThirdPlaceMatch);
    const isFinalRound = roundIndex === rounds.length - 1 && bracket.length === 1;

    bracket.forEach((match, matchIndex) => {
      // The final: prefer the loser of the third-place match if it's decided.
      if (isFinalRound && thirdPlace) {
        const thirdLoser = loserOf(thirdPlace);
        if (thirdLoser) {
          byMatch.set(match.id, thirdLoser);
          return;
        }
      }
      const feeders = [prevBracket[matchIndex * 2], prevBracket[matchIndex * 2 + 1]].filter(Boolean);
      const losers = feeders.map(loserOf).filter(Boolean);
      if (losers.length > 0) byMatch.set(match.id, losers[0]);
    });

    if (thirdPlace) {
      // Two rounds back = quarterfinal losers (free during the third-place match).
      const twoBack = roundIndex >= 2
        ? (rounds[roundIndex - 2].matches || []).filter((m) => !m.isThirdPlaceMatch)
        : [];
      const loser = twoBack.map(loserOf).find(Boolean);
      if (loser) byMatch.set(thirdPlace.id, loser);
    }
  });

  return byMatch;
};

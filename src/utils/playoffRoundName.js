// Playoff round names come from the round's size, in the viewer's language.
// The bracket stores a name too, but in whatever language its creator used,
// so displays call these instead of showing round.name.

// Standard names by number of matches; odd counts map to the nearest round.
export function playoffRoundName(numMatches, t) {
  if (numMatches <= 1) return t('management.final');
  if (numMatches === 2) return t('management.semiFinals');
  if (numMatches <= 4) return t('management.quarterFinals');
  if (numMatches <= 8) return t('management.top16');
  return t('management.roundOf', { count: numMatches * 2 });
}

// The 3rd-place match sits in the final's round but is not a bracket match.
export const roundLabel = (round, t) =>
  playoffRoundName((round?.matches || []).filter((m) => !m.isThirdPlaceMatch).length, t);

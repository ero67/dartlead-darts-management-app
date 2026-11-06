// The object the scorer needs to start a match (group card, playoff card and
// board waiting screen all build it here). `legsToWin` is resolved by the
// caller: the row's or the tournament's for groups, the round setting for
// playoffs. Playoff bracket entries carry no tournamentId; startMatch needs
// it to create the row.
export function buildMatchData(match, tournament, legsToWin) {
  return {
    ...match,
    tournamentId: tournament.id,
    groupId: match.groupId,
    gameType: match.gameType || tournament.gameType,
    legsToWin,
    startingScore: match.startingScore || tournament.startingScore,
    defaultScoringMode: tournament.defaultScoringMode,
    isPlayoff: !!match.isPlayoff
  };
}

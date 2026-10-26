// "Duplicate" / "Create next round": pure helpers that turn an existing
// tournament into a prefill for the normal creation form. Nothing here writes
// anywhere; the copy is saved through tournamentService.createTournament.

// A 1–3 digit number that is not part of a year or a date like "5.10.".
const ROUND_NUMBER = /(?<![\d.])(\d{1,3})(?!\d|\.\d)/;

// "3. kolo" -> "4. kolo", "Round 7" -> "Round 8", "Liga 2026 – 3. kolo" ->
// "Liga 2026 – 4. kolo"; a name without a round number gets the copy suffix.
export function nextRoundName(name, copySuffix) {
  const trimmed = (name || '').trim();
  const match = ROUND_NUMBER.exec(trimmed);
  if (!match) return `${trimmed} ${copySuffix}`.trim();
  const next = String(Number(match[1]) + 1).padStart(match[1].length, '0');
  return trimmed.slice(0, match.index) + next + trimmed.slice(match.index + match[1].length);
}

// Creation-form route for copying a tournament. leagueId keeps the league link
// (and lets league co-managers through the /create-tournament guard).
export function cloneTournamentPath(tournamentId, leagueId) {
  const params = new URLSearchParams({ from: tournamentId });
  if (leagueId) params.set('leagueId', leagueId);
  return `/create-tournament?${params}`;
}

// Same shape as a league's defaultTournamentSettings, plus name and players,
// so the form applies both the same way. Fields the source lacks stay
// undefined and the form keeps its own defaults for them.
export function buildClonePrefill(source, copySuffix) {
  const { standingsCriteriaOrder, ...groupSettings } = source.groupSettings || {};
  const criteria = source.standingsCriteriaOrder || standingsCriteriaOrder;
  return {
    name: nextRoundName(source.name, copySuffix),
    tournamentType: source.tournamentType,
    gameType: source.gameType,
    startingScore: source.startingScore,
    legsToWin: source.legsToWin,
    defaultScoringMode: source.defaultScoringMode,
    groupSettings: structuredClone(groupSettings),
    standingsCriteriaOrder: criteria ? [...criteria] : undefined,
    playoffSettings: source.playoffSettings ? structuredClone(source.playoffSettings) : undefined,
    leagueId: source.leagueId || null,
    // Same player ids, so league stats and linked accounts stay on one profile.
    players: (source.players || []).filter(p => p?.id).map(({ id, name }) => ({ id, name })),
    // A round still in registration has an incomplete list: offer it, don't preselect.
    copyPlayers: source.status !== 'open_for_registration',
  };
}

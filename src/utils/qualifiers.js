// Who advances from the group stage, best seed first. Shared by the
// management screen (standings, bracket seeding), the TV wall and the
// standings image so every view marks the same players.
import { sortStandings, DEFAULT_STANDINGS_CRITERIA } from './standings.js';

const ALL_PLAYERS = 9999; // "All" in the players-per-group select

export function getQualifyingPlayers(tournament) {
  if (!tournament) return [];

  // For playoff-only tournaments, all registered players qualify, sorted by name
  if (tournament.tournamentType === 'playoff_only') {
    const players = tournament.players || [];
    return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (!tournament.groups) return [];

  // Head-to-head only counts matches between the tied players, so rows from
  // several groups can share one match list.
  const criteriaOrder = tournament.standingsCriteriaOrder || DEFAULT_STANDINGS_CRITERIA;
  const allGroupMatches = tournament.groups.flatMap(g => g.matches || []);
  const sortByCriteria = (rows) => sortStandings(rows, criteriaOrder, allGroupMatches);
  const qualificationMode = tournament.playoffSettings?.qualificationMode || 'perGroup';
  const allQualifyingPlayers = [];

  if (qualificationMode === 'totalPlayers') {
    // Mode: Total players to advance
    const totalPlayersToAdvance = tournament.playoffSettings?.totalPlayersToAdvance || 8;
    const numberOfGroups = tournament.groups.length;
    const playersPerGroup = Math.floor(totalPlayersToAdvance / numberOfGroups);
    const remainder = totalPlayersToAdvance % numberOfGroups;

    // First, collect players from each group (equal distribution)
    const playersByPosition = {}; // position -> array of players from all groups

    tournament.groups.forEach(group => {
      if (group.standings && group.standings.length > 0) {
        const sortedStandings = sortByCriteria(group.standings);

        // Take playersPerGroup players from this group
        for (let i = 0; i < playersPerGroup && i < sortedStandings.length; i++) {
          const standing = sortedStandings[i];
          allQualifyingPlayers.push({
            ...standing,
            groupPosition: i + 1,
            legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
            groupId: group.id
          });
        }

        // Store remaining players by position for remainder selection
        for (let i = playersPerGroup; i < sortedStandings.length; i++) {
          const standing = sortedStandings[i];
          const position = i + 1;
          if (!playersByPosition[position]) {
            playersByPosition[position] = [];
          }
          playersByPosition[position].push({
            ...standing,
            groupPosition: position,
            legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
            groupId: group.id
          });
        }
      }
    });

    // If there's a remainder, take the best players from the next position
    if (remainder > 0) {
      const nextPosition = playersPerGroup + 1;
      if (playersByPosition[nextPosition]) {
        const candidates = sortByCriteria(playersByPosition[nextPosition]);
        for (let i = 0; i < remainder && i < candidates.length; i++) {
          allQualifyingPlayers.push(candidates[i]);
        }
      }
    }
  } else {
    // Mode: Players per group
    const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;

    tournament.groups.forEach(group => {
      if (group.standings && group.standings.length > 0) {
        const sortedStandings = sortByCriteria(group.standings);
        const topPlayers = playersPerGroup === ALL_PLAYERS
          ? sortedStandings
          : sortedStandings.slice(0, playersPerGroup);
        topPlayers.forEach((standing, index) => {
          allQualifyingPlayers.push({
            ...standing,
            groupPosition: index + 1, // 1st, 2nd, etc. in group
            legDifference: (standing.legsWon || 0) - (standing.legsLost || 0)
          });
        });
      }
    });
  }

  // Sort globally for seeding; group position (1st before 2nd) breaks full ties
  const byGroupPosition = [...allQualifyingPlayers].sort((a, b) => (a.groupPosition || 0) - (b.groupPosition || 0));
  return sortByCriteria(byGroupPosition).map(qp => qp.player);
}

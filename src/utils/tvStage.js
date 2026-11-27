// Which part of the night a tournament is in, for the TV display: the screen
// follows the stage instead of cycling fixed views.
//
//   waiting   registration / drawn, nothing started
//   groups    group stage running
//   playoffs  groups done (or knockout only), final not decided
//   finished  final decided, tournament completed, or groups done without playoffs
//
// `bracketRounds` are the merged rounds from mergeBracketRounds.

const isThird = (m) => !!m?.isThirdPlaceMatch;
const mainsOf = (round) => (round?.matches || []).filter((m) => !isThird(m));
const done = (m) => m?.status === 'completed';

const winnerOf = (m) => {
  const id = m?.result?.winner;
  if (!id) return null;
  if (m.player1?.id === id) return m.player1;
  if (m.player2?.id === id) return m.player2;
  return null;
};
const loserOf = (m) => {
  const winner = winnerOf(m);
  if (!winner) return null;
  return winner === m.player1 ? m.player2 : m.player1;
};

const finalOf = (rounds) => mainsOf(rounds?.at(-1))[0] || null;

export function tvStage(tournament, bracketRounds = []) {
  if (!tournament) return 'waiting';
  const groupMatches = (tournament.groups || []).flatMap((g) => g.matches || []);
  const hasGroupStage = tournament.tournamentType !== 'playoff_only' && groupMatches.length > 0;
  const groupsDone = hasGroupStage && groupMatches.every(done);
  const hasBracket = bracketRounds.some((r) => (r.matches || []).some((m) => m.player1 || m.player2));
  if (tournament.status === 'completed' || done(finalOf(bracketRounds))) return 'finished';
  if (groupsDone && !tournament.playoffSettings?.enabled) return 'finished';
  if (tournament.status !== 'started') return 'waiting';
  if (hasGroupStage && !groupsDone) return 'groups';
  return hasBracket ? 'playoffs' : 'groups';
}

// The round being played: the first one with an undecided match (its name is
// the stage label in the playoffs, e.g. "Semifinal").
export function currentRound(bracketRounds = []) {
  return bracketRounds.find((r) => mainsOf(r).some((m) => !done(m))) || null;
}

// Podium once the final is decided: winner, runner-up and third place (the
// third-place match winner, or both semifinal losers without one). A single
// group without playoffs ranks by its standings. Several groups without
// playoffs have no overall podium: null (the TV lists the group winners).
export function podium(tournament, bracketRounds = []) {
  const final = finalOf(bracketRounds);
  if (done(final)) {
    const third = (bracketRounds.at(-1)?.matches || []).find(isThird);
    const semis = bracketRounds.length > 1 ? mainsOf(bracketRounds.at(-2)) : [];
    const thirds = done(third) ? [winnerOf(third)] : semis.map(loserOf);
    return { first: winnerOf(final), second: loserOf(final), third: thirds.filter(Boolean) };
  }
  const groups = tournament?.groups || [];
  if (groups.length === 1) {
    const rows = groups[0].standings || [];
    return { first: rows[0]?.player || null, second: rows[1]?.player || null, third: rows[2] ? [rows[2].player] : [] };
  }
  return null;
}

// The scenes a stage rotates through, in order. `has` says which have content.
export function scenesFor(stage, has) {
  const list = {
    waiting: ['welcome'],
    groups: [has.live && 'live', has.standings && 'standings', has.stats && 'stats'],
    playoffs: [has.live && 'live', has.bracket ? 'bracket' : has.standings && 'standings', has.stats && 'stats'],
    finished: ['champion', has.bracket ? 'bracket' : has.standings && 'standings', has.stats && 'stats']
  }[stage].filter(Boolean);
  return list.length ? list : ['welcome'];
}

// The board a live match is on: the paired device's board, else the board
// the match was assigned to. Never a bare "Board".
export const boardNumberOf = (m) => m?.live_board_number || m?.assigned_board || m?.assignedBoard || null;

// shortcut: self-check, run with `node src/utils/tvStage.js`
if (globalThis.process?.argv?.[1]?.endsWith('tvStage.js')) {
  const p = (id) => ({ id, name: id });
  const match = (status, a, b, winner) => ({ status, player1: p(a), player2: p(b), result: winner ? { winner } : null });
  const groups = (status) => [{ matches: [match(status, 'a', 'b', status === 'completed' ? 'a' : null)], standings: [{ player: p('a') }, { player: p('b') }] }];
  const bracket = (finalStatus) => [
    { matches: [match('completed', 'a', 'c', 'a'), match('completed', 'b', 'd', 'b')] },
    { matches: [match(finalStatus, 'a', 'b', finalStatus === 'completed' ? 'b' : null), { ...match('completed', 'c', 'd', 'd'), isThirdPlaceMatch: true }] }
  ];
  const tour = (o) => ({ status: 'started', groups: groups('pending'), playoffSettings: { enabled: true }, ...o });
  console.assert(tvStage(tour({ status: 'open_for_registration' })) === 'waiting', 'waiting');
  console.assert(tvStage(tour()) === 'groups', 'groups');
  console.assert(tvStage(tour({ groups: groups('completed') }), bracket('pending')) === 'playoffs', 'playoffs');
  console.assert(tvStage(tour({ groups: groups('completed') }), bracket('completed')) === 'finished', 'final decided');
  console.assert(tvStage(tour({ groups: groups('completed'), playoffSettings: { enabled: false } })) === 'finished', 'groups only, done');
  console.assert(tvStage(tour({ status: 'completed' })) === 'finished', 'completed');
  const pending = bracket('pending');
  console.assert(currentRound(pending) === pending[1], 'current round');
  const pod = podium(tour(), bracket('completed'));
  console.assert(pod.first.id === 'b' && pod.second.id === 'a' && pod.third.length === 1 && pod.third[0].id === 'd', 'podium with 3rd-place match');
  console.assert(podium(tour({ groups: groups('completed') })).first.id === 'a', 'single-group podium');
  console.assert(podium(tour({ groups: [...groups('completed'), ...groups('completed')] })) === null, 'several groups: no podium');
  console.assert(scenesFor('groups', { live: false, standings: true, stats: true }).join() === 'standings,stats', 'scenes without live');
  console.assert(scenesFor('finished', { bracket: true, stats: false }).join() === 'champion,bracket', 'finished scenes');
  console.assert(boardNumberOf({ live_board_number: null, assigned_board: 2 }) === 2, 'assigned board fallback');
  console.log('tvStage self-check passed');
}

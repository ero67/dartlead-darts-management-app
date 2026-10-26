#!/usr/bin/env node
// Self-check for "Duplicate / Create next round" (no database):
//   node scripts/check-clone-tournament.mjs
import assert from 'node:assert/strict';
import { nextRoundName, buildClonePrefill, cloneTournamentPath } from '../src/utils/cloneTournament.js';

const names = [
  ['3. kolo', '4. kolo'],
  ['3. kolo – Cricket', '4. kolo – Cricket'],
  ['Round 7', 'Round 8'],
  ['Round 9', 'Round 10'],
  ['Kolo 09', 'Kolo 10'],
  ['Liga 2026 – 3. kolo', 'Liga 2026 – 4. kolo'],
  ['  Week 12  ', 'Week 13'],
  ['Summer Cup', 'Summer Cup (copy)'],
  ['Summer Cup 2026', 'Summer Cup 2026 (copy)'],
  ['Turnaj 5.10.', 'Turnaj 5.10. (copy)'],
  ['', '(copy)'],
];
for (const [input, expected] of names) {
  assert.equal(nextRoundName(input, '(copy)'), expected, `nextRoundName(${JSON.stringify(input)})`);
}
assert.equal(nextRoundName('Letná liga', '(kópia)'), 'Letná liga (kópia)');

const source = {
  id: 't1',
  name: '4. kolo',
  status: 'completed',
  tournamentType: 'groups_with_playoffs',
  gameType: 'cricket',
  startingScore: 501,
  legsToWin: 2,
  defaultScoringMode: 'turnTotal',
  groupSettings: { type: 'groups', value: 3, autoScorerAssignment: true, standingsCriteriaOrder: ['legDifference', 'matchesWon', 'average', 'headToHead'] },
  standingsCriteriaOrder: ['legDifference', 'matchesWon', 'average', 'headToHead'],
  playoffSettings: { enabled: true, thirdPlaceMatch: false, legsToWinByRound: { 4: 3, 2: 5 }, customSeeding: { enabled: true, slots: ['A1', 'B2'] } },
  leagueId: 'l1',
  players: [{ id: 'p1', name: 'Ana', user_id: 'u1', owner_id: 'o' }, { id: 'p2', name: 'Bo' }, null],
  groups: [{ id: 'g1' }],
  playoffs: { rounds: [] },
};
const prefill = buildClonePrefill(source, '(copy)');
assert.equal(prefill.name, '5. kolo');
assert.equal(prefill.gameType, 'cricket');
assert.equal(prefill.legsToWin, 2);
assert.equal(prefill.defaultScoringMode, 'turnTotal');
assert.deepEqual(prefill.groupSettings, { type: 'groups', value: 3, autoScorerAssignment: true });
assert.deepEqual(prefill.standingsCriteriaOrder, source.standingsCriteriaOrder);
assert.deepEqual(prefill.playoffSettings, source.playoffSettings);
assert.equal(prefill.leagueId, 'l1');
assert.deepEqual(prefill.players, [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bo' }]);
assert.equal(prefill.copyPlayers, true);
assert.equal('groups' in prefill || 'playoffs' in prefill || 'id' in prefill, false, 'no run-time data is copied');

// Editing the copy must not touch the source tournament.
prefill.playoffSettings.legsToWinByRound[2] = 9;
prefill.standingsCriteriaOrder.reverse();
assert.equal(source.playoffSettings.legsToWinByRound[2], 5);
assert.equal(source.standingsCriteriaOrder[0], 'legDifference');

// Registration rounds: settings copied, player list only offered.
assert.equal(buildClonePrefill({ ...source, status: 'open_for_registration' }, '(copy)').copyPlayers, false);
assert.equal(buildClonePrefill({ ...source, venue: 'Pub U Kohúta', startsAt: '2026-11-07T18:00:00Z' }, '(copy)').venue, 'Pub U Kohúta');
assert.equal('startsAt' in buildClonePrefill({ ...source, startsAt: '2026-11-07T18:00:00Z' }, '(copy)'), false);

// Sparse legacy rows leave the form defaults alone.
const sparse = buildClonePrefill({ name: 'Old' }, '(copy)');
assert.equal(sparse.playoffSettings, undefined);
assert.equal(sparse.standingsCriteriaOrder, undefined);
assert.deepEqual(sparse.players, []);
assert.equal(sparse.leagueId, null);

assert.equal(cloneTournamentPath('t1', 'l1'), '/create-tournament?from=t1&leagueId=l1');
assert.equal(cloneTournamentPath('t1', null), '/create-tournament?from=t1');

console.log('clone tournament: all checks passed');

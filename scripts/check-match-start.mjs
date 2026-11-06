#!/usr/bin/env node
// Self-check for the match start data builder (no database):
//   node scripts/check-match-start.mjs
import assert from 'node:assert/strict';
import { buildMatchData } from '../src/utils/matchStart.js';

const tournament = { id: 't1', gameType: 'x01', legsToWin: 3, startingScore: 501, defaultScoringMode: 'dart' };

// Group match: tournament defaults fill what the row leaves empty.
const group = buildMatchData({ id: 'm1', groupId: 'g1', legsToWin: null, startingScore: null, gameType: null }, tournament, 2);
assert.deepEqual(
  { tournamentId: group.tournamentId, groupId: group.groupId, gameType: group.gameType, legsToWin: group.legsToWin, startingScore: group.startingScore, defaultScoringMode: group.defaultScoringMode, isPlayoff: group.isPlayoff },
  { tournamentId: 't1', groupId: 'g1', gameType: 'x01', legsToWin: 2, startingScore: 501, defaultScoringMode: 'dart', isPlayoff: false }
);
// Playoff (bracket entry without a row): flagged, no group, keeps its own fields.
const playoff = buildMatchData({ id: 'p1', isPlayoff: true, startingScore: 301 }, tournament, 5);
assert.equal(playoff.isPlayoff, true);
assert.equal(playoff.groupId, undefined);
assert.equal(playoff.startingScore, 301);
assert.equal(playoff.legsToWin, 5);

console.log('match start ok');

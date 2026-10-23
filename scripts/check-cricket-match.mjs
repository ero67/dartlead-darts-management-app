#!/usr/bin/env node
// Self-check for the tournament Cricket scorer's glue (no database):
//   node scripts/check-cricket-match.mjs
import assert from 'node:assert/strict';
import { createCricketMatch, cricketApplyDart, cricketSetStarter, cricketUndo } from '../src/lib/cricket.js';
import { dartFromInput } from '../src/lib/x01Engine.js';
import {
  cricketLiveUpdate, cricketStateFromRow, cricketMatchResult, withLegsTarget, storableCricketState
} from '../src/components/match/cricket/cricketMatchState.js';

const players = [{ id: 'a', name: 'A', kind: 'human' }, { id: 'b', name: 'B', kind: 'human' }];
const D = (l) => (l === '0' ? dartFromInput(0) : l === 'D25' ? dartFromInput(25, 'double') : l === '25' ? dartFromInput(25)
  : dartFromInput(Number(l.slice(1)), { S: 'single', D: 'double', T: 'triple' }[l[0]]));
const play = (s, labels) => labels.reduce((st, l) => cricketApplyDart(st, D(l)).state, s);
const CLOSE_ALL = ['T20', 'T19', 'T18', 'T17', 'T16', 'T15', 'D25', '25'];

// Live payload after A's first visit: points in *_current_score, marks + last visit in live_state.
let s = cricketSetStarter(createCricketMatch({ legsTarget: 2, players, starter: 'bullup' }), 0);
s = play(s, ['T20', 'S20', 'S5']);
let u = cricketLiveUpdate(s);
assert.equal(u.player1_current_score, 20);
assert.equal(u.current_player, 1);
assert.deepEqual(u.live_state.lastVisit, { player: 0, darts: ['T20', 'S20', 'S5'], marks: 4, points: 20 });
assert.deepEqual(u.live_state.visit, []);

// Resume from that row (JSON round trip: string keys) on another device.
const row = { ...JSON.parse(JSON.stringify(u)), match_starter: 0, status: 'in_progress' };
const r = cricketStateFromRow(row, { legsTarget: 2, players });
assert.equal(r.leg.marks[0][20], 4);
assert.equal(r.turn, 1);
assert.equal(r.legStarter, 0);
assert.equal(cricketApplyDart(r, D('T19')).state.leg.marks[1][19], 3, 'play continues');
// The running totals (match MPR) and finished legs survive the resume.
assert.deepEqual(r.totals[0], s.totals[0]);
assert.deepEqual(cricketStateFromRow({ ...row, live_state: { marks: row.live_state.marks } }, { legsTarget: 2, players }).totals[0].visitMarks, [], 'older rows without totals');
// A closes everything over three visits (B misses in between) and takes leg 1.
const twoLegs = play(s, ['0', '0', '0', 'T19', 'T18', 'T17', '0', '0', '0', 'T16', 'T15', 'D25', '0', '0', '0', '25']);
const r2 = cricketStateFromRow({ ...JSON.parse(JSON.stringify(cricketLiveUpdate(twoLegs))), match_starter: 0, status: 'in_progress' }, { legsTarget: 2, players });
assert.equal(r2.legLog.length, 1);
assert.equal(cricketMatchResult(r2, { id: 'm', player1: players[0], player2: players[1] }).player1Stats.legs.length, 1);
// Leg 2 starter alternates from the match starter.
assert.equal(cricketStateFromRow({ ...row, current_leg: 2 }, { legsTarget: 2, players }).legStarter, 1);

// legsTarget fix reaches undo snapshots.
const fixed = withLegsTarget(s, 5);
assert.equal(cricketUndo(fixed).settings.legsTarget, 5);
assert.ok(storableCricketState({ ...s, undoStack: Array(250).fill(s.undoStack[0]) }).undoStack.length <= 100);

// Full match A 2-0: result shape with per-leg rows.
s = cricketSetStarter(createCricketMatch({ legsTarget: 2, players, starter: 'bullup' }), 0);
// A closes everything in 8 darts; B misses in between.
const leg = (st) => play(st.turn === 0 ? st : play(st, ['0', '0', '0']), [...CLOSE_ALL.slice(0, 3), '0', '0', '0', ...CLOSE_ALL.slice(3, 6), '0', '0', '0', ...CLOSE_ALL.slice(6)]);
s = leg(s);
assert.deepEqual(s.legsWon, [1, 0]);
s = leg(s);
assert.ok(s.finishedAt);
const res = cricketMatchResult(s, { id: 'm', player1: players[0], player2: players[1], groupId: 'g' });
assert.equal(res.gameType, 'cricket');
assert.equal(res.winner, 'a');
assert.equal(res.player1Legs, 2);
assert.equal(res.player1Stats.legs.length, 2);
assert.equal(res.player1Stats.legs[0].isWin, true);
assert.equal(res.player1Stats.legs[0].marks, 21);
assert.equal(res.player1Stats.legsWon, undefined);
assert.ok(res.player1Stats.mpr > 0 && res.player2Stats.mpr === 0);
assert.equal(res.visits, undefined);

console.log('cricket match glue: ok');

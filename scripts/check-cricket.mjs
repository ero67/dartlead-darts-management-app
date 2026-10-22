#!/usr/bin/env node
// Self-check for the Cricket rules engine (no database):
//   node scripts/check-cricket.mjs
import assert from 'node:assert/strict';
import {
  createCricketMatch, cricketApplyDart, cricketEndVisit, cricketUndo, cricketAwardLegByBullup,
  cricketBotVisit, computeCricketStats, scoreDart, mprOf
} from '../src/lib/cricket.js';
import { getBotLevel, newSeed } from '../src/lib/botPlayer.js';

const D = (label) => {
  if (label === '0') return { value: 0, label: '0', number: 0, multiplier: 1 };
  if (label === '25') return { value: 25, label: '25', number: 25, multiplier: 1 };
  if (label === 'D25') return { value: 50, label: 'D25', number: 25, multiplier: 2 };
  const m = { S: 1, D: 2, T: 3 }[label[0]];
  const n = Number(label.slice(1));
  return { value: n * m, label, number: n, multiplier: m };
};
const players = [{ id: 'a', name: 'A', kind: 'human' }, { id: 'b', name: 'B', kind: 'human' }];
const play = (state, labels) => labels.reduce((s, l) => cricketApplyDart(s, D(l)).state, state);

// Marks and overflow: T20 closes, a further S20 scores 20 while B is open.
let s = createCricketMatch({ legsTarget: 2, players });
s = play(s, ['T20', 'S20', 'S5']);
assert.equal(s.leg.marks[0][20], 4);
assert.equal(s.leg.points[0], 20);
assert.equal(s.totals[0].marks, 4, 'closing 3 + scoring 1 are both marks; S5 is none');
assert.equal(s.turn, 1, 'three darts pass the turn');

// B closes 20: A's further 20s are dead (no points, no marks).
s = play(s, ['T20', '0', '0']);
s = play(s, ['T20', '0', '0']);
assert.equal(s.leg.points[0], 20);
assert.equal(s.totals[0].marks, 4);

// Bull: outer 1 mark, inner 2; scoring bull is 25 per mark.
assert.deepEqual(scoreDart([{ 25: 0 }, { 25: 0 }], 0, D('D25')), { marks: 2, points: 0 });
assert.deepEqual(scoreDart([{ 25: 2 }, { 25: 0 }], 0, D('D25')), { marks: 2, points: 25 });
assert.deepEqual(scoreDart([{ 25: 3 }, { 25: 0 }], 0, D('D25')), { marks: 2, points: 50 });
assert.deepEqual(scoreDart([{ 25: 3 }, { 25: 3 }], 0, D('D25')), { marks: 0, points: 0 });

// Win needs everything closed AND points >= opponent; ends mid-visit.
s = createCricketMatch({ legsTarget: 1, players });
s = play(s, ['0', '0', '0', 'T20', 'S20', 'S20']); // B leads 40
s = play(s, ['T20', 'T19', 'T18', '0', '0', '0', 'T17', 'T16', 'T15', '0', '0', '0']);
let r = cricketApplyDart(s, D('D25'));
s = r.state;
r = cricketApplyDart(s, D('25'));
assert.equal(r.outcome, 'dart', 'all closed but behind 0 vs 40 is not a win');
s = play(r.state, ['0', '0', '0', '0']);
r = cricketApplyDart(s, D('T19')); // 57 points > 40
assert.equal(r.outcome, 'match');
assert.equal(r.state.winner, 0);
assert.equal(r.state.legLog[0].darts, 13);
assert.deepEqual(r.state.legLog[0].playerDarts, [13, 12]);
assert.equal(r.state.legLog[0].playerMarks[0], 24);

// Leg alternation and match end.
s = createCricketMatch({ legsTarget: 2, players, starter: 1 });
const closeAll = ['T20', 'T19', 'T18', 'T17', 'T16', 'T15', 'D25', '25'];
s = play(s, closeAll.slice(0, 3));
s = play(s, ['0', '0', '0']);
s = play(s, closeAll.slice(3, 6));
s = play(s, ['0', '0', '0']);
r = cricketApplyDart(play(s, ['D25']), D('25'));
assert.equal(r.outcome, 'leg');
assert.deepEqual(r.state.legsWon, [0, 1]);
assert.equal(r.state.turn, 0, 'other player starts leg 2');
assert.equal(r.state.leg.points[0], 0, 'fresh leg');

// Undo restores the exact previous state.
const before = r.state;
const after = cricketApplyDart(before, D('T20')).state;
assert.deepEqual(cricketUndo(after).leg, before.leg);

// End visit fills misses as one undo step.
const filled = cricketEndVisit(cricketApplyDart(before, D('T20')).state);
assert.equal(filled.turn, 1);
assert.equal(filled.totals[0].darts, before.totals[0].darts + 3);
assert.equal(cricketUndo(filled).turn, 0);

// Bull-up award.
const bu = cricketAwardLegByBullup(before, 1);
assert.deepEqual(bu.legsWon, [0, 2]);
assert.equal(bu.winner, 1);
assert.equal(bu.legLog.at(-1).byBullup, true);

// MPR.
assert.equal(mprOf(9, 3), 9);
assert.equal(mprOf(0, 0), 0);

// Bots finish matches and stronger bots post a higher MPR.
const botMatch = (level, seed) => {
  let m = createCricketMatch({ legsTarget: 3, players: [{ kind: 'bot' }, { kind: 'bot' }], seed });
  let guard = 0;
  while (!m.finishedAt && guard++ < 2000) m = cricketBotVisit(m, getBotLevel(level)).final;
  assert.ok(m.finishedAt, `level ${level} bot match finishes`);
  return computeCricketStats(m).players[0].mpr;
};
const mean = (level) => {
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += botMatch(level, (newSeed() ^ i) | 0);
  return sum / 20;
};
const weak = mean(1);
const strong = mean(8);
assert.ok(strong > weak + 1, `level 8 MPR ${strong.toFixed(2)} well above level 1 ${weak.toFixed(2)}`);

console.log(`cricket: all checks passed (bot MPR L1 ${weak.toFixed(2)}, L8 ${strong.toFixed(2)})`);

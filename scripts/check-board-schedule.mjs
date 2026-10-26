#!/usr/bin/env node
// Self-check for board scheduling (no database):
//   node scripts/check-board-schedule.mjs
import assert from 'node:assert/strict';
import { planBoards, autoAssignBoards, boardQueues, pendingInPlayOrder } from '../src/utils/boardSchedule.js';

// Round-robin pairings in the circle method, like the app generates them.
const roundRobin = (ids) => {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const out = [];
  for (let r = 0; r < list.length - 1; r++) {
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a && b) out.push([a, b]);
    }
    list.splice(1, 0, list.pop());
  }
  return out;
};
const player = (id) => ({ id, name: id });
const group = (name, ids) => ({
  id: name, name,
  matches: roundRobin(ids).map(([a, b], i) => ({ id: `${name}${i + 1}`, player1: player(a), player2: player(b), status: 'pending', assignedBoard: null }))
});

// Nobody on two boards in one slot, no board twice in one slot, every match placed.
const checkPlan = (inputs, plan, label) => {
  assert.equal(plan.size, inputs.length, `${label}: every match placed`);
  const seen = new Map();
  for (const m of inputs) {
    const { board, slot } = plan.get(m.id);
    if (m.board != null) assert.equal(board, m.board, `${label}: fixed board kept for ${m.id}`);
    const key = (x) => `${slot}:${x}`;
    for (const x of [`board#${board}`, m.p1, m.p2]) {
      assert.ok(!seen.has(key(x)), `${label}: ${x} double-booked in slot ${slot}`);
      seen.set(key(x), m.id);
    }
  }
};
const inputsOf = (tournament) => pendingInPlayOrder(tournament).map((m) => ({ id: m.id, p1: m.player1.id, p2: m.player2.id, board: null }));

// Two groups of five (odd: one player sits out every round), three boards.
const night = { boardCount: 3, groups: [group('A', ['a1', 'a2', 'a3', 'a4', 'a5']), group('B', ['b1', 'b2', 'b3', 'b4', 'b5'])] };
const assignment = autoAssignBoards(night, 3);
assert.equal(Object.keys(assignment).length, 20, 'all 20 group matches assigned');
assert.deepEqual(new Set(Object.values(assignment)), new Set([1, 2, 3]), 'all three boards used');
checkPlan(inputsOf(night), planBoards(inputsOf(night), 3), 'odd groups');
// Both groups start at once (interleaved play order).
assert.deepEqual([assignment.A1, assignment.B1], [1, 2]);

// The queues derived from the stored boards give the same slots, conflict free.
for (const g of night.groups) for (const m of g.matches) m.assignedBoard = assignment[m.id];
const queues = boardQueues(night);
assert.equal([...queues.values()].flat().length, 20);
const fixed = inputsOf(night).map((m) => ({ ...m, board: assignment[m.id] }));
const freePlan = planBoards(inputsOf(night), 3);
const fixedPlan = planBoards(fixed, 3);
checkPlan(fixed, fixedPlan, 'stored boards');
for (const m of fixed) assert.deepEqual(fixedPlan.get(m.id), freePlan.get(m.id), `same slot for ${m.id}`);

// A finished match keeps its board and drops out of the queue; a live one is
// excluded by id; nothing else moves board.
night.groups[0].matches[0].status = 'completed';
const after = boardQueues(night, new Set(['B1']));
assert.ok(![...after.values()].flat().some((m) => m.id === 'A1' || m.id === 'B1'));
for (const [board, list] of after) for (const m of list) assert.equal(m.assignedBoard, board);

// More boards than matches: one match per board, extra boards idle.
const few = planBoards([{ id: 'x', p1: 'p', p2: 'q', board: null }, { id: 'y', p1: 'r', p2: 's', board: null }], 5);
assert.deepEqual([...few.values()], [{ board: 1, slot: 0 }, { board: 2, slot: 0 }]);

// A player in consecutive matches is never put on a second board in the same
// slot: the second match waits a slot and the next free match fills board 2.
const consecutive = [
  { id: 'm1', p1: 'A', p2: 'B', board: null },
  { id: 'm2', p1: 'A', p2: 'C', board: null },
  { id: 'm3', p1: 'D', p2: 'E', board: null },
  { id: 'm4', p1: 'C', p2: 'B', board: null }
];
const c = planBoards(consecutive, 2);
checkPlan(consecutive, c, 'consecutive');
assert.deepEqual(c.get('m1'), { board: 1, slot: 0 });
assert.deepEqual(c.get('m3'), { board: 2, slot: 0 });
assert.deepEqual(c.get('m2'), { board: 1, slot: 1 });

// A manual board outside the board count is still honoured (no endless loop).
const manual = planBoards([{ id: 'z', p1: 'A', p2: 'B', board: 7 }], 3);
assert.deepEqual(manual.get('z'), { board: 7, slot: 0 });
assert.equal(planBoards([], 3).size, 0);
assert.equal(planBoards(consecutive, 0).size, 0);

// Playoffs: playable bracket matches are scheduled, the board comes from the
// matches row, a match still waiting for a player is not.
const bracket = {
  boardCount: 2,
  groups: [],
  playoffs: { rounds: [
    { name: 'SF', matches: [
      { id: 's1', player1: player('p1'), player2: player('p4'), status: 'pending' },
      { id: 's2', player1: player('p2'), player2: player('p3'), status: 'pending' }
    ] },
    { name: 'F', matches: [{ id: 'f', player1: null, player2: null, status: 'pending' }] }
  ] },
  playoffMatches: [{ id: 's2', player1: player('p2'), player2: player('p3'), status: 'pending', assignedBoard: 2 }]
};
assert.deepEqual(autoAssignBoards(bracket, 2), { s1: 1, s2: 2 });
assert.deepEqual([...boardQueues(bracket)].map(([b, list]) => [b, list.map((m) => m.id)]), [[2, ['s2']]]);

console.log('board schedule ok');

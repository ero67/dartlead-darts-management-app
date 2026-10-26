// Board scheduling for a night with several dartboards: which board each
// waiting match goes to and in what order ("where do I play next?").
//
// Only the board is stored (matches.assigned_board); the queue order on a
// board is derived here, so it follows completions and manual changes. The
// same slot fill both assigns boards (auto-assign) and orders the queues
// (TV, cards): on a fresh assignment the two give the same slots.

import { mergeBracketRounds, upcomingPlayoffMatches } from './bracketView.js';

// Plan matches into slots. `matches` are in play order, each
// { id, p1, p2, board }: board null = free to go on any board, a number =
// fixed to that board. Slot by slot, every board takes the first remaining
// match it may play whose players are not already on a board in that slot,
// so nobody is booked on two boards at once. Returns Map id -> { board, slot }.
export function planBoards(matches, boardCount) {
  const boards = Math.max(Number(boardCount) || 0, ...matches.map((m) => m.board || 0));
  const plan = new Map();
  if (boards < 1) return plan;
  const remaining = [...matches];
  for (let slot = 0; remaining.length > 0; slot++) {
    const busy = new Set();
    for (let board = 1; board <= boards; board++) {
      const i = remaining.findIndex((m) => (m.board == null || m.board === board) && !busy.has(m.p1) && !busy.has(m.p2));
      if (i === -1) continue;
      const [m] = remaining.splice(i, 1);
      busy.add(m.p1);
      busy.add(m.p2);
      plan.set(m.id, { board, slot });
    }
  }
  return plan;
}

// Matches that can be played next, in play order: group matches interleaved
// across groups (A1, B1, A2, B2, ... so every group gets boards), then the
// playable playoff matches in bracket order. Each carries `label` (group or
// round name) and `assignedBoard`.
export function pendingInPlayOrder(tournament) {
  const ready = (m) => m.status === 'pending' && m.player1 && m.player2;
  const queues = (tournament?.groups || []).map((g) => (g.matches || []).filter(ready).map((m) => ({ ...m, label: g.name })));
  const groupMatches = [];
  for (let i = 0; i < Math.max(0, ...queues.map((q) => q.length)); i++) {
    for (const q of queues) if (q[i]) groupMatches.push(q[i]);
  }
  const rows = tournament?.playoffMatches || [];
  const rowById = new Map(rows.map((m) => [m.id, m]));
  const playoffMatches = upcomingPlayoffMatches(mergeBracketRounds(tournament?.playoffs?.rounds, rows, tournament?.players))
    .map((m) => ({ ...m, label: m.roundName, assignedBoard: rowById.get(m.id)?.assignedBoard ?? null }));
  return [...groupMatches, ...playoffMatches];
}

const toSlotInput = (m, board) => ({ id: m.id, p1: m.player1.id, p2: m.player2.id, board });

// Auto-assign: every waiting match is spread over `boardCount` boards.
// Returns { [matchId]: board } for the set_match_boards RPC.
export function autoAssignBoards(tournament, boardCount) {
  const plan = planBoards(pendingInPlayOrder(tournament).map((m) => toSlotInput(m, null)), boardCount);
  return Object.fromEntries([...plan].map(([id, { board }]) => [id, board]));
}

// The queue of every board: Map board -> waiting matches in the order they
// will be played. `excludeIds` drops matches already live on a device.
export function boardQueues(tournament, excludeIds = new Set()) {
  const waiting = pendingInPlayOrder(tournament).filter((m) => m.assignedBoard && !excludeIds.has(m.id));
  const plan = planBoards(waiting.map((m) => toSlotInput(m, m.assignedBoard)), tournament?.boardCount);
  const queues = new Map();
  for (const m of [...waiting].sort((a, b) => plan.get(a.id).slot - plan.get(b.id).slot)) {
    const board = plan.get(m.id).board;
    if (!queues.has(board)) queues.set(board, []);
    queues.get(board).push(m);
  }
  return new Map([...queues].sort((a, b) => a[0] - b[0]));
}

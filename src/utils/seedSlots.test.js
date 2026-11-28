// Run with: node --test src/utils/seedSlots.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifiersPerGroup, enumerateSeedSlots, bracketSizeForSettings } from './seedSlots.js';

const groupOf = (name, size) => ({ name, players: Array.from({ length: size }, (_, i) => ({ id: `${name}-${i}` })) });
const groups = [groupOf('Group A', 5), groupOf('Group B', 5), groupOf('Group C', 4)];

test('"All" players per group uses the largest group size, not 9999', () => {
  const ps = { qualificationMode: 'perGroup', playersPerGroup: 9999 };
  assert.equal(qualifiersPerGroup(ps, groups), 5);
  assert.equal(bracketSizeForSettings(ps, groups), 16);
  const { pool, bracketSize } = enumerateSeedSlots(ps, groups);
  assert.equal(pool.length, 15);
  assert.equal(bracketSize, 16);
});

test('fixed and total-player modes are unchanged', () => {
  assert.equal(qualifiersPerGroup({ playersPerGroup: 2 }, groups), 2);
  assert.equal(qualifiersPerGroup({ qualificationMode: 'totalPlayers', totalPlayersToAdvance: 8 }, groups), 3);
});

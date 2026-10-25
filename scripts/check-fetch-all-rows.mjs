#!/usr/bin/env node
// Self-check for the paging helper (no database):
//   node scripts/check-fetch-all-rows.mjs
import assert from 'node:assert/strict';
import { fetchAllRows, PAGE_SIZE } from '../src/lib/fetchAllRows.js';

// Fake builder over `total` rows that, like PostgREST, never returns more than PAGE_SIZE.
const fake = (total, calls) => () => ({
  range: async (from, to) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, total, from + PAGE_SIZE);
    return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null };
  }
});

for (const total of [0, 1, PAGE_SIZE - 1, PAGE_SIZE, PAGE_SIZE + 1, 2500]) {
  const calls = [];
  const rows = await fetchAllRows(fake(total, calls));
  assert.deepEqual(rows, Array.from({ length: total }, (_, i) => i), `all ${total} rows, in order`);
  assert.equal(calls.length, Math.floor(total / PAGE_SIZE) + 1, 'stops at the first short page');
}

await assert.rejects(
  fetchAllRows(() => ({ range: async () => ({ data: null, error: new Error('boom') }) })),
  /boom/,
  'errors propagate instead of returning partial data'
);

console.log('fetchAllRows: ok');

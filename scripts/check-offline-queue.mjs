#!/usr/bin/env node
// Self-check for the offline queue's drop/skip decisions (no database):
//   node scripts/check-offline-queue.mjs
import assert from 'node:assert/strict';
import { isTerminalWriteError, belongsToOtherUser } from '../src/lib/queuePolicy.js';

// Terminal: permission denied, row gone, bracket guard.
assert.ok(isTerminalWriteError({ code: '42501', message: 'new row violates row-level security policy' }));
assert.ok(isTerminalWriteError({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' }));
assert.ok(isTerminalWriteError(new Error('complete_playoff_match failed: winner_mismatch')));
assert.ok(isTerminalWriteError(new Error('complete_playoff_match failed: not_authorized')));
assert.ok(isTerminalWriteError(new Error('complete_playoff_match failed: match_not_found')));
assert.ok(isTerminalWriteError(new Error('Match not found in database')));
assert.ok(isTerminalWriteError(new Error('RLS policy blocking update. Match exists with status: scheduled')));
assert.ok(isTerminalWriteError(new Error('Match not found or RLS policy blocking: Cannot coerce the result to a single JSON object')));
assert.ok(isTerminalWriteError(new Error('Match not found or RLS policy blocking: JSON object requested, multiple (or no) rows returned')));

// Retryable: offline, flaky network, signed out, unknown.
assert.ok(!isTerminalWriteError(new Error('Authentication required to complete match. Please log in again.')));
assert.ok(!isTerminalWriteError(new TypeError('Failed to fetch')));
assert.ok(!isTerminalWriteError(new Error('Match not found or RLS policy blocking: TypeError: Failed to fetch')));
assert.ok(!isTerminalWriteError({ code: '57014', message: 'canceling statement due to statement timeout' }));
assert.ok(!isTerminalWriteError(new Error('complete_playoff_match failed: unknown')));
assert.ok(!isTerminalWriteError(null));

// Owner check: other account waits, own and legacy items replay.
assert.ok(belongsToOtherUser({ userId: 'a' }, 'b'));
assert.ok(belongsToOtherUser({ userId: 'a' }, null));
assert.ok(!belongsToOtherUser({ userId: 'a' }, 'a'));
assert.ok(!belongsToOtherUser({}, 'b'));
assert.ok(!belongsToOtherUser({ userId: null }, null));

console.log('offline queue policy: all checks passed');

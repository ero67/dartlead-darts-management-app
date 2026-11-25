#!/usr/bin/env node
// Self-check for the visit total shown after the dart chips (no database):
//   node scripts/check-visit-total.mjs
import assert from 'node:assert/strict';
import { visitTotal } from '../src/utils/dartStats.js';
import { createSoloX01, applyDart, dartFromInput, lastVisit, lastVisitLabels } from '../src/lib/x01Engine.js';

// visitTotal: sum of the darts; nothing to show for no darts or a typed 3-dart total.
assert.equal(visitTotal([]), null);
assert.equal(visitTotal(undefined), null);
assert.equal(visitTotal([{ value: 60, isTurnTotal: true }]), null);
assert.equal(visitTotal([{ value: 60 }, { value: 20 }, { value: 5 }]), 85);
assert.equal(visitTotal([{ value: 0 }, { value: 0 }, { value: 0 }]), 0);
assert.equal(visitTotal([{ value: 60 }, { value: 20 }]), 80);
assert.equal(visitTotal([{ value: 60 }, { value: 60 }, { value: 40 }]), 160);

const throwDarts = (state, darts) =>
  darts.reduce((s, [number, mode]) => applyDart(s, dartFromInput(number, mode)).state, state);

// Nothing thrown yet.
assert.deepEqual(lastVisit(createSoloX01()), { darts: [], isBust: false });

// Visit in progress: its darts, never a bust.
let s = throwDarts(createSoloX01(), [[20, 'triple'], [20]]);
assert.equal(lastVisit(s).darts.length, 2);
assert.equal(lastVisit(s).isBust, false);
assert.equal(visitTotal(lastVisit(s).darts), 80);

// Completed visit: that visit's darts.
s = throwDarts(s, [[5]]);
assert.equal(visitTotal(lastVisit(s).darts), 85);
assert.deepEqual(lastVisitLabels(s), ['T20', '20', '5']);

// Bust: flagged, darts kept so the chips still show what was thrown.
s = throwDarts(createSoloX01({ startingScore: 50 }), [[20, 'triple']]);
assert.equal(lastVisit(s).isBust, true);
assert.deepEqual(lastVisitLabels(s), ['T20']);

console.log('visit total self-check passed');

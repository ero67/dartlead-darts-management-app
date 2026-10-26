#!/usr/bin/env node
// Self-check for round dates and venues (no database):
//   node scripts/check-round-schedule.mjs
import assert from 'node:assert/strict';
import { upcomingRounds, upcomingFirst, formatRoundDate, roundScheduleLine, toDateTimeInput, fromDateTimeInput } from '../src/utils/roundSchedule.js';

const now = Date.parse('2026-10-26T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const at = (offset) => new Date(now + offset).toISOString();
const rounds = [
  { id: 'old', status: 'completed', startsAt: at(-7 * day) },
  { id: 'later', status: 'open_for_registration', startsAt: at(14 * day) },
  { id: 'none', status: 'open_for_registration', startsAt: null },
  { id: 'soon', status: 'open_for_registration', startsAt: at(2 * day) },
  { id: 'live', status: 'started', startsAt: at(1 * day) }, // began early: live, not upcoming
  { id: 'missed', status: 'open_for_registration', startsAt: at(-1 * day) },
  { id: 'done-early', status: 'completed', startsAt: at(3 * day) },
];
const ids = (xs) => xs.map(r => r.id).join(',');

assert.equal(ids(upcomingRounds(rounds, now)), 'soon,later');
assert.equal(ids(upcomingFirst(rounds, now)), 'soon,later,old,none,live,missed,done-early');
assert.deepEqual(upcomingRounds([], now), []);
assert.equal(upcomingRounds([{ id: 'x', status: 'open_for_registration', startsAt: at(0) }], now).length, 0); // exactly now is not upcoming

// App language decides the format, not the browser locale.
const iso = `${new Date().getFullYear()}-10-31T18:00:00Z`;
const sk = formatRoundDate(iso, 'sk', 'Europe/Bratislava');
const en = formatRoundDate(iso, 'en', 'Europe/Bratislava');
assert.match(sk, /31\. októbra/);
assert.match(sk, /19:00/);
assert.match(en, /31 October/);
assert.match(en, /19:00/);
assert.doesNotMatch(en, /\d{4}/); // current year is left out
assert.match(formatRoundDate('2031-03-01T18:00:00Z', 'en', 'UTC'), /2031/);

assert.equal(roundScheduleLine({ startsAt: null, venue: null }, 'en'), '');
assert.equal(roundScheduleLine({ startsAt: null, venue: 'Pub' }, 'en'), 'Pub');
assert.match(roundScheduleLine({ startsAt: iso, venue: 'Pub' }, 'en', 'Europe/Bratislava'), /19:00 · Pub$/);

// datetime-local round trip keeps the instant (minute precision).
const stored = '2026-11-07T17:30:00.000Z';
assert.equal(fromDateTimeInput(toDateTimeInput(stored)), stored);
assert.equal(toDateTimeInput(null), '');
assert.equal(fromDateTimeInput(''), null);

console.log('round schedule: all checks passed');

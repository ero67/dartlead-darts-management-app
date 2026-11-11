// Run with: node --test src/utils/billing.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, paidPeriod, daysLeft, subscriptionLevel, todayIso } from './billing.js';

test('addMonths clamps to the end of the month and rolls over the year', () => {
  assert.equal(addMonths('2026-11-11', 1), '2026-12-11');
  assert.equal(addMonths('2026-11-11', 12), '2027-11-11');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
});

test('paidPeriod starts on the payment date unless paid-until is later', () => {
  assert.deepEqual(paidPeriod('2026-11-11', 1, null), { start: '2026-11-11', until: '2026-12-11' });
  assert.deepEqual(paidPeriod('2026-11-11', 1, '2026-10-01'), { start: '2026-11-11', until: '2026-12-11' });
  assert.deepEqual(paidPeriod('2026-11-11', 12, '2026-11-20'), { start: '2026-11-20', until: '2027-11-20' });
});

test('subscriptionLevel warns in the last 7 days and expires the day after', () => {
  const today = '2026-11-11';
  assert.equal(daysLeft('2026-11-18', today), 7);
  assert.equal(subscriptionLevel(null, today), null);
  assert.equal(subscriptionLevel('2026-11-19', today), 'ok');
  assert.equal(subscriptionLevel('2026-11-18', today), 'warn');
  assert.equal(subscriptionLevel('2026-11-11', today), 'warn');
  assert.equal(subscriptionLevel('2026-11-10', today), 'expired');
});

test('todayIso uses the local calendar day', () => {
  assert.equal(todayIso(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
});

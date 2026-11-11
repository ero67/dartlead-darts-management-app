// Manager billing helpers shared by the admin panel and the subscription notice.
// Dates are 'YYYY-MM-DD' strings (what Postgres `date` returns) and are compared
// as strings, so a timezone can never shift a day.

// Prices are for the admin's eyes only (invoicing is manual). A half-year plan
// is one more line here.
export const PAYMENT_PERIODS = [
  { months: 1, price: 15 },
  { months: 12, price: 150 }
];

export const SUBSCRIPTION_WARNING_DAYS = 7;

const pad = (n) => String(n).padStart(2, '0');

export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// Calendar months, clamped to the month's last day (31 Jan + 1 month = 28 Feb).
export function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total % 12;
  const lastDay = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
  return `${newYear}-${pad(newMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

// The paid period starts on the payment date, or on the current paid-until when
// that is later, so an early renewal or a running trial loses no days.
export function paidPeriod(paidOn, months, currentPaidUntil) {
  const start = currentPaidUntil && currentPaidUntil > paidOn ? currentPaidUntil : paidOn;
  return { start, until: addMonths(start, months) };
}

// Whole days from today to the date; 0 on the last paid day, negative after it.
export const daysLeft = (isoDate, today = todayIso()) => Math.round((Date.parse(isoDate) - Date.parse(today)) / 86400000);

// null (no date) | 'ok' | 'warn' | 'expired'
export function subscriptionLevel(paidUntil, today = todayIso()) {
  if (!paidUntil) return null;
  const days = daysLeft(paidUntil, today);
  return days < 0 ? 'expired' : days <= SUBSCRIPTION_WARNING_DAYS ? 'warn' : 'ok';
}

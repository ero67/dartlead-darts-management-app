// Planned date/time and venue of a round (tournament). Pure helpers, checked
// by scripts/check-round-schedule.mjs.
import { isTournamentRunning } from './tournamentStatus.js';

const time = (iso) => new Date(iso).getTime();

// Rounds that have not begun yet and are planned in the future, soonest first.
export const upcomingRounds = (rounds, now = Date.now()) => rounds
  .filter(r => r.startsAt && time(r.startsAt) > now && r.status !== 'completed' && !isTournamentRunning(r.status))
  .sort((a, b) => time(a.startsAt) - time(b.startsAt));

// Upcoming rounds first (soonest first), then the rest in their given order.
export const upcomingFirst = (rounds, now = Date.now()) => {
  const upcoming = upcomingRounds(rounds, now);
  const ids = new Set(upcoming.map(r => r.id));
  return [...upcoming, ...rounds.filter(r => !ids.has(r.id))];
};

// Formatted in the app language, not the browser locale. The year only shows
// when it is not the current one.
export const formatRoundDate = (iso, language, timeZone) => {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(language === 'sk' ? 'sk-SK' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit', timeZone,
  }).format(date);
};

// "Sat 31 October at 19:00 · Pub U Kohúta" (either part may be missing; '' if both are).
export const roundScheduleLine = ({ startsAt, venue }, language, timeZone) =>
  [startsAt && formatRoundDate(startsAt, language, timeZone), venue].filter(Boolean).join(' · ');

// <input type="datetime-local"> works in local wall time without a zone.
export const toDateTimeInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromDateTimeInput = (value) => (value ? new Date(value).toISOString() : null);

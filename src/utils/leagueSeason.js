// Seasons run autumn to spring: one starting before July belongs to last year's season.
export const seasonStartYear = (date) => {
  const d = new Date(date);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
};

export const defaultSeasonName = (startYear, t) =>
  t('leagues.seasonDefaultName', { years: `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}` });

// The current season's name; unnamed seasons get "Season 2026/27" from their start.
export const currentSeasonName = (league, t) =>
  league.seasonName || defaultSeasonName(seasonStartYear(league.seasonStartedAt || Date.now()), t);

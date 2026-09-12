import { Target, Crosshair, Hash, Clock } from 'lucide-react';

// Catalogue of practice games. `available` gates the tile; the others are
// shown as "coming soon" so players see what the free tier is growing into.
export const PRACTICE_GAMES = [
  { id: 'x01', path: '/practice/x01', icon: Target, available: true },
  { id: 'checkout', path: '/practice/checkout', icon: Crosshair, available: true },
  { id: 'oneTwentyOne', path: '/practice/121', icon: Hash, available: true },
  { id: 'aroundTheClock', path: '/practice/around-the-clock', icon: Clock, available: true }
];

// One-line description of a finished session's settings for lists.
export const describeSession = (entry, t) => {
  if (!entry) return '';
  if (entry.game === 'x01') {
    const { startingScore, legsTarget, scoringMode } = entry.settings || {};
    const legs = legsTarget === null || legsTarget === undefined
      ? t('practice.setup.unlimited')
      : t(legsTarget === 1 ? 'practice.legCountOne' : 'practice.legCountMany', { count: legsTarget });
    const mode = scoringMode === 'turnTotal' ? t('practice.setup.scoringTurnTotal') : t('practice.setup.scoringDart');
    const opponent = entry.settings?.opponent?.name ? ` · ${t('practice.match.vs')} ${entry.settings.opponent.name}` : '';
    return `${startingScore} · ${legs} · ${mode}${opponent}`;
  }
  if (entry.game === 'checkout') {
    const { range, min, max, attemptsTarget } = entry.settings || {};
    const rangeLabel = range === 'doubles' ? t('practice.checkout.ranges.doubles') : `${min}–${max}`;
    const attempts = attemptsTarget === null || attemptsTarget === undefined
      ? t('practice.setup.unlimited')
      : t(`practice.checkout.attemptCount${pluralSuffix(attemptsTarget)}`, { count: attemptsTarget });
    return `${rangeLabel} · ${attempts}`;
  }
  if (entry.game === 'oneTwentyOne') {
    const { startTarget, roundsTarget, scoringMode } = entry.settings || {};
    const rounds = roundsTarget === null || roundsTarget === undefined
      ? t('practice.setup.unlimited')
      : t(`practice.oneTwentyOne.roundCount${pluralSuffix(roundsTarget)}`, { count: roundsTarget });
    const mode = scoringMode === 'turnTotal' ? t('practice.setup.scoringTurnTotal') : t('practice.setup.scoringDart');
    return `${startTarget} · ${rounds} · ${mode}`;
  }
  if (entry.game === 'aroundTheClock') {
    const { mode, includeBull } = entry.settings || {};
    return `${t(`practice.aroundTheClock.modes.${mode || 'singles'}`)}${includeBull ? ` · ${t('practice.aroundTheClock.withBull')}` : ''}`;
  }
  return entry.game;
};

const pct = (v, t) => (v === null || v === undefined ? t('practice.noStats') : `${v.toFixed(0)}%`);
const secs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Up to four [label, value] pairs summarising a finished session, per game.
export const sessionHighlights = (entry, t) => {
  const s = entry.stats || {};
  switch (entry.game) {
    case 'checkout':
      return [
        [t('practice.checkout.stats.hitRate'), pct(s.hitPercent, t)],
        [t('practice.checkout.stats.hits'), `${s.hits ?? 0}/${s.attempts ?? 0}`],
        [t('practice.checkout.stats.avgDartsPerHit'), s.avgDartsPerHit ?? t('practice.noStats')],
        [t('practice.stats.darts'), s.totalDarts ?? 0]
      ];
    case 'oneTwentyOne':
      return [
        [t('practice.oneTwentyOne.stats.highestSuccess'), s.highestSuccess ?? t('practice.noStats')],
        [t('practice.oneTwentyOne.stats.successRate'), pct(s.successPercent, t)],
        [t('practice.oneTwentyOne.stats.rounds'), s.rounds ?? 0],
        [t('practice.stats.darts'), s.totalDarts ?? 0]
      ];
    case 'aroundTheClock':
      return [
        [t('practice.stats.darts'), s.totalDarts ?? 0],
        [t('practice.aroundTheClock.time'), secs(s.seconds ?? 0)],
        [t('practice.aroundTheClock.stats.avgDartsPerTarget'), s.avgDartsPerTarget ?? t('practice.noStats')],
        [t('practice.aroundTheClock.stats.firstDartHits'), s.firstDartHits ?? 0]
      ];
    default:
      return [
        [t('practice.stats.average'), (s.average ?? 0).toFixed(1)],
        [t('practice.stats.checkout'), pct(s.checkoutPercent, t)],
        // A match shows its result where a solo session shows legs played
        s.legsFor !== undefined
          ? [t('practice.match.result'), `${s.legsFor}:${s.legsAgainst ?? 0}`]
          : [t('practice.stats.legs'), s.legs ?? 0],
        [t('practice.stats.darts'), s.totalDarts ?? 0]
      ];
  }
};

export const formatSessionDate = (timestamp, language) => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleString(language === 'sk' ? 'sk-SK' : 'en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
};

export const formatDuration = (startedAt, finishedAt) => {
  if (!startedAt || !finishedAt || finishedAt < startedAt) return '';
  const totalSeconds = Math.round((finishedAt - startedAt) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

// Pick the plural form key suffix for a count: One (1), Few (2-4), Many (0, 5+).
// Slovak needs all three; English maps Few and Many to the same string.
export const pluralSuffix = (count) => {
  if (count === 1) return 'One';
  if (count >= 2 && count <= 4) return 'Few';
  return 'Many';
};

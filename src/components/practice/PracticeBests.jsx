import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card } from '@/components/ui/card';
import { computePracticeSummary } from '../../lib/practiceSummary';
import { cn } from '@/lib/utils';

const secs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Personal bests across all practice games, grouped per game, with the
// session and dart totals in the header. Also rendered inside
// not-yet-migrated screens (profile), hence the own `tw` root.
export function PracticeBests({ entries, title, compact = false }) {
  const { t } = useLanguage();
  const s = computePracticeSummary(entries);
  if (s.sessions === 0) return null;
  const dash = t('practice.noStats');
  const num = (v, digits = 0) => (v === null || v === undefined ? dash : v.toFixed(digits));

  // [label, value, unit?, isHot?] rows per game; the hot row is the headline best.
  const groups = [
    s.x01.sessions > 0 && {
      key: 'x01',
      rows: [
        [t('practice.bests.bestAverage'), num(s.x01.bestAverage, 1), '', true],
        [t('practice.bests.bestFirstNine'), num(s.x01.bestFirstNine, 1)],
        [t('practice.stats.oneEighties'), s.x01.oneEighties],
        [t('practice.stats.highestCheckout'), s.x01.highestCheckout ?? dash],
        s.x01.bestLegDarts !== null && [t('practice.bests.bestLeg'), s.x01.bestLegDarts, ` ${t('practice.stats.darts').toLowerCase()}`]
      ]
    },
    s.checkout.sessions > 0 && {
      key: 'checkout',
      rows: [
        [t('practice.bests.bestHitRate'), num(s.checkout.bestHitPercent), s.checkout.bestHitPercent === null ? '' : '%', true],
        [t('practice.checkout.stats.bestStreak'), s.checkout.bestStreak ?? dash]
      ]
    },
    s.oneTwentyOne.sessions > 0 && {
      key: 'oneTwentyOne',
      rows: [
        [t('practice.oneTwentyOne.stats.highestSuccess'), s.oneTwentyOne.highestSuccess ?? dash, '', true],
        [t('practice.oneTwentyOne.stats.bestStreak'), s.oneTwentyOne.bestStreak ?? dash]
      ]
    },
    s.aroundTheClock.sessions > 0 && {
      key: 'aroundTheClock',
      rows: [
        [t('practice.bests.fastestTime'), s.aroundTheClock.fastestSeconds === null ? dash : secs(s.aroundTheClock.fastestSeconds), '', true],
        [t('practice.bests.fewestDarts'), s.aroundTheClock.fewestDarts ?? dash]
      ]
    }
  ].filter(Boolean);

  return (
    <div className="tw flex flex-col gap-3 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
        <div className="flex gap-5">
          <span className="flex items-baseline gap-2">
            <b className="font-display text-3xl font-semibold leading-none tabular-nums">{s.sessions}</b>
            <span className="text-xs leading-tight text-muted-foreground">{t('practice.stats.sessions')}<br />{t('practice.bests.last30', { count: s.last30Days })}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <b className="font-display text-3xl font-semibold leading-none tabular-nums">{s.totalDarts.toLocaleString()}</b>
            <span className="text-xs text-muted-foreground">{t('practice.stats.darts')}</span>
          </span>
        </div>
      </div>
      <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4')}>
        {groups.map((group) => (
          <Card key={group.key} className="gap-0 px-4 pb-1 pt-4">
            <span className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t(`practice.games.${group.key}.title`)}</span>
            {group.rows.filter(Boolean).map(([label, value, unit = '', isHot = false]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-t py-1.5">
                <span className="text-sm">{label}</span>
                <span className={cn('font-display text-2xl font-bold leading-none tabular-nums', isHot && 'text-primary')}>
                  {value}<span className="text-sm text-muted-foreground">{unit}</span>
                </span>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

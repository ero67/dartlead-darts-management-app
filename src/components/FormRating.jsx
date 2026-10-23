import React, { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { matchService } from '../services/tournamentService';
import { HISTORY_MATCHES, strengthHistory } from '../lib/winProbability';

const TREND_MATCHES = 30;
const CHANGE_OVER = 10;
const MIN_MATCHES = 3;

// The player's form rating: the strength the win chances use (recent 3-dart
// average, newer matches weigh more, settled toward the field while there are
// few matches), its change over the last 10 matches and a trend line. X01 only
// (getRecentMatchTotals skips Cricket); `gameLabel` names that when it matters.
export function FormRating({ playerId, gameLabel = null }) {
  const { t } = useLanguage();
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!playerId) return undefined;
    let isCurrent = true;
    // Enough history for the oldest trend point to be rated on a full window.
    matchService.getRecentMatchTotals([playerId], HISTORY_MATCHES + TREND_MATCHES)
      .then((totals) => { if (isCurrent) setPoints(strengthHistory(totals.get(playerId) || [], TREND_MATCHES)); })
      .catch((err) => { console.error('Loading form rating failed:', err); if (isCurrent) setPoints([]); });
    return () => { isCurrent = false; };
  }, [playerId]);

  if (!points || points.length < MIN_MATCHES) return null;

  const now = points.at(-1).strength;
  const then = points[Math.max(0, points.length - 1 - CHANGE_OVER)].strength;
  const delta = now - then;
  const count = Math.min(CHANGE_OVER, points.length - 1);
  const values = points.map((p) => p.strength);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 2); // a flat form still draws as a line
  const mid = (max + min) / 2;
  const line = points
    .map((p, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(50 - ((p.strength - mid) / range) * 90).toFixed(2)}`)
    .join(' ');
  const isUp = delta >= 0.05;
  const isDown = delta <= -0.05;
  const Trend = isDown ? TrendingDown : TrendingUp;

  return (
    <Card className="flex-col gap-4 p-6 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">{t('playerProfile.formRating')}{gameLabel ? ` · ${gameLabel}` : ''}</span>
        <span className="font-display text-5xl font-semibold leading-none tabular-nums">{now.toFixed(1)}</span>
        {count > 0 && (
          <span className={cn('flex items-center gap-1 text-sm font-medium', isUp && 'text-primary', isDown && 'text-destructive', !isUp && !isDown && 'text-muted-foreground')}>
            <Trend className="size-4" />
            {t('playerProfile.formChange', { delta: `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`, count })}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full overflow-visible" role="img" aria-label={t('playerProfile.formTrend', { count: points.length })}>
          <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t('playerProfile.formTrend', { count: points.length })}</span>
          <span className="tabular-nums">{min.toFixed(1)}–{max.toFixed(1)}</span>
        </div>
        <span className="text-xs text-muted-foreground">{t('playerProfile.formHint')}</span>
      </div>
    </Card>
  );
}

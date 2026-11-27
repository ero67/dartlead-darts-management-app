import React, { useId } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Pieces of the player's form rating (see useFormRating) for the profile hero.

// "+5.0 over the last 10 matches", green up / red down
export function FormChange({ form }) {
  const { t } = useLanguage();
  if (form.count === 0) return null;
  const isUp = form.delta >= 0.05;
  const isDown = form.delta <= -0.05;
  const Trend = isDown ? TrendingDown : TrendingUp;
  return (
    <span className={cn('flex items-center gap-1 text-sm font-medium', isUp && 'text-primary', isDown && 'text-destructive', !isUp && !isDown && 'text-muted-foreground')}>
      <Trend className="size-4 shrink-0" />
      {t('playerProfile.formChange', { delta: `${form.delta >= 0 ? '+' : '−'}${Math.abs(form.delta).toFixed(1)}`, count: form.count })}
    </span>
  );
}

// Trend line of the last matches with its range and what the number means
export function FormTrend({ form, className }) {
  const { t } = useLanguage();
  const fillId = useId();
  const { points, min, max } = form;
  const range = Math.max(max - min, 2); // a flat form still draws as a line
  const mid = (max + min) / 2;
  const line = points
    .map((p, i) => `${((i / (points.length - 1)) * 100).toFixed(2)},${(50 - ((p.strength - mid) / range) * 90).toFixed(2)}`)
    .join(' ');
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full overflow-visible text-primary" role="img" aria-label={t('playerProfile.formTrend', { count: points.length })}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Soft area under the line, fading toward the baseline */}
        <polygon points={`0,100 ${line} 100,100`} fill={`url(#${fillId})`} />
        <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('playerProfile.formTrend', { count: points.length })}</span>
        <span className="tabular-nums">{min.toFixed(1)}–{max.toFixed(1)}</span>
      </div>
      <span className="text-xs text-muted-foreground">{t('playerProfile.formHint')}</span>
    </div>
  );
}

import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Board tones, as on the Statistics boards: green for scoring, red for finishing
const TONES = {
  primary: { card: 'bg-primary/5', label: 'text-primary' },
  // a lighter tint in light mode: at 5% the red label fell to 4.48:1
  live: { card: 'bg-live/[0.03] dark:bg-live/5', label: 'text-live-solid dark:text-live' }
};

// KPI tile: muted label above a big tabular number, optional hint line.
// `tone` tints the tile and its label; `valueClassName` marks the number (e.g. a milestone).
export function StatTile({ label, value, hint, icon: Icon, tone, valueClassName }) {
  const toneClass = TONES[tone];
  return (
    <Card className={cn('gap-1 p-6', toneClass?.card)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm font-medium text-muted-foreground', toneClass?.label)}>{label}</span>
        {Icon && <Icon className={cn('size-4 text-muted-foreground', toneClass?.label)} />}
      </div>
      <span className={cn('font-display text-4xl font-semibold leading-none', valueClassName)}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

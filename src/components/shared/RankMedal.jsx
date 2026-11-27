import React from 'react';
import { cn } from '@/lib/utils';

// Podium places as gold / silver / bronze chips; other ranks stay plain.
// Solid fills with their own text colour, so they read the same in both themes.
const MEDAL = {
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-zinc-300 text-zinc-900',
  3: 'bg-orange-700 text-white',
};

export function RankMedal({ rank, className }) {
  const medal = MEDAL[rank];
  if (!medal) return <span className={cn('text-muted-foreground tabular-nums', className)}>{rank}</span>;
  return (
    <span className={cn('inline-flex size-6 items-center justify-center rounded-full font-display text-sm font-bold tabular-nums', medal, className)}>
      {rank}
    </span>
  );
}

// Dartboard red for darts milestones (100+ average, ton-plus checkout, a 180).
// --live-solid in light (4.8:1 on white), the lighter --live in dark (5.2:1).
export const MILESTONE_TEXT = 'font-semibold text-live-solid dark:text-live';

import React from 'react';
import { cn } from '@/lib/utils';

// Player 1's match win chance after every visit (points from
// utils/winChanceLine.js): above the middle line player 1 leads, below
// player 2. Faint verticals split the legs; the dot is the turning point.
// Presentational: names and caption come from the caller.
export function WinChanceChart({ points, turningPointIndex = null, player1Name, player2Name, caption }) {
  const n = points.length - 1;
  const x = (i) => (n > 0 ? (i / n) * 100 : 0);
  const y = (p) => (1 - p) * 100;
  const line = points.map((pt, i) => `${x(i).toFixed(2)},${y(pt.p).toFixed(2)}`).join(' ');
  const legStarts = points.map((pt, i) => (i > 1 && pt.leg !== points[i - 1].leg ? i - 1 : null)).filter((i) => i !== null);
  const turn = turningPointIndex !== null ? points[turningPointIndex] : null;

  return (
    <figure className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-primary">{player1Name}</span>
        <span className="text-muted-foreground">100%</span>
      </div>
      <div className="relative h-32 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={caption || undefined}>
          <rect x="0" y="0" width="100" height="50" className="fill-primary/5" />
          <rect x="0" y="50" width="100" height="50" className="fill-amber-500/5" />
          {legStarts.map((i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1="0" y2="100" className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2="100" y1="50" y2="50" className="stroke-muted-foreground/40" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <polyline points={line} fill="none" className="stroke-foreground" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {turn && (
          <span
            className={cn('absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background', turn.p >= 0.5 ? 'bg-primary' : 'bg-amber-500')}
            style={{ left: `${x(turningPointIndex)}%`, top: `${y(turn.p)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs font-medium">
        <span className="text-amber-600 dark:text-amber-400">{player2Name}</span>
        <span className="text-muted-foreground">100%</span>
      </div>
      {caption && <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

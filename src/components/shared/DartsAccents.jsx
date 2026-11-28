import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Small darts-specific pieces shared across screens. Purely presentational.

// Pulsing red dot for anything happening on a board right now.
export function LiveDot({ className }) {
  return <span aria-hidden="true" className={cn('inline-block size-1.5 shrink-0 rounded-full bg-live animate-live-pulse motion-reduce:animate-none', className)} />;
}

// Last results, oldest first: filled = win, hollow ring = loss (shape, not just colour).
export function FormDots({ results = [], className }) {
  if (results.length === 0) return null;
  return (
    <span role="img" aria-label={results.map(win => (win ? 'W' : 'L')).join(' ')} className={cn('inline-flex gap-1', className)}>
      {results.map((win, i) => (
        <span
          key={i}
          className={cn('size-2 rounded-full', win ? 'bg-primary' : 'border-[1.5px] border-muted-foreground/50')}
        />
      ))}
    </span>
  );
}

// Legs won out of legs needed ("first to N"). Falls back to a number when N is
// too large for dots. Inherits colour, so it works on filled cards too.
export function LegPips({ won = 0, total, label, className }) {
  if (!total || total > 9) {
    return <span aria-label={label} className={cn('font-display text-lg font-semibold leading-none', className)}>{won}</span>;
  }
  return (
    <span role="img" aria-label={label} className={cn('inline-flex gap-1', className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('size-2 rounded-full border-[1.5px] border-current', i < won ? 'bg-current' : 'opacity-40')} />
      ))}
    </span>
  );
}

// Checkout route like ['T20', 'T19', 'D12']: red dot marks a treble, green a double/bull.
export function CheckoutRoute({ route, className, chipClassName }) {
  if (!route?.length) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {route.map((dart, i) => {
        const kind = dart.startsWith('T') ? 'treble' : (dart.startsWith('D') || /bull/i.test(dart) ? 'double' : 'single');
        return (
          <span
            key={i}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-md bg-green-100 px-1.5 font-display text-base font-semibold leading-none text-green-800 dark:bg-green-950 dark:text-green-200',
              chipClassName
            )}
          >
            {kind !== 'single' && <span className={cn('size-1.5 rounded-full', kind === 'treble' ? 'bg-live' : 'bg-primary')} />}
            {dart}
          </span>
        );
      })}
    </span>
  );
}

// Segmented lifecycle bar (see getTournamentPhase): finished steps solid,
// the current one filled to `progress`, the rest empty.
// Screen readers get it as one progressbar: `percent` of all matches played, named by `label`.
export function PhaseBar({ steps, current, progress = 0, percent, label, className }) {
  return (
    <div
      className={cn('grid gap-1', className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      {...(label && percent != null && { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, 'aria-label': label })}
    >
      {steps.map((step, i) => (
        <span key={step} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            className={cn('block h-full rounded-full', i < current ? 'bg-primary' : 'bg-primary/70')}
            style={{ width: i < current ? '100%' : i === current ? `${Math.round(progress * 100)}%` : '0%' }}
          />
        </span>
      ))}
    </div>
  );
}

// Faint dartboard in a corner of a header or card. Parent needs `relative overflow-hidden`.
export function BoardMotif({ className }) {
  return <span aria-hidden="true" className={cn('board-motif -right-32 -top-48 w-96 text-foreground opacity-[0.06] dark:opacity-[0.07]', className)} />;
}

// The sum of a visit's darts, placed after the dart chips: filled and bold so
// it reads as the result, not a fourth dart. A bust says so instead of a sum
// that never counted. Renders nothing when there is no total (see visitTotal),
// so a typed 3-dart total never gets a second chip, bust or not.
export function VisitTotal({ total, isBust = false, className }) {
  const { t } = useLanguage();
  if (total === null) return null;
  return (
    // Solid red in dark mode too: the variant's translucent red turns muddy on a green card.
    <Badge variant={isBust ? 'destructive' : 'secondary'} className={cn('font-bold tabular-nums', isBust && 'dark:bg-destructive', className)}>
      {isBust ? t('match.checkout.bust') : total}
    </Badge>
  );
}

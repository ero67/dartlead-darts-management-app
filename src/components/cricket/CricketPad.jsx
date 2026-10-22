import React from 'react';
import { ArrowLeft, ChevronsRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { dartFromInput } from '../../lib/x01Engine';
import { MarkGlyph } from './MarkGlyph';
import { CRICKET_ROWS, markCount, numberState } from './cricketView';
import { cn } from '@/lib/utils';

const KEY = 'flex min-h-11 min-w-0 items-center justify-center rounded-lg border bg-card font-display text-xl font-semibold leading-none tabular-nums transition-colors active:bg-accent disabled:pointer-events-none disabled:opacity-40';
// Same tint code as DartKeypad: green doubles, red trebles.
const MULT = {
  single: '',
  double: 'border-primary/40 bg-primary/10',
  triple: 'border-live/40 bg-live/10'
};
// Row label per number state, from the thrower's side.
const ROW = {
  open: 'bg-card text-foreground',
  scoring: 'border-primary bg-primary text-primary-foreground',
  danger: 'border-destructive/50 bg-destructive/10 text-destructive',
  dead: 'bg-muted text-muted-foreground/70'
};

// Quick entry for Cricket, one row per target (20..15, bull) with single /
// double / treble keys (bull: 25 and bull), then Miss, Undo and Next player
// (ends the visit; the rest of it counts as misses). With `marks` and
// `thrower` each row shows the thrower's marks and state. Presentational;
// callers own the rules and haptics.
export function CricketPad({ onDart, onUndo, onEndVisit, canUndo = true, dartsInVisit = 0, disabled = false, marks, thrower }) {
  const { t } = useLanguage();
  const hasState = Boolean(marks) && thrower != null;
  const isFull = disabled || dartsInVisit >= 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-1 text-foreground">
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-[minmax(3.5rem,auto)_1fr_1fr_1fr] gap-1">
        {CRICKET_ROWS.map((n) => {
          const state = hasState ? numberState(marks, thrower, n) : 'open';
          const isDead = state === 'dead';
          const keys = n === 25
            ? [['single', '25'], ['double', t('cricket.board.bullShort')]]
            : [['single', String(n)], ['double', `D${n}`], ['triple', `T${n}`]];
          return (
            <React.Fragment key={n}>
              <span className={cn('flex min-h-11 items-center justify-between gap-1 rounded-lg border px-2', ROW[state])}>
                <span className={cn('font-display text-xl font-bold uppercase leading-none', isDead && 'line-through decoration-2')}>
                  {n === 25 ? t('cricket.board.bullShort') : n}
                </span>
                {hasState && <MarkGlyph count={markCount(marks[thrower], n)} className="size-5" />}
              </span>
              {keys.map(([ring, label]) => (
                <button
                  key={ring}
                  type="button"
                  className={cn(KEY, MULT[ring], isDead && 'border-border bg-card text-muted-foreground', n === 25 && ring === 'double' && 'col-span-2 uppercase')}
                  aria-label={t(n === 25 ? (ring === 'double' ? 'cricket.board.bull' : 'cricket.board.outerBull') : `cricket.board.${ring}`, { n })}
                  onClick={() => onDart(dartFromInput(n, ring))}
                  disabled={isFull}
                >
                  {label}
                </button>
              ))}
            </React.Fragment>
          );
        })}
      </div>
      <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-1">
        <button type="button" className={cn(KEY, 'font-sans text-base font-medium')} onClick={() => onDart(dartFromInput(0))} disabled={isFull}>
          {t('match.miss')}
        </button>
        <button
          type="button"
          className={cn(KEY, 'gap-1.5 border-destructive/30 bg-destructive/10 font-sans text-base font-medium text-destructive')}
          onClick={onUndo}
          disabled={disabled || !canUndo}
        >
          <ArrowLeft className="size-5" />
          <span>{t('match.undo')}</span>
        </button>
        <button
          type="button"
          className={cn(KEY, 'gap-1.5 border-primary bg-primary font-sans text-base font-medium text-primary-foreground')}
          onClick={onEndVisit}
          disabled={disabled || dartsInVisit === 0}
        >
          <span className="truncate">{t('cricket.pad.nextPlayer')}</span>
          <ChevronsRight className="size-5 shrink-0" />
        </button>
      </div>
    </div>
  );
}

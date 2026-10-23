import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { MarkGlyph } from './MarkGlyph';
import { CRICKET_ROWS, markCount } from './cricketView';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { root: 'text-xs', head: 'mb-1 rounded-md px-2 py-1', name: 'text-xs', points: 'text-xl', legs: 'text-[10px] px-1', row: 'h-6', number: 'text-sm w-10', glyph: 'size-4' },
  md: { root: 'text-sm', head: 'mb-1.5 rounded-lg px-3 py-1.5', name: 'text-sm', points: 'text-4xl', legs: 'text-xs px-1.5', row: 'h-9', number: 'text-xl w-14', glyph: 'size-6' },
  tv: { root: 'text-2xl', head: 'mb-3 rounded-2xl px-6 py-3', name: 'text-3xl', points: 'text-8xl', legs: 'text-2xl px-3 py-0.5', row: 'h-20', number: 'text-6xl w-32', glyph: 'size-16' }
};

// Classic cricket scoreboard: player 1's marks | number | player 2's marks,
// names and points on top. `players` = [{ name, points, legs? }, ...];
// `thrower` (index) gets the filled header. A number one player has closed
// is bold, green on the side that can still score on it; closed by both it
// is struck through.
export function CricketMarksTable({ players, marks, thrower, size = 'md', className }) {
  const { t } = useLanguage();
  const s = SIZES[size] || SIZES.md;

  return (
    <div className={cn('grid grid-cols-[1fr_auto_1fr] items-center', s.root, className)}>
      {players.slice(0, 2).map((player, i) => (
        <div
          key={i}
          style={{ gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}
          className={cn(
            'flex min-w-0 flex-col border bg-card transition-colors',
            i === 0 ? 'items-start' : 'items-end text-right',
            s.head,
            thrower === i && 'border-primary bg-primary text-primary-foreground shadow-md'
          )}
        >
          <span className={cn('flex w-full min-w-0 items-center gap-1.5', i === 1 && 'flex-row-reverse')}>
            <span className={cn('truncate font-medium', s.name)}>{player.name}</span>
            {player.legs != null && (
              <span
                aria-label={`${player.legs} ${t('match.legs')}`}
                className={cn('shrink-0 rounded-md font-display font-semibold leading-tight tabular-nums', s.legs, thrower === i ? 'bg-black/15' : 'bg-muted text-muted-foreground')}
              >
                {player.legs}
              </span>
            )}
          </span>
          <span className={cn('font-display font-semibold leading-[0.9] tabular-nums', s.points)} aria-label={`${player.points} ${t('common.points')}`}>
            {player.points}
          </span>
        </div>
      ))}
      <span style={{ gridColumn: 2, gridRow: 1 }} />

      {CRICKET_ROWS.map((n) => {
        const counts = [markCount(marks?.[0], n), markCount(marks?.[1], n)];
        const closed = counts.map((c) => c >= 3);
        const isDead = closed[0] && closed[1];
        const label = n === 25 ? t('cricket.board.bullShort') : n;
        const markCell = (i) => (
          <span
            className={cn(
              'flex items-center border-b border-border/60',
              i === 0 ? 'justify-end pr-2' : 'justify-start pl-2',
              s.row,
              isDead ? 'text-muted-foreground/50' : closed[i] ? 'text-primary' : 'text-foreground'
            )}
          >
            <MarkGlyph count={counts[i]} className={s.glyph} />
          </span>
        );
        return (
          <React.Fragment key={n}>
            {markCell(0)}
            <span
              className={cn(
                'flex items-center justify-center border-b border-border/60 font-display uppercase leading-none tabular-nums',
                s.row,
                s.number,
                isDead ? 'text-muted-foreground/60 line-through decoration-2' : closed[0] || closed[1] ? 'font-bold' : 'font-medium text-muted-foreground'
              )}
            >
              {label}
            </span>
            {markCell(1)}
          </React.Fragment>
        );
      })}
    </div>
  );
}

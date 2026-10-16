import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { CheckoutRoute, LegPips } from '../shared/DartsAccents';
import { cn } from '@/lib/utils';

// One player's column on the live scoreboard: name, legs, the big remaining
// score, checkout suggestion, the darts of the last visit and the stats line.
function PlayerColumn({ player, isActive, isBusting, legsToWin }) {
  const { t } = useLanguage();
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 transition-colors short:p-2',
        // Filled, not just outlined: the thrower has to be obvious from the oche.
        isActive && 'border-primary bg-primary text-primary-foreground shadow-md',
        isBusting && 'border-destructive bg-destructive text-white'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{player.name}</span>
        <LegPips
          won={player.legs}
          total={legsToWin}
          label={`${player.legs} ${t('match.legs')}`}
          className={isActive || isBusting ? undefined : 'text-primary'}
        />
      </div>
      <div className="font-display text-7xl font-semibold leading-[0.85] short:text-6xl">{player.score}</div>
      {player.checkout && (
        <CheckoutRoute
          route={player.checkout}
          chipClassName={isActive || isBusting ? 'bg-black/15 text-inherit dark:bg-black/25 dark:text-inherit' : undefined}
        />
      )}
      {player.throws.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {player.throws.map((label, idx) => (
            <Badge key={idx} variant="outline" className={cn('min-w-8 px-1.5 text-[11px] tabular-nums', (isActive || isBusting) && 'border-current/40 text-inherit')}>{label}</Badge>
          ))}
        </div>
      )}
      <span className={cn('text-xs tabular-nums', isActive || isBusting ? 'opacity-85' : 'text-muted-foreground')}>
        {t('match.average')} {player.average} · {t('match.darts')} {player.legDarts}
      </span>
    </div>
  );
}

// Two equal columns, phone-first. `players` is [{ name, legs, score, checkout,
// throws, average, legDarts }, ...]; the active column is filled with the
// primary colour, the busting one flashes red (timing owned by the caller).
export function Scoreboard({ players, currentPlayer, bustingPlayer, legsToWin }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player, idx) => (
        <PlayerColumn key={idx} player={player} legsToWin={legsToWin} isActive={currentPlayer === idx} isBusting={bustingPlayer === idx} />
      ))}
    </div>
  );
}

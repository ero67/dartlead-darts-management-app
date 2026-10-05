import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// One player's column on the live scoreboard: name, legs, the big remaining
// score, checkout suggestion, the darts of the last visit and the stats line.
function PlayerColumn({ player, isActive, isBusting }) {
  const { t } = useLanguage();
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 transition-colors',
        isActive && 'ring-1 ring-primary',
        isBusting && 'ring-1 ring-destructive bg-destructive/10'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{player.name}</span>
        <Badge variant="secondary" className="tabular-nums">{player.legs}</Badge>
      </div>
      <div className="text-6xl font-semibold leading-none tracking-tight tabular-nums">{player.score}</div>
      {player.checkout && (
        <Badge className="max-w-full truncate bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 tabular-nums">{player.checkout.join(' → ')}</Badge>
      )}
      {player.throws.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {player.throws.map((label, idx) => (
            <Badge key={idx} variant="outline" className="min-w-8 px-1.5 text-[11px] tabular-nums">{label}</Badge>
          ))}
        </div>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">
        {t('match.average')} {player.average} · {t('match.darts')} {player.legDarts}
      </span>
    </div>
  );
}

// Two equal columns, phone-first. `players` is [{ name, legs, score, checkout,
// throws, average, legDarts }, ...]; the active column gets the primary ring,
// the busting one flashes red (timing owned by the caller).
export function Scoreboard({ players, currentPlayer, bustingPlayer }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player, idx) => (
        <PlayerColumn key={idx} player={player} isActive={currentPlayer === idx} isBusting={bustingPlayer === idx} />
      ))}
    </div>
  );
}

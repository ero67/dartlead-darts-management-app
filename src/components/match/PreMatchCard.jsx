import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { usePlayerHistories, strengthsOf } from '../../hooks/usePlayerStrengths';
import { matchWinProbability } from '../../lib/winProbability';
import { preMatchFacts } from '../../utils/preMatch';
import { formatChance } from '../../utils/upsets';

// Tale of the tape before a match: form rating, last five results,
// head-to-head and win chance, player 1 left in green, player 2 right in
// amber. Pass `histories` when the caller already has them (TV); otherwise
// it loads them itself (match start dialog). `size` "tv" is for the wall.
export function PreMatchCard({ player1, player2, legsToWin = 3, histories: given, size = 'compact', className }) {
  const { t } = useLanguage();
  const loaded = usePlayerHistories(given ? [] : [player1?.id, player2?.id]);
  const histories = given || loaded;
  const strengths = strengthsOf(histories);
  const s1 = strengths[player1?.id];
  const s2 = strengths[player2?.id];
  if (!s1 && !s2) return null;

  const { form, headToHead } = preMatchFacts(player1?.id, player2?.id, histories);
  const chance = matchWinProbability(s1, s2, { legsToWin });
  const isTv = size === 'tv';
  const value = cn('font-display font-semibold tabular-nums', isTv ? 'text-3xl' : 'text-xl');

  const formDots = (results, alignRight) => (
    <span className={cn('flex gap-1', alignRight && 'justify-end')}>
      {results.length === 0 ? <span className="text-muted-foreground">–</span> : results.map((won, i) => (
        <span
          key={i}
          className={cn('grid place-items-center rounded-full font-semibold', isTv ? 'size-7 text-sm' : 'size-5 text-[10px]',
            won ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200')}
        >
          {won ? t('playerProfile.formWin') : t('playerProfile.formLoss')}
        </span>
      ))}
    </span>
  );
  const row = (label, left, right) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <span className="min-w-0">{left}</span>
      <span className={cn('text-center uppercase tracking-wider text-muted-foreground', isTv ? 'text-xs' : 'text-[10px]')}>{label}</span>
      <span className="min-w-0 text-right">{right}</span>
    </div>
  );

  return (
    <div className={cn('flex flex-col', isTv ? 'gap-3' : 'gap-2', className)}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
        <span className={cn('truncate font-semibold text-primary', isTv ? 'text-2xl' : 'text-base')}>{player1?.name}</span>
        <span className="text-muted-foreground">vs</span>
        <span className={cn('truncate text-right font-semibold text-amber-600 dark:text-amber-400', isTv ? 'text-2xl' : 'text-base')}>{player2?.name}</span>
      </div>
      {row(t('playerProfile.formRating'), <span className={value}>{s1 ? s1.toFixed(1) : '–'}</span>, <span className={value}>{s2 ? s2.toFixed(1) : '–'}</span>)}
      {row(t('preMatch.lastFive'), formDots(form[0], false), formDots(form[1], true))}
      {headToHead[0] + headToHead[1] > 0 && row(t('preMatch.headToHead'), <span className={value}>{headToHead[0]}</span>, <span className={value}>{headToHead[1]}</span>)}
      {chance !== null && (
        <div className="flex flex-col gap-1">
          <div className={cn('flex justify-between tabular-nums', isTv ? 'text-lg' : 'text-sm')}>
            <span className="font-semibold">{formatChance(chance)}</span>
            <span className={cn('uppercase tracking-wider text-muted-foreground', isTv ? 'text-xs' : 'text-[10px]')}>{t('tv.winChance')}</span>
            <span className="font-semibold">{formatChance(1 - chance)}</span>
          </div>
          <span className={cn('flex gap-1', isTv ? 'h-2' : 'h-1.5')}>
            <span className="rounded-full bg-primary" style={{ flex: Math.max(chance, 0.02) }} />
            <span className="rounded-full bg-amber-500" style={{ flex: Math.max(1 - chance, 0.02) }} />
          </span>
        </div>
      )}
    </div>
  );
}

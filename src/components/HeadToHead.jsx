import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Loader } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { leagueService } from '../services/leagueService';
import { matchWinProbability } from '../lib/winProbability';
import { cn } from '@/lib/utils';

// shadcn Select items need a non-empty value; '' (nobody picked) maps to this.
const NONE = '__none';

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// Mirrored bar: left share in primary, right share in amber (the two sides' colours throughout).
function StatBar({ label, left, right, format = (v) => v }) {
  const isLeftAhead = left >= right;
  const isRightAhead = right >= left;
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
      <span className={cn('font-display text-2xl font-bold tabular-nums', !isLeftAhead && 'text-muted-foreground')}>{format(left)}</span>
      <div className="flex flex-col gap-1.5">
        <span className="text-center text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <div className="flex h-2 gap-1">
          <span className="rounded-full bg-primary" style={{ flex: Math.max(left, 0.1) }} />
          <span className="rounded-full bg-amber-500" style={{ flex: Math.max(right, 0.1) }} />
        </div>
      </div>
      <span className={cn('text-right font-display text-2xl font-bold tabular-nums', !isRightAhead && 'text-muted-foreground')}>{format(right)}</span>
    </div>
  );
}

export function HeadToHead({ leagueId, players }) {
  const { t } = useLanguage();
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      setStats(null);
      return;
    }
    let isCurrent = true;
    setIsLoading(true);
    leagueService.getHeadToHead(leagueId, player1Id, player2Id)
      .then(data => { if (isCurrent) setStats(data || { matches: 0 }); })
      .catch(() => { if (isCurrent) setStats(null); })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [leagueId, player1Id, player2Id]);

  const handleSwap = () => {
    setPlayer1Id(player2Id);
    setPlayer2Id(player1Id);
  };

  const player1 = players.find(p => p.id === player1Id);
  const player2 = players.find(p => p.id === player2Id);
  const oneDecimal = (v) => (v == null ? '–' : v.toFixed(1));
  const percent = (v) => `${Math.round(v)}%`;
  const winChance = stats ? matchWinProbability(stats.p1Avg, stats.p2Avg) : null;
  const stageLabel = (m) => (m.isPlayoff ? t('management.playoffs') : t('management.groups'));

  const renderPlayerSelect = (id, value, onChange, label) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('leagues.selectPlayer')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('leagues.selectPlayer')}</SelectItem>
          {players.map(p => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderSide = (player, isRight) => (
    <div className={cn('flex min-w-0 items-center gap-3', isRight && 'flex-row-reverse text-right')}>
      <span className={cn('hidden size-14 shrink-0 place-items-center rounded-full text-lg font-bold sm:grid', isRight ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-primary/20 text-primary')}>
        {initials(player?.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-xl font-bold leading-none sm:text-3xl">{player?.name}</span>
        {player?.rank && <span className="text-xs text-muted-foreground sm:text-sm">{t('leagues.leagueRank', { rank: player.rank })}</span>}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
        {renderPlayerSelect('h2h-player', player1Id, setPlayer1Id, t('leagues.player'))}
        <Button variant="outline" size="icon" onClick={handleSwap} aria-label={t('leagues.swapPlayers')} title={t('leagues.swapPlayers')}>
          <ArrowLeftRight />
        </Button>
        {renderPlayerSelect('h2h-opponent', player2Id, setPlayer2Id, t('management.opponent'))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader className="size-4 animate-spin" />
        </div>
      )}

      {stats && !isLoading && stats.matches === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('leagues.noH2HMatches')}</p>
      )}

      {stats && !isLoading && stats.matches > 0 && (
        <>
          <Card className="gap-6 bg-gradient-to-r from-primary/10 via-card via-40% to-amber-500/10 px-4 py-6 sm:px-8">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
              {renderSide(player1, false)}
              <div className="flex flex-col items-center leading-none">
                <span className="font-display text-5xl font-bold tabular-nums sm:text-7xl">
                  {stats.p1Wins}<span className="text-muted-foreground/40"> – </span>{stats.p2Wins}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{t('leagues.matchesWon')}</span>
              </div>
              {renderSide(player2, true)}
            </div>
            <div className="flex flex-col gap-3.5">
              {winChance !== null && (
                <StatBar label={t('leagues.winChance')} left={winChance * 100} right={(1 - winChance) * 100} format={percent} />
              )}
              <StatBar label={t('management.legsWon')} left={stats.p1Legs} right={stats.p2Legs} />
              <StatBar label={t('leagues.avgAgainst')} left={stats.p1Avg} right={stats.p2Avg} format={oneDecimal} />
              <StatBar label={t('practice.stats.oneEighties')} left={stats.p1OneEighties} right={stats.p2OneEighties} />
              <StatBar label={t('playerProfile.highestCheckout')} left={stats.p1HighestCheckout} right={stats.p2HighestCheckout} />
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <h3 className="border-b px-4 py-3.5 text-[15px] font-semibold">{t('leagues.everyMeeting')}</h3>
            {stats.meetings.map(m => {
              const isP1Win = m.winnerId === player1Id;
              const isP2Win = m.winnerId === player2Id;
              return (
                <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <span className="col-span-3 flex min-w-0 flex-col leading-tight sm:col-span-1">
                    <span className="truncate font-medium">{m.tournamentName}</span>
                    <span className="text-xs text-muted-foreground">{stageLabel(m)}</span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground sm:text-sm">
                    {t('playerProfile.avgShort')} <b className="text-foreground tabular-nums">{oneDecimal(m.p1Avg)}</b>
                  </span>
                  <span className="flex justify-center gap-1.5 font-display text-2xl font-bold tabular-nums">
                    <span className={cn(isP1Win ? 'text-primary' : 'text-muted-foreground')}>{m.p1Legs}</span>
                    <span className="text-muted-foreground/40">:</span>
                    <span className={cn(isP2Win ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{m.p2Legs}</span>
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    {t('playerProfile.avgShort')} <b className="text-foreground tabular-nums">{oneDecimal(m.p2Avg)}</b>
                  </span>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

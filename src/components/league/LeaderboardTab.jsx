import React from 'react';
import { Trophy, RefreshCw, Plus } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '../shared/EmptyState';
import { FormDots } from '../shared/DartsAccents';
import { PlayerLink } from './PlayerLink';
import { EndSeasonDialog, PastSeasons } from './Seasons';
import { currentSeasonName } from '../../utils/leagueSeason';
import { cn } from '@/lib/utils';

// Rank and name stay put while the other columns scroll under them on phones.
// Solid background so nothing shows through; on hover the same tint the row
// gets (muted/50), mixed into the card colour so it stays opaque.
const PINNED = 'sticky z-10 bg-card group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]';

export function LeaderboardTab({ league, isManager, isRecalculating, onRecalculate, onSeasonChanged, onCreateTournament }) {
  const { t } = useLanguage();
  const leaderboard = league.leaderboard || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{t('leagues.leaderboard')}</h2>
          <span className="text-sm text-muted-foreground">{currentSeasonName(league, t)}</span>
        </div>
        {isManager && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={isRecalculating} onClick={onRecalculate} title={t('leagues.recalculate')}>
              <RefreshCw className={cn(isRecalculating && 'animate-spin')} />
              {isRecalculating ? t('common.loading') : t('leagues.recalculate')}
            </Button>
            {leaderboard.length > 0 && <EndSeasonDialog league={league} onEnded={onSeasonChanged} />}
          </div>
        )}
      </div>

      {leaderboard.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {leaderboard.slice(0, 3).map((entry, index) => (
            <Card
              key={entry.player?.id || index}
              className={cn('flex-row items-center gap-4 px-5 py-4', index === 0 && 'border-primary/30 bg-primary/5')}
            >
              <span className={cn('font-display text-5xl font-semibold leading-none', index === 0 ? 'text-primary' : 'text-muted-foreground/60')}>
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <PlayerLink player={entry.player} className="truncate text-left" />
                <FormDots results={entry.last5 || []} />
              </div>
              <div className="flex flex-col items-end leading-none">
                <span className="font-display text-3xl font-semibold">{entry.totalPoints || 0}</span>
                <span className="text-xs text-muted-foreground">{t('leagues.points')}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {leaderboard.length > 0 ? (
        <Card className="overflow-x-auto py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(PINNED, 'left-0 w-12 min-w-12')}>#</TableHead>
                <TableHead className={cn(PINNED, 'left-12')}>{t('leagues.player')}</TableHead>
                <TableHead className="text-right">{t('leagues.points')}</TableHead>
                <TableHead className="text-right">{t('leagues.legs')}</TableHead>
                <TableHead className="text-right">{t('tournaments.title')}</TableHead>
                <TableHead className="text-right">{t('leagues.best')}</TableHead>
                <TableHead className="text-right">{t('leagues.avgPlacement')}</TableHead>
                <TableHead>{t('leagues.form')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((entry, index) => {
                const rank = index + 1;
                return (
                  <TableRow key={entry.player?.id || index} className="group">
                    <TableCell className={cn(PINNED, 'left-0 min-w-12 font-display text-lg font-semibold', rank <= 3 ? 'text-primary' : 'text-muted-foreground')}>
                      {rank}
                    </TableCell>
                    <TableCell className={cn(PINNED, 'left-12')}><PlayerLink player={entry.player} /></TableCell>
                    <TableCell className="text-right font-display text-lg font-semibold">{entry.totalPoints || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.legsWon}:{entry.legsLost}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.tournamentsPlayed || 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.bestPlacement || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.avgPlacement ? entry.avgPlacement.toFixed(1) : '-'}</TableCell>
                    <TableCell><FormDots results={entry.last5 || []} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          icon={Trophy}
          title={t(league.seasons?.length ? 'leagues.newSeasonEmpty' : 'leagues.noResultsYet')}
        >
          {isManager && onCreateTournament && (
            <Button onClick={() => onCreateTournament(league)}>
              <Plus />
              {t('leagues.createTournament')}
            </Button>
          )}
        </EmptyState>
      )}

      <PastSeasons league={league} isManager={isManager} onChanged={onSeasonChanged} />
    </div>
  );
}

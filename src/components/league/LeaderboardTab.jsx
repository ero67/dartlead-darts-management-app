import React from 'react';
import { Trophy, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '../shared/EmptyState';
import { FormDots } from '../shared/DartsAccents';
import { PlayerLink } from './PlayerLink';
import { cn } from '@/lib/utils';

export function LeaderboardTab({ league, isManager, isRecalculating, onRecalculate }) {
  const { t } = useLanguage();
  const leaderboard = league.leaderboard || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t('leagues.leaderboard')}</h2>
        {isManager && (
          <Button variant="outline" size="sm" disabled={isRecalculating} onClick={onRecalculate} title={t('leagues.recalculate')}>
            <RefreshCw className={cn(isRecalculating && 'animate-spin')} />
            {isRecalculating ? t('common.loading') : t('leagues.recalculate')}
          </Button>
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
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('leagues.player')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('leagues.form')}</TableHead>
                <TableHead className="text-right">{t('leagues.points')}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t('leagues.legs')}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t('tournaments.title')}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t('leagues.best')}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t('leagues.avgPlacement')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((entry, index) => {
                const rank = index + 1;
                return (
                  <TableRow key={entry.player?.id || index}>
                    <TableCell className={cn('font-display text-lg font-semibold', rank <= 3 ? 'text-primary' : 'text-muted-foreground')}>
                      {rank}
                    </TableCell>
                    <TableCell><PlayerLink player={entry.player} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <FormDots results={entry.last5 || []} />
                    </TableCell>
                    <TableCell className="text-right font-display text-lg font-semibold">{entry.totalPoints || 0}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{entry.legsWon}:{entry.legsLost}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{entry.tournamentsPlayed || 0}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{entry.bestPlacement || '-'}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{entry.avgPlacement ? entry.avgPlacement.toFixed(1) : '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState icon={Trophy} title={t('leagues.noResultsYet')} />
      )}
    </div>
  );
}

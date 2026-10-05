import React from 'react';
import { Trophy, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '../shared/EmptyState';
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
                    <TableCell className="tabular-nums">
                      {rank <= 3 ? (
                        <Badge variant={rank === 1 ? 'default' : 'secondary'} className="tabular-nums">{rank}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{rank}</span>
                      )}
                    </TableCell>
                    <TableCell><PlayerLink player={entry.player} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex gap-1">
                        {(entry.last5 || []).map((win, i) => (
                          <span key={i} className={cn('size-2 rounded-full', win ? 'bg-primary' : 'bg-border')} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{entry.totalPoints || 0}</TableCell>
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

import React from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExportMenu } from '../ExportMenu';
import { EmptyState } from '../shared/EmptyState';
import { cn } from '@/lib/utils';

export function StandingsTab({ tournament, uniqueGroups, defaultQualifierIdSet, standingsRef, renderPlayerLink, t }) {
  const playoffsEnabled = tournament?.playoffSettings?.enabled !== false;
  const num = 'text-right tabular-nums';

  // Highlight the players who actually qualify under the configured mode
  // (per group or best N overall) — not a fixed per-group count.
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t('management.groupStandings')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {playoffsEnabled && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-600 dark:bg-green-400" />
                {t('management.qualifies')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/50" />
                {t('management.eliminated')}
              </span>
            </div>
          )}
          <ExportMenu tournament={tournament} imageTarget={standingsRef} imageSuffix="standings" />
        </div>
      </div>

      <div ref={standingsRef} className="bg-background">
        {uniqueGroups && uniqueGroups.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {uniqueGroups.map(group => {
              const standings = group.standings || [];
              const hasData = standings.length > 0;
              const qualifyCount = standings.filter(st => defaultQualifierIdSet.has(st.player?.id)).length;
              return (
                <Card key={group.id} className="gap-3 py-4">
                  <CardHeader className="flex items-center gap-2 px-4">
                    <Trophy className="size-4 text-muted-foreground" />
                    <h3 className="text-base font-semibold">{group.name}</h3>
                    {hasData && (
                      <span className="text-sm text-muted-foreground tabular-nums">{standings.length} {t('common.players')}</span>
                    )}
                  </CardHeader>
                  <CardContent className="px-2">
                    {hasData ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">{t('management.pos')}</TableHead>
                            <TableHead>{t('management.player')}</TableHead>
                            <TableHead className={num} title={t('management.played')}>{t('management.played')}</TableHead>
                            <TableHead className={num} title={t('management.won')}>{t('management.won')}</TableHead>
                            <TableHead className={num} title={t('management.lost')}>{t('management.lost')}</TableHead>
                            <TableHead className={num}>{t('management.legsWL')}</TableHead>
                            <TableHead className={num}>{t('management.legsDiff')}</TableHead>
                            <TableHead className={num}>{t('management.avg')}</TableHead>
                            <TableHead className={num}>{t('management.pts')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {standings.map((standing, index) => {
                            const rank = index + 1;
                            const isQualify = playoffsEnabled && defaultQualifierIdSet.has(standing.player?.id);
                            const isEliminated = playoffsEnabled && !isQualify;
                            const isCutLine = playoffsEnabled && rank === qualifyCount && standings.length > qualifyCount;
                            const legDiff = standing.legsWon - standing.legsLost;
                            return (
                              <TableRow
                                key={standing.player.id}
                                className={cn(isEliminated && 'text-muted-foreground', isCutLine && 'border-b-2 border-dashed border-primary')}
                              >
                                <TableCell className="tabular-nums">
                                  {isQualify ? <Badge className="size-6 justify-center rounded-full p-0">{rank}</Badge> : rank}
                                </TableCell>
                                <TableCell className="font-medium">{renderPlayerLink(standing.player)}</TableCell>
                                <TableCell className={num}>{standing.matchesPlayed}</TableCell>
                                <TableCell className={cn(num, 'font-medium')}>{standing.matchesWon}</TableCell>
                                <TableCell className={num}>{standing.matchesLost}</TableCell>
                                <TableCell className={num}>{standing.legsWon}:{standing.legsLost}</TableCell>
                                <TableCell className={cn(num, legDiff >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400')}>
                                  {legDiff > 0 ? '+' : ''}{legDiff}
                                </TableCell>
                                <TableCell className={num}>{standing.average.toFixed(1)}</TableCell>
                                <TableCell className={cn(num, 'font-semibold')}>{standing.points}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('management.noMatchesPlayedYet')}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Trophy} title={t('management.noGroupsYet')} />
        )}
      </div>
    </div>
  );
}

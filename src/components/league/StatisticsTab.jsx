import React from 'react';
import { BarChart3, Trophy, Target, Zap, Hash } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '../shared/EmptyState';
import { PlayerLink } from './PlayerLink';

function StatTable({ title, icon, rows, valueFn, detailFn }) {
  const { t } = useLanguage();
  if (!rows.length) return null;
  return (
    <Card className="gap-2 pb-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-6">#</TableHead>
              <TableHead>{t('leagues.statPlayer')}</TableHead>
              <TableHead className="text-right">{t('leagues.statValue')}</TableHead>
              <TableHead className="hidden pr-6 sm:table-cell">{t('leagues.statDetails')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={row.player?.id || idx}>
                <TableCell className="pl-6 tabular-nums">
                  {idx < 3 ? (
                    <Badge variant={idx === 0 ? 'default' : 'secondary'} className="tabular-nums">{idx + 1}</Badge>
                  ) : (
                    <span className="text-muted-foreground">{idx + 1}</span>
                  )}
                </TableCell>
                <TableCell><PlayerLink player={row.player} /></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{valueFn(row)}</TableCell>
                <TableCell className="hidden pr-6 text-sm text-muted-foreground sm:table-cell">{detailFn(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function StatisticsTab({ leagueStats, loadingStats }) {
  const { t } = useLanguage();
  const vsDetail = (r) => `${t('leagues.statVs')} ${r.opponent} · ${r.tournamentName}`;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t('leagues.leagueStatistics')}</h2>

      {loadingStats && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('leagues.loadingStatistics')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        </div>
      )}

      {!loadingStats && leagueStats && (() => {
        const hasAny = leagueStats.most180s.length > 0 || leagueStats.bestCheckouts.length > 0 || leagueStats.bestMatchAverages.length > 0 || leagueStats.fewestDartsLegs.length > 0;
        if (!hasAny) {
          return <EmptyState icon={BarChart3} title={t('leagues.noStatisticsYet')} />;
        }
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <StatTable title={t('leagues.most180s')} icon={<Trophy className="size-4 text-muted-foreground" />} rows={leagueStats.most180s} valueFn={r => r.count} detailFn={() => ''} />
            <StatTable title={t('leagues.bestCheckouts')} icon={<Target className="size-4 text-muted-foreground" />} rows={leagueStats.bestCheckouts} valueFn={r => r.highest} detailFn={vsDetail} />
            <StatTable title={t('leagues.bestMatchAverages')} icon={<Zap className="size-4 text-muted-foreground" />} rows={leagueStats.bestMatchAverages} valueFn={r => r.average.toFixed(1)} detailFn={vsDetail} />
            <StatTable title={t('leagues.fewestDartsLegs')} icon={<Hash className="size-4 text-muted-foreground" />} rows={leagueStats.fewestDartsLegs} valueFn={r => `${r.darts} ${t('leagues.statDarts')}`} detailFn={vsDetail} />
          </div>
        );
      })()}
    </div>
  );
}

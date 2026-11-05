import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HIGH_SCORE_BANDS, cricketPlayerRecords } from '../../utils/dartStats';
import { x01Leaderboards } from '../../utils/tournamentStats';
import { isCricketGame } from '../../lib/cricket';
import { MprInfo } from '../cricket/MprInfo';

function RankCell({ index }) {
  return (
    <TableCell className="tabular-nums">
      {index === 0 ? <Badge className="size-6 justify-center rounded-full p-0">1</Badge> : <span className="text-muted-foreground">{index + 1}</span>}
    </TableCell>
  );
}

function StatCard({ title, children, isEmpty, t }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {isEmpty ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t('management.noStatisticsYet')}</p>
        ) : children}
      </CardContent>
    </Card>
  );
}

function StatisticsHeading({ t }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <BarChart3 className="size-5 text-muted-foreground" />
      {t('management.statistics')}
    </h2>
  );
}

// Cricket leaderboards: best match MPR, fewest darts to win a leg, best visits.
function CricketStatistics({ matches, renderPlayerLink, t }) {
  const records = [...cricketPlayerRecords(matches).values()];
  const bestMpr = records.filter(r => r.bestMatch).sort((a, b) => b.bestMatch.mpr - a.bestMatch.mpr).slice(0, 10);
  const fewestDarts = records.filter(r => r.bestLeg).sort((a, b) => a.bestLeg.darts - b.bestLeg.darts).slice(0, 10);
  const bestVisits = records.filter(r => r.bestVisit > 0)
    .sort((a, b) => b.bestVisit - a.bestVisit || b.nineMarkVisits - a.nineMarkVisits || b.fiveMarkVisits - a.fiveMarkVisits)
    .slice(0, 10);
  const num = 'text-right tabular-nums';

  return (
    <div className="flex flex-col gap-4">
      <StatisticsHeading t={t} />
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard title={t('management.bestMpr')} isEmpty={bestMpr.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}><MprInfo /></TableHead>
                <TableHead>{t('management.opponent')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bestMpr.map((entry, index) => (
                <TableRow key={`mpr-${entry.player.id}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.bestMatch.mpr.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.bestMatch.opponent?.name || t('common.unknown')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>

        <StatCard title={t('management.fewestDarts')} isEmpty={fewestDarts.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}>{t('management.darts')}</TableHead>
                <TableHead>{t('management.opponent')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fewestDarts.map((entry, index) => (
                <TableRow key={`darts-${entry.player.id}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.bestLeg.darts}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.bestLeg.opponent?.name || t('common.unknown')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>

        <StatCard title={t('management.bestVisits')} isEmpty={bestVisits.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}>{t('management.bestVisitMarks')}</TableHead>
                <TableHead className={num}>5M+</TableHead>
                <TableHead className={num}>9M</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bestVisits.map((entry, index) => (
                <TableRow key={`visit-${entry.player.id}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.bestVisit}</TableCell>
                  <TableCell className={num}>{entry.fiveMarkVisits}</TableCell>
                  <TableCell className={num}>{entry.nineMarkVisits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>
      </div>
    </div>
  );
}

export function StatisticsTab({ tournament, uniqueGroups, renderPlayerLink, t }) {
  // One game type per tournament, so a Cricket one shows only Cricket boards.
  const matches = [...(uniqueGroups || []).flatMap(g => g.matches || []), ...(tournament.playoffMatches || [])];
  if (isCricketGame(tournament?.gameType)) {
    return <CricketStatistics matches={matches} renderPlayerLink={renderPlayerLink} t={t} />;
  }

  const { bestAverages, bestCheckouts, fewestDarts, highScores, hasLegacyMatches } = x01Leaderboards(matches, { unknownName: t('common.unknown') });

  const num = 'text-right tabular-nums';

  return (
    <div className="flex flex-col gap-4">
      <StatisticsHeading t={t} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Best Averages Leaderboard */}
        <StatCard title={t('management.bestAverages')} isEmpty={bestAverages.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}>{t('management.avg')}</TableHead>
                <TableHead>{t('management.opponent')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bestAverages.map((entry, index) => (
                <TableRow key={`avg-${index}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.average.toFixed(1)}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.opponent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>

        {/* Best Checkouts Leaderboard */}
        <StatCard title={t('management.bestCheckouts')} isEmpty={bestCheckouts.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}>{t('management.checkout')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bestCheckouts.map((entry, index) => (
                <TableRow key={`checkout-${index}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.checkouts.join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>

        {/* Fewest Darts Leaderboard */}
        <StatCard title={t('management.fewestDarts')} isEmpty={fewestDarts.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                <TableHead className={num}>{t('management.darts')}</TableHead>
                <TableHead>{t('management.opponent')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fewestDarts.map((entry, index) => (
                <TableRow key={`darts-${index}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  <TableCell className={`${num} font-semibold`}>{entry.darts}</TableCell>
                  <TableCell className="text-muted-foreground">{entry.opponent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StatCard>

        {/* High scores (visits of 80+, 95+, 133+, 170+ and 180) */}
        <StatCard title={t('management.highScores')} isEmpty={highScores.length === 0} t={t}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('management.player')}</TableHead>
                {HIGH_SCORE_BANDS.map(band => (
                  <TableHead key={band} className={num}>{band === 180 ? '180' : `${band}+`}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {highScores.map((entry, index) => (
                <TableRow key={`hs-${entry.player?.id || index}`}>
                  <RankCell index={index} />
                  <TableCell className="font-medium">{renderPlayerLink(entry.player)}</TableCell>
                  {HIGH_SCORE_BANDS.map(band => (
                    <TableCell key={band} className={`${num} ${band === 180 ? 'font-semibold' : ''}`}>{entry.bands[band]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {hasLegacyMatches && <p className="px-2 pt-3 text-xs text-muted-foreground">{t('management.highScoresLegacyNote')}</p>}
        </StatCard>
      </div>
    </div>
  );
}

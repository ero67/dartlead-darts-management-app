import React from 'react';
import { BarChart3, Trophy, Target, Zap, Hash } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '../shared/EmptyState';
import { PlayerLink } from './PlayerLink';
import { cn } from '@/lib/utils';

// Fixed series order for the chart (best average first): primary, amber, grey.
const SERIES_CLASS = [
  { line: 'stroke-primary', swatch: 'bg-primary' },
  { line: 'stroke-amber-500', swatch: 'bg-amber-500' },
  { line: 'stroke-muted-foreground', swatch: 'bg-muted-foreground' },
];

// Lines live in a stretched 0-100 SVG so the plot fills any width; axis labels
// are HTML so they stay crisp at phone size. Gaps (tournaments a player skipped)
// break the line instead of bridging it.
function AverageByRoundChart({ rounds, series }) {
  const values = series.flatMap(s => s.values).filter(v => v != null);
  const lo = Math.floor((Math.min(...values) - 2) / 5) * 5;
  const hi = Math.ceil((Math.max(...values) + 2) / 5) * 5;
  const x = (i) => (rounds.length === 1 ? 50 : (i / (rounds.length - 1)) * 100);
  const y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
  const ticks = [0, 1, 2, 3].map(i => hi - ((hi - lo) * i) / 3);

  const segments = (vals) => {
    const out = [];
    let run = [];
    vals.forEach((v, i) => {
      if (v == null) { if (run.length) out.push(run); run = []; return; }
      run.push(`${x(i)},${y(v)}`);
    });
    if (run.length) out.push(run);
    return out.filter(r => r.length > 1).map(r => r.join(' '));
  };

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] grid-rows-[12rem_auto] gap-x-2 gap-y-1">
      <div className="relative text-xs tabular-nums text-muted-foreground">
        {ticks.map((v, i) => (
          <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / 3) * 100}%` }}>{Math.round(v)}</span>
        ))}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={series.map(s => s.player?.name).join(', ')}>
        {ticks.map((_, i) => (
          <line key={i} x1="0" x2="100" y1={(i / 3) * 100} y2={(i / 3) * 100} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => segments(s.values).map((points, j) => (
          <polyline
            key={`${i}-${j}`}
            points={points}
            fill="none"
            className={SERIES_CLASS[i].line}
            strokeWidth={i === 0 ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )))}
      </svg>
      <span />
      <div className="relative h-4 text-xs text-muted-foreground">
        {rounds.map((r, i) => (
          <span key={r.id} className="absolute -translate-x-1/2" style={{ left: `${x(i)}%` }} title={r.name}>R{i + 1}</span>
        ))}
      </div>
    </div>
  );
}

function StatBoard({ title, icon, rows, valueFn, detailFn, tone }) {
  if (!rows.length) return null;
  const [top, ...rest] = rows;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={cn('flex flex-col gap-1 border-b px-4 py-4', tone === 'live' && 'bg-live/5', tone === 'primary' && 'bg-primary/5', tone === 'muted' && 'bg-muted/40')}>
        <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest', tone === 'live' ? 'text-live' : tone === 'primary' ? 'text-primary' : 'text-muted-foreground')}>
          {icon}
          {title}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="font-display text-5xl font-bold leading-none">{valueFn(top)}</span>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            <PlayerLink player={top.player} className="text-foreground" />
            {detailFn(top) && <> · {detailFn(top)}</>}
          </span>
        </span>
      </div>
      {rest.map((row, idx) => (
        <div key={row.player?.id || idx} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-4 py-2 last:border-b-0">
          <span className="font-display text-base font-bold text-muted-foreground/70">{idx + 2}</span>
          <span className="flex min-w-0 flex-col leading-tight">
            <PlayerLink player={row.player} className="truncate text-left" />
            {detailFn(row) && <span className="truncate text-xs text-muted-foreground">{detailFn(row)}</span>}
          </span>
          <span className="font-display text-2xl font-bold">{valueFn(row)}</span>
        </div>
      ))}
    </Card>
  );
}

export function StatisticsTab({ leagueStats, loadingStats }) {
  const { t } = useLanguage();
  const vsDetail = (r) => `${t('leagues.statVs')} ${r.opponent} · ${r.tournamentName}`;
  const chart = leagueStats?.averageByRound;
  const hasChart = chart && chart.rounds.length >= 2 && chart.series.length > 0;

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
          <>
            {hasChart && (
              <Card className="gap-3 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    {t('leagues.averageByRound')} <span className="font-normal text-muted-foreground">· {t('leagues.topThree')}</span>
                  </h3>
                  <span className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
                    {chart.series.map((s, i) => (
                      <span key={s.player?.id || i} className="inline-flex items-center gap-1.5">
                        <span className={cn('h-0.75 w-3.5 rounded-full', SERIES_CLASS[i].swatch)} />
                        {s.player?.name}
                      </span>
                    ))}
                  </span>
                </div>
                <AverageByRoundChart rounds={chart.rounds} series={chart.series} />
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <StatBoard title={t('leagues.bestCheckouts')} icon={<Target className="size-3.5" />} tone="live" rows={leagueStats.bestCheckouts} valueFn={r => r.highest} detailFn={vsDetail} />
              <StatBoard title={t('leagues.bestMatchAverages')} icon={<Zap className="size-3.5" />} tone="primary" rows={leagueStats.bestMatchAverages} valueFn={r => r.average.toFixed(1)} detailFn={vsDetail} />
              <StatBoard title={t('leagues.most180s')} icon={<Trophy className="size-3.5" />} tone="primary" rows={leagueStats.most180s} valueFn={r => r.count} detailFn={() => ''} />
              <StatBoard title={t('leagues.fewestDartsLegs')} icon={<Hash className="size-3.5" />} tone="muted" rows={leagueStats.fewestDartsLegs} valueFn={r => `${r.darts} ${t('leagues.statDarts')}`} detailFn={vsDetail} />
            </div>
          </>
        );
      })()}
    </div>
  );
}

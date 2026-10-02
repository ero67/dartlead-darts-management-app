import React from 'react';
import { X, BarChart3 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCloseOnBack } from '../hooks/useCloseOnBack';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HIGH_SCORE_BANDS, countHighScores, checkoutRate } from '../utils/dartStats';

// Statistics of one completed match: score hero, side-by-side comparison with
// the better side highlighted, leg-by-leg table, checkout chips. Used from the
// tournament match lists and from the player profile.
//
// `match` = { player1: {id,name}, player2: {id,name}, result: {...}, isPlayoff?,
//             tournamentName?, roundName?, groupName? }
// result comes from saveMatchResult: winner, player1Legs, player2Legs,
// player{1,2}Stats: { average, oneEighties, totalScore, totalDarts,
//   checkouts: [{leg, checkout, darts, totalDarts} | number],
//   legs: [{leg, darts, checkout, average, isWin}],
//   visitScores: [number], doubleAttempts, checkoutBasis }
// Matches played before visitScores/doubleAttempts existed show "—" for the
// high-score bands (except 180, which was always counted) and the checkout
// percentage.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const checkoutValues = (stats) => (stats?.checkouts || [])
  .map((c) => (typeof c === 'object' ? num(c?.checkout) : num(c)))
  .filter((c) => c > 0)
  .sort((a, b) => b - a);
const bestLegDarts = (stats) => {
  const wins = (stats?.legs || []).filter((l) => l?.isWin && num(l.darts) > 0).map((l) => num(l.darts));
  return wins.length ? Math.min(...wins) : null;
};
const hasVisitScores = (stats) => Array.isArray(stats?.visitScores) && stats.visitScores.length > 0;
// 180s were counted before per-visit scores were stored, so that one band can
// still be filled in for older matches; the rest are unknown.
const bandCount = (stats, bands, band) => {
  if (hasVisitScores(stats)) return bands[band];
  return band === 180 ? num(stats?.oneEighties) : null;
};

const WINNER_BADGE = 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';

export function MatchStatisticsModal({ match, onClose }) {
  // Back button closes the dialog rather than leaving the page behind it
  useCloseOnBack(!!match, onClose);
  const { t } = useLanguage();
  if (!match?.result) return null;

  const r = match.result;
  const s1 = r.player1Stats || {};
  const s2 = r.player2Stats || {};
  const p1 = match.player1?.name || t('management.player1');
  const p2 = match.player2?.name || t('management.player2');
  const p1Won = r.winner && r.winner === match.player1?.id;
  const p2Won = r.winner && r.winner === match.player2?.id;
  const hasDetails = (s1.legs?.length || s2.legs?.length || s1.totalDarts || s2.totalDarts) > 0;

  const co1 = checkoutValues(s1);
  const co2 = checkoutValues(s2);
  const cr1 = checkoutRate(s1);
  const cr2 = checkoutRate(s2);
  const bands1 = countHighScores(s1.visitScores);
  const bands2 = countHighScores(s2.visitScores);
  const bandRows = HIGH_SCORE_BANDS.map((band) => ({
    key: `band-${band}`,
    label: band === 180 ? '180' : `${band}+`,
    a: bandCount(s1, bands1, band),
    b: bandCount(s2, bands2, band),
    higherBetter: true
  }));
  const rows = [
    { key: 'average', label: t('matchStats.average'), a: num(s1.average), b: num(s2.average), fmt: (v) => v.toFixed(2), higherBetter: true },
    {
      key: 'checkoutPercent',
      label: t('matchStats.checkoutPercent'),
      a: cr1.percent, b: cr2.percent,
      fmt: (v) => `${v.toFixed(0)}%`,
      subA: cr1.attempts > 0 ? `${cr1.hits}/${cr1.attempts}` : null,
      subB: cr2.attempts > 0 ? `${cr2.hits}/${cr2.attempts}` : null,
      higherBetter: true
    },
    { key: 'highestCheckout', label: t('matchStats.highestCheckout'), a: co1[0] || 0, b: co2[0] || 0, higherBetter: true },
    { key: 'checkoutCount', label: t('matchStats.checkoutCount'), a: co1.length, b: co2.length, higherBetter: true },
    { key: 'bestLeg', label: t('matchStats.bestLeg'), a: bestLegDarts(s1), b: bestLegDarts(s2), higherBetter: false },
    { key: 'dartsThrown', label: t('matchStats.dartsThrown'), a: num(s1.totalDarts), b: num(s2.totalDarts), neutral: true },
    { key: 'pointsScored', label: t('matchStats.pointsScored'), a: num(s1.totalScore), b: num(s2.totalScore), neutral: true }
  ];

  const legCount = Math.max(s1.legs?.length || 0, s2.legs?.length || 0);
  const legs = Array.from({ length: legCount }, (_, i) => ({ l1: s1.legs?.[i], l2: s2.legs?.[i] }));

  const sideInfo = (row, side) => {
    const v = side === 'a' ? row.a : row.b;
    const o = side === 'a' ? row.b : row.a;
    const shown = v === null || v === undefined ? '—' : row.fmt ? row.fmt(v) : String(v);
    let better = false;
    if (!row.neutral && v !== null && o !== null && v !== undefined && o !== undefined && v !== o) {
      better = row.higherBetter ? v > o : v < o;
    }
    const total = num(row.a) + num(row.b);
    const pct = total > 0 ? Math.round((num(v) / total) * 100) : 0;
    const sub = side === 'a' ? row.subA : row.subB;
    return { shown, better, pct, total, sub };
  };

  const renderValue = (row, side) => {
    const { shown, better, sub } = sideInfo(row, side);
    return (
      <span className={cn('flex items-baseline gap-1 tabular-nums', side === 'b' && 'justify-end', better ? 'font-semibold' : 'text-muted-foreground')}>
        {shown}
        {sub ? <small className="text-xs font-normal text-muted-foreground">{sub}</small> : null}
      </span>
    );
  };

  const renderBar = (row) => {
    const a = sideInfo(row, 'a');
    const b = sideInfo(row, 'b');
    if (row.neutral || a.total <= 0) return null;
    return (
      <div className="flex gap-1">
        <div className="flex flex-1 justify-end">
          <div className={cn('h-1.5 rounded-full', a.better ? 'bg-primary' : 'bg-muted')} style={{ width: `${a.pct}%` }} />
        </div>
        <div className="flex flex-1">
          <div className={cn('h-1.5 rounded-full', b.better ? 'bg-primary' : 'bg-muted')} style={{ width: `${b.pct}%` }} />
        </div>
      </div>
    );
  };

  const renderCompare = (list) => (
    <div className="flex flex-col divide-y">
      {list.map((row) => (
        <div key={row.key} className="flex flex-col gap-1.5 py-2.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 text-sm">
            {renderValue(row, 'a')}
            <span className="text-center text-xs text-muted-foreground">{row.label}</span>
            {renderValue(row, 'b')}
          </div>
          {renderBar(row)}
        </div>
      ))}
    </div>
  );

  const renderCheckouts = (values, alignRight) => (
    <div className={cn('flex flex-wrap gap-1.5', alignRight && 'justify-end')}>
      {values.length
        ? values.map((c, i) => (
          <Badge key={i} variant={i === 0 ? 'default' : 'secondary'} className="tabular-nums">{c}</Badge>
        ))
        : <span className="text-sm text-muted-foreground">{t('matchStats.noCheckouts')}</span>}
    </div>
  );

  const legCell = (leg) => {
    if (!leg) return <TableCell className="text-muted-foreground">—</TableCell>;
    return (
      <TableCell className={cn('whitespace-normal tabular-nums', leg.isWin ? 'font-medium' : 'text-muted-foreground')}>
        {num(leg.darts) > 0 ? `${num(leg.darts)} ${t('matchStats.darts').toLowerCase()}` : '—'}
        {leg.average ? <span className="text-xs text-muted-foreground"> · {t('matchStats.legAvg')} {num(leg.average).toFixed(1)}</span> : null}
        {leg.isWin && num(leg.checkout) > 0 ? <span className="text-xs text-muted-foreground"> · ✓ {num(leg.checkout)}</span> : null}
      </TableCell>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto text-foreground sm:max-w-2xl"
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            {t('matchStats.title')}
          </DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('common.close', 'Close')}>
              <X />
            </Button>
          </DialogClose>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <span className={cn('truncate text-base font-semibold', !p1Won && 'text-muted-foreground')}>{p1}</span>
            {p1Won && <Badge variant="outline" className={WINNER_BADGE}>{t('matchStats.winner')}</Badge>}
          </div>
          <div className="flex items-baseline gap-2 text-4xl font-semibold tracking-tight tabular-nums">
            <span className={cn(!p1Won && 'text-muted-foreground')}>{num(r.player1Legs)}</span>
            <span className="text-muted-foreground">:</span>
            <span className={cn(!p2Won && 'text-muted-foreground')}>{num(r.player2Legs)}</span>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
            <span className={cn('truncate text-base font-semibold', !p2Won && 'text-muted-foreground')}>{p2}</span>
            {p2Won && <Badge variant="outline" className={WINNER_BADGE}>{t('matchStats.winner')}</Badge>}
          </div>
        </div>
        {(match.tournamentName || match.groupName || match.roundName || match.isPlayoff) && (
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {match.tournamentName && <span>{match.tournamentName}</span>}
            {match.groupName && <span>{match.groupName}</span>}
            {match.roundName && <span>{match.roundName}</span>}
            {!match.roundName && match.isPlayoff && <span>{t('management.playoffMatch')}</span>}
          </div>
        )}

        {!hasDetails ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('matchStats.noDetails')}</p>
        ) : (
          <>
            {renderCompare(rows)}

            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold">{t('matchStats.highScores')}</h4>
              {renderCompare(bandRows)}
            </section>

            {legs.length > 0 && (
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">{t('matchStats.legByLeg')}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">{t('matchStats.leg')}</TableHead>
                      <TableHead>{p1}</TableHead>
                      <TableHead>{p2}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legs.map(({ l1, l2 }, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        {legCell(l1)}
                        {legCell(l2)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">{t('matchStats.checkoutsOf')} · {p1}</h4>
                {renderCheckouts(co1, false)}
              </section>
              <section className="flex flex-col gap-2 sm:text-right">
                <h4 className="text-sm font-semibold">{t('matchStats.checkoutsOf')} · {p2}</h4>
                {renderCheckouts(co2, true)}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

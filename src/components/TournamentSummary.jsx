import React, { useMemo, useRef, useState } from 'react';
import { Trophy, Target, Zap, Award, Hash, Download, Loader, Medal } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { deliverFile, elementToPngBlob, exportFileName } from '../lib/exportShare';
import { isValidLegDartCount } from '../utils/dartStats';
import logo from '../assets/logo.png';

const PLACE_MEDAL_CLASS = { 1: 'text-amber-500', 2: 'text-zinc-400', 3: 'text-amber-700' };
const initials = (name) => (name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/**
 * TournamentSummary – shown automatically when a tournament is completed.
 * Displays:
 *  1. Top-3 podium (from playoff results)
 *  2. Stat award cards (best average, best checkout, most 180s, fewest darts leg)
 *  3. "Powered by DartLead" branding at the bottom
 *
 * Award cards support ties – when multiple players share the same best value
 * they are all shown inside a single card.
 */
export function TournamentSummary({ tournament }) {
  const { t } = useLanguage();
  const summaryRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handleExportImage = async () => {
    if (!summaryRef.current) return;
    setExporting(true);
    try {
      // Share sheet on Android / mobile browsers, download elsewhere.
      const blob = await elementToPngBlob(summaryRef.current, { backgroundColor: '#1e293b', padding: '1.5rem' });
      await deliverFile({
        blob,
        filename: exportFileName(tournament.name, 'summary', 'png'),
        title: tournament.name,
        text: `${tournament.name} · dartlead.app`
      });
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  // ── helpers ──────────────────────────────────────────────────────────
  const getCheckoutValue = (checkout) => {
    if (typeof checkout === 'number') return checkout;
    if (typeof checkout === 'string') {
      const parts = checkout.split('+').map(p => p.trim());
      let total = 0;
      parts.forEach(part => {
        part = part.trim();
        if (part.startsWith('T')) total += parseInt(part.substring(1)) * 3;
        else if (part.startsWith('D')) total += parseInt(part.substring(1)) * 2;
        else if (part.startsWith('S')) total += parseInt(part.substring(1));
        else { const n = parseInt(part); if (!isNaN(n)) total += n; }
      });
      return total;
    }
    return 0;
  };

  // ── Collect all completed matches ────────────────────────────────────
  const allMatches = useMemo(() => {
    const matches = [];
    const uniqueGroups = (() => {
      if (!tournament?.groups) return [];
      const seen = new Set();
      return tournament.groups.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
    })();
    uniqueGroups.forEach(group => {
      (group.matches || []).forEach(m => { if (m.status === 'completed' && m.result) matches.push(m); });
    });
    (tournament?.playoffMatches || []).forEach(m => { if (m.status === 'completed' && m.result) matches.push(m); });
    return matches;
  }, [tournament]);

  // ── Build a lookup from playoffMatches (DB source of truth) ────────
  // playoffs.rounds (JSONB) can be stale if the save raced; playoffMatches
  // always come fresh from the matches table.
  const playoffMatchMap = useMemo(() => {
    const map = new Map();
    (tournament?.playoffMatches || []).forEach(m => map.set(m.id, m));
    return map;
  }, [tournament?.playoffMatches]);

  // Helper: given a match from playoffs.rounds, return the freshest data
  // by overlaying the DB version if available.
  const getFreshMatch = (bracketMatch) => {
    if (!bracketMatch) return bracketMatch;
    const dbMatch = playoffMatchMap.get(bracketMatch.id);
    if (dbMatch) {
      return {
        ...bracketMatch,                       // keep structural flags (isThirdPlaceMatch etc.)
        status: dbMatch.status,                 // actual status from DB
        result: dbMatch.result || bracketMatch.result,
        player1: dbMatch.player1 || bracketMatch.player1,
        player2: dbMatch.player2 || bracketMatch.player2,
      };
    }
    return bracketMatch;
  };

  // ── Determine Top 3 ─────────────────────────────────────────────────
  const podium = useMemo(() => {
    const playoffs = tournament?.playoffs;
    if (!playoffs?.rounds?.length) return [];

    const rounds = playoffs.rounds;
    const finalRound = rounds[rounds.length - 1];
    if (!finalRound?.matches) return [];

    // Use structural info from rounds but overlay fresh DB results
    const finalMatch = getFreshMatch(finalRound.matches.find(m => !m.isThirdPlaceMatch));
    const thirdPlaceMatch = getFreshMatch(finalRound.matches.find(m => m.isThirdPlaceMatch));

    const result = [];

    // 1st and 2nd from the final
    if (finalMatch?.status === 'completed' && finalMatch.result) {
      const winnerId = finalMatch.result.winner;
      const first = winnerId === finalMatch.player1?.id ? finalMatch.player1 : finalMatch.player2;
      const second = winnerId === finalMatch.player1?.id ? finalMatch.player2 : finalMatch.player1;
      if (first) result.push({ place: 1, player: first });
      if (second) result.push({ place: 2, player: second });
    }

    // 3rd from 3rd-place match
    if (thirdPlaceMatch?.status === 'completed' && thirdPlaceMatch.result) {
      const winnerId = thirdPlaceMatch.result.winner;
      const third = winnerId === thirdPlaceMatch.player1?.id ? thirdPlaceMatch.player1 : thirdPlaceMatch.player2;
      if (third) result.push({ place: 3, player: third });
    } else if (!thirdPlaceMatch && rounds.length >= 2) {
      // No 3rd place match – find semifinal losers
      const semiRound = rounds[rounds.length - 2];
      if (semiRound?.matches) {
        semiRound.matches.forEach(bm => {
          const m = getFreshMatch(bm);
          if (m.status === 'completed' && m.result) {
            const loserId = m.result.winner === m.player1?.id ? m.player2?.id : m.player1?.id;
            const loser = loserId === m.player1?.id ? m.player1 : m.player2;
            if (loser) result.push({ place: 3, player: loser });
          }
        });
      }
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament]);

  // ── Compute stat awards (with tie support) ───────────────────────────
  const awards = useMemo(() => {
    const playerTotalStats = new Map();
    const playerBestAvg = new Map();
    const playerCheckouts = new Map();
    const player180s = new Map();
    const playerBestLeg = new Map();

    allMatches.forEach(match => {
      const processPlayerStats = (player, stats, opponent) => {
        if (!player?.id || !stats) return;
        const pid = player.id;

        // Tournament average accumulator
        if (!playerTotalStats.has(pid)) {
          playerTotalStats.set(pid, { player, totalScore: 0, totalDarts: 0, matchCount: 0 });
        }
        const totals = playerTotalStats.get(pid);
        totals.totalScore += stats.totalScore || 0;
        totals.totalDarts += stats.totalDarts || 0;
        totals.matchCount += 1;

        // Best single-match average
        if (stats.average > 0) {
          const existing = playerBestAvg.get(pid);
          if (!existing || stats.average > existing.average) {
            playerBestAvg.set(pid, { player, average: stats.average, opponent: opponent?.name || '?' });
          }
        }

        // Checkouts
        if (stats.checkouts?.length) {
          stats.checkouts.forEach(co => {
            const val = getCheckoutValue(co.checkout);
            if (val > 0) {
              const existing = playerCheckouts.get(pid);
              if (!existing) {
                playerCheckouts.set(pid, { player, highest: val, count: 1 });
              } else {
                existing.highest = Math.max(existing.highest, val);
                existing.count += 1;
              }
            }
          });
        }

        // 180s
        const count180 = Number(stats.oneEighties || 0);
        if (count180 > 0) {
          const existing = player180s.get(pid);
          if (!existing) {
            player180s.set(pid, { player, count: count180 });
          } else {
            existing.count += count180;
          }
        }

        // Fewest darts in a leg
        if (stats.legs?.length) {
          stats.legs.forEach(leg => {
            if (!leg?.isWin || !leg.darts) return;
            // Skip impossible dart counts (e.g. corrupt "1-dart leg").
            if (!isValidLegDartCount(leg.darts, match.startingScore)) return;
            const existing = playerBestLeg.get(pid);
            if (!existing || leg.darts < existing.darts) {
              playerBestLeg.set(pid, { player, darts: leg.darts, opponent: opponent?.name || '?' });
            }
          });
        } else if (stats.checkouts?.length) {
          stats.checkouts.forEach(co => {
            let totalDarts = co.totalDarts || co.darts;
            if ((!totalDarts || totalDarts <= 3) && stats.legAverages?.length >= co.leg) {
              const legAvg = stats.legAverages[co.leg - 1];
              if (legAvg > 0) {
                const startingScore = match.startingScore || 501;
                totalDarts = Math.round((startingScore / legAvg) * 3);
              }
            }
            // Skip impossible dart counts (corrupt data or a bad estimate).
            if (!isValidLegDartCount(totalDarts, match.startingScore)) return;
            const existing = playerBestLeg.get(pid);
            if (!existing || totalDarts < existing.darts) {
              playerBestLeg.set(pid, { player, darts: totalDarts, opponent: opponent?.name || '?' });
            }
          });
        }
      };

      processPlayerStats(match.player1, match.result?.player1Stats, match.player2);
      processPlayerStats(match.player2, match.result?.player2Stats, match.player1);
    });

    // ── Helper: find the best value AND all players who share it ──────
    const findBestWithTies = (map, valueFn, compareFn) => {
      let bestValue = null;
      let winners = [];
      map.forEach(entry => {
        const val = valueFn(entry);
        if (val === null || val === undefined) return;
        if (bestValue === null || compareFn(val, bestValue) > 0) {
          bestValue = val;
          winners = [entry];
        } else if (compareFn(val, bestValue) === 0) {
          winners.push(entry);
        }
      });
      return { bestValue, winners };
    };

    // --- Build award list ---
    const awardList = [];

    // 1. Best tournament average
    const tournAvgMap = new Map();
    playerTotalStats.forEach(({ player, totalScore, totalDarts, matchCount }) => {
      if (totalDarts > 0 && matchCount >= 1) {
        const avg = (totalScore / totalDarts) * 3;
        // Round to 1 decimal for tie comparison
        const roundedAvg = Math.round(avg * 10) / 10;
        tournAvgMap.set(player.id, { player, value: roundedAvg });
      }
    });
    {
      const { bestValue, winners } = findBestWithTies(
        tournAvgMap,
        e => e.value,
        (a, b) => a - b  // higher is better
      );
      if (bestValue !== null && winners.length > 0) {
        awardList.push({
          key: 'bestAvg',
          icon: <Target size={28} />,
          label: t('summary.bestTournamentAverage') || 'Best Tournament Average',
          players: winners.map(w => w.player),
          value: bestValue.toFixed(1),
          color: '#3b82f6'
        });
      }
    }

    // 2. Best single-match average
    {
      const matchAvgMap = new Map();
      playerBestAvg.forEach(entry => {
        const rounded = Math.round(entry.average * 10) / 10;
        matchAvgMap.set(entry.player.id, { ...entry, roundedAvg: rounded });
      });
      const { bestValue, winners } = findBestWithTies(
        matchAvgMap,
        e => e.roundedAvg,
        (a, b) => a - b
      );
      if (bestValue !== null && winners.length > 0) {
        awardList.push({
          key: 'bestMatchAvg',
          icon: <Zap size={28} />,
          label: t('summary.bestMatchAverage') || 'Best Match Average',
          players: winners.map(w => w.player),
          value: bestValue.toFixed(1),
          subtitle: winners.length === 1 ? `vs ${winners[0].opponent}` : null,
          color: '#8b5cf6'
        });
      }
    }

    // 3. Highest checkout
    {
      const { bestValue, winners } = findBestWithTies(
        playerCheckouts,
        e => e.highest,
        (a, b) => a - b
      );
      if (bestValue !== null && winners.length > 0) {
        awardList.push({
          key: 'bestCheckout',
          icon: <Award size={28} />,
          label: t('summary.highestCheckout') || 'Highest Checkout',
          players: winners.map(w => w.player),
          value: bestValue,
          color: '#10b981'
        });
      }
    }

    // 4. Most 180s
    {
      const { bestValue, winners } = findBestWithTies(
        player180s,
        e => e.count,
        (a, b) => a - b
      );
      if (bestValue !== null && winners.length > 0) {
        awardList.push({
          key: 'most180s',
          icon: <Trophy size={28} />,
          label: t('summary.most180s') || 'Most 180s',
          players: winners.map(w => w.player),
          value: bestValue,
          color: '#f59e0b'
        });
      }
    }

    // 5. Fewest darts (single leg) – lower is better
    {
      const { bestValue, winners } = findBestWithTies(
        playerBestLeg,
        e => e.darts,
        (a, b) => b - a  // lower is better, so invert comparison
      );
      if (bestValue !== null && winners.length > 0) {
        awardList.push({
          key: 'fewestDarts',
          icon: <Hash size={28} />,
          label: t('summary.fewestDartsLeg') || 'Fewest Darts (Single Leg)',
          players: winners.map(w => w.player),
          value: `${bestValue} ${t('management.darts') || 'darts'}`,
          subtitle: winners.length === 1 ? `vs ${winners[0].opponent}` : null,
          color: '#ef4444'
        });
      }
    }

    return awardList;
  }, [allMatches, t]);

  // ── Render ───────────────────────────────────────────────────────────
  const placeLabel = {
    1: t('summary.firstPlace') || '1st Place',
    2: t('summary.secondPlace') || '2nd Place',
    3: t('summary.thirdPlace') || '3rd Place',
  };

  const branding = (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <img src={logo} alt="DartLead" className="size-6" />
      <span>{t('summary.poweredBy') || 'Powered by'} <strong className="font-semibold text-foreground">DartLead</strong></span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 text-foreground">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button variant="outline" onClick={handleExportImage} disabled={exporting}>
          {exporting ? <Loader className="animate-spin" /> : <Download />}
          {exporting ? (t('summary.exporting') || 'Exporting...') : (t('summary.exportImage') || 'Export as Image')}
        </Button>
      </div>

      {/* Captured by the image export — needs its own opaque background. */}
      <div className="flex flex-col gap-6 rounded-xl bg-background" ref={summaryRef}>
        <Card>
          <CardHeader className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Trophy className="size-6" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{tournament.name}</span>
              <h2 className="text-2xl font-semibold tracking-tight">
                {podium.length > 0
                  ? (t('summary.finalStandings') || 'Final Standings')
                  : tournament.status === 'completed'
                    ? (t('summary.tournamentCompleted') || 'Tournament Completed')
                    : (t('summary.title') || 'Tournament Summary')}
              </h2>
            </div>
          </CardHeader>

          {/* Podium */}
          {podium.length > 0 && (
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {[1, 2, 3].map(place => {
                  const entries = podium.filter(p => p.place === place);
                  if (entries.length === 0) return null;
                  return entries.map((entry, idx) => (
                    <Card key={`${place}-${idx}`} className={cn('items-center gap-3 py-5 text-center', place === 1 && 'border-t-4 border-t-primary')}>
                      <Medal className={cn('size-7', PLACE_MEDAL_CLASS[place])} />
                      <Avatar size="lg">
                        <AvatarFallback className="font-semibold">{initials(entry.player?.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 px-4">
                        <span className="text-lg font-semibold">{entry.player?.name || '?'}</span>
                        <span className="text-xs text-muted-foreground">{placeLabel[place]}</span>
                      </div>
                    </Card>
                  ));
                })}
              </div>
            </CardContent>
          )}

          {podium.length === 0 && tournament.status === 'completed' && (
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('summary.noPodiumAvailable') || 'No playoff results available for podium display.'}</p>
            </CardContent>
          )}
        </Card>

        {/* Stat Awards */}
        {awards.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold tracking-tight">{t('summary.tournamentAwards') || 'Tournament Awards'}</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {awards.map(award => (
                <Card key={award.key} className="flex-row items-start gap-4 px-5 py-5">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    {award.icon}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{award.label}</span>
                    <span className="font-semibold">
                      {award.players.map((p, i) => (
                        <span key={p.id}>
                          {p.name || '?'}{i < award.players.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </span>
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{award.value}</span>
                    {award.subtitle && <span className="text-xs text-muted-foreground">{award.subtitle}</span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {awards.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('summary.noAwardsAvailable') || 'No statistics available for awards.'}</p>
        )}

        {/* Bottom branding (kept inside the captured node so exports carry it) */}
        <Card className="py-4">
          <CardFooter className="justify-center">{branding}</CardFooter>
        </Card>
      </div>
    </div>
  );
}

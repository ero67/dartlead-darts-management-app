import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isValidLegDartCount, HIGH_SCORE_BANDS, countHighScores, addHighScores } from '../../utils/dartStats';

// Helper function to get checkout value (handles both numeric and legacy string format)
const getCheckoutValue = (checkout) => {
  if (typeof checkout === 'number') {
    return checkout;
  }
  if (typeof checkout === 'string') {
    // Legacy format: parse combination string like "T20 + T20 + D25" -> 170
    const parts = checkout.split('+').map(p => p.trim());
    let total = 0;
    parts.forEach(part => {
      part = part.trim();
      if (part.startsWith('T')) {
        const num = parseInt(part.substring(1));
        total += num * 3;
      } else if (part.startsWith('D')) {
        const num = parseInt(part.substring(1));
        total += num * 2;
      } else if (part.startsWith('S')) {
        const num = parseInt(part.substring(1));
        total += num;
      } else {
        const num = parseInt(part);
        if (!isNaN(num)) total += num;
      }
    });
    return total;
  }
  return 0;
};

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

export function StatisticsTab({ tournament, uniqueGroups, renderPlayerLink, t }) {
  // Collect all statistics from completed matches
  const allAverages = [];
  const allCheckouts = [];
  const allLegs = [];
  // playerId -> { player, bands: { 80: n, 95: n, 133: n, 170: n, 180: n } }
  const playerHighScores = new Map();
  let hasLegacyMatches = false;
  const collectLegs = (playerStats, player, opponent, matchId, startingScore) => {
    if (!playerStats?.legs?.length) {
      return false;
    }
    playerStats.legs.forEach(leg => {
      if (!leg || !leg.isWin || !leg.darts) {
        return;
      }
      // Skip impossible dart counts (e.g. corrupt "1-dart leg") so they
      // never pollute the fewest-darts records.
      if (!isValidLegDartCount(leg.darts, startingScore)) {
        return;
      }
      allLegs.push({
        player,
        darts: leg.darts,
        leg: leg.leg,
        checkout: leg.checkout || null,
        matchId,
        opponent: opponent?.name || t('common.unknown')
      });
    });
    return true;
  };

  // Helper function to process a match and collect statistics
  const processMatch = (match) => {
    // Check if match is completed and has result data
    if (match.status !== 'completed') {
      return;
    }

    // Match result can be in match.result (from database JSONB) or needs to be constructed
    if (!match.result) {
      // If no result object but match is completed, skip it (data might not be loaded yet)
      console.warn('Match is completed but has no result data:', match.id);
      return;
    }

    // Debug: Log match result structure
    if (match.id && (!match.result.player1Stats?.checkouts || !match.result.player2Stats?.checkouts)) {
      console.log('Match result structure for match', match.id, ':', {
        hasPlayer1Stats: !!match.result.player1Stats,
        hasPlayer1Checkouts: !!match.result.player1Stats?.checkouts,
        player1CheckoutsCount: match.result.player1Stats?.checkouts?.length || 0,
        hasPlayer1LegAverages: !!match.result.player1Stats?.legAverages,
        player1LegAveragesCount: match.result.player1Stats?.legAverages?.length || 0,
        hasPlayer2Stats: !!match.result.player2Stats,
        hasPlayer2Checkouts: !!match.result.player2Stats?.checkouts,
        player2CheckoutsCount: match.result.player2Stats?.checkouts?.length || 0,
        hasPlayer2LegAverages: !!match.result.player2Stats?.legAverages,
        player2LegAveragesCount: match.result.player2Stats?.legAverages?.length || 0
      });
    }

    // Best averages
    if (match.result.player1Stats?.average) {
      allAverages.push({
        player: match.player1,
        average: match.result.player1Stats.average,
        matchId: match.id,
        opponent: match.player2?.name || t('common.unknown')
      });
    }
    if (match.result.player2Stats?.average) {
      allAverages.push({
        player: match.player2,
        average: match.result.player2Stats.average,
        matchId: match.id,
        opponent: match.player1?.name || t('common.unknown')
      });
    }

    // High scores per player across all matches. Matches played before the
    // per-visit scores were stored only know their 180s — those still count
    // towards the 180 column, and the note under the table explains the rest.
    const addHighScoreBands = (player, playerStats) => {
      const playerId = player?.id;
      if (!playerId || !playerStats) return;
      let entry = playerHighScores.get(playerId);
      if (!entry) {
        entry = { player, bands: countHighScores([]) };
        playerHighScores.set(playerId, entry);
      }
      if (Array.isArray(playerStats.visitScores) && playerStats.visitScores.length > 0) {
        addHighScores(entry.bands, countHighScores(playerStats.visitScores));
        return;
      }
      const oneEighties = Number(playerStats.oneEighties) || 0;
      if (Number(playerStats.totalDarts) > 0) hasLegacyMatches = true;
      entry.bands[180] += oneEighties;
    };
    addHighScoreBands(match.player1, match.result.player1Stats);
    addHighScoreBands(match.player2, match.result.player2Stats);

    // Best checkouts
    const addCheckoutEntries = (playerStats, player, opponent) => {
      if (!playerStats?.checkouts?.length) {
        return;
      }
      playerStats.checkouts.forEach(checkout => {
        if (checkout?.checkout === null || checkout?.checkout === undefined) {
          return;
        }
        // Checkout is now stored as a number, but handle legacy string format too
        const checkoutValue = getCheckoutValue(checkout.checkout);
        if (checkoutValue > 0) {
          allCheckouts.push({
            player,
            checkout: checkoutValue,
            leg: checkout.leg,
            darts: checkout.totalDarts || checkout.darts,
            matchId: match.id,
            opponent: opponent?.name || t('common.unknown')
          });
        }
      });
    };

    addCheckoutEntries(match.result.player1Stats, match.player1, match.player2);
    addCheckoutEntries(match.result.player2Stats, match.player2, match.player1);

    const player1LegsAdded = collectLegs(match.result.player1Stats, match.player1, match.player2, match.id, match.startingScore);
    const player2LegsAdded = collectLegs(match.result.player2Stats, match.player2, match.player1, match.id, match.startingScore);

    if (!player1LegsAdded && !player2LegsAdded) {
      // Fallback for legacy data without legs array
      const fallbackFromCheckouts = (playerStats, player, opponent) => {
        if (!playerStats?.checkouts?.length) return;
        playerStats.checkouts.forEach(checkout => {
          if (!checkout?.checkout) return;
          const startingScore = match.startingScore || 501;
          let totalDarts = checkout.totalDarts || checkout.darts;
          if ((!totalDarts || totalDarts <= 3) && playerStats.legAverages?.length >= checkout.leg) {
            const legAverage = playerStats.legAverages[checkout.leg - 1];
            if (legAverage > 0) {
              totalDarts = Math.round((startingScore / legAverage) * 3);
            }
          }
          // Skip impossible dart counts (corrupt data or a bad estimate).
          if (!isValidLegDartCount(totalDarts, startingScore)) return;
          allLegs.push({
            player,
            darts: totalDarts,
            leg: checkout.leg,
            checkout: checkout.checkout,
            matchId: match.id,
            opponent: opponent?.name || t('common.unknown')
          });
        });
      };
      fallbackFromCheckouts(match.result.player1Stats, match.player1, match.player2);
      fallbackFromCheckouts(match.result.player2Stats, match.player2, match.player1);
    }
  };

  // Iterate through all groups and matches - use uniqueGroups to avoid duplicates
  if (uniqueGroups && uniqueGroups.length > 0) {
    uniqueGroups.forEach(group => {
      if (group.matches) {
        group.matches.forEach(match => {
          // Process all matches in the group - they should already be filtered by the database query
          processMatch(match);
        });
      }
    });
  }

  // Iterate through playoff matches
  if (tournament.playoffMatches) {
    tournament.playoffMatches.forEach(match => {
      processMatch(match);
    });
  }

  // Sort leaderboards
  // For averages: group by player and take only the best average for each player
  const playerBestAverages = new Map();
  allAverages.forEach(entry => {
    const playerId = entry.player?.id;
    if (!playerId) return;
    const existing = playerBestAverages.get(playerId);
    if (!existing || entry.average > existing.average) {
      playerBestAverages.set(playerId, entry);
    }
  });
  const bestAverages = Array.from(playerBestAverages.values())
    .sort((a, b) => b.average - a.average)
    .slice(0, 10);

  // For checkouts: group by player and collect all checkouts above 50
  const playerCheckouts = new Map();
  allCheckouts.forEach(entry => {
    const playerId = entry.player?.id;
    if (!playerId) return;
    const checkoutValue = entry.checkout;
    if (checkoutValue > 50) {
      if (!playerCheckouts.has(playerId)) {
        playerCheckouts.set(playerId, {
          player: entry.player,
          checkouts: []
        });
      }
      const playerData = playerCheckouts.get(playerId);
      // Only add unique checkouts (avoid duplicates)
      if (!playerData.checkouts.includes(checkoutValue)) {
        playerData.checkouts.push(checkoutValue);
      }
    }
  });
  // Sort checkouts for each player in descending order
  playerCheckouts.forEach((playerData) => {
    playerData.checkouts.sort((a, b) => b - a);
  });
  const bestCheckouts = Array.from(playerCheckouts.values())
    .sort((a, b) => {
      // Sort by highest checkout first, then by number of checkouts
      const maxA = Math.max(...a.checkouts);
      const maxB = Math.max(...b.checkouts);
      if (maxB !== maxA) return maxB - maxA;
      return b.checkouts.length - a.checkouts.length;
    })
    .slice(0, 10);

  // For fewest darts: group by player and take only the best (fewest darts) for each player
  const playerBestLegs = new Map();
  allLegs.forEach(entry => {
    const playerId = entry.player?.id;
    if (!playerId) return;
    const existing = playerBestLegs.get(playerId);
    if (!existing || entry.darts < existing.darts) {
      playerBestLegs.set(playerId, entry);
    }
  });
  const fewestDarts = Array.from(playerBestLegs.values())
    .sort((a, b) => a.darts - b.darts)
    .slice(0, 10);

  // Rank on the rarest band first, then downwards.
  const rankedBands = [...HIGH_SCORE_BANDS].reverse();
  const highScores = Array.from(playerHighScores.values())
    .filter(entry => rankedBands.some(band => entry.bands[band] > 0))
    .sort((a, b) => {
      for (const band of rankedBands) {
        if (b.bands[band] !== a.bands[band]) return b.bands[band] - a.bands[band];
      }
      return 0;
    })
    .slice(0, 10);

  const num = 'text-right tabular-nums';

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <BarChart3 className="size-5 text-muted-foreground" />
        {t('management.statistics')}
      </h2>

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

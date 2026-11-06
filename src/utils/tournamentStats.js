import { isValidLegDartCount, HIGH_SCORE_BANDS, countHighScores, addHighScores } from './dartStats.js';

// X01 leaderboards for one tournament (group + playoff matches), one entry
// per player: best match average, checkouts over 50, fewest darts in a won
// leg, high-score bands. Shared by the Statistics tab and the TV stats view.

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

export function x01Leaderboards(matches, { unknownName = 'Unknown', limit = 10 } = {}) {
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
        opponent: opponent?.name || unknownName
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
    // Completed but no result object: data not loaded yet, skip it
    if (!match.result) {
      return;
    }

    // Best averages
    if (match.result.player1Stats?.average) {
      allAverages.push({
        player: match.player1,
        average: match.result.player1Stats.average,
        matchId: match.id,
        opponent: match.player2?.name || unknownName
      });
    }
    if (match.result.player2Stats?.average) {
      allAverages.push({
        player: match.player2,
        average: match.result.player2Stats.average,
        matchId: match.id,
        opponent: match.player1?.name || unknownName
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
            opponent: opponent?.name || unknownName
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
            opponent: opponent?.name || unknownName
          });
        });
      };
      fallbackFromCheckouts(match.result.player1Stats, match.player1, match.player2);
      fallbackFromCheckouts(match.result.player2Stats, match.player2, match.player1);
    }
  };

  matches.forEach(processMatch);

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
    .slice(0, limit);

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
    .slice(0, limit);

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
    .slice(0, limit);

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
    .slice(0, limit);


  return { bestAverages, bestCheckouts, fewestDarts, highScores, hasLegacyMatches };
}

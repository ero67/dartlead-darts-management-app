import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Medal } from 'lucide-react';
import { cn } from '@/lib/utils';

// Player row inside a match box: winner bold, loser muted, empty slot "TBD".
const playerRowClass = (isWinner, isLoser, isTbd) =>
  cn(
    'truncate rounded-md bg-muted/60 px-[0.5em] py-[0.3em] text-center text-[0.75em] leading-tight',
    isWinner && 'font-semibold ring-1 ring-primary',
    isLoser && 'text-muted-foreground',
    isTbd && 'italic text-muted-foreground'
  );

// `scale` enlarges the layout geometry (the TV display passes 1.6); card sizes
// are em-based off the root font-size so they grow with it, and connectors are
// measured from the DOM so they follow.
export function BracketVisualization({ rounds, playoffMatches = [], scale = 1 }) {
  const matchRefs = useRef({});
  const containerRef = useRef(null);
  const [connections, setConnections] = useState([]);
  // Callers pass rounds through mergeBracketRounds (utils/bracketView.js),
  // which already folded the match rows in and cleared next-round slots whose
  // feeder is unfinished — so the bracket entry wins and the row only fills
  // fields the entry does not define.
  const getMatchData = (match) => {
    const dbMatch = playoffMatches.find(pm => pm.id === match.id);
    if (!dbMatch) return match;
    return {
      ...match,
      player1: match.player1 !== undefined ? match.player1 : dbMatch.player1,
      player2: match.player2 !== undefined ? match.player2 : dbMatch.player2,
      result: match.result ?? dbMatch.result,
      status: match.status || dbMatch.status
    };
  };

  // Helper to get winner of a match
  const getWinner = (match) => {
    const matchData = getMatchData(match);
    if (matchData.status === 'completed' && matchData.result?.winner) {
      if (matchData.result.winner === matchData.player1?.id) {
        return matchData.player1;
      }
      if (matchData.result.winner === matchData.player2?.id) {
        return matchData.player2;
      }
    }
    return null;
  };

  // Calculate bracket structure with positions
  const bracketStructure = useMemo(() => {
    const matchHeight = 45 * scale; // Match card height
    const spacing = 30 * scale; // Much more spacing to prevent overlap
    const roundWidth = 200 * scale; // Wider to accommodate connections

    const structure = [];

    // Build structure incrementally so we can reference previous rounds
    (rounds || []).forEach((round, roundIndex) => {
      const matches = round.matches.filter(m => !m.isThirdPlaceMatch);

      let matchPositions;

      if (roundIndex === 0) {
        // First round: start from top, evenly spaced
        matchPositions = matches.map((match, matchIndex) => {
          const matchData = getMatchData(match);
          const winner = getWinner(matchData);

          const y = (matchIndex * (matchHeight + spacing)) + (matchHeight / 2);

          return {
            match,
            matchData,
            winner,
            x: roundIndex * roundWidth,
            y: y,
            matchIndex,
            roundIndex
          };
        });
      } else {
        // Subsequent rounds: center vertically relative to parent matches
        const previousRound = structure[roundIndex - 1];
        matchPositions = matches.map((match, matchIndex) => {
          const matchData = getMatchData(match);
          const winner = getWinner(matchData);

          // Find the two parent matches that feed into this match
          const parentMatch1Index = matchIndex * 2;
          const parentMatch2Index = matchIndex * 2 + 1;

          if (previousRound && parentMatch1Index < previousRound.matches.length && parentMatch2Index < previousRound.matches.length) {
            const parentMatch1 = previousRound.matches[parentMatch1Index];
            const parentMatch2 = previousRound.matches[parentMatch2Index];

            // Center this match between its two parent matches
            const y = (parentMatch1.y + parentMatch2.y) / 2;

            return {
              match,
              matchData,
              winner,
              x: roundIndex * roundWidth,
              y: y,
              matchIndex,
              roundIndex
            };
          } else {
            // Fallback: if parent matches don't exist, use even spacing
            const y = (matchIndex * (matchHeight + spacing)) + (matchHeight / 2);
            return {
              match,
              matchData,
              winner,
              x: roundIndex * roundWidth,
              y: y,
              matchIndex,
              roundIndex
            };
          }
        });
      }

      structure.push({
        round,
        matches: matchPositions,
        roundIndex
      });
    });

    return structure;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, playoffMatches, scale]);

  // Calculate connection lines based on actual DOM positions
  useEffect(() => {
    const calculateConnections = () => {
      if (!containerRef.current) return;

      const lines = [];

      for (let i = 0; i < bracketStructure.length - 1; i++) {
        const currentRound = bracketStructure[i];
        const nextRound = bracketStructure[i + 1];

        currentRound.matches.forEach((currentMatch, currentIndex) => {
          const nextMatchIndex = Math.floor(currentIndex / 2);
          if (nextMatchIndex < nextRound.matches.length) {
            const nextMatch = nextRound.matches[nextMatchIndex];
            const winner = currentMatch.winner;

            // Get actual DOM positions using refs
            const currentMatchKey = `${i}-${currentMatch.match.id || currentIndex}`;
            const nextMatchKey = `${i + 1}-${nextMatch.match.id || nextMatchIndex}`;

            const currentMatchEl = matchRefs.current[currentMatchKey];
            const nextMatchEl = matchRefs.current[nextMatchKey];

            if (currentMatchEl && nextMatchEl && containerRef.current) {
              const currentRect = currentMatchEl.getBoundingClientRect();
              const nextRect = nextMatchEl.getBoundingClientRect();
              const containerRect = containerRef.current.getBoundingClientRect();

              // Calculate positions relative to container
              const fromX = currentRect.right - containerRect.left;
              const fromY = currentRect.top + currentRect.height / 2 - containerRect.top;
              const toX = nextRect.left - containerRect.left;
              const toY = nextRect.top + nextRect.height / 2 - containerRect.top;

              // Midpoint for the vertical connector line
              const midX = fromX + ((toX - fromX) * 0.4);

              lines.push({
                fromX,
                fromY,
                toX,
                toY,
                midX,
                hasWinner: !!winner
              });
            }
          }
        });
      }

      setConnections(lines);
    };

    // Wait for DOM to render, then calculate
    const timeoutId = setTimeout(calculateConnections, 100);

    // Also recalculate on window resize
    window.addEventListener('resize', calculateConnections);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateConnections);
    };
  }, [bracketStructure, playoffMatches]);

  // Hooks above run unconditionally; the empty state returns after them.
  if (!rounds || rounds.length === 0) {
    return (
      <div className="tw p-12 text-center text-sm text-muted-foreground">
        <p>No bracket data available</p>
      </div>
    );
  }

  const maxMatches = Math.max(...rounds.map(r => r.matches.filter(m => !m.isThirdPlaceMatch).length));
  // Same geometry as the position calc above, so the container fits the scaled cards.
  const matchHeight = 45 * scale;
  const spacing = 30 * scale;
  const totalHeight = (maxMatches * matchHeight) + ((maxMatches - 1) * spacing);
  const roundWidth = 200 * scale;
  const totalWidth = rounds.length * roundWidth;

  const renderMatchBox = (matchData, winner, { key, className, ...rest } = {}) => {
    const isCompleted = matchData.status === 'completed';
    const player1Winner = winner?.id === matchData.player1?.id;
    const player2Winner = winner?.id === matchData.player2?.id;
    return (
      <div
        key={key}
        {...rest}
        className={cn('z-[2] flex w-[9em] flex-col gap-[0.2em] rounded-lg border bg-card p-[0.3em] text-card-foreground shadow-xs', className)}
      >
        <div className={playerRowClass(player1Winner, isCompleted && !player1Winner, !matchData.player1)}>
          {matchData.player1?.name || 'TBD'}
        </div>
        <div className={playerRowClass(player2Winner, isCompleted && !player2Winner, !matchData.player2)}>
          {matchData.player2?.name || 'TBD'}
        </div>
      </div>
    );
  };

  return (
    <div className="tw relative w-full overflow-x-auto py-6" ref={containerRef} style={{ fontSize: `${scale}rem` }}>
      <div className="relative z-[2] flex w-fit min-w-fit">
        {bracketStructure.map(({ round, matches, roundIndex }) => (
          <div key={round.id || roundIndex} className="flex min-w-[16.25em] shrink-0 flex-col items-start px-[1em]">
            <div className="mb-[1em] w-full border-b pb-[0.4em] text-center">
              <h4 className="text-[0.75em] font-medium uppercase tracking-wider text-muted-foreground">{round.name}</h4>
            </div>
            <div className="relative w-full min-h-[100px]" style={{ height: `${totalHeight}px` }}>
              {matches.map(({ match, matchData, winner, y, matchIndex, x }) =>
                renderMatchBox(matchData, winner, {
                  key: match.id || matchIndex,
                  ref: (el) => {
                    if (el) {
                      const matchKey = `${roundIndex}-${match.id || matchIndex}`;
                      matchRefs.current[matchKey] = el;
                    }
                  },
                  className: 'absolute',
                  style: { top: `${y - 22.5 * scale}px` },
                  'data-match-x': x,
                  'data-match-y': y,
                  'data-match-index': matchIndex,
                  'data-round-index': roundIndex
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Connection lines SVG - positioned absolutely to overlay matches */}
      {connections.length > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-[1] overflow-visible"
          style={{ width: `${totalWidth}px`, height: `${totalHeight}px`, minWidth: `${totalWidth}px` }}
        >
        {connections.map((conn, index) => (
          <g
            key={index}
            className={conn.hasWinner ? 'text-primary' : 'text-border'}
            stroke="currentColor"
            strokeWidth={conn.hasWinner ? '2.5' : '1.5'}
            strokeDasharray={conn.hasWinner ? 'none' : '4,4'}
          >
            {/* Horizontal line from match */}
            <line x1={conn.fromX} y1={conn.fromY} x2={conn.midX} y2={conn.fromY} />
            {/* Vertical line */}
            <line x1={conn.midX} y1={conn.fromY} x2={conn.midX} y2={conn.toY} />
            {/* Horizontal line to next match */}
            <line x1={conn.midX} y1={conn.toY} x2={conn.toX} y2={conn.toY} />
          </g>
        ))}
        </svg>
      )}

      {/* 3rd Place Match - shown separately below the bracket */}
      {(() => {
        // Find 3rd place match from the final round
        const finalRound = rounds[rounds.length - 1];
        const thirdPlaceMatch = finalRound?.matches?.find(m => m.isThirdPlaceMatch);

        if (!thirdPlaceMatch) return null;

        const matchData = getMatchData(thirdPlaceMatch);
        const winner = getWinner(matchData);

        return (
          <div className="mt-[2em] flex flex-col items-center gap-[0.75em] border-t border-dashed pt-[1.5em]">
            <h4 className="flex items-center gap-[0.4em] text-[0.8em] font-medium uppercase tracking-wider text-muted-foreground">
              <Medal className="size-[1.25em] text-amber-700" />
              3rd Place Match
            </h4>
            {renderMatchBox(matchData, winner, { className: 'relative w-[11em]' })}
          </div>
        );
      })()}
    </div>
  );
}

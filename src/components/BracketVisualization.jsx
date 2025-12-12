import React, { useMemo, useRef, useEffect, useState } from 'react';
import './BracketVisualization.css';

export function BracketVisualization({ rounds, playoffMatches = [] }) {
  const matchRefs = useRef({});
  const containerRef = useRef(null);
  const [connections, setConnections] = useState([]);
  if (!rounds || rounds.length === 0) {
    return (
      <div className="bracket-visualization-empty">
        <p>No bracket data available</p>
      </div>
    );
  }

  // Helper to get match data (from playoffMatches if available, otherwise from rounds)
  const getMatchData = (match) => {
    const dbMatch = playoffMatches.find(pm => pm.id === match.id);
    if (dbMatch) {
      return {
        ...match,
        player1: dbMatch.player1 || match.player1,
        player2: dbMatch.player2 || match.player2,
        result: dbMatch.result || match.result,
        status: dbMatch.status || match.status
      };
    }
    return match;
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
    const matchHeight = 45; // Match card height
    const spacing = 30; // Much more spacing to prevent overlap
    const roundWidth = 200; // Wider to accommodate connections
    
    const structure = [];
    
    // Build structure incrementally so we can reference previous rounds
    rounds.forEach((round, roundIndex) => {
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
  }, [rounds, playoffMatches]);

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

  const maxMatches = Math.max(...rounds.map(r => r.matches.filter(m => !m.isThirdPlaceMatch).length));
  const matchHeight = 45;
  const spacing = 30;
  const totalHeight = (maxMatches * matchHeight) + ((maxMatches - 1) * spacing);
  const roundWidth = 200;
  const totalWidth = rounds.length * roundWidth;
  const svgPadding = 50;

  return (
    <div className="bracket-visualization" ref={containerRef}>
      <div className="bracket-rounds-container">
        {bracketStructure.map(({ round, matches, roundIndex }) => (
          <div key={round.id || roundIndex} className="bracket-round-viz">
            <div className="bracket-round-header-viz">
              <h4>{round.name}</h4>
            </div>
            <div className="bracket-round-matches-viz" style={{ height: `${totalHeight}px` }}>
              {matches.map(({ match, matchData, winner, y, matchIndex, x }) => {
                const isCompleted = matchData.status === 'completed';
                const player1Winner = winner?.id === matchData.player1?.id;
                const player2Winner = winner?.id === matchData.player2?.id;
                
                return (
                  <div
                    key={match.id || matchIndex}
                    ref={(el) => {
                      if (el) {
                        const matchKey = `${roundIndex}-${match.id || matchIndex}`;
                        matchRefs.current[matchKey] = el;
                      }
                    }}
                    className="bracket-match-viz"
                    style={{ 
                      top: `${y - 22.5}px`
                    }}
                    data-match-x={x}
                    data-match-y={y}
                    data-match-index={matchIndex}
                    data-round-index={roundIndex}
                  >
                    <div className={`bracket-player ${player1Winner ? 'winner' : ''} ${isCompleted && !player1Winner ? 'loser' : ''} ${!matchData.player1 ? 'tbd' : ''}`}>
                      {matchData.player1?.name || 'TBD'}
                    </div>
                    <div className={`bracket-player ${player2Winner ? 'winner' : ''} ${isCompleted && !player2Winner ? 'loser' : ''} ${!matchData.player2 ? 'tbd' : ''}`}>
                      {matchData.player2?.name || 'TBD'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      {/* Connection lines SVG - positioned absolutely to overlay matches */}
      {connections.length > 0 && (
        <svg 
          className="bracket-connections-svg"
          style={{
            position: 'absolute',
            top: '2rem',
            left: '1rem',
            width: `${totalWidth}px`,
            height: `${totalHeight}px`,
            pointerEvents: 'none',
            zIndex: 1,
            minWidth: `${totalWidth}px`
          }}
        >
        {connections.map((conn, index) => (
          <g key={index}>
            {/* Horizontal line from match */}
            <line
              x1={conn.fromX}
              y1={conn.fromY}
              x2={conn.midX}
              y2={conn.fromY}
              stroke={conn.hasWinner ? "#10b981" : "#94a3b8"}
              strokeWidth={conn.hasWinner ? "2.5" : "1.5"}
              strokeDasharray={conn.hasWinner ? "none" : "4,4"}
              opacity={conn.hasWinner ? "1" : "0.6"}
            />
            {/* Vertical line */}
            <line
              x1={conn.midX}
              y1={conn.fromY}
              x2={conn.midX}
              y2={conn.toY}
              stroke={conn.hasWinner ? "#10b981" : "#94a3b8"}
              strokeWidth={conn.hasWinner ? "2.5" : "1.5"}
              strokeDasharray={conn.hasWinner ? "none" : "4,4"}
              opacity={conn.hasWinner ? "1" : "0.6"}
            />
            {/* Horizontal line to next match */}
            <line
              x1={conn.midX}
              y1={conn.toY}
              x2={conn.toX}
              y2={conn.toY}
              stroke={conn.hasWinner ? "#10b981" : "#94a3b8"}
              strokeWidth={conn.hasWinner ? "2.5" : "1.5"}
              strokeDasharray={conn.hasWinner ? "none" : "4,4"}
              opacity={conn.hasWinner ? "1" : "0.6"}
            />
          </g>
        ))}
        </svg>
      )}
    </div>
  );
}


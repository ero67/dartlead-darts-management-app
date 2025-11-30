import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Users, Trophy, Target, Wifi, WifiOff, Eye, Trash2, CheckCircle, Settings, Edit2, ChevronUp, ChevronDown } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

  // Generate unique ID for playoff matches (using crypto.randomUUID for proper UUIDs)
  const generateId = () => {
    return crypto.randomUUID();
  };

export function TournamentManagement({ tournament, onMatchStart, onBack, onDeleteTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('groups'); // 'groups', 'matches', 'standings', 'playoffs', 'statistics'
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null); // Match being edited
  const [tournamentSettings, setTournamentSettings] = useState({
    legsToWin: tournament.legsToWin || 3,
    startingScore: tournament.startingScore || 501,
    groupSettings: {
      type: 'groups',
      value: 2
    },
    standingsCriteriaOrder: tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
    playoffSettings: (() => {
      const existing = tournament.playoffSettings;
      if (existing && existing.legsToWinByRound) {
        return existing;
      }
      // Migrate old structure to new structure
      if (existing && existing.playoffLegsToWin) {
        return {
          ...existing,
          legsToWinByRound: {
            16: existing.playoffLegsToWin,
            8: existing.playoffLegsToWin,
            4: existing.playoffLegsToWin,
            2: existing.playoffLegsToWin
          }
        };
      }
      // Default new structure
      return {
        enabled: false,
        playersPerGroup: 1,
        legsToWinByRound: {
          16: 3,  // Round of 16
          8: 3,   // Quarter-finals
          4: 3,   // Semi-finals
          2: 3    // Final
        }
      };
    })()
  });
  const { isMatchLive, isMatchLiveOnThisDevice, isMatchStartedByCurrentUser, getLiveMatchInfo } = useLiveMatch();

  // Update tournamentSettings when tournament prop changes (e.g., after reload from DB)
  useEffect(() => {
    if (tournament) {
      setTournamentSettings({
        legsToWin: tournament.legsToWin || 3,
        startingScore: tournament.startingScore || 501,
        groupSettings: {
          type: 'groups',
          value: 2
        },
        standingsCriteriaOrder: tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
        playoffSettings: (() => {
          const existing = tournament.playoffSettings;
          if (existing && existing.legsToWinByRound) {
            return existing;
          }
          // Migrate old structure to new structure
          if (existing && existing.playoffLegsToWin) {
            return {
              ...existing,
              legsToWinByRound: {
                16: existing.playoffLegsToWin,
                8: existing.playoffLegsToWin,
                4: existing.playoffLegsToWin,
                2: existing.playoffLegsToWin
              }
            };
          }
          // Default new structure
          return {
            enabled: false,
            playersPerGroup: 1,
            legsToWinByRound: {
              16: 3,  // Round of 16
              8: 3,   // Quarter-finals
              4: 3,   // Semi-finals
              2: 3    // Final
            }
          };
        })()
      });
    }
  }, [tournament?.id, tournament?.standingsCriteriaOrder, tournament?.playoffSettings]);

  // Simple function to check if match exists in localStorage (started on this device)
  const isMatchInLocalStorage = (matchId) => {
    const savedState = localStorage.getItem(`match-state-${matchId}`);
    return savedState !== null;
  };

  // Enhanced function to check if match should be considered "live" (either in live context or localStorage)
  const isMatchActuallyLive = (matchId) => {
    // First check the match status - if it's completed, it's not live
    // Check both group matches and playoff matches
    const groupMatch = tournament?.groups?.flatMap(g => g.matches || []).find(m => m.id === matchId);
    const playoffMatch = tournament?.playoffMatches?.find(m => m.id === matchId);
    const match = groupMatch || playoffMatch;
    
    if (match?.status === 'completed') {
      return false;
    }
    
    // Then check if it's in the live matches context
    if (isMatchLive(matchId)) {
      return true;
    }
    
    // If not in live context, check if it exists in localStorage and is not completed
    const savedState = localStorage.getItem(`match-state-${matchId}`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Consider it live if it's not completed and has some progress
        return !parsed.matchComplete && (parsed.currentLeg > 1 || parsed.matchStarter !== null);
      } catch (error) {
        console.error('Error parsing saved match state:', error);
        return false;
      }
    }
    
    return false;
  };
  const { isAdmin, isAdminMode } = useAdmin();
  const { startPlayoffs: contextStartPlayoffs, updateTournamentSettings } = useTournament();

  // Get legs to win for a specific playoff round based on number of players in that round
  const getPlayoffLegsToWin = (roundSize) => {
    if (!tournament?.playoffSettings) {
      return 3; // Default fallback
    }
    
    // If new structure exists, use it
    if (tournament.playoffSettings.legsToWinByRound) {
      return tournament.playoffSettings.legsToWinByRound[roundSize] || 3;
    }
    
    // Fallback to old structure for backward compatibility
    if (tournament.playoffSettings.playoffLegsToWin) {
      return tournament.playoffSettings.playoffLegsToWin;
    }
    
    return 3; // Default
  };

  // Update playoff match players
  const updatePlayoffMatchPlayers = async (matchId, player1, player2) => {
    if (!tournament || !tournament.playoffs || !tournament.playoffs.rounds) return;
    
    const updatedRounds = tournament.playoffs.rounds.map(round => ({
      ...round,
      matches: round.matches.map(match => {
        if (match.id === matchId) {
          return {
            ...match,
            player1: player1,
            player2: player2,
            status: (player1 && player2) ? 'pending' : 'pending'
          };
        }
        return match;
      })
    }));

    const updatedPlayoffs = {
      ...tournament.playoffs,
      rounds: updatedRounds
    };

    try {
      await contextStartPlayoffs(updatedPlayoffs);
      setEditingMatch(null);
      alert(t('management.playoffMatchUpdated') || 'Playoff match updated successfully');
    } catch (error) {
      console.error('Error updating playoff match:', error);
      alert(t('management.failedToUpdatePlayoffMatch') || 'Failed to update playoff match');
    }
  };

  // Generate playoff rounds if they don't exist
  // Rounds should start at the appropriate level based on number of qualifiers
  // Top 8 = Quarterfinals, Top 16 = Round of 16, etc.
  const generatePlayoffRounds = useCallback((totalQualifiers) => {
    const rounds = [];
    let currentRoundSize = totalQualifiers;
    let roundNumber = 1;

    // Generate rounds from first round to final
    while (currentRoundSize > 1) {
      const round = {
        id: generateId(),
        name: getRoundName(currentRoundSize),
        matches: [],
        isComplete: false
      };

      // Create matches for this round
      for (let i = 0; i < currentRoundSize / 2; i++) {
        round.matches.push({
          id: generateId(),
          player1: null,
          player2: null,
          status: 'pending',
          result: null,
          isPlayoff: true,
          playoffRound: roundNumber,
          playoffMatchNumber: i + 1
        });
      }

      rounds.push(round);
      currentRoundSize = currentRoundSize / 2;
      roundNumber++;
    }

    return rounds;
  }, []);

  // Populate playoff bracket with qualifying players using proper seeding
  // Seeding: Best vs Worst, 2nd best vs 2nd worst, etc.
  const populatePlayoffBracket = useCallback((qualifyingPlayers, rounds) => {
    
    // If no rounds exist, generate them first
    if (!rounds || rounds.length === 0) {
      rounds = generatePlayoffRounds(qualifyingPlayers.length);
    }
    
    const updatedRounds = [...rounds];
    
    // Don't automatically populate players - let user choose via Edit button
    // Just ensure all matches have status 'pending' and no players assigned
    updatedRounds.forEach(round => {
      round.matches.forEach(match => {
        // Only reset if match doesn't already have players (preserve existing assignments)
        if (!match.player1 && !match.player2) {
          match.player1 = null;
          match.player2 = null;
          match.status = 'pending';
        }
      });
    });
    
    
    return updatedRounds;
  }, [generatePlayoffRounds]);

  // Note: Removed automatic playoff player assignment - playoffs should only start when user clicks button

  // Check if group stage is complete
  const isGroupStageComplete = () => {
    if (!tournament || !tournament.groups) return false;
    return tournament.groups.every(group => 
      group.matches.every(match => match.status === 'completed')
    );
  };

  // Get qualifying players based on group standings, sorted by performance for seeding
  const getQualifyingPlayers = () => {
    if (!tournament || !tournament.groups) return [];
    
    const allQualifyingPlayers = [];
    const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;
    const allPlayersValue = 9999; // Special value to represent "all players"
    
    tournament.groups.forEach(group => {
      if (group.standings && group.standings.length > 0) {
        // Sort standings by points (descending), then by leg difference, then by average
        const sortedStandings = [...group.standings].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const legDiffA = a.legsWon - a.legsLost;
          const legDiffB = b.legsWon - b.legsLost;
          if (legDiffB !== legDiffA) return legDiffB - legDiffA;
          return (b.average || 0) - (a.average || 0);
        });
        
        // Take top N players from each group with their position info
        // If playersPerGroup is 9999 (all players), take all players
        const topPlayers = playersPerGroup === allPlayersValue 
          ? sortedStandings 
          : sortedStandings.slice(0, playersPerGroup);
        topPlayers.forEach((standing, index) => {
          allQualifyingPlayers.push({
            player: standing.player,
            groupPosition: index + 1, // 1st, 2nd, etc. in group
            points: standing.points,
            legDifference: standing.legsWon - standing.legsLost,
            average: standing.average || 0
          });
        });
      }
    });
    
    // Sort all qualifying players by performance for seeding:
    // 1. Points (descending)
    // 2. Leg difference (descending)
    // 3. Average (descending)
    // 4. Group position (1st place in group is better than 2nd place)
    allQualifyingPlayers.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
      if (b.average !== a.average) return b.average - a.average;
      return a.groupPosition - b.groupPosition; // Lower position number is better
    });
    
    return allQualifyingPlayers.map(qp => qp.player);
  };

  // Start playoffs by populating the bracket with qualifying players
  const startPlayoffs = async () => {
    if (!tournament) return;
    
    if (!isGroupStageComplete()) {
      alert(t('management.groupStageMustBeCompleted'));
      return;
    }

    const qualifyingPlayers = getQualifyingPlayers();
    if (qualifyingPlayers.length === 0) {
      alert(t('management.noQualifyingPlayers'));
      return;
    }

    // Create updated playoffs data
    const updatedPlayoffs = {
      ...tournament.playoffs,
      qualifyingPlayers,
      currentRound: 1,
      rounds: populatePlayoffBracket(qualifyingPlayers, tournament.playoffs?.rounds || [])
    };

    // Update tournament through context (now async and saves to database)
    await contextStartPlayoffs(updatedPlayoffs);
    
    // Show success message
    alert(t('management.playoffsStartedSuccess', { count: qualifyingPlayers.length }));
  };

  const getRoundName = (roundSize) => {
    switch (roundSize) {
      case 2: return t('management.final');
      case 4: return t('management.semiFinals');
      case 8: return t('management.quarterFinals');
      case 16: return t('management.roundOf', { count: 16 });
      case 32: return t('management.roundOf', { count: 32 });
      case 64: return t('management.roundOf', { count: 64 });
      default: return t('management.roundOf', { count: roundSize });
    }
  };

  const handleDeleteTournament = async () => {
    if (!tournament) return;
    
    if (!isAdmin) {
      alert(t('management.onlyAdminsCanDelete'));
      return;
    }

    const confirmMessage = t('management.confirmDeleteTournament', { name: tournament.name });
    
    if (window.confirm(confirmMessage)) {
      try {
        await onDeleteTournament(tournament.id);
        // Redirect to tournaments list after successful deletion
        onBack();
      } catch (error) {
        console.error('Error deleting tournament:', error);
        alert(t('management.failedToDeleteTournament'));
      }
    }
  };

  const updateSettings = async () => {
    try {
      await updateTournamentSettings(tournament.id, tournamentSettings);
      setShowEditSettings(false);
      alert(t('registration.settingsUpdatedSuccessfully'));
    } catch (error) {
      console.error('Error updating tournament settings:', error);
      alert(t('registration.failedToUpdateSettings'));
    }
  };

  // Show loading state if tournament is not loaded yet
  if (!tournament) {
    return (
      <div className="tournament-management">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const getMatchStatusText = (status, matchId) => {
    if (isMatchActuallyLive(matchId)) {
      if (isMatchInLocalStorage(matchId)) {
        return t('management.liveThisDevice');
      } else if (isAdmin) {
        return t('management.liveAdminAccess');
      } else {
        return t('management.liveOtherDevice');
      }
    }
    
    switch (status) {
      case 'completed': return t('common.completed');
      case 'in_progress': return t('management.inProgress');
      default: return t('management.pending');
    }
  };

  const getMatchStatusColor = (status, matchId) => {
    if (isMatchActuallyLive(matchId)) {
      if (isMatchInLocalStorage(matchId)) {
        return '#3b82f6'; // Blue for this device
      } else if (isAdmin) {
        return '#dc2626'; // Red for admin access
      } else {
        return '#f59e0b'; // Orange for other device
      }
    }
    
    switch (status) {
      case 'completed': return '#10b981';
      case 'in_progress': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const renderGroups = () => (
    <div className="groups-view">
      <h3>{t('management.tournamentGroups')}</h3>
      <div className="groups-grid">
        {tournament.groups && tournament.groups.length > 0 ? tournament.groups.map(group => (
          <div key={group.id} className="group-card">
            <div className="group-header">
              <h4>{group.name}</h4>
              <span className="player-count">{group.players.length} {t('common.players')}</span>
            </div>
            <div className="group-players">
              {group.players.map(player => (
                <div key={player.id} className="player-name">
                  {player.name}
                </div>
              ))}
            </div>
            <div className="group-stats">
              <div className="stat">
                <Target size={16} />
                <span>{group.matches.length} {t('common.matches')}</span>
              </div>
              <div className="stat">
                <span>
                  {group.matches.filter(m => m.status === 'completed').length} {t('management.completed')}
                </span>
              </div>
            </div>
          </div>
        )) : (
          <div className="no-groups">
            <p>{t('management.noGroupsYet') || 'No groups created yet. Start the tournament to create groups.'}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderMatches = () => (
    <div className="matches-view">
      <h3>{t('management.allMatches')}</h3>
      <div className="matches-list">
        {tournament.groups && tournament.groups.length > 0 ? tournament.groups.map(group => (
          <div key={group.id} className="group-matches">
            <h4>{group.name}</h4>
            <div className="matches-grid">
              {group.matches.map(match => {
                const isPlayer1Winner = match.status === 'completed' && match.result && match.result.winner === match.player1?.id;
                const isPlayer2Winner = match.status === 'completed' && match.result && match.result.winner === match.player2?.id;
                
                return (
                <div key={match.id} className="match-card">
                  <div className="match-header">
                    <div className="match-status">
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getMatchStatusColor(match.status, match.id) }}
                      >
                        {getMatchStatusText(match.status, match.id)}
                      </span>
                      {isMatchActuallyLive(match.id) && (
                        <div className="live-indicator">
                          {isMatchInLocalStorage(match.id) ? (
                            <Wifi size={14} className="live-icon this-device" />
                          ) : (
                            <Eye size={14} className="live-icon other-device" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {match.status === 'completed' && match.result ? (
                    <div className="match-result-compact">
                      <div className="player-result">
                        <div className="player-name-row">
                          <span className={`player-name ${isPlayer1Winner ? 'winner' : ''}`}>
                            {match.player1?.name || 'Unknown Player'}
                          </span>
                          <span className="score">{match.result.player1Legs}</span>
                        </div>
                        <div className="player-average-compact">
                          {match.result.player1Stats?.average ? match.result.player1Stats.average.toFixed(1) : '0.0'}
                        </div>
                      </div>
                      <div className="score-divider">:</div>
                      <div className="player-result">
                        <div className="player-name-row">
                          <span className="score">{match.result.player2Legs}</span>
                          <span className={`player-name ${isPlayer2Winner ? 'winner' : ''}`}>
                            {match.player2?.name || 'Unknown Player'}
                          </span>
                        </div>
                        <div className="player-average-compact">
                          {match.result.player2Stats?.average ? match.result.player2Stats.average.toFixed(1) : '0.0'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="match-players-compact">
                      <span className="player">{match.player1?.name || 'Unknown Player'}</span>
                      <span className="vs">vs</span>
                      <span className="player">{match.player2?.name || 'Unknown Player'}</span>
                    </div>
                  )}
                  {match.status === 'pending' && !isMatchActuallyLive(match.id) && (
                    user ? (
                      <button 
                        className="start-match-btn"
                        onClick={() => onMatchStart({ 
                          ...match,
                          groupId: group.id,
                          legsToWin: match.legsToWin || tournament.legsToWin,
                          startingScore: match.startingScore || tournament.startingScore
                        })}
                      >
                        <Play size={16} />
                        {t('management.startMatch')}
                      </button>
                    ) : (
                      <div className="login-required-message">
                        <Eye size={16} />
                        {t('management.loginToStartMatch') || 'Login required to start match'}
                      </div>
                    )
                  )}
                  {isMatchActuallyLive(match.id) && !isMatchInLocalStorage(match.id) && (
                    <button 
                      className={`view-match-btn ${isAdmin && user ? 'continue-match-btn' : ''}`}
                      onClick={() => onMatchStart({ 
                        ...match,
                        legsToWin: match.legsToWin || tournament.legsToWin,
                        startingScore: match.startingScore || tournament.startingScore
                      })}
                      disabled={!isAdmin || !user}
                    >
                      <Eye size={16} />
                      {isAdmin && user ? t('management.continueMatch') : t('management.viewLiveMatch')}
                    </button>
                  )}
                  {isMatchActuallyLive(match.id) && isMatchInLocalStorage(match.id) && (
                    user ? (
                      <button 
                        className="continue-match-btn"
                        onClick={() => onMatchStart({ 
                          ...match,
                          legsToWin: match.legsToWin || tournament.legsToWin,
                          startingScore: match.startingScore || tournament.startingScore
                        })}
                      >
                        <Play size={16} />
                        {t('management.continueMatch')}
                      </button>
                    ) : (
                      <button 
                        className="view-match-btn"
                        onClick={() => onMatchStart({ 
                          ...match,
                          legsToWin: match.legsToWin || tournament.legsToWin,
                          startingScore: match.startingScore || tournament.startingScore
                        })}
                      >
                        <Eye size={16} />
                        {t('management.viewLiveMatch')}
                      </button>
                    )
                  )}
                </div>
              )})}
            </div>
          </div>
        )) : (
          <div className="no-matches">
            <p>{t('management.noGroupsYet') || 'No groups created yet. Start the tournament to create groups.'}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStandings = () => (
    <div className="standings-view">
      <h3>{t('management.groupStandings')}</h3>
      <div className="standings-list">
        {tournament.groups && tournament.groups.length > 0 ? tournament.groups.map(group => {
          return (
          <div key={group.id} className="group-standings">
            <h4>{group.name}</h4>
            <div className="standings-table">
              <div className="table-header">
                <span>{t('management.pos')}</span>
                <span>{t('management.player')}</span>
                <span>{t('management.played')}</span>
                <span>{t('management.won')}</span>
                <span>{t('management.lost')}</span>
                <span>{t('management.legsDiff')}</span>
                <span>{t('management.avg')}</span>
                <span>{t('management.pts')}</span>
              </div>
              {(group.standings || []).length > 0 ? (
                (group.standings || []).map((standing, index) => (
                  <div key={standing.player.id} className="table-row">
                    <span className="position">{index + 1}</span>
                    <span className="player-name">{standing.player.name}</span>
                    <span>{standing.matchesPlayed}</span>
                    <span>{standing.matchesWon}</span>
                    <span>{standing.matchesLost}</span>
                    <span className={standing.legsWon - standing.legsLost >= 0 ? 'positive' : 'negative'}>
                      {standing.legsWon - standing.legsLost > 0 ? '+' : ''}{standing.legsWon - standing.legsLost}
                    </span>
                    <span>{standing.average.toFixed(1)}</span>
                    <span className="points">{standing.points}</span>
                  </div>
                ))
              ) : (
                <div className="no-standings">
                  <p>{t('management.noMatchesPlayedYet')}</p>
                </div>
              )}
            </div>
          </div>
          );
        }) : (
          <div className="no-standings">
            <p>{t('management.noGroupsYet') || 'No groups created yet. Start the tournament to create groups.'}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStatistics = () => {
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

    // Collect all statistics from completed matches
    const allAverages = [];
    const allCheckouts = [];
    const allLegs = [];
    const collectLegs = (playerStats, player, opponent, matchId) => {
      if (!playerStats?.legs?.length) {
        return false;
      }
      playerStats.legs.forEach(leg => {
        if (!leg || !leg.isWin || !leg.darts) {
          return;
        }
        allLegs.push({
          player,
          darts: leg.darts,
          leg: leg.leg,
          checkout: leg.checkout || null,
          matchId,
          opponent: opponent?.name || 'Unknown'
        });
      });
      return true;
    };

    // Iterate through all groups and matches
    if (tournament.groups) {
      tournament.groups.forEach(group => {
        if (group.matches) {
          group.matches.forEach(match => {
            if (match.status === 'completed' && match.result) {
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
                  opponent: match.player2?.name || 'Unknown'
                });
              }
              if (match.result.player2Stats?.average) {
                allAverages.push({
                  player: match.player2,
                  average: match.result.player2Stats.average,
                  matchId: match.id,
                  opponent: match.player1?.name || 'Unknown'
                });
              }

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
                      opponent: opponent?.name || 'Unknown'
                    });
                  }
                });
              };

              addCheckoutEntries(match.result.player1Stats, match.player1, match.player2);
              addCheckoutEntries(match.result.player2Stats, match.player2, match.player1);

              const player1LegsAdded = collectLegs(match.result.player1Stats, match.player1, match.player2, match.id);
              const player2LegsAdded = collectLegs(match.result.player2Stats, match.player2, match.player1, match.id);

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
                    if (!totalDarts) return;
                    allLegs.push({
                      player,
                      darts: totalDarts,
                      leg: checkout.leg,
                      checkout: checkout.checkout,
                      matchId: match.id,
                      opponent: opponent?.name || 'Unknown'
                    });
                  });
                };
                fallbackFromCheckouts(match.result.player1Stats, match.player1, match.player2);
                fallbackFromCheckouts(match.result.player2Stats, match.player2, match.player1);
              }
            }
          });
        }
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
    
    const bestCheckouts = [...allCheckouts].sort((a, b) => b.checkout - a.checkout).slice(0, 10);
    const fewestDarts = [...allLegs].sort((a, b) => a.darts - b.darts).slice(0, 10);

    return (
      <div className="statistics-view">
        <h3>{t('management.statistics') || 'Tournament Statistics'}</h3>
        
        {/* Best Averages Leaderboard */}
        <div className="statistics-section">
          <h4>{t('management.bestAverages') || 'Best Match Averages'}</h4>
          {bestAverages.length > 0 ? (
            <div className="leaderboard">
              <div className="leaderboard-header">
                <span>#</span>
                <span>{t('management.player')}</span>
                <span>{t('management.avg')}</span>
                <span>{t('management.opponent') || 'Opponent'}</span>
              </div>
              {bestAverages.map((entry, index) => (
                <div key={`avg-${index}`} className="leaderboard-row">
                  <span className={`position ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`}>{index + 1}</span>
                  <span className="player-name">{entry.player?.name || 'Unknown'}</span>
                  <span className="value">{entry.average.toFixed(1)}</span>
                  <span className="opponent">{entry.opponent}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-stats">{t('management.noStatisticsYet') || 'No statistics available yet.'}</p>
          )}
        </div>

        {/* Best Checkouts Leaderboard */}
        <div className="statistics-section">
          <h4>{t('management.bestCheckouts') || 'Best Checkouts'}</h4>
          {bestCheckouts.length > 0 ? (
            <div className="leaderboard">
              <div className="leaderboard-header">
                <span>#</span>
                <span>{t('management.player')}</span>
                <span>{t('management.checkout') || 'Checkout'}</span>
                <span>{t('management.opponent') || 'Opponent'}</span>
              </div>
              {bestCheckouts.map((entry, index) => (
                <div key={`checkout-${index}`} className="leaderboard-row">
                  <span className={`position ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`}>{index + 1}</span>
                  <span className="player-name">{entry.player?.name || 'Unknown'}</span>
                  <span className="value">{entry.checkout}</span>
                  <span className="opponent">{entry.opponent}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-stats">{t('management.noStatisticsYet') || 'No statistics available yet.'}</p>
          )}
        </div>

        {/* Fewest Darts Leaderboard */}
        <div className="statistics-section">
          <h4>{t('management.fewestDarts') || 'Legs with Fewest Darts'}</h4>
          {fewestDarts.length > 0 ? (
            <div className="leaderboard">
              <div className="leaderboard-header">
                <span>#</span>
                <span>{t('management.player')}</span>
                <span>{t('management.darts') || 'Darts'}</span>
                <span>{t('management.opponent') || 'Opponent'}</span>
              </div>
              {fewestDarts.map((entry, index) => (
                <div key={`darts-${index}`} className="leaderboard-row">
                  <span className={`position ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`}>{index + 1}</span>
                  <span className="player-name">{entry.player?.name || 'Unknown'}</span>
                  <span className="value">{entry.darts}</span>
                  <span className="opponent">{entry.opponent}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-stats">{t('management.noStatisticsYet') || 'No statistics available yet.'}</p>
          )}
        </div>
      </div>
    );
  };

  const renderPlayoffs = () => {
    // Check if playoffs are enabled
    if (!tournament.playoffSettings?.enabled) {
      return (
        <div className="playoffs-view">
          <div className="no-playoffs">
            <Trophy size={48} />
            <h3>{t('management.playoffsNotEnabled')}</h3>
            <p>{t('management.tournamentWithoutPlayoffs')}</p>
          </div>
        </div>
      );
    }

    // If playoffs object doesn't exist but playoffs are enabled, show group stage completion check
    if (!tournament.playoffs) {
      const groupStageComplete = isGroupStageComplete();
      if (groupStageComplete) {
        const qualifyingPlayers = getQualifyingPlayers();
        return (
          <div className="playoffs-view">
            <div className="start-playoffs-section">
              <div className="playoffs-header">
                <h3>{t('management.readyToStartPlayoffs')}</h3>
                <div className="playoff-info">
                  <span>{t('management.groupStageCompleted')}</span>
                  <span>{qualifyingPlayers.length} {t('management.playersQualified')}</span>
                </div>
              </div>

              <div className="qualifying-players">
                <h4>{t('management.qualifyingPlayers')}:</h4>
                <div className="players-grid">
                  {tournament.groups && tournament.groups.length > 0 ? tournament.groups.map((group, groupIndex) => {
                    const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;
                    const allPlayersValue = 9999; // Special value to represent "all players"
                    const groupQualifiers = qualifyingPlayers.filter(player => 
                      group.players.some(groupPlayer => groupPlayer.id === player.id)
                    );
                    const displayedQualifiers = playersPerGroup === allPlayersValue 
                      ? groupQualifiers 
                      : groupQualifiers.slice(0, playersPerGroup);
                    
                    return (
                      <div key={group.id} className="group-qualifiers">
                        <h5>{group.name}</h5>
                        <div className="qualifiers-list">
                          {displayedQualifiers.map((player, index) => (
                            <div key={player.id} className="qualifier">
                              <span className="position">{index + 1}</span>
                              <span className="player-name">{player.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="no-groups">
                      <p>{t('management.noGroupsYet') || 'No groups created yet.'}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="start-playoffs-actions">
                <button 
                  className="start-playoffs-btn"
                  onClick={startPlayoffs}
                >
                  <Trophy size={20} />
                  {t('management.startPlayoffs')}
                </button>
                <p className="playoffs-note">
                  {t('management.playoffsNote')}
                </p>
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <div className="playoffs-view">
            <div className="no-playoffs">
              <Trophy size={48} />
              <h3>{t('management.playoffsNotAvailable')}</h3>
              <p>{t('management.playoffsAvailableAfterGroups')}</p>
            </div>
          </div>
        );
      }
    }

    // Check if group stage is complete but playoffs haven't started
    const groupStageComplete = isGroupStageComplete();
    const hasQualifyingPlayers = tournament.playoffs?.qualifyingPlayers && tournament.playoffs.qualifyingPlayers.length > 0;
    const hasPlayoffRounds = tournament.playoffs?.rounds && tournament.playoffs.rounds.length > 0;
    // Playoffs are started if we have qualifying players and rounds (players don't need to be assigned yet)
    const playoffsStarted = hasQualifyingPlayers && hasPlayoffRounds;
    

    if (groupStageComplete && !playoffsStarted) {
      const qualifyingPlayers = getQualifyingPlayers();
      return (
        <div className="playoffs-view">
          <div className="start-playoffs-section">
            <div className="playoffs-header">
              <h3>Ready to Start Playoffs!</h3>
              <div className="playoff-info">
                <span>Group stage completed</span>
                <span>{qualifyingPlayers.length} players qualified</span>
              </div>
            </div>

            <div className="qualifying-players">
              <h4>Qualifying Players:</h4>
              <div className="players-grid">
                {tournament.groups && tournament.groups.length > 0 ? tournament.groups.map((group, groupIndex) => {
                  const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;
                  const allPlayersValue = 9999; // Special value to represent "all players"
                  const groupQualifiers = qualifyingPlayers.filter(player => 
                    group.players.some(groupPlayer => groupPlayer.id === player.id)
                  );
                  const displayedQualifiers = playersPerGroup === allPlayersValue 
                    ? groupQualifiers 
                    : groupQualifiers.slice(0, playersPerGroup);
                  
                  return (
                    <div key={group.id} className="group-qualifiers">
                      <h5>{group.name}</h5>
                      <div className="qualifiers-list">
                        {displayedQualifiers.map((player, index) => (
                          <div key={player.id} className="qualifier">
                            <span className="position">{index + 1}</span>
                            <span className="player-name">{player.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="no-groups">
                    <p>{t('management.noGroupsYet') || 'No groups created yet.'}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="start-playoffs-actions">
              <button 
                className="start-playoffs-btn"
                onClick={startPlayoffs}
              >
                <Trophy size={20} />
                Start Playoffs
              </button>
              <p className="playoffs-note">
                Players will be randomly seeded in the bracket
              </p>
            </div>
          </div>
        </div>
      );
    }

    const { rounds, currentRound, qualifyingPlayers } = tournament.playoffs;
    const playoffMatches = tournament.playoffMatches || [];


    // Check if players need to be assigned to matches
    const needsPlayerAssignment = rounds.some(round => 
      round.matches.some(match => !match.player1 || !match.player2)
    );

    return (
      <div className="playoffs-view">
        <div className="playoffs-header">
          <h3>Playoff Bracket</h3>
          <div className="playoff-info">
            <span>{qualifyingPlayers.length} players qualified</span>
            <span>Current Round: {rounds[currentRound - 1]?.name || 'Completed'}</span>
          </div>
        </div>

        <div className="bracket-container">
          {rounds.map((round, index) => (
            <div key={round.id} className={`bracket-round ${index + 1 === currentRound ? 'current' : ''}`}>
              <div className="round-header">
                <h4>{round.name}</h4>
                <span className="match-count">{round.matches.length} matches</span>
              </div>
              
              <div className="round-matches">
                {round.matches.map((bracketMatch) => {
                  // Find the actual database match for this bracket match
                  const match = playoffMatches.find(pm => pm.id === bracketMatch.id) || bracketMatch;
                  return (
                  <div key={match.id} className={`playoff-match ${match.status}`}>
                    <div className="match-header">
                      <div className="match-status">
                        <span 
                          className="status-badge"
                          style={{ backgroundColor: getMatchStatusColor(match.status, match.id) }}
                        >
                          {getMatchStatusText(match.status, match.id)}
                        </span>
                        {isMatchActuallyLive(match.id) && (
                          <div className="live-indicator">
                            {isMatchInLocalStorage(match.id) ? (
                              <Wifi size={14} className="live-icon this-device" />
                            ) : (
                              <Eye size={14} className="live-icon other-device" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="match-players">
                      <div className={`player ${match.result?.winner === match.player1?.id ? 'winner' : ''}`}>
                        <span className="player-name">
                          {match.player1?.name || 'TBD'}
                        </span>
                        {match.result && (
                          <span className="player-score">{match.result.player1Legs}</span>
                        )}
                      </div>
                      <div className="vs">vs</div>
                      <div className={`player ${match.result?.winner === match.player2?.id ? 'winner' : ''}`}>
                        <span className="player-name">
                          {match.player2?.name || 'TBD'}
                        </span>
                        {match.result && (
                          <span className="player-score">{match.result.player2Legs}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="match-actions">
                      {isAdmin && match.status === 'pending' && !isMatchActuallyLive(match.id) && (
                        <button 
                          className="edit-match-btn"
                          onClick={() => setEditingMatch(match)}
                          title={t('management.editMatchPlayers') || 'Edit match players'}
                        >
                          <Edit2 size={16} />
                          {t('common.edit')}
                        </button>
                      )}
                      {match.status === 'pending' && match.player1 && match.player2 && !isMatchActuallyLive(match.id) && (
                        user ? (
                          <button 
                            className="start-match-btn"
                            onClick={() => {
                              // Calculate round size from number of matches (each match has 2 players)
                              const roundSize = round.matches.length * 2;
                              const legsToWin = getPlayoffLegsToWin(roundSize);
                              onMatchStart({ 
                                ...match,
                                legsToWin: legsToWin,
                                startingScore: tournament.startingScore,
                                isPlayoff: true
                              });
                            }}
                          >
                            <Play size={16} />
                            Start Match
                          </button>
                        ) : (
                          <div className="login-required-message">
                            <Eye size={16} />
                            {t('management.loginToStartMatch') || 'Login required to start match'}
                          </div>
                        )
                      )}
                      {isMatchActuallyLive(match.id) && !isMatchInLocalStorage(match.id) && (
                        <button 
                          className={`view-match-btn ${isAdmin && user ? 'continue-match-btn' : ''}`}
                          onClick={() => {
                            const roundSize = round.matches.length * 2;
                            const legsToWin = getPlayoffLegsToWin(roundSize);
                            onMatchStart({ 
                              ...match,
                              legsToWin: legsToWin,
                              startingScore: tournament.startingScore,
                              isPlayoff: true
                            });
                          }}
                          disabled={!isAdmin || !user}
                        >
                          <Eye size={16} />
                          {isAdmin && user ? t('management.continueMatch') : t('management.viewLiveMatch')}
                        </button>
                      )}
                      {isMatchActuallyLive(match.id) && isMatchInLocalStorage(match.id) && (
                        user ? (
                          <button 
                            className="continue-match-btn"
                            onClick={() => {
                              const roundSize = round.matches.length * 2;
                              const legsToWin = getPlayoffLegsToWin(roundSize);
                              onMatchStart({ 
                                ...match,
                                legsToWin: legsToWin,
                                startingScore: tournament.startingScore,
                                isPlayoff: true
                              });
                            }}
                          >
                            <Play size={16} />
                            {t('management.continueMatch')}
                          </button>
                        ) : (
                          <button 
                            className="view-match-btn"
                            onClick={() => {
                              const roundSize = round.matches.length * 2;
                              const legsToWin = getPlayoffLegsToWin(roundSize);
                              onMatchStart({ 
                                ...match,
                                legsToWin: legsToWin,
                                startingScore: tournament.startingScore,
                                isPlayoff: true
                              });
                            }}
                          >
                            <Eye size={16} />
                            {t('management.viewLiveMatch')}
                          </button>
                        )
                      )}
                      {match.status === 'completed' && (
                        <div className="match-completed">
                          <CheckCircle size={16} />
                          Completed
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="tournament-management">
      <div className="management-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('common.backToDashboard')}
        </button>
        <div className="tournament-title">
          <Trophy size={24} />
          <h2>{tournament.name}</h2>
        </div>
        <div className="tournament-overview">
          <div className="overview-stat">
            <Users size={20} />
            <span>{tournament.players?.length || tournament.groups?.reduce((total, group) => total + (group.players?.length || 0), 0) || 0} {t('common.players')}</span>
          </div>
          <div className="overview-stat">
            <span>{tournament.groups?.length || 0} {t('common.groups')}</span>
          </div>
        </div>
        <div className="header-actions">
          {user && (
            <button 
              className="edit-settings-btn"
              onClick={() => setShowEditSettings(true)}
              title={t('registration.editTournamentSettings')}
            >
              <Settings size={18} />
              {t('registration.editSettings')}
            </button>
          )}
          {isAdmin && (
            <button 
              className="delete-tournament-btn"
              onClick={handleDeleteTournament}
              title={t('management.deleteTournamentAdminOnly')}
            >
              <Trash2 size={20} />
              {t('management.deleteTournament')}
            </button>
          )}
        </div>
      </div>

      <div className="management-tabs">
        <button 
          className={activeTab === 'groups' ? 'active' : ''}
          onClick={() => setActiveTab('groups')}
        >
          {t('management.groups')}
        </button>
        <button 
          className={activeTab === 'matches' ? 'active' : ''}
          onClick={() => setActiveTab('matches')}
        >
          {t('management.matches')}
        </button>
        <button 
          className={activeTab === 'standings' ? 'active' : ''}
          onClick={() => setActiveTab('standings')}
        >
          {t('management.standings')}
        </button>
        {tournament.playoffSettings?.enabled && (
          <button 
            className={activeTab === 'playoffs' ? 'active' : ''}
            onClick={() => setActiveTab('playoffs')}
          >
            {t('management.playoffs')}
          </button>
        )}
        <button 
          className={activeTab === 'statistics' ? 'active' : ''}
          onClick={() => setActiveTab('statistics')}
        >
          {t('management.statistics') || 'Statistics'}
        </button>
      </div>

      <div className="management-content">
        {activeTab === 'groups' && renderGroups()}
        {activeTab === 'matches' && renderMatches()}
        {activeTab === 'standings' && renderStandings()}
        {activeTab === 'playoffs' && renderPlayoffs()}
        {activeTab === 'statistics' && renderStatistics()}
      </div>

      {/* Edit Settings Modal */}
      {showEditSettings && user && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Edit Tournament Settings</h3>
              <button 
                className="close-btn"
                onClick={() => setShowEditSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="group-settings">
                <h4>Match Settings</h4>
                <div className="input-group">
                  <label>Legs to Win:</label>
                  <select 
                    value={tournamentSettings.legsToWin}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      legsToWin: parseInt(e.target.value)
                    })}
                  >
                    <option value={1}>First to 1</option>
                    <option value={2}>First to 2</option>
                    <option value={3}>First to 3</option>
                    <option value={4}>First to 4</option>
                    <option value={5}>First to 5</option>
                    <option value={7}>First to 7</option>
                    <option value={9}>First to 9</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Starting Score:</label>
                  <select 
                    value={tournamentSettings.startingScore}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      startingScore: parseInt(e.target.value)
                    })}
                  >
                    <option value={301}>301</option>
                    <option value={501}>501</option>
                    <option value={701}>701</option>
                  </select>
                </div>
              </div>

              <div className="group-settings">
                <h4>{t('registration.standingsCriteriaOrder')}</h4>
                <p className="settings-description" style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                  {t('registration.standingsCriteriaOrderDescription') || 'Nastavte poradie kritérií pre zoradenie v tabuľke skupín. Kritériá sa použijú v tomto poradí pri rovnakých hodnotách.'}
                </p>
                <div className="criteria-order-list" style={{ marginBottom: '1.5rem' }}>
                  {tournamentSettings.standingsCriteriaOrder.map((criterion, index) => {
                    const criterionLabels = {
                      matchesWon: t('registration.matchesWon'),
                      legDifference: t('registration.legDifference'),
                      average: t('registration.average'),
                      headToHead: t('registration.headToHead')
                    };
                    return (
                      <div key={criterion} className="criteria-order-item" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '0.75rem', 
                        marginBottom: '0.5rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: '#f9f9f9'
                      }}>
                        <span className="criteria-number" style={{ marginRight: '0.75rem', fontWeight: 'bold', minWidth: '2rem' }}>{index + 1}.</span>
                        <span className="criteria-label" style={{ flex: 1 }}>{criterionLabels[criterion] || criterion}</span>
                        <div className="criteria-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            type="button"
                            className="move-btn"
                            onClick={() => {
                              if (index > 0) {
                                const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                setTournamentSettings({
                                  ...tournamentSettings,
                                  standingsCriteriaOrder: newOrder
                                });
                              }
                            }}
                            disabled={index === 0}
                            title={t('registration.moveUp')}
                            style={{ 
                              padding: '0.25rem 0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              backgroundColor: index === 0 ? '#f0f0f0' : '#fff',
                              cursor: index === 0 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className="move-btn"
                            onClick={() => {
                              if (index < tournamentSettings.standingsCriteriaOrder.length - 1) {
                                const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                                [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                setTournamentSettings({
                                  ...tournamentSettings,
                                  standingsCriteriaOrder: newOrder
                                });
                              }
                            }}
                            disabled={index === tournamentSettings.standingsCriteriaOrder.length - 1}
                            title={t('registration.moveDown')}
                            style={{ 
                              padding: '0.25rem 0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              backgroundColor: index === tournamentSettings.standingsCriteriaOrder.length - 1 ? '#f0f0f0' : '#fff',
                              cursor: index === tournamentSettings.standingsCriteriaOrder.length - 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="group-settings">
                <h4>Group Settings</h4>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="groups"
                      checked={tournamentSettings.groupSettings.type === 'groups'}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    Number of Groups
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="playersPerGroup"
                      checked={tournamentSettings.groupSettings.type === 'playersPerGroup'}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    Players per Group
                  </label>
                </div>
                <div className="input-group">
                  <label>
                    {tournamentSettings.groupSettings.type === 'groups' ? 'Number of Groups:' : 'Players per Group:'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={tournamentSettings.groupSettings.type === 'groups' ? '16' : '8'}
                    value={tournamentSettings.groupSettings.value}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      groupSettings: {
                        ...tournamentSettings.groupSettings,
                        value: parseInt(e.target.value) || 1
                      }
                    })}
                  />
                </div>
              </div>

              <div className="group-settings">
                <h4>Playoff Settings</h4>
                <div className="checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={tournamentSettings.playoffSettings.enabled}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        playoffSettings: {
                          ...tournamentSettings.playoffSettings,
                          enabled: e.target.checked
                        }
                      })}
                    />
                    Enable Playoffs
                  </label>
                </div>
                
                {tournamentSettings.playoffSettings.enabled && (() => {
                  // Calculate max players per group from actual tournament groups
                  const calculateMaxPlayersPerGroup = () => {
                    if (tournament?.groups && tournament.groups.length > 0) {
                      return Math.max(...tournament.groups.map(group => 
                        group.players?.length || group.standings?.length || 0
                      ));
                    }
                    // Fallback: calculate from group settings if groups not yet created
                    if (tournamentSettings.groupSettings.type === 'groups') {
                      const totalPlayers = tournament?.players?.length || 0;
                      return totalPlayers > 0 ? Math.ceil(totalPlayers / tournamentSettings.groupSettings.value) : 4;
                    } else {
                      return tournamentSettings.groupSettings.value || 4;
                    }
                  };
                  const maxPlayersPerGroup = calculateMaxPlayersPerGroup();
                  const allPlayersValue = 9999; // Special value to represent "all players"
                  
                  return (
                    <div className="playoff-options">
                      <div className="input-group">
                        <label>Players advancing per group:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.playersPerGroup}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              playersPerGroup: parseInt(e.target.value)
                            }
                          })}
                        >
                          {Array.from({ length: maxPlayersPerGroup }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                          <option value={allPlayersValue}>All</option>
                        </select>
                      </div>
                    <div className="playoff-legs-settings">
                      <h5>{t('registration.playoffLegsToWin')}:</h5>
                      <div className="input-group">
                        <label>{t('management.roundOf', { count: 16 })}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[16] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                16: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.quarterFinals')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[8] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                8: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.semiFinals')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[4] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                4: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.final')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[2] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                2: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowEditSettings(false)}
              >
                Cancel
              </button>
              <button 
                className="confirm-btn"
                onClick={updateSettings}
              >
                Update Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Playoff Match Modal */}
      {editingMatch && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{t('management.editMatchPlayers') || 'Edit Match Players'}</h3>
              <button 
                className="close-btn"
                onClick={() => setEditingMatch(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <EditPlayoffMatchForm
                match={editingMatch}
                qualifyingPlayers={tournament.playoffs?.qualifyingPlayers || []}
                allRounds={tournament.playoffs?.rounds || []}
                onSave={(player1, player2) => updatePlayoffMatchPlayers(editingMatch.id, player1, player2)}
                onCancel={() => setEditingMatch(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component for editing playoff match players
function EditPlayoffMatchForm({ match, qualifyingPlayers, allRounds, onSave, onCancel }) {
  const [selectedPlayer1, setSelectedPlayer1] = useState(match.player1);
  const [selectedPlayer2, setSelectedPlayer2] = useState(match.player2);

  // Find which round this match belongs to
  const currentRound = allRounds.find(round => 
    round.matches.some(m => m.id === match.id)
  );

  // Get all players already assigned in other matches in the same round
  const getAssignedPlayers = () => {
    if (!currentRound) return [];
    
    const assignedPlayerIds = new Set();
    currentRound.matches.forEach(m => {
      // Don't include players from the current match being edited
      if (m.id !== match.id) {
        if (m.player1?.id) assignedPlayerIds.add(m.player1.id);
        if (m.player2?.id) assignedPlayerIds.add(m.player2.id);
      }
    });
    
    return Array.from(assignedPlayerIds);
  };

  const assignedPlayerIds = getAssignedPlayers();

  // Filter out already assigned players, but keep currently selected players
  const getAvailablePlayers = (excludePlayerId = null) => {
    return qualifyingPlayers.filter(player => {
      // Always include currently selected players (for player1 and player2 dropdowns)
      if (player.id === selectedPlayer1?.id || player.id === selectedPlayer2?.id) {
        return true;
      }
      // Exclude the other selected player in the same dropdown
      if (excludePlayerId && player.id === excludePlayerId) {
        return false;
      }
      // Exclude already assigned players in other matches
      return !assignedPlayerIds.includes(player.id);
    });
  };

  const handleSave = () => {
    if (!selectedPlayer1 || !selectedPlayer2) {
      alert('Please select both players');
      return;
    }
    if (selectedPlayer1.id === selectedPlayer2.id) {
      alert('Players must be different');
      return;
    }
    onSave(selectedPlayer1, selectedPlayer2);
  };

  return (
    <div className="edit-playoff-match-form">
      <div className="input-group">
        <label>Player 1:</label>
        <select
          value={selectedPlayer1?.id || ''}
          onChange={(e) => {
            const player = qualifyingPlayers.find(p => p.id === e.target.value);
            setSelectedPlayer1(player || null);
          }}
        >
          <option value="">Select Player 1</option>
          {getAvailablePlayers(selectedPlayer2?.id).map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      <div className="input-group">
        <label>Player 2:</label>
        <select
          value={selectedPlayer2?.id || ''}
          onChange={(e) => {
            const player = qualifyingPlayers.find(p => p.id === e.target.value);
            setSelectedPlayer2(player || null);
          }}
        >
          <option value="">Select Player 2</option>
          {getAvailablePlayers(selectedPlayer1?.id).map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions">
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="confirm-btn" onClick={handleSave}>
          Save Changes
        </button>
      </div>
    </div>
  );
}

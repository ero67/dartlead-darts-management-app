import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { tournamentService, matchService } from '../services/tournamentService.js';


const TournamentContext = createContext();

// Action types
const ACTIONS = {
  CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  LOAD_TOURNAMENTS: 'LOAD_TOURNAMENTS',
  SELECT_TOURNAMENT: 'SELECT_TOURNAMENT',
  UPDATE_MATCH_RESULT: 'UPDATE_MATCH_RESULT',
  START_MATCH: 'START_MATCH',
  COMPLETE_MATCH: 'COMPLETE_MATCH',
  DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',
  UPDATE_TOURNAMENT_STATUS: 'UPDATE_TOURNAMENT_STATUS',
  START_PLAYOFFS: 'START_PLAYOFFS'
};

// Initial state
const initialState = {
  tournaments: [],
  currentTournament: null,
  currentMatch: null,
  loading: false,
  error: null
};

// Reducer
function tournamentReducer(state, action) {
  switch (action.type) {
    case ACTIONS.CREATE_TOURNAMENT:
      return {
        ...state,
        tournaments: [...state.tournaments, action.payload],
        currentTournament: action.payload
      };

    case ACTIONS.LOAD_TOURNAMENTS:
      return {
        ...state,
        tournaments: action.payload,
        loading: false
      };

    case ACTIONS.SELECT_TOURNAMENT:
      return {
        ...state,
        currentTournament: action.payload
      };

    case ACTIONS.START_MATCH:
      return {
        ...state,
        currentMatch: action.payload
      };

    case ACTIONS.COMPLETE_MATCH:
      if (!state.currentTournament) {
        console.error('No current tournament to update');
        return state;
      }
      
      const updatedTournament = { ...state.currentTournament };
      const matchResult = action.payload;
      
      // Check if this is a playoff match
      if (matchResult.isPlayoff && matchResult.playoffRound) {
        
        // Find the playoff match in the rounds
        if (updatedTournament.playoffs && updatedTournament.playoffs.rounds) {
          const rounds = updatedTournament.playoffs.rounds;
          let foundMatch = null;
          let foundRoundIndex = -1;
          let foundMatchIndex = -1;
          
          // Find the match in playoff rounds
          for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
            const round = rounds[roundIndex];
            if (round.matches) {
              const matchIndex = round.matches.findIndex(m => m.id === matchResult.matchId);
              if (matchIndex !== -1) {
                foundMatch = round.matches[matchIndex];
                foundRoundIndex = roundIndex;
                foundMatchIndex = matchIndex;
                break;
              }
            }
          }
          
          if (foundMatch) {
            // Update the match status
            foundMatch.status = 'completed';
            foundMatch.result = matchResult;
            
            // Get the winner and loser player objects
            const winnerId = matchResult.winner;
            const winnerPlayer = matchResult.winner === matchResult.player1Id 
              ? { id: matchResult.player1Id, name: foundMatch.player1?.name }
              : { id: matchResult.player2Id, name: foundMatch.player2?.name };
            
            const loserPlayer = matchResult.winner === matchResult.player1Id 
              ? { id: matchResult.player2Id, name: foundMatch.player2?.name }
              : { id: matchResult.player1Id, name: foundMatch.player1?.name };
            
            // Check if this is a semifinal match (round with 2 matches = 4 players)
            const currentRound = rounds[foundRoundIndex];
            const isSemifinal = currentRound && currentRound.matches && currentRound.matches.length === 2 && foundRoundIndex < rounds.length - 1;
            
            // Advance winner to next round if not the final
            if (foundRoundIndex < rounds.length - 1) {
              const nextRound = rounds[foundRoundIndex + 1];
              if (nextRound && nextRound.matches) {
                // Find the final match (not 3rd place match)
                const finalMatch = nextRound.matches.find(m => !m.isThirdPlaceMatch);
                
                if (finalMatch) {
                  // Determine which position in final match
                  // First semifinal winner -> player1, second semifinal winner -> player2
                  if (foundMatchIndex === 0) {
                    finalMatch.player1 = winnerPlayer;
                  } else if (foundMatchIndex === 1) {
                    finalMatch.player2 = winnerPlayer;
                  }
                  
                  // Update match status if both players are set
                  if (finalMatch.player1 && finalMatch.player2) {
                    finalMatch.status = 'pending';
                  }
                } else {
                  // Fallback to old logic if no final match found (for brackets without 3rd place match)
                  const nextMatchIndex = Math.floor(foundMatchIndex / 2);
                  const nextMatch = nextRound.matches[nextMatchIndex];
                  
                  if (nextMatch && !nextMatch.isThirdPlaceMatch) {
                    const isFirstMatchOfPair = (foundMatchIndex % 2 === 0);
                    if (isFirstMatchOfPair) {
                      nextMatch.player1 = winnerPlayer;
                    } else {
                      nextMatch.player2 = winnerPlayer;
                    }
                    
                    if (nextMatch.player1 && nextMatch.player2) {
                      nextMatch.status = 'pending';
                    }
                  }
                }
              }
            }
            
            // If this is a semifinal, assign loser to 3rd place match
            if (isSemifinal && rounds.length > 0) {
              const finalRound = rounds[rounds.length - 1];
              const thirdPlaceMatch = finalRound.matches.find(m => m.isThirdPlaceMatch);
              
              if (thirdPlaceMatch) {
                // Determine which position in 3rd place match (first semifinal loser -> player1, second semifinal loser -> player2)
                if (foundMatchIndex === 0) {
                  thirdPlaceMatch.player1 = loserPlayer;
                } else if (foundMatchIndex === 1) {
                  thirdPlaceMatch.player2 = loserPlayer;
                }
                
                // Update match status if both players are set
                if (thirdPlaceMatch.player1 && thirdPlaceMatch.player2) {
                  thirdPlaceMatch.status = 'pending';
                }
              }
            }
            
            // Check if tournament is complete (final and 3rd place match are both finished)
            if (rounds.length > 0) {
              const finalRound = rounds[rounds.length - 1];
              const finalMatch = finalRound.matches.find(m => !m.isThirdPlaceMatch);
              const thirdPlaceMatch = finalRound.matches.find(m => m.isThirdPlaceMatch);
              
              // Tournament is complete if:
              // 1. Final match is completed
              // 2. If 3rd place match exists, it must also be completed
              const finalComplete = finalMatch && finalMatch.status === 'completed';
              const thirdPlaceComplete = !thirdPlaceMatch || thirdPlaceMatch.status === 'completed';
              
              if (finalComplete && thirdPlaceComplete) {
                updatedTournament.status = 'completed';
              }
            }
          } else {
            console.error('Playoff match not found in rounds:', matchResult.matchId);
          }
        }
      } else {
        // Regular group match
        const group = updatedTournament.groups?.find(g => g.id === matchResult.groupId);
        
        if (!group) {
          console.error('Group not found for match completion:', matchResult.groupId);
          return state;
        }
        
        const match = group.matches?.find(m => m.id === matchResult.matchId);
        
        if (!match) {
          console.error('Match not found for completion:', matchResult.matchId);
          return state;
        }
        
        match.result = matchResult;
        match.status = 'completed';
        
        // Update group standings with tournament settings
        updateGroupStandings(group, updatedTournament);
        
        // Check if all group matches are completed (for tournaments without playoffs)
        const allGroupMatchesComplete = updatedTournament.groups?.every(g => 
          g.matches?.every(m => m.status === 'completed')
        );
        
        // If all group matches are complete and playoffs are not enabled or not started, mark tournament as completed
        if (allGroupMatchesComplete) {
          const playoffsEnabled = updatedTournament.playoffSettings?.enabled;
          const hasPlayoffs = updatedTournament.playoffs && updatedTournament.playoffs.rounds && updatedTournament.playoffs.rounds.length > 0;
          
          // Tournament is complete if:
          // 1. Playoffs are not enabled, OR
          // 2. Playoffs are enabled but not started (no rounds), OR
          // 3. Playoffs are enabled and all playoff matches are complete (handled in playoff section above)
          if (!playoffsEnabled || !hasPlayoffs) {
            updatedTournament.status = 'completed';
          }
        }
      }
      
      // Update tournament in tournaments array
      const updatedTournaments = state.tournaments.map(t => 
        t.id === updatedTournament.id ? updatedTournament : t
      );
      
      return {
        ...state,
        currentTournament: updatedTournament,
        tournaments: updatedTournaments,
        currentMatch: null
      };

    case ACTIONS.DELETE_TOURNAMENT:
      return {
        ...state,
        tournaments: state.tournaments.filter(t => t.id !== action.payload),
        currentTournament: state.currentTournament?.id === action.payload ? null : state.currentTournament
      };

    case ACTIONS.UPDATE_TOURNAMENT_STATUS:
      const tournamentToUpdate = state.tournaments.find(t => t.id === action.payload.id);
      if (tournamentToUpdate) {
        tournamentToUpdate.status = action.payload.status;
        tournamentToUpdate.updatedAt = new Date().toISOString();
      }
      return {
        ...state,
        tournaments: [...state.tournaments]
      };

    case ACTIONS.START_PLAYOFFS:
      if (!state.currentTournament) {
        console.error('No current tournament to start playoffs');
        return state;
      }
      
      const tournamentWithPlayoffs = {
        ...state.currentTournament,
        playoffs: action.payload.playoffs
      };
      
      return {
        ...state,
        currentTournament: tournamentWithPlayoffs,
        tournaments: state.tournaments.map(t => 
          t.id === state.currentTournament.id ? tournamentWithPlayoffs : t
        )
      };

    default:
      return state;
  }
}

// Helper function to update group standings
function updateGroupStandings(group, tournament = null) {
  if (!group || !group.players || !group.matches) {
    console.error('Invalid group data for standings update:', group);
    return;
  }
  
  const standings = {};
  
  // Initialize standings
  group.players.forEach(player => {
    if (player && player.id) {
      standings[player.id] = {
        player,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        legsWon: 0,
        legsLost: 0,
        totalScore: 0,
        dartsThrown: 0,
        average: 0,
        points: 0,
        headToHeadWins: {} // Track head-to-head wins against each opponent
      };
    }
  });

  // Calculate standings from completed matches
  group.matches.forEach(match => {
    if (match.status === 'completed' && match.result && match.player1 && match.player2) {
      const { player1, player2, result } = match;
      const p1Stats = standings[player1.id];
      const p2Stats = standings[player2.id];
      
      if (!p1Stats || !p2Stats) {
        console.error('Player stats not found for match:', match);
        return;
      }
      
      p1Stats.matchesPlayed++;
      p2Stats.matchesPlayed++;
      
      if (result.winner === player1.id) {
        p1Stats.matchesWon++;
        p2Stats.matchesLost++;
        p1Stats.points += 3;
        // Track head-to-head
        if (!p1Stats.headToHeadWins[player2.id]) {
          p1Stats.headToHeadWins[player2.id] = 0;
        }
        p1Stats.headToHeadWins[player2.id]++;
      } else {
        p2Stats.matchesWon++;
        p1Stats.matchesLost++;
        p2Stats.points += 3;
        // Track head-to-head
        if (!p2Stats.headToHeadWins[player1.id]) {
          p2Stats.headToHeadWins[player1.id] = 0;
        }
        p2Stats.headToHeadWins[player1.id]++;
      }
      
      p1Stats.legsWon += result.player1Legs || 0;
      p1Stats.legsLost += result.player2Legs || 0;
      p2Stats.legsWon += result.player2Legs || 0;
      p2Stats.legsLost += result.player1Legs || 0;
      
      // Accumulate totalScore and totalDarts for cumulative average calculation
      if (result.player1Stats?.totalScore !== undefined) {
        p1Stats.totalScore = (p1Stats.totalScore || 0) + (result.player1Stats.totalScore || 0);
      }
      if (result.player1Stats?.totalDarts !== undefined) {
        p1Stats.dartsThrown = (p1Stats.dartsThrown || 0) + (result.player1Stats.totalDarts || 0);
      }
      if (result.player2Stats?.totalScore !== undefined) {
        p2Stats.totalScore = (p2Stats.totalScore || 0) + (result.player2Stats.totalScore || 0);
      }
      if (result.player2Stats?.totalDarts !== undefined) {
        p2Stats.dartsThrown = (p2Stats.dartsThrown || 0) + (result.player2Stats.totalDarts || 0);
      }
    }
  });

  // Calculate cumulative averages for all players
  Object.values(standings).forEach((stats) => {
    if (stats.dartsThrown > 0) {
      stats.average = (stats.totalScore / stats.dartsThrown) * 3;
    } else {
      stats.average = 0;
    }
  });

  // Get criteria order from tournament settings or use default
  const criteriaOrder = tournament?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
  console.log('updateGroupStandings - tournament?.standingsCriteriaOrder:', tournament?.standingsCriteriaOrder);
  console.log('updateGroupStandings - Using criteriaOrder:', criteriaOrder);
  
  // Sort standings according to criteria order
  group.standings = Object.values(standings).sort((a, b) => {
    for (const criterion of criteriaOrder) {
      let comparison = 0;
      
      switch (criterion) {
        case 'matchesWon':
          comparison = b.matchesWon - a.matchesWon;
          break;
        case 'legDifference':
          const legDiffA = a.legsWon - a.legsLost;
          const legDiffB = b.legsWon - b.legsLost;
          comparison = legDiffB - legDiffA;
          break;
        case 'average':
          comparison = (b.average || 0) - (a.average || 0);
          break;
        case 'headToHead':
          // Compare head-to-head: if players played each other, check who won more matches
          const aWinsVsB = a.headToHeadWins[b.player.id] || 0;
          const bWinsVsA = b.headToHeadWins[a.player.id] || 0;
          comparison = bWinsVsA - aWinsVsB;
          break;
        default:
          comparison = 0;
      }
      
      // If this criterion shows a difference, return the comparison
      if (comparison !== 0) {
        return comparison;
      }
      // Otherwise, continue to next criterion
    }
    
    // If all criteria are equal, maintain current order (stable sort)
    return 0;
  });
}

// Context Provider
export function TournamentProvider({ children }) {
  const [state, dispatch] = useReducer(tournamentReducer, initialState);

  // Load tournaments from Supabase on mount
  useEffect(() => {
    const loadTournaments = async () => {
      try {
        const tournaments = await tournamentService.getTournaments();
        dispatch({ type: ACTIONS.LOAD_TOURNAMENTS, payload: tournaments });
      } catch (error) {
        console.error('Error loading tournaments:', error);
        // Fallback to localStorage if Supabase fails
        const savedTournaments = localStorage.getItem('darts-tournaments');
        if (savedTournaments) {
          try {
            const tournaments = JSON.parse(savedTournaments);
            dispatch({ type: ACTIONS.LOAD_TOURNAMENTS, payload: tournaments });
          } catch (localError) {
            console.error('Error loading from localStorage:', localError);
          }
        }
      }
    };

    loadTournaments();
  }, []);

  // Save tournaments to localStorage as backup whenever tournaments change
  useEffect(() => {
    if (state.tournaments.length > 0) {
      localStorage.setItem('darts-tournaments', JSON.stringify(state.tournaments));
    }
  }, [state.tournaments]);

  // Actions
  const createTournament = async (tournamentData) => {
    try {
      const tournament = await tournamentService.createTournament(tournamentData);
      dispatch({ type: ACTIONS.CREATE_TOURNAMENT, payload: tournament });
      return tournament;
    } catch (error) {
      console.error('Error creating tournament:', error);
      // Fallback to local creation
      const tournament = {
        ...tournamentData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active'
      };
      dispatch({ type: ACTIONS.CREATE_TOURNAMENT, payload: tournament });
      return tournament;
    }
  };

  const selectTournament = (tournament) => {
    dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: tournament });
  };

  const startMatch = (match) => {
    dispatch({ type: ACTIONS.START_MATCH, payload: match });
  };

  const completeMatch = async (matchResult) => {
    try {
      // Save to Supabase first
      await matchService.saveMatchResult(matchResult);
    } catch (error) {
      console.error('Error saving match result to Supabase:', error);
      // Continue with local update even if Supabase fails
    }
    
    // Update local state first
    dispatch({ type: ACTIONS.COMPLETE_MATCH, payload: matchResult });
    
    // Save tournament updates to database after state is updated
    // Use setTimeout to ensure state is updated after dispatch
    setTimeout(async () => {
      try {
        // Get the updated tournament from state after dispatch
        const currentState = state;
        if (currentState.currentTournament) {
          // If this is a playoff match, save updated playoff rounds
          if (matchResult.isPlayoff && currentState.currentTournament.playoffs) {
            await tournamentService.updateTournamentPlayoffs(
              currentState.currentTournament.id,
              currentState.currentTournament.playoffs
            );
          }
          
          // If tournament is completed, update status in database
          if (currentState.currentTournament.status === 'completed') {
            await tournamentService.updateTournamentStatus(
              currentState.currentTournament.id,
              'completed'
            );
          }
          
          // Refresh tournament from database to get latest match results with full statistics
          // This ensures statistics view shows the complete match data
          const refreshedTournament = await tournamentService.getTournament(currentState.currentTournament.id);
          dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: refreshedTournament });
        }
      } catch (error) {
        console.error('Error updating tournament in database:', error);
      }
    }, 500); // Increased timeout to ensure database write completes
  };

  const deleteTournament = async (tournamentId) => {
    try {
      await tournamentService.deleteTournament(tournamentId);
      dispatch({ type: ACTIONS.DELETE_TOURNAMENT, payload: tournamentId });
    } catch (error) {
      console.error('Error deleting tournament:', error);
      // Don't remove from local state if database update failed
      throw error;
    }
  };

  const updateTournamentStatus = (tournamentId, status) => {
    dispatch({ type: ACTIONS.UPDATE_TOURNAMENT_STATUS, payload: { id: tournamentId, status } });
  };

  const startPlayoffs = async (playoffsData) => {
    try {
      // Save playoff data to Supabase
      await tournamentService.updateTournamentPlayoffs(state.currentTournament.id, playoffsData);
    } catch (error) {
      console.error('Error saving playoff data to Supabase:', error);
    }
    
    // Update local state
    dispatch({ type: ACTIONS.START_PLAYOFFS, payload: { playoffs: playoffsData } });
  };

  const startTournament = async (groupSettings) => {
    try {
      const updatedTournament = await tournamentService.startTournament(state.currentTournament.id, groupSettings);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      return updatedTournament;
    } catch (error) {
      console.error('Error starting tournament:', error);
      throw error;
    }
  };

  const addPlayerToTournament = async (playerName) => {
    try {
      const newPlayer = await tournamentService.addPlayerToTournament(state.currentTournament.id, playerName);
      // Refresh tournament data to get updated player list
      const updatedTournament = await tournamentService.getTournament(state.currentTournament.id);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      return newPlayer;
    } catch (error) {
      console.error('Error adding player to tournament:', error);
      throw error;
    }
  };

  const removePlayerFromTournament = async (playerId) => {
    try {
      await tournamentService.removePlayerFromTournament(state.currentTournament.id, playerId);
      // Refresh tournament data to get updated player list
      const updatedTournament = await tournamentService.getTournament(state.currentTournament.id);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      return true;
    } catch (error) {
      console.error('Error removing player from tournament:', error);
      throw error;
    }
  };

  const getTournament = async (tournamentId) => {
    try {
      const tournament = await tournamentService.getTournament(tournamentId);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: tournament });
      return tournament;
    } catch (error) {
      console.error('Error loading tournament:', error);
      throw error;
    }
  };

  const updateTournamentSettings = async (tournamentId, settings) => {
    try {
      await tournamentService.updateTournamentSettings(tournamentId, settings);
      // Reload the full tournament to get all data including groups
      const updatedTournament = await tournamentService.getTournament(tournamentId);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      return updatedTournament;
    } catch (error) {
      console.error('Error updating tournament settings:', error);
      throw error;
    }
  };

  const value = {
    ...state,
    createTournament,
    selectTournament,
    getTournament,
    startMatch,
    completeMatch,
    deleteTournament,
    updateTournamentStatus,
    startPlayoffs,
    startTournament,
    addPlayerToTournament,
    removePlayerFromTournament,
    updateTournamentSettings
  };


  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
}

// Custom hook to use tournament context
export function useTournament() {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error('useTournament must be used within a TournamentProvider');
  }
  return context;
}

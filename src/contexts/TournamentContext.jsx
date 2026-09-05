import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { tournamentService, matchService } from '../services/tournamentService.js';
import { leagueService } from '../services/leagueService.js';
import { supabase } from '../lib/supabase.js';
import { enqueueWrite, hasPending, QUEUE_TYPES } from '../lib/offlineQueue.js';


const TournamentContext = createContext();

// Action types
const ACTIONS = {
  CREATE_TOURNAMENT: 'CREATE_TOURNAMENT',
  LOAD_TOURNAMENTS: 'LOAD_TOURNAMENTS',
  SELECT_TOURNAMENT: 'SELECT_TOURNAMENT',
  UPDATE_MATCH_RESULT: 'UPDATE_MATCH_RESULT',
  START_MATCH: 'START_MATCH',
  COMPLETE_MATCH: 'COMPLETE_MATCH',
  APPLY_REMOTE_MATCH_RESULT: 'APPLY_REMOTE_MATCH_RESULT',
  DELETE_TOURNAMENT: 'DELETE_TOURNAMENT',
  START_PLAYOFFS: 'START_PLAYOFFS',
  SET_PLAYOFFS: 'SET_PLAYOFFS'
};

// Session persistence helpers – keep tournament/match IDs across re-mounts
// caused by auth token refreshes, visibility changes, or screen rotation.
const SESSION_TOURNAMENT_KEY = 'darts-current-tournament-id';
const SESSION_MATCH_KEY = 'darts-current-match-id';

function saveSessionIds(tournamentId, matchId) {
  try {
    if (tournamentId) {
      sessionStorage.setItem(SESSION_TOURNAMENT_KEY, tournamentId);
    } else {
      sessionStorage.removeItem(SESSION_TOURNAMENT_KEY);
    }
    if (matchId) {
      sessionStorage.setItem(SESSION_MATCH_KEY, matchId);
    } else {
      sessionStorage.removeItem(SESSION_MATCH_KEY);
    }
  } catch (e) {
    // sessionStorage may be unavailable in some contexts
  }
}

function getSavedSessionIds() {
  try {
    return {
      tournamentId: sessionStorage.getItem(SESSION_TOURNAMENT_KEY),
      matchId: sessionStorage.getItem(SESSION_MATCH_KEY)
    };
  } catch (e) {
    return { tournamentId: null, matchId: null };
  }
}

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
      saveSessionIds(action.payload?.id || null, null);
      return {
        ...state,
        tournaments: [...state.tournaments, action.payload],
        currentTournament: action.payload
      };

    case ACTIONS.LOAD_TOURNAMENTS: {
      // When tournaments reload (e.g. after auth token refresh / visibility change),
      // restore the previously-active tournament and match from sessionStorage
      // so ongoing matches are not lost.
      const loaded = action.payload;
      const saved = getSavedSessionIds();
      let restoredTournament = state.currentTournament;
      let restoredMatch = state.currentMatch;

      if (!restoredTournament && saved.tournamentId) {
        restoredTournament = loaded.find(t => t.id === saved.tournamentId) || null;
      }

      if (!restoredMatch && saved.matchId && restoredTournament) {
        // Search group matches
        const allMatches = (restoredTournament.groups || []).flatMap(g => g.matches || []);
        restoredMatch = allMatches.find(m => m.id === saved.matchId) || null;

        // Also search playoff matches if not found in groups
        if (!restoredMatch && restoredTournament.playoffs?.rounds) {
          for (const round of restoredTournament.playoffs.rounds) {
            const found = (round.matches || []).find(m => m.id === saved.matchId);
            if (found) {
              restoredMatch = found;
              break;
            }
          }
        }
      }

      return {
        ...state,
        tournaments: loaded,
        currentTournament: restoredTournament,
        currentMatch: restoredMatch,
        loading: false
      };
    }

    case ACTIONS.SELECT_TOURNAMENT:
      saveSessionIds(action.payload?.id || null, action.payload ? state.currentMatch?.id || null : null);
      return {
        ...state,
        currentTournament: action.payload,
        // Clear current match if tournament is deselected
        currentMatch: action.payload ? state.currentMatch : null
      };

    case ACTIONS.START_MATCH: {
      saveSessionIds(state.currentTournament?.id || null, action.payload?.id || null);
      // Optimistically mark the match in_progress in the cached tournament.
      // Without this, backing out of the match view mid-match rendered the
      // stale 'pending' card (no continue button) until the next refetch.
      const startedMatchId = action.payload?.id;
      let currentTournament = state.currentTournament;
      if (currentTournament && startedMatchId) {
        const bump = (m) => (m.id === startedMatchId && m.status === 'pending' ? { ...m, status: 'in_progress' } : m);
        currentTournament = {
          ...currentTournament,
          groups: (currentTournament.groups || []).map(g => ({ ...g, matches: (g.matches || []).map(bump) })),
          playoffMatches: (currentTournament.playoffMatches || []).map(bump)
        };
      }
      return {
        ...state,
        currentTournament,
        currentMatch: action.payload
      };
    }

    case ACTIONS.COMPLETE_MATCH: {
      if (!state.currentTournament) {
        console.error('No current tournament to update');
        return state;
      }

      const updatedTournament = applyMatchCompletion(state.currentTournament, action.payload);
      if (!updatedTournament) {
        // Helper could not apply (group/match not found) – leave state untouched
        return state;
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
    }

    case ACTIONS.APPLY_REMOTE_MATCH_RESULT: {
      // A match was completed on another device. Apply the SAME granular
      // transform the scoring device runs, but without any DB side-effects and
      // without touching currentMatch. Only mutates the affected bracket/group
      // subtrees, so React re-renders just the changed cards (no flicker).
      if (!state.currentTournament) return state;

      const matchResult = action.payload;

      // Idempotency guard – ignore our own realtime echo (or duplicate events)
      if (isMatchAlreadyCompleted(state.currentTournament, matchResult)) {
        return state;
      }

      const updatedTournament = applyMatchCompletion(state.currentTournament, matchResult);
      if (!updatedTournament) {
        return state;
      }

      const updatedTournaments = state.tournaments.map(t =>
        t.id === updatedTournament.id ? updatedTournament : t
      );

      return {
        ...state,
        currentTournament: updatedTournament,
        tournaments: updatedTournaments
        // NOTE: currentMatch intentionally left untouched
      };
    }

    case ACTIONS.DELETE_TOURNAMENT:
      return {
        ...state,
        tournaments: state.tournaments.filter(t => t.id !== action.payload),
        currentTournament: state.currentTournament?.id === action.payload ? null : state.currentTournament
      };

    case ACTIONS.SET_PLAYOFFS: {
      // Replace the bracket with the server's copy after complete_playoff_match.
      // The RPC result already contains every other device's advancements, so
      // this only ever adds information to the optimistic local bracket.
      if (!state.currentTournament || state.currentTournament.id !== action.payload.tournamentId) {
        return state;
      }
      const synced = {
        ...state.currentTournament,
        playoffs: action.payload.playoffs,
        status: action.payload.status || state.currentTournament.status
      };
      return {
        ...state,
        currentTournament: synced,
        tournaments: state.tournaments.map(t => (t.id === synced.id ? synced : t))
      };
    }

    case ACTIONS.START_PLAYOFFS:
      if (!state.currentTournament) {
        console.error('No current tournament to start playoffs');
        return state;
      }
      
      const tournamentWithPlayoffs = {
        ...state.currentTournament,
        playoffs: action.payload.playoffs,
        // A tournament whose bracket has just been generated is running again
        status: state.currentTournament.status === 'completed' ? 'started' : state.currentTournament.status
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

// Returns true if the given match is already recorded as completed for the
// same winner – used to ignore a device's own realtime echo / duplicate events.
function isMatchAlreadyCompleted(tournament, matchResult) {
  if (!tournament || !matchResult) return false;

  if (matchResult.isPlayoff && tournament.playoffs?.rounds) {
    for (const round of tournament.playoffs.rounds) {
      const m = (round.matches || []).find(mm => mm.id === matchResult.matchId);
      if (m) {
        return m.status === 'completed' && m.result?.winner === matchResult.winner;
      }
    }
    return false;
  }

  const group = tournament.groups?.find(g =>
    (g.matches || []).some(m => m.id === matchResult.matchId)
  );
  if (!group) return false;
  const m = group.matches.find(mm => mm.id === matchResult.matchId);
  return !!m && m.status === 'completed' && m.result?.winner === matchResult.winner;
}

// Pure transform: apply a completed match result to a tournament and return a
// NEW tournament object (deep-copying only the affected playoff rounds / group
// so unchanged subtrees keep their identity). Returns null if the match's
// group/match cannot be found. Shared by COMPLETE_MATCH (scoring device) and
// APPLY_REMOTE_MATCH_RESULT (watcher devices) so the bracket-advancement and
// standings logic stays identical everywhere.
function applyMatchCompletion(currentTournament, matchResult) {
  const updatedTournament = { ...currentTournament };

  // If a remote payload arrived without the full result JSONB (e.g. a playoff
  // slot completed via the lighter updateMatchResult path), synthesize the
  // minimal shape the standings/bracket logic depends on.
  if (!matchResult.result && matchResult.winner) {
    matchResult = {
      ...matchResult,
      result: {
        winner: matchResult.winner,
        player1Legs: matchResult.player1Legs,
        player2Legs: matchResult.player2Legs
      }
    };
  }

  // Check if this is a playoff match
  if (matchResult.isPlayoff && matchResult.playoffRound) {

    // Find the playoff match in the rounds
    if (updatedTournament.playoffs && updatedTournament.playoffs.rounds) {
      // Deep-copy rounds so React detects state changes
      const rounds = updatedTournament.playoffs.rounds.map(r => ({
        ...r,
        matches: r.matches.map(m => ({ ...m }))
      }));
      updatedTournament.playoffs = { ...updatedTournament.playoffs, rounds };

      let foundMatch = null;
      let foundRoundIndex = -1;

      for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
        const round = rounds[roundIndex];
        if (round.matches) {
          const matchIndex = round.matches.findIndex(m => m.id === matchResult.matchId);
          if (matchIndex !== -1) {
            foundMatch = round.matches[matchIndex];
            foundRoundIndex = roundIndex;
            break;
          }
        }
      }

      if (foundMatch) {
        foundMatch.status = 'completed';
        foundMatch.result = matchResult;

        const p1Name = matchResult.player1Name || foundMatch.player1?.name;
        const p2Name = matchResult.player2Name || foundMatch.player2?.name;
        const winnerPlayer = matchResult.winner === matchResult.player1Id
          ? { id: matchResult.player1Id, name: p1Name }
          : { id: matchResult.player2Id, name: p2Name };

        const loserPlayer = matchResult.winner === matchResult.player1Id
          ? { id: matchResult.player2Id, name: p2Name }
          : { id: matchResult.player1Id, name: p1Name };

        const currentRound = rounds[foundRoundIndex];
        const nonThirdPlaceMatches = currentRound?.matches?.filter(m => !m.isThirdPlaceMatch) || [];
        const isSemifinal = nonThirdPlaceMatches.length === 2 && foundRoundIndex < rounds.length - 1;

        // Use the match's index among non-3rd-place matches for bracket mapping
        const bracketIndex = nonThirdPlaceMatches.findIndex(m => m.id === foundMatch.id);

        if (foundRoundIndex < rounds.length - 1 && bracketIndex !== -1) {
          const nextRound = rounds[foundRoundIndex + 1];
          if (nextRound && nextRound.matches) {
            const nextNonThird = nextRound.matches.filter(m => !m.isThirdPlaceMatch);
            const nextMatchIndex = Math.floor(bracketIndex / 2);
            const nextMatch = nextNonThird[nextMatchIndex];

            if (nextMatch) {
              const isFirstMatchOfPair = (bracketIndex % 2 === 0);

              if (isFirstMatchOfPair) {
                nextMatch.player1 = winnerPlayer;
              } else {
                nextMatch.player2 = winnerPlayer;
              }
              nextMatch.status = 'pending';
            }
          }
        }

        if (isSemifinal && rounds.length > 0) {
          const finalRound = rounds[rounds.length - 1];
          const thirdPlaceMatch = finalRound.matches.find(m => m.isThirdPlaceMatch);

          if (thirdPlaceMatch) {
            const semiBracketIndex = nonThirdPlaceMatches.findIndex(m => m.id === foundMatch.id);
            if (semiBracketIndex === 0) {
              thirdPlaceMatch.player1 = loserPlayer;
            } else if (semiBracketIndex === 1) {
              thirdPlaceMatch.player2 = loserPlayer;
            }

            if (thirdPlaceMatch.player1 && thirdPlaceMatch.player2) {
              thirdPlaceMatch.status = 'pending';
            }
          }
        }

        // Advance playoffs currentRound if all matches in the found round are completed
        const playoffCurrentRound = updatedTournament.playoffs.currentRound;
        if (typeof playoffCurrentRound === 'number' && playoffCurrentRound > 0) {
          const crIdx = Math.max(0, Math.min(playoffCurrentRound - 1, rounds.length - 1));
          const currentRoundObj = rounds[crIdx];
          if (currentRoundObj && currentRoundObj.matches?.length) {
            const allDone = currentRoundObj.matches
              .filter(m => !m.isThirdPlaceMatch)
              .every(m => m.status === 'completed');
            if (allDone && playoffCurrentRound < rounds.length) {
              updatedTournament.playoffs.currentRound = playoffCurrentRound + 1;
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
      return null;
    }

    const match = group.matches?.find(m => m.id === matchResult.matchId);

    if (!match) {
      console.error('Match not found for completion:', matchResult.matchId);
      return null;
    }

    // Deep-copy this group (and its match list) so unchanged groups keep their
    // identity – only the affected group's subtree re-renders.
    const newGroup = {
      ...group,
      matches: group.matches.map(m =>
        m.id === matchResult.matchId
          ? { ...m, result: matchResult, status: 'completed' }
          : m
      )
    };
    updatedTournament.groups = updatedTournament.groups.map(g =>
      g.id === group.id ? newGroup : g
    );

    // Update group standings with tournament settings
    updateGroupStandings(newGroup, updatedTournament);

    // Check if all group matches are completed (for tournaments without playoffs)
    const allGroupMatchesComplete = updatedTournament.groups?.every(g =>
      g.matches?.every(m => m.status === 'completed')
    );

    // If all group matches are complete and playoffs are not enabled or not started, mark tournament as completed
    if (allGroupMatchesComplete) {
      const playoffsEnabled = updatedTournament.playoffSettings?.enabled;
      const hasPlayoffs = updatedTournament.playoffs && updatedTournament.playoffs.rounds && updatedTournament.playoffs.rounds.length > 0;

      // Only a group-only tournament finishes here. With playoffs enabled the
      // bracket still has to be generated and played (completion is handled in
      // the playoff section above) — marking it completed now awarded league
      // points from the group stage alone and hid the bracket behind Summary.
      if (!playoffsEnabled) {
        updatedTournament.status = 'completed';
      } else if (!hasPlayoffs && updatedTournament.status === 'completed') {
        // Repair rows completed prematurely by the old logic.
        updatedTournament.status = 'started';
      }
    }
  }

  return updatedTournament;
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
  const stateRef = useRef(state);
  // Silent refresh bookkeeping (see refreshCurrentTournament)
  const refreshSeqRef = useRef(0);
  const completionsInFlightRef = useRef(0);
  const leaguePointsInFlightRef = useRef(new Set());

  // Keep a ref to the latest state so async callbacks don't use stale closures
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Re-fetch the lightweight tournament list (dashboard / list pages). Keeps
  // currentTournament as is — LOAD_TOURNAMENTS only restores it when missing.
  // Used on mount, on pull-to-refresh and when the app returns to the
  // foreground. Returns true when the list was replaced.
  const reloadTournaments = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    try {
      // Lightweight summary for the list/dashboard -- no nested match rows.
      const tournaments = await tournamentService.getTournamentsSummary();
      dispatch({ type: ACTIONS.LOAD_TOURNAMENTS, payload: tournaments });
      return true;
    } catch (error) {
      console.error('Error loading tournaments:', error);
      return false;
    }
  };

  // Load tournaments from Supabase on mount
  useEffect(() => {
    const loadTournaments = async () => {
      try {
        // Lightweight summary for the list/dashboard -- no nested match rows.
        const tournaments = await tournamentService.getTournamentsSummary();
        dispatch({ type: ACTIONS.LOAD_TOURNAMENTS, payload: tournaments });

        // The summary objects carry empty groups/players. If a tournament was
        // active before a refresh (session restore), re-hydrate its full data
        // so the management/match views render correctly.
        const saved = getSavedSessionIds();
        if (saved.tournamentId) {
          try {
            const full = await tournamentService.getTournament(saved.tournamentId);
            dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: full });
          } catch (hydrateError) {
            console.error('Error hydrating active tournament:', hydrateError);
          }
        }
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

  // Save tournaments to localStorage as backup whenever tournaments change.
  // Strip the heavy subtrees (groups with per-match result JSONB, playoff
  // matches) — after a match completes, the full tournament sits in this list
  // and serializing multi-MB trees on every completion eventually throws
  // QuotaExceededError inside the effect, taking down the React tree mid-match.
  // The backup only feeds the list-view fallback, which needs summaries.
  useEffect(() => {
    if (state.tournaments.length > 0) {
      try {
        const slim = state.tournaments.map(t => {
          const copy = { ...t };
          delete copy.groups;
          delete copy.playoffMatches;
          delete copy.playoffs;
          return copy;
        });
        localStorage.setItem('darts-tournaments', JSON.stringify(slim));
      } catch (storageError) {
        console.warn('Could not persist tournaments backup to localStorage:', storageError);
      }
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
      throw error;
    }
  };

  const selectTournament = (tournament) => {
    dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: tournament });
  };

  const startMatch = (match) => {
    dispatch({ type: ACTIONS.START_MATCH, payload: match });
  };

  // Apply a match result completed on another device (from a realtime event),
  // updating the local bracket/standings granularly without any DB writes.
  const applyRemoteMatchResult = (matchResult) => {
    dispatch({ type: ACTIONS.APPLY_REMOTE_MATCH_RESULT, payload: matchResult });
  };

  const completeMatch = async (matchResult) => {
    // Clear match from session – the match is done, no need to restore it
    saveSessionIds(state.currentTournament?.id || null, null);

    // Block silent refreshes until the deferred DB side-effects below have
    // run: the route we navigate back to would otherwise re-fetch a bracket
    // the server has not advanced yet and could apply it after SET_PLAYOFFS.
    completionsInFlightRef.current += 1;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Known offline – don't even attempt; queue the result so it syncs later.
      enqueueWrite(QUEUE_TYPES.saveMatchResult, matchResult, `result:${matchResult.matchId}`);
    } else {
      try {
        // Save to Supabase first
        await matchService.saveMatchResult(matchResult);
      } catch (error) {
        console.error('Error saving match result to Supabase, queueing for retry:', error);
        // Don't lose the result – queue it for retry when connectivity returns.
        enqueueWrite(QUEUE_TYPES.saveMatchResult, matchResult, `result:${matchResult.matchId}`);
      }
    }

    // Update local state first
    dispatch({ type: ACTIONS.COMPLETE_MATCH, payload: matchResult });
    
    // Save tournament updates to database after state is updated
    // Use setTimeout to ensure state is updated after dispatch
    setTimeout(async () => {
      try {
        // Get the updated tournament from state after dispatch
        const currentState = stateRef.current;
        if (currentState.currentTournament) {
          // The tournament as we know it after this match. For playoff matches
          // it is replaced below by the server's version, which also knows the
          // results other devices saved.
          let finalTournament = currentState.currentTournament;

          // Playoff match: let the database advance the bracket atomically.
          // Previously each device wrote its own copy of the whole playoffs
          // JSONB here, so two boards finishing the two quarterfinals of one
          // semifinal pair overwrote each other's winner. The RPC locks the
          // tournament row and only writes the slots this result owns; we then
          // replace the optimistic local bracket with what the server returns.
          if (matchResult.isPlayoff && currentState.currentTournament.playoffs) {
            const tournamentId = currentState.currentTournament.id;
            try {
              const advanced = await tournamentService.completePlayoffMatch(
                tournamentId,
                matchResult.matchId,
                matchResult
              );
              dispatch({
                type: ACTIONS.SET_PLAYOFFS,
                payload: { tournamentId, playoffs: advanced.playoffs, status: advanced.status }
              });
              finalTournament = {
                ...finalTournament,
                playoffs: advanced.playoffs,
                status: advanced.status || finalTournament.status
              };
            } catch (advanceErr) {
              console.warn('Could not advance playoff bracket in DB, queueing for retry:', advanceErr);
              enqueueWrite(
                QUEUE_TYPES.playoffAdvance,
                { tournamentId, matchId: matchResult.matchId, matchResult },
                `advance:${matchResult.matchId}`
              );
            }
          }
          
          // If tournament is completed, update status in database and settle
          // league points. Decided on finalTournament, not the local snapshot:
          // when the final and the 3rd-place match were played on different
          // boards, neither device's local bracket had both results, so the
          // tournament never completed on its own (seen on 2026-09-04).
          if (finalTournament.status === 'completed') {
            try {
              await tournamentService.updateTournamentStatus(
                currentState.currentTournament.id,
                'completed'
              );
            } catch (statusErr) {
              console.error('Error saving completed status, retrying:', statusErr);
              try {
                await tournamentService.updateTournamentStatus(
                  currentState.currentTournament.id,
                  'completed'
                );
              } catch (retryErr) {
                console.error('Retry also failed:', retryErr);
              }
            }

            if (currentState.currentTournament.leagueId) {
              try {
                await leagueService.calculateTournamentPlacements(
                  currentState.currentTournament.leagueId,
                  currentState.currentTournament.id,
                  finalTournament
                );
              } catch (error) {
                console.error('Error calculating league points:', error);
              }
            }
          }

          // NOTE: A full getTournament() refetch + SELECT_TOURNAMENT dispatch used
          // to run here "to get full statistics". It was removed because it
          // replaced the entire currentTournament object reference and caused a
          // ~500ms flash on return to the management view. COMPLETE_MATCH already
          // stored the full matchResult (incl. all stats) into match.result, and
          // saveMatchResult persisted the same result JSONB to the DB, so the
          // local state is already complete and correct.
        }
      } catch (error) {
        console.error('Error updating tournament in database:', error);
      } finally {
        completionsInFlightRef.current = Math.max(0, completionsInFlightRef.current - 1);
        // Now that everything this device knows is persisted, pull the server's
        // view (which includes what other boards saved meanwhile).
        refreshCurrentTournament();
      }
    }, 500); // Allow the COMPLETE_MATCH dispatch to settle before DB side-effects
  };

  // Re-fetch the current tournament in the background and swap it into state,
  // without any loading UI. Skipped when it could do harm: offline or with
  // queued writes (the server copy would hide results only this device has),
  // while a match completion is still being persisted, or on the match screen
  // (scoring works off currentMatch; nothing there needs the fresh copy).
  // Stale responses are dropped so two overlapping refreshes cannot regress.
  // Returns true when a fresh copy was applied.
  const refreshCurrentTournament = async (expectedId = null) => {
    const current = stateRef.current.currentTournament;
    if (!current?.id || current._summary === true) return false;
    if (expectedId && current.id !== expectedId) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (hasPending()) return false;
    if (completionsInFlightRef.current > 0) return false;
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/match/')) return false;

    const seq = ++refreshSeqRef.current;
    try {
      const fresh = await tournamentService.getTournament(current.id);
      if (seq !== refreshSeqRef.current) return false; // a newer refresh is in flight
      if (stateRef.current.currentTournament?.id !== current.id) return false; // user moved on
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: fresh });
      ensureLeaguePoints(fresh);
      return true;
    } catch (error) {
      console.warn('Background tournament refresh failed:', error);
      return false;
    }
  };

  // Realtime for the open tournament beyond match rows (which the management
  // page handles granularly): the tournament row itself (bracket edits,
  // settings, status), its player list and its registrations. Any change on
  // another device triggers a debounced silent re-fetch here, so the
  // registration page, the match screen and the bracket stay current without
  // anyone pulling to refresh.
  const currentTournamentId = state.currentTournament?.id || null;
  useEffect(() => {
    if (!currentTournamentId) return undefined;
    let timer = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshCurrentTournament(currentTournamentId), 400);
    };
    const channel = supabase
      .channel(`tournament-row-${currentTournamentId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${currentTournamentId}` },
        scheduleRefresh)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_players', filter: `tournament_id=eq.${currentTournamentId}` },
        scheduleRefresh)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tournament_registrations', filter: `tournament_id=eq.${currentTournamentId}` },
        scheduleRefresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTournamentId]);

  // Refresh when the app comes back to the foreground or regains network —
  // the moments a device that sat idle through other boards' results needs it.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshCurrentTournament();
        reloadTournaments();
      }
    };
    const handleOnline = () => {
      refreshCurrentTournament();
      reloadTournaments();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteTournament = async (tournamentId) => {
    try {
      await tournamentService.deleteTournament(tournamentId);
      // Deleting the tournament currently being viewed: drop the persisted
      // session id so the next page load doesn't try (and fail, noisily) to
      // hydrate a deleted tournament.
      if (stateRef.current?.currentTournament?.id === tournamentId) {
        saveSessionIds(null, null);
      }
      dispatch({ type: ACTIONS.DELETE_TOURNAMENT, payload: tournamentId });
    } catch (error) {
      console.error('Error deleting tournament:', error);
      // Don't remove from local state if database update failed
      throw error;
    }
  };

  const startPlayoffs = async (playoffsData) => {
    // Save playoff data to Supabase FIRST — dispatching a bracket that never
    // persisted means matches get played against a bracket that vanishes on
    // refresh (and other devices never see the playoffs at all).
    await tournamentService.updateTournamentPlayoffs(state.currentTournament.id, playoffsData);
    if (state.currentTournament.status === 'completed') {
      // Rows completed prematurely (group stage done, bracket not yet generated)
      await tournamentService.updateTournamentStatus(state.currentTournament.id, 'started');
    }

    // Update local state only after the DB write succeeded
    dispatch({ type: ACTIONS.START_PLAYOFFS, payload: { playoffs: playoffsData } });
  };

  const resetPlayoffs = async () => {
    try {
      // Clear playoff data in database
      await tournamentService.resetTournamentPlayoffs(state.currentTournament.id);
      
      // Reload the tournament to get fresh state
      const updatedTournament = await tournamentService.getTournament(state.currentTournament.id);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      
      return updatedTournament;
    } catch (error) {
      console.error('Error resetting playoffs:', error);
      throw error;
    }
  };

  const startTournament = async (groupSettings, customGroups = null) => {
    try {
      const updatedTournament = await tournamentService.startTournament(
        state.currentTournament.id,
        groupSettings,
        customGroups
      );
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

  // A completed league tournament whose points were never recorded (the
  // finishing device was offline, or — before record_league_tournament_results
  // existed — a scorer without league-manager rights) gets them recorded by
  // the next device that loads it and is allowed to. Idempotent; failures are
  // expected for plain viewers and stay silent.
  const ensureLeaguePoints = (tournament) => {
    if (!tournament?.id || !tournament.leagueId) return;
    if (tournament.status !== 'completed' || tournament.league_points_calculated !== false) return;
    if (!stateRef.current || leaguePointsInFlightRef.current.has(tournament.id)) return;
    leaguePointsInFlightRef.current.add(tournament.id);
    leagueService
      .calculateTournamentPlacements(tournament.leagueId, tournament.id, tournament)
      .catch(() => {})
      .finally(() => leaguePointsInFlightRef.current.delete(tournament.id));
  };

  const getTournament = async (tournamentId) => {
    try {
      const tournament = await tournamentService.getTournament(tournamentId);
      dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: tournament });
      ensureLeaguePoints(tournament);
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

  // === Tournament Self-Registration ===

  const registerForTournament = async (tournamentId, playerName) => {
    try {
      return await tournamentService.registerForTournament(tournamentId, playerName);
    } catch (error) {
      console.error('Error registering for tournament:', error);
      throw error;
    }
  };

  const getTournamentRegistrations = async (tournamentId) => {
    try {
      return await tournamentService.getTournamentRegistrations(tournamentId);
    } catch (error) {
      console.error('Error fetching registrations:', error);
      throw error;
    }
  };

  const approveRegistration = async (registrationId) => {
    try {
      const result = await tournamentService.approveRegistration(registrationId);
      if (state.currentTournament) {
        const updatedTournament = await tournamentService.getTournament(state.currentTournament.id);
        dispatch({ type: ACTIONS.SELECT_TOURNAMENT, payload: updatedTournament });
      }
      return result;
    } catch (error) {
      console.error('Error approving registration:', error);
      throw error;
    }
  };

  const rejectRegistration = async (registrationId) => {
    try {
      return await tournamentService.rejectRegistration(registrationId);
    } catch (error) {
      console.error('Error rejecting registration:', error);
      throw error;
    }
  };

  const withdrawRegistration = async (registrationId) => {
    try {
      return await tournamentService.withdrawRegistration(registrationId);
    } catch (error) {
      console.error('Error withdrawing registration:', error);
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
    applyRemoteMatchResult,
    deleteTournament,
    startPlayoffs,
    resetPlayoffs,
    startTournament,
    addPlayerToTournament,
    removePlayerFromTournament,
    updateTournamentSettings,
    refreshCurrentTournament,
    reloadTournaments,
    registerForTournament,
    getTournamentRegistrations,
    approveRegistration,
    rejectRegistration,
    withdrawRegistration
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

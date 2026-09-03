import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { leagueService } from '../services/leagueService.js';

const LeagueContext = createContext();

// Action types
const ACTIONS = {
  CREATE_LEAGUE: 'CREATE_LEAGUE',
  LOAD_LEAGUES: 'LOAD_LEAGUES',
  SELECT_LEAGUE: 'SELECT_LEAGUE',
  UPDATE_LEAGUE: 'UPDATE_LEAGUE',
  DELETE_LEAGUE: 'DELETE_LEAGUE',
  ADD_MEMBERS: 'ADD_MEMBERS',
  UPDATE_MEMBER: 'UPDATE_MEMBER',
  REMOVE_MEMBER: 'REMOVE_MEMBER',
  UPDATE_LEADERBOARD: 'UPDATE_LEADERBOARD',
  LINK_TOURNAMENT: 'LINK_TOURNAMENT',
  UNLINK_TOURNAMENT: 'UNLINK_TOURNAMENT'
};

// Initial state
const initialState = {
  leagues: [],
  currentLeague: null,
  loading: true, // until the first LOAD_LEAGUES — avoids flashing the empty state
  error: null
};

// Reducer
function leagueReducer(state, action) {
  switch (action.type) {
    case ACTIONS.CREATE_LEAGUE:
      return {
        ...state,
        leagues: [...state.leagues, action.payload],
        currentLeague: action.payload
      };

    case ACTIONS.LOAD_LEAGUES:
      return {
        ...state,
        leagues: action.payload,
        loading: false
      };

    case ACTIONS.SELECT_LEAGUE:
      return {
        ...state,
        currentLeague: action.payload
      };

    case ACTIONS.UPDATE_LEAGUE:
      return {
        ...state,
        leagues: state.leagues.map(l =>
          l.id === action.payload.id ? { ...l, ...action.payload } : l
        ),
        // Merge instead of replace: the service payload carries only base
        // columns, and replacing dropped members/leaderboard/tournaments from
        // currentLeague (lists went empty after saving league settings).
        currentLeague: state.currentLeague?.id === action.payload.id
          ? { ...state.currentLeague, ...action.payload }
          : state.currentLeague
      };

    case ACTIONS.DELETE_LEAGUE:
      return {
        ...state,
        leagues: state.leagues.filter(l => l.id !== action.payload),
        currentLeague: state.currentLeague?.id === action.payload ? null : state.currentLeague
      };

    case ACTIONS.ADD_MEMBERS: {
      if (!state.currentLeague) return state;
      // Upserted members come back for existing rows too — replace matching
      // entries instead of blindly appending duplicates.
      const existingMembers = state.currentLeague.members || [];
      const incomingIds = new Set(action.payload.map(m => m.player?.id || m.playerId));
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          members: [
            ...existingMembers.filter(m => !incomingIds.has(m.player?.id || m.playerId)),
            ...action.payload
          ]
        }
      };
    }

    case ACTIONS.UPDATE_MEMBER:
      if (!state.currentLeague) return state;
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          members: state.currentLeague.members.map(m =>
            m.player.id === action.payload.player.id ? action.payload : m
          )
        }
      };

    case ACTIONS.REMOVE_MEMBER:
      if (!state.currentLeague) return state;
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          members: state.currentLeague.members.filter(m =>
            m.player.id !== action.payload
          )
        }
      };

    case ACTIONS.UPDATE_LEADERBOARD:
      if (!state.currentLeague) return state;
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          leaderboard: action.payload
        }
      };

    case ACTIONS.LINK_TOURNAMENT:
      if (!state.currentLeague) return state;
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          tournaments: [...(state.currentLeague.tournaments || []), action.payload]
        }
      };

    case ACTIONS.UNLINK_TOURNAMENT:
      if (!state.currentLeague) return state;
      return {
        ...state,
        currentLeague: {
          ...state.currentLeague,
          tournaments: (state.currentLeague.tournaments || []).filter(t => t.id !== action.payload)
        }
      };

    default:
      return state;
  }
}

// Context Provider
export function LeagueProvider({ children }) {
  const [state, dispatch] = useReducer(leagueReducer, initialState);

  // Load leagues from Supabase on mount
  useEffect(() => {
    const loadLeagues = async () => {
      try {
        const leagues = await leagueService.getLeagues();
        dispatch({ type: ACTIONS.LOAD_LEAGUES, payload: leagues });
      } catch (error) {
        console.error('Error loading leagues:', error);
        dispatch({ type: ACTIONS.LOAD_LEAGUES, payload: [] });
      }
    };

    loadLeagues();
  }, []);

  // Actions
  const createLeague = async (leagueData) => {
    try {
      const league = await leagueService.createLeague(leagueData);
      dispatch({ type: ACTIONS.CREATE_LEAGUE, payload: league });
      return league;
    } catch (error) {
      console.error('Error creating league:', error);
      throw error;
    }
  };

  const selectLeague = async (leagueId) => {
    try {
      const league = await leagueService.getLeague(leagueId);
      dispatch({ type: ACTIONS.SELECT_LEAGUE, payload: league });
      return league;
    } catch (error) {
      console.error('Error loading league:', error);
      throw error;
    }
  };

  const updateLeague = async (leagueId, updates) => {
    try {
      const updatedLeague = await leagueService.updateLeague(leagueId, updates);
      dispatch({ type: ACTIONS.UPDATE_LEAGUE, payload: updatedLeague });
      return updatedLeague;
    } catch (error) {
      console.error('Error updating league:', error);
      throw error;
    }
  };

  const deleteLeague = async (leagueId) => {
    try {
      await leagueService.deleteLeague(leagueId);
      dispatch({ type: ACTIONS.DELETE_LEAGUE, payload: leagueId });
    } catch (error) {
      console.error('Error deleting league:', error);
      throw error;
    }
  };

  const addMembers = async (leagueId, players) => {
    try {
      const members = await leagueService.addMembers(leagueId, players);
      if (state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.ADD_MEMBERS, payload: members });
      }
      return members;
    } catch (error) {
      console.error('Error adding members:', error);
      throw error;
    }
  };

  const updateMemberStatus = async (leagueId, playerId, updates) => {
    try {
      const member = await leagueService.updateMemberStatus(leagueId, playerId, updates);
      if (state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.UPDATE_MEMBER, payload: member });
      }
      return member;
    } catch (error) {
      console.error('Error updating member status:', error);
      throw error;
    }
  };

  const removeMember = async (leagueId, playerId) => {
    try {
      await leagueService.removeMember(leagueId, playerId);
      if (state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.REMOVE_MEMBER, payload: playerId });
      }
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  };

  const getUnlinkedTournaments = async () => {
    try {
      return await leagueService.getUnlinkedTournaments();
    } catch (error) {
      console.error('Error fetching unlinked tournaments:', error);
      throw error;
    }
  };

  const linkTournamentToLeague = async (leagueId, tournamentId) => {
    try {
      const tournament = await leagueService.linkTournamentToLeague(leagueId, tournamentId);
      if (tournament && state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.LINK_TOURNAMENT, payload: tournament });
        // Refresh leaderboard since points may have been calculated
        const leaderboard = await leagueService.getLeaderboard(leagueId);
        dispatch({ type: ACTIONS.UPDATE_LEADERBOARD, payload: leaderboard });
      }
      return tournament;
    } catch (error) {
      console.error('Error linking tournament to league:', error);
      throw error;
    }
  };

  const unlinkTournamentFromLeague = async (leagueId, tournamentId) => {
    try {
      await leagueService.unlinkTournamentFromLeague(leagueId, tournamentId);
      if (state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.UNLINK_TOURNAMENT, payload: tournamentId });
        // Refresh leaderboard
        const leaderboard = await leagueService.getLeaderboard(leagueId);
        dispatch({ type: ACTIONS.UPDATE_LEADERBOARD, payload: leaderboard });
      }
    } catch (error) {
      console.error('Error unlinking tournament from league:', error);
      throw error;
    }
  };

  const refreshLeaderboard = async (leagueId) => {
    try {
      await leagueService.updateLeaderboard(leagueId);
      const leaderboard = await leagueService.getLeaderboard(leagueId);
      if (state.currentLeague?.id === leagueId) {
        dispatch({ type: ACTIONS.UPDATE_LEADERBOARD, payload: leaderboard });
      }
      return leaderboard;
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);
      throw error;
    }
  };

  // === League Self-Registration ===

  const registerForLeague = async (leagueId, playerName) => {
    try {
      return await leagueService.registerForLeague(leagueId, playerName);
    } catch (error) {
      console.error('Error registering for league:', error);
      throw error;
    }
  };

  const getLeagueRegistrations = async (leagueId) => {
    try {
      return await leagueService.getLeagueRegistrations(leagueId);
    } catch (error) {
      console.error('Error fetching league registrations:', error);
      throw error;
    }
  };

  const approveLeagueRegistration = async (registrationId) => {
    try {
      const result = await leagueService.approveLeagueRegistration(registrationId);
      if (state.currentLeague) {
        const league = await leagueService.getLeague(state.currentLeague.id);
        dispatch({ type: ACTIONS.SELECT_LEAGUE, payload: league });
      }
      return result;
    } catch (error) {
      console.error('Error approving league registration:', error);
      throw error;
    }
  };

  const rejectLeagueRegistration = async (registrationId) => {
    try {
      return await leagueService.rejectLeagueRegistration(registrationId);
    } catch (error) {
      console.error('Error rejecting league registration:', error);
      throw error;
    }
  };

  const withdrawLeagueRegistration = async (registrationId) => {
    try {
      return await leagueService.withdrawLeagueRegistration(registrationId);
    } catch (error) {
      console.error('Error withdrawing league registration:', error);
      throw error;
    }
  };

  const value = {
    ...state,
    createLeague,
    selectLeague,
    updateLeague,
    deleteLeague,
    addMembers,
    updateMemberStatus,
    removeMember,
    refreshLeaderboard,
    getUnlinkedTournaments,
    linkTournamentToLeague,
    unlinkTournamentFromLeague,
    registerForLeague,
    getLeagueRegistrations,
    approveLeagueRegistration,
    rejectLeagueRegistration,
    withdrawLeagueRegistration
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}

// Custom hook to use league context
export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
}



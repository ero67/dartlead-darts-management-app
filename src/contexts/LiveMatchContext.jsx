import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const LiveMatchContext = createContext();

// Action types
const ACTIONS = {
  START_LIVE_MATCH: 'START_LIVE_MATCH',
  END_LIVE_MATCH: 'END_LIVE_MATCH',
  UPDATE_LIVE_MATCH: 'UPDATE_LIVE_MATCH',
  SYNC_LIVE_MATCHES: 'SYNC_LIVE_MATCHES',
  DEVICE_CONNECTED: 'DEVICE_CONNECTED',
  DEVICE_DISCONNECTED: 'DEVICE_DISCONNECTED',
  SET_DEVICE_INFO: 'SET_DEVICE_INFO',
  SET_FAVORITE_GROUPS: 'SET_FAVORITE_GROUPS',
  TOGGLE_FAVORITE_GROUP: 'TOGGLE_FAVORITE_GROUP'
};

// Initial state
const initialState = {
  liveMatches: new Map(), // Map of matchId -> { deviceId, startedAt, lastUpdate }
  deviceId: null,
  deviceName: null,      // User-friendly device name (e.g., "Terč 1")
  boardNumber: null,     // Board number for tournament display
  isOnline: true,
  lastSync: null,
  favoriteGroups: {}     // Object: { tournamentId: [groupId1, groupId2, ...] }
};

// Reducer
function liveMatchReducer(state, action) {
  switch (action.type) {
    case ACTIONS.START_LIVE_MATCH:
      return {
        ...state,
        liveMatches: new Map(state.liveMatches).set(action.payload.matchId, {
          deviceId: action.payload.deviceId,
          deviceName: action.payload.deviceName,
          boardNumber: action.payload.boardNumber,
          startedAt: action.payload.startedAt,
          lastUpdate: Date.now(),
          matchData: action.payload.matchData,
          userId: action.payload.userId,
          userEmail: action.payload.userEmail
        })
      };

    case ACTIONS.END_LIVE_MATCH:
      const newLiveMatches = new Map(state.liveMatches);
      newLiveMatches.delete(action.payload.matchId);
      return {
        ...state,
        liveMatches: newLiveMatches
      };

    case ACTIONS.UPDATE_LIVE_MATCH:
      const updatedLiveMatches = new Map(state.liveMatches);
      if (updatedLiveMatches.has(action.payload.matchId)) {
        const existing = updatedLiveMatches.get(action.payload.matchId);
        updatedLiveMatches.set(action.payload.matchId, {
          ...existing,
          lastUpdate: Date.now(),
          matchData: action.payload.matchData
        });
      }
      return {
        ...state,
        liveMatches: updatedLiveMatches
      };

    case ACTIONS.SYNC_LIVE_MATCHES:
      return {
        ...state,
        liveMatches: new Map(action.payload.liveMatches),
        lastSync: Date.now()
      };

    case ACTIONS.DEVICE_CONNECTED:
      return {
        ...state,
        deviceId: action.payload.deviceId,
        deviceName: action.payload.deviceName || null,
        boardNumber: action.payload.boardNumber || null,
        isOnline: true
      };

    case ACTIONS.DEVICE_DISCONNECTED:
      return {
        ...state,
        isOnline: false
      };

    case ACTIONS.SET_DEVICE_INFO:
      return {
        ...state,
        deviceName: action.payload.deviceName,
        boardNumber: action.payload.boardNumber
      };

    case ACTIONS.SET_FAVORITE_GROUPS:
      return {
        ...state,
        favoriteGroups: action.payload.favoriteGroups
      };

    case ACTIONS.TOGGLE_FAVORITE_GROUP: {
      const { tournamentId, groupId } = action.payload;
      const currentFavorites = state.favoriteGroups[tournamentId] || [];
      const isCurrentlyFavorite = currentFavorites.includes(groupId);
      
      let newFavorites;
      if (isCurrentlyFavorite) {
        // Remove from favorites
        newFavorites = currentFavorites.filter(id => id !== groupId);
      } else {
        // Add to favorites
        newFavorites = [...currentFavorites, groupId];
      }
      
      return {
        ...state,
        favoriteGroups: {
          ...state.favoriteGroups,
          [tournamentId]: newFavorites
        }
      };
    }

    default:
      return state;
  }
}

// Generate unique device ID
const generateDeviceId = () => {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Context Provider
export function LiveMatchProvider({ children }) {
  const [state, dispatch] = useReducer(liveMatchReducer, initialState);
  const { user } = useAuth();

  // Initialize device ID and load device info
  useEffect(() => {
    const deviceId = localStorage.getItem('darts-device-id') || generateDeviceId();
    localStorage.setItem('darts-device-id', deviceId);
    
    // Load device info from localStorage
    const savedDeviceInfo = localStorage.getItem('darts-device-info');
    let deviceName = null;
    let boardNumber = null;
    
    if (savedDeviceInfo) {
      try {
        const parsed = JSON.parse(savedDeviceInfo);
        deviceName = parsed.deviceName || null;
        boardNumber = parsed.boardNumber || null;
      } catch (error) {
        console.error('Error parsing device info:', error);
      }
    }
    
    // Load favorite groups from localStorage
    const savedFavoriteGroups = localStorage.getItem('darts-favorite-groups');
    if (savedFavoriteGroups) {
      try {
        const parsed = JSON.parse(savedFavoriteGroups);
        dispatch({ type: ACTIONS.SET_FAVORITE_GROUPS, payload: { favoriteGroups: parsed } });
      } catch (error) {
        console.error('Error parsing favorite groups:', error);
      }
    }
    
    dispatch({ 
      type: ACTIONS.DEVICE_CONNECTED, 
      payload: { deviceId, deviceName, boardNumber } 
    });
  }, []);

  // Load live matches from localStorage on mount
  useEffect(() => {
    const savedLiveMatches = localStorage.getItem('darts-live-matches');
    if (savedLiveMatches) {
      try {
        const liveMatchesData = JSON.parse(savedLiveMatches);
        const liveMatchesMap = new Map(liveMatchesData);
        
        // Clean up old matches (older than 1 hour) and completed matches
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const cleanedMatches = new Map();
        
        for (const [matchId, matchData] of liveMatchesMap) {
          // Skip if match is marked as completed in matchData
          if (matchData.matchData?.matchComplete || matchData.matchData?.status === 'completed') {
            continue;
          }
          
          // Skip if match is older than 1 hour
          if (matchData.lastUpdate > oneHourAgo) {
            cleanedMatches.set(matchId, matchData);
          }
        }
        
        // Update localStorage with cleaned matches
        if (cleanedMatches.size !== liveMatchesMap.size) {
          if (cleanedMatches.size > 0) {
            localStorage.setItem('darts-live-matches', JSON.stringify(Array.from(cleanedMatches)));
          } else {
            localStorage.removeItem('darts-live-matches');
          }
        }
        
        dispatch({ type: ACTIONS.SYNC_LIVE_MATCHES, payload: { liveMatches: Array.from(cleanedMatches) } });
      } catch (error) {
        console.error('Error loading live matches:', error);
      }
    }
  }, []);

  // Save live matches to localStorage whenever they change
  useEffect(() => {
    if (state.liveMatches.size > 0) {
      localStorage.setItem('darts-live-matches', JSON.stringify(Array.from(state.liveMatches)));
    } else {
      // Clear localStorage if no live matches
      localStorage.removeItem('darts-live-matches');
    }
  }, [state.liveMatches]);

  // Clean up old matches periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const cleanedMatches = new Map();
      
      for (const [matchId, matchData] of state.liveMatches) {
        if (matchData.lastUpdate > oneHourAgo) {
          cleanedMatches.set(matchId, matchData);
        }
      }
      
      if (cleanedMatches.size !== state.liveMatches.size) {
        dispatch({ type: ACTIONS.SYNC_LIVE_MATCHES, payload: { liveMatches: Array.from(cleanedMatches) } });
      }
    }, 5 * 60 * 1000); // Clean up every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [state.liveMatches]);

  // Set device info (name and board number)
  const setDeviceInfo = (deviceName, boardNumber) => {
    // Save to localStorage
    const deviceInfo = { deviceName, boardNumber };
    localStorage.setItem('darts-device-info', JSON.stringify(deviceInfo));
    
    // Update state
    dispatch({ 
      type: ACTIONS.SET_DEVICE_INFO, 
      payload: { deviceName, boardNumber } 
    });
  };

  // Toggle favorite group for a tournament
  const toggleFavoriteGroup = (tournamentId, groupId) => {
    dispatch({ 
      type: ACTIONS.TOGGLE_FAVORITE_GROUP, 
      payload: { tournamentId, groupId } 
    });
  };

  // Save favorite groups to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(state.favoriteGroups).length > 0) {
      localStorage.setItem('darts-favorite-groups', JSON.stringify(state.favoriteGroups));
    }
  }, [state.favoriteGroups]);

  // Check if a group is favorited
  const isGroupFavorite = (tournamentId, groupId) => {
    const favorites = state.favoriteGroups[tournamentId] || [];
    return favorites.includes(groupId);
  };

  // Get favorite groups for a tournament
  const getFavoriteGroups = (tournamentId) => {
    return state.favoriteGroups[tournamentId] || [];
  };

  // Check if tournament has any favorite groups
  const hasFavoriteGroups = (tournamentId) => {
    const favorites = state.favoriteGroups[tournamentId] || [];
    return favorites.length > 0;
  };

  // Clear all favorite groups for a tournament
  const clearFavoriteGroups = (tournamentId) => {
    const newFavorites = { ...state.favoriteGroups };
    delete newFavorites[tournamentId];
    dispatch({ type: ACTIONS.SET_FAVORITE_GROUPS, payload: { favoriteGroups: newFavorites } });
    localStorage.setItem('darts-favorite-groups', JSON.stringify(newFavorites));
  };

  // Actions
  const startLiveMatch = (matchId, matchData) => {
    const liveMatchData = {
      matchId,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      boardNumber: state.boardNumber,
      startedAt: Date.now(),
      matchData,
      userId: user?.id,
      userEmail: user?.email
    };
    
    dispatch({ type: ACTIONS.START_LIVE_MATCH, payload: liveMatchData });
    return liveMatchData;
  };

  const endLiveMatch = (matchId) => {
    dispatch({ type: ACTIONS.END_LIVE_MATCH, payload: { matchId } });
    // Also remove from localStorage immediately
    const savedLiveMatches = localStorage.getItem('darts-live-matches');
    if (savedLiveMatches) {
      try {
        const liveMatchesData = JSON.parse(savedLiveMatches);
        const liveMatchesMap = new Map(liveMatchesData);
        liveMatchesMap.delete(matchId);
        if (liveMatchesMap.size > 0) {
          localStorage.setItem('darts-live-matches', JSON.stringify(Array.from(liveMatchesMap)));
        } else {
          localStorage.removeItem('darts-live-matches');
        }
      } catch (error) {
        console.error('Error removing live match from localStorage:', error);
      }
    }
  };

  const updateLiveMatch = (matchId, matchData) => {
    dispatch({ type: ACTIONS.UPDATE_LIVE_MATCH, payload: { matchId, matchData } });
  };

  const isMatchLive = (matchId) => {
    return state.liveMatches.has(matchId);
  };

  const isMatchLiveOnThisDevice = (matchId) => {
    const liveMatch = state.liveMatches.get(matchId);
    return liveMatch && liveMatch.deviceId === state.deviceId;
  };

  const isMatchStartedByCurrentUser = (matchId, matchData = null) => {
    // Check live match context first
    const liveMatch = state.liveMatches.get(matchId);
    if (liveMatch && liveMatch.userId === user?.id) {
      return true;
    }
    
    // Check database field if match data is provided
    if (matchData && matchData.startedByUserId === user?.id) {
      return true;
    }
    
    return false;
  };

  const getLiveMatchInfo = (matchId) => {
    return state.liveMatches.get(matchId);
  };

  const getAllLiveMatches = () => {
    return Array.from(state.liveMatches.entries()).map(([matchId, data]) => ({
      matchId,
      ...data
    }));
  };

  const value = {
    ...state,
    startLiveMatch,
    endLiveMatch,
    updateLiveMatch,
    isMatchLive,
    isMatchLiveOnThisDevice,
    isMatchStartedByCurrentUser,
    getLiveMatchInfo,
    getAllLiveMatches,
    setDeviceInfo,
    // Favorite groups
    toggleFavoriteGroup,
    isGroupFavorite,
    getFavoriteGroups,
    hasFavoriteGroups,
    clearFavoriteGroups
  };

  return (
    <LiveMatchContext.Provider value={value}>
      {children}
    </LiveMatchContext.Provider>
  );
}

// Custom hook to use live match context
export function useLiveMatch() {
  const context = useContext(LiveMatchContext);
  if (!context) {
    throw new Error('useLiveMatch must be used within a LiveMatchProvider');
  }
  return context;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { leagueService } from '../services/leagueService';

const AdminContext = createContext();

export function AdminProvider({ children }) {
  const { user } = useAuth();
  const [isAdminMode, setIsAdminMode] = useState(false);

  // Roles live in app_metadata only (server-managed). user_metadata is
  // editable by the user themselves and must never gate authority.
  const isAdmin = user?.app_metadata?.role === 'admin';

  const isManager = user?.app_metadata?.role === 'manager';

  // Co-managers ride on another manager's league (league_managers table):
  // they get the manager UI and full rights inside those leagues, but no role
  // and no right to create standalone tournaments or new leagues.
  const [isLeagueManager, setIsLeagueManager] = useState(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId || isAdmin || isManager) {
      setIsLeagueManager(false);
      return;
    }
    let cancelled = false;
    leagueService.managesAnyLeague().then(result => {
      if (!cancelled) setIsLeagueManager(result);
    });
    return () => { cancelled = true; };
  }, [userId, isAdmin, isManager]);

  // Check if user can create tournaments (admin or manager)
  const canCreateTournaments = isAdmin || isManager;

  // Anyone who should see the manager panel / dashboard
  const canManage = isAdmin || isManager || isLeagueManager;

  // Admin functions for correcting mistakes
  const adminFunctions = {
    // Reset match to previous state
    resetMatch: (matchId, previousState) => {
      console.log('Admin: Resetting match', matchId, 'to state:', previousState);
      // This would be implemented to reset a match to a previous state
    },

    // Correct player score
    correctScore: (matchId, playerId, newScore) => {
      console.log('Admin: Correcting score for match', matchId, 'player', playerId, 'to', newScore);
      // This would be implemented to correct a player's score
    },

    // Add/remove leg
    adjustLegs: (matchId, playerId, legChange) => {
      console.log('Admin: Adjusting legs for match', matchId, 'player', playerId, 'by', legChange);
      // This would be implemented to add or remove legs
    },

    // Force complete match
    forceCompleteMatch: (matchId, result) => {
      console.log('Admin: Force completing match', matchId, 'with result:', result);
      // This would be implemented to force complete a match
    },

    // Edit tournament settings
    editTournament: (tournamentId, updates) => {
      console.log('Admin: Editing tournament', tournamentId, 'with updates:', updates);
      // This would be implemented to edit tournament settings
    },

    // Delete tournament
    deleteTournament: (tournamentId) => {
      console.log('Admin: Deleting tournament', tournamentId);
      // This would be implemented to delete a tournament
    }
  };

  const value = {
    isAdmin,
    isManager,
    isLeagueManager,
    canManage,
    canCreateTournaments,
    refreshLeagueManagerStatus: () => leagueService.managesAnyLeague().then(setIsLeagueManager),
    isAdminMode,
    setIsAdminMode,
    adminFunctions
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}

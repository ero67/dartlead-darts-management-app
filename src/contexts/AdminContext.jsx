import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const AdminContext = createContext();

export function AdminProvider({ children }) {
  const { user } = useAuth();
  const [isAdminMode, setIsAdminMode] = useState(false);

  // Roles live in app_metadata only (server-managed). user_metadata is
  // editable by the user themselves and must never gate authority.
  const isAdmin = user?.app_metadata?.role === 'admin';

  const isManager = user?.app_metadata?.role === 'manager';

  // Check if user can create tournaments (admin or manager)
  const canCreateTournaments = isAdmin || isManager;

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
    canCreateTournaments,
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

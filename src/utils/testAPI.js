/**
 * Test API for Cypress E2E tests
 * This file exposes helper functions that can be used in tests
 * Only available in development mode when Cypress is detected
 */

import { matchService } from '../services/tournamentService'

// Contract-shaped Cricket stats: player 1 wins the first p1Legs legs.
const cricketTestStats = (p1Legs, p2Legs, isPlayer1) => ({
  darts: 60, marks: 40, mpr: 2, points: 120, bestVisit: 6, fiveMarkVisits: 1, nineMarkVisits: 0,
  legs: Array.from({ length: p1Legs + p2Legs }, (_, i) => ({
    leg: i + 1, darts: 30, marks: 20, mpr: 2, points: 60,
    isWin: isPlayer1 ? i < p1Legs : i >= p1Legs, byBullup: false
  }))
})

/**
 * Initialize test API if in development and Cypress is detected
 */
export function initTestAPI() {
  // Only in development and when Cypress is running
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.Cypress) {
    window.testAPI = {
      /**
       * Complete a match directly via API
       * @param {string} matchId - Match ID
       * @param {object} result - Match result; gameType 'cricket' sends a Cricket result
       */
      completeMatch: async (matchId, result) => {
        const player1Legs = result.player1Legs || 2
        const player2Legs = result.player2Legs || 0
        const matchResult = result.gameType === 'cricket' ? {
          matchId,
          gameType: 'cricket',
          winner: result.winner === 'player1' ? result.player1Id : result.player2Id,
          player1Id: result.player1Id,
          player2Id: result.player2Id,
          player1Legs,
          player2Legs,
          player1Stats: result.player1Stats || cricketTestStats(player1Legs, player2Legs, true),
          player2Stats: result.player2Stats || cricketTestStats(player1Legs, player2Legs, false)
        } : {
          matchId,
          winner: result.winner === 'player1' ? result.player1Id : result.player2Id,
          player1Id: result.player1Id,
          player2Id: result.player2Id,
          player1Legs: result.player1Legs || 2,
          player2Legs: result.player2Legs || 0,
          player1Stats: result.player1Stats || {
            totalScore: 1503,
            totalDarts: 60,
            average: 75.15,
            legAverages: [75.15, 75.15],
            checkouts: [],
            legs: []
          },
          player2Stats: result.player2Stats || {
            totalScore: 0,
            totalDarts: 0,
            average: 0,
            legAverages: [],
            checkouts: [],
            legs: []
          }
        }
        
        try {
          await matchService.saveMatchResult(matchResult)
          return { success: true }
        } catch (error) {
          console.error('Test API: Error completing match:', error)
          return { success: false, error }
        }
      },

      /**
       * Get all matches for a tournament
       * @param {string} tournamentId - Tournament ID
       */
      getTournamentMatches: async (tournamentId) => {
        try {
          const { supabase } = await import('../lib/supabase.js')
          const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('created_at', { ascending: true })
          
          if (error) {
            console.error('Test API: Error getting matches:', error)
            return []
          }
          
          return data || []
        } catch (error) {
          console.error('Test API: Error in getTournamentMatches:', error)
          return []
        }
      },

      /**
       * Get all matches for a group
       * @param {string} groupId - Group ID
       */
      getGroupMatches: async (groupId) => {
        try {
          const { supabase } = await import('../lib/supabase.js')
          const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })
          
          if (error) {
            console.error('Test API: Error getting group matches:', error)
            return []
          }
          
          return data || []
        } catch (error) {
          console.error('Test API: Error in getGroupMatches:', error)
          return []
        }
      },

      /**
       * Get all groups for current tournament
       * @param {string} tournamentId - Tournament ID
       */
      getAllGroups: async (tournamentId) => {
        try {
          const { supabase } = await import('../lib/supabase.js')
          const { data, error } = await supabase
            .from('groups')
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('name', { ascending: true })
          
          if (error) {
            console.error('Test API: Error getting groups:', error)
            return []
          }
          
          return data || []
        } catch (error) {
          console.error('Test API: Error in getAllGroups:', error)
          return []
        }
      },

      /**
       * Complete all matches in a group
       * @param {string} groupId - Group ID
       * @param {object} options - Options for match completion
       */
      completeGroupMatches: async (groupId, options = {}) => {
        const matches = await window.testAPI.getGroupMatches(groupId)
        const results = []
        
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i]
          // Skip if already completed
          if (match.status === 'completed') {
            continue
          }
          
          // Random winner for variety
          const randomWinner = Math.random() > 0.5 ? 'player1' : 'player2'
          // Database uses player1_id and player2_id
          const player1Id = match.player1_id
          const player2Id = match.player2_id
          
          if (!player1Id || !player2Id) {
            console.warn('Test API: Match missing player IDs:', match.id, match)
            continue
          }
          
          const result = await window.testAPI.completeMatch(match.id, {
            winner: randomWinner,
            player1Id,
            player2Id,
            player1Legs: randomWinner === 'player1' ? 2 : 0,
            player2Legs: randomWinner === 'player2' ? 2 : 0,
            gameType: match.game_type,
            ...options
          })
          results.push(result)
        }
        
        return results
      },

      /**
       * Complete all matches in a tournament (group stage)
       * @param {string} tournamentId - Tournament ID
       * @param {object} options - Options for match completion
       */
      completeAllTournamentMatches: async (tournamentId, options = {}) => {
        const matches = await window.testAPI.getTournamentMatches(tournamentId)
        const incompleteMatches = matches.filter(m => m.status !== 'completed')
        const results = []
        
        console.log(`Test API: Completing ${incompleteMatches.length} matches`)
        
        for (let i = 0; i < incompleteMatches.length; i++) {
          const match = incompleteMatches[i]
          
          // Random winner
          const randomWinner = Math.random() > 0.5 ? 'player1' : 'player2'
          // Database uses player1_id and player2_id
          const player1Id = match.player1_id
          const player2Id = match.player2_id
          
          if (!player1Id || !player2Id) {
            console.warn('Test API: Match missing player IDs:', match.id, match)
            continue
          }
          
          const result = await window.testAPI.completeMatch(match.id, {
            winner: randomWinner,
            player1Id,
            player2Id,
            player1Legs: randomWinner === 'player1' ? 2 : 0,
            player2Legs: randomWinner === 'player2' ? 2 : 0,
            gameType: match.game_type,
            ...options
          })
          
          results.push(result)
          
          // Small delay to avoid overwhelming the database
          if (i < incompleteMatches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        return results
      }
    }
    
    console.log('Test API initialized for Cypress')
  }
}

// Auto-initialize if conditions are met
if (typeof window !== 'undefined') {
  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTestAPI)
  } else {
    initTestAPI()
  }
}


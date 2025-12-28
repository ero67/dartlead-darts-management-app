import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Users, Trophy, Target, Wifi, WifiOff, Eye, Trash2, CheckCircle, Settings, Edit2, ChevronUp, ChevronDown, Clock, Activity, BarChart3, X, Search, Grid3x3, List } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { BracketVisualization } from './BracketVisualization';

  // Generate unique ID for playoff matches (using crypto.randomUUID for proper UUIDs)
  const generateId = () => {
    return crypto.randomUUID();
  };

export function TournamentManagement({ tournament, onMatchStart, onBack, onDeleteTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Valid tabs (will be filtered for playoff-only tournaments)
  const validTabs = ['groups', 'matches', 'standings', 'playoffs', 'statistics', 'liveMatches'];
  
  // Initialize activeTab from URL or default
  const getInitialTab = () => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      return tabFromUrl;
    }
    // For playoff-only tournaments, default to playoffs tab
    if (tournament?.tournamentType === 'playoff_only') {
      return 'playoffs';
    }
    return 'groups';
  };
  
  const [activeTab, setActiveTab] = useState(() => getInitialTab());
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null); // Match being edited
  const [liveMatches, setLiveMatches] = useState([]);
  const [matchStatistics, setMatchStatistics] = useState(null); // Match to show statistics for
  const liveMatchesRef = useRef([]); // Keep a ref to prevent flickering
  const modalOpenRef = useRef(false); // Track if any modal is open
  const activeTabRef = useRef(activeTab); // Track active tab for interval callback
  const [matchGroupFilter, setMatchGroupFilter] = useState('all'); // Filter by group
  const [matchPlayerFilter, setMatchPlayerFilter] = useState(''); // Filter by player name
  const [bracketViewMode, setBracketViewMode] = useState('detailed'); // 'detailed' or 'compact'
  
  // Deduplicate groups - ensure each group appears only once
  const uniqueGroups = useMemo(() => {
    if (!tournament?.groups) return [];
    const seen = new Map();
    return tournament.groups.filter(group => {
      if (seen.has(group.id)) {
        return false;
      }
      seen.set(group.id, true);
      return true;
    });
  }, [tournament?.groups]);

  // Fast lookup sets for current tournament scope
  const tournamentGroupIds = useMemo(() => new Set(uniqueGroups?.map(g => g.id) || []), [uniqueGroups]);
  const tournamentPlayoffIds = useMemo(() => new Set(tournament.playoffMatches?.map(m => m.id) || []), [tournament.playoffMatches]);
  const hasTournamentStarted = useMemo(() => {
    const groupMatches = uniqueGroups?.flatMap(g => g.matches || []) || [];
    const playoffMatches = tournament.playoffMatches || [];
    return [...groupMatches, ...playoffMatches].some(m => m?.status && m.status !== 'pending');
  }, [uniqueGroups, tournament.playoffMatches]);
  
  // Update URL when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    activeTabRef.current = tab; // Update ref immediately
    setSearchParams({ tab });
  };
  
  // Sync activeTab with URL on mount and when URL changes (but not when we programmatically change it)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      activeTabRef.current = tabFromUrl; // Update ref
    } else if (!tabFromUrl && activeTab !== 'groups') {
      // If no tab in URL and we're not on default, update URL
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep ref in sync with activeTab state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  // Sync ref with state whenever state changes
  useEffect(() => {
    liveMatchesRef.current = liveMatches;
  }, [liveMatches]);
  
  // Track modal state in ref so interval callback can check it
  useEffect(() => {
    modalOpenRef.current = showEditSettings || !!editingMatch || !!matchStatistics;
  }, [showEditSettings, editingMatch, matchStatistics]);
  
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
            32: existing.playoffLegsToWin,
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
        seedingMethod: tournament.playoffSettings?.seedingMethod || 'standard',
        groupMatchups: tournament.playoffSettings?.groupMatchups || [],
          legsToWinByRound: {
            32: 3,  // Round of 32
            16: 3,  // Round of 16
            8: 3,   // Quarter-finals
            4: 3,   // Semi-finals
            2: 3    // Final
          }
      };
    })()
  });
  const { isMatchLive, isMatchLiveOnThisDevice, isMatchStartedByCurrentUser, getLiveMatchInfo } = useLiveMatch();
  const { isAdmin, isAdminMode } = useAdmin();
  const { startPlayoffs: contextStartPlayoffs, updateTournamentSettings, getTournament } = useTournament();

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
            qualificationMode: 'perGroup', // 'perGroup' or 'totalPlayers'
            playersPerGroup: 1,
            totalPlayersToAdvance: 8,
          legsToWinByRound: {
            32: 3,  // Round of 32
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

  // Auto-refresh tournament data
  // - Live Matches tab: only poll when there are live matches
  // - Playoffs tab: poll so results from other devices advance the bracket and populate next rounds
  useEffect(() => {
    // Only run auto-refresh when a tab that needs it is active
    if (activeTab !== 'liveMatches' && activeTab !== 'playoffs') {
      return;
    }

    if (!tournament?.id || !getTournament) {
      return;
    }

    // Check if there are any live matches (status === 'in_progress')
    const checkHasLiveMatches = (currentTournament) => {
      if (!currentTournament) return false;
      
      // Check group matches
      const groupMatches = currentTournament?.groups?.flatMap(g => g.matches || []) || [];
      const hasLiveGroupMatch = groupMatches.some(m => m.status === 'in_progress');
      
      // Check playoff matches
      const playoffMatches = currentTournament?.playoffMatches || [];
      const hasLivePlayoffMatch = playoffMatches.some(m => m.status === 'in_progress');
      
      return hasLiveGroupMatch || hasLivePlayoffMatch;
    };

    if (activeTab === 'liveMatches' && !checkHasLiveMatches(tournament)) {
      return; // No live matches, don't set up polling
    }

    if (activeTab === 'playoffs' && (!tournament?.playoffs?.rounds || tournament.playoffs.rounds.length === 0)) {
      return; // No playoff bracket, nothing to keep in sync
    }

    // Set up interval to refresh tournament every 8 seconds
    const refreshInterval = setInterval(async () => {
      try {
        // Skip refresh if any modals are open to prevent them from closing
        if (modalOpenRef.current) {
          return;
        }
        
        // Double-check we're still on the same tab before refreshing (prevents refresh after tab switch)
        const expectedTab = activeTabRef.current;
        if (expectedTab !== 'liveMatches' && expectedTab !== 'playoffs') {
          return;
        }
        
        const refreshedTournament = await getTournament(tournament.id);
        // Check if there are still live matches after refresh
        // If not, the interval will be cleaned up on next render
      } catch (error) {
        console.error('Error refreshing tournament for live matches:', error);
      }
    }, 8000); // 8 seconds

    // Cleanup interval on unmount or when tournament changes
    return () => {
      clearInterval(refreshInterval);
    };
  }, [activeTab, tournament?.id, tournament?.groups, tournament?.playoffMatches, getTournament]);

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
    let hasThirdPlaceMatch = false;

    // Generate rounds from first round to final
    while (currentRoundSize > 1) {
      const numMatches = Math.ceil(currentRoundSize / 2);
      
      const round = {
        id: generateId(),
        name: getRoundNameByMatches(numMatches, rounds.length),
        matches: [],
        isComplete: false
      };

      // Create matches for this round
      for (let i = 0; i < numMatches; i++) {
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
      
      // If we're at semifinals (4 players), add 3rd place match to the final round
      if (currentRoundSize === 4 && !hasThirdPlaceMatch) {
        hasThirdPlaceMatch = true;
        // Add 3rd place match to the final round (which will be created next iteration)
        // We'll add it after the final round is created
      }
      
      currentRoundSize = numMatches;
      roundNumber++;
    }

    // Add 3rd place match if we had semifinals (4 qualifiers)
    if (totalQualifiers === 4 && rounds.length >= 2) {
      const finalRound = rounds[rounds.length - 1];
      finalRound.matches.push({
        id: generateId(),
        player1: null,
        player2: null,
        status: 'pending',
        result: null,
        isPlayoff: true,
        playoffRound: roundNumber - 1,
        playoffMatchNumber: finalRound.matches.length + 1,
        isThirdPlaceMatch: true
      });
    }

    return rounds;
  }, []);

  // Seed first round using standard tournament seeding or group-based seeding
  const seedFirstRound = useCallback((qualifyingPlayers, firstRound, tournament) => {
    if (!firstRound || !firstRound.matches || qualifyingPlayers.length === 0) {
      return firstRound;
    }
    
    const numMatches = firstRound.matches.length;
    const totalPlayers = qualifyingPlayers.length;
    const seedingMethod = tournament?.playoffSettings?.seedingMethod || 'standard';
    
    // Group-based seeding
    if (seedingMethod === 'groupBased' && tournament?.groups && tournament?.playoffSettings?.groupMatchups) {
      const groupMatchups = tournament.playoffSettings.groupMatchups;
      const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 1;
      
      // Get players organized by group
      const playersByGroup = {};
      tournament.groups.forEach(group => {
        if (group.standings && group.standings.length > 0) {
          const sortedStandings = [...group.standings].sort((a, b) => {
            // Use tournament's standings criteria order
            const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
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
                  const aWinsVsB = a.headToHeadWins?.[b.player.id] || 0;
                  const bWinsVsA = b.headToHeadWins?.[a.player.id] || 0;
                  comparison = bWinsVsA - aWinsVsB;
                  break;
              }
              if (comparison !== 0) return comparison;
            }
            return 0;
          });
          
          // Take top N players from this group
          const topPlayers = sortedStandings.slice(0, playersPerGroup).map(s => s.player);
          playersByGroup[group.name] = topPlayers;
        }
      });
      
      // Create matches based on group matchups
      let matchIndex = 0;
      groupMatchups.forEach(matchup => {
        const group1Players = playersByGroup[matchup.group1] || [];
        const group2Players = playersByGroup[matchup.group2] || [];
        
        // Pair players: 1st from Group A vs last from Group D, 2nd from Group A vs second-to-last from Group D, etc.
        const maxPlayers = Math.min(group1Players.length, group2Players.length);
        
        for (let i = 0; i < maxPlayers && matchIndex < numMatches; i++) {
          const match = firstRound.matches[matchIndex];
          // Group 1: position i (0 = 1st, 1 = 2nd, etc.)
          // Group 2: position (maxPlayers - 1 - i) (last, second-to-last, etc.)
          const player1 = group1Players[i];
          const player2 = group2Players[maxPlayers - 1 - i];
          
          if (player1 && player2) {
            match.player1 = player1;
            match.player2 = player2;
            match.status = 'pending';
            matchIndex++;
          }
        }
      });
      
      return firstRound;
    }
    
    // Standard tournament bracket seeding (default)
    // Standard bracket seeding pattern:
    // For 16 players: 1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11
    // Algorithm: Recursively place seeds in bracket positions using standard tournament structure
    const generateBracketPositions = (n) => {
      // Ensure we work with the nearest power of two to avoid infinite recursion on odd sizes
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));

      const helper = (size) => {
        if (size === 1) return [1];
        if (size === 2) return [1, 2];
      
      const result = [];
        const half = size / 2;
        const topHalf = helper(half);
        const bottomHalf = helper(half);
      
      for (let i = 0; i < half; i++) {
        result.push(topHalf[i]);
        result.push(bottomHalf[i] + half);
      }
      
      return result;
      };

      return helper(bracketSize);
    };
    
    // Generate bracket positions (these are the seed numbers in bracket order)
    const bracketPositions = generateBracketPositions(totalPlayers);
    
    // Create pairs: position 0 with position N-1, position 1 with position N-2, etc.
    const pairs = [];
    for (let i = 0; i < numMatches; i++) {
      const pos1 = bracketPositions[i];
      const pos2 = bracketPositions[totalPlayers - 1 - i];
      pairs.push([pos1, pos2]);
    }
    
    // Assign players to matches
    for (let i = 0; i < numMatches && i < pairs.length; i++) {
      const match = firstRound.matches[i];
      const [seed1, seed2] = pairs[i];
      
      // Ensure seeds are valid
      if (seed1 >= 1 && seed1 <= totalPlayers && 
          seed2 >= 1 && seed2 <= totalPlayers && 
          seed1 !== seed2) {
        match.player1 = qualifyingPlayers[seed1 - 1] || null; // Seed 1 = index 0
        match.player2 = qualifyingPlayers[seed2 - 1] || null;
        match.seed1 = seed1;
        match.seed2 = seed2;
        match.status = 'pending';
      }
    }
    
    return firstRound;
  }, []);

  // Populate playoff bracket with qualifying players using proper seeding
  // Seeding: Best vs Worst, 2nd best vs 2nd worst, etc.
  const populatePlayoffBracket = useCallback((qualifyingPlayers, rounds) => {
    
    // If no rounds exist, generate them first
    if (!rounds || rounds.length === 0) {
      rounds = generatePlayoffRounds(qualifyingPlayers.length);
    }
    
    const updatedRounds = [...rounds];
    
    // Automatically seed the first round
    if (updatedRounds.length > 0 && qualifyingPlayers.length > 0) {
      const firstRound = updatedRounds[0];
      // Only seed if first round matches don't have players assigned
      const needsSeeding = firstRound.matches.every(match => !match.player1 && !match.player2);
      
      if (needsSeeding) {
        updatedRounds[0] = seedFirstRound(qualifyingPlayers, firstRound, tournament);
      }
    }
    
    // Ensure all other rounds have proper status
    for (let i = 1; i < updatedRounds.length; i++) {
      updatedRounds[i].matches.forEach(match => {
        // Only reset if match doesn't already have players (preserve existing assignments)
        if (!match.player1 && !match.player2) {
          match.player1 = null;
          match.player2 = null;
          match.status = 'pending';
        }
      });
    }
    
    return updatedRounds;
  }, [generatePlayoffRounds, seedFirstRound]);

  // Note: Removed automatic playoff player assignment - playoffs should only start when user clicks button

  // Check if group stage is complete
  const isGroupStageComplete = () => {
    if (!tournament) return false;
    // For playoff-only tournaments, there is no group stage to complete
    if (tournament.tournamentType === 'playoff_only') {
      return true;
    }
    if (!tournament.groups) return false;
    return tournament.groups.every(group => 
      group.matches.every(match => match.status === 'completed')
    );
  };

  // Get qualifying players based on group standings, sorted by performance for seeding
  const getQualifyingPlayers = () => {
    if (!tournament) return [];
    
    // For playoff-only tournaments, all registered players qualify,
    // sorted by name (or keep current order if you prefer)
    if (tournament.tournamentType === 'playoff_only') {
      const players = tournament.players || [];
      return [...players].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    if (!tournament.groups) return [];
    
    const qualificationMode = tournament.playoffSettings?.qualificationMode || 'perGroup';
    const allQualifyingPlayers = [];
    const allPlayersValue = 9999; // Special value to represent "all players"
    
    if (qualificationMode === 'totalPlayers') {
      // Mode: Total players to advance
      const totalPlayersToAdvance = tournament.playoffSettings?.totalPlayersToAdvance || 8;
      const numberOfGroups = tournament.groups.length;
      const playersPerGroup = Math.floor(totalPlayersToAdvance / numberOfGroups);
      const remainder = totalPlayersToAdvance % numberOfGroups;
      
      // First, collect players from each group (equal distribution)
      const playersByPosition = {}; // position -> array of players from all groups
      
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
          
          // Take playersPerGroup players from this group
          for (let i = 0; i < playersPerGroup && i < sortedStandings.length; i++) {
            const standing = sortedStandings[i];
            allQualifyingPlayers.push({
              player: standing.player,
              groupPosition: i + 1,
              points: standing.points,
              legDifference: standing.legsWon - standing.legsLost,
              average: standing.average || 0,
              groupId: group.id
            });
          }
          
          // Store remaining players by position for remainder selection
          for (let i = playersPerGroup; i < sortedStandings.length; i++) {
            const standing = sortedStandings[i];
            const position = i + 1;
            if (!playersByPosition[position]) {
              playersByPosition[position] = [];
            }
            playersByPosition[position].push({
              player: standing.player,
              groupPosition: position,
              points: standing.points,
              legDifference: standing.legsWon - standing.legsLost,
              average: standing.average || 0,
              groupId: group.id
            });
          }
        }
      });
      
      // If there's a remainder, take the best players from the next position
      if (remainder > 0) {
        const nextPosition = playersPerGroup + 1;
        if (playersByPosition[nextPosition]) {
          // Sort by performance criteria
          const candidates = [...playersByPosition[nextPosition]].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
            if (b.average !== a.average) return b.average - a.average;
            return 0;
          });
          
          // Take top 'remainder' players
          for (let i = 0; i < remainder && i < candidates.length; i++) {
            allQualifyingPlayers.push(candidates[i]);
          }
        }
      }
    } else {
      // Mode: Players per group (original logic)
      const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;
      
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
    }
    
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
    
    // For group-based tournaments, ensure group stage is complete first
    if (tournament.tournamentType !== 'playoff_only') {
      if (!isGroupStageComplete()) {
        alert(t('management.groupStageMustBeCompleted'));
        return;
      }
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

  // Get round name based on number of matches, not players
  // This ensures standard names even with odd numbers of qualifiers
  const getRoundNameByMatches = (numMatches, roundIndex) => {
    // Determine round name based on number of matches
    // Standard tournament naming: 1 match = Final, 2 matches = Semifinals, 4 matches = Quarterfinals, etc.
    switch (numMatches) {
      case 1: return t('management.final');
      case 2: return t('management.semiFinals');
      case 4: return t('management.quarterFinals');
      case 8: return t('management.top16');
      case 16: return t('management.roundOf', { count: 32 });
      case 32: return t('management.roundOf', { count: 64 });
      default:
        // For other numbers, determine based on closest standard round
        if (numMatches === 3) {
          // 3 matches - closest to Quarterfinals (4 matches)
          return t('management.quarterFinals');
        } else if (numMatches <= 2) {
          return numMatches === 1 ? t('management.final') : t('management.semiFinals');
        } else if (numMatches <= 4) {
          return t('management.quarterFinals');
        } else if (numMatches <= 8) {
          return t('management.top16');
        } else {
          // For larger numbers, calculate Round of X
          const totalPlayers = numMatches * 2;
          return t('management.roundOf', { count: totalPlayers });
        }
    }
  };
  
  // Keep old function for backwards compatibility (not used anymore)
  const getRoundName = (roundSize) => {
    return getRoundNameByMatches(Math.ceil(roundSize / 2), 0);
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
        {uniqueGroups && uniqueGroups.length > 0 ? uniqueGroups.map(group => (
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

  const renderMatches = () => {
    // Collect all matches from all groups
    const allMatches = uniqueGroups?.flatMap(group => 
      group.matches.map(match => ({ ...match, groupId: group.id, groupName: group.name }))
    ) || [];

    // Filter matches
    const filteredMatches = allMatches.filter(match => {
      // Filter by group
      if (matchGroupFilter !== 'all' && match.groupId !== matchGroupFilter) {
        return false;
      }

      // Filter by player name
      if (matchPlayerFilter.trim()) {
        const searchTerm = matchPlayerFilter.trim().toLowerCase();
        const player1Name = (match.player1?.name || '').toLowerCase();
        const player2Name = (match.player2?.name || '').toLowerCase();
        if (!player1Name.includes(searchTerm) && !player2Name.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });

    // Group filtered matches by group
    const matchesByGroup = filteredMatches.reduce((acc, match) => {
      if (!acc[match.groupId]) {
        acc[match.groupId] = {
          groupId: match.groupId,
          groupName: match.groupName,
          matches: []
        };
      }
      acc[match.groupId].matches.push(match);
      return acc;
    }, {});

    return (
      <div className="matches-view">
        <div className="matches-header">
          <h3>{t('management.allMatches')}</h3>
          <div className="matches-filters">
            <div className="filter-group">
              <label htmlFor="group-filter">{t('management.filterByGroup') || 'Filter by Group'}:</label>
              <select
                id="group-filter"
                className="filter-select"
                value={matchGroupFilter}
                onChange={(e) => setMatchGroupFilter(e.target.value)}
              >
                <option value="all">{t('management.allGroups') || 'All Groups'}</option>
                {uniqueGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="player-filter">{t('management.filterByPlayer') || 'Filter by Player'}:</label>
              <div className="filter-input-wrapper">
                <Search size={16} className="filter-icon" />
                <input
                  id="player-filter"
                  type="text"
                  className="filter-input"
                  placeholder={t('management.searchPlayerName') || 'Search player name...'}
                  value={matchPlayerFilter}
                  onChange={(e) => setMatchPlayerFilter(e.target.value)}
                />
                {matchPlayerFilter && (
                  <button
                    className="filter-clear-btn"
                    onClick={() => setMatchPlayerFilter('')}
                    title={t('management.clearFilter') || 'Clear filter'}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="matches-list">
          {Object.keys(matchesByGroup).length > 0 ? Object.values(matchesByGroup).map(groupData => (
            <div key={groupData.groupId} className="group-matches">
              <h4>{groupData.groupName}</h4>
              <div className="matches-grid">
                {groupData.matches.map(match => {
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
                    {match.status === 'completed' && match.result && (
                      <button
                        className="view-statistics-btn"
                        onClick={() => setMatchStatistics(match)}
                        title={t('management.viewStatistics') || 'View Statistics'}
                      >
                        <BarChart3 size={16} />
                      </button>
                    )}
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
                      </div>
                      <div className="score-divider">:</div>
                      <div className="player-result">
                        <div className="player-name-row">
                          <span className={`player-name ${isPlayer2Winner ? 'winner' : ''}`}>
                            {match.player2?.name || 'Unknown Player'}
                          </span>
                          <span className="score">{match.result.player2Legs}</span>
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
                          tournamentId: tournament.id,
                          groupId: match.groupId,
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
                    isAdmin && user ? (
                      <button
                        className="continue-match-btn admin-override-btn"
                        onClick={() => {
                          const ok = window.confirm(
                            (t('management.adminTakeOverConfirm') || 'Admin takeover: this will let you continue scoring this match on this device. Continue?')
                          );
                          if (!ok) return;
                          onMatchStart({
                            ...match,
                            adminOverride: true,
                            legsToWin: match.legsToWin || tournament.legsToWin,
                            startingScore: match.startingScore || tournament.startingScore
                          });
                        }}
                      >
                        <Play size={16} />
                        {t('management.adminTakeOver') || 'Admin take over'}
                      </button>
                    ) : (
                      <button className="view-match-btn" disabled>
                        <Eye size={16} />
                        {t('management.liveOtherDevice') || 'Live (Other Device)'}
                      </button>
                    )
                  )}

                  {/* Admin emergency: match is in progress but not detected as live on this device */}
                  {match.status === 'in_progress' && !isMatchActuallyLive(match.id) && isAdmin && user && (
                    <button
                      className="continue-match-btn admin-override-btn"
                      onClick={() => onMatchStart({
                        ...match,
                        adminOverride: true,
                        legsToWin: match.legsToWin || tournament.legsToWin,
                        startingScore: match.startingScore || tournament.startingScore
                      })}
                      title={t('management.adminOverride') || 'Admin override'}
                    >
                      <Play size={16} />
                      {t('management.adminScore') || 'Admin score'}
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
            <p>{matchGroupFilter !== 'all' || matchPlayerFilter ? 
              (t('management.noMatchesFound') || 'No matches found matching the filters.') :
              (t('management.noMatchesYet') || 'No matches created yet.')
            }</p>
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderStandings = () => (
    <div className="standings-view">
      <h3>{t('management.groupStandings')}</h3>
      <div className="standings-list">
        {uniqueGroups && uniqueGroups.length > 0 ? uniqueGroups.map(group => {
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
    const player180s = new Map(); // playerId -> { player, count }
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

    // Helper function to process a match and collect statistics
    const processMatch = (match) => {
      // Check if match is completed and has result data
      if (match.status !== 'completed') {
        return;
      }
      
      // Match result can be in match.result (from database JSONB) or needs to be constructed
      if (!match.result) {
        // If no result object but match is completed, skip it (data might not be loaded yet)
        console.warn('Match is completed but has no result data:', match.id);
        return;
      }

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

      // 180s (count per player across all matches)
      const add180s = (player, playerStats) => {
        const playerId = player?.id;
        if (!playerId) return;
        const count = Number(playerStats?.oneEighties || 0);
        if (!Number.isFinite(count) || count <= 0) return;
        const existing = player180s.get(playerId);
        if (!existing) {
          player180s.set(playerId, { player, count });
        } else {
          existing.count += count;
        }
      };
      add180s(match.player1, match.result.player1Stats);
      add180s(match.player2, match.result.player2Stats);

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
    };

    // Iterate through all groups and matches - use uniqueGroups to avoid duplicates
    if (uniqueGroups && uniqueGroups.length > 0) {
      uniqueGroups.forEach(group => {
        if (group.matches) {
          group.matches.forEach(match => {
            // Process all matches in the group - they should already be filtered by the database query
            processMatch(match);
          });
        }
      });
    }

    // Iterate through playoff matches
    if (tournament.playoffMatches) {
      tournament.playoffMatches.forEach(match => {
        processMatch(match);
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
    
    // For checkouts: group by player and collect all checkouts above 50
    const playerCheckouts = new Map();
    allCheckouts.forEach(entry => {
      const playerId = entry.player?.id;
      if (!playerId) return;
      const checkoutValue = entry.checkout;
      if (checkoutValue > 50) {
        if (!playerCheckouts.has(playerId)) {
          playerCheckouts.set(playerId, {
            player: entry.player,
            checkouts: []
          });
        }
        const playerData = playerCheckouts.get(playerId);
        // Only add unique checkouts (avoid duplicates)
        if (!playerData.checkouts.includes(checkoutValue)) {
          playerData.checkouts.push(checkoutValue);
        }
      }
    });
    // Sort checkouts for each player in descending order
    playerCheckouts.forEach((playerData) => {
      playerData.checkouts.sort((a, b) => b - a);
    });
    const bestCheckouts = Array.from(playerCheckouts.values())
      .sort((a, b) => {
        // Sort by highest checkout first, then by number of checkouts
        const maxA = Math.max(...a.checkouts);
        const maxB = Math.max(...b.checkouts);
        if (maxB !== maxA) return maxB - maxA;
        return b.checkouts.length - a.checkouts.length;
      })
      .slice(0, 10);

    // For fewest darts: group by player and take only the best (fewest darts) for each player
    const playerBestLegs = new Map();
    allLegs.forEach(entry => {
      const playerId = entry.player?.id;
      if (!playerId) return;
      const existing = playerBestLegs.get(playerId);
      if (!existing || entry.darts < existing.darts) {
        playerBestLegs.set(playerId, entry);
      }
    });
    const fewestDarts = Array.from(playerBestLegs.values())
      .sort((a, b) => a.darts - b.darts)
      .slice(0, 10);

    const most180s = Array.from(player180s.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
              </div>
              {bestCheckouts.map((entry, index) => (
                <div key={`checkout-${index}`} className="leaderboard-row">
                  <span className={`position ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`}>{index + 1}</span>
                  <span className="player-name">{entry.player?.name || 'Unknown'}</span>
                  <span className="value">{entry.checkouts.join(', ')}</span>
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

        {/* 180s Leaderboard */}
        <div className="statistics-section">
          <h4>{t('management.most180s') || 'Most 180s'}</h4>
          {most180s.length > 0 ? (
            <div className="leaderboard">
              <div className="leaderboard-header">
                <span>#</span>
                <span>{t('management.player')}</span>
                <span>{t('management.hit180s') || '180s'}</span>
              </div>
              {most180s.map((entry, index) => (
                <div key={`180-${entry.player?.id || index}`} className="leaderboard-row">
                  <span className={`position ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : ''}`}>{index + 1}</span>
                  <span className="player-name">{entry.player?.name || 'Unknown'}</span>
                  <span className="value">{entry.count}</span>
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

  // Load and subscribe to live matches for this tournament
  useEffect(() => {
    if (!tournament?.id) {
      return;
    }

    let isMounted = true;
    // Reset previously viewed tournament live matches to avoid cross-tournament bleed
    setLiveMatches([]);
    liveMatchesRef.current = [];

    const loadLiveMatches = async () => {
      try {
        // Get all group IDs for this tournament
        const groupIds = uniqueGroups?.map(g => g.id) || [];
        const groupIdSet = new Set(groupIds);
        
        // Get playoff matches for this tournament
        const playoffMatchIds = tournament.playoffMatches?.map(m => m.id) || [];
        const playoffIdSet = new Set(playoffMatchIds);

        // Helper to ensure we only keep matches belonging to this tournament
        const belongsToThisTournament = (match) => {
          const matchGroupId = match.group_id || match.group?.id;
          return groupIdSet.has(matchGroupId) || playoffIdSet.has(match.id);
        };
        
        const allLiveMatches = [];

        // Load group matches if we have groups
        if (groupIds.length > 0) {
          const groupQuery = supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('status', 'in_progress')
            .in('group_id', groupIds);

          const { data: groupData, error: groupError } = await groupQuery;
          if (!groupError && groupData) {
            allLiveMatches.push(...groupData);
          }
        }

        // Load playoff matches if we have playoff matches
        if (playoffMatchIds.length > 0) {
          const playoffQuery = supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*)
            `)
            .eq('status', 'in_progress')
            .in('id', playoffMatchIds);

          const { data: playoffData, error: playoffError } = await playoffQuery;
          if (!playoffError && playoffData) {
            // Merge playoff matches, avoiding duplicates
            const existingIds = new Set(allLiveMatches.map(m => m.id));
            playoffData.forEach(match => {
              if (!existingIds.has(match.id)) {
                allLiveMatches.push(match);
              }
            });
          }
        }

        // Sort by last activity
        allLiveMatches.sort((a, b) => {
          const timeA = new Date(a.last_activity_at || 0).getTime();
          const timeB = new Date(b.last_activity_at || 0).getTime();
          return timeB - timeA;
        });

        // Smart merge: preserve existing matches and only update changed ones
        // This prevents cards from disappearing during refresh
        setLiveMatches(prev => {
          // Always use ref first to get the most current matches (prev might be stale in async context)
          // This ensures we never lose existing matches during async operations
          const currentMatches = (liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev)
            .filter(belongsToThisTournament); // Drop matches from other tournaments
          
          // Create a map of new matches by ID for quick lookup
          const newMatchesMap = new Map(allLiveMatches.map(m => [m.id, m]));
          
          // Start with existing matches, updating them if we have new data
          // This ensures existing cards stay visible
          const mergedMatches = currentMatches.map(existingMatch => {
            const newMatch = newMatchesMap.get(existingMatch.id);
            // If match is no longer in_progress, remove it
            if (newMatch && newMatch.status !== 'in_progress') {
              return null; // Mark for removal
            }
            // Return updated match if available, otherwise keep existing (preserves card)
            return newMatch || existingMatch;
          }).filter(m => m !== null && m.status === 'in_progress' && belongsToThisTournament(m)); // Only keep live matches from this tournament
          
          // Add any new matches that weren't in the previous list
          const existingIds = new Set(currentMatches.map(m => m.id));
          allLiveMatches.forEach(newMatch => {
            if (!existingIds.has(newMatch.id) && newMatch.status === 'in_progress' && belongsToThisTournament(newMatch)) {
              mergedMatches.push(newMatch);
            }
          });
          
          // Sort the merged result
          mergedMatches.sort((a, b) => {
            const timeA = new Date(a.last_activity_at || 0).getTime();
            const timeB = new Date(b.last_activity_at || 0).getTime();
            return timeB - timeA;
          });
          
          // Update ref with merged matches BEFORE returning
          // This ensures next update has the latest data
          liveMatchesRef.current = mergedMatches;
          return mergedMatches;
        });
      } catch (err) {
        console.error('Error loading live matches:', err);
      }
    };

    // Load initial matches
    loadLiveMatches();

    // Set up real-time subscription
    const channel = supabase
      .channel(`live-matches-tournament-${tournament.id}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'matches',
          filter: 'status=eq.in_progress'
        },
        async (payload) => {
          // Check if this match belongs to this tournament
          const match = payload.new;
          const belongsToTournament = 
            (uniqueGroups?.some(g => g.id === match.group_id)) ||
            (tournament.playoffMatches?.some(m => m.id === match.id));

          if (!belongsToTournament) {
            return; // Not our tournament, ignore
          }

          // Reload the full match data
          const { data: updatedMatch, error } = await supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('id', match.id)
            .single();

          if (!error && updatedMatch) {
            if (updatedMatch.status === 'in_progress') {
              setLiveMatches(prev => {
                const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
                const existing = currentMatches.find(m => m.id === updatedMatch.id);
                const updated = existing 
                  ? currentMatches.map(m => m.id === updatedMatch.id ? updatedMatch : m)
                  : [...currentMatches, updatedMatch];
                liveMatchesRef.current = updated;
                return updated;
              });
            } else {
              // Match completed or status changed, remove from live matches
              setLiveMatches(prev => {
                const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
                const filtered = currentMatches.filter(m => m.id !== match.id);
                liveMatchesRef.current = filtered;
                return filtered;
              });
            }
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: 'status=eq.in_progress'
        },
        async (payload) => {
          const match = payload.new;
          const belongsToTournament = 
            (uniqueGroups?.some(g => g.id === match.group_id)) ||
            (tournament.playoffMatches?.some(m => m.id === match.id));

          if (!belongsToTournament) {
            return;
          }

          // Load full match data
          const { data: newMatch, error } = await supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('id', match.id)
            .single();

          if (!error && newMatch) {
            setLiveMatches(prev => {
              const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
              if (currentMatches.find(m => m.id === newMatch.id)) {
                return currentMatches;
              }
              const updated = [...currentMatches, newMatch];
              liveMatchesRef.current = updated;
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [tournament?.id]); // Only depend on tournament ID to avoid unnecessary reloads

  const renderLiveMatches = () => {
    const belongsToThisTournament = (match) => {
      const matchGroupId = match.group_id || match.group?.id;
      return tournamentGroupIds.has(matchGroupId) || tournamentPlayoffIds.has(match.id);
    };
    const filteredLiveMatches = liveMatches.filter(belongsToThisTournament);

    const formatTimeAgo = (timestamp) => {
      if (!timestamp) return 'Unknown';
      const now = new Date();
      const time = new Date(timestamp);
      const diffMs = now - time;
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    };

    return (
      <div className="live-matches-view">
        <div className="live-matches-header">
          <h3>
            <Activity size={20} />
            {t('management.liveMatches') || 'Live Matches'}
          </h3>
          <p className="live-matches-count">
            {filteredLiveMatches.length} match{filteredLiveMatches.length !== 1 ? 'es' : ''} currently in progress
          </p>
        </div>

        {filteredLiveMatches.length === 0 ? (
          <div className="no-live-matches">
            <Activity size={48} className="no-matches-icon" />
            <h4>{t('management.noLiveMatches') || 'No Live Matches'}</h4>
            <p>{t('management.noLiveMatchesDescription') || 'There are no matches currently in progress for this tournament.'}</p>
          </div>
        ) : (
          <div className="live-matches-grid">
            {filteredLiveMatches.map(match => (
              <div key={match.id} className="live-match-card scoreboard-style">
                <div className="scoreboard-header">
                  <div className="match-format">First to {match.legs_to_win || 3}</div>
                  <div className="live-badge">
                    <Activity size={12} />
                    <span>LIVE</span>
                  </div>
                </div>
                
                <div className="scoreboard-content">
                  <div className="scoreboard-row">
                    <div className="scoreboard-label">Legs</div>
                  </div>
                  
                  <div className="player-row player1-row">
                    <div className="player-info">
                      <div className="player-name-large">{match.player1?.name || 'Player 1'}</div>
                    </div>
                    <div className="scoreboard-scores">
                      <div className="legs-score">{match.player1_legs || 0}</div>
                      <div className="current-score-large">{match.player1_current_score || 501}</div>
                    </div>
                  </div>
                  
                  <div className="player-row player2-row">
                    <div className="player-info">
                      <div className="player-name-large">{match.player2?.name || 'Player 2'}</div>
                    </div>
                    <div className="scoreboard-scores">
                      <div className="legs-score">{match.player2_legs || 0}</div>
                      <div className="current-score-large">{match.player2_current_score || 501}</div>
                    </div>
                  </div>
                </div>
                
                {match.group && (
                  <div className="scoreboard-footer">
                    <span className="group-name">{match.group.name || 'Group'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
                  {uniqueGroups && uniqueGroups.length > 0 ? uniqueGroups.map((group, groupIndex) => {
                    // Show all qualifiers from this group (regardless of mode)
                    const groupQualifiers = qualifyingPlayers.filter(player => 
                      group.players.some(groupPlayer => groupPlayer.id === player.id)
                    );
                    
                    return (
                      <div key={group.id} className="group-qualifiers">
                        <h5>{group.name}</h5>
                        <div className="qualifiers-list">
                          {groupQualifiers.length > 0 ? (
                            groupQualifiers.map((player, index) => (
                              <div key={player.id} className="qualifier">
                                <span className="position">{index + 1}</span>
                                <span className="player-name">{player.name}</span>
                              </div>
                            ))
                          ) : (
                            <div className="no-qualifiers" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              No qualifiers
                            </div>
                          )}
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
                {uniqueGroups && uniqueGroups.length > 0 ? uniqueGroups.map((group, groupIndex) => {
                  // Show all qualifiers from this group (regardless of mode)
                  const groupQualifiers = qualifyingPlayers.filter(player => 
                    group.players.some(groupPlayer => groupPlayer.id === player.id)
                  );
                  
                  return (
                    <div key={group.id} className="group-qualifiers">
                      <h5>{group.name}</h5>
                      <div className="qualifiers-list">
                        {groupQualifiers.length > 0 ? (
                          groupQualifiers.map((player, index) => (
                            <div key={player.id} className="qualifier">
                              <span className="position">{index + 1}</span>
                              <span className="player-name">{player.name}</span>
                            </div>
                          ))
                        ) : (
                          <div className="no-qualifiers" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            No qualifiers
                          </div>
                        )}
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
          <div className="bracket-view-toggle">
            <button
              className={`view-toggle-btn ${bracketViewMode === 'detailed' ? 'active' : ''}`}
              onClick={() => setBracketViewMode('detailed')}
              title="Detailed View"
            >
              <List size={18} />
              Detailed
            </button>
            <button
              className={`view-toggle-btn ${bracketViewMode === 'compact' ? 'active' : ''}`}
              onClick={() => setBracketViewMode('compact')}
              title="Compact Bracket View"
            >
              <Grid3x3 size={18} />
              Bracket
            </button>
          </div>
        </div>

        {bracketViewMode === 'compact' ? (
          <BracketVisualization rounds={rounds} playoffMatches={playoffMatches} />
        ) : (
        <div className="bracket-container">
          {rounds.map((round, index) => (
            <div key={round.id} className={`bracket-round ${index + 1 === currentRound ? 'current' : ''}`}>
              <div className="round-header">
                <h4>{round.name}</h4>
                <span className="match-count">
                  {round.matches.filter(m => !m.isThirdPlaceMatch).length} {round.matches.filter(m => !m.isThirdPlaceMatch).length === 1 ? 'match' : 'matches'}
                  {round.matches.some(m => m.isThirdPlaceMatch) && ' + 3rd Place'}
                </span>
              </div>
              
              <div className="round-matches">
                {round.matches.map((bracketMatch) => {
                  // Find the actual database match for this bracket match
                  const match = playoffMatches.find(pm => pm.id === bracketMatch.id) || bracketMatch;
                  return (
                  <div key={match.id} className={`playoff-match ${match.status} ${bracketMatch.isThirdPlaceMatch ? 'third-place-match' : ''}`}>
                    {bracketMatch.isThirdPlaceMatch && (
                      <div className="match-label">
                        {t('management.thirdPlaceMatch') || '3rd Place Match'}
                      </div>
                    )}
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
                      <div className="match-header-actions">
                        {isAdmin && match.status === 'pending' && !isMatchActuallyLive(match.id) && (
                          <button 
                            className="edit-match-icon-btn"
                            onClick={() => setEditingMatch({ ...match, isThirdPlaceMatch: bracketMatch.isThirdPlaceMatch })}
                            title={t('management.editMatchPlayers') || 'Edit match players'}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {match.status === 'completed' && match.result && (
                          <button
                            className="view-statistics-btn"
                            onClick={() => setMatchStatistics(match)}
                            title={t('management.viewStatistics') || 'View Statistics'}
                          >
                            <BarChart3 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    {match.status === 'completed' && match.result ? (
                      <div className="playoff-match-result">
                        <div className={`playoff-player-row ${match.result?.winner === match.player1?.id ? 'winner' : ''}`}>
                          <span className="playoff-player-name">{match.player1?.name || 'TBD'}</span>
                          <span className="playoff-player-score">{match.result.player1Legs}</span>
                      </div>
                        <div className={`playoff-player-row ${match.result?.winner === match.player2?.id ? 'winner' : ''}`}>
                          <span className="playoff-player-name">{match.player2?.name || 'TBD'}</span>
                          <span className="playoff-player-score">{match.result.player2Legs}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="playoff-match-players">
                        <div className="playoff-player-row">
                          <span className="playoff-player-name">{match.player1?.name || 'TBD'}</span>
                    </div>
                        <div className="playoff-vs">vs</div>
                        <div className="playoff-player-row">
                          <span className="playoff-player-name">{match.player2?.name || 'TBD'}</span>
                      </div>
                      </div>
                    )}
                    
                    <div className="match-actions">
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
                                tournamentId: tournament.id,
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
                        isAdmin && user ? (
                          <button
                            className="continue-match-btn admin-override-btn"
                            onClick={() => {
                              const ok = window.confirm(
                                (t('management.adminTakeOverConfirm') || 'Admin takeover: this will let you continue scoring this match on this device. Continue?')
                              );
                              if (!ok) return;
                              const roundSize = round.matches.length * 2;
                              const legsToWin = getPlayoffLegsToWin(roundSize);
                              onMatchStart({
                                ...match,
                                adminOverride: true,
                                legsToWin: legsToWin,
                                startingScore: tournament.startingScore,
                                isPlayoff: true
                              });
                            }}
                          >
                            <Play size={16} />
                            {t('management.adminTakeOver') || 'Admin take over'}
                          </button>
                        ) : (
                          <button className="view-match-btn" disabled>
                            <Eye size={16} />
                            {t('management.liveOtherDevice') || 'Live (Other Device)'}
                          </button>
                        )
                      )}

                      {/* Admin emergency: playoff match is in progress but not detected as live on this device */}
                      {match.status === 'in_progress' && !isMatchActuallyLive(match.id) && isAdmin && user && (
                        <button
                          className="continue-match-btn admin-override-btn"
                          onClick={() => {
                            const roundSize = round.matches.length * 2;
                            const legsToWin = getPlayoffLegsToWin(roundSize);
                            onMatchStart({
                              ...match,
                              adminOverride: true,
                              legsToWin: legsToWin,
                              startingScore: tournament.startingScore,
                              isPlayoff: true
                            });
                          }}
                          title={t('management.adminOverride') || 'Admin override'}
                        >
                          <Play size={16} />
                          {t('management.adminScore') || 'Admin score'}
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
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        )}
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
            <span>{tournament.players?.length || uniqueGroups?.reduce((total, group) => total + (group.players?.length || 0), 0) || 0} {t('common.players')}</span>
          </div>
          <div className="overview-stat">
            <span>{uniqueGroups?.length || 0} {t('common.groups')}</span>
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
          {isAdmin && user && (
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
        {tournament.tournamentType !== 'playoff_only' && (
          <>
            <button 
              className={activeTab === 'groups' ? 'active' : ''}
              onClick={() => handleTabChange('groups')}
            >
              {t('management.groups')}
            </button>
            <button 
              className={activeTab === 'matches' ? 'active' : ''}
              onClick={() => handleTabChange('matches')}
            >
              {t('management.matches')}
            </button>
            <button 
              className={activeTab === 'standings' ? 'active' : ''}
              onClick={() => handleTabChange('standings')}
            >
              {t('management.standings')}
            </button>
          </>
        )}
        {tournament.playoffSettings?.enabled && (
          <button 
            className={activeTab === 'playoffs' ? 'active' : ''}
            onClick={() => handleTabChange('playoffs')}
          >
            {t('management.playoffs')}
          </button>
        )}
        <button 
          className={activeTab === 'statistics' ? 'active' : ''}
          onClick={() => handleTabChange('statistics')}
        >
          {t('management.statistics') || 'Statistics'}
        </button>
        <button 
          className={activeTab === 'liveMatches' ? 'active' : ''}
          onClick={() => handleTabChange('liveMatches')}
        >
          <Activity size={16} />
          {t('management.liveMatches') || 'Live Matches'}
        </button>
      </div>

      <div className="management-content">
        {tournament.tournamentType !== 'playoff_only' && activeTab === 'groups' && renderGroups()}
        {tournament.tournamentType !== 'playoff_only' && activeTab === 'matches' && renderMatches()}
        {tournament.tournamentType !== 'playoff_only' && activeTab === 'standings' && renderStandings()}
        {activeTab === 'playoffs' && renderPlayoffs()}
        {activeTab === 'statistics' && renderStatistics()}
        {activeTab === 'liveMatches' && renderLiveMatches()}
      </div>

      {/* Edit Settings Modal */}
      {showEditSettings && user && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{t('registration.editTournamentSettings')}</h3>
              <button 
                className="close-btn"
                onClick={() => setShowEditSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="group-settings">
                <h4>{t('registration.matchSettings')}</h4>
                <div className="input-group">
                  <label>{t('registration.legsToWin')}:</label>
                  <select 
                    value={tournamentSettings.legsToWin}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      legsToWin: parseInt(e.target.value)
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                    <option value={9}>{t('tournaments.firstToLegs', { count: 9 })}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('tournaments.startingScore')}:</label>
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
                <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
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
                      <div key={criterion} className="criteria-order-item">
                        <span className="criteria-number" style={{ marginRight: '0.75rem', fontWeight: 'bold', minWidth: '2rem' }}>{index + 1}.</span>
                        <span className="criteria-label" style={{ flex: 1 }}>{criterionLabels[criterion] || criterion}</span>
                        <div className="criteria-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            type="button"
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
                            title={t('registration.moveUp')}
                            className={index === 0 ? 'move-btn disabled' : 'move-btn'}
                            disabled={index === 0}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
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
                            title={t('registration.moveDown')}
                            className={index === tournamentSettings.standingsCriteriaOrder.length - 1 ? 'move-btn disabled' : 'move-btn'}
                            disabled={index === tournamentSettings.standingsCriteriaOrder.length - 1}
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
                <h4>{t('registration.groupSettings')}</h4>
                {hasTournamentStarted && (
                  <p className="settings-description" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    {t('registration.groupSettingsLocked') || 'Group count is locked after matches have started.'}
                  </p>
                )}
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="groups"
                      checked={tournamentSettings.groupSettings.type === 'groups'}
                      disabled={hasTournamentStarted}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    {t('registration.numberOfGroups')}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="playersPerGroup"
                      checked={tournamentSettings.groupSettings.type === 'playersPerGroup'}
                      disabled={hasTournamentStarted}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    {t('registration.playersPerGroup')}
                  </label>
                </div>
                <div className="input-group">
                  <label>
                    {tournamentSettings.groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={tournamentSettings.groupSettings.type === 'groups' ? '16' : '8'}
                    value={tournamentSettings.groupSettings.value}
                    disabled={hasTournamentStarted}
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
                <h4>{t('registration.playoffSettings')}</h4>
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
                    {t('registration.enablePlayoffs')}
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
                        <label>{t('registration.qualificationMode')}</label>
                        <div className="radio-group">
                          <label>
                            <input
                              type="radio"
                              name="qualificationMode"
                              value="perGroup"
                              checked={tournamentSettings.playoffSettings.qualificationMode === 'perGroup'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  qualificationMode: e.target.value
                                }
                              })}
                            />
                            {t('registration.qualificationModePerGroup')}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="qualificationMode"
                              value="totalPlayers"
                              checked={tournamentSettings.playoffSettings.qualificationMode === 'totalPlayers'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  qualificationMode: e.target.value
                                }
                              })}
                            />
                            {t('registration.qualificationModeTotalPlayers')}
                          </label>
                        </div>
                      </div>
                      
                      {tournamentSettings.playoffSettings.qualificationMode === 'perGroup' ? (
                        <div className="input-group">
                          <label>{t('registration.playersAdvancingPerGroup')}</label>
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
                            <option value={allPlayersValue}>{t('registration.all')}</option>
                          </select>
                        </div>
                      ) : (
                        <div className="input-group">
                          <label>{t('registration.totalPlayersToAdvance')}</label>
                          <input
                            type="number"
                            min="1"
                            max="64"
                            value={tournamentSettings.playoffSettings.totalPlayersToAdvance || 8}
                            onChange={(e) => setTournamentSettings({
                              ...tournamentSettings,
                              playoffSettings: {
                                ...tournamentSettings.playoffSettings,
                                totalPlayersToAdvance: parseInt(e.target.value) || 8
                              }
                            })}
                          />
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            {t('registration.totalPlayersDescription')}
                          </p>
                        </div>
                      )}
                      
                      <div className="input-group">
                        <label>{t('registration.seedingMethod') || 'Seeding Method'}</label>
                        <div className="radio-group">
                          <label>
                            <input
                              type="radio"
                              name="seedingMethod"
                              value="standard"
                              checked={tournamentSettings.playoffSettings.seedingMethod === 'standard'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  seedingMethod: e.target.value
                                }
                              })}
                            />
                            {t('registration.seedingMethodStandard') || 'Standard Tournament Seeding'}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="seedingMethod"
                              value="groupBased"
                              checked={tournamentSettings.playoffSettings.seedingMethod === 'groupBased'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  seedingMethod: e.target.value
                                }
                              })}
                            />
                            {t('registration.seedingMethodGroupBased') || 'Group-Based Seeding'}
                          </label>
                        </div>
                      </div>

                      {tournamentSettings.playoffSettings.seedingMethod === 'groupBased' && (
                        <div className="input-group">
                          <label>{t('registration.groupMatchups') || 'Group Matchups'}</label>
                          {tournament?.groups && tournament.groups.length > 0 ? (
                            <>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                {t('registration.groupMatchupsDescription') || 'Configure which groups play against each other. 1st from Group A vs last advancing from Group D, etc.'}
                              </p>
                          <div className="group-matchups-config" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {(() => {
                              const groups = tournament.groups || [];
                              const matchups = tournamentSettings.playoffSettings.groupMatchups || [];
                              
                              // Initialize matchups if empty
                              if (matchups.length === 0 && groups.length >= 2) {
                                const defaultMatchups = [];
                                for (let i = 0; i < Math.floor(groups.length / 2); i++) {
                                  const group1Index = i;
                                  const group2Index = groups.length - 1 - i;
                                  defaultMatchups.push({
                                    group1: groups[group1Index]?.name || `Group ${String.fromCharCode(65 + group1Index)}`,
                                    group2: groups[group2Index]?.name || `Group ${String.fromCharCode(65 + group2Index)}`
                                  });
                                }
                                setTimeout(() => {
                                  setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      groupMatchups: defaultMatchups
                                    }
                                  });
                                }, 0);
                                return null;
                              }
                              
                              return matchups.map((matchup, index) => {
                                const availableGroups = groups.map(g => g.name);
                                return (
                                  <div key={index} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem',
                                    padding: '0.75rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--bg-tertiary)'
                                  }}>
                                    <select
                                      value={matchup.group1}
                                      onChange={(e) => {
                                        const newMatchups = [...matchups];
                                        newMatchups[index].group1 = e.target.value;
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        flex: 1, 
                                        padding: '0.5rem',
                                        backgroundColor: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {availableGroups.map(groupName => (
                                        <option key={groupName} value={groupName}>{groupName}</option>
                                      ))}
                                    </select>
                                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>vs</span>
                                    <select
                                      value={matchup.group2}
                                      onChange={(e) => {
                                        const newMatchups = [...matchups];
                                        newMatchups[index].group2 = e.target.value;
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        flex: 1, 
                                        padding: '0.5rem',
                                        backgroundColor: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {availableGroups.map(groupName => (
                                        <option key={groupName} value={groupName}>{groupName}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newMatchups = matchups.filter((_, i) => i !== index);
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--card-bg)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = 'var(--bg-tertiary)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = 'var(--card-bg)';
                                      }}
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                );
                              });
                            })()}
                            <button
                              type="button"
                              onClick={() => {
                                const groups = tournament.groups || [];
                                const availableGroups = groups.map(g => g.name);
                                if (availableGroups.length >= 2) {
                                  const newMatchups = [
                                    ...(tournamentSettings.playoffSettings.groupMatchups || []),
                                    { group1: availableGroups[0], group2: availableGroups[1] }
                                  ];
                                  setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      groupMatchups: newMatchups
                                    }
                                  });
                                }
                              }}
                              style={{
                                padding: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                alignSelf: 'flex-start',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = 'var(--bg-tertiary)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'var(--card-bg)';
                              }}
                            >
                              {t('registration.addGroupMatchup') || '+ Add Group Matchup'}
                            </button>
                          </div>
                            </>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              {t('registration.groupMatchupsNote') || 'Note: Groups must be created first (start the tournament) before you can configure group matchups.'}
                            </p>
                          )}
                        </div>
                      )}
                      
                    <div className="playoff-legs-settings">
                      <h5>{t('registration.playoffLegsToWin')}:</h5>
                      <div className="input-group">
                        <label>{t('management.top32')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[32] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                32: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.top16')}:</label>
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
                          <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
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
                          <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
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
                          <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
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
                          <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
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
                {t('registration.cancel')}
              </button>
              <button 
                className="confirm-btn"
                onClick={updateSettings}
              >
                {t('registration.updateSettings')}
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

      {/* Match Statistics Modal */}
      {matchStatistics && matchStatistics.result && (
        <div className="modal-overlay">
          <div className="modal match-statistics-modal">
            <div className="modal-header">
              <h3>{t('management.matchStatistics') || 'Match Statistics'}</h3>
              <button 
                className="close-btn"
                onClick={() => setMatchStatistics(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              <div className="match-statistics-header">
                <div className="match-players-header">
                  <div className="player-header">
                    <div className="player-name-stat">{matchStatistics.player1?.name || 'Player 1'}</div>
                    <div className="player-legs-stat">{matchStatistics.result.player1Legs}</div>
                  </div>
                  <div className="vs-stat">vs</div>
                  <div className="player-header">
                    <div className="player-legs-stat">{matchStatistics.result.player2Legs}</div>
                    <div className="player-name-stat">{matchStatistics.player2?.name || 'Player 2'}</div>
                  </div>
                </div>
              </div>

              <div className="statistics-sections">
                {/* Match Averages */}
                <div className="statistics-section">
                  <h4>{t('management.matchAverage') || 'Match Average'}</h4>
                  <div className="statistics-row">
                    <div className="stat-value">
                      {matchStatistics.result.player1Stats?.average ? matchStatistics.result.player1Stats.average.toFixed(2) : '0.00'}
                    </div>
                    <div className="stat-label">Avg</div>
                    <div className="stat-value">
                      {matchStatistics.result.player2Stats?.average ? matchStatistics.result.player2Stats.average.toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                {/* Legs Won */}
                <div className="statistics-section">
                  <h4>{t('management.legsWon') || 'Legs Won'}</h4>
                  <div className="statistics-row">
                    <div className="stat-value">{matchStatistics.result.player1Legs || 0}</div>
                    <div className="stat-label">Legs</div>
                    <div className="stat-value">{matchStatistics.result.player2Legs || 0}</div>
                  </div>
                </div>

                {/* Checkouts */}
                <div className="statistics-section">
                  <h4>{t('management.checkouts') || 'Checkouts'}</h4>
                  <div className="statistics-row checkouts-row">
                    <div className="checkouts-list">
                      {matchStatistics.result.player1Stats?.checkouts && matchStatistics.result.player1Stats.checkouts.length > 0 ? (
                        matchStatistics.result.player1Stats.checkouts
                          .map(c => typeof c === 'object' ? c.checkout : c)
                          .filter(c => c && c > 0)
                          .sort((a, b) => b - a)
                          .join(', ') || '-'
                      ) : '-'}
                    </div>
                    <div className="stat-label">Checkouts</div>
                    <div className="checkouts-list">
                      {matchStatistics.result.player2Stats?.checkouts && matchStatistics.result.player2Stats.checkouts.length > 0 ? (
                        matchStatistics.result.player2Stats.checkouts
                          .map(c => typeof c === 'object' ? c.checkout : c)
                          .filter(c => c && c > 0)
                          .sort((a, b) => b - a)
                          .join(', ') || '-'
                      ) : '-'}
                    </div>
                  </div>
                </div>

                {/* Darts per Leg */}
                <div className="statistics-section">
                  <h4>{t('management.dartsPerLeg') || 'Darts per Leg'}</h4>
                  <div className="legs-details">
                    {Array.from({ length: Math.max(
                      matchStatistics.result.player1Stats?.legs?.length || 0,
                      matchStatistics.result.player2Stats?.legs?.length || 0
                    ) }, (_, i) => i + 1).map(legNum => {
                      const player1Leg = matchStatistics.result.player1Stats?.legs?.[legNum - 1];
                      const player2Leg = matchStatistics.result.player2Stats?.legs?.[legNum - 1];
                      const player1Darts = player1Leg?.darts || '-';
                      const player2Darts = player2Leg?.darts || '-';
                      const player1Won = player1Leg?.isWin;
                      const player2Won = player2Leg?.isWin;

                      return (
                        <div key={legNum} className="leg-detail-row">
                          <div className={`leg-darts ${player1Won ? 'winner' : ''}`}>
                            {player1Darts}
                          </div>
                          <div className="leg-number">Leg {legNum}</div>
                          <div className={`leg-darts ${player2Won ? 'winner' : ''}`}>
                            {player2Darts}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component for editing playoff match players
function EditPlayoffMatchForm({ match, qualifyingPlayers, allRounds, onSave, onCancel }) {
  const { t } = useLanguage();
  const [selectedPlayer1, setSelectedPlayer1] = useState(match.player1);
  const [selectedPlayer2, setSelectedPlayer2] = useState(match.player2);

  // Find which round this match belongs to
  const currentRound = allRounds.find(round => 
    round.matches.some(m => m.id === match.id)
  );
  
  const currentRoundIndex = allRounds.findIndex(round => 
    round.matches.some(m => m.id === match.id)
  );

  // Get players who advanced from previous round
  const getAdvancedPlayers = () => {
    // If this is the first round, all qualifying players are available
    if (currentRoundIndex === 0) {
      return qualifyingPlayers.map(qp => qp.player || qp);
    }
    
    // If this is a 3rd place match, get players who lost in semifinals
    if (match.isThirdPlaceMatch) {
      const previousRound = allRounds[currentRoundIndex - 1];
      if (!previousRound) return [];
      
      const losers = [];
      previousRound.matches.forEach(m => {
        if (m.status === 'completed' && m.result && m.result.winner) {
          // Get the loser (the player who didn't win)
          const loser = m.result.winner === m.player1?.id ? m.player2 : m.player1;
          if (loser) {
            losers.push(loser);
          }
        }
      });
      
      // If no matches completed yet, return empty (can't determine losers)
      return losers;
    }
    
    // For other rounds, get players who won in the previous round
    const previousRound = allRounds[currentRoundIndex - 1];
    if (!previousRound) return [];
    
    const winners = [];
    previousRound.matches.forEach(m => {
      if (m.status === 'completed' && m.result && m.result.winner) {
        // Get the winner
        const winner = m.result.winner === m.player1?.id ? m.player1 : m.player2;
        if (winner) {
          winners.push(winner);
        }
      }
    });
    
    // If no matches completed yet, return empty (can't determine winners)
    return winners;
  };

  const advancedPlayers = getAdvancedPlayers();

  // Build a stable pool of all players who are in playoffs (qualified + anyone already present in the bracket)
  const playoffPlayersPool = useMemo(() => {
    const byId = new Map();

    (qualifyingPlayers || []).forEach(qp => {
      const p = qp?.player || qp;
      if (p?.id) byId.set(p.id, p);
    });

    (allRounds || []).forEach(r => {
      (r?.matches || []).forEach(m => {
        if (m?.player1?.id) byId.set(m.player1.id, m.player1);
        if (m?.player2?.id) byId.set(m.player2.id, m.player2);
      });
    });

    return Array.from(byId.values());
  }, [qualifyingPlayers, allRounds]);
  
  // Check if previous round is complete
  const isPreviousRoundComplete = () => {
    if (currentRoundIndex === 0) return true; // First round, no previous round
    const previousRound = allRounds[currentRoundIndex - 1];
    if (!previousRound) return false;
    return previousRound.matches.every(m => m.status === 'completed');
  };

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
  // IMPORTANT: allow selecting from ALL playoff players (not only advanced players) to make manual repair possible.
  const getAvailablePlayers = (excludePlayerId = null) => {
    const basePlayers = playoffPlayersPool.length > 0
      ? playoffPlayersPool
      : (qualifyingPlayers || []).map(qp => qp.player || qp);
    
    return basePlayers.filter(player => {
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
      alert(t('management.pleaseSelectBothPlayers'));
      return;
    }
    if (selectedPlayer1.id === selectedPlayer2.id) {
      alert(t('management.playersMustBeDifferent'));
      return;
    }
    onSave(selectedPlayer1, selectedPlayer2);
  };

  const availablePlayers1 = getAvailablePlayers(selectedPlayer2?.id);
  const availablePlayers2 = getAvailablePlayers(selectedPlayer1?.id);
  const previousRoundComplete = isPreviousRoundComplete();

  return (
    <div className="edit-playoff-match-form">
      {currentRoundIndex > 0 && (
        <div className={`info-message ${!previousRoundComplete ? 'warning' : ''}`}>
          {/* We still show a warning if previous round isn't complete, but allow manual selection. */}
          {!previousRoundComplete
            ? (t('management.completePreviousRoundFirst', { 
                roundName: allRounds[currentRoundIndex - 1]?.name || t('management.previousRound')
              }) || 'Previous round is not complete yet.')
            : (t('management.youCanSelectAnyPlayoffPlayer') || 'You can select any player from the playoffs pool.')}
        </div>
      )}
      <div className="input-group">
        <label>{t('management.player1')}:</label>
        <select
          value={selectedPlayer1?.id || ''}
          onChange={(e) => {
            const player = availablePlayers1.find(p => p.id === e.target.value);
            setSelectedPlayer1(player || null);
          }}
        >
          <option value="">{t('management.selectPlayer1')}</option>
          {availablePlayers1.map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      <div className="input-group">
        <label>{t('management.player2')}:</label>
        <select
          value={selectedPlayer2?.id || ''}
          onChange={(e) => {
            const player = availablePlayers2.find(p => p.id === e.target.value);
            setSelectedPlayer2(player || null);
          }}
        >
          <option value="">{t('management.selectPlayer2')}</option>
          {availablePlayers2.map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions">
        <button className="cancel-btn" onClick={onCancel}>
          {t('registration.cancel')}
        </button>
        <button className="confirm-btn" onClick={handleSave}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

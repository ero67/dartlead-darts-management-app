import { supabase, generateId } from '../lib/supabase.js'

// Helper function to calculate group standings
function calculateGroupStandings(group, criteriaOrder = null) {
  if (!group.players || !group.matches) {
    return [];
  }

  // Initialize player stats
  const playerStats = new Map();
  group.players.forEach(player => {
    playerStats.set(player.id, {
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
    });
  });

  // Process completed matches
  group.matches.forEach(match => {
    if (match.status === 'completed' && match.result) {
      const p1Stats = playerStats.get(match.player1?.id);
      const p2Stats = playerStats.get(match.player2?.id);
      
      if (p1Stats && p2Stats) {
        // Update matches played
        p1Stats.matchesPlayed++;
        p2Stats.matchesPlayed++;
        
        // Update legs
        p1Stats.legsWon += match.result.player1Legs;
        p1Stats.legsLost += match.result.player2Legs;
        p2Stats.legsWon += match.result.player2Legs;
        p2Stats.legsLost += match.result.player1Legs;
        
        // Update wins/losses and points
        if (match.result.winner === match.player1?.id) {
          p1Stats.matchesWon++;
          p1Stats.points += 3;
          p2Stats.matchesLost++;
          // Track head-to-head
          if (!p1Stats.headToHeadWins[match.player2?.id]) {
            p1Stats.headToHeadWins[match.player2?.id] = 0;
          }
          p1Stats.headToHeadWins[match.player2?.id]++;
        } else if (match.result.winner === match.player2?.id) {
          p2Stats.matchesWon++;
          p2Stats.points += 3;
          p1Stats.matchesLost++;
          // Track head-to-head
          if (!p2Stats.headToHeadWins[match.player1?.id]) {
            p2Stats.headToHeadWins[match.player1?.id] = 0;
          }
          p2Stats.headToHeadWins[match.player1?.id]++;
        }
        
        // Accumulate totalScore and totalDarts for cumulative average calculation
        if (match.result.player1Stats?.totalScore !== undefined) {
          p1Stats.totalScore += match.result.player1Stats.totalScore || 0;
        }
        if (match.result.player1Stats?.totalDarts !== undefined) {
          p1Stats.dartsThrown += match.result.player1Stats.totalDarts || 0;
        }
        if (match.result.player2Stats?.totalScore !== undefined) {
          p2Stats.totalScore += match.result.player2Stats.totalScore || 0;
        }
        if (match.result.player2Stats?.totalDarts !== undefined) {
          p2Stats.dartsThrown += match.result.player2Stats.totalDarts || 0;
        }
      }
    }
  });

  // Calculate cumulative averages for all players
  playerStats.forEach((stats) => {
    if (stats.dartsThrown > 0) {
      stats.average = (stats.totalScore / stats.dartsThrown) * 3;
    } else {
      stats.average = 0;
    }
  });

  // Convert to array
  const standings = Array.from(playerStats.values());

  // Use provided criteria order or default
  const order = criteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
  
  // Sort standings according to criteria order
  standings.sort((a, b) => {
    for (const criterion of order) {
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

  return standings;
}

// Tournament Operations
export const tournamentService = {
  // Create a new tournament
  async createTournament(tournamentData) {
    try {
      
      const tournamentId = tournamentData.id
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('User must be authenticated to create tournaments')
      
      // Create tournament
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({
          id: tournamentId,
          name: tournamentData.name,
          legs_to_win: tournamentData.legsToWin || 3,
          starting_score: tournamentData.startingScore || 501,
          group_settings: tournamentData.groupSettings ? {
            ...tournamentData.groupSettings,
            standingsCriteriaOrder: tournamentData.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead']
          } : {
            standingsCriteriaOrder: tournamentData.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead']
          },
          playoff_settings: tournamentData.playoffSettings || null,
          playoffs: tournamentData.playoffs || null,
          tournament_type: tournamentData.tournamentType || 'groups_with_playoffs',
          league_id: tournamentData.leagueId || null,
          user_id: user.id,
          status: tournamentData.status || 'open_for_registration'
        })
        .select()
        .single()

      if (tournamentError) {
        console.error('Tournament creation error:', tournamentError)
        throw tournamentError
      }


      // Create/update players and map old IDs to new IDs
      const playerIdMap = new Map() // oldId -> newId
      const playerIds = []
      
      for (const player of tournamentData.players) {
        // Check if player already exists
        const { data: existingPlayer, error: checkError } = await supabase
          .from('players')
          .select('id')
          .eq('name', player.name)
          .maybeSingle()

        let playerId
        if (existingPlayer && !checkError) {
          playerId = existingPlayer.id
        } else {
          // Create new player
          playerId = generateId()
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({
              id: playerId,
              name: player.name
            })
            .select()
            .single()

          if (playerError) throw playerError
        }
        
        playerIdMap.set(player.id, playerId)
        playerIds.push(playerId)
      }

      // Create tournament_players relationships (handle duplicates)
      const tournamentPlayers = playerIds.map(playerId => ({
        tournament_id: tournamentId,
        player_id: playerId
      }))

      const { error: tpError } = await supabase
        .from('tournament_players')
        .upsert(tournamentPlayers, { 
          onConflict: 'tournament_id,player_id',
          ignoreDuplicates: true 
        })

      if (tpError) throw tpError

      // Create groups
      const groups = []
      for (let i = 0; i < tournamentData.groups.length; i++) {
        const group = tournamentData.groups[i]
        const groupId = generateId()
        
        const { data: newGroup, error: groupError } = await supabase
          .from('groups')
          .insert({
            id: groupId,
            tournament_id: tournamentId,
            name: group.name
          })
          .select()
          .single()

        if (groupError) throw groupError

        // Create group_players relationships
        const groupPlayers = group.players.map(player => ({
          group_id: groupId,
          player_id: playerIdMap.get(player.id)
        }))

        const { error: gpError } = await supabase
          .from('group_players')
          .upsert(groupPlayers, { 
            onConflict: 'group_id,player_id',
            ignoreDuplicates: true 
          })

        if (gpError) throw gpError

        // Create matches
        const matches = []
        
        for (const match of group.matches) {
          const matchId = generateId()
          
          // Get player IDs safely
          const player1Id = playerIdMap.get(match.player1?.id)
          const player2Id = playerIdMap.get(match.player2?.id)
          
          if (!player1Id || !player2Id) {
            console.error('Missing player IDs for match:', match)
            continue
          }
          
          const { data: newMatch, error: matchError } = await supabase
            .from('matches')
            .insert({
              id: matchId,
              tournament_id: tournamentId,
              group_id: groupId,
              player1_id: player1Id,
              player2_id: player2Id,
              legs_to_win: tournamentData.legsToWin || 3,
              starting_score: tournamentData.startingScore || 501,
              status: 'pending'
            })
            .select()
            .single()

          if (matchError) throw matchError
          matches.push(newMatch)
        }

        groups.push({
          ...newGroup,
          players: group.players,
          matches: matches
        })
      }

      // Parse group_settings if it's a string (JSONB from Supabase might be string)
      let groupSettings = tournament.group_settings;
      if (typeof groupSettings === 'string') {
        try {
          groupSettings = JSON.parse(groupSettings);
        } catch (e) {
          console.error('Error parsing group_settings:', e);
          groupSettings = {};
        }
      }

      return {
        ...tournament,
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        legsToWin: tournament.legs_to_win,
        startingScore: tournament.starting_score,
        groupSettings: groupSettings || {
          type: 'groups',
          value: 2,
          standingsCriteriaOrder: tournamentData.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead']
        },
        playoffSettings: tournament.playoff_settings,
        playoffs: tournament.playoffs,
        standingsCriteriaOrder: groupSettings?.standingsCriteriaOrder || tournamentData.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
        leagueId: tournament.league_id || tournamentData.leagueId || null,
        createdAt: tournament.created_at,
        updatedAt: tournament.updated_at,
        players: tournamentData.players.map(player => ({
          ...player,
          id: playerIdMap.get(player.id)
        })),
        groups: groups.map(group => ({
          ...group,
          players: group.players.map(player => ({
            ...player,
            id: playerIdMap.get(player.id)
          })),
          matches: group.matches.map(match => {
            console.log('Transforming match:', match, 'playerIdMap:', playerIdMap);
            return {
              ...match,
              legsToWin: match.legs_to_win,
              startingScore: match.starting_score,
              player1: match.player1 ? {
                ...match.player1,
                id: playerIdMap.get(match.player1.id)
              } : null,
              player2: match.player2 ? {
                ...match.player2,
                id: playerIdMap.get(match.player2.id)
              } : null
            };
          })
        }))
      }

    } catch (error) {
      console.error('Error creating tournament:', error)
      
      // If Supabase fails, return a local tournament structure for fallback
      return {
        id: generateId(),
        name: tournamentData.name,
        status: 'active',
        legsToWin: tournamentData.legsToWin || 3,
        startingScore: tournamentData.startingScore || 501,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        players: tournamentData.players,
        groups: tournamentData.groups
      }
    }
  },

  // Get all tournaments
  async getTournaments() {
    try {
      // First, get all tournaments with basic info (excluding deleted ones)
      const { data: tournaments, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: false })

      if (tournamentsError) throw tournamentsError

      // Get all players
      const { data: allPlayers, error: playersError } = await supabase
        .from('players')
        .select('*')

      if (playersError) throw playersError

      // Create a player lookup map
      const playerMap = new Map(allPlayers.map(player => [player.id, player]))

      // Get all matches
      const { data: allMatches, error: matchesError } = await supabase
        .from('matches')
        .select('*')

      if (matchesError) throw matchesError

      // Get all groups
      const { data: allGroups, error: groupsError } = await supabase
        .from('groups')
        .select('*')

      if (groupsError) throw groupsError

      // Get tournament players
      const { data: tournamentPlayers, error: tpError } = await supabase
        .from('tournament_players')
        .select('*')

      if (tpError) throw tpError

      // Get group players
      const { data: groupPlayers, error: gpError } = await supabase
        .from('group_players')
        .select('*')

      if (gpError) throw gpError

      // Fetch match player stats
      const { data: matchPlayerStats, error: statsError } = await supabase
        .from('match_player_stats')
        .select('*')

      if (statsError) throw statsError


      // Transform data to match our app structure
      return tournaments.map(tournament => {
        // Parse group_settings if it's a string (JSONB from Supabase might be string)
        let groupSettings = tournament.group_settings;
        if (typeof groupSettings === 'string') {
          try {
            groupSettings = JSON.parse(groupSettings);
          } catch (e) {
            console.error('Error parsing group_settings:', e);
            groupSettings = {};
          }
        }
        
        // Extract standingsCriteriaOrder from groupSettings
        const standingsCriteriaOrder = groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
        // Get tournament players
        const tournamentPlayerIds = tournamentPlayers
          .filter(tp => tp.tournament_id === tournament.id)
          .map(tp => tp.player_id)
        const tournamentPlayersList = tournamentPlayerIds
          .map(id => playerMap.get(id))
          .filter(Boolean)

        // Get groups for this tournament
        const tournamentGroups = allGroups
          .filter(group => group.tournament_id === tournament.id)
          .map(group => {
            // Get group players
            const groupPlayerIds = groupPlayers
              .filter(gp => gp.group_id === group.id)
              .map(gp => gp.player_id)
            const groupPlayersList = groupPlayerIds
              .map(id => playerMap.get(id))
              .filter(Boolean)

            // Get matches for this group
            const groupMatches = allMatches
              .filter(match => match.group_id === group.id)
              .map(match => {
                
                // Get player stats for this match
                const player1Stats = matchPlayerStats?.find(s => s.match_id === match.id && s.player_id === match.player1_id);
                const player2Stats = matchPlayerStats?.find(s => s.match_id === match.id && s.player_id === match.player2_id);
                
                return {
                  id: match.id,
                  player1: playerMap.get(match.player1_id) || null,
                  player2: playerMap.get(match.player2_id) || null,
                  status: match.status,
                  legsToWin: match.legs_to_win,
                  startingScore: match.starting_score,
                  startedByUserId: match.started_by_user_id,
                  result: match.winner_id ? (() => {
                    // If result JSONB exists, use it (it contains full data including checkouts and legAverages)
                    if (match.result) {
                      // Parse if it's a string (JSONB from Supabase might be string)
                      let parsedResult = match.result;
                      if (typeof parsedResult === 'string') {
                        try {
                          parsedResult = JSON.parse(parsedResult);
                        } catch (e) {
                          console.error('Error parsing match result:', e);
                          parsedResult = null;
                        }
                      }
                      if (parsedResult) {
                        return parsedResult;
                      }
                    }
                    // Fallback to basic stats if result doesn't exist
                    return {
                      winner: match.winner_id,
                      player1Id: match.player1_id,
                      player2Id: match.player2_id,
                      player1Legs: match.player1_legs,
                      player2Legs: match.player2_legs,
                      player1Stats: player1Stats ? {
                        totalScore: player1Stats.total_score,
                        totalDarts: player1Stats.total_darts,
                        average: parseFloat(player1Stats.average),
                        checkouts: [],
                        legAverages: [],
                        legs: []
                      } : null,
                      player2Stats: player2Stats ? {
                        totalScore: player2Stats.total_score,
                        totalDarts: player2Stats.total_darts,
                        average: parseFloat(player2Stats.average),
                        checkouts: [],
                        legAverages: [],
                        legs: []
                      } : null
                    };
                  })() : null
                };
              })

            const groupWithData = {
              id: group.id,
              name: group.name,
              players: groupPlayersList,
              matches: groupMatches,
              standings: []
            };

            // Calculate standings for this group with tournament criteria order
            groupWithData.standings = calculateGroupStandings(groupWithData, standingsCriteriaOrder);

            return groupWithData;
          })

        // Get playoff matches for this tournament
        // IMPORTANT: playoff matches have group_id = NULL, so we must scope by matches.tournament_id
        // Otherwise every tournament would "see" every playoff match in the DB, leaking statistics across tournaments.
        const playoffMatches = allMatches
          .filter(match => match.is_playoff === true && match.tournament_id === tournament.id)
          .map(match => {
            return {
              id: match.id,
              player1: playerMap.get(match.player1_id) || null,
              player2: playerMap.get(match.player2_id) || null,
              status: match.status,
              legsToWin: match.legs_to_win,
              startingScore: match.starting_score,
              startedByUserId: match.started_by_user_id,
              isPlayoff: true,
              playoffRound: match.playoff_round,
              playoffMatchNumber: match.playoff_match_number,
              result: match.winner_id ? (() => {
                // If result JSONB exists, use it (it contains full data including checkouts and legAverages)
                if (match.result) {
                  // Parse if it's a string (JSONB from Supabase might be string)
                  let parsedResult = match.result;
                  if (typeof parsedResult === 'string') {
                    try {
                      parsedResult = JSON.parse(parsedResult);
                    } catch (e) {
                      console.error('Error parsing playoff match result:', e);
                      parsedResult = null;
                    }
                  }
                  if (parsedResult) {
                    return parsedResult;
                  }
                }
                // Fallback to basic stats if result doesn't exist
                return {
                  winner: match.winner_id,
                  player1Legs: match.player1_legs,
                  player2Legs: match.player2_legs
                };
              })() : null
            };
          });

        return {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          legsToWin: tournament.legs_to_win,
          startingScore: tournament.starting_score,
          playoffSettings: tournament.playoff_settings,
          playoffs: tournament.playoffs,
          playoffMatches: playoffMatches,
          tournamentType: tournament.tournament_type || 'groups_with_playoffs',
          standingsCriteriaOrder: standingsCriteriaOrder,
          leagueId: tournament.league_id || null,
          createdAt: tournament.created_at,
          updatedAt: tournament.updated_at,
          userId: tournament.user_id,
          players: tournamentPlayersList,
          groups: tournamentGroups
        }
      })

    } catch (error) {
      console.error('Error fetching tournaments:', error)
      throw error
    }
  },

  // Get a single tournament
  async getTournament(tournamentId) {
    try {
      
      const { data: tournament, error } = await supabase
        .from('tournaments')
        .select(`
          *,
          tournament_players(
            player:players(*)
          ),
          groups(
            *,
            group_players(
              player:players(*)
            ),
            matches(
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*)
            )
          )
        `)
        .eq('id', tournamentId)
        .eq('deleted', false)
        .maybeSingle()

      if (error) {
        console.error('Error fetching tournament:', error);
        throw error;
      }

      if (!tournament) {
        throw new Error('Tournament not found');
      }

      // Parse group_settings if it's a string (JSONB from Supabase might be string)
      let groupSettings = tournament.group_settings;
      
      if (typeof groupSettings === 'string') {
        try {
          groupSettings = JSON.parse(groupSettings);
        } catch (e) {
          console.error('Error parsing group_settings:', e);
          groupSettings = {};
        }
      }

      // Deduplicate groups - Supabase nested queries can return duplicates
      const uniqueGroupsMap = new Map();
      if (tournament.groups) {
        tournament.groups.forEach(group => {
          if (!uniqueGroupsMap.has(group.id)) {
            uniqueGroupsMap.set(group.id, group);
          }
        });
      }
      const uniqueGroups = Array.from(uniqueGroupsMap.values());

      // Transform data to match our app structure
        // Get match player stats for all matches in this tournament
        const allMatchIds = uniqueGroups.flatMap(group => 
          group.matches.map(match => match.id)
        );
        
        let matchPlayerStatsMap = new Map();
        if (allMatchIds.length > 0) {
          const { data: matchPlayerStats, error: statsError } = await supabase
            .from('match_player_stats')
            .select('*')
            .in('match_id', allMatchIds);
          
          if (statsError) {
            console.error('Error fetching match player stats:', statsError);
          } else {
            // Create a map: match_id -> { player1_id: stats, player2_id: stats }
            matchPlayerStats?.forEach(stat => {
              if (!matchPlayerStatsMap.has(stat.match_id)) {
                matchPlayerStatsMap.set(stat.match_id, {});
              }
              const matchStats = matchPlayerStatsMap.get(stat.match_id);
              matchStats[stat.player_id] = stat;
            });
          }
        }
        
        // Get playoff matches for this tournament
        // Filter by tournament_id (direct relationship)
        const { data: playoffMatchesData, error: playoffMatchesError } = await supabase
          .from('matches')
          .select(`
            *,
            player1:players!matches_player1_id_fkey(*),
            player2:players!matches_player2_id_fkey(*)
          `)
          .eq('is_playoff', true)
          .eq('tournament_id', tournamentId);

        if (playoffMatchesError) {
          console.error('Error fetching playoff matches:', playoffMatchesError);
        }

        const playoffMatches = (playoffMatchesData || []).map(match => ({
          id: match.id,
          player1: match.player1 || null,
          player2: match.player2 || null,
          status: match.status,
          legsToWin: match.legs_to_win,
          startingScore: match.starting_score,
          startedByUserId: match.started_by_user_id,
          isPlayoff: true,
          playoffRound: match.playoff_round,
          playoffMatchNumber: match.playoff_match_number,
          result: match.winner_id ? (() => {
            // If result JSONB exists, use it (it contains full data including checkouts and legAverages)
            if (match.result) {
              // Parse if it's a string (JSONB from Supabase might be string)
              let parsedResult = match.result;
              if (typeof parsedResult === 'string') {
                try {
                  parsedResult = JSON.parse(parsedResult);
                } catch (e) {
                  console.error('Error parsing playoff match result:', e);
                  parsedResult = null;
                }
              }
              return parsedResult;
            }
            // Fallback to basic stats if result doesn't exist
            return {
              winner: match.winner_id,
              player1Legs: match.player1_legs,
              player2Legs: match.player2_legs
            };
          })() : null
        }));

        return {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          legsToWin: tournament.legs_to_win,
          startingScore: tournament.starting_score,
          groupSettings: groupSettings || {
            type: 'groups',
            value: 2,
            standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead']
          },
          playoffSettings: tournament.playoff_settings,
          playoffs: tournament.playoffs,
          playoffMatches: playoffMatches,
          tournamentType: tournament.tournament_type || 'groups_with_playoffs',
          standingsCriteriaOrder: groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
          leagueId: tournament.league_id || null,
          createdAt: tournament.created_at,
          updatedAt: tournament.updated_at,
          userId: tournament.user_id,
          players: tournament.tournament_players.map(tp => tp.player),
          groups: uniqueGroups.map(group => {
          const groupWithData = {
            id: group.id,
            name: group.name,
            players: group.group_players.map(gp => gp.player),
            matches: group.matches.map(match => {
              // Get player stats for this match
              const matchStats = matchPlayerStatsMap.get(match.id) || {};
              const player1StatsData = match.player1?.id ? matchStats[match.player1.id] : null;
              const player2StatsData = match.player2?.id ? matchStats[match.player2.id] : null;
              
              return {
                id: match.id,
                player1: match.player1 || null,
                player2: match.player2 || null,
                status: match.status,
                legsToWin: match.legs_to_win,
                startingScore: match.starting_score,
                startedByUserId: match.started_by_user_id,
                result: match.winner_id ? (() => {
                  // If result JSONB exists, use it (it contains full data including checkouts and legAverages)
                  if (match.result) {
                    // Parse if it's a string (JSONB from Supabase might be string)
                    let parsedResult = match.result;
                    if (typeof parsedResult === 'string') {
                      try {
                        parsedResult = JSON.parse(parsedResult);
                      } catch (e) {
                        console.error('Error parsing match result:', e);
                        parsedResult = null;
                      }
                    }
                    // Ensure the result has the expected structure
                    if (parsedResult && parsedResult.player1Stats && !parsedResult.player1Stats.checkouts) {
                      console.warn('Match result missing checkouts for player1:', match.id);
                    }
                    if (parsedResult && parsedResult.player2Stats && !parsedResult.player2Stats.checkouts) {
                      console.warn('Match result missing checkouts for player2:', match.id);
                    }
                    return parsedResult;
                  }
                  // Fallback to basic stats if result doesn't exist
                  return {
                    winner: match.winner_id,
                    player1Legs: match.player1_legs,
                    player2Legs: match.player2_legs,
                    player1Stats: player1StatsData ? {
                      totalScore: player1StatsData.total_score || 0,
                      totalDarts: player1StatsData.total_darts || 0,
                      average: player1StatsData.average ? parseFloat(player1StatsData.average) : 0
                    } : null,
                    player2Stats: player2StatsData ? {
                      totalScore: player2StatsData.total_score || 0,
                      totalDarts: player2StatsData.total_darts || 0,
                      average: player2StatsData.average ? parseFloat(player2StatsData.average) : 0
                    } : null
                  };
                })() : null
              };
            }),
            standings: []
          };

          // Calculate standings for this group with tournament criteria order
          const criteriaOrder = groupSettings?.standingsCriteriaOrder || null;
          groupWithData.standings = calculateGroupStandings(groupWithData, criteriaOrder);

          return groupWithData;
        })
      }

    } catch (error) {
      console.error('Error fetching tournament:', error)
      throw error
    }
  },

  // Start tournament (generate groups and matches)
  async startTournament(tournamentId, groupSettings, customGroups = null) {
    try {
      
      // Get current tournament data
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select(`
          *,
          tournament_players(
            player:players(*)
          )
        `)
        .eq('id', tournamentId)
        .eq('deleted', false)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournament) throw new Error('Tournament not found');

      // Check if groups already exist for this tournament
      const { data: existingGroups, error: groupsCheckError } = await supabase
        .from('groups')
        .select('id')
        .eq('tournament_id', tournamentId);

      if (groupsCheckError) throw groupsCheckError;
      
      if (existingGroups && existingGroups.length > 0) {
        console.warn('Groups already exist for this tournament. Skipping group creation.');
        // Return the existing tournament data instead of creating duplicates
        const completeTournament = await this.getTournament(tournamentId);
        return completeTournament;
      }

      // Get all players for this tournament
      const players = tournament.tournament_players.map(tp => tp.player);
      if (players.length < 2) {
        throw new Error('Tournament needs at least 2 players to start');
      }

      // Generate groups (or use provided custom groups from pre-start editor)
      const playersById = new Map(players.map(p => [p.id, p]));
      const hasCustomGroups = Array.isArray(customGroups) && customGroups.length > 0;

      let groups = hasCustomGroups ? customGroups : this.generateGroups(players, groupSettings);

      // Normalize groups: ensure ids/names exist, players are valid, and regenerate matches from final group players
      const assignedPlayerIds = new Set();
      groups = groups
        .map((g, i) => {
          const groupId = g?.id || generateId();
          const groupName = g?.name || `Group ${String.fromCharCode(65 + i)}`;
          const groupPlayers = (g?.players || [])
            .map(p => playersById.get(p?.id) || p)
            .filter(p => p && p.id);

          groupPlayers.forEach(p => assignedPlayerIds.add(p.id));

          return {
            id: groupId,
            name: groupName,
            players: groupPlayers,
            matches: this.generateGroupMatches(groupPlayers, i + 1),
            standings: []
          };
        })
        .filter(g => g.players.length > 0);

      // Basic safety: if customGroups missed players, fall back to balanced generation
      if (hasCustomGroups && assignedPlayerIds.size !== players.length) {
        console.warn('Custom group assignment did not include all players; falling back to auto-generation.');
        groups = this.generateGroups(players, groupSettings);
      }
      
      // Create groups in database
      const groupIds = [];
      for (const group of groups) {
        const { data: newGroup, error: groupError } = await supabase
          .from('groups')
          .insert({
            id: group.id,
            tournament_id: tournamentId,
            name: group.name
          })
          .select()
          .single();

        if (groupError) throw groupError;
        groupIds.push(newGroup.id);

        // Add players to group
        const groupPlayerInserts = group.players.map(player => ({
          group_id: group.id,
          player_id: player.id
        }));

        const { error: gpError } = await supabase
          .from('group_players')
          .insert(groupPlayerInserts);

        if (gpError) throw gpError;

        // Create matches for this group
        for (const match of group.matches) {
          const { error: matchError } = await supabase
            .from('matches')
            .insert({
              id: match.id,
              tournament_id: tournamentId,
              group_id: group.id,
              player1_id: match.player1.id,
              player2_id: match.player2.id,
              legs_to_win: tournament.legs_to_win,
              starting_score: tournament.starting_score,
              status: 'pending'
            });

          if (matchError) throw matchError;
        }
      }

      // Update tournament status to 'started'
      const { data: updatedTournament, error: updateError } = await supabase
        .from('tournaments')
        .update({ 
          status: 'started',
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select()
        .single();

      if (updateError) throw updateError;

      
      // Return the complete tournament data by fetching it again
      const completeTournament = await this.getTournament(tournamentId);
      return completeTournament;

    } catch (error) {
      console.error('Error starting tournament:', error);
      throw error;
    }
  },

  // Helper function to generate groups (moved from TournamentCreation)
  generateGroups(players, settings) {
    const groups = [];
    let groupCount;
    let playersPerGroup;

    if (settings.type === 'groups') {
      groupCount = Math.max(1, Number(settings.value) || 1);
      // Don't create more groups than players
      groupCount = Math.min(groupCount, players.length);
    } else {
      playersPerGroup = settings.value;
      groupCount = Math.ceil(players.length / playersPerGroup);
    }

    // Shuffle players for random distribution
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

    if (settings.type === 'groups') {
      // Distribute players as evenly as possible:
      // e.g. 34 players, 4 groups => 9, 9, 8, 8 (difference between any two groups is at most 1)
      const baseSize = Math.floor(shuffledPlayers.length / groupCount);
      const extra = shuffledPlayers.length % groupCount; // first <extra> groups get +1
      let cursor = 0;

      for (let i = 0; i < groupCount; i++) {
        const size = baseSize + (i < extra ? 1 : 0);
        const groupPlayers = shuffledPlayers.slice(cursor, cursor + size);
        cursor += size;

        if (groupPlayers.length === 0) continue;
        groups.push({
          id: generateId(),
          name: `Group ${String.fromCharCode(65 + i)}`, // A, B, C, etc.
          players: groupPlayers,
          matches: this.generateGroupMatches(groupPlayers, i + 1),
          standings: []
        });
      }
    } else {
      // Legacy behavior: fixed players-per-group (last group may be smaller)
      playersPerGroup = Math.max(1, Number(playersPerGroup) || 1);
    for (let i = 0; i < groupCount; i++) {
      const groupPlayers = shuffledPlayers.slice(i * playersPerGroup, (i + 1) * playersPerGroup);
      if (groupPlayers.length > 0) {
        const group = {
          id: generateId(),
          name: `Group ${String.fromCharCode(65 + i)}`, // A, B, C, etc.
          players: groupPlayers,
          matches: this.generateGroupMatches(groupPlayers, i + 1),
          standings: []
        };
        groups.push(group);
        }
      }
    }

    return groups;
  },

  // Helper function to reorder matches to minimize player overlap
  // Strategy: Try to avoid using players from the last 1-2 matches in the next match
  reorderMatchesToMinimizeOverlap(matches) {
    if (matches.length <= 1) return matches;
    
    const ordered = [];
    const remaining = [...matches];
    
    // Start with the first match
    let currentMatch = remaining.shift();
    ordered.push(currentMatch);
    
    // Track players from the last match (2 players) and the match before that (4 players total)
    let lastMatchPlayers = new Set([currentMatch.player1.id, currentMatch.player2.id]);
    let previousMatchPlayers = new Set();
    
    while (remaining.length > 0) {
      let foundMatch = null;
      let foundIndex = -1;
      
      // First, try to find a match that doesn't overlap with players from the last match
      for (let i = 0; i < remaining.length; i++) {
        const match = remaining[i];
        const matchPlayer1 = match.player1.id;
        const matchPlayer2 = match.player2.id;
        
        // Check if this match overlaps with the last match
        const overlapsLastMatch = lastMatchPlayers.has(matchPlayer1) || lastMatchPlayers.has(matchPlayer2);
        
        if (!overlapsLastMatch) {
          // Also check if we can avoid overlapping with previous match (if we have one)
          if (previousMatchPlayers.size === 0) {
            // No previous match, so this is perfect
            foundMatch = match;
            foundIndex = i;
            break;
          } else {
            // Check if it also avoids previous match players
            const overlapsPrevious = previousMatchPlayers.has(matchPlayer1) || previousMatchPlayers.has(matchPlayer2);
            if (!overlapsPrevious) {
              // Perfect: avoids both last and previous match
              foundMatch = match;
              foundIndex = i;
              break;
            } else if (!foundMatch) {
              // Still good: avoids last match (but overlaps previous)
              foundMatch = match;
              foundIndex = i;
            }
          }
        }
      }
      
      // If we found a match that avoids the last match, use it
      if (foundMatch) {
        ordered.push(foundMatch);
        remaining.splice(foundIndex, 1);
        
        // Update tracking: previous becomes last, current becomes new last
        previousMatchPlayers = new Set(lastMatchPlayers);
        lastMatchPlayers = new Set([foundMatch.player1.id, foundMatch.player2.id]);
      } else {
        // No match found that avoids the last match - start a new "round"
        // Take any remaining match and reset tracking
        foundMatch = remaining.shift();
        ordered.push(foundMatch);
        
        // Reset: this match becomes the new starting point
        lastMatchPlayers = new Set([foundMatch.player1.id, foundMatch.player2.id]);
        previousMatchPlayers = new Set();
      }
    }
    
    return ordered;
  },

  // Helper function to generate group matches
  generateGroupMatches(groupPlayers, groupId) {
    const matches = [];
    for (let i = 0; i < groupPlayers.length; i++) {
      for (let j = i + 1; j < groupPlayers.length; j++) {
        matches.push({
          id: generateId(),
          player1: groupPlayers[i],
          player2: groupPlayers[j],
          status: 'pending',
          result: null
        });
      }
    }
    // Reorder matches to minimize player overlap between consecutive matches
    return this.reorderMatchesToMinimizeOverlap(matches);
  },

  // Add player to tournament
  async addPlayerToTournament(tournamentId, playerName) {
    try {
      
      // Check if tournament is still open for registration
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('status')
        .eq('id', tournamentId)
        .eq('deleted', false)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournament) throw new Error('Tournament not found or has been deleted');
      if (tournament.status !== 'open_for_registration') {
        throw new Error('Tournament is no longer accepting new players');
      }

      // Create or find player
      const { data: existingPlayer, error: playerError } = await supabase
        .from('players')
        .select('id')
        .eq('name', playerName)
        .maybeSingle();

      if (playerError) throw playerError;

      let playerId;
      if (existingPlayer) {
        playerId = existingPlayer.id;
      } else {
        const { data: newPlayer, error: createPlayerError } = await supabase
          .from('players')
          .insert({ name: playerName })
          .select('id')
          .single();

        if (createPlayerError) throw createPlayerError;
        playerId = newPlayer.id;
      }

      // Add player to tournament
      const { data: tournamentPlayer, error: tpError } = await supabase
        .from('tournament_players')
        .insert({
          tournament_id: tournamentId,
          player_id: playerId
        })
        .select(`
          player:players(*)
        `)
        .single();

      if (tpError) throw tpError;

      return tournamentPlayer.player;

    } catch (error) {
      console.error('Error adding player to tournament:', error);
      throw error;
    }
  },

  // Remove player from tournament
  async removePlayerFromTournament(tournamentId, playerId) {
    try {
      
      // Check if tournament is still open for registration
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('status')
        .eq('id', tournamentId)
        .eq('deleted', false)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournament) throw new Error('Tournament not found or has been deleted');
      if (tournament.status !== 'open_for_registration') {
        throw new Error('Tournament is no longer accepting player changes');
      }

      // Remove player from tournament
      const { error: deleteError } = await supabase
        .from('tournament_players')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId);

      if (deleteError) throw deleteError;

      return true;

    } catch (error) {
      console.error('Error removing player from tournament:', error);
      throw error;
    }
  },

  // Update tournament
  async updateTournament(tournamentId, updates) {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select()
        .single()

      if (error) throw error
      return data

    } catch (error) {
      console.error('Error updating tournament:', error)
      throw error
    }
  },

  // Delete tournament (soft delete - sets deleted flag to true)
  async deleteTournament(tournamentId) {
    try {
      console.log('Attempting to soft delete tournament:', tournamentId);
      
      // First, check if tournament exists and get user info
      const { data: existingTournament, error: checkError } = await supabase
        .from('tournaments')
        .select('id, name, deleted, user_id')
        .eq('id', tournamentId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking tournament existence:', checkError);
        throw checkError;
      }

      if (!existingTournament) {
        console.warn('No tournament found with id:', tournamentId);
        throw new Error(`Tournament not found with ID: ${tournamentId}`);
      }

      console.log('Tournament found:', existingTournament);

      // Check current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error getting current user:', userError);
      }
      console.log('Current user ID:', user?.id);
      console.log('Tournament user_id:', existingTournament.user_id);
      
      // Check if user is admin
      const isAdmin = !!(
        user?.user_metadata?.role === 'admin' ||
        user?.app_metadata?.role === 'admin' ||
        user?.raw_user_meta_data?.role === 'admin' ||
        user?.raw_app_meta_data?.role === 'admin'
      );
      
      // Allow deletion if user is admin OR if user owns the tournament
      if (user && existingTournament.user_id && user.id !== existingTournament.user_id && !isAdmin) {
        throw new Error(`Permission denied: You can only delete tournaments you created. Tournament belongs to user ${existingTournament.user_id}, but you are ${user.id}`);
      }

      // Soft delete: set deleted = true instead of actually deleting
      // Note: We don't filter by deleted=false because we want to allow updating even if already deleted
      const { data, error } = await supabase
        .from('tournaments')
        .update({ 
          deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select();

      if (error) {
        console.error('Error updating tournament deleted flag:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      // If select returns no data (due to RLS), verify the update worked
      if (!data || data.length === 0) {
        console.warn('Update query returned no data (possibly due to RLS). Verifying update...');
        
        // Wait a moment for the update to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if the update actually worked by querying again (without deleted filter to see current state)
        const { data: verifyData, error: verifyError } = await supabase
          .from('tournaments')
          .select('id, deleted, name')
          .eq('id', tournamentId)
          .maybeSingle();
        
        if (verifyError) {
          console.error('Verification query error:', verifyError);
          throw new Error(`Update may have failed. Verification error: ${verifyError.message}`);
        }
        
        if (!verifyData) {
          throw new Error('Tournament not found during verification');
        }
        
        console.log('Verification result:', verifyData);
        
        if (verifyData.deleted === true) {
          console.log('Update verified - tournament is now deleted');
          return true;
        } else {
          // The update didn't work - likely RLS blocking it
          console.error('Update failed - tournament deleted flag is still false');
          console.error('This is likely due to Row Level Security (RLS) policies blocking the update.');
          console.error('Tournament data:', verifyData);
          throw new Error('Update failed - Row Level Security policy may be blocking the update. Check if you have permission to update this tournament.');
        }
      }

      console.log('Successfully soft deleted tournament:', data);
      return true;

    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw error;
    }
  },

  // Update tournament playoffs
  async updateTournamentPlayoffs(tournamentId, playoffsData) {
    try {
      // Don't create playoff matches automatically - they will be created when matches are started

      // Then update the tournament playoffs data
      const { data, error } = await supabase
        .from('tournaments')
        .update({ 
          playoffs: playoffsData,
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating tournament playoffs:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating tournament playoffs:', error);
      throw error;
    }
  },

  // Reset tournament playoffs (clear all playoff data)
  async resetTournamentPlayoffs(tournamentId) {
    try {
      // Clear the playoffs data and reset status to in_progress
      const { data, error } = await supabase
        .from('tournaments')
        .update({ 
          playoffs: null,
          status: 'in_progress',
          league_points_calculated: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select()
        .single();

      if (error) {
        console.error('Error resetting tournament playoffs:', error);
        throw error;
      }

      // Also delete any playoff matches from the matches table
      const { error: matchesError } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('is_playoff', true);

      if (matchesError) {
        console.error('Error deleting playoff matches:', matchesError);
        // Don't throw - the main reset succeeded
      }

      console.log('Successfully reset playoffs for tournament:', tournamentId);
      return data;
    } catch (error) {
      console.error('Error resetting tournament playoffs:', error);
      throw error;
    }
  },

  // Update tournament status
  async updateTournamentStatus(tournamentId, status) {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .update({ 
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', tournamentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating tournament status:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating tournament status:', error);
      throw error;
    }
  },

  // Update tournament settings
  async updateTournamentSettings(tournamentId, settings) {
    try {

      // First, get the current tournament to preserve existing group_settings
      const { data: currentTournament, error: fetchError } = await supabase
        .from('tournaments')
        .select('group_settings')
        .eq('id', tournamentId)
        .single();

      if (fetchError) {
        console.error('Error fetching current tournament:', fetchError);
        throw fetchError;
      }

      // Merge existing group_settings with new settings, ensuring standingsCriteriaOrder is set
      const existingGroupSettings = currentTournament?.group_settings || {};
      const groupSettingsWithCriteria = {
        ...existingGroupSettings,
        ...settings.groupSettings,
        standingsCriteriaOrder: settings.standingsCriteriaOrder || existingGroupSettings.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead']
      };
      
      
      const updateData = {
        legs_to_win: settings.legsToWin,
        starting_score: settings.startingScore,
        playoff_settings: settings.playoffSettings,
        group_settings: groupSettingsWithCriteria,
        updated_at: new Date().toISOString()
      };

      // Optionally update tournament type (used by the registration settings modal)
      if (settings.tournamentType) {
        updateData.tournament_type = settings.tournamentType;
      }
      
      // Optionally update tournament status if provided in settings (e.g., for playoff-only start)
      if (settings.status) {
        updateData.status = settings.status;
      }
      
      const { data, error } = await supabase
        .from('tournaments')
        .update(updateData)
        .eq('id', tournamentId)
        .select()
        .single();

      if (error) {
        console.error('Error updating tournament settings:', error);
        throw error;
      }

      return data;

    } catch (error) {
      console.error('Error updating tournament settings:', error);
      throw error;
    }
  }
};

// Match Operations
export const matchService = {
  // Update match with user who started it (or create it if it doesn't exist for playoff matches)
  async startMatch(matchId, userId, matchData = null) {
    try {
      
      // First, try to update the existing match
      const { data: existingMatch, error: updateError } = await supabase
        .from('matches')
        .update({ 
          started_by_user_id: userId,
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', matchId)
        .select()
        .maybeSingle()

      if (updateError) {
        console.error('Supabase error in startMatch update:', updateError);
        throw updateError;
      }

      // If match exists, return the updated data
      if (existingMatch) {
        return existingMatch;
      }

      // If match doesn't exist and we have matchData (for playoff matches), create it
      if (matchData) {
        // Get tournament_id for playoff matches
        let tournamentId = matchData.tournamentId || matchData.tournament_id;
        
        // If tournament_id not provided and it's a playoff match, look it up from players
        if (!tournamentId && matchData.isPlayoff && matchData.player1?.id && matchData.player2?.id) {
          const { data: tournamentPlayers, error: tpError } = await supabase
            .from('tournament_players')
            .select('tournament_id')
            .in('player_id', [matchData.player1.id, matchData.player2.id]);
          
          if (!tpError && tournamentPlayers) {
            // Find tournament where both players are registered
            const tournamentCounts = {};
            tournamentPlayers.forEach(tp => {
              tournamentCounts[tp.tournament_id] = (tournamentCounts[tp.tournament_id] || 0) + 1;
            });
            
            // Find tournament where both players appear (count = 2)
            tournamentId = Object.keys(tournamentCounts).find(
              tid => tournamentCounts[tid] === 2
            ) || null;
          }
        }
        
        const { data: newMatch, error: createError } = await supabase
          .from('matches')
          .insert({
            id: matchId,
            tournament_id: tournamentId,
            player1_id: matchData.player1?.id,
            player2_id: matchData.player2?.id,
            status: 'in_progress',
            legs_to_win: matchData.legsToWin || 3,
            starting_score: matchData.startingScore || 501,
            started_by_user_id: userId,
            is_playoff: matchData.isPlayoff || false,
            playoff_round: matchData.playoffRound,
            playoff_match_number: matchData.playoffMatchNumber
          })
          .select()
          .single();

        if (createError) {
          // If it's a duplicate key error, the match was already created by another call
          if (createError.code === '23505') {
            const { data: existingMatch, error: fetchError } = await supabase
              .from('matches')
              .select('*')
              .eq('id', matchId)
              .single();
            
            if (fetchError) {
              console.error('Error fetching existing match:', fetchError);
              throw fetchError;
            }
            
            return existingMatch;
          } else {
            console.error('Error creating playoff match:', createError);
            throw createError;
          }
        }

        return newMatch;
      }

      // If no match exists and no matchData provided, throw error
      throw new Error('Match not found and no match data provided for creation');

    } catch (error) {
      console.error('Error starting match:', error)
      throw error
    }
  },
  // Start a live match
  async startLiveMatch(matchId, deviceId, deviceName = null, boardNumber = null) {
    try {
      const { data, error } = await supabase
        .from('matches')
        .update({
          status: 'in_progress',
          live_device_id: deviceId,
          live_device_name: deviceName,
          live_board_number: boardNumber,
          live_started_at: new Date().toISOString(),
          started_at: new Date().toISOString()
        })
        .eq('id', matchId)
        .select()
        .single()

      if (error) throw error
      return data

    } catch (error) {
      console.error('Error starting live match:', error)
      throw error
    }
  },

  // End a live match
  async endLiveMatch(matchId) {
    try {
      const { data, error } = await supabase
        .from('matches')
        .update({
          live_device_id: null,
          live_device_name: null,
          live_board_number: null,
          live_started_at: null
        })
        .eq('id', matchId)
        .select()

      if (error) throw error
      // Return first match if found, or null if not found (match might already be completed)
      return data && data.length > 0 ? data[0] : null

    } catch (error) {
      console.error('Error ending live match:', error)
      // Don't throw error - it's okay if the match doesn't exist or is already completed
      return null
    }
  },

  // Complete a match
  async completeMatch(matchId, matchResult) {
    try {
      const { data, error } = await supabase
        .from('matches')
        .update({
          status: 'completed',
          winner_id: matchResult.winner,
          player1_legs: matchResult.player1Legs,
          player2_legs: matchResult.player2Legs,
          completed_at: new Date().toISOString(),
          live_device_id: null,
          live_started_at: null
        })
        .eq('id', matchId)
        .select()
        .single()

      if (error) throw error
      return data

    } catch (error) {
      console.error('Error completing match:', error)
      throw error
    }
  },

  // Get live matches
  async getLiveMatches() {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          player1:players!matches_player1_id_fkey(*),
          player2:players!matches_player2_id_fkey(*)
        `)
        .not('live_device_id', 'is', null)

      if (error) throw error
      return data

    } catch (error) {
      console.error('Error fetching live matches:', error)
      throw error
    }
  },

  // Save match result to database
  async saveMatchResult(matchResult) {
    try {
      console.log('💾 Saving match result:', matchResult.matchId, 'Winner:', matchResult.winner)
      
      // Check authentication status
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('Auth error:', authError);
        // If auth session is missing, try to get the session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.error('No auth session available:', sessionError);
          throw new Error('Authentication required to complete match. Please log in again.');
        }
      }
      
      if (!user) {
        console.error('No authenticated user found');
        throw new Error('Authentication required to complete match. Please log in again.');
      }
      
      // Update the match with results
      
      const updateData = {
        status: 'completed',
        winner_id: matchResult.winner,
        player1_legs: matchResult.player1Legs,
        player2_legs: matchResult.player2Legs,
        updated_at: new Date().toISOString(),
        // Save full match result including checkouts and leg averages
        result: {
          winner: matchResult.winner,
          player1Legs: matchResult.player1Legs,
          player2Legs: matchResult.player2Legs,
          player1Stats: {
            totalScore: matchResult.player1Stats?.totalScore || 0,
            totalDarts: matchResult.player1Stats?.totalDarts || 0,
            average: matchResult.player1Stats?.average || 0,
            oneEighties: matchResult.player1Stats?.oneEighties || 0,
            legAverages: matchResult.player1Stats?.legAverages || [],
            checkouts: matchResult.player1Stats?.checkouts || [],
            legs: matchResult.player1Stats?.legs || []
          },
          player2Stats: {
            totalScore: matchResult.player2Stats?.totalScore || 0,
            totalDarts: matchResult.player2Stats?.totalDarts || 0,
            average: matchResult.player2Stats?.average || 0,
            oneEighties: matchResult.player2Stats?.oneEighties || 0,
            legAverages: matchResult.player2Stats?.legAverages || [],
            checkouts: matchResult.player2Stats?.checkouts || [],
            legs: matchResult.player2Stats?.legs || []
          }
        },
        // Clear live match tracking fields
        live_device_id: null,
        live_started_at: null,
        last_activity_at: new Date().toISOString()
      };
      
      console.log('Updating match with data:', updateData);
      
      const { data: updatedMatches, error: matchError } = await supabase
        .from('matches')
        .update(updateData)
        .eq('id', matchResult.matchId)
        .select()

      if (matchError) {
        console.error('=== DATABASE ERROR ===');
        console.error('Error updating match status:', matchError);
        console.error('Match ID:', matchResult.matchId);
        console.error('Update data:', {
          status: 'completed',
          winner_id: matchResult.winner,
          player1_legs: matchResult.player1Legs,
          player2_legs: matchResult.player2Legs,
          updated_at: new Date().toISOString()
        });
        throw matchError;
      }
      
      // Check if the update actually affected any rows
      if (!updatedMatches || updatedMatches.length === 0) {
        console.error('=== NO ROWS UPDATED ===');
        console.error('Update returned no data - possible RLS policy blocking update');
        console.error('Match ID:', matchResult.matchId);
        
        // Check if match exists
        const { data: checkMatch, error: checkError } = await supabase
          .from('matches')
          .select('id, status')
          .eq('id', matchResult.matchId)
          .single();
        
        if (checkError) {
          console.error('Error checking match existence:', checkError);
          throw new Error(`Match not found or RLS policy blocking: ${checkError.message}`);
        }
        
        if (checkMatch) {
          console.log('Match exists with status:', checkMatch.status);
          // If match exists but update didn't work, it's likely an RLS issue
          throw new Error(`RLS policy blocking update. Match exists with status: ${checkMatch.status}`);
        } else {
          throw new Error('Match not found in database');
        }
      }
      
      const updatedMatch = updatedMatches[0];
      console.log('✅ Match completed:', updatedMatch?.id, 'Winner:', updatedMatch?.winner_id);
      console.log('✅ Match status after update:', updatedMatch?.status);
      
      // Verify the status was actually updated
      if (updatedMatch?.status !== 'completed') {
        console.error('⚠️ WARNING: Match status was not updated to completed!', {
          matchId: updatedMatch?.id,
          actualStatus: updatedMatch?.status,
          expectedStatus: 'completed'
        });
        throw new Error(`Match status was not updated to completed. Actual status: ${updatedMatch?.status}`);
      }
      
      // Double-check by fetching the match again to verify it was saved
      const { data: verifyMatch, error: verifyError } = await supabase
        .from('matches')
        .select('id, status, winner_id')
        .eq('id', matchResult.matchId)
        .single();
      
      if (verifyError) {
        console.error('Error verifying match status:', verifyError);
      } else {
        console.log('✅ Verified match status from database:', verifyMatch?.status);
        if (verifyMatch?.status !== 'completed') {
          console.error('⚠️ CRITICAL: Match status verification failed!', {
            matchId: verifyMatch?.id,
            actualStatus: verifyMatch?.status,
            expectedStatus: 'completed'
          });
        }
      }
      
      // Save player statistics to match_player_stats table
      const statsPromises = [];
      
      // Player 1 stats
      if (matchResult.player1Id && matchResult.player1Stats) {
        const highestCheckout = matchResult.player1Stats.checkouts?.length > 0 
          ? Math.max(...matchResult.player1Stats.checkouts.map(c => c.checkout || 0))
          : 0;
        
        statsPromises.push(
          supabase
            .from('match_player_stats')
            .insert({
              id: generateId(),
              match_id: matchResult.matchId,
              player_id: matchResult.player1Id,
              legs_won: matchResult.player1Legs,
              legs_lost: matchResult.player2Legs,
              total_darts: matchResult.player1Stats.totalDarts,
              total_score: matchResult.player1Stats.totalScore,
              average: matchResult.player1Stats.average,
              highest_checkout: highestCheckout
            })
        );
      }
      
      // Player 2 stats
      if (matchResult.player2Id && matchResult.player2Stats) {
        const highestCheckout = matchResult.player2Stats.checkouts?.length > 0 
          ? Math.max(...matchResult.player2Stats.checkouts.map(c => c.checkout || 0))
          : 0;
        
        statsPromises.push(
          supabase
            .from('match_player_stats')
            .insert({
              id: generateId(),
              match_id: matchResult.matchId,
              player_id: matchResult.player2Id,
              legs_won: matchResult.player2Legs,
              legs_lost: matchResult.player1Legs,
              total_darts: matchResult.player2Stats.totalDarts,
              total_score: matchResult.player2Stats.totalScore,
              average: matchResult.player2Stats.average,
              highest_checkout: highestCheckout
            })
        );
      }
      
      // Wait for all stats to be saved
      const statsResults = await Promise.all(statsPromises);
      statsResults.forEach((result, index) => {
        if (result.error) {
          console.error(`Error saving player ${index + 1} stats:`, result.error);
        } else {
          console.log(`✅ Player ${index + 1} stats saved successfully`);
        }
      });

      // Create leg records for each leg played with actual data
      const legPromises = []
      const player1LegAverages = matchResult.player1Stats?.legAverages || [];
      const player2LegAverages = matchResult.player2Stats?.legAverages || [];
      const player1Checkouts = matchResult.player1Stats?.checkouts || [];
      const player2Checkouts = matchResult.player2Stats?.checkouts || [];
      
      // Get starting score from match data or default to 501
      const { data: matchData } = await supabase
        .from('matches')
        .select('starting_score')
        .eq('id', matchResult.matchId)
        .single();
      const startingScore = matchData?.starting_score || 501;
      
      for (let legNum = 1; legNum <= Math.max(matchResult.player1Legs, matchResult.player2Legs); legNum++) {
        const legId = generateId()
        const winnerId = legNum <= matchResult.player1Legs ? 
          (matchResult.winner === matchResult.player1Id ? matchResult.player1Id : matchResult.player2Id) :
          (matchResult.winner === matchResult.player1Id ? matchResult.player2Id : matchResult.player1Id)
        
        // Find checkout for this leg
        const player1Checkout = player1Checkouts.find(c => c.leg === legNum);
        const player2Checkout = player2Checkouts.find(c => c.leg === legNum);
        
        // Calculate darts for this leg from leg average
        let player1Darts = 0;
        let player2Darts = 0;
        let player1Average = 0;
        let player2Average = 0;
        
        if (legNum <= player1LegAverages.length && player1LegAverages[legNum - 1] > 0) {
          player1Average = player1LegAverages[legNum - 1];
          player1Darts = Math.round((startingScore / player1Average) * 3);
        }
        
        if (legNum <= player2LegAverages.length && player2LegAverages[legNum - 1] > 0) {
          player2Average = player2LegAverages[legNum - 1];
          player2Darts = Math.round((startingScore / player2Average) * 3);
        }
        
        legPromises.push(
          supabase
            .from('legs')
            .insert({
              id: legId,
              match_id: matchResult.matchId,
              leg_number: legNum,
              winner_id: winnerId,
              player1_id: matchResult.player1Id,
              player2_id: matchResult.player2Id,
              player1_darts: player1Darts,
              player2_darts: player2Darts,
              player1_average: player1Average,
              player2_average: player2Average,
              player1_checkout: player1Checkout?.checkout || null,
              player2_checkout: player2Checkout?.checkout || null
            })
        )
      }

      await Promise.all(legPromises)

      // Update player statistics
      const { error: statsError } = await supabase
        .from('match_player_stats')
        .insert([
          {
            match_id: matchResult.matchId,
            player_id: matchResult.player1Id,
            legs_won: matchResult.player1Legs,
            legs_lost: matchResult.player2Legs,
            total_score: matchResult.player1Stats?.totalScore || 0,
            total_darts: matchResult.player1Stats?.totalDarts || 0,
            average: matchResult.player1Stats?.average || 0,
            highest_checkout: Math.max(...(matchResult.player1Stats?.checkouts || [0]))
          },
          {
            match_id: matchResult.matchId,
            player_id: matchResult.player2Id,
            legs_won: matchResult.player2Legs,
            legs_lost: matchResult.player1Legs,
            total_score: matchResult.player2Stats?.totalScore || 0,
            total_darts: matchResult.player2Stats?.totalDarts || 0,
            average: matchResult.player2Stats?.average || 0,
            highest_checkout: Math.max(...(matchResult.player2Stats?.checkouts || [0]))
          }
        ])

      if (statsError) throw statsError

      console.log('✅ Match result saved to database')
      console.log('✅ Final match status:', updatedMatch?.status)
      
      // Return the updated match with verified status
      return updatedMatch

    } catch (error) {
      console.error('Error saving match result to Supabase:', error)
      throw error
    }
  }
};


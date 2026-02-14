import { supabase, generateId } from '../lib/supabase.js';

export const leagueService = {
  // Create a new league
  async createLeague(leagueData) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('User must be authenticated to create leagues');

      const leagueId = leagueData.id || generateId();

      const { data: league, error: leagueError } = await supabase
        .from('leagues')
        .insert({
          id: leagueId,
          name: leagueData.name,
          description: leagueData.description || null,
          status: leagueData.status || 'active',
          manager_ids: leagueData.managerIds || [user.id],
          created_by: user.id,
          default_tournament_settings: leagueData.defaultTournamentSettings || null,
          scoring_rules: leagueData.scoringRules || {
            placementPoints: { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 },
            allowManualOverride: true
          }
        })
        .select()
        .single();

      if (leagueError) throw leagueError;

      // Add initial members if provided
      if (leagueData.players && leagueData.players.length > 0) {
        await this.addMembers(leagueId, leagueData.players);
      }

      return this.transformLeague(league);
    } catch (error) {
      console.error('Error creating league:', error);
      throw error;
    }
  },

  // Get all leagues
  async getLeagues() {
    try {
      const { data: leagues, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get member counts and tournament counts for each league
      const leaguesWithStats = await Promise.all(
        leagues.map(async (league) => {
          const [memberCount, tournamentCount] = await Promise.all([
            this.getMemberCount(league.id),
            this.getTournamentCount(league.id)
          ]);

          return {
            ...this.transformLeague(league),
            memberCount,
            tournamentCount
          };
        })
      );

      return leaguesWithStats;
    } catch (error) {
      console.error('Error fetching leagues:', error);
      throw error;
    }
  },

  // Get a single league with full details
  async getLeague(leagueId) {
    try {
      const { data: league, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .eq('deleted', false)
        .single();

      if (error) throw error;
      if (!league) throw new Error('League not found');

      // Get members
      const members = await this.getMembers(leagueId);

      // Get tournaments
      const { data: tournaments, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('id, name, status, created_at, updated_at')
        .eq('league_id', leagueId)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (tournamentsError) {
        console.error('Error fetching league tournaments:', tournamentsError);
      }

      // Get leaderboard
      const leaderboard = await this.getLeaderboard(leagueId);

      return {
        ...this.transformLeague(league),
        members,
        tournaments: tournaments || [],
        leaderboard
      };
    } catch (error) {
      console.error('Error fetching league:', error);
      throw error;
    }
  },

  // Update league
  async updateLeague(leagueId, updates) {
    try {
      const { data, error } = await supabase
        .from('leagues')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', leagueId)
        .select()
        .single();

      if (error) throw error;
      return this.transformLeague(data);
    } catch (error) {
      console.error('Error updating league:', error);
      throw error;
    }
  },

  // Delete league (soft delete)
  async deleteLeague(leagueId) {
    try {
      const { data, error } = await supabase
        .from('leagues')
        .update({
          deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', leagueId)
        .select()
        .single();

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting league:', error);
      throw error;
    }
  },

  // Add members to league
  async addMembers(leagueId, players) {
    try {
      // players can be array of player IDs or array of player objects with id
      const playerIds = players.map(p => typeof p === 'string' ? p : p.id);

      // Check if players exist, create if needed
      const membersToAdd = [];
      for (const player of players) {
        let playerId;
        if (typeof player === 'string') {
          playerId = player;
        } else if (player.id) {
          playerId = player.id;
        } else if (player.name) {
          // Create new player
          const { data: existingPlayer } = await supabase
            .from('players')
            .select('id')
            .eq('name', player.name)
            .maybeSingle();

          if (existingPlayer) {
            playerId = existingPlayer.id;
          } else {
            playerId = generateId();
            const { error: playerError } = await supabase
              .from('players')
              .insert({
                id: playerId,
                name: player.name
              });

            if (playerError) throw playerError;
          }
        } else {
          continue; // Skip invalid player data
        }

        membersToAdd.push({
          league_id: leagueId,
          player_id: playerId,
          role: player.role || 'player',
          is_active: player.isActive !== undefined ? player.isActive : true
        });
      }

      if (membersToAdd.length === 0) return [];

      const { data, error } = await supabase
        .from('league_members')
        .upsert(membersToAdd, {
          onConflict: 'league_id,player_id',
          ignoreDuplicates: false
        })
        .select(`
          *,
          player:players(*)
        `);

      if (error) throw error;
      return data.map(m => ({
        id: m.id,
        leagueId: m.league_id,
        player: m.player,
        role: m.role,
        isActive: m.is_active,
        joinedAt: m.joined_at
      }));
    } catch (error) {
      console.error('Error adding league members:', error);
      throw error;
    }
  },

  // Get league members
  async getMembers(leagueId) {
    try {
      const { data, error } = await supabase
        .from('league_members')
        .select(`
          *,
          player:players(*)
        `)
        .eq('league_id', leagueId)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      return data.map(m => ({
        id: m.id,
        leagueId: m.league_id,
        player: m.player,
        role: m.role,
        isActive: m.is_active,
        joinedAt: m.joined_at
      }));
    } catch (error) {
      console.error('Error fetching league members:', error);
      throw error;
    }
  },

  // Update member status
  async updateMemberStatus(leagueId, playerId, updates) {
    try {
      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (updates.isActive !== undefined) {
        updateData.is_active = updates.isActive;
      }
      if (updates.role !== undefined) {
        updateData.role = updates.role;
      }
      if (updates.leftAt !== undefined) {
        updateData.left_at = updates.leftAt ? new Date().toISOString() : null;
      }

      const { data, error } = await supabase
        .from('league_members')
        .update(updateData)
        .eq('league_id', leagueId)
        .eq('player_id', playerId)
        .select(`
          *,
          player:players(*)
        `)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        leagueId: data.league_id,
        player: data.player,
        role: data.role,
        isActive: data.is_active,
        joinedAt: data.joined_at
      };
    } catch (error) {
      console.error('Error updating member status:', error);
      throw error;
    }
  },

  // Remove member from league
  async removeMember(leagueId, playerId) {
    try {
      const { error } = await supabase
        .from('league_members')
        .update({
          left_at: new Date().toISOString(),
          is_active: false
        })
        .eq('league_id', leagueId)
        .eq('player_id', playerId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing league member:', error);
      throw error;
    }
  },

  // Get member count
  async getMemberCount(leagueId) {
    try {
      const { count, error } = await supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId)
        .is('left_at', null);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting member count:', error);
      return 0;
    }
  },

  // Get tournament count
  async getTournamentCount(leagueId) {
    try {
      const { count, error } = await supabase
        .from('tournaments')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId)
        .eq('deleted', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting tournament count:', error);
      return 0;
    }
  },

  // Get leaderboard
  async getLeaderboard(leagueId) {
    try {
      const { data, error } = await supabase
        .from('league_leaderboard')
        .select(`
          *,
          player:players(*)
        `)
        .eq('league_id', leagueId)
        .order('total_points', { ascending: false })
        .order('avg_placement', { ascending: true });

      if (error) throw error;

      return (data || []).map(l => ({
        player: l.player,
        totalPoints: l.total_points || 0,
        tournamentsPlayed: l.tournaments_played || 0,
        bestPlacement: l.best_placement,
        worstPlacement: l.worst_placement,
        avgPlacement: l.avg_placement ? parseFloat(l.avg_placement) : null,
        lastTournamentAt: l.last_tournament_at
      }));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  },

  // Record tournament results and calculate points
  async recordTournamentResults(leagueId, tournamentId) {
    try {
      // Get tournament data
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .eq('league_id', leagueId)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournament) throw new Error('Tournament not found or not part of this league');

      // Check if already calculated
      if (tournament.league_points_calculated) {
        console.log('Tournament results already calculated');
        return;
      }

      // Get tournament with full data (groups, standings, playoffs)
      // We'll need to use tournamentService.getTournament for this
      // For now, we'll calculate placements from the tournament data structure
      // This should be called after tournament completion

      // Get league scoring rules
      const { data: league } = await supabase
        .from('leagues')
        .select('scoring_rules')
        .eq('id', leagueId)
        .single();

      if (!league) throw new Error('League not found');

      const scoringRules = league.scoring_rules || {
        placementPoints: { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 },
        allowManualOverride: true
      };

      // This function will be called from tournament completion handler
      // For now, return a placeholder
      return { message: 'Results calculation will be implemented in tournament completion flow' };
    } catch (error) {
      console.error('Error recording tournament results:', error);
      throw error;
    }
  },

  // Calculate placements from tournament data and award points
  async calculateTournamentPlacements(leagueId, tournamentId, tournamentData) {
    try {
      // Use the shared extractPlacements helper (includes inPlayoff flag)
      const placements = this.extractPlacements(tournamentData);

      // Get league scoring rules
      const { data: league } = await supabase
        .from('leagues')
        .select('scoring_rules')
        .eq('id', leagueId)
        .single();

      if (!league) throw new Error('League not found');

      const scoringRules = league.scoring_rules || {
        placementPoints: { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 },
        allowManualOverride: true
      };

      const placementPoints = scoringRules.placementPoints || { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 };

      // Award points and create results records
      const resultsToInsert = placements.map(p => {
        const points = this.resolvePoints(placementPoints, p);
        return {
          league_id: leagueId,
          tournament_id: tournamentId,
          player_id: p.playerId,
          placement: p.placement,
          points_awarded: points
        };
      });

      // Upsert results (in case of recalculation)
      if (resultsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('league_tournament_results')
          .upsert(resultsToInsert, {
            onConflict: 'league_id,tournament_id,player_id'
          });

        if (insertError) throw insertError;
      }

      // Mark tournament as calculated
      await supabase
        .from('tournaments')
        .update({ league_points_calculated: true })
        .eq('id', tournamentId);

      return resultsToInsert;
    } catch (error) {
      console.error('Error calculating tournament placements:', error);
      throw error;
    }
  },

  // Recalculate all tournament results for a league (without updating leaderboard cache to avoid loops)
  async recalculateAllResults(leagueId) {
    try {
      // Import tournamentService dynamically to avoid circular dependency
      const { tournamentService } = await import('./tournamentService.js');
      
      // Get all completed tournaments for this league
      const { data: tournaments, error: tournamentsError } = await supabase
        .from('tournaments')
        .select('id, name, league_points_calculated')
        .eq('league_id', leagueId)
        .eq('status', 'completed')
        .eq('deleted', false);

      if (tournamentsError) throw tournamentsError;
      
      console.log(`Found ${tournaments?.length || 0} completed tournaments for league ${leagueId}`);

      // Process each tournament
      for (const tournament of tournaments || []) {
        try {
          // Get full tournament data
          const fullTournament = await tournamentService.getTournament(tournament.id);
          
          if (fullTournament) {
            console.log(`Calculating placements for tournament: ${fullTournament.name || tournament.name}`);
            
            // Calculate placements from tournament data
            const placements = this.extractPlacements(fullTournament);
            
            if (placements.length > 0) {
              // Get league scoring rules
              const { data: league } = await supabase
                .from('leagues')
                .select('scoring_rules')
                .eq('id', leagueId)
                .single();

              const scoringRules = league?.scoring_rules || {
                placementPoints: { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 },
                allowManualOverride: true
              };

              const placementPoints = scoringRules.placementPoints || { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 };

              // Award points and create results records
              const resultsToInsert = placements.map(p => {
                const points = this.resolvePoints(placementPoints, p);
                return {
                  league_id: leagueId,
                  tournament_id: tournament.id,
                  player_id: p.playerId,
                  placement: p.placement,
                  points_awarded: points
                };
              });

              // Upsert results
              if (resultsToInsert.length > 0) {
                const { error: insertError } = await supabase
                  .from('league_tournament_results')
                  .upsert(resultsToInsert, {
                    onConflict: 'league_id,tournament_id,player_id'
                  });

                if (insertError) {
                  console.error('Error inserting results:', insertError);
                } else {
                  console.log(`Inserted ${resultsToInsert.length} results for tournament ${fullTournament.name || tournament.name}`);
                }
              }

              // Mark tournament as calculated
              await supabase
                .from('tournaments')
                .update({ league_points_calculated: true })
                .eq('id', tournament.id);
            } else {
              console.log(`No placements found for tournament: ${fullTournament.name || tournament.name}`);
            }
          }
        } catch (error) {
          console.error(`Error calculating placements for tournament ${tournament.id}:`, error);
          // Continue with other tournaments even if one fails
        }
      }

      return { message: `Processed ${tournaments?.length || 0} tournaments` };
    } catch (error) {
      console.error('Error recalculating all results:', error);
      throw error;
    }
  },

  // Resolve points for a placement entry given the scoring rules.
  // Priority: explicit placement number → playoffDefault (if in playoff) → default → 0
  resolvePoints(placementPoints, placement) {
    const explicitKey = placement.placement.toString();
    if (placementPoints[explicitKey] !== undefined) {
      return placementPoints[explicitKey];
    }
    // Playoff participant without an explicit placement entry
    if (placement.inPlayoff && placementPoints.playoffDefault !== undefined) {
      return placementPoints.playoffDefault;
    }
    // Fallback for everyone else
    if (placementPoints.default !== undefined) {
      return placementPoints.default;
    }
    return 0;
  },

  // Extract placements from tournament data structure.
  // Each entry: { playerId, placement, inPlayoff }
  //
  // IMPORTANT: playoffs.rounds is a JSONB snapshot stored on the tournament row
  // and can be STALE (e.g. 3rd-place match completed but JSONB not refreshed).
  // We use playoffs.rounds only for structural info (which rounds / matches exist)
  // and overlay live results from tournamentData.playoffMatches (fetched from the
  // matches table, always up-to-date).
  extractPlacements(tournamentData) {
    const placements = [];
    
    // Check if tournament has playoffs
    const hasPlayoffs = tournamentData.playoffs && tournamentData.playoffs.rounds && tournamentData.playoffs.rounds.length > 0;

    if (hasPlayoffs) {
      // ── Build a lookup map from playoffMatches (live DB data) ──────
      const liveMatchMap = new Map();
      (tournamentData.playoffMatches || []).forEach(pm => {
        liveMatchMap.set(pm.id, pm);
      });

      // Helper: overlay live data onto a bracket match from the JSONB snapshot
      const freshen = (bracketMatch) => {
        if (!bracketMatch) return bracketMatch;
        const live = liveMatchMap.get(bracketMatch.id);
        if (live) {
          return {
            ...bracketMatch,
            status: live.status,
            result: live.result || bracketMatch.result,
            player1: live.player1 || bracketMatch.player1,
            player2: live.player2 || bracketMatch.player2,
          };
        }
        return bracketMatch;
      };

      // ── Collect the set of ALL playoff participant IDs ──────────────
      const playoffPlayerIds = new Set();
      // From JSONB rounds (structural)
      tournamentData.playoffs.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
          if (match.player1?.id) playoffPlayerIds.add(match.player1.id);
          if (match.player2?.id) playoffPlayerIds.add(match.player2.id);
        });
      });
      // Also from live playoffMatches (in case JSONB is missing players)
      (tournamentData.playoffMatches || []).forEach(pm => {
        if (pm.player1?.id) playoffPlayerIds.add(pm.player1.id);
        if (pm.player2?.id) playoffPlayerIds.add(pm.player2.id);
      });

      // Tournament has playoffs - use playoff results
      const rounds = tournamentData.playoffs.rounds;
      const finalRound = rounds[rounds.length - 1];

      // Get fresh (live) versions of the final and 3rd-place matches
      const rawFinalMatch = finalRound?.matches?.find(m => !m.isThirdPlaceMatch);
      const rawThirdPlaceMatch = finalRound?.matches?.find(m => m.isThirdPlaceMatch);
      const finalMatch = freshen(rawFinalMatch);
      const thirdPlaceMatch = freshen(rawThirdPlaceMatch);

      // Assign placements for top positions
      if (finalMatch && finalMatch.status === 'completed' && finalMatch.result) {
        const winnerId = finalMatch.result.winner;
        placements.push({
          playerId: winnerId,
          placement: 1,
          inPlayoff: true
        });
        const loserId = winnerId === finalMatch.player1?.id 
          ? finalMatch.player2?.id 
          : finalMatch.player1?.id;
        if (loserId) {
          placements.push({
            playerId: loserId,
            placement: 2,
            inPlayoff: true
          });
        }
      }

      // Handle 3rd place - either from 3rd place match or shared by semifinal losers
      if (thirdPlaceMatch && thirdPlaceMatch.status === 'completed' && thirdPlaceMatch.result) {
        const thirdWinner = thirdPlaceMatch.result.winner;
        placements.push({
          playerId: thirdWinner,
          placement: 3,
          inPlayoff: true
        });
        const fourthId = thirdWinner === thirdPlaceMatch.player1?.id 
          ? thirdPlaceMatch.player2?.id 
          : thirdPlaceMatch.player1?.id;
        if (fourthId) {
          placements.push({
            playerId: fourthId,
            placement: 4,
            inPlayoff: true
          });
        }
      } else if (!rawThirdPlaceMatch && rounds.length >= 2) {
        // No 3rd place match at all – assign shared 3rd to semifinal losers
        const semiFinalRound = rounds[rounds.length - 2];
        if (semiFinalRound && semiFinalRound.matches) {
          semiFinalRound.matches.forEach(m => {
            const match = freshen(m);
            if (match.status === 'completed' && match.result && !match.isThirdPlaceMatch) {
              const loserId = match.result.winner === match.player1?.id 
                ? match.player2?.id 
                : match.player1?.id;
              if (loserId) {
                placements.push({
                  playerId: loserId,
                  placement: 3,
                  inPlayoff: true
                });
              }
            }
          });
        }
      }

      // For other playoff players, rank by round eliminated (earlier rounds first = worse)
      const placedPlayerIds = new Set(placements.map(p => p.playerId));
      let currentPlacement = Math.max(...placements.map(p => p.placement), 0) + 1;
      
      // Iterate rounds from earliest to second-to-last (skip final round which is already handled)
      // Also skip the semifinal round (rounds.length - 2) since those losers are
      // either in the 3rd-place match (handled above) or shared-3rd.
      for (let i = 0; i < rounds.length - 1; i++) {
        // Skip the semifinal round if a 3rd place match exists,
        // because SF losers are the 3rd-place-match participants (already handled or will be)
        if (rawThirdPlaceMatch && i === rounds.length - 2) continue;

        const round = rounds[i];
        (round.matches || []).forEach(m => {
          const match = freshen(m);
          if (match.status === 'completed' && match.result && !match.isThirdPlaceMatch) {
            const loserId = match.result.winner === match.player1?.id 
              ? match.player2?.id 
              : match.player1?.id;
            if (loserId && !placedPlayerIds.has(loserId)) {
              placements.push({
                playerId: loserId,
                placement: currentPlacement++,
                inPlayoff: true
              });
              placedPlayerIds.add(loserId);
            }
          }
        });
      }

      // ── Add non-playoff participants from group standings ──────────
      // Collect all tournament players from groups and rank remaining ones
      const allGroupPlayers = [];
      (tournamentData.groups || []).forEach(group => {
        if (group.standings && group.standings.length > 0) {
          group.standings.forEach((standing, index) => {
            if (standing.player?.id && !placedPlayerIds.has(standing.player.id)) {
              allGroupPlayers.push({
                playerId: standing.player.id,
                points: standing.points || 0,
                legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
                average: standing.average || 0,
                inPlayoff: playoffPlayerIds.has(standing.player.id)
              });
            }
          });
        }
      });

      // Sort non-placed players by group performance
      allGroupPlayers.sort((a, b) => {
        // Playoff participants first
        if (a.inPlayoff !== b.inPlayoff) return a.inPlayoff ? -1 : 1;
        if (b.points !== a.points) return b.points - a.points;
        if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
        if (b.average !== a.average) return b.average - a.average;
        return 0;
      });

      allGroupPlayers.forEach(gp => {
        placements.push({
          playerId: gp.playerId,
          placement: currentPlacement++,
          inPlayoff: gp.inPlayoff
        });
        placedPlayerIds.add(gp.playerId);
      });

      // Also try tournament.players for any players we may have missed
      (tournamentData.players || []).forEach(player => {
        if (player?.id && !placedPlayerIds.has(player.id)) {
          placements.push({
            playerId: player.id,
            placement: currentPlacement++,
            inPlayoff: playoffPlayerIds.has(player.id)
          });
          placedPlayerIds.add(player.id);
        }
      });

    } else if (tournamentData.groups && tournamentData.groups.length > 0) {
      // Group-only tournament - use group standings (no playoff distinction)
      const allStandings = [];
      
      tournamentData.groups.forEach(group => {
        if (group.standings && group.standings.length > 0) {
          group.standings.forEach((standing, index) => {
            if (standing.player && standing.player.id) {
              allStandings.push({
                playerId: standing.player.id,
                groupName: group.name,
                position: index + 1,
                points: standing.points || 0,
                legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
                average: standing.average || 0
              });
            }
          });
        }
      });

      allStandings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
        if (b.average !== a.average) return b.average - a.average;
        return 0;
      });

      allStandings.forEach((standing, index) => {
        placements.push({
          playerId: standing.playerId,
          placement: index + 1,
          inPlayoff: false
        });
      });
    }
    
    return placements;
  },

  // Update leaderboard cache from league_tournament_results
  async updateLeaderboardCache(leagueId) {
    try {
      // Get all tournament results for this league
      const { data: results, error: resultsError } = await supabase
        .from('league_tournament_results')
        .select(`
          *,
          tournament:tournaments(created_at)
        `)
        .eq('league_id', leagueId);

      if (resultsError) throw resultsError;
      
      // Sort by tournament date in memory (Supabase doesn't support ordering by related fields)
      if (results) {
        results.sort((a, b) => {
          const dateA = a.tournament?.created_at ? new Date(a.tournament.created_at) : new Date(0);
          const dateB = b.tournament?.created_at ? new Date(b.tournament.created_at) : new Date(0);
          return dateB - dateA; // descending order
        });
      }

      // Aggregate by player
      const playerStats = {};
      results.forEach(result => {
        const playerId = result.player_id;
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            playerId,
            totalPoints: 0,
            tournamentsPlayed: 0,
            placements: [],
            lastTournamentAt: null
          };
        }

        playerStats[playerId].totalPoints += result.points_awarded || 0;
        playerStats[playerId].tournamentsPlayed += 1;
        playerStats[playerId].placements.push(result.placement);
        if (result.tournament && result.tournament.created_at) {
          const tournamentDate = new Date(result.tournament.created_at);
          if (!playerStats[playerId].lastTournamentAt || tournamentDate > new Date(playerStats[playerId].lastTournamentAt)) {
            playerStats[playerId].lastTournamentAt = result.tournament.created_at;
          }
        }
      });

      // Calculate stats for each player
      const leaderboardEntries = Object.values(playerStats).map(stats => {
        const placements = stats.placements.sort((a, b) => a - b);
        const avgPlacement = placements.length > 0
          ? placements.reduce((sum, p) => sum + p, 0) / placements.length
          : null;

        return {
          league_id: leagueId,
          player_id: stats.playerId,
          total_points: stats.totalPoints,
          tournaments_played: stats.tournamentsPlayed,
          best_placement: placements.length > 0 ? placements[0] : null,
          worst_placement: placements.length > 0 ? placements[placements.length - 1] : null,
          avg_placement: avgPlacement,
          last_tournament_at: stats.lastTournamentAt
        };
      });

      // Upsert leaderboard entries
      if (leaderboardEntries.length > 0) {
        const { error: upsertError } = await supabase
          .from('league_leaderboard')
          .upsert(leaderboardEntries, {
            onConflict: 'league_id,player_id'
          });

        if (upsertError) throw upsertError;
      }

      return leaderboardEntries;
    } catch (error) {
      console.error('Error updating leaderboard cache:', error);
      throw error;
    }
  },

  // Full leaderboard update: recalculate all results and update cache
  async updateLeaderboard(leagueId) {
    try {
      console.log(`Starting full leaderboard update for league ${leagueId}`);
      
      // First, recalculate all tournament results
      await this.recalculateAllResults(leagueId);
      
      // Then update the leaderboard cache
      const entries = await this.updateLeaderboardCache(leagueId);
      
      console.log(`Leaderboard updated with ${entries.length} entries`);
      return entries;
    } catch (error) {
      console.error('Error updating leaderboard:', error);
      throw error;
    }
  },

  // Get tournaments NOT linked to any league (for "add existing tournament" UI)
  async getUnlinkedTournaments() {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status, created_at')
        .is('league_id', null)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching unlinked tournaments:', error);
      throw error;
    }
  },

  // Link an existing tournament to a league (set league_id) and recalculate points
  async linkTournamentToLeague(leagueId, tournamentId) {
    try {
      // Set the league_id on the tournament
      const { error: updateError } = await supabase
        .from('tournaments')
        .update({ league_id: leagueId, league_points_calculated: false })
        .eq('id', tournamentId)
        .is('league_id', null); // safety: only link if not already linked

      if (updateError) throw updateError;

      // If the tournament is completed, calculate points right away
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('id, name, status')
        .eq('id', tournamentId)
        .single();

      if (tournament?.status === 'completed') {
        const { tournamentService } = await import('./tournamentService.js');
        const fullTournament = await tournamentService.getTournament(tournamentId);
        if (fullTournament) {
          await this.calculateTournamentPlacements(leagueId, tournamentId, fullTournament);
        }
        // Update leaderboard cache
        await this.updateLeaderboardCache(leagueId);
      }

      return tournament;
    } catch (error) {
      console.error('Error linking tournament to league:', error);
      throw error;
    }
  },

  // Unlink a tournament from a league (remove league_id) and recalculate leaderboard
  async unlinkTournamentFromLeague(leagueId, tournamentId) {
    try {
      // Remove the league_id from the tournament
      const { error: updateError } = await supabase
        .from('tournaments')
        .update({ league_id: null, league_points_calculated: false })
        .eq('id', tournamentId)
        .eq('league_id', leagueId);

      if (updateError) throw updateError;

      // Remove the league_tournament_results for this tournament
      const { error: deleteError } = await supabase
        .from('league_tournament_results')
        .delete()
        .eq('league_id', leagueId)
        .eq('tournament_id', tournamentId);

      if (deleteError) throw deleteError;

      // Recalculate leaderboard cache
      await this.updateLeaderboardCache(leagueId);

      return { success: true };
    } catch (error) {
      console.error('Error unlinking tournament from league:', error);
      throw error;
    }
  },

  // ── Admin: get all leagues (minimal info) for dropdowns ────────────
  async getAllLeaguesAdmin() {
    try {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, name, status')
        .eq('deleted', false)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching leagues for admin:', error);
      throw error;
    }
  },

  // ── Admin: get leaderboard entries with player names for a league ──
  async getLeaderboardAdmin(leagueId) {
    try {
      const { data, error } = await supabase
        .from('league_leaderboard')
        .select(`
          id,
          league_id,
          player_id,
          total_points,
          tournaments_played,
          best_placement,
          worst_placement,
          avg_placement,
          player:players(id, name)
        `)
        .eq('league_id', leagueId)
        .order('total_points', { ascending: false });

      if (error) throw error;
      return (data || []).map(entry => ({
        id: entry.id,
        playerId: entry.player_id,
        playerName: entry.player?.name || 'Unknown',
        totalPoints: entry.total_points || 0,
        tournamentsPlayed: entry.tournaments_played || 0,
        bestPlacement: entry.best_placement,
        worstPlacement: entry.worst_placement,
        avgPlacement: entry.avg_placement
      }));
    } catch (error) {
      console.error('Error fetching leaderboard for admin:', error);
      throw error;
    }
  },

  // ── Admin: manually set total points for a player in a league ─────
  async setPlayerPoints(leagueId, playerId, newTotalPoints) {
    try {
      const { error } = await supabase
        .from('league_leaderboard')
        .update({
          total_points: newTotalPoints,
          updated_at: new Date().toISOString()
        })
        .eq('league_id', leagueId)
        .eq('player_id', playerId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error setting player points:', error);
      throw error;
    }
  },

  // ── Admin: merge two player records (source → target) ──────────
  // Moves all references from sourcePlayerId to targetPlayerId and deletes source.
  async mergePlayers(sourcePlayerId, targetPlayerId) {
    try {
      // Helper: for tables with unique constraints involving player_id,
      // we delete the source row if a target row already exists, otherwise update.
      const upsertOrDelete = async (table, playerCol, uniqueCols) => {
        // Get all source rows
        const { data: sourceRows, error: fetchErr } = await supabase
          .from(table)
          .select('*')
          .eq(playerCol, sourcePlayerId);
        if (fetchErr) throw fetchErr;
        if (!sourceRows?.length) return 0;

        let updated = 0;
        for (const row of sourceRows) {
          // Build the "match" filter for the unique columns (excluding the player column)
          const conflictFilter = {};
          for (const col of uniqueCols) {
            if (col !== playerCol) conflictFilter[col] = row[col];
          }
          conflictFilter[playerCol] = targetPlayerId;

          // Check if target already has a row with the same unique combo
          let query = supabase.from(table).select('id').limit(1);
          for (const [k, v] of Object.entries(conflictFilter)) {
            query = query.eq(k, v);
          }
          const { data: existing } = await query.maybeSingle();

          if (existing) {
            // Conflict: delete source row (target already has data for this combo)
            await supabase.from(table).delete().eq('id', row.id);
          } else {
            // No conflict: update source row's player_id to target
            await supabase.from(table).update({ [playerCol]: targetPlayerId }).eq('id', row.id);
          }
          updated++;
        }
        return updated;
      };

      const log = [];

      // 1. tournament_players (PK: tournament_id + player_id — no id column, use composite)
      {
        const { data: srcTP } = await supabase
          .from('tournament_players')
          .select('tournament_id, player_id')
          .eq('player_id', sourcePlayerId);
        if (srcTP?.length) {
          for (const row of srcTP) {
            const { data: existing } = await supabase
              .from('tournament_players')
              .select('player_id')
              .eq('tournament_id', row.tournament_id)
              .eq('player_id', targetPlayerId)
              .maybeSingle();
            // Always delete source
            await supabase
              .from('tournament_players')
              .delete()
              .eq('tournament_id', row.tournament_id)
              .eq('player_id', sourcePlayerId);
            if (!existing) {
              // Insert for target
              await supabase
                .from('tournament_players')
                .insert({ tournament_id: row.tournament_id, player_id: targetPlayerId });
            }
          }
          log.push(`tournament_players: ${srcTP.length} row(s)`);
        }
      }

      // 2. group_players (PK: group_id + player_id — no id column)
      {
        const { data: srcGP } = await supabase
          .from('group_players')
          .select('group_id, player_id')
          .eq('player_id', sourcePlayerId);
        if (srcGP?.length) {
          for (const row of srcGP) {
            const { data: existing } = await supabase
              .from('group_players')
              .select('player_id')
              .eq('group_id', row.group_id)
              .eq('player_id', targetPlayerId)
              .maybeSingle();
            await supabase
              .from('group_players')
              .delete()
              .eq('group_id', row.group_id)
              .eq('player_id', sourcePlayerId);
            if (!existing) {
              await supabase
                .from('group_players')
                .insert({ group_id: row.group_id, player_id: targetPlayerId });
            }
          }
          log.push(`group_players: ${srcGP.length} row(s)`);
        }
      }

      // 3. matches — player1_id, player2_id, winner_id
      {
        const updates = [
          { col: 'player1_id', label: 'matches.player1_id' },
          { col: 'player2_id', label: 'matches.player2_id' },
          { col: 'winner_id', label: 'matches.winner_id' }
        ];
        for (const { col, label } of updates) {
          const { data, error } = await supabase
            .from('matches')
            .update({ [col]: targetPlayerId })
            .eq(col, sourcePlayerId)
            .select('id');
          if (error) console.error(`Error updating ${label}:`, error);
          if (data?.length) log.push(`${label}: ${data.length} row(s)`);
        }
      }

      // 4. legs — player1_id, player2_id, winner_id
      {
        const updates = [
          { col: 'player1_id', label: 'legs.player1_id' },
          { col: 'player2_id', label: 'legs.player2_id' },
          { col: 'winner_id', label: 'legs.winner_id' }
        ];
        for (const { col, label } of updates) {
          const { data, error } = await supabase
            .from('legs')
            .update({ [col]: targetPlayerId })
            .eq(col, sourcePlayerId)
            .select('id');
          if (error) console.error(`Error updating ${label}:`, error);
          if (data?.length) log.push(`${label}: ${data.length} row(s)`);
        }
      }

      // 5. dart_throws — player_id
      {
        const { data, error } = await supabase
          .from('dart_throws')
          .update({ player_id: targetPlayerId })
          .eq('player_id', sourcePlayerId)
          .select('id');
        if (error) console.error('Error updating dart_throws:', error);
        if (data?.length) log.push(`dart_throws: ${data.length} row(s)`);
      }

      // 6. match_player_stats — player_id (has id column)
      {
        const { data, error } = await supabase
          .from('match_player_stats')
          .update({ player_id: targetPlayerId })
          .eq('player_id', sourcePlayerId)
          .select('id');
        if (error) console.error('Error updating match_player_stats:', error);
        if (data?.length) log.push(`match_player_stats: ${data.length} row(s)`);
      }

      // 7. group_standings — player_id (has id column)
      {
        const { data, error } = await supabase
          .from('group_standings')
          .update({ player_id: targetPlayerId })
          .eq('player_id', sourcePlayerId)
          .select('id');
        if (error) console.error('Error updating group_standings:', error);
        if (data?.length) log.push(`group_standings: ${data.length} row(s)`);
      }

      // 8. tournament_stats — player_id (has id column)
      {
        const { data, error } = await supabase
          .from('tournament_stats')
          .update({ player_id: targetPlayerId })
          .eq('player_id', sourcePlayerId)
          .select('id');
        if (error) console.error('Error updating tournament_stats:', error);
        if (data?.length) log.push(`tournament_stats: ${data.length} row(s)`);
      }

      // 9. league_members (unique: league_id + player_id, has id)
      {
        const count = await upsertOrDelete('league_members', 'player_id', ['league_id', 'player_id']);
        if (count) log.push(`league_members: ${count} row(s)`);
      }

      // 10. league_tournament_results (unique: league_id + tournament_id + player_id, has id)
      {
        const count = await upsertOrDelete('league_tournament_results', 'player_id', ['league_id', 'tournament_id', 'player_id']);
        if (count) log.push(`league_tournament_results: ${count} row(s)`);
      }

      // 11. league_leaderboard (unique: league_id + player_id, has id)
      {
        const count = await upsertOrDelete('league_leaderboard', 'player_id', ['league_id', 'player_id']);
        if (count) log.push(`league_leaderboard: ${count} row(s)`);
      }

      // 12. Finally — delete the source player record
      const { error: deleteErr } = await supabase
        .from('players')
        .delete()
        .eq('id', sourcePlayerId);
      if (deleteErr) {
        console.error('Error deleting source player:', deleteErr);
        log.push(`⚠ Could not delete source player: ${deleteErr.message}`);
      } else {
        log.push('Source player deleted');
      }

      return { success: true, log };
    } catch (error) {
      console.error('Error merging players:', error);
      throw error;
    }
  },

  // ── Admin: search players by name ─────────────────────────────────
  async searchPlayers(searchTerm) {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, name')
        .ilike('name', `%${searchTerm}%`)
        .order('name')
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching players:', error);
      throw error;
    }
  },

  // ── Admin: get all players ────────────────────────────────────────
  async getAllPlayers() {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, name')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching all players:', error);
      throw error;
    }
  },

  // Transform league data from database format to app format
  transformLeague(league) {
    return {
      id: league.id,
      name: league.name,
      description: league.description,
      status: league.status,
      managerIds: league.manager_ids || [],
      createdBy: league.created_by,
      defaultTournamentSettings: league.default_tournament_settings,
      scoringRules: league.scoring_rules || {
        placementPoints: { "1": 5, "2": 4, "3": 3, "4": 2, "playoffDefault": 1, "default": 0 },
        allowManualOverride: true
      },
      createdAt: league.created_at,
      updatedAt: league.updated_at
    };
  }
};



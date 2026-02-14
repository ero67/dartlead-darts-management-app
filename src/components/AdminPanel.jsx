import React, { useState } from 'react';
import { Crown, UserPlus, Mail, Check, X, AlertCircle, Loader, Users, RotateCcw, Settings, Search, Trophy, Save, GitMerge, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';

export function AdminPanel() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [managers, setManagers] = useState([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  
  // View All Users
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Reset Match to Pending
  const [tournamentsForMatch, setTournamentsForMatch] = useState([]);
  const [selectedTournamentForMatch, setSelectedTournamentForMatch] = useState('');
  const [matchesForTournament, setMatchesForTournament] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [matchInfo, setMatchInfo] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  
  // Force Tournament Status
  const [tournamentsForStatus, setTournamentsForStatus] = useState([]);
  const [selectedTournamentForStatus, setSelectedTournamentForStatus] = useState('');
  const [tournamentInfo, setTournamentInfo] = useState(null);
  const [newStatus, setNewStatus] = useState('active');
  const [loadingTournament, setLoadingTournament] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // League Points Management
  const [leaguesForPoints, setLeaguesForPoints] = useState([]);
  const [selectedLeagueForPoints, setSelectedLeagueForPoints] = useState('');
  const [leaderboardEntries, setLeaderboardEntries] = useState([]);
  const [editedPoints, setEditedPoints] = useState({});
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);

  // Player Merge
  const [allPlayers, setAllPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [sourcePlayerIds, setSourcePlayerIds] = useState([]);
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeLog, setMergeLog] = useState([]);

  const setManagerRole = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Call Supabase RPC function to set manager role (secure version checks admin)
      const { data, error } = await supabase.rpc('set_user_role_secure', {
        user_email: email.trim().toLowerCase(),
        user_role: 'manager'
      });

      if (error) {
        console.error('Error setting manager role:', error);
        setMessage({ 
          type: 'error', 
          text: error.message || 'Failed to set manager role. Make sure the user exists.' 
        });
      } else {
        setMessage({ 
          type: 'success', 
          text: `Manager role successfully assigned to ${email}` 
        });
        setEmail('');
        // Refresh managers list
        loadManagers();
      }
    } catch (err) {
      console.error('Error:', err);
      setMessage({ 
        type: 'error', 
        text: 'An unexpected error occurred. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const removeManagerRole = async (userEmail) => {
    if (!confirm(`Are you sure you want to remove manager role from ${userEmail}?`)) {
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { data, error } = await supabase.rpc('set_user_role_secure', {
        user_email: userEmail,
        user_role: null
      });

      if (error) {
        console.error('Error removing manager role:', error);
        setMessage({ 
          type: 'error', 
          text: error.message || 'Failed to remove manager role.' 
        });
      } else {
        setMessage({ 
          type: 'success', 
          text: `Manager role removed from ${userEmail}` 
        });
        loadManagers();
      }
    } catch (err) {
      console.error('Error:', err);
      setMessage({ 
        type: 'error', 
        text: 'An unexpected error occurred. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    setLoadingManagers(true);
    try {
      const { data, error } = await supabase.rpc('get_users_by_role', {
        role_name: 'manager'
      });

      if (error) {
        console.error('Error loading managers:', error);
        setMessage({ 
          type: 'error', 
          text: 'Failed to load managers list.' 
        });
      } else {
        setManagers(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoadingManagers(false);
    }
  };

  // Load all users
  const loadAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.rpc('get_all_users');

      if (error) {
        console.error('Error loading users:', error);
        setMessage({ 
          type: 'error', 
          text: error.message || 'Failed to load users. Make sure the get_all_users() function exists in the database.' 
        });
        setAllUsers([]);
      } else {
        setAllUsers(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load users.' 
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Load tournaments for match reset
  const loadTournamentsForMatch = async () => {
    setLoadingTournaments(true);
    try {
      const tournaments = await tournamentService.getTournaments();
      setTournamentsForMatch(tournaments || []);
    } catch (err) {
      console.error('Error loading tournaments:', err);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load tournaments.' 
      });
    } finally {
      setLoadingTournaments(false);
    }
  };

  // Load matches for selected tournament (non-pending only)
  const loadMatchesForTournament = async (tournamentId) => {
    if (!tournamentId) {
      setMatchesForTournament([]);
      setSelectedMatchId('');
      setMatchInfo(null);
      return;
    }

    setLoadingMatches(true);
    try {
      // Get groups for this tournament
      const { data: groups, error: groupsError } = await supabase
        .from('groups')
        .select('id')
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      const groupIds = groups?.map(g => g.id) || [];

      // Get non-pending matches (both group and playoff matches)
      const queries = [];

      // Group matches
      if (groupIds.length > 0) {
        queries.push(
          supabase
            .from('matches')
            .select(`
              id,
              status,
              player1_id,
              player2_id,
              player1_legs,
              player2_legs,
              tournament_id,
              group_id,
              is_playoff,
              created_at,
              updated_at,
              player1:players!matches_player1_id_fkey(name),
              player2:players!matches_player2_id_fkey(name),
              group:groups(name)
            `)
            .in('group_id', groupIds)
            .neq('status', 'pending')
        );
      }

      // Playoff matches
      queries.push(
        supabase
          .from('matches')
          .select(`
            id,
            status,
            player1_id,
            player2_id,
            player1_legs,
            player2_legs,
            tournament_id,
            group_id,
            is_playoff,
            created_at,
            updated_at,
            player1:players!matches_player1_id_fkey(name),
            player2:players!matches_player2_id_fkey(name)
          `)
          .eq('tournament_id', tournamentId)
          .eq('is_playoff', true)
          .neq('status', 'pending')
      );

      const results = await Promise.all(queries);
      const allMatches = [];
      
      results.forEach(({ data, error }) => {
        if (error) {
          console.error('Error loading matches:', error);
        } else if (data) {
          allMatches.push(...data);
        }
      });

      setMatchesForTournament(allMatches);
      setSelectedMatchId('');
      setMatchInfo(null);
    } catch (err) {
      console.error('Error loading matches:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Failed to load matches.' 
      });
      setMatchesForTournament([]);
    } finally {
      setLoadingMatches(false);
  }
  };

  // Handle tournament selection for match reset
  const handleTournamentSelectForMatch = async (tournamentId) => {
    setSelectedTournamentForMatch(tournamentId);
    await loadMatchesForTournament(tournamentId);
  };

  // Handle match selection
  const handleMatchSelect = async (matchId) => {
    if (!matchId) {
      setMatchInfo(null);
      return;
    }

    setSelectedMatchId(matchId);
    setLoadingMatch(true);
    setMessage({ type: '', text: '' });

    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          status,
          player1_id,
          player2_id,
          player1_legs,
          player2_legs,
          tournament_id,
          group_id,
          is_playoff,
          created_at,
          updated_at,
          player1:players!matches_player1_id_fkey(name),
          player2:players!matches_player2_id_fkey(name),
          group:groups(name),
          tournaments:tournament_id(name)
        `)
        .eq('id', matchId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setMessage({ type: 'error', text: 'Match not found' });
        setMatchInfo(null);
      } else {
        setMatchInfo(data);
      }
    } catch (err) {
      console.error('Error loading match:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Failed to load match.' 
      });
      setMatchInfo(null);
    } finally {
      setLoadingMatch(false);
    }
  };

  // Reset match to pending
  const resetMatchToPending = async () => {
    if (!matchInfo) {
      setMessage({ type: 'error', text: 'Please search for a match first' });
      return;
    }

    if (!confirm(`Are you sure you want to reset match ${matchInfo.id} to pending? This will clear ALL match data including scores, averages, legs, and statistics. The match will be completely clean as if it never happened.`)) {
      return;
    }

    setLoadingMatch(true);
    setMessage({ type: '', text: '' });

    try {
      // 1. Delete match_player_stats records for this match
      const { error: statsDeleteError } = await supabase
        .from('match_player_stats')
        .delete()
        .eq('match_id', matchInfo.id);

      if (statsDeleteError) {
        console.error('Error deleting match_player_stats:', statsDeleteError);
        // Continue even if this fails (records might not exist)
      }

      // 2. Delete legs records for this match (dart_throws cascade-delete from legs)
      const { error: legsDeleteError } = await supabase
        .from('legs')
        .delete()
        .eq('match_id', matchInfo.id);

      if (legsDeleteError) {
        console.error('Error deleting legs:', legsDeleteError);
        // Continue even if this fails (records might not exist)
      }

      // 3. Reset the match record itself to a clean pending state
      const { data, error } = await supabase
        .from('matches')
        .update({
          status: 'pending',
          started_by_user_id: null,
          player1_legs: 0,
          player2_legs: 0,
          current_leg: 1,
          player1_current_score: null,
          player2_current_score: null,
          current_player: 0,
          live_device_id: null,
          live_started_at: null,
          last_activity_at: null,
          winner_id: null,
          result: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchInfo.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setMessage({ 
        type: 'success', 
        text: `Match ${matchInfo.id} has been fully reset to pending. All scores, legs, and statistics have been cleared.` 
      });
      setMatchInfo(null);
      setSelectedMatchId('');
      // Reload matches for the tournament
      await loadMatchesForTournament(selectedTournamentForMatch);
    } catch (err) {
      console.error('Error resetting match:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Failed to reset match.' 
      });
    } finally {
      setLoadingMatch(false);
    }
  };

  // Load tournaments for status change
  const loadTournamentsForStatus = async () => {
    setLoadingTournaments(true);
    try {
      const tournaments = await tournamentService.getTournaments();
      setTournamentsForStatus(tournaments || []);
    } catch (err) {
      console.error('Error loading tournaments:', err);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load tournaments.' 
      });
    } finally {
      setLoadingTournaments(false);
    }
  };

  // Handle tournament selection for status change
  const handleTournamentSelectForStatus = async (tournamentId) => {
    if (!tournamentId) {
      setTournamentInfo(null);
      setSelectedTournamentForStatus('');
      return;
    }

    setSelectedTournamentForStatus(tournamentId);
    setLoadingTournament(true);
    setTournamentInfo(null);
    setMessage({ type: '', text: '' });

    try {
      const tournament = await tournamentService.getTournament(tournamentId);
      if (tournament) {
        setTournamentInfo(tournament);
        setNewStatus(tournament.status || 'active');
      } else {
        setMessage({ type: 'error', text: 'Tournament not found' });
      }
    } catch (err) {
      console.error('Error loading tournament:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Failed to load tournament.' 
      });
    } finally {
      setLoadingTournament(false);
    }
  };

  // Force tournament status
  const forceTournamentStatus = async () => {
    if (!tournamentInfo) {
      setMessage({ type: 'error', text: 'Please search for a tournament first' });
      return;
    }

    if (!confirm(`Are you sure you want to change tournament "${tournamentInfo.name}" status from "${tournamentInfo.status}" to "${newStatus}"?`)) {
      return;
    }

    setLoadingTournament(true);
    setMessage({ type: '', text: '' });

    try {
      await tournamentService.updateTournament(tournamentInfo.id, {
        status: newStatus
      });

      setMessage({ 
        type: 'success', 
        text: `Tournament status changed to ${newStatus}` 
      });
      setTournamentInfo(null);
      setSelectedTournamentForStatus('');
      // Reload tournaments list
      await loadTournamentsForStatus();
    } catch (err) {
      console.error('Error updating tournament status:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Failed to update tournament status.' 
      });
    } finally {
      setLoadingTournament(false);
    }
  };

  // ── League Points Management ──────────────────────────────────────
  const loadLeaguesForPoints = async () => {
    setLoadingLeagues(true);
    try {
      const leagues = await leagueService.getAllLeaguesAdmin();
      setLeaguesForPoints(leagues || []);
    } catch (err) {
      console.error('Error loading leagues:', err);
      setMessage({ type: 'error', text: 'Failed to load leagues.' });
    } finally {
      setLoadingLeagues(false);
    }
  };

  const handleLeagueSelectForPoints = async (leagueId) => {
    setSelectedLeagueForPoints(leagueId);
    setLeaderboardEntries([]);
    setEditedPoints({});
    if (!leagueId) return;

    setLoadingLeaderboard(true);
    try {
      const entries = await leagueService.getLeaderboardAdmin(leagueId);
      setLeaderboardEntries(entries);
      // Pre-fill edited points with current values
      const initial = {};
      entries.forEach(e => { initial[e.playerId] = e.totalPoints; });
      setEditedPoints(initial);
    } catch (err) {
      console.error('Error loading leaderboard:', err);
      setMessage({ type: 'error', text: 'Failed to load leaderboard.' });
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const handlePointChange = (playerId, value) => {
    setEditedPoints(prev => ({ ...prev, [playerId]: parseInt(value) || 0 }));
  };

  const saveAllPoints = async () => {
    if (!selectedLeagueForPoints) return;
    setSavingPoints(true);
    setMessage({ type: '', text: '' });
    try {
      let changedCount = 0;
      for (const entry of leaderboardEntries) {
        const newPoints = editedPoints[entry.playerId];
        if (newPoints !== undefined && newPoints !== entry.totalPoints) {
          await leagueService.setPlayerPoints(selectedLeagueForPoints, entry.playerId, newPoints);
          changedCount++;
        }
      }
      setMessage({ type: 'success', text: `Updated points for ${changedCount} player(s).` });
      // Reload to reflect changes
      await handleLeagueSelectForPoints(selectedLeagueForPoints);
    } catch (err) {
      console.error('Error saving points:', err);
      setMessage({ type: 'error', text: 'Failed to save points.' });
    } finally {
      setSavingPoints(false);
    }
  };

  const saveSinglePlayerPoints = async (playerId, playerName) => {
    if (!selectedLeagueForPoints) return;
    const newPoints = editedPoints[playerId];
    const entry = leaderboardEntries.find(e => e.playerId === playerId);
    if (newPoints === undefined || newPoints === entry?.totalPoints) return;

    setSavingPoints(true);
    setMessage({ type: '', text: '' });
    try {
      await leagueService.setPlayerPoints(selectedLeagueForPoints, playerId, newPoints);
      setMessage({ type: 'success', text: `Updated ${playerName} to ${newPoints} pts.` });
      // Reload
      await handleLeagueSelectForPoints(selectedLeagueForPoints);
    } catch (err) {
      console.error('Error saving points:', err);
      setMessage({ type: 'error', text: `Failed to update ${playerName}.` });
    } finally {
      setSavingPoints(false);
    }
  };

  // ── Player Merge ─────────────────────────────────────────────────
  const loadAllPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const players = await leagueService.getAllPlayers();
      setAllPlayers(players || []);
    } catch (err) {
      console.error('Error loading players:', err);
      setMessage({ type: 'error', text: 'Failed to load players.' });
    } finally {
      setLoadingPlayers(false);
    }
  };

  const addSourcePlayer = (playerId) => {
    if (!playerId || sourcePlayerIds.includes(playerId) || playerId === targetPlayerId) return;
    setSourcePlayerIds(prev => [...prev, playerId]);
  };

  const removeSourcePlayer = (playerId) => {
    setSourcePlayerIds(prev => prev.filter(id => id !== playerId));
  };

  const handleMergePlayers = async () => {
    if (sourcePlayerIds.length === 0 || !targetPlayerId) {
      setMessage({ type: 'error', text: 'Select at least one source and a target player.' });
      return;
    }
    if (sourcePlayerIds.includes(targetPlayerId)) {
      setMessage({ type: 'error', text: 'Source and target must be different players.' });
      return;
    }
    const sourceNames = sourcePlayerIds.map(id => allPlayers.find(p => p.id === id)?.name || id);
    const targetName = allPlayers.find(p => p.id === targetPlayerId)?.name || targetPlayerId;

    if (!confirm(
      `⚠️ MERGE ${sourcePlayerIds.length} PLAYER(S)\n\n` +
      `All data from:\n${sourceNames.map(n => `  • "${n}"`).join('\n')}\n\n` +
      `will be moved to "${targetName}".\n` +
      `The source player(s) will be DELETED permanently.\n\nThis cannot be undone. Continue?`
    )) return;

    setMerging(true);
    setMergeLog([]);
    setMessage({ type: '', text: '' });
    try {
      const allLogs = [];
      for (const srcId of sourcePlayerIds) {
        const srcName = allPlayers.find(p => p.id === srcId)?.name || srcId;
        allLogs.push(`── Merging "${srcName}" → "${targetName}" ──`);
        const result = await leagueService.mergePlayers(srcId, targetPlayerId);
        allLogs.push(...(result.log || []));
        allLogs.push('');
      }
      setMergeLog(allLogs);
      setMessage({ type: 'success', text: `Merged ${sourcePlayerIds.length} player(s) → "${targetName}" successfully.` });
      setSourcePlayerIds([]);
      setTargetPlayerId('');
      // Reload players list
      await loadAllPlayers();
    } catch (err) {
      console.error('Error merging players:', err);
      setMessage({ type: 'error', text: `Merge failed: ${err.message}` });
    } finally {
      setMerging(false);
    }
  };

  // Load managers, tournaments, leagues, and players on mount
  React.useEffect(() => {
    loadManagers();
    loadTournamentsForMatch();
    loadTournamentsForStatus();
    loadLeaguesForPoints();
    loadAllPlayers();
  }, []);

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-header">
        <div className="admin-panel-title">
          <Crown size={24} />
          <h1>Admin Panel</h1>
        </div>
        <p className="admin-panel-subtitle">Manage users, tournaments, and matches</p>
      </div>

      <div className="admin-panel-content">
        {/* Set Manager Role Section */}
        <div className="admin-section">
          <div className="admin-section-header">
            <UserPlus size={20} />
            <h2>Assign Manager Role</h2>
          </div>
          <p className="admin-section-description">
            Managers can create tournaments. Enter a user's email address to grant manager permissions.
          </p>

          <div className="admin-form">
            <div className="form-group">
              <label htmlFor="email">
                <Mail size={16} />
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                onKeyPress={(e) => e.key === 'Enter' && !loading && setManagerRole()}
                disabled={loading}
              />
            </div>

        <button 
              className="admin-button primary"
              onClick={setManagerRole}
              disabled={loading || !email.trim()}
        >
              {loading ? (
                <>
                  <Loader size={16} className="spinning" />
                  Assigning...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Assign Manager Role
                </>
              )}
        </button>
      </div>

          {message.text && (
            <div className={`admin-message ${message.type}`}>
              {message.type === 'success' ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>{message.text}</span>
            </div>
          )}
        </div>

        {/* Managers List Section */}
          <div className="admin-section">
          <div className="admin-section-header">
            <Crown size={20} />
            <h2>Current Managers</h2>
          </div>

          {loadingManagers ? (
            <div className="admin-loading">
              <Loader size={20} className="spinning" />
              <span>Loading managers...</span>
            </div>
          ) : managers.length === 0 ? (
            <div className="admin-empty">
              <p>No managers assigned yet.</p>
            </div>
          ) : (
            <div className="managers-list">
              {managers.map((manager) => (
                <div key={manager.id} className="manager-item">
                  <div className="manager-info">
                    <div className="manager-email">{manager.email}</div>
                    {manager.full_name && (
                      <div className="manager-name">{manager.full_name}</div>
                    )}
                  </div>
              <button 
                    className="admin-button danger small"
                    onClick={() => removeManagerRole(manager.email)}
                    disabled={loading}
                    title="Remove manager role"
              >
                    <X size={14} />
                    Remove
              </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View All Users Section */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Users size={20} />
            <h2>View All Users</h2>
          </div>
          <p className="admin-section-description">
            View all registered users and their roles.
          </p>
              
              <button 
            className="admin-button primary"
            onClick={loadAllUsers}
            disabled={loadingUsers}
          >
            {loadingUsers ? (
              <>
                <Loader size={16} className="spinning" />
                Loading...
              </>
            ) : (
              <>
                <Users size={16} />
                Load All Users
              </>
            )}
              </button>
              
          {loadingUsers && allUsers.length === 0 ? (
            <div className="admin-loading">
              <Loader size={20} className="spinning" />
              <span>Loading users...</span>
            </div>
          ) : allUsers.length > 0 ? (
            <div className="users-list" style={{ marginTop: '1.5rem' }}>
              <div className="users-table-header">
                <div>Email</div>
                <div>Name</div>
                <div>Role</div>
                <div>Created</div>
              </div>
              {allUsers.map((user) => (
                <div key={user.id} className="user-item">
                  <div className="user-email">{user.email}</div>
                  <div className="user-name">{user.full_name || '-'}</div>
                  <div className="user-role-badge">
                    <span className={`role-badge ${user.role}`}>{user.role}</span>
                  </div>
                  <div className="user-created">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Reset Match to Pending Section */}
        <div className="admin-section">
          <div className="admin-section-header">
            <RotateCcw size={20} />
            <h2>Reset Match to Pending</h2>
          </div>
          <p className="admin-section-description">
            Select a tournament and then choose a non-pending match to reset it to pending status. This will clear all match data.
          </p>

          <div className="admin-form">
            <div className="form-group">
              <label htmlFor="tournamentForMatch">
                <Search size={16} />
                Select Tournament
              </label>
              <select
                id="tournamentForMatch"
                value={selectedTournamentForMatch}
                onChange={(e) => handleTournamentSelectForMatch(e.target.value)}
                disabled={loadingTournaments}
              >
                <option value="">-- Select a tournament --</option>
                {tournamentsForMatch.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name} ({tournament.status})
                  </option>
                ))}
              </select>
            </div>

            {selectedTournamentForMatch && (
              <>
                <div className="form-group">
                  <label htmlFor="matchSelect">
                    <Search size={16} />
                    Select Match
                  </label>
                  {loadingMatches ? (
                    <div className="admin-loading">
                      <Loader size={16} className="spinning" />
                      <span>Loading matches...</span>
                    </div>
                  ) : (
                    <select
                      id="matchSelect"
                      value={selectedMatchId}
                      onChange={(e) => handleMatchSelect(e.target.value)}
                      disabled={loadingMatch || matchesForTournament.length === 0}
                    >
                      <option value="">-- Select a match --</option>
                      {matchesForTournament.map((match) => {
                        const player1Name = match.player1?.name || 'Unknown';
                        const player2Name = match.player2?.name || 'Unknown';
                        const matchType = match.is_playoff ? 'Playoff' : (match.group?.name || 'Group');
                        const score = match.player1_legs !== null ? `${match.player1_legs} - ${match.player2_legs}` : '';
                        return (
                          <option key={match.id} value={match.id}>
                            {matchType}: {player1Name} vs {player2Name} {score && `(${score})`} - {match.status}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {matchesForTournament.length === 0 && !loadingMatches && (
                  <div className="admin-empty" style={{ marginTop: '1rem' }}>
                    <p>No non-pending matches found for this tournament.</p>
                  </div>
                )}

                {matchInfo && (
                  <div className="match-info" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Tournament:</strong> {matchInfo.tournaments?.name || matchInfo.group?.tournament?.name || 'N/A'}
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Match Type:</strong> {matchInfo.is_playoff ? 'Playoff' : (matchInfo.group?.name || 'Group')}
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Players:</strong> {matchInfo.player1?.name || 'Unknown'} vs {matchInfo.player2?.name || 'Unknown'}
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Status:</strong> <span className={`status-badge ${matchInfo.status}`}>{matchInfo.status}</span>
                    </div>
                    {matchInfo.player1_legs !== null && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Score:</strong> {matchInfo.player1_legs} - {matchInfo.player2_legs}
                      </div>
                    )}
              <button 
                      className="admin-button danger"
                      onClick={resetMatchToPending}
                      disabled={loadingMatch || matchInfo.status === 'pending'}
                      style={{ marginTop: '1rem', width: '100%' }}
              >
                      {loadingMatch ? (
                        <>
                          <Loader size={16} className="spinning" />
                          Resetting...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={16} />
                          Reset to Pending
                        </>
                      )}
              </button>
            </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Force Tournament Status Section */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Settings size={20} />
            <h2>Force Tournament Status</h2>
          </div>
          <p className="admin-section-description">
            Select a tournament from the list and manually change its status.
          </p>

          <div className="admin-form">
            <div className="form-group">
              <label htmlFor="tournamentForStatus">
                <Search size={16} />
                Select Tournament
              </label>
              <select
                id="tournamentForStatus"
                value={selectedTournamentForStatus}
                onChange={(e) => handleTournamentSelectForStatus(e.target.value)}
                disabled={loadingTournaments || loadingTournament}
              >
                <option value="">-- Select a tournament --</option>
                {tournamentsForStatus.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name} ({tournament.status})
                  </option>
                ))}
              </select>
            </div>

            {loadingTournament && (
              <div className="admin-loading">
                <Loader size={16} className="spinning" />
                <span>Loading tournament...</span>
        </div>
      )}

            {tournamentInfo && (
              <div style={{ marginTop: '1.5rem' }}>
                <div className="form-group">
                  <label htmlFor="newStatus">
                    Current Status: <span className={`status-badge ${tournamentInfo.status}`}>{tournamentInfo.status}</span>
                  </label>
                  <label htmlFor="newStatus" style={{ marginTop: '1rem', display: 'block' }}>
                    New Status:
                  </label>
                  <select
                    id="newStatus"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="open_for_registration">Open for Registration</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Tournament:</strong> {tournamentInfo.name}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Players:</strong> {tournamentInfo.players?.length || 0}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Groups:</strong> {tournamentInfo.groups?.length || 0}
                  </div>
                </div>

                <button
                  className="admin-button primary"
                  onClick={forceTournamentStatus}
                  disabled={loadingTournament || newStatus === tournamentInfo.status}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  {loadingTournament ? (
                    <>
                      <Loader size={16} className="spinning" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Settings size={16} />
                      Update Status
                    </>
                  )}
              </button>
            </div>
            )}
          </div>
        </div>

        {/* ── League Points Management ─────────────────────────────── */}
        <div className="admin-section">
          <div className="admin-section-header">
            <Trophy size={20} />
            <h2>League Points Management</h2>
          </div>
          <p className="admin-section-description">
            Manually adjust player points in a league leaderboard. Changes are saved directly to the leaderboard cache.
          </p>

          <div className="admin-form">
            <div className="form-group">
              <label>Select League</label>
              <select
                value={selectedLeagueForPoints}
                onChange={(e) => handleLeagueSelectForPoints(e.target.value)}
                disabled={loadingLeagues}
              >
                <option value="">-- Choose a league --</option>
                {leaguesForPoints.map(league => (
                  <option key={league.id} value={league.id}>
                    {league.name} ({league.status})
                  </option>
                ))}
              </select>
            </div>

            {loadingLeaderboard && (
              <div className="admin-loading">
                <Loader size={16} className="spinning" />
                <span>Loading leaderboard...</span>
              </div>
            )}

            {selectedLeagueForPoints && !loadingLeaderboard && leaderboardEntries.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', padding: '1rem 0' }}>
                No leaderboard entries found. Recalculate the leaderboard from the league settings first.
              </p>
            )}

            {leaderboardEntries.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ 
                  overflowX: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)' }}>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.85rem' }}>#</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.85rem' }}>Player</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.85rem' }}>Current Pts</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.85rem' }}>New Pts</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.85rem' }}>Save</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardEntries.map((entry, index) => {
                        const isChanged = editedPoints[entry.playerId] !== undefined && editedPoints[entry.playerId] !== entry.totalPoints;
                        return (
                          <tr 
                            key={entry.playerId}
                            style={{ 
                              borderTop: '1px solid var(--border-color)',
                              background: isChanged ? 'var(--accent-primary-light, rgba(59, 130, 246, 0.08))' : 'transparent'
                            }}
                          >
                            <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {index + 1}
                            </td>
                            <td style={{ padding: '0.6rem 1rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                              {entry.playerName}
                            </td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              {entry.totalPoints}
                            </td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                value={editedPoints[entry.playerId] ?? entry.totalPoints}
                                onChange={(e) => handlePointChange(entry.playerId, e.target.value)}
                                style={{
                                  width: '70px',
                                  padding: '0.35rem 0.5rem',
                                  border: `1px solid ${isChanged ? 'var(--accent-primary, #3b82f6)' : 'var(--border-color)'}`,
                                  borderRadius: '6px',
                                  background: 'var(--input-bg)',
                                  color: 'var(--text-primary)',
                                  textAlign: 'center',
                                  fontSize: '0.9rem',
                                  fontWeight: isChanged ? '700' : '400'
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                              <button
                                onClick={() => saveSinglePlayerPoints(entry.playerId, entry.playerName)}
                                disabled={!isChanged || savingPoints}
                                style={{
                                  padding: '0.3rem 0.5rem',
                                  border: 'none',
                                  borderRadius: '6px',
                                  background: isChanged ? 'var(--accent-primary, #3b82f6)' : 'var(--bg-tertiary)',
                                  color: isChanged ? '#fff' : 'var(--text-muted)',
                                  cursor: isChanged ? 'pointer' : 'default',
                                  opacity: isChanged ? 1 : 0.4,
                                  transition: 'all 0.2s'
                                }}
                                title={isChanged ? `Save ${entry.playerName}` : 'No changes'}
                              >
                                <Check size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Save All button */}
                <button
                  className="admin-button primary"
                  onClick={saveAllPoints}
                  disabled={savingPoints || !Object.entries(editedPoints).some(([pid, pts]) => {
                    const entry = leaderboardEntries.find(e => e.playerId === pid);
                    return entry && pts !== entry.totalPoints;
                  })}
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  {savingPoints ? (
                    <>
                      <Loader size={16} className="spinning" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save All Changes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Player Merge ─────────────────────────────────────────── */}
        <div className="admin-section">
          <div className="admin-section-header">
            <GitMerge size={20} />
            <h2>Merge Players</h2>
          </div>
          <p className="admin-section-description">
            Merge duplicate player records. All tournament data, matches, statistics and league results from the <strong>source</strong> player will be transferred to the <strong>target</strong> player. The source player will be deleted. <span style={{ color: 'var(--accent-danger, #ef4444)', fontWeight: 600 }}>This cannot be undone!</span>
          </p>

          <div className="admin-form">
            {loadingPlayers ? (
              <div className="admin-loading">
                <Loader size={16} className="spinning" />
                <span>Loading players...</span>
              </div>
            ) : (
              <>
                {/* Search filter */}
                <div className="form-group">
                  <label>
                    <Search size={16} />
                    Filter Players
                  </label>
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Type to filter player names..."
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Source players (will be deleted) */}
                  <div className="form-group" style={{ flex: '1 1 250px' }}>
                    <label style={{ color: 'var(--accent-danger, #ef4444)' }}>
                      Source(s) — will be deleted
                    </label>
                    <select
                      value=""
                      onChange={(e) => { addSourcePlayer(e.target.value); e.target.value = ''; }}
                    >
                      <option value="">-- Add source player --</option>
                      {allPlayers
                        .filter(p => {
                          if (!playerSearch) return true;
                          return p.name.toLowerCase().includes(playerSearch.toLowerCase());
                        })
                        .filter(p => p.id !== targetPlayerId && !sourcePlayerIds.includes(p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                      }
                    </select>
                    {/* Selected source chips */}
                    {sourcePlayerIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                        {sourcePlayerIds.map(id => {
                          const player = allPlayers.find(p => p.id === id);
                          return (
                            <span
                              key={id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.25rem 0.6rem',
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: 'var(--accent-danger, #ef4444)',
                                borderRadius: '20px',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                textDecoration: 'line-through'
                              }}
                            >
                              {player?.name || id}
                              <button
                                onClick={() => removeSourcePlayer(id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent-danger, #ef4444)',
                                  cursor: 'pointer',
                                  padding: '0',
                                  marginLeft: '2px',
                                  lineHeight: 1
                                }}
                                title="Remove"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', padding: '2rem 0.5rem 0' }}>
                    <ArrowRight size={24} style={{ color: 'var(--text-secondary)' }} />
                  </div>

                  {/* Target player (will be kept) */}
                  <div className="form-group" style={{ flex: '1 1 250px' }}>
                    <label style={{ color: 'var(--accent-success, #22c55e)' }}>
                      Target — will be kept
                    </label>
                    <select
                      value={targetPlayerId}
                      onChange={(e) => setTargetPlayerId(e.target.value)}
                    >
                      <option value="">-- Select target player --</option>
                      {allPlayers
                        .filter(p => {
                          if (!playerSearch) return true;
                          return p.name.toLowerCase().includes(playerSearch.toLowerCase());
                        })
                        .filter(p => !sourcePlayerIds.includes(p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                {/* Preview */}
                {sourcePlayerIds.length > 0 && targetPlayerId && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
                        {sourcePlayerIds.map(id => (
                          <span key={id} style={{
                            padding: '0.3rem 0.7rem',
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: 'var(--accent-danger, #ef4444)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            textDecoration: 'line-through'
                          }}>
                            {allPlayers.find(p => p.id === id)?.name}
                          </span>
                        ))}
                      </div>
                      <ArrowRight size={18} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{
                        padding: '0.4rem 0.8rem',
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: 'var(--accent-success, #22c55e)',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                      }}>
                        {allPlayers.find(p => p.id === targetPlayerId)?.name}
                      </span>
                    </div>
                    <p style={{ textAlign: 'center', marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      All matches, stats, tournament entries, and league data from {sourcePlayerIds.length} player(s) will be transferred.
                    </p>
                  </div>
                )}

                {/* Merge button */}
                <button
                  className="admin-button primary"
                  onClick={handleMergePlayers}
                  disabled={sourcePlayerIds.length === 0 || !targetPlayerId || merging}
                  style={{
                    marginTop: '1rem',
                    width: '100%',
                    background: sourcePlayerIds.length > 0 && targetPlayerId ? 'var(--accent-danger, #ef4444)' : undefined
                  }}
                >
                  {merging ? (
                    <>
                      <Loader size={16} className="spinning" />
                      Merging {sourcePlayerIds.length} player(s)...
                    </>
                  ) : (
                    <>
                      <GitMerge size={16} />
                      Merge {sourcePlayerIds.length > 0 ? `${sourcePlayerIds.length} Player(s)` : 'Players'}
                    </>
                  )}
                </button>

                {/* Merge Log */}
                {mergeLog.length > 0 && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace'
                  }}>
                    <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Merge Log:</strong>
                    {mergeLog.map((line, i) => (
                      <div key={i} style={{ color: 'var(--text-secondary)', padding: '0.15rem 0' }}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

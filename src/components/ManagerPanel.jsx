import React, { useState, useEffect } from 'react';
import { Badge, RotateCcw, Search, Loader, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService } from '../services/tournamentService';

export function ManagerPanel() {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tournamentsForMatch, setTournamentsForMatch] = useState([]);
  const [selectedTournamentForMatch, setSelectedTournamentForMatch] = useState('');
  const [matchesForTournament, setMatchesForTournament] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [matchInfo, setMatchInfo] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

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

  const loadMatchesForTournament = async (tournamentId) => {
    if (!tournamentId) {
      setMatchesForTournament([]);
      setSelectedMatchId('');
      setMatchInfo(null);
      return;
    }

    setLoadingMatches(true);
    try {
      const { data: groups, error: groupsError } = await supabase
        .from('groups')
        .select('id')
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      const groupIds = groups?.map(g => g.id) || [];
      const queries = [];

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

  const handleTournamentSelectForMatch = async (tournamentId) => {
    setSelectedTournamentForMatch(tournamentId);
    await loadMatchesForTournament(tournamentId);
  };

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
      const { error: statsDeleteError } = await supabase
        .from('match_player_stats')
        .delete()
        .eq('match_id', matchInfo.id);

      if (statsDeleteError) {
        console.error('Error deleting match_player_stats:', statsDeleteError);
      }

      const { error: legsDeleteError } = await supabase
        .from('legs')
        .delete()
        .eq('match_id', matchInfo.id);

      if (legsDeleteError) {
        console.error('Error deleting legs:', legsDeleteError);
      }

      const { error } = await supabase
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

  useEffect(() => {
    loadTournamentsForMatch();
  }, []);

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-header">
        <div className="admin-panel-title">
          <Badge size={24} />
          <h1>Manager Panel</h1>
        </div>
        <p className="admin-panel-subtitle">Reset completed matches and correct mistakes</p>
      </div>

      <div className="admin-panel-content">
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
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Badge, RotateCcw, Search, Loader, Check, AlertCircle, Edit3, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';

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
  
  const [editMode, setEditMode] = useState(false);
  const [manualResult, setManualResult] = useState({
    winner: null,
    player1Legs: 0,
    player2Legs: 0
  });
  const [savingResult, setSavingResult] = useState(false);

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

      const uniqueMatches = Array.from(new Map(allMatches.map((match) => [match.id, match])).values());
      setMatchesForTournament(uniqueMatches);
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

  const handleEditResult = () => {
    if (!matchInfo) return;
    setManualResult({
      winner: matchInfo.player1_id,
      player1Legs: matchInfo.player1_legs || 0,
      player2Legs: matchInfo.player2_legs || 0
    });
    setEditMode(true);
    setMessage({ type: '', text: '' });
  };

  const saveManualResult = async () => {
    if (!matchInfo || !manualResult.winner) {
      setMessage({ type: 'error', text: 'Please select a winner' });
      return;
    }

    if (manualResult.player1Legs < 0 || manualResult.player2Legs < 0) {
      setMessage({ type: 'error', text: 'Legs cannot be negative' });
      return;
    }

    const winnerLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player1Legs : manualResult.player2Legs;
    const loserLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player2Legs : manualResult.player1Legs;
    
    if (winnerLegs <= loserLegs) {
      setMessage({ type: 'error', text: 'Winner must have more legs than loser' });
      return;
    }

    setSavingResult(true);
    setMessage({ type: '', text: '' });

    try {
      await matchService.updateMatchResult(matchInfo.id, {
        winner: manualResult.winner,
        player1Legs: manualResult.player1Legs,
        player2Legs: manualResult.player2Legs
      });

      setMessage({
        type: 'success',
        text: `Match result updated: ${matchInfo.player1?.name || 'Player 1'} ${manualResult.player1Legs} - ${manualResult.player2Legs} ${matchInfo.player2?.name || 'Player 2'}`
      });
      
      setEditMode(false);
      await loadMatchesForTournament(selectedTournamentForMatch);
      await handleMatchSelect(matchInfo.id);
    } catch (err) {
      console.error('Error saving manual result:', err);
      setMessage({
        type: 'error',
        text: err.message || 'Failed to save match result.'
      });
    } finally {
      setSavingResult(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setManualResult({ winner: null, player1Legs: 0, player2Legs: 0 });
    setMessage({ type: '', text: '' });
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
                    <h2>Manage Match State</h2>
                  </div>
                  <p className="admin-section-description">
                    Select a tournament and match to either reset it to pending or manually set the final result when recovery is needed.
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
                    <p>No matches found for this tournament.</p>
                  </div>
                )}

                    {matchInfo && (
                  <div className="match-info manager-match-card">
                    <div className="manager-match-card__header">
                      <div>
                        <div className="manager-match-card__title">
                          {matchInfo.player1?.name || 'Unknown'} vs {matchInfo.player2?.name || 'Unknown'}
                        </div>
                        <div className="manager-match-card__meta">
                          {matchInfo.tournaments?.name || matchInfo.group?.tournament?.name || 'N/A'} - {matchInfo.is_playoff ? 'Playoff' : (matchInfo.group?.name || 'Group')}
                        </div>
                      </div>
                      <span className={`status-badge ${matchInfo.status}`}>{matchInfo.status}</span>
                    </div>

                    <div className="manager-match-card__stats">
                      <div className="manager-stat-pill">
                        <span className="manager-stat-pill__label">Match ID</span>
                        <span className="manager-stat-pill__value">{matchInfo.id}</span>
                      </div>
                      <div className="manager-stat-pill">
                        <span className="manager-stat-pill__label">Current score</span>
                        <span className="manager-stat-pill__value">
                          {matchInfo.player1_legs !== null ? `${matchInfo.player1_legs} - ${matchInfo.player2_legs}` : 'Not set'}
                        </span>
                      </div>
                    </div>

                    <div className="manager-tools-grid">
                      <div className="manager-tool-card">
                        <div className="manager-tool-card__header">
                          <Edit3 size={16} />
                          <h4>Manual Match Result</h4>
                        </div>
                        <p className="manager-tool-card__description">
                          Use this when a match cannot be completed normally and the final score needs to be entered manually.
                        </p>

                        {!editMode && (
                          <button
                            className="admin-button primary"
                            onClick={handleEditResult}
                            style={{ width: '100%' }}
                          >
                            <Edit3 size={16} />
                            Open Result Editor
                          </button>
                        )}

                        {editMode && (
                          <div className="manager-manual-result-form">
                            <div className="form-group">
                              <label htmlFor="manualWinner">Winner</label>
                              <select
                                id="manualWinner"
                                value={manualResult.winner || ''}
                                onChange={(e) => setManualResult({ ...manualResult, winner: e.target.value })}
                              >
                                <option value="">-- Select winner --</option>
                                <option value={matchInfo.player1_id}>{matchInfo.player1?.name || 'Player 1'}</option>
                                <option value={matchInfo.player2_id}>{matchInfo.player2?.name || 'Player 2'}</option>
                              </select>
                            </div>

                            <div className="manager-score-grid">
                              <div className="form-group">
                                <label htmlFor="manualPlayer1Legs">{matchInfo.player1?.name || 'Player 1'} legs</label>
                                <input
                                  id="manualPlayer1Legs"
                                  type="number"
                                  min="0"
                                  value={manualResult.player1Legs}
                                  onChange={(e) => setManualResult({ ...manualResult, player1Legs: parseInt(e.target.value, 10) || 0 })}
                                />
                              </div>
                              <div className="form-group">
                                <label htmlFor="manualPlayer2Legs">{matchInfo.player2?.name || 'Player 2'} legs</label>
                                <input
                                  id="manualPlayer2Legs"
                                  type="number"
                                  min="0"
                                  value={manualResult.player2Legs}
                                  onChange={(e) => setManualResult({ ...manualResult, player2Legs: parseInt(e.target.value, 10) || 0 })}
                                />
                              </div>
                            </div>

                            <div className="manager-tool-card__actions">
                              <button
                                className="admin-button primary"
                                onClick={saveManualResult}
                                disabled={savingResult}
                              >
                                {savingResult ? (
                                  <>
                                    <Loader size={16} className="spinning" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Save size={16} />
                                    Save Result
                                  </>
                                )}
                              </button>
                              <button
                                className="admin-button"
                                onClick={cancelEdit}
                                disabled={savingResult}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="manager-tool-card manager-tool-card--danger">
                        <div className="manager-tool-card__header">
                          <RotateCcw size={16} />
                          <h4>Reset Match to Pending</h4>
                        </div>
                        <p className="manager-tool-card__description">
                          Clear the stored state and return the match to a clean pending state so it can be replayed from scratch.
                        </p>
                        <button
                          className="admin-button danger"
                          onClick={resetMatchToPending}
                          disabled={loadingMatch || matchInfo.status === 'pending'}
                          style={{ width: '100%' }}
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
                    </div>
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

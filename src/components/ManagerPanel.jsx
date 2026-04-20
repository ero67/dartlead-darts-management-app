import React, { useState, useEffect } from 'react';
import { Badge, RotateCcw, Search, Loader, Check, AlertCircle, Edit3, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { TournamentImport } from './TournamentImport';

const formatMatchStateLabel = (status) => status.replace(/_/g, ' ');

export function ManagerPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [message, setMessage] = useState({ type: '', text: '' });
  const [tournamentsForMatch, setTournamentsForMatch] = useState([]);
  const [selectedTournamentForMatch, setSelectedTournamentForMatch] = useState('');
  const [matchesForTournament, setMatchesForTournament] = useState([]);
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  const [matchStateFilter, setMatchStateFilter] = useState('all');
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

  const MATCH_STATE_OPTIONS = [
    { value: 'all', label: t('manager.allStates') },
    { value: 'pending', label: t('manager.pending') },
    { value: 'in_progress', label: t('manager.inProgress') },
    { value: 'completed', label: t('manager.completed') },
    { value: 'cancelled', label: t('manager.cancelled') }
  ];

  const loadTournamentsForMatch = async () => {
    setLoadingTournaments(true);
    try {
      const allTournaments = await tournamentService.getTournaments();
      const tournaments = isAdmin
        ? allTournaments
        : (allTournaments || []).filter(t => user && t.userId === user.id);
      setTournamentsForMatch(tournaments || []);
    } catch (err) {
      console.error('Error loading tournaments:', err);
      setMessage({
        type: 'error',
        text: t('manager.failedToLoadTournaments')
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
        text: err.message || t('manager.failedToLoadMatches')
      });
      setMatchesForTournament([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const handleTournamentSelectForMatch = async (tournamentId) => {
    setSelectedTournamentForMatch(tournamentId);
    setMatchSearchTerm('');
    setMatchStateFilter('all');
    await loadMatchesForTournament(tournamentId);
  };

  const filteredMatchesForTournament = matchesForTournament.filter((match) => {
    const player1Name = match.player1?.name || t('common.unknown');
    const player2Name = match.player2?.name || t('common.unknown');
    const matchType = match.is_playoff ? t('manager.playoff') : (match.group?.name || t('manager.group'));
    const statusLabel = formatMatchStateLabel(match.status);
    const score = match.player1_legs !== null ? `${match.player1_legs} - ${match.player2_legs}` : '';
    const searchHaystack = [
      player1Name,
      player2Name,
      matchType,
      statusLabel,
      score,
      String(match.id)
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = searchHaystack.includes(matchSearchTerm.trim().toLowerCase());
    const matchesState = matchStateFilter === 'all' || match.status === matchStateFilter;

    return matchesSearch && matchesState;
  });

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
        setMessage({ type: 'error', text: t('manager.matchNotFound') });
        setMatchInfo(null);
      } else {
        setMatchInfo(data);
      }
    } catch (err) {
      console.error('Error loading match:', err);
      setMessage({
        type: 'error',
        text: err.message || t('manager.failedToLoadMatch')
      });
      setMatchInfo(null);
    } finally {
      setLoadingMatch(false);
    }
  };

  const resetMatchToPending = async () => {
    if (!matchInfo) {
      setMessage({ type: 'error', text: t('manager.searchFirstError') });
      return;
    }

    if (!confirm(t('manager.confirmReset', { matchId: matchInfo.id }))) {
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
        text: t('manager.resetSuccess', { matchId: matchInfo.id })
      });
      setMatchInfo(null);
      setSelectedMatchId('');
      await loadMatchesForTournament(selectedTournamentForMatch);
    } catch (err) {
      console.error('Error resetting match:', err);
      setMessage({
        type: 'error',
        text: err.message || t('manager.failedToResetMatch')
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
      setMessage({ type: 'error', text: t('manager.selectWinnerError') });
      return;
    }

    if (manualResult.player1Legs < 0 || manualResult.player2Legs < 0) {
      setMessage({ type: 'error', text: t('manager.legsNegativeError') });
      return;
    }

    const winnerLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player1Legs : manualResult.player2Legs;
    const loserLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player2Legs : manualResult.player1Legs;

    if (winnerLegs <= loserLegs) {
      setMessage({ type: 'error', text: t('manager.winnerMoreLegsError') });
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
        text: t('manager.resultUpdated', {
          player1: matchInfo.player1?.name || 'Player 1',
          score1: manualResult.player1Legs,
          score2: manualResult.player2Legs,
          player2: matchInfo.player2?.name || 'Player 2'
        })
      });

      setEditMode(false);
      await loadMatchesForTournament(selectedTournamentForMatch);
      await handleMatchSelect(matchInfo.id);
    } catch (err) {
      console.error('Error saving manual result:', err);
      setMessage({
        type: 'error',
        text: err.message || t('manager.failedToSaveResult')
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
          <h1>{t('manager.title')}</h1>
        </div>
        <p className="admin-panel-subtitle">{t('manager.subtitle')}</p>
      </div>

      <div className="admin-panel-content">
        <div className="admin-section">
          <div className="admin-section-header">
                    <RotateCcw size={20} />
                    <h2>{t('manager.manageMatchState')}</h2>
                  </div>
                  <p className="admin-section-description">
                    {t('manager.manageMatchStateDescription')}
                  </p>

          <div className="admin-form">
            <div className="form-group">
              <label htmlFor="tournamentForMatch">
                <Search size={16} />
                {t('manager.selectTournament')}
              </label>
              <select
                id="tournamentForMatch"
                value={selectedTournamentForMatch}
                onChange={(e) => handleTournamentSelectForMatch(e.target.value)}
                disabled={loadingTournaments}
              >
                <option value="">{t('manager.selectTournamentPlaceholder')}</option>
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
                    {t('manager.selectMatch')}
                  </label>
                  <div className="manager-match-filters">
                    <input
                      id="matchSearch"
                      type="text"
                      value={matchSearchTerm}
                      onChange={(e) => setMatchSearchTerm(e.target.value)}
                      placeholder={t('manager.searchPlaceholder')}
                      disabled={loadingMatches || matchesForTournament.length === 0}
                    />
                    <select
                      id="matchStateFilter"
                      value={matchStateFilter}
                      onChange={(e) => setMatchStateFilter(e.target.value)}
                      disabled={loadingMatches || matchesForTournament.length === 0}
                    >
                      {MATCH_STATE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {loadingMatches ? (
                    <div className="admin-loading">
                      <Loader size={16} className="spinning" />
                      <span>{t('manager.loadingMatches')}</span>
                    </div>
                  ) : (
                    <select
                      id="matchSelect"
                      value={selectedMatchId}
                      onChange={(e) => handleMatchSelect(e.target.value)}
                      disabled={loadingMatch || filteredMatchesForTournament.length === 0}
                    >
                      <option value="">{t('manager.selectMatchPlaceholder')}</option>
                      {filteredMatchesForTournament.map((match) => {
                        const player1Name = match.player1?.name || t('common.unknown');
                        const player2Name = match.player2?.name || t('common.unknown');
                        const matchType = match.is_playoff ? t('manager.playoff') : (match.group?.name || t('manager.group'));
                        const score = match.player1_legs !== null ? `${match.player1_legs} - ${match.player2_legs}` : '';
                        return (
                          <option key={match.id} value={match.id}>
                            {matchType}: {player1Name} vs {player2Name} {score && `(${score})`} - {formatMatchStateLabel(match.status)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {matchesForTournament.length === 0 && !loadingMatches && (
                  <div className="admin-empty" style={{ marginTop: '1rem' }}>
                    <p>{t('manager.noMatchesForTournament')}</p>
                  </div>
                )}

                {matchesForTournament.length > 0 && filteredMatchesForTournament.length === 0 && !loadingMatches && (
                  <div className="admin-empty" style={{ marginTop: '1rem' }}>
                    <p>{t('manager.noMatchesMatchingFilter')}</p>
                  </div>
                )}

                    {matchInfo && (
                  <div className="match-info manager-match-card">
                    <div className="manager-match-card__header">
                      <div>
                        <div className="manager-match-card__title">
                          {matchInfo.player1?.name || t('common.unknown')} vs {matchInfo.player2?.name || t('common.unknown')}
                        </div>
                        <div className="manager-match-card__meta">
                          {matchInfo.tournaments?.name || matchInfo.group?.tournament?.name || 'N/A'} - {matchInfo.is_playoff ? t('manager.playoff') : (matchInfo.group?.name || t('manager.group'))}
                        </div>
                      </div>
                      <span className={`status-badge ${matchInfo.status}`}>{matchInfo.status}</span>
                    </div>

                    <div className="manager-match-card__stats">
                      <div className="manager-stat-pill">
                        <span className="manager-stat-pill__label">{t('manager.matchId')}</span>
                        <span className="manager-stat-pill__value">{matchInfo.id}</span>
                      </div>
                      <div className="manager-stat-pill">
                        <span className="manager-stat-pill__label">{t('manager.currentScore')}</span>
                        <span className="manager-stat-pill__value">
                          {matchInfo.player1_legs !== null ? `${matchInfo.player1_legs} - ${matchInfo.player2_legs}` : t('manager.notSet')}
                        </span>
                      </div>
                    </div>

                    <div className="manager-tools-grid">
                      <div className="manager-tool-card">
                        <div className="manager-tool-card__header">
                          <Edit3 size={16} />
                          <h4>{t('manager.manualMatchResult')}</h4>
                        </div>
                        <p className="manager-tool-card__description">
                          {t('manager.manualMatchResultDescription')}
                        </p>

                        {!editMode && (
                          <button
                            className="admin-button primary"
                            onClick={handleEditResult}
                            style={{ width: '100%' }}
                          >
                            <Edit3 size={16} />
                            {t('manager.openResultEditor')}
                          </button>
                        )}

                        {editMode && (
                          <div className="manager-manual-result-form">
                            <div className="form-group">
                              <label htmlFor="manualWinner">{t('manager.winner')}</label>
                              <select
                                id="manualWinner"
                                value={manualResult.winner || ''}
                                onChange={(e) => setManualResult({ ...manualResult, winner: e.target.value })}
                              >
                                <option value="">{t('manager.selectWinner')}</option>
                                <option value={matchInfo.player1_id}>{matchInfo.player1?.name || 'Player 1'}</option>
                                <option value={matchInfo.player2_id}>{matchInfo.player2?.name || 'Player 2'}</option>
                              </select>
                            </div>

                            <div className="manager-score-grid">
                              <div className="form-group">
                                <label htmlFor="manualPlayer1Legs">{matchInfo.player1?.name || 'Player 1'} {t('manager.legs')}</label>
                                <input
                                  id="manualPlayer1Legs"
                                  type="number"
                                  min="0"
                                  value={manualResult.player1Legs}
                                  onChange={(e) => setManualResult({ ...manualResult, player1Legs: parseInt(e.target.value, 10) || 0 })}
                                />
                              </div>
                              <div className="form-group">
                                <label htmlFor="manualPlayer2Legs">{matchInfo.player2?.name || 'Player 2'} {t('manager.legs')}</label>
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
                                    {t('manager.saving')}
                                  </>
                                ) : (
                                  <>
                                    <Save size={16} />
                                    {t('manager.saveResult')}
                                  </>
                                )}
                              </button>
                              <button
                                className="admin-button"
                                onClick={cancelEdit}
                                disabled={savingResult}
                              >
                                {t('manager.cancel')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="manager-tool-card manager-tool-card--danger">
                        <div className="manager-tool-card__header">
                          <RotateCcw size={16} />
                          <h4>{t('manager.resetMatchToPending')}</h4>
                        </div>
                        <p className="manager-tool-card__description">
                          {t('manager.resetMatchDescription')}
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
                              {t('manager.resetting')}
                            </>
                          ) : (
                            <>
                              <RotateCcw size={16} />
                              {t('manager.resetToPending')}
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

        <TournamentImport />
      </div>
    </div>
  );
}

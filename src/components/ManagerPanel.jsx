import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge, RotateCcw, Search, Loader, Check, AlertCircle, Edit3, Save, Activity, UserCheck, ClipboardList, CreditCard, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { tournamentService, matchService } from '../services/tournamentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';
import { ScorersPanel } from './ScorersPanel';
import { tournamentStatusLabel } from '../utils/tournamentStatus';

const formatMatchStateLabel = (status) => status.replace(/_/g, ' ');

export function ManagerPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();
  const [activeTab, setActiveTab] = useState('overview'); // overview | requests | scorers | matches
  const [message, setMessage] = useState({ type: '', text: '' });
  const [selectedTournamentForMatch, setSelectedTournamentForMatch] = useState('');
  const [matchesForTournament, setMatchesForTournament] = useState([]);
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  const [matchStateFilter, setMatchStateFilter] = useState('all');
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [matchInfo, setMatchInfo] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);

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

  // --- Tournaments / leagues this user manages (admins see everything) ---
  const myTournaments = useMemo(() => (
    isAdmin ? tournaments : tournaments.filter(tr => user && tr.userId === user.id)
  ), [tournaments, isAdmin, user]);

  const myLeagues = useMemo(() => (
    isAdmin
      ? leagues
      : leagues.filter(l => user && (l.createdBy === user.id || (l.managerIds || []).includes(user.id)))
  ), [leagues, isAdmin, user]);

  // --- Overview stats (counts come from the lightweight tournament summary) ---
  const liveMatchesNow = myTournaments.reduce((sum, tr) => sum + (tr.inProgressMatches ?? 0), 0);
  const pendingMatchesCount = myTournaments
    .filter(tr => tr.status !== 'completed')
    .reduce((sum, tr) => sum + (tr.pendingMatches ?? 0), 0);
  const openTournaments = myTournaments.filter(tr => tr.status === 'open_for_registration');
  const attentionTournaments = myTournaments.filter(tr => (
    tr.status === 'open_for_registration' ||
    (tr.inProgressMatches ?? 0) > 0 ||
    (tr.status !== 'completed' && (tr.pendingMatches ?? 0) > 0)
  ));

  // --- My subscription (managers can read their own row via RLS) ---
  const [subscription, setSubscription] = useState({ loaded: false, paidUntil: null });

  useEffect(() => {
    if (!user || isAdmin) {
      setSubscription({ loaded: true, paidUntil: null });
      return;
    }
    let cancelled = false;
    supabase
      .from('manager_subscriptions')
      .select('paid_until')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Error loading subscription:', error);
        setSubscription({ loaded: true, paidUntil: data?.paid_until || null });
      });
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  const subscriptionState = useMemo(() => {
    if (!subscription.paidUntil) return null;
    const daysLeft = Math.ceil((new Date(subscription.paidUntil) - new Date()) / 86400000);
    return {
      date: new Date(subscription.paidUntil).toLocaleDateString(),
      daysLeft,
      level: daysLeft < 0 ? 'expired' : daysLeft <= 14 ? 'warn' : 'ok'
    };
  }, [subscription.paidUntil]);

  // --- Pending registration requests across all my open tournaments ---
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [processingRegId, setProcessingRegId] = useState(null);

  const openTournamentIds = useMemo(
    () => openTournaments.map(tr => tr.id),
    // openTournaments is derived from myTournaments each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myTournaments]
  );

  const loadRequests = useCallback(async () => {
    if (openTournamentIds.length === 0) {
      setRequests([]);
      return;
    }
    setLoadingRequests(true);
    setRequestsError('');
    try {
      const { data, error } = await supabase
        .from('tournament_registrations')
        .select('id, player_name, created_at, tournament_id, tournament:tournaments(name)')
        .in('tournament_id', openTournamentIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error loading registration requests:', err);
      setRequestsError(t('manager.requestsLoadFailed'));
    } finally {
      setLoadingRequests(false);
    }
    // t is recreated on language change; requests text is server data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTournamentIds]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApproveRequest = async (regId) => {
    setProcessingRegId(regId);
    setRequestsError('');
    try {
      await tournamentService.approveRegistration(regId);
      setRequests(prev => prev.filter(r => r.id !== regId));
    } catch (err) {
      console.error('Error approving registration:', err);
      setRequestsError(t('manager.requestActionFailed'));
    } finally {
      setProcessingRegId(null);
    }
  };

  const handleRejectRequest = async (regId) => {
    setProcessingRegId(regId);
    setRequestsError('');
    try {
      await tournamentService.rejectRegistration(regId);
      setRequests(prev => prev.filter(r => r.id !== regId));
    } catch (err) {
      console.error('Error rejecting registration:', err);
      setRequestsError(t('manager.requestActionFailed'));
    } finally {
      setProcessingRegId(null);
    }
  };

  // --- Scorers hub ---
  const [scorerTarget, setScorerTarget] = useState(''); // "t:<id>" or "l:<id>"

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

  // Live inline validation for the manual-result form (mirrors saveManualResult's checks).
  const getManualResultError = () => {
    if (!matchInfo) return '';
    if (!manualResult.winner) return t('manager.selectWinnerError');
    if (manualResult.player1Legs < 0 || manualResult.player2Legs < 0) return t('manager.legsNegativeError');
    const winnerLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player1Legs : manualResult.player2Legs;
    const loserLegs = manualResult.winner === matchInfo.player1_id ? manualResult.player2Legs : manualResult.player1Legs;
    if (winnerLegs <= loserLegs) return t('manager.winnerMoreLegsError');
    return '';
  };

  // Preset scorelines derived from the match's legs-to-win (e.g. first-to-3 -> 3-0, 3-1, 3-2).
  const getScorePresets = () => {
    const legsToWin = matchInfo?.legs_to_win || 3;
    return Array.from({ length: legsToWin }, (_, loserLegs) => ({ winnerLegs: legsToWin, loserLegs }));
  };

  const applyPreset = (winnerId, winnerLegs, loserLegs) => {
    const isPlayer1 = winnerId === matchInfo.player1_id;
    setManualResult({
      winner: winnerId,
      player1Legs: isPlayer1 ? winnerLegs : loserLegs,
      player2Legs: isPlayer1 ? loserLegs : winnerLegs
    });
  };

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-header">
        <div className="admin-panel-title">
          <Badge size={24} />
          <h1>{t('manager.title')}</h1>
        </div>
        <p className="admin-panel-subtitle">{t('manager.subtitle')}</p>
      </div>

      <div className="management-tabs manager-panel-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={18} />
          {t('manager.tabOverview')}
        </button>
        <button
          className={activeTab === 'requests' ? 'active' : ''}
          onClick={() => setActiveTab('requests')}
        >
          <UserCheck size={18} />
          {t('manager.tabRequests')}
          {requests.length > 0 && <span className="requests-count">{requests.length}</span>}
        </button>
        <button
          className={activeTab === 'scorers' ? 'active' : ''}
          onClick={() => setActiveTab('scorers')}
        >
          <ClipboardList size={18} />
          {t('manager.tabScorers')}
        </button>
        <button
          className={activeTab === 'matches' ? 'active' : ''}
          onClick={() => setActiveTab('matches')}
        >
          <RotateCcw size={18} />
          {t('manager.tabMatches')}
        </button>
      </div>

      <div className="admin-panel-content">
        {activeTab === 'overview' && (
          <div className="admin-section">
            <div className="stats-grid manager-stats-grid">
              <div className="stat-card">
                <div className="stat-icon active">
                  <Activity size={24} />
                </div>
                <div className="stat-content">
                  <h3>{liveMatchesNow}</h3>
                  <p>{t('manager.overviewLiveNow')}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <RotateCcw size={24} />
                </div>
                <div className="stat-content">
                  <h3>{pendingMatchesCount}</h3>
                  <p>{t('manager.overviewPendingMatches')}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <UserCheck size={24} />
                </div>
                <div className="stat-content">
                  <h3>{requests.length}</h3>
                  <p>{t('manager.overviewPendingRequests')}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <Badge size={24} />
                </div>
                <div className="stat-content">
                  <h3>{openTournaments.length}</h3>
                  <p>{t('manager.overviewOpenTournaments')}</p>
                </div>
              </div>
            </div>

            <div className="group-card manager-subscription-card">
              <h3>
                <CreditCard size={16} />
                {t('manager.subscriptionTitle')}
              </h3>
              {!subscription.loaded ? (
                <p className="manager-subscription-note">{t('common.loading')}</p>
              ) : isAdmin ? (
                <p className="manager-subscription-note">{t('manager.subscriptionAdmin')}</p>
              ) : !subscriptionState ? (
                <p className="manager-subscription-note">{t('manager.subscriptionNone')}</p>
              ) : (
                <div className={`subscription-status subscription-status--${subscriptionState.level}`}>
                  {subscriptionState.level === 'expired'
                    ? t('manager.subscriptionExpired', { date: subscriptionState.date })
                    : t('manager.subscriptionActiveUntil', { date: subscriptionState.date })}
                  {subscriptionState.level === 'warn' && ` — ${t('manager.subscriptionExpiresSoon')}`}
                </div>
              )}
            </div>

            <div className="admin-section-header" style={{ marginTop: '0.5rem' }}>
              <Activity size={20} />
              <h2>{t('manager.overviewActiveTitle')}</h2>
            </div>
            {attentionTournaments.length === 0 ? (
              <p className="admin-section-description">{t('manager.overviewNothingActive')}</p>
            ) : (
              <div className="manager-overview-list">
                {attentionTournaments.map((tr) => (
                  <div key={tr.id} className="registration-request-card">
                    <div className="request-info">
                      <span className="request-name">{tr.name}</span>
                      <span className="request-date">
                        {tournamentStatusLabel(tr.status, t)}
                        {(tr.inProgressMatches ?? 0) > 0 && ` · ${tr.inProgressMatches} ${t('manager.overviewLiveNow').toLowerCase()}`}
                        {tr.status !== 'open_for_registration' && (tr.pendingMatches ?? 0) > 0 && ` · ${tr.pendingMatches} ${t('manager.overviewPendingMatches').toLowerCase()}`}
                      </span>
                    </div>
                    <button
                      className="settings-btn"
                      onClick={() => navigate(`/tournament/${tr.id}`)}
                    >
                      <ExternalLink size={14} />
                      {t('manager.openTournament')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <UserCheck size={20} />
              <h2>{t('manager.requestsTitle')}</h2>
            </div>
            <p className="admin-section-description">{t('manager.requestsDescription')}</p>

            {requestsError && (
              <div className="admin-message error">
                <AlertCircle size={16} />
                <span>{requestsError}</span>
              </div>
            )}

            {loadingRequests ? (
              <div className="admin-loading">
                <Loader size={16} className="spinning" />
                <span>{t('common.loading')}</span>
              </div>
            ) : requests.length === 0 ? (
              <p className="admin-section-description">{t('manager.requestsEmpty')}</p>
            ) : (
              <div className="manager-overview-list">
                {requests.map((reg) => (
                  <div key={reg.id} className="registration-request-card status-pending">
                    <div className="request-info">
                      <span className="request-name">{reg.player_name}</span>
                      <span className="request-date">
                        {reg.tournament?.name} · {new Date(reg.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="request-actions">
                      <button
                        className="approve-btn"
                        onClick={() => handleApproveRequest(reg.id)}
                        disabled={processingRegId === reg.id}
                      >
                        <CheckCircle size={14} /> {t('registration.approve')}
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleRejectRequest(reg.id)}
                        disabled={processingRegId === reg.id}
                      >
                        <XCircle size={14} /> {t('registration.reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'scorers' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <ClipboardList size={20} />
              <h2>{t('manager.scorersHubTitle')}</h2>
            </div>
            <p className="admin-section-description">{t('manager.scorersHubDescription')}</p>

            <div className="form-group" style={{ maxWidth: '420px', marginBottom: '1rem' }}>
              <label htmlFor="scorerTarget">{t('manager.scorersSelectEntity')}</label>
              <select
                id="scorerTarget"
                value={scorerTarget}
                onChange={(e) => setScorerTarget(e.target.value)}
              >
                <option value="">{t('manager.selectTournamentPlaceholder')}</option>
                {myTournaments.length > 0 && (
                  <optgroup label={t('navigation.tournaments')}>
                    {myTournaments.map((tr) => (
                      <option key={tr.id} value={`t:${tr.id}`}>{tr.name}</option>
                    ))}
                  </optgroup>
                )}
                {myLeagues.length > 0 && (
                  <optgroup label={t('navigation.leagues')}>
                    {myLeagues.map((l) => (
                      <option key={l.id} value={`l:${l.id}`}>{l.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {scorerTarget && (
              <ScorersPanel
                key={scorerTarget}
                type={scorerTarget.startsWith('l:') ? 'league' : 'tournament'}
                entityId={scorerTarget.slice(2)}
              />
            )}
          </div>
        )}

        {activeTab === 'matches' && (
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
              >
                <option value="">{t('manager.selectTournamentPlaceholder')}</option>
                {myTournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name} ({tournamentStatusLabel(tournament.status, t)})
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

                            {manualResult.winner && (
                              <div className="form-group">
                                <label>{t('manager.quickScore')}</label>
                                <div className="manager-preset-row">
                                  {getScorePresets().map(({ winnerLegs, loserLegs }) => {
                                    const winnerIsP1 = manualResult.winner === matchInfo.player1_id;
                                    const p1 = winnerIsP1 ? winnerLegs : loserLegs;
                                    const p2 = winnerIsP1 ? loserLegs : winnerLegs;
                                    const active = manualResult.player1Legs === p1 && manualResult.player2Legs === p2;
                                    return (
                                      <button
                                        key={`${winnerLegs}-${loserLegs}`}
                                        type="button"
                                        className={`manager-preset-btn ${active ? 'active' : ''}`}
                                        onClick={() => applyPreset(manualResult.winner, winnerLegs, loserLegs)}
                                      >
                                        {winnerLegs} - {loserLegs}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

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

                            {getManualResultError() ? (
                              <div className="manager-inline-error">
                                <AlertCircle size={14} />
                                <span>{getManualResultError()}</span>
                              </div>
                            ) : (
                              <div className="manager-inline-hint">
                                <AlertCircle size={14} />
                                <span>{t('manager.statsNotRecalculatedHint')}</span>
                              </div>
                            )}

                            <div className="manager-tool-card__actions">
                              <button
                                className="admin-button primary"
                                onClick={saveManualResult}
                                disabled={savingResult || !!getManualResultError()}
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
        )}
      </div>
    </div>
  );
}

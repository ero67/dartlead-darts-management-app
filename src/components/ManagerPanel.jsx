import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge as BadgeIcon, RotateCcw, Search, Loader, Check, AlertCircle, Edit3, Save, Activity, UserCheck, ClipboardList, CreditCard, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from './shared/EmptyState';
import { StatTile } from './shared/StatTile';

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
  const myLeagues = useMemo(() => (
    isAdmin
      ? leagues
      : leagues.filter(l => user && (l.createdBy === user.id || (l.managerIds || []).includes(user.id)))
  ), [leagues, isAdmin, user]);

  // Own tournaments plus every tournament of a league this user (co-)manages
  const myTournaments = useMemo(() => {
    if (isAdmin) return tournaments;
    const leagueIds = new Set(myLeagues.map(l => l.id));
    return tournaments.filter(tr => user && (tr.userId === user.id || (tr.leagueId && leagueIds.has(tr.leagueId))));
  }, [tournaments, isAdmin, user, myLeagues]);

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

  const NONE = '__none';
  const manualResultError = getManualResultError();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('manager.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('manager.subtitle')}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">
            <Activity />
            {t('manager.tabOverview')}
          </TabsTrigger>
          <TabsTrigger value="requests">
            <UserCheck />
            {t('manager.tabRequests')}
            {requests.length > 0 && <Badge variant="secondary" className="tabular-nums">{requests.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="scorers">
            <ClipboardList />
            {t('manager.tabScorers')}
          </TabsTrigger>
          <TabsTrigger value="matches">
            <RotateCcw />
            {t('manager.tabMatches')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={t('manager.overviewLiveNow')} value={liveMatchesNow} icon={Activity} />
            <StatTile label={t('manager.overviewPendingMatches')} value={pendingMatchesCount} icon={RotateCcw} />
            <StatTile label={t('manager.overviewPendingRequests')} value={requests.length} icon={UserCheck} />
            <StatTile label={t('manager.overviewOpenTournaments')} value={openTournaments.length} icon={BadgeIcon} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4" />
                  {t('manager.overviewActiveTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attentionTournaments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('manager.overviewNothingActive')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {attentionTournaments.map((tr) => (
                      <li key={tr.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{tr.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {tournamentStatusLabel(tr.status, t)}
                            {(tr.inProgressMatches ?? 0) > 0 && ` · ${tr.inProgressMatches} ${t('manager.overviewLiveNow').toLowerCase()}`}
                            {tr.status !== 'open_for_registration' && (tr.pendingMatches ?? 0) > 0 && ` · ${tr.pendingMatches} ${t('manager.overviewPendingMatches').toLowerCase()}`}
                          </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/tournament/${tr.id}`)}>
                          <ExternalLink />
                          {t('manager.openTournament')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="size-4" />
                  {t('manager.subscriptionTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {!subscription.loaded ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : isAdmin ? (
                  <p className="text-muted-foreground">{t('manager.subscriptionAdmin')}</p>
                ) : !subscriptionState ? (
                  <p className="text-muted-foreground">{t('manager.subscriptionNone')}</p>
                ) : (
                  <>
                    <Badge
                      variant="outline"
                      className={
                        subscriptionState.level === 'expired'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                          : subscriptionState.level === 'warn'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                      }
                    >
                      {subscriptionState.level === 'expired'
                        ? t('manager.subscriptionExpired', { date: subscriptionState.date })
                        : t('manager.subscriptionActiveUntil', { date: subscriptionState.date })}
                    </Badge>
                    {subscriptionState.level === 'warn' && (
                      <p className="text-muted-foreground">{t('manager.subscriptionExpiresSoon')}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="size-4" />
                {t('manager.requestsTitle')}
              </CardTitle>
              <CardDescription>{t('manager.requestsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {requestsError && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{requestsError}</AlertDescription>
                </Alert>
              )}

              {loadingRequests ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-4 animate-spin" />
                  <span>{t('common.loading')}</span>
                </div>
              ) : requests.length === 0 ? (
                <EmptyState icon={UserCheck} title={t('manager.requestsEmpty')} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {requests.map((reg) => (
                    <li key={reg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{reg.player_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {reg.tournament?.name} · {new Date(reg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApproveRequest(reg.id)}
                          disabled={processingRegId === reg.id}
                        >
                          <CheckCircle /> {t('registration.approve')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRejectRequest(reg.id)}
                          disabled={processingRegId === reg.id}
                        >
                          <XCircle /> {t('registration.reject')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scorers" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                {t('manager.scorersHubTitle')}
              </CardTitle>
              <CardDescription>{t('manager.scorersHubDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex max-w-md flex-col gap-2">
                <Label htmlFor="scorerTarget">{t('manager.scorersSelectEntity')}</Label>
                <Select
                  value={scorerTarget || NONE}
                  onValueChange={(v) => setScorerTarget(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="scorerTarget" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('manager.selectTournamentPlaceholder')}</SelectItem>
                    {myTournaments.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t('navigation.tournaments')}</SelectLabel>
                        {myTournaments.map((tr) => (
                          <SelectItem key={tr.id} value={`t:${tr.id}`}>{tr.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {myLeagues.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t('navigation.leagues')}</SelectLabel>
                        {myLeagues.map((l) => (
                          <SelectItem key={l.id} value={`l:${l.id}`}>{l.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {scorerTarget && (
            <ScorersPanel
              key={scorerTarget}
              type={scorerTarget.startsWith('l:') ? 'league' : 'tournament'}
              entityId={scorerTarget.slice(2)}
            />
          )}
        </TabsContent>

        <TabsContent value="matches">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="size-4" />
                {t('manager.manageMatchState')}
              </CardTitle>
              <CardDescription>{t('manager.manageMatchStateDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tournamentForMatch">
                  <Search className="size-4" />
                  {t('manager.selectTournament')}
                </Label>
                <Select
                  value={selectedTournamentForMatch || NONE}
                  onValueChange={(v) => handleTournamentSelectForMatch(v === NONE ? '' : v)}
                >
                  <SelectTrigger id="tournamentForMatch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('manager.selectTournamentPlaceholder')}</SelectItem>
                    {myTournaments.map((tournament) => (
                      <SelectItem key={tournament.id} value={tournament.id}>
                        {tournament.name} ({tournamentStatusLabel(tournament.status, t)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTournamentForMatch && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="matchSelect">
                      <Search className="size-4" />
                      {t('manager.selectMatch')}
                    </Label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        id="matchSearch"
                        type="text"
                        value={matchSearchTerm}
                        onChange={(e) => setMatchSearchTerm(e.target.value)}
                        placeholder={t('manager.searchPlaceholder')}
                        disabled={loadingMatches || matchesForTournament.length === 0}
                      />
                      <Select
                        value={matchStateFilter}
                        onValueChange={setMatchStateFilter}
                        disabled={loadingMatches || matchesForTournament.length === 0}
                      >
                        <SelectTrigger id="matchStateFilter" className="w-full sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATCH_STATE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {loadingMatches ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader className="size-4 animate-spin" />
                        <span>{t('manager.loadingMatches')}</span>
                      </div>
                    ) : (
                      <Select
                        value={selectedMatchId || NONE}
                        onValueChange={(v) => handleMatchSelect(v === NONE ? '' : v)}
                        disabled={loadingMatch || filteredMatchesForTournament.length === 0}
                      >
                        <SelectTrigger id="matchSelect" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t('manager.selectMatchPlaceholder')}</SelectItem>
                          {filteredMatchesForTournament.map((match) => {
                            const player1Name = match.player1?.name || t('common.unknown');
                            const player2Name = match.player2?.name || t('common.unknown');
                            const matchType = match.is_playoff ? t('manager.playoff') : (match.group?.name || t('manager.group'));
                            const score = match.player1_legs !== null ? `${match.player1_legs} - ${match.player2_legs}` : '';
                            return (
                              <SelectItem key={match.id} value={match.id}>
                                {matchType}: {player1Name} vs {player2Name} {score && `(${score})`} - {formatMatchStateLabel(match.status)}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {matchesForTournament.length === 0 && !loadingMatches && (
                    <EmptyState icon={Search} title={t('manager.noMatchesForTournament')} />
                  )}

                  {matchesForTournament.length > 0 && filteredMatchesForTournament.length === 0 && !loadingMatches && (
                    <EmptyState icon={Search} title={t('manager.noMatchesMatchingFilter')} />
                  )}

                  {matchInfo && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="text-base font-semibold">
                              {matchInfo.player1?.name || t('common.unknown')} vs {matchInfo.player2?.name || t('common.unknown')}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {matchInfo.tournaments?.name || matchInfo.group?.tournament?.name || 'N/A'} - {matchInfo.is_playoff ? t('manager.playoff') : (matchInfo.group?.name || t('manager.group'))}
                            </div>
                          </div>
                          <Badge variant="outline">{matchInfo.status}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="gap-1.5">
                            <span className="text-muted-foreground">{t('manager.matchId')}</span>
                            <span className="tabular-nums">{matchInfo.id}</span>
                          </Badge>
                          <Badge variant="secondary" className="gap-1.5">
                            <span className="text-muted-foreground">{t('manager.currentScore')}</span>
                            <span className="tabular-nums">
                              {matchInfo.player1_legs !== null ? `${matchInfo.player1_legs} - ${matchInfo.player2_legs}` : t('manager.notSet')}
                            </span>
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Edit3 className="size-4" />
                              {t('manager.manualMatchResult')}
                            </CardTitle>
                            <CardDescription>{t('manager.manualMatchResultDescription')}</CardDescription>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            {!editMode && (
                              <Button className="w-full" onClick={handleEditResult}>
                                <Edit3 />
                                {t('manager.openResultEditor')}
                              </Button>
                            )}

                            {editMode && (
                              <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                  <Label htmlFor="manualWinner">{t('manager.winner')}</Label>
                                  <Select
                                    value={manualResult.winner || NONE}
                                    onValueChange={(v) => setManualResult({ ...manualResult, winner: v === NONE ? '' : v })}
                                  >
                                    <SelectTrigger id="manualWinner" className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NONE}>{t('manager.selectWinner')}</SelectItem>
                                      <SelectItem value={matchInfo.player1_id}>{matchInfo.player1?.name || 'Player 1'}</SelectItem>
                                      <SelectItem value={matchInfo.player2_id}>{matchInfo.player2?.name || 'Player 2'}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {manualResult.winner && (
                                  <div className="flex flex-col gap-2">
                                    <Label>{t('manager.quickScore')}</Label>
                                    <div className="flex flex-wrap gap-2">
                                      {getScorePresets().map(({ winnerLegs, loserLegs }) => {
                                        const winnerIsP1 = manualResult.winner === matchInfo.player1_id;
                                        const p1 = winnerIsP1 ? winnerLegs : loserLegs;
                                        const p2 = winnerIsP1 ? loserLegs : winnerLegs;
                                        const active = manualResult.player1Legs === p1 && manualResult.player2Legs === p2;
                                        return (
                                          <Button
                                            key={`${winnerLegs}-${loserLegs}`}
                                            type="button"
                                            variant={active ? 'default' : 'outline'}
                                            size="sm"
                                            className="tabular-nums"
                                            onClick={() => applyPreset(manualResult.winner, winnerLegs, loserLegs)}
                                          >
                                            {winnerLegs} - {loserLegs}
                                          </Button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="grid gap-4 sm:grid-cols-2">
                                  <div className="flex flex-col gap-2">
                                    <Label htmlFor="manualPlayer1Legs">{matchInfo.player1?.name || 'Player 1'} {t('manager.legs')}</Label>
                                    <Input
                                      id="manualPlayer1Legs"
                                      type="number"
                                      min="0"
                                      className="tabular-nums"
                                      value={manualResult.player1Legs}
                                      onChange={(e) => setManualResult({ ...manualResult, player1Legs: parseInt(e.target.value, 10) || 0 })}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <Label htmlFor="manualPlayer2Legs">{matchInfo.player2?.name || 'Player 2'} {t('manager.legs')}</Label>
                                    <Input
                                      id="manualPlayer2Legs"
                                      type="number"
                                      min="0"
                                      className="tabular-nums"
                                      value={manualResult.player2Legs}
                                      onChange={(e) => setManualResult({ ...manualResult, player2Legs: parseInt(e.target.value, 10) || 0 })}
                                    />
                                  </div>
                                </div>

                                {manualResultError ? (
                                  <Alert variant="destructive">
                                    <AlertCircle />
                                    <AlertDescription>{manualResultError}</AlertDescription>
                                  </Alert>
                                ) : (
                                  <Alert>
                                    <AlertCircle />
                                    <AlertDescription>{t('manager.statsNotRecalculatedHint')}</AlertDescription>
                                  </Alert>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    onClick={saveManualResult}
                                    disabled={savingResult || !!manualResultError}
                                  >
                                    {savingResult ? (
                                      <>
                                        <Loader className="animate-spin" />
                                        {t('manager.saving')}
                                      </>
                                    ) : (
                                      <>
                                        <Save />
                                        {t('manager.saveResult')}
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={cancelEdit}
                                    disabled={savingResult}
                                  >
                                    {t('manager.cancel')}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="border-destructive/40">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <RotateCcw className="size-4" />
                              {t('manager.resetMatchToPending')}
                            </CardTitle>
                            <CardDescription>{t('manager.resetMatchDescription')}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Button
                              variant="outline"
                              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={resetMatchToPending}
                              disabled={loadingMatch || matchInfo.status === 'pending'}
                            >
                              {loadingMatch ? (
                                <>
                                  <Loader className="animate-spin" />
                                  {t('manager.resetting')}
                                </>
                              ) : (
                                <>
                                  <RotateCcw />
                                  {t('manager.resetToPending')}
                                </>
                              )}
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                </>
              )}

              {message.text && (
                <Alert variant={message.type === 'success' ? 'default' : 'destructive'}>
                  {message.type === 'success' ? <Check /> : <AlertCircle />}
                  <AlertDescription>{message.text}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

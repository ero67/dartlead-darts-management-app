import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Trophy, Users, Settings, TrendingUp, Pencil, Trash2, X, Check, BarChart3 } from 'lucide-react';
import { useLeague } from '../contexts/LeagueContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { leagueService } from '../services/leagueService';
import { HeadToHead } from './HeadToHead';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';
import { LeaderboardTab } from './league/LeaderboardTab';
import { TournamentsTab } from './league/TournamentsTab';
import { StatisticsTab } from './league/StatisticsTab';
import { PlayersTab } from './league/PlayersTab';
import { SettingsTab } from './league/SettingsTab';
import { getUserDisplayName } from '../utils/userDisplayName';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

// Default tournament settings shape (matches TournamentCreation defaults)
const DEFAULT_TOURNAMENT_SETTINGS = {
  tournamentType: 'groups_with_playoffs',
  legsToWin: 3,
  startingScore: 501,
  defaultScoringMode: 'dart',
  groupSettings: { type: 'groups', value: 2 },
  standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead'],
  playoffSettings: {
    enabled: true,
    qualificationMode: 'perGroup',
    playersPerGroup: 1,
    totalPlayersToAdvance: 8,
    startingRoundPlayers: 8,
    seedingMethod: 'groupBased',
    thirdPlaceMatch: true,
    legsToWinByRound: { 32: 3, 16: 3, 8: 3, 4: 3, 2: 3 }
  }
};

export function LeagueDetail({ leagueId, onBack, onCreateTournament, onSelectTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { currentLeague, selectLeague, updateLeague, deleteLeague, addMembers, updateMemberStatus, removeMember, refreshLeaderboard, getUnlinkedTournaments, linkTournamentToLeague, unlinkTournamentFromLeague, registerForLeague, approveLeagueRegistration, rejectLeagueRegistration, withdrawLeagueRegistration } = useLeague();
  const [activeTab, setActiveTab] = useState('leaderboard'); // 'leaderboard', 'tournaments', 'players', 'settings'
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [addMode, setAddMode] = useState('name'); // 'name' or 'users'
  // In-flight guards — every one of these actions used to be double-clickable
  const [isSavingLeague, setIsSavingLeague] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [pendingMemberIds, setPendingMemberIds] = useState(() => new Set());
  const [isLinking, setIsLinking] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [myLeagueRegistration, setMyLeagueRegistration] = useState(null);
  const [leagueRegistrations, setLeagueRegistrations] = useState([]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [processingRegId, setProcessingRegId] = useState(null);
  const [scoringRules, setScoringRules] = useState([]);
  const [roundPointsRules, setRoundPointsRules] = useState([
    { round: 32, points: 0, enabled: false },
    { round: 16, points: 0, enabled: false },
    { round: 8, points: 0, enabled: false }
  ]);
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [newPlacement, setNewPlacement] = useState({ position: '', points: '' });

  // Default tournament settings state
  const [tournamentDefaults, setTournamentDefaults] = useState(DEFAULT_TOURNAMENT_SETTINGS);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  // Add existing tournament state
  const [isLinkingTournament, setIsLinkingTournament] = useState(false);
  const [unlinkedTournaments, setUnlinkedTournaments] = useState([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [selectedTournamentToLink, setSelectedTournamentToLink] = useState('');
  const [linkPlayers, setLinkPlayers] = useState([]);       // players of the picked tournament
  const [linkPlayerMap, setLinkPlayerMap] = useState({});    // tournament player id -> member player id | 'new' | ''

  // League statistics state
  const [leagueStats, setLeagueStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestedLeagueIdRef = useRef(null);

  // The DB already authorizes admins for every league write; mirrored here so
  // the manage UI is shown. Computed before the early return so effects can
  // depend on it.
  const isManager = !!(user && currentLeague && (
    isAdmin ||
    currentLeague.createdBy === user.id ||
    (currentLeague.managerIds && currentLeague.managerIds.includes(user.id))
  ));

  useEffect(() => {
    if (!leagueId || (currentLeague && currentLeague.id === leagueId)) return;
    // selectLeague is a fresh function on every provider render, so without
    // this guard the (heavy) getLeague fetch fired once per render until the
    // league arrived.
    if (requestedLeagueIdRef.current === leagueId) return;
    requestedLeagueIdRef.current = leagueId;
    setLoadError(false);
    selectLeague(leagueId).catch(() => setLoadError(true));
  }, [leagueId, currentLeague, selectLeague]);

  useEffect(() => {
    if (currentLeague && !isEditing) {
      setEditForm({
        name: currentLeague.name || '',
        description: currentLeague.description || ''
      });
    }
  }, [currentLeague, isEditing]);

  // Load scoring rules when league changes
  useEffect(() => {
    if (currentLeague?.scoringRules?.placementPoints) {
      const points = currentLeague.scoringRules.placementPoints;
      const rulesArray = Object.entries(points)
        .filter(([key]) => key !== 'default' && key !== 'playoffDefault' && key !== 'roundPoints')
        .map(([position, pts]) => ({ position: parseInt(position), points: pts }))
        .sort((a, b) => a.position - b.position);

      // Show what resolvePoints actually awards when a key is missing (a
      // missing playoffDefault falls through to default, then 0) — a made-up
      // "1" here used to differ from the points really handed out.
      const effectiveDefault = points.default !== undefined ? points.default : 0;
      rulesArray.push({
        position: 'playoffDefault',
        points: points.playoffDefault !== undefined ? points.playoffDefault : effectiveDefault
      });
      rulesArray.push({
        position: 'default',
        points: effectiveDefault
      });

      setScoringRules(rulesArray);

      const rp = points.roundPoints || {};
      setRoundPointsRules([
        { round: 32, points: rp['32'] || 0, enabled: rp['32'] !== undefined },
        { round: 16, points: rp['16'] || 0, enabled: rp['16'] !== undefined },
        { round: 8, points: rp['8'] || 0, enabled: rp['8'] !== undefined }
      ]);
    }
  }, [currentLeague]);

  // Load default tournament settings when league changes
  useEffect(() => {
    if (currentLeague?.defaultTournamentSettings) {
      setTournamentDefaults({
        ...DEFAULT_TOURNAMENT_SETTINGS,
        ...currentLeague.defaultTournamentSettings,
        groupSettings: {
          ...DEFAULT_TOURNAMENT_SETTINGS.groupSettings,
          ...(currentLeague.defaultTournamentSettings.groupSettings || {})
        },
        playoffSettings: {
          ...DEFAULT_TOURNAMENT_SETTINGS.playoffSettings,
          ...(currentLeague.defaultTournamentSettings.playoffSettings || {}),
          legsToWinByRound: {
            ...DEFAULT_TOURNAMENT_SETTINGS.playoffSettings.legsToWinByRound,
            ...(currentLeague.defaultTournamentSettings.playoffSettings?.legsToWinByRound || {})
          }
        },
        standingsCriteriaOrder: currentLeague.defaultTournamentSettings.standingsCriteriaOrder || DEFAULT_TOURNAMENT_SETTINGS.standingsCriteriaOrder
      });
    } else {
      setTournamentDefaults(DEFAULT_TOURNAMENT_SETTINGS);
    }
  }, [currentLeague]);

  // Load statistics lazily when the tab is first opened
  useEffect(() => {
    if (activeTab === 'statistics' && currentLeague && !statsLoaded && !loadingStats) {
      setLoadingStats(true);
      leagueService.getLeagueStatistics(currentLeague.id)
        .then(data => {
          setLeagueStats(data);
          setStatsLoaded(true);
        })
        .catch(err => {
          console.error('Error loading league statistics:', err);
          setStatsLoaded(true); // don't retry forever
        })
        .finally(() => setLoadingStats(false));
    }
  }, [activeTab, currentLeague, statsLoaded, loadingStats]);

  // Reset stats when league changes
  useEffect(() => {
    setStatsLoaded(false);
    setLeagueStats(null);
  }, [leagueId]);

  // League registration effects
  const currentLeagueId = currentLeague?.id;
  const userId = user?.id;
  useEffect(() => {
    if (!currentLeagueId || !userId) return;
    let cancelled = false;
    if (!isManager) {
      leagueService.getMyLeagueRegistration(currentLeagueId).then(reg => { if (!cancelled) setMyLeagueRegistration(reg); });
    } else {
      leagueService.getLeagueRegistrations(currentLeagueId)
        .then(regs => { if (!cancelled) setLeagueRegistrations(regs || []); })
        .catch(err => console.error('Error loading league registrations:', err));
    }
    return () => { cancelled = true; };
  }, [currentLeagueId, userId, isManager]);

  if (!currentLeague) {
    if (loadError) {
      return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
          <EmptyState icon={Trophy} title={t('leagues.notFound')}>
            <Button onClick={onBack}>
              <ArrowLeft />
              {t('leagues.backToLeagues')}
            </Button>
          </EmptyState>
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <p className="text-sm text-muted-foreground">{t('leagues.loading')}</p>
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // The league member linked to my account — the real "I'm in this league",
  // as opposed to a registration that is still waiting for approval.
  const myMembership = user
    ? (currentLeague.members || []).find(m => m.player?.user_id === user.id)
    : null;

  const handleUpdateLeague = async () => {
    if (isSavingLeague) return;
    const name = editForm.name.trim();
    if (!name) {
      alert(t('leagues.leagueNameRequired'));
      return;
    }
    setIsSavingLeague(true);
    try {
      await updateLeague(currentLeague.id, {
        name,
        description: editForm.description.trim()
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating league:', error);
      alert(t('leagues.failedToUpdateLeague'));
    } finally {
      setIsSavingLeague(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (window.confirm(t('leagues.confirmDeleteLeague'))) {
      try {
        await deleteLeague(currentLeague.id);
        onBack();
      } catch (error) {
        console.error('Error deleting league:', error);
        alert(t('leagues.failedToDeleteLeague'));
      }
    }
  };

  // Map service error codes to localized messages (shared keys with tournaments)
  const describeRegistrationError = (error) => {
    const code = error?.message || '';
    if (code.includes('PLAYER_NAME_TAKEN')) return t('registration.errorNameTaken');
    if (code.includes('WITHDRAW_NOT_ALLOWED')) return t('registration.errorWithdrawNotAllowed');
    if (code.includes('NOT_LOGGED_IN')) return t('registration.errorNotLoggedIn');
    return t('registration.errorGeneric');
  };

  const handleSelfRegisterLeague = async (nameOverride) => {
    if (!user || !currentLeague || registerLoading) return;
    // The player name becomes public (leaderboards, brackets), so never fall
    // back to the account email — ask for a name first.
    const playerName = typeof nameOverride === 'string' ? nameOverride : getUserDisplayName(user);
    if (!playerName) {
      setShowNameEditor(true);
      return;
    }
    setShowNameEditor(false);
    setRegisterLoading(true);
    setRegistrationError('');
    try {
      const reg = await registerForLeague(currentLeague.id, playerName);
      setMyLeagueRegistration(reg);
    } catch (error) {
      console.error('Error registering for league:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleWithdrawLeagueReg = async () => {
    if (!myLeagueRegistration) return;
    if (!confirm(t('registration.confirmWithdraw'))) return;
    setRegisterLoading(true);
    setRegistrationError('');
    try {
      await withdrawLeagueRegistration(myLeagueRegistration.id);
      setMyLeagueRegistration(null);
    } catch (error) {
      console.error('Error withdrawing league registration:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleApproveLeagueReg = async (regId) => {
    setProcessingRegId(regId);
    setRegistrationError('');
    try {
      const updated = await approveLeagueRegistration(regId);
      setLeagueRegistrations(prev => prev.map(r => (r.id === regId ? { ...r, ...updated } : r)));
    } catch (error) {
      console.error('Error approving:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setProcessingRegId(null);
    }
  };

  const handleRejectLeagueReg = async (regId) => {
    setProcessingRegId(regId);
    setRegistrationError('');
    try {
      const updated = await rejectLeagueRegistration(regId);
      setLeagueRegistrations(prev => prev.map(r => (r.id === regId ? { ...r, ...(updated || { status: 'rejected' }) } : r)));
    } catch (error) {
      console.error('Error rejecting:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setProcessingRegId(null);
    }
  };

  const handleAddUserFromSearch = async (selectedUser) => {
    if (isAddingMember) return;
    setIsAddingMember(true);
    try {
      await leagueService.addUserToLeague(currentLeague.id, selectedUser.id, selectedUser.fullName);
      // Refresh league to pick up new member
      await selectLeague(currentLeague.id);
    } catch (error) {
      console.error('Error adding user to league:', error);
      alert(t('leagues.failedToAddPlayer'));
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim() || isAddingMember) return;
    setIsAddingMember(true);
    try {
      await addMembers(currentLeague.id, [{ name: newPlayerName.trim() }]);
      setNewPlayerName('');
      setIsAddingPlayer(false);
    } catch (error) {
      console.error('Error adding player:', error);
      alert(t('leagues.failedToAddPlayer'));
    } finally {
      setIsAddingMember(false);
    }
  };

  // One request per member at a time — overlapping toggles let a stale
  // response win.
  const withMemberPending = async (playerId, action) => {
    if (pendingMemberIds.has(playerId)) return;
    setPendingMemberIds(prev => new Set(prev).add(playerId));
    try {
      await action();
    } finally {
      setPendingMemberIds(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  };

  const handleTogglePlayerActive = (playerId, currentActive) => withMemberPending(playerId, async () => {
    try {
      await updateMemberStatus(currentLeague.id, playerId, {
        isActive: !currentActive
      });
    } catch (error) {
      console.error('Error updating player status:', error);
      alert(t('leagues.failedToUpdatePlayerStatus'));
    }
  });

  const handleRemovePlayer = (playerId) => {
    if (!window.confirm(t('leagues.confirmRemovePlayer'))) return;
    return withMemberPending(playerId, async () => {
      try {
        await removeMember(currentLeague.id, playerId);
      } catch (error) {
        console.error('Error removing player:', error);
        alert(t('leagues.failedToRemovePlayer'));
      }
    });
  };

  const handleScoringRuleChange = (index, field, value) => {
    const updated = [...scoringRules];
    if (field === 'points') {
      updated[index].points = parseInt(value) || 0;
    }
    setScoringRules(updated);
  };

  const handleAddPlacement = () => {
    const position = (newPlacement.position === 'default' || newPlacement.position === 'playoffDefault')
      ? newPlacement.position
      : parseInt(newPlacement.position);
    const points = parseInt(newPlacement.points) || 0;
    
    if (position === '' || (position !== 'default' && position !== 'playoffDefault' && (isNaN(position) || position < 1))) {
      alert(t('leagues.invalidPosition'));
      return;
    }
    
    // Check if position already exists
    if (scoringRules.some(r => r.position === position)) {
      alert(t('leagues.placementExists'));
      return;
    }
    
    const updated = [...scoringRules, { position, points }];
    // Sort: numeric positions first, then playoffDefault, then default
    updated.sort((a, b) => {
      if (a.position === 'default') return 1;
      if (b.position === 'default') return -1;
      if (a.position === 'playoffDefault') return 1;
      if (b.position === 'playoffDefault') return -1;
      return a.position - b.position;
    });
    
    setScoringRules(updated);
    setNewPlacement({ position: '', points: '' });
  };

  // The two fallback rows always exist (the scorer falls back to them), so
  // only numbered placements can be removed.
  const isFallbackRule = (rule) => rule.position === 'playoffDefault' || rule.position === 'default';
  const handleRemovePlacement = (index) => {
    if (isFallbackRule(scoringRules[index])) return;
    const updated = scoringRules.filter((_, i) => i !== index);
    setScoringRules(updated);
  };

  const handleSaveScoringRules = async () => {
    setIsSavingScoring(true);
    try {
      const placementPoints = {};
      scoringRules.forEach(rule => {
        placementPoints[rule.position.toString()] = rule.points;
      });

      const roundPoints = {};
      roundPointsRules.forEach(rule => {
        if (rule.enabled) {
          roundPoints[rule.round.toString()] = rule.points;
        }
      });
      if (Object.keys(roundPoints).length > 0) {
        placementPoints.roundPoints = roundPoints;
      }

      await updateLeague(currentLeague.id, {
        scoring_rules: {
          ...currentLeague.scoringRules,
          placementPoints
        }
      });
      
      alert(t('leagues.scoringSaved'));
    } catch (error) {
      console.error('Error saving scoring rules:', error);
      alert(t('leagues.scoringSaveFailed'));
    } finally {
      setIsSavingScoring(false);
    }
  };

  const handleSaveTournamentDefaults = async () => {
    setIsSavingDefaults(true);
    try {
      await updateLeague(currentLeague.id, {
        default_tournament_settings: tournamentDefaults
      });
      alert(t('leagues.defaultsSaved'));
    } catch (error) {
      console.error('Error saving tournament defaults:', error);
      alert(t('leagues.defaultsSaveFailed'));
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const handleResetTournamentDefaults = () => {
    setTournamentDefaults(DEFAULT_TOURNAMENT_SETTINGS);
  };

  const handleOpenLinkTournament = async () => {
    setIsLinkingTournament(true);
    setLoadingUnlinked(true);
    try {
      const tournaments = await getUnlinkedTournaments();
      setUnlinkedTournaments(tournaments);
    } catch (error) {
      console.error('Error loading unlinked tournaments:', error);
    } finally {
      setLoadingUnlinked(false);
    }
  };

  // Statistics are computed from linked tournaments, so re-fetch them lazily
  // after anything that changes that set or the results.
  const invalidateStats = () => {
    setStatsLoaded(false);
    setLeagueStats(null);
  };

  const closeLinkTournament = () => {
    setIsLinkingTournament(false);
    setSelectedTournamentToLink('');
    setLinkPlayers([]);
    setLinkPlayerMap({});
  };

  // Picking a tournament loads its players and prefills the member mapping:
  // same player row first, then a case-insensitive name match, else unmapped.
  const handleSelectTournamentToLink = async (tournamentId) => {
    setSelectedTournamentToLink(tournamentId);
    setLinkPlayers([]);
    setLinkPlayerMap({});
    if (!tournamentId) return;
    try {
      const players = await leagueService.getTournamentPlayersForLink(tournamentId);
      const members = (currentLeague?.members || []).map(m => m.player).filter(Boolean);
      const norm = (n) => (n || '').trim().toLowerCase();
      const map = {};
      players.forEach(p => {
        const hit = members.find(m => m.id === p.id) || members.find(m => norm(m.name) === norm(p.name));
        map[p.id] = hit ? hit.id : '';
      });
      setLinkPlayers(players);
      setLinkPlayerMap(map);
    } catch (error) {
      console.error('Error loading tournament players:', error);
    }
  };

  const isLinkMapComplete = linkPlayers.length > 0 && linkPlayers.every(p => linkPlayerMap[p.id]);

  const handleLinkTournament = async () => {
    if (!selectedTournamentToLink || !currentLeague || isLinking || !isLinkMapComplete) return;
    setIsLinking(true);
    try {
      const playerMap = linkPlayers.map(p => ({ from: p.id, to: linkPlayerMap[p.id] }));
      await linkTournamentToLeague(currentLeague.id, selectedTournamentToLink, playerMap);
      // Refresh the league to get updated tournament list
      await selectLeague(currentLeague.id);
      invalidateStats();
      closeLinkTournament();
      setUnlinkedTournaments([]);
    } catch (error) {
      console.error('Error linking tournament:', error);
      alert(t('leagues.linkFailed'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkTournament = async (tournamentId) => {
    if (!window.confirm(t('leagues.confirmUnlinkTournament')) || isLinking) return;
    setIsLinking(true);
    try {
      await unlinkTournamentFromLeague(currentLeague.id, tournamentId);
      // Refresh the league to get updated tournament list
      await selectLeague(currentLeague.id);
      invalidateStats();
    } catch (error) {
      console.error('Error unlinking tournament:', error);
      alert(t('leagues.unlinkFailed'));
    } finally {
      setIsLinking(false);
    }
  };
  const handleRecalculate = async () => {
    if (isRecalculating) return;
    setIsRecalculating(true);
    try {
      await refreshLeaderboard(currentLeague.id);
      invalidateStats();
      alert(t('leagues.recalculateSuccess'));
    } catch (error) {
      console.error('Error refreshing leaderboard:', error);
      alert(t('leagues.recalculateFailed'));
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('leagues.backToLeagues')}
        </Button>

        {isEditing ? (
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <Input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder={t('leagues.leagueName')}
              className="h-11 text-xl font-semibold md:text-xl"
            />
            <Textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder={t('leagues.descriptionOptional')}
              rows={3}
            />
            <div className="flex gap-2">
              <Button onClick={handleUpdateLeague} disabled={isSavingLeague || !editForm.name.trim()}>
                <Check />
                {t('common.save')}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{currentLeague.name}</h1>
                <StatusBadge status={currentLeague.status} t={t} />
              </div>
              {currentLeague.description && (
                <p className="text-sm text-muted-foreground">{currentLeague.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  <span className="tabular-nums">{currentLeague.members?.length || 0}</span> {t('leagues.members')}
                </span>
                <span className="flex items-center gap-1.5">
                  <Trophy className="size-4" />
                  <span className="tabular-nums">{currentLeague.tournaments?.length || 0}</span> {t('leagues.tournaments')}
                </span>
              </div>
            </div>
            {isManager && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} title={t('leagues.editLeague')} aria-label={t('leagues.editLeague')}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={handleDeleteLeague} title={t('leagues.deleteLeague')} aria-label={t('leagues.deleteLeague')}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="leaderboard"><TrendingUp />{t('leagues.leaderboard')}</TabsTrigger>
          <TabsTrigger value="tournaments"><Trophy />{t('tournaments.title')}</TabsTrigger>
          <TabsTrigger value="statistics"><BarChart3 />{t('leagues.statistics')}</TabsTrigger>
          <TabsTrigger value="h2h"><Users />{t('leagues.headToHead')}</TabsTrigger>
          <TabsTrigger value="players"><Users />{t('leagues.players')}</TabsTrigger>
          {isManager && <TabsTrigger value="settings"><Settings />{t('leagues.settings')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="leaderboard">
          <LeaderboardTab
            league={currentLeague}
            isManager={isManager}
            isRecalculating={isRecalculating}
            onRecalculate={handleRecalculate}
          />
        </TabsContent>

        <TabsContent value="statistics">
          <StatisticsTab leagueStats={leagueStats} loadingStats={loadingStats} />
        </TabsContent>

        <TabsContent value="tournaments">
          <TournamentsTab
            league={currentLeague}
            isManager={isManager}
            onCreateTournament={onCreateTournament}
            onSelectTournament={onSelectTournament}
            isLinkingTournament={isLinkingTournament}
            loadingUnlinked={loadingUnlinked}
            unlinkedTournaments={unlinkedTournaments}
            selectedTournamentToLink={selectedTournamentToLink}
            linkPlayers={linkPlayers}
            linkPlayerMap={linkPlayerMap}
            setLinkPlayerMap={setLinkPlayerMap}
            isLinkMapComplete={isLinkMapComplete}
            isLinking={isLinking}
            onOpenLink={handleOpenLinkTournament}
            onCloseLink={closeLinkTournament}
            onSelectTournamentToLink={handleSelectTournamentToLink}
            onLinkTournament={handleLinkTournament}
            onUnlinkTournament={handleUnlinkTournament}
          />
        </TabsContent>

        <TabsContent value="h2h" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{t('leagues.headToHead')}</h2>
          {currentLeague.leaderboard && currentLeague.leaderboard.length >= 2 ? (
            <HeadToHead
              leagueId={currentLeague.id}
              players={currentLeague.leaderboard.map(e => e.player).filter(Boolean)}
            />
          ) : (
            <EmptyState icon={Users} title={t('leagues.noResultsYet')} />
          )}
        </TabsContent>

        <TabsContent value="players">
          <PlayersTab
            league={currentLeague}
            user={user}
            isManager={isManager}
            myMembership={myMembership}
            showNameEditor={showNameEditor}
            setShowNameEditor={setShowNameEditor}
            myLeagueRegistration={myLeagueRegistration}
            registerLoading={registerLoading}
            registrationError={registrationError}
            onSelfRegister={handleSelfRegisterLeague}
            onWithdrawReg={handleWithdrawLeagueReg}
            leagueRegistrations={leagueRegistrations}
            processingRegId={processingRegId}
            onApproveReg={handleApproveLeagueReg}
            onRejectReg={handleRejectLeagueReg}
            isAddingPlayer={isAddingPlayer}
            setIsAddingPlayer={setIsAddingPlayer}
            addMode={addMode}
            setAddMode={setAddMode}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            isAddingMember={isAddingMember}
            onAddPlayer={handleAddPlayer}
            onAddUserFromSearch={handleAddUserFromSearch}
            pendingMemberIds={pendingMemberIds}
            onToggleActive={handleTogglePlayerActive}
            onRemovePlayer={handleRemovePlayer}
          />
        </TabsContent>

        {isManager && (
          <TabsContent value="settings">
            <SettingsTab
              league={currentLeague}
              canEditManagers={!!(isAdmin || currentLeague.createdBy === user?.id)}
              scoringRules={scoringRules}
              onScoringRuleChange={handleScoringRuleChange}
              isFallbackRule={isFallbackRule}
              onRemovePlacement={handleRemovePlacement}
              roundPointsRules={roundPointsRules}
              setRoundPointsRules={setRoundPointsRules}
              newPlacement={newPlacement}
              setNewPlacement={setNewPlacement}
              onAddPlacement={handleAddPlacement}
              isSavingScoring={isSavingScoring}
              onSaveScoringRules={handleSaveScoringRules}
              tournamentDefaults={tournamentDefaults}
              setTournamentDefaults={setTournamentDefaults}
              isSavingDefaults={isSavingDefaults}
              onSaveDefaults={handleSaveTournamentDefaults}
              onResetDefaults={handleResetTournamentDefaults}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

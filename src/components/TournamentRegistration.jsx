import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Play, ArrowLeft, Settings, ChevronUp, ChevronDown, X, Star, Check, CheckCircle, XCircle, Clock, AlertCircle, UserCheck, UserPlus, ClipboardList, Search, Link2, Crown, Trash2, BadgeCheck } from 'lucide-react';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { UserSearchPicker } from './UserSearchPicker';

const MAX_PLAYERS = 64;

const parseBulkPlayerNames = (value) => {
  return value
    .split(/[;\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
};

export function TournamentRegistration({ tournament, onBack, onDeleteTournament }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const isOwner = user && tournament?.userId && user.id === tournament.userId;
  const canManage = isAdmin || isOwner;
  // Ensure players is always an array (memoized — bulkPreview depends on it)
  const players = useMemo(() => tournament.players || [], [tournament.players]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [bulkPlayerNames, setBulkPlayerNames] = useState('');
  // 'name' | 'bulk' | 'users' | 'league' — league tournaments default to
  // picking players from the league pool.
  const [addMode, setAddMode] = useState(tournament?.leagueId ? 'league' : 'name');
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [showGroupsPreview, setShowGroupsPreview] = useState(false);
  const [draftGroups, setDraftGroups] = useState([]);
  const [tournamentSettings, setTournamentSettings] = useState({
    legsToWin: tournament.legsToWin || 3,
    startingScore: tournament.startingScore || 501,
    tournamentType: tournament.tournamentType || 'groups_with_playoffs',
    groupSettings: tournament.groupSettings || {
      type: 'groups', // 'groups' or 'playersPerGroup'
      value: 2,
      standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead']
    },
    standingsCriteriaOrder: tournament.standingsCriteriaOrder || tournament.groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
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
        qualificationMode: 'perGroup',
        playersPerGroup: 1,
        totalPlayersToAdvance: 8,
            seedingMethod: 'groupBased',
            groupMatchups: [],
        startingRoundPlayers: tournament.playoffSettings?.startingRoundPlayers || 8,
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
  const [seededPlayerIds, setSeededPlayerIds] = useState(new Set());
  const { addPlayerToTournament, removePlayerFromTournament, startTournament, updateTournamentSettings, registerForTournament, getTournamentRegistrations, approveRegistration, rejectRegistration, withdrawRegistration, getTournament } = useTournament();

  // Self-registration state
  const [myRegistration, setMyRegistration] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [processingRegId, setProcessingRegId] = useState(null);

  // The player row linked to my account — set once a manager approves me (or
  // adds me from the user list), which is the real "I am in this tournament".
  const myPlayerEntry = user ? players.find(p => p.user_id === user.id) : null;

  // Map service error codes to localized messages
  const describeRegistrationError = (error) => {
    const code = error?.message || '';
    if (code.includes('PLAYER_NAME_TAKEN')) return t('registration.errorNameTaken');
    if (code.includes('REGISTRATION_CLOSED')) return t('registration.errorRegistrationClosed');
    if (code.includes('WITHDRAW_NOT_ALLOWED')) return t('registration.errorWithdrawNotAllowed');
    if (code.includes('NOT_LOGGED_IN')) return t('registration.errorNotLoggedIn');
    if (code.includes('MISSING_PLAYER_NAME')) return t('registration.pleaseEnterPlayerName');
    return t('registration.errorGeneric');
  };

  const refreshRegistrations = useCallback(async () => {
    if (!tournament?.id) return;
    try {
      const regs = await getTournamentRegistrations(tournament.id);
      setRegistrations(regs || []);
    } catch (error) {
      console.error('Error loading registrations:', error);
    }
    // getTournamentRegistrations is recreated on every context render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const refreshMyRegistration = useCallback(async () => {
    if (!tournament?.id || !user) return;
    const reg = await tournamentService.getMyRegistrationForTournament(tournament.id);
    setMyRegistration(reg);
  }, [tournament?.id, user]);

  // Load registration data on mount / when the viewer's role changes
  useEffect(() => {
    if (!tournament?.id) return;
    if (user) refreshMyRegistration();
    if (canManage) refreshRegistrations();
  }, [tournament?.id, user, canManage, refreshMyRegistration, refreshRegistrations]);

  // A manager may approve while the player has the page open: re-check my own
  // registration whenever the tournament's player list changes.
  const playerCount = players.length;
  useEffect(() => {
    if (user && !canManage) refreshMyRegistration();
  }, [playerCount, user, canManage, refreshMyRegistration]);

  const handleAddUserFromSearch = async (selectedUser) => {
    try {
      await tournamentService.addUserToTournament(tournament.id, selectedUser.id, selectedUser.fullName);
      await getTournament(tournament.id);
    } catch (error) {
      console.error('Error adding user to tournament:', error);
      setRegistrationError(describeRegistrationError(error));
    }
  };

  const handleSelfRegister = async () => {
    if (!user) return;
    setRegisterLoading(true);
    setRegistrationError('');
    try {
      const playerName = user.user_metadata?.full_name || user.email;
      const reg = await registerForTournament(tournament.id, playerName);
      setMyRegistration(reg);
    } catch (error) {
      console.error('Error registering:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleWithdrawRegistration = async () => {
    if (!myRegistration) return;
    if (!confirm(t('registration.confirmWithdraw'))) return;
    setRegisterLoading(true);
    setRegistrationError('');
    try {
      await withdrawRegistration(myRegistration.id);
      setMyRegistration(null);
    } catch (error) {
      console.error('Error withdrawing registration:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleApproveRegistration = async (regId) => {
    setProcessingRegId(regId);
    setRegistrationError('');
    try {
      const updated = await approveRegistration(regId);
      setRegistrations(prev => prev.map(r => (r.id === regId ? { ...r, ...updated } : r)));
    } catch (error) {
      console.error('Error approving:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setProcessingRegId(null);
    }
  };

  const handleRejectRegistration = async (regId) => {
    setProcessingRegId(regId);
    setRegistrationError('');
    try {
      const updated = await rejectRegistration(regId);
      setRegistrations(prev => prev.map(r => (r.id === regId ? { ...r, ...(updated || { status: 'rejected' }) } : r)));
    } catch (error) {
      console.error('Error rejecting:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setProcessingRegId(null);
    }
  };

  // Update tournamentSettings when tournament prop changes (e.g., after reload from DB)
  useEffect(() => {
    if (tournament) {
      setTournamentSettings({
        legsToWin: tournament.legsToWin || 3,
        startingScore: tournament.startingScore || 501,
        tournamentType: tournament.tournamentType || 'groups_with_playoffs',
        groupSettings: tournament.groupSettings || {
          type: 'groups',
          value: 2,
          standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead']
        },
        standingsCriteriaOrder: tournament.standingsCriteriaOrder || tournament.groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
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
            qualificationMode: 'perGroup',
            playersPerGroup: 1,
            totalPlayersToAdvance: 8,
            startingRoundPlayers: tournament.playoffSettings?.startingRoundPlayers || 8,
            legsToWinByRound: {
              16: 3,  // Round of 16
              8: 3,   // Quarter-finals
              4: 3,   // Semi-finals
              2: 3    // Final
            }
          };
        })()
      });
    }
  }, [tournament?.id, tournament?.legsToWin, tournament?.startingScore, tournament?.tournamentType, tournament?.groupSettings, tournament?.standingsCriteriaOrder, tournament?.playoffSettings]);

  const singlePlayerInputRef = useRef(null);
  const refocusAfterAddRef = useRef(false);

  // The context reload after adding a player can remount this page (loading
  // state), so refocus the quick-add input once the fresh player list lands.
  useEffect(() => {
    if (refocusAfterAddRef.current) {
      refocusAfterAddRef.current = false;
      singlePlayerInputRef.current?.focus();
    }
  }, [players]);

  const addPlayer = async () => {
    if (!newPlayerName.trim()) {
      alert(t('registration.pleaseEnterPlayerName'));
      return;
    }

    if (players.length >= MAX_PLAYERS) {
      alert(t('registration.tournamentFull'));
      return;
    }

    try {
      refocusAfterAddRef.current = true;
      await addPlayerToTournament(newPlayerName.trim());
      setNewPlayerName('');
      // Keep focus so a manager can type the next name right away
      singlePlayerInputRef.current?.focus();
    } catch (error) {
      console.error('Error adding player:', error);
      alert(t('registration.failedToAddPlayer'));
    }
  };

  // Live preview of the pasted list: which names will be added, which are
  // skipped as duplicates (already in the tournament or repeated in the input).
  const bulkPreview = useMemo(() => {
    const parsed = parseBulkPlayerNames(bulkPlayerNames);
    const existing = new Set(players.map((player) => player.name.trim().toLowerCase()));
    const seen = new Set();
    const fresh = [];
    let skipped = 0;
    for (const name of parsed) {
      const normalized = name.toLowerCase();
      if (existing.has(normalized) || seen.has(normalized)) {
        skipped += 1;
        continue;
      }
      seen.add(normalized);
      fresh.push(name);
    }
    return { fresh, skipped };
  }, [bulkPlayerNames, players]);

  const addBulkPlayers = async () => {
    const availableSlots = Math.max(0, MAX_PLAYERS - players.length);
    const namesToAdd = bulkPreview.fresh.slice(0, availableSlots);

    if (namesToAdd.length === 0) return;

    try {
      for (const name of namesToAdd) {
        await addPlayerToTournament(name);
      }
      setBulkPlayerNames('');

      if (namesToAdd.length < bulkPreview.fresh.length) {
        alert(t('registration.tournamentFull'));
      }
    } catch (error) {
      console.error('Error adding players in bulk:', error);
      alert(t('registration.failedToAddPlayer'));
    }
  };

  const removePlayer = async (playerId) => {
    if (tournament.status !== 'open_for_registration') {
      alert(t('registration.cannotRemovePlayerAfterStart') || 'Cannot remove players after tournament has started');
      return;
    }

    if (!confirm(t('registration.confirmRemovePlayer') || `Are you sure you want to remove this player?`)) {
      return;
    }

    try {
      await removePlayerFromTournament(playerId);
    } catch (error) {
      console.error('Error removing player:', error);
      alert(t('registration.failedToRemovePlayer') || 'Failed to remove player. Please try again.');
    }
  };

  const toggleSeeded = (playerId) => {
    setSeededPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleStartTournament = async () => {
    if (players.length < 2) {
      alert(t('registration.needsAtLeast2Players'));
      return;
    }

    try {
      // For playoff-only tournaments, there is no group stage to generate
      if (tournament.tournamentType === 'playoff_only') {
        // Just mark tournament as started in DB via settings update
        await updateTournamentSettings(tournament.id, {
          ...tournamentSettings,
          status: 'started'
        });
      } else {
        // Show preview + allow edits before we officially start (create groups + matches in DB)
        const generated = tournamentService.generateGroups(players, tournamentSettings.groupSettings, seededPlayerIds);
        setDraftGroups(generated);
        setShowGroupsPreview(true);
      }
    } catch (error) {
      console.error('Error starting tournament:', error);
      alert(t('registration.failedToStartTournament'));
    }
  };

  const movePlayerToGroup = (playerId, toGroupId) => {
    setDraftGroups(prev => {
      const fromGroup = prev.find(g => (g.players || []).some(p => p.id === playerId));
      if (!fromGroup) return prev;
      if (fromGroup.id === toGroupId) return prev;

      const playerObj = (fromGroup.players || []).find(p => p.id === playerId);
      if (!playerObj) return prev;

      return prev.map(g => {
        if (g.id === fromGroup.id) {
          return { ...g, players: (g.players || []).filter(p => p.id !== playerId) };
        }
        if (g.id === toGroupId) {
          return { ...g, players: [...(g.players || []), playerObj] };
        }
        return g;
      }).filter(g => (g.players || []).length > 0);
    });
  };

  const regenerateGroupsPreview = () => {
    const generated = tournamentService.generateGroups(players, tournamentSettings.groupSettings, seededPlayerIds);
    setDraftGroups(generated);
  };

  const confirmStartWithGroups = async () => {
    try {
      await startTournament(tournamentSettings.groupSettings, draftGroups);
      setShowGroupsPreview(false);
    } catch (error) {
      console.error('Error starting tournament with custom groups:', error);
      alert(t('registration.failedToStartTournament'));
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

  // --- League player pool (for tournaments linked to a league) ---
  const [leagueMembers, setLeagueMembers] = useState([]);
  const [selectedLeaguePlayerIds, setSelectedLeaguePlayerIds] = useState(new Set());
  const [leaguePlayerFilter, setLeaguePlayerFilter] = useState('');
  const [addingLeaguePlayers, setAddingLeaguePlayers] = useState(false);

  useEffect(() => {
    if (!tournament?.leagueId || !canManage) return;
    let cancelled = false;
    leagueService.getMembers(tournament.leagueId)
      .then((members) => { if (!cancelled) setLeagueMembers(members || []); })
      .catch((error) => console.error('Error loading league members:', error));
    return () => { cancelled = true; };
  }, [tournament?.leagueId, canManage]);

  // Active league players who are not in the tournament yet, alphabetical.
  const leaguePlayerPool = useMemo(() => {
    const inTournament = new Set(players.map((p) => p.id));
    return leagueMembers
      .filter((m) => m.isActive && m.player && !inTournament.has(m.player.id))
      .map((m) => m.player)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leagueMembers, players]);

  const visibleLeaguePool = useMemo(() => {
    const query = leaguePlayerFilter.trim().toLowerCase();
    if (!query) return leaguePlayerPool;
    return leaguePlayerPool.filter((p) => p.name.toLowerCase().includes(query));
  }, [leaguePlayerPool, leaguePlayerFilter]);

  // Only count selections that are still in the pool (someone may have been
  // added through another mode in the meantime).
  const selectedInPool = useMemo(() => {
    const poolIds = new Set(leaguePlayerPool.map((p) => p.id));
    return [...selectedLeaguePlayerIds].filter((id) => poolIds.has(id));
  }, [leaguePlayerPool, selectedLeaguePlayerIds]);

  const toggleLeaguePlayer = (playerId) => {
    setSelectedLeaguePlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const handleAddLeaguePlayers = async () => {
    if (selectedInPool.length === 0) return;
    setAddingLeaguePlayers(true);
    try {
      await tournamentService.addExistingPlayersToTournament(tournament.id, selectedInPool);
      setSelectedLeaguePlayerIds(new Set());
      await getTournament(tournament.id);
    } catch (error) {
      console.error('Error adding league players:', error);
      alert(t('registration.failedToAddPlayer'));
    } finally {
      setAddingLeaguePlayers(false);
    }
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyRegistrationLink = async () => {
    const link = `${window.location.origin}/tournament/${tournament.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API can be unavailable (older browsers, non-secure origins)
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleDeleteTournament = async () => {
    if (!tournament || !canManage) return;

    const confirmMessage = t('management.confirmDeleteTournament', { name: tournament.name });
    if (!window.confirm(confirmMessage)) return;

    try {
      await onDeleteTournament(tournament.id);
      onBack();
    } catch (error) {
      console.error('Error deleting tournament:', error);
      alert(t('management.failedToDeleteTournament'));
    }
  };

  return (
    <div className="tournament-registration">
      <div className="registration-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('registration.backToTournaments')}
        </button>
        <h1>{tournament.name}</h1>
        <div className="header-actions">
          {canManage && (
            <button
              className="edit-settings-btn"
              onClick={() => setShowEditSettings(true)}
              title={t('registration.editTournamentSettings')}
            >
              <Settings size={18} />
              {t('registration.editSettings')}
            </button>
          )}
          {canManage && onDeleteTournament && (
            <button
              className="delete-tournament-btn"
              onClick={handleDeleteTournament}
              title={t('management.deleteTournament')}
            >
              <Trash2 size={18} />
              {t('management.deleteTournament')}
            </button>
          )}
          <div className="tournament-status">
            <span className="status-badge open">{t('registration.openForRegistration')}</span>
          </div>
        </div>
      </div>

      <div className="registration-content">
        {/* Anonymous visitors: point them at login so they can register */}
        {!user && (
          <div className="self-register-section">
            <p>{t('registration.loginToRegisterHint')}</p>
            <button
              className="self-register-btn"
              onClick={() => navigate('/login', { state: { from: `/tournament/${tournament.id}` } })}
            >
              <UserCheck size={18} />
              {t('registration.loginToRegister')}
            </button>
          </div>
        )}

        {/* Player Self-Registration (for non-managers) */}
        {user && !canManage && (
          <div className="self-register-section">
            {myPlayerEntry ? (
              <div className="registration-status-badge approved">
                <UserCheck size={16} />
                {t('registration.youAreRegistered')}
              </div>
            ) : (
              <>
                {!myRegistration && (
                  <>
                    <button
                      className="self-register-btn"
                      onClick={handleSelfRegister}
                      disabled={registerLoading}
                    >
                      <Plus size={20} />
                      {registerLoading ? t('common.loading') : t('registration.registerForTournament')}
                    </button>
                    <p>{t('registration.selfRegisterHint')}</p>
                  </>
                )}
                {myRegistration?.status === 'pending' && (
                  <>
                    <div className="registration-status-badge pending">
                      <Clock size={16} />
                      {t('registration.alreadyRegistered')}
                    </div>
                    <p>{t('registration.registrationSubmitted')}</p>
                    <button
                      className="withdraw-registration-btn"
                      onClick={handleWithdrawRegistration}
                      disabled={registerLoading}
                    >
                      <X size={16} />
                      {t('registration.withdrawRegistration')}
                    </button>
                  </>
                )}
                {myRegistration?.status === 'approved' && (
                  <div className="registration-status-badge approved">
                    <CheckCircle size={16} />
                    {t('registration.registrationApproved')}
                  </div>
                )}
                {myRegistration?.status === 'rejected' && (
                  <>
                    <div className="registration-status-badge rejected">
                      <XCircle size={16} />
                      {t('registration.registrationRejected')}
                    </div>
                    <p>{t('registration.registrationRejectedHint')}</p>
                  </>
                )}
              </>
            )}
            {registrationError && (
              <div className="registration-error">
                <AlertCircle size={16} />
                {registrationError}
              </div>
            )}
          </div>
        )}

        {/* Registration Requests (for managers) */}
        {canManage && (
          <div className="pending-requests-section">
            <div className="requests-header">
              <h3>
                <UserCheck size={18} />
                {t('registration.registrationRequests')}
              </h3>
              <div className="requests-header-actions">
                {registrations.filter(r => r.status === 'pending').length > 0 && (
                  <span className="requests-count">
                    {registrations.filter(r => r.status === 'pending').length} {t('registration.statusPending')}
                  </span>
                )}
                <button
                  className={`copy-link-btn${linkCopied ? ' copy-link-btn--copied' : ''}`}
                  onClick={handleCopyRegistrationLink}
                  title={t('registration.copyLinkHint')}
                >
                  {linkCopied ? <Check size={15} /> : <Link2 size={15} />}
                  {linkCopied ? t('registration.linkCopied') : t('registration.copyRegistrationLink')}
                </button>
              </div>
            </div>
            {registrationError && (
              <div className="registration-error">
                <AlertCircle size={16} />
                {registrationError}
              </div>
            )}
            {registrations.length === 0 ? (
              <p className="no-requests">{t('registration.noRequestsPending')}</p>
            ) : (
              registrations.map(reg => (
                <div key={reg.id} className={`registration-request-card status-${reg.status}`}>
                  <div className="request-info">
                    <span className="request-name">{reg.player_name}</span>
                    <span className="request-date">{new Date(reg.created_at).toLocaleDateString()}</span>
                  </div>
                  {reg.status === 'pending' ? (
                    <div className="request-actions">
                      <button
                        className="approve-btn"
                        onClick={() => handleApproveRegistration(reg.id)}
                        disabled={processingRegId === reg.id}
                      >
                        <CheckCircle size={14} /> {t('registration.approve')}
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => handleRejectRegistration(reg.id)}
                        disabled={processingRegId === reg.id}
                      >
                        <XCircle size={14} /> {t('registration.reject')}
                      </button>
                    </div>
                  ) : (
                    <span className={`registration-status-badge ${reg.status}`}>
                      {reg.status === 'approved' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {reg.status === 'approved' ? t('registration.statusApproved') : t('registration.statusRejected')}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        <div className="players-section">
          <div className="section-header">
            <h2>
              <Users size={20} />
              {t('registration.players')}
              <span className="player-count-badge">{players.length} / {MAX_PLAYERS}</span>
            </h2>
            {players.length < 2 && (
              <span className="min-players-hint">{t('registration.minPlayersHint')}</span>
            )}
          </div>

          {canManage && (
            <div className="add-players-panel">
              <div className="add-mode-toggle">
                <button
                  type="button"
                  className={addMode === 'name' ? 'active' : ''}
                  onClick={() => setAddMode('name')}
                >
                  <UserPlus size={15} />
                  {t('registration.addModeSingle')}
                </button>
                <button
                  type="button"
                  className={addMode === 'bulk' ? 'active' : ''}
                  onClick={() => setAddMode('bulk')}
                >
                  <ClipboardList size={15} />
                  {t('registration.addModeBulk')}
                </button>
                <button
                  type="button"
                  className={addMode === 'users' ? 'active' : ''}
                  onClick={() => setAddMode('users')}
                >
                  <Search size={15} />
                  {t('registration.addModeUsers')}
                </button>
                {tournament.leagueId && (
                  <button
                    type="button"
                    className={addMode === 'league' ? 'active' : ''}
                    onClick={() => setAddMode('league')}
                  >
                    <Crown size={15} />
                    {t('registration.addModeLeague')}
                  </button>
                )}
              </div>

              {addMode === 'name' && (
                <>
                  <div className="add-player-form">
                    <input
                      ref={singlePlayerInputRef}
                      type="text"
                      placeholder={t('registration.enterPlayerName')}
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                      maxLength={50}
                    />
                    <button
                      className="add-player-btn"
                      onClick={addPlayer}
                      disabled={!newPlayerName.trim() || players.length >= MAX_PLAYERS}
                    >
                      <Plus size={16} />
                      {t('registration.addPlayer')}
                    </button>
                  </div>
                  <p className="add-panel-hint">{t('registration.quickAddHint')}</p>
                </>
              )}

              {addMode === 'bulk' && (
                <>
                  <textarea
                    className="bulk-players-input"
                    placeholder={t('registration.playersBulkPlaceholder')}
                    value={bulkPlayerNames}
                    onChange={(e) => setBulkPlayerNames(e.target.value)}
                    rows={4}
                    maxLength={2000}
                  />
                  {bulkPreview.fresh.length > 0 && (
                    <div className="bulk-preview">
                      {bulkPreview.fresh.map((name) => (
                        <span key={name.toLowerCase()} className="bulk-chip">{name}</span>
                      ))}
                    </div>
                  )}
                  <div className="bulk-actions">
                    <button
                      className="add-player-btn"
                      onClick={addBulkPlayers}
                      disabled={bulkPreview.fresh.length === 0 || players.length >= MAX_PLAYERS}
                    >
                      <Plus size={16} />
                      {bulkPreview.fresh.length > 0
                        ? t('registration.addNPlayers', { count: bulkPreview.fresh.length })
                        : t('registration.addPlayers')}
                    </button>
                    {bulkPreview.skipped > 0 && (
                      <span className="bulk-skipped-note">
                        {t('registration.bulkSkipped', { count: bulkPreview.skipped })}
                      </span>
                    )}
                  </div>
                  <p className="add-panel-hint">{t('registration.playersBulkHelp')}</p>
                </>
              )}

              {addMode === 'users' && (
                <>
                  <UserSearchPicker
                    onSelect={handleAddUserFromSearch}
                    excludeIds={players.map((p) => p.user_id).filter(Boolean)}
                  />
                  <p className="add-panel-hint">{t('registration.fromUsersHint')}</p>
                </>
              )}

              {addMode === 'league' && (
                leaguePlayerPool.length === 0 ? (
                  <p className="add-panel-hint">{t('registration.allLeaguePlayersAdded')}</p>
                ) : (
                  <>
                    <div className="league-players-controls">
                      <span className="league-players-count">
                        {t('tournaments.selectedCount', { selected: selectedInPool.length, total: leaguePlayerPool.length })}
                      </span>
                      <button
                        type="button"
                        className="league-players-action"
                        onClick={() => setSelectedLeaguePlayerIds(new Set(leaguePlayerPool.map((p) => p.id)))}
                        disabled={selectedInPool.length === leaguePlayerPool.length}
                      >
                        {t('tournaments.selectAllPlayers')}
                      </button>
                      <button
                        type="button"
                        className="league-players-action"
                        onClick={() => setSelectedLeaguePlayerIds(new Set())}
                        disabled={selectedInPool.length === 0}
                      >
                        {t('tournaments.clearSelection')}
                      </button>
                    </div>
                    {leaguePlayerPool.length > 12 && (
                      <input
                        type="text"
                        className="league-players-filter"
                        placeholder={t('tournaments.filterPlayers')}
                        value={leaguePlayerFilter}
                        onChange={(e) => setLeaguePlayerFilter(e.target.value)}
                      />
                    )}
                    <div className="league-players-grid">
                      {visibleLeaguePool.map((player) => {
                        const isSelected = selectedLeaguePlayerIds.has(player.id);
                        return (
                          <button
                            key={player.id}
                            type="button"
                            className={`league-player-chip${isSelected ? ' league-player-chip--selected' : ''}`}
                            onClick={() => toggleLeaguePlayer(player.id)}
                          >
                            {isSelected ? <Check size={14} /> : <Plus size={14} />}
                            {player.name}
                          </button>
                        );
                      })}
                      {visibleLeaguePool.length === 0 && (
                        <span className="league-players-empty">{t('tournaments.noPlayersMatchFilter')}</span>
                      )}
                    </div>
                    <button
                      className="add-player-btn"
                      onClick={handleAddLeaguePlayers}
                      disabled={selectedInPool.length === 0 || addingLeaguePlayers || players.length >= MAX_PLAYERS}
                    >
                      <Plus size={16} />
                      {addingLeaguePlayers
                        ? t('common.loading')
                        : t('registration.addSelectedPlayers', { count: selectedInPool.length })}
                    </button>
                    <p className="add-panel-hint">{t('registration.leaguePoolHint')}</p>
                  </>
                )
              )}
            </div>
          )}

          {canManage && tournament.tournamentType !== 'playoff_only' && players.length > 0 && (
            <p className="seeded-hint">
              <Star size={14} />
              {t('registration.seededHint')}
              {seededPlayerIds.size > 0 && (
                <span className="seeded-count">
                  {' — '}{seededPlayerIds.size} {t('registration.seeded')}
                </span>
              )}
            </p>
          )}

          <div className="players-list">
            {players.length === 0 ? (
              <div className="no-players">
                <p>{t('registration.noPlayersYet')}</p>
              </div>
            ) : (
              <div className="players-grid">
                {players.map((player, index) => (
                  <div key={player.id} className={`player-card${seededPlayerIds.has(player.id) ? ' player-card--seeded' : ''}`}>
                    <span className="player-number">{index + 1}</span>
                    <span className="player-name">
                      <button
                        type="button"
                        className="player-profile-link"
                        onClick={() => navigate(`/player/${player.id}`)}
                        title={t('playerProfile.viewProfile')}
                      >
                        {player.name}
                      </button>
                      {player.user_id && (
                        <span className="linked-account-badge" title={t('common.registeredAccount')}>
                          <BadgeCheck size={14} />
                        </span>
                      )}
                    </span>
                    {tournament.status === 'open_for_registration' && canManage && tournament.tournamentType !== 'playoff_only' && (
                      <button
                        className={`seed-toggle-btn${seededPlayerIds.has(player.id) ? ' seed-toggle-btn--active' : ''}`}
                        onClick={() => toggleSeeded(player.id)}
                        title={t('registration.toggleSeeded') || 'Toggle seeded'}
                      >
                        <Star size={16} fill={seededPlayerIds.has(player.id) ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    {tournament.status === 'open_for_registration' && canManage && (
                      <button
                        className="remove-player-btn"
                        onClick={() => removePlayer(player.id)}
                        title={t('registration.removePlayer') || 'Remove player'}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {players.length >= 2 && canManage && (
          <div className="start-tournament-section">
            <button
              className="start-tournament-btn"
              onClick={handleStartTournament}
            >
              <Play size={20} />
              {t('registration.startTournament')}
            </button>
          </div>
        )}
      </div>

      {/* Edit Settings Modal */}
      {showEditSettings && (
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
                <h4>{t('registration.tournamentType') || 'Tournament Type'}</h4>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="tournamentType"
                      value="groups_with_playoffs"
                      checked={tournamentSettings.tournamentType === 'groups_with_playoffs'}
                      onChange={(e) => setTournamentSettings(prev => ({
                        ...prev,
                        tournamentType: e.target.value,
                        // If switching back to groups, keep playoffs enabled toggle as-is
                        playoffSettings: {
                          ...prev.playoffSettings,
                          enabled: prev.playoffSettings.enabled ?? false
                        }
                      }))}
                    />
                    {t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="tournamentType"
                      value="playoff_only"
                      checked={tournamentSettings.tournamentType === 'playoff_only'}
                      onChange={(e) => setTournamentSettings(prev => ({
                        ...prev,
                        tournamentType: e.target.value,
                        // Playoff-only tournaments must have playoffs enabled
                        playoffSettings: {
                          ...prev.playoffSettings,
                          enabled: true
                        }
                      }))}
                    />
                    {t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}
                  </label>
                </div>
              </div>

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
                  <label>{t('registration.startingScore')}:</label>
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

              {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
              <div className="group-settings">
                <h4>{t('registration.standingsCriteriaOrder')}</h4>
                <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings.'}
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
                        <span className="criteria-number">{index + 1}.</span>
                        <span className="criteria-label">{criterionLabels[criterion] || criterion}</span>
                        <div className="criteria-actions">
                          <button
                            type="button"
                            className={index === 0 ? 'move-btn disabled' : 'move-btn'}
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
                            disabled={index === 0}
                            title={t('registration.moveUp')}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className={index === tournamentSettings.standingsCriteriaOrder.length - 1 ? 'move-btn disabled' : 'move-btn'}
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
                            disabled={index === tournamentSettings.standingsCriteriaOrder.length - 1}
                            title={t('registration.moveDown')}
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
              <div className="group-settings">
                <h4>{t('registration.groupSettings')}</h4>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="groups"
                      checked={tournamentSettings.groupSettings.type === 'groups'}
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
                    {tournamentSettings.groupSettings.type === 'groups' ? t('registration.numberOfGroups') : t('registration.playersPerGroup')}:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={tournamentSettings.groupSettings.type === 'groups' ? '16' : '8'}
                    value={tournamentSettings.groupSettings.value}
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
              )}

              <div className="group-settings">
                <h4>{t('registration.playoffSettings')}</h4>
                {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
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
                )}
                
                {tournamentSettings.playoffSettings.enabled && (() => {
                  // Calculate max players per group based on group settings
                  const calculateMaxPlayersPerGroup = () => {
                    if (tournamentSettings.groupSettings.type === 'groups') {
                      return Math.ceil(players.length / tournamentSettings.groupSettings.value);
                    } else {
                      return tournamentSettings.groupSettings.value;
                    }
                  };
                  const maxPlayersPerGroup = calculateMaxPlayersPerGroup();
                  const allPlayersValue = 9999; // Special value to represent "all players"
                  
                  return (
                    <div className="playoff-options">
                      {tournamentSettings.tournamentType === 'groups_with_playoffs' ? (
                        <>
                          <div className="radio-section">
                            <label className="radio-section-label">{t('registration.qualificationMode')}</label>
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
                        <label>{t('registration.playersAdvancingPerGroup')}:</label>
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
                                <option value={allPlayersValue}>{t('registration.all') || 'All'}</option>
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
                        </>
                      ) : (
                        <div className="input-group">
                          <label>{t('registration.playoffStartStage') || 'Playoff starts from'}</label>
                          <select
                            value={tournamentSettings.playoffSettings.startingRoundPlayers || 8}
                            onChange={(e) => setTournamentSettings({
                              ...tournamentSettings,
                              playoffSettings: {
                                ...tournamentSettings.playoffSettings,
                                startingRoundPlayers: parseInt(e.target.value)
                              }
                            })}
                          >
                            <option value={2}>{t('management.final') || 'Final (2 players)'}</option>
                            <option value={4}>{t('management.semiFinals') || 'Semi-finals (4 players)'}</option>
                            <option value={8}>{t('management.quarterFinals') || 'Quarter-finals (8 players)'}</option>
                            <option value={16}>{t('management.top16') || 'Round of 16 (16 players)'}</option>
                            <option value={32}>{t('management.top32') || 'Round of 32 (32 players)'}</option>
                          </select>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            {t('registration.playoffStartStageDescription') || 'This defines from which round the knockout bracket begins.'}
                          </p>
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
                {t('common.cancel')}
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

      {/* Groups Preview + Edit Modal (before tournament officially starts) */}
      {showGroupsPreview && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>{t('registration.groupPreviewTitle') || 'Groups preview (edit before start)'}</h3>
              <button
                className="close-btn"
                onClick={() => setShowGroupsPreview(false)}
                title={t('common.close') || 'Close'}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                {t('registration.groupPreviewHint') || 'You can move players between groups. Groups + matches will be created only after you confirm Start.'}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="secondary-btn" onClick={regenerateGroupsPreview}>
                  {t('registration.regenerateGroups') || 'Shuffle / regenerate'}
                </button>
              </div>

              <div className="groups-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {draftGroups.map(group => (
                  <div key={group.id} className="group-preview-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem', gap: '0.5rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{group.name}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{(group.players || []).length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {(group.players || []).map(player => (
                        <div key={player.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {seededPlayerIds.has(player.id) && <Star size={14} className="seeded-star-indicator" />}
                          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{player.name}</span>
                          <select
                            value={group.id}
                            onChange={(e) => movePlayerToGroup(player.id, e.target.value)}
                            style={{ maxWidth: '120px' }}
                            title={t('registration.moveToGroup') || 'Move to group'}
                          >
                            {draftGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowGroupsPreview(false)}>
                {t('registration.cancel') || 'Cancel'}
              </button>
              <button className="save-btn" onClick={confirmStartWithGroups}>
                <Play size={18} />
                {t('registration.startTournament') || 'Start Tournament'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

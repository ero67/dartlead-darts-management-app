import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { ScorersPanel } from './ScorersPanel';
import { RefreshButton } from './RefreshButton';
import { StatusBadge } from './shared/StatusBadge';
import { PlayersSection } from './registration/PlayersSection';
import { RegistrationRequests } from './registration/RegistrationRequests';
import { SelfRegistration } from './registration/SelfRegistration';
import { EditSettingsDialog } from './registration/EditSettingsDialog';
import { GroupsPreviewDialog } from './registration/GroupsPreviewDialog';
import { getPublicAppUrl } from '../utils/publicUrl';
import { getUserDisplayName } from '../utils/userDisplayName';
import { Button } from '@/components/ui/button';

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
    defaultScoringMode: tournament.defaultScoringMode || 'dart',
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
  const [showNameEditor, setShowNameEditor] = useState(false);
  // In-flight guards: start/settings/bulk-add were double-clickable, and the
  // service's duplicate check on start is read-then-insert, not atomic.
  const [isStarting, setIsStarting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
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
    if (isAddingUser) return;
    setIsAddingUser(true);
    try {
      await tournamentService.addUserToTournament(tournament.id, selectedUser.id, selectedUser.fullName);
      await getTournament(tournament.id);
    } catch (error) {
      console.error('Error adding user to tournament:', error);
      setRegistrationError(describeRegistrationError(error));
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleSelfRegister = async (nameOverride) => {
    if (!user || registerLoading) return;
    // The player name is public (standings, brackets, profiles), so never
    // fall back to the account email — ask for a name first.
    const playerName = typeof nameOverride === 'string' ? nameOverride : getUserDisplayName(user);
    if (!playerName) {
      setShowNameEditor(true);
      return;
    }
    setShowNameEditor(false);
    setRegisterLoading(true);
    setRegistrationError('');
    try {
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
        defaultScoringMode: tournament.defaultScoringMode || 'dart',
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

    if (namesToAdd.length === 0 || isBulkAdding) return;

    setIsBulkAdding(true);
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
    } finally {
      setIsBulkAdding(false);
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
    if (isStarting) return;

    setIsStarting(true);
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
    } finally {
      setIsStarting(false);
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
    if (isStarting) return;
    setIsStarting(true);
    try {
      await startTournament(tournamentSettings.groupSettings, draftGroups);
      setShowGroupsPreview(false);
    } catch (error) {
      console.error('Error starting tournament with custom groups:', error);
      alert(t('registration.failedToStartTournament'));
    } finally {
      setIsStarting(false);
    }
  };

  const updateSettings = async () => {
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      await updateTournamentSettings(tournament.id, tournamentSettings);
      setShowEditSettings(false);
      alert(t('registration.settingsUpdatedSuccessfully'));
    } catch (error) {
      console.error('Error updating tournament settings:', error);
      alert(t('registration.failedToUpdateSettings'));
    } finally {
      setIsSavingSettings(false);
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
    const link = `${getPublicAppUrl()}/tournament/${tournament.id}`;
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

  const showStart = players.length >= 2 && canManage;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('registration.backToTournaments')}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
              <StatusBadge status="open_for_registration" t={t} />
            </div>
            <p className="text-sm text-muted-foreground">{t('registration.openForRegistration')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            {canManage && (
              <Button
                variant="outline"
                onClick={() => setShowEditSettings(true)}
                title={t('registration.editTournamentSettings')}
                aria-label={t('registration.editSettings')}
              >
                <Settings />
                {t('registration.editSettings')}
              </Button>
            )}
            {canManage && onDeleteTournament && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={handleDeleteTournament}
                title={t('management.deleteTournament')}
                aria-label={t('management.deleteTournament')}
              >
                <Trash2 />
                {t('management.deleteTournament')}
              </Button>
            )}
            {showStart && (
              <Button onClick={handleStartTournament} disabled={isStarting}>
                <Play />
                {isStarting ? t('common.loading') : t('registration.startTournament')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Right column (first in DOM so it sits on top when stacked) */}
        <div className="flex flex-col gap-6 lg:order-last">
          {canManage && (
            <RegistrationRequests
              registrations={registrations}
              error={registrationError}
              linkCopied={linkCopied}
              onCopyLink={handleCopyRegistrationLink}
              onApprove={handleApproveRegistration}
              onReject={handleRejectRegistration}
              processingRegId={processingRegId}
            />
          )}
          {(!user || !canManage) && (
            <SelfRegistration
              user={user}
              myPlayerEntry={myPlayerEntry}
              myRegistration={myRegistration}
              showNameEditor={showNameEditor}
              setShowNameEditor={setShowNameEditor}
              registerLoading={registerLoading}
              error={registrationError}
              onLogin={() => navigate('/login', { state: { from: `/tournament/${tournament.id}` } })}
              onRegister={handleSelfRegister}
              onWithdraw={handleWithdrawRegistration}
            />
          )}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <PlayersSection
            tournament={tournament}
            players={players}
            maxPlayers={MAX_PLAYERS}
            canManage={canManage}
            onViewProfile={(playerId) => navigate(`/player/${playerId}`)}
            addMode={addMode}
            setAddMode={setAddMode}
            singlePlayerInputRef={singlePlayerInputRef}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            onAddPlayer={addPlayer}
            bulkPlayerNames={bulkPlayerNames}
            setBulkPlayerNames={setBulkPlayerNames}
            bulkPreview={bulkPreview}
            isBulkAdding={isBulkAdding}
            onAddBulkPlayers={addBulkPlayers}
            onAddUserFromSearch={handleAddUserFromSearch}
            leaguePlayerPool={leaguePlayerPool}
            visibleLeaguePool={visibleLeaguePool}
            selectedLeaguePlayerIds={selectedLeaguePlayerIds}
            setSelectedLeaguePlayerIds={setSelectedLeaguePlayerIds}
            selectedInPool={selectedInPool}
            leaguePlayerFilter={leaguePlayerFilter}
            setLeaguePlayerFilter={setLeaguePlayerFilter}
            onToggleLeaguePlayer={toggleLeaguePlayer}
            onAddLeaguePlayers={handleAddLeaguePlayers}
            addingLeaguePlayers={addingLeaguePlayers}
            seededPlayerIds={seededPlayerIds}
            onToggleSeeded={toggleSeeded}
            onRemovePlayer={removePlayer}
          />

          {/* Scorers can be set up before the first dart is thrown, not only
              once the tournament is running (previously this panel lived on the
              completed-tournament summary tab, which was far too late). */}
          {canManage && <ScorersPanel type="tournament" entityId={tournament.id} />}
        </div>
      </div>

      <EditSettingsDialog
        open={showEditSettings}
        onClose={() => setShowEditSettings(false)}
        settings={tournamentSettings}
        setSettings={setTournamentSettings}
        playersCount={players.length}
        isSaving={isSavingSettings}
        onSave={updateSettings}
      />

      <GroupsPreviewDialog
        open={showGroupsPreview}
        onClose={() => setShowGroupsPreview(false)}
        groups={draftGroups}
        seededPlayerIds={seededPlayerIds}
        onMovePlayer={movePlayerToGroup}
        onRegenerate={regenerateGroupsPreview}
        onConfirm={confirmStartWithGroups}
        isStarting={isStarting}
      />
    </div>
  );
}

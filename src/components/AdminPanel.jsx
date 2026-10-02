import React, { useState } from 'react';
import { Crown, UserPlus, Mail, Check, X, AlertCircle, Loader, Users, Settings, Search, Trophy, Save, GitMerge, ArrowRight, Link as LinkIcon, Unlink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { UserSearchPicker } from './UserSearchPicker';
import { ManagerBilling } from './ManagerBilling';
import { AdminOverview } from './AdminOverview';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from './shared/EmptyState';
import { tournamentStatusClass } from '../utils/tournamentStatus';
import { cn } from '@/lib/utils';

// shadcn Select items need a non-empty value; '' sentinels map to this.
const NONE = '__none';
const fromSelect = (v) => (v === NONE ? '' : v);

const ADMIN_TABS = [
  { key: 'overview', label: 'Overview', icon: Trophy },
  { key: 'users', label: 'Users & roles', icon: Users },
  { key: 'billing', label: 'Billing', icon: Crown },
  { key: 'data', label: 'Data fixes', icon: Settings }
];

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [managers, setManagers] = useState([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  
  // View All Users
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
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

  // Link Account → Player Stats
  const [linkUser, setLinkUser] = useState(null);
  const [linkUserPlayer, setLinkUserPlayer] = useState(null);
  const [linkPlayerId, setLinkPlayerId] = useState('');
  const [linkExtraPlayerIds, setLinkExtraPlayerIds] = useState([]);
  const [linkPlayerSearch, setLinkPlayerSearch] = useState('');
  const [linkPreview, setLinkPreview] = useState(null);
  const [loadingLinkPreview, setLoadingLinkPreview] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkLog, setLinkLog] = useState([]);

  const setManagerRole = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Call Supabase RPC function to set manager role (secure version checks admin)
      const { error } = await supabase.rpc('set_user_role_secure', {
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
      const { error } = await supabase.rpc('set_user_role_secure', {
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

  // Load tournaments for status change
  const loadTournamentsForStatus = async () => {
    setLoadingTournaments(true);
    try {
      // Dropdown only needs id/name/status -- use the lightweight summary.
      const tournaments = await tournamentService.getTournamentsSummary();
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
      // Pre-fill edited bonus points with current manual values
      const initial = {};
      entries.forEach(e => { initial[e.playerId] = e.manualPoints; });
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
        const newManual = editedPoints[entry.playerId];
        if (newManual !== undefined && newManual !== entry.manualPoints) {
          await leagueService.setManualPoints(selectedLeagueForPoints, entry.playerId, newManual);
          changedCount++;
        }
      }
      setMessage({ type: 'success', text: `Updated bonus points for ${changedCount} player(s).` });
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
    const newManual = editedPoints[playerId];
    const entry = leaderboardEntries.find(e => e.playerId === playerId);
    if (newManual === undefined || newManual === entry?.manualPoints) return;

    setSavingPoints(true);
    setMessage({ type: '', text: '' });
    try {
      await leagueService.setManualPoints(selectedLeagueForPoints, playerId, newManual);
      const newTotal = entry.tournamentPoints + newManual;
      setMessage({ type: 'success', text: `Updated ${playerName} bonus to ${newManual} pts (total: ${newTotal}).` });
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

  // ── Link Account → Player Stats ──────────────────────────────────
  const handleSelectLinkUser = async (selectedUser) => {
    setLinkUser(selectedUser);
    setLinkExtraPlayerIds([]);
    setLinkLog([]);
    setLinkPreview(null);
    setMessage({ type: '', text: '' });

    const existing = await tournamentService.getPlayerByUserId(selectedUser.id);
    setLinkUserPlayer(existing);

    if (existing) {
      setLinkPlayerId(existing.id);
      return;
    }
    // The usual case is "same name in every tournament", so pre-select the
    // unclaimed player record whose name matches the account name.
    const accountName = (selectedUser.fullName || '').trim().toLowerCase();
    const nameMatch = allPlayers.find(
      p => !p.user_id && p.name.trim().toLowerCase() === accountName
    );
    setLinkPlayerId(nameMatch?.id || '');
  };

  const addLinkExtraPlayer = (playerId) => {
    if (!playerId || playerId === linkPlayerId || linkExtraPlayerIds.includes(playerId)) return;
    setLinkExtraPlayerIds(prev => [...prev, playerId]);
  };

  const removeLinkExtraPlayer = (playerId) => {
    setLinkExtraPlayerIds(prev => prev.filter(id => id !== playerId));
  };

  // Preview the stats the account is about to inherit
  React.useEffect(() => {
    if (!linkPlayerId) {
      setLinkPreview(null);
      return;
    }
    let cancelled = false;
    setLoadingLinkPreview(true);
    tournamentService.getPlayerProfile(linkPlayerId)
      .then(data => { if (!cancelled) setLinkPreview(data); })
      .catch(() => { if (!cancelled) setLinkPreview(null); })
      .finally(() => { if (!cancelled) setLoadingLinkPreview(false); });
    return () => { cancelled = true; };
  }, [linkPlayerId]);

  const handleLinkStatsToUser = async () => {
    if (!linkUser || !linkPlayerId) {
      setMessage({ type: 'error', text: 'Select an account and a player record.' });
      return;
    }

    // Pre-flight: an account owns at most one player row, so if it is already
    // linked elsewhere the merge has to go INTO that row. Check before moving
    // any data so a rejected link can't leave a half-finished merge behind.
    if (linkUserPlayer && linkUserPlayer.id !== linkPlayerId) {
      setMessage({
        type: 'error',
        text: `${linkUser.fullName} is already linked to "${linkUserPlayer.name}". Select that record as the profile and merge the others into it, or unlink first.`
      });
      return;
    }

    const targetName = allPlayers.find(p => p.id === linkPlayerId)?.name || linkPlayerId;
    const extras = linkExtraPlayerIds.filter(id => id !== linkPlayerId);
    const extraNames = extras.map(id => allPlayers.find(p => p.id === id)?.name || id);

    const lines = [
      `Attach player statistics to ${linkUser.fullName} (${linkUser.email})`,
      '',
      `Profile: "${targetName}"`
    ];
    if (extras.length > 0) {
      lines.push('', 'These records will be MERGED into it and then deleted:');
      extraNames.forEach(n => lines.push(`  • "${n}"`));
    }
    lines.push('', 'Continue?');
    if (!confirm(lines.join('\n'))) return;

    setLinking(true);
    setLinkLog([]);
    setMessage({ type: '', text: '' });
    try {
      const logs = [];
      for (const sourceId of extras) {
        const sourceName = allPlayers.find(p => p.id === sourceId)?.name || sourceId;
        logs.push(`── Merging "${sourceName}" → "${targetName}" ──`);
        const result = await leagueService.mergePlayers(sourceId, linkPlayerId);
        logs.push(...(result.log || []));
        logs.push('');
      }

      const linked = await tournamentService.linkPlayerToUser(linkPlayerId, linkUser.id);
      logs.push(`Linked "${linked.name}" to ${linkUser.email}`);

      setLinkLog(logs);
      setLinkUserPlayer(linked);
      setLinkExtraPlayerIds([]);
      setMessage({
        type: 'success',
        text: `"${linked.name}" now belongs to ${linkUser.fullName}. Their tournament history and career statistics show up on that account's profile.`
      });
      await loadAllPlayers();
    } catch (err) {
      console.error('Error linking player to user:', err);
      let text = `Failed to link: ${err.message}`;
      if (err.message === 'PLAYER_ALREADY_LINKED') {
        text = 'That player record already belongs to a different account. Unlink it first, or merge instead.';
      } else if (err.message === 'USER_ALREADY_LINKED') {
        text = `This account is already linked to "${err.linkedPlayer?.name}". Merge the other records into that one instead.`;
      }
      setMessage({ type: 'error', text });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkPlayer = async () => {
    if (!linkUserPlayer) return;
    if (!confirm(
      `Unlink "${linkUserPlayer.name}" from ${linkUser?.email}?\n\n` +
      'The player record and all its match data stay intact — it just stops showing on that account\'s profile.'
    )) return;

    setLinking(true);
    try {
      await tournamentService.unlinkPlayerFromUser(linkUserPlayer.id);
      setMessage({ type: 'success', text: `"${linkUserPlayer.name}" is no longer linked to that account.` });
      setLinkUserPlayer(null);
      setLinkPlayerId('');
      await loadAllPlayers();
    } catch (err) {
      console.error('Error unlinking player:', err);
      setMessage({ type: 'error', text: `Failed to unlink: ${err.message}` });
    } finally {
      setLinking(false);
    }
  };

  // Load managers, tournaments, leagues, and players on mount
  React.useEffect(() => {
    loadManagers();
    loadTournamentsForStatus();
    loadLeaguesForPoints();
    loadAllPlayers();
  }, []);

  const filteredPlayers = (search) => allPlayers.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const playerName = (id) => allPlayers.find(p => p.id === id)?.name || id;

  const messageBox = message.text && (
    <Alert
      variant={message.type === 'success' ? 'default' : 'destructive'}
      className={message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : ''}
    >
      {message.type === 'success' ? <Check /> : <AlertCircle />}
      <AlertDescription className={message.type === 'success' ? 'text-current' : ''}>{message.text}</AlertDescription>
    </Alert>
  );

  const logBox = (title, lines) => lines.length > 0 && (
    <div className="rounded-lg bg-muted p-4 font-mono text-xs">
      <strong className="mb-2 block">{title}</strong>
      {lines.map((line, i) => (
        <div key={i} className="py-0.5 text-muted-foreground">{line}</div>
      ))}
    </div>
  );

  const removableChip = (id, onRemove) => (
    <Badge key={id} variant="outline" className="gap-1 bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-200">
      {playerName(id)}
      <button type="button" className="inline-flex no-underline" onClick={() => onRemove(id)} title="Remove" aria-label="Remove">
        <X className="size-3" />
      </button>
    </Badge>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, tournaments, and matches</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="h-auto flex-wrap">
          {ADMIN_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              <tab.icon />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <AdminOverview onOpenBilling={() => setActiveTab('billing')} />
        </TabsContent>

        <TabsContent value="users" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign Manager Role</CardTitle>
              <CardDescription>
                Managers can create tournaments. Enter a user's email address to grant manager permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">
                  <Mail className="size-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  onKeyPress={(e) => e.key === 'Enter' && !loading && setManagerRole()}
                  disabled={loading}
                  className="max-w-md"
                />
              </div>
              <Button className="w-fit" onClick={setManagerRole} disabled={loading || !email.trim()}>
                {loading ? (
                  <>
                    <Loader className="animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserPlus />
                    Assign Manager Role
                  </>
                )}
              </Button>
              {messageBox}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Managers</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingManagers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-5 animate-spin" />
                  <span>Loading managers...</span>
                </div>
              ) : managers.length === 0 ? (
                <EmptyState icon={Crown} title="No managers assigned yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {managers.map((manager) => (
                      <TableRow key={manager.id}>
                        <TableCell className="font-medium">{manager.email}</TableCell>
                        <TableCell className="text-muted-foreground">{manager.full_name}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeManagerRole(manager.email)}
                            disabled={loading}
                            title="Remove manager role"
                          >
                            <X />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>View All Users</CardTitle>
              <CardDescription>View all registered users and their roles.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Button className="w-fit" onClick={loadAllUsers} disabled={loadingUsers}>
                {loadingUsers ? (
                  <>
                    <Loader className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Users />
                    Load All Users
                  </>
                )}
              </Button>

              {loadingUsers && allUsers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-5 animate-spin" />
                  <span>Loading users...</span>
                </div>
              ) : allUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell className="text-muted-foreground">{user.full_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' ? 'default' : user.role === 'manager' ? 'secondary' : 'outline'}>{user.role}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Link Account to Player Stats</CardTitle>
              <CardDescription>
                Attach the results a player already has — from tournaments they played under their name, before they had a login — to their account.
                Everything recorded against that player record (matches, averages, 180s, checkouts, tournament history, league memberships) then shows on their profile.
                If they used more than one spelling of their name, merge those records in at the same time.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>
                  <UserPlus className="size-4" />
                  Account
                </Label>
                <UserSearchPicker onSelect={handleSelectLinkUser} />
                {linkUser && (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm">
                    <div>
                      <strong>{linkUser.fullName}</strong>
                      <span className="text-muted-foreground"> — {linkUser.email}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {linkUserPlayer
                        ? <>Currently linked to player <strong>&quot;{linkUserPlayer.name}&quot;</strong></>
                        : 'No player record linked yet'}
                    </div>
                    {linkUserPlayer && (
                      <Button variant="outline" size="sm" className="w-fit" onClick={handleUnlinkPlayer} disabled={linking}>
                        <Unlink />
                        Unlink
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {linkUser && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="linkPlayerSearch">
                      <Search className="size-4" />
                      Filter Player Records
                    </Label>
                    <Input
                      id="linkPlayerSearch"
                      type="text"
                      value={linkPlayerSearch}
                      onChange={(e) => setLinkPlayerSearch(e.target.value)}
                      placeholder="Type to filter player names..."
                      className="max-w-md"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>
                      <Users className="size-4" />
                      Player record to attach
                    </Label>
                    <Select value={linkPlayerId || NONE} onValueChange={(v) => setLinkPlayerId(fromSelect(v))} disabled={!!linkUserPlayer}>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>-- Select a player --</SelectItem>
                        {filteredPlayers(linkPlayerSearch)
                          .filter(p => !p.user_id || p.id === linkUserPlayer?.id)
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Only records that no account has claimed are listed.
                      {linkUserPlayer && ' This account is already linked, so the profile is fixed — use the merge list below to fold other spellings into it.'}
                    </p>
                  </div>

                  {/* Stats preview so the admin can confirm it's the right person */}
                  {loadingLinkPreview && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader className="size-4 animate-spin" />
                      <span>Loading statistics...</span>
                    </div>
                  )}
                  {!loadingLinkPreview && linkPreview && (
                    <div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
                      <strong>{linkPreview.player.name}</strong>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground tabular-nums">
                        <span>{linkPreview.tournaments.length} tournaments</span>
                        <span>{linkPreview.careerStats.matchesPlayed} matches</span>
                        <span>{linkPreview.careerStats.wins}W / {linkPreview.careerStats.losses}L</span>
                        <span>avg {linkPreview.careerStats.overallAverage.toFixed(2)}</span>
                        <span>{linkPreview.careerStats.total180s} × 180</span>
                        <span>{linkPreview.careerStats.tournamentWins} titles</span>
                      </div>
                      {linkPreview.tournaments.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {linkPreview.tournaments.slice(0, 5).map(t => t.name).join(', ')}
                          {linkPreview.tournaments.length > 5 && ` +${linkPreview.tournaments.length - 5} more`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional: other spellings to fold in */}
                  <div className="flex flex-col gap-2">
                    <Label>
                      <GitMerge className="size-4" />
                      Also merge these records (optional)
                    </Label>
                    <Select value={NONE} onValueChange={(v) => addLinkExtraPlayer(fromSelect(v))}>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>-- Add another spelling of the name --</SelectItem>
                        {filteredPlayers(linkPlayerSearch)
                          .filter(p => !p.user_id && p.id !== linkPlayerId && !linkExtraPlayerIds.includes(p.id))
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {linkExtraPlayerIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {linkExtraPlayerIds.map(id => removableChip(id, removeLinkExtraPlayer))}
                      </div>
                    )}
                    {linkExtraPlayerIds.length > 0 && (
                      <p className="text-xs text-destructive">
                        These {linkExtraPlayerIds.length} record(s) will be merged into the profile above and permanently deleted. This cannot be undone.
                      </p>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleLinkStatsToUser}
                    disabled={!linkPlayerId || linking || (!!linkUserPlayer && linkExtraPlayerIds.length === 0)}
                  >
                    {linking ? (
                      <>
                        <Loader className="animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <LinkIcon />
                        {linkExtraPlayerIds.length > 0
                          ? `Merge ${linkExtraPlayerIds.length} record(s) and link to account`
                          : 'Link stats to account'}
                      </>
                    )}
                  </Button>

                  {logBox('Log:', linkLog)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <ManagerBilling />
        </TabsContent>

        <TabsContent value="data" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Force Tournament Status</CardTitle>
              <CardDescription>Select a tournament from the list and manually change its status.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tournamentForStatus">
                  <Search className="size-4" />
                  Select Tournament
                </Label>
                <Select
                  value={selectedTournamentForStatus || NONE}
                  onValueChange={(v) => handleTournamentSelectForStatus(fromSelect(v))}
                  disabled={loadingTournaments || loadingTournament}
                >
                  <SelectTrigger id="tournamentForStatus" className="w-full max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Select a tournament --</SelectItem>
                    {tournamentsForStatus.map((tournament) => (
                      <SelectItem key={tournament.id} value={tournament.id}>
                        {tournament.name} ({tournament.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingTournament && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-4 animate-spin" />
                  <span>Loading tournament...</span>
                </div>
              )}

              {tournamentInfo && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    Current Status: <Badge variant="outline" className={tournamentStatusClass(tournamentInfo.status)}>{tournamentInfo.status}</Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="newStatus">New Status:</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger id="newStatus" className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open_for_registration">Open for Registration</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1 rounded-lg bg-muted p-4 text-sm">
                    <div><strong>Tournament:</strong> {tournamentInfo.name}</div>
                    <div><strong>Players:</strong> {tournamentInfo.players?.length || 0}</div>
                    <div><strong>Groups:</strong> {tournamentInfo.groups?.length || 0}</div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={forceTournamentStatus}
                    disabled={loadingTournament || newStatus === tournamentInfo.status}
                  >
                    {loadingTournament ? (
                      <>
                        <Loader className="animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Settings />
                        Update Status
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>League Points Management</CardTitle>
              <CardDescription>
                Add bonus points for tournaments played outside the app. These bonus points are preserved when the leaderboard is recalculated. The total is always: Tournament Points + Bonus Points.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="leagueForPoints">Select League</Label>
                <Select
                  value={selectedLeagueForPoints || NONE}
                  onValueChange={(v) => handleLeagueSelectForPoints(fromSelect(v))}
                  disabled={loadingLeagues}
                >
                  <SelectTrigger id="leagueForPoints" className="w-full max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>-- Choose a league --</SelectItem>
                    {leaguesForPoints.map(league => (
                      <SelectItem key={league.id} value={league.id}>
                        {league.name} ({league.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loadingLeaderboard && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-4 animate-spin" />
                  <span>Loading leaderboard...</span>
                </div>
              )}

              {selectedLeagueForPoints && !loadingLeaderboard && leaderboardEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No leaderboard entries found. Recalculate the leaderboard from the league settings first.
                </p>
              )}

              {leaderboardEntries.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-right">From Tournaments</TableHead>
                          <TableHead className="text-right">Bonus Pts</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-0" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leaderboardEntries.map((entry, index) => {
                          const isChanged = editedPoints[entry.playerId] !== undefined && editedPoints[entry.playerId] !== entry.manualPoints;
                          const previewTotal = entry.tournamentPoints + (editedPoints[entry.playerId] ?? entry.manualPoints);
                          return (
                            <TableRow key={entry.playerId} className={isChanged ? 'bg-primary/5' : ''}>
                              <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                              <TableCell className="font-medium">{entry.playerName}</TableCell>
                              <TableCell className="text-right text-muted-foreground tabular-nums">{entry.tournamentPoints}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  value={editedPoints[entry.playerId] ?? entry.manualPoints}
                                  onChange={(e) => handlePointChange(entry.playerId, e.target.value)}
                                  className={cn('ml-auto h-8 w-20 text-right tabular-nums', isChanged && 'border-primary font-bold')}
                                />
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {isChanged ? previewTotal : entry.totalPoints}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant={isChanged ? 'default' : 'ghost'}
                                  size="icon-sm"
                                  onClick={() => saveSinglePlayerPoints(entry.playerId, entry.playerName)}
                                  disabled={!isChanged || savingPoints}
                                  title={isChanged ? `Save ${entry.playerName}` : 'No changes'}
                                  aria-label={isChanged ? `Save ${entry.playerName}` : 'No changes'}
                                >
                                  <Check />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <Button
                    className="w-full"
                    onClick={saveAllPoints}
                    disabled={savingPoints || !Object.entries(editedPoints).some(([pid, pts]) => {
                      const entry = leaderboardEntries.find(e => e.playerId === pid);
                      return entry && pts !== entry.manualPoints;
                    })}
                  >
                    {savingPoints ? (
                      <>
                        <Loader className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save />
                        Save All Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merge Players</CardTitle>
              <CardDescription>
                Merge duplicate player records. All tournament data, matches, statistics and league results from the <strong>source</strong> player will be transferred to the <strong>target</strong> player. The source player will be deleted. <span className="font-semibold text-destructive">This cannot be undone!</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {loadingPlayers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader className="size-4 animate-spin" />
                  <span>Loading players...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="playerSearch">
                      <Search className="size-4" />
                      Filter Players
                    </Label>
                    <Input
                      id="playerSearch"
                      type="text"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Type to filter player names..."
                      className="max-w-md"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                    {/* Source players (will be deleted) */}
                    <div className="flex flex-col gap-2">
                      <Label className="text-destructive">Source(s) — will be deleted</Label>
                      <Select value={NONE} onValueChange={(v) => addSourcePlayer(fromSelect(v))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>-- Add source player --</SelectItem>
                          {filteredPlayers(playerSearch)
                            .filter(p => p.id !== targetPlayerId && !sourcePlayerIds.includes(p.id))
                            .map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {sourcePlayerIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {sourcePlayerIds.map(id => removableChip(id, removeSourcePlayer))}
                        </div>
                      )}
                    </div>

                    <ArrowRight className="hidden size-6 self-center text-muted-foreground md:mt-8 md:block" />

                    {/* Target player (will be kept) */}
                    <div className="flex flex-col gap-2">
                      <Label className="text-green-700 dark:text-green-400">Target — will be kept</Label>
                      <Select value={targetPlayerId || NONE} onValueChange={(v) => setTargetPlayerId(fromSelect(v))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>-- Select target player --</SelectItem>
                          {filteredPlayers(playerSearch)
                            .filter(p => !sourcePlayerIds.includes(p.id))
                            .map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Preview */}
                  {sourcePlayerIds.length > 0 && targetPlayerId && (
                    <div className="flex flex-col gap-3 rounded-lg border bg-muted p-4">
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <div className="flex flex-col items-end gap-1.5">
                          {sourcePlayerIds.map(id => (
                            <Badge key={id} variant="outline" className="bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-200">
                              {allPlayers.find(p => p.id === id)?.name}
                            </Badge>
                          ))}
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground" />
                        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                          {allPlayers.find(p => p.id === targetPlayerId)?.name}
                        </Badge>
                      </div>
                      <p className="text-center text-xs text-muted-foreground">
                        All matches, stats, tournament entries, and league data from {sourcePlayerIds.length} player(s) will be transferred.
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    variant={sourcePlayerIds.length > 0 && targetPlayerId ? 'destructive' : 'default'}
                    onClick={handleMergePlayers}
                    disabled={sourcePlayerIds.length === 0 || !targetPlayerId || merging}
                  >
                    {merging ? (
                      <>
                        <Loader className="animate-spin" />
                        Merging {sourcePlayerIds.length} player(s)...
                      </>
                    ) : (
                      <>
                        <GitMerge />
                        Merge {sourcePlayerIds.length > 0 ? `${sourcePlayerIds.length} Player(s)` : 'Players'}
                      </>
                    )}
                  </Button>

                  {logBox('Merge Log:', mergeLog)}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

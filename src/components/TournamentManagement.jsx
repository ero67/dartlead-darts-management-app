import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Trophy, Trash2, Settings, Activity, X, ClipboardList, Monitor } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TournamentSummary } from './TournamentSummary';
import { ScorersPanel } from './ScorersPanel';
import { RefreshButton } from './RefreshButton';
import { MatchStatisticsModal } from './MatchStatisticsModal';
import { StatusBadge } from './shared/StatusBadge';
import { LoadingState } from './shared/LoadingState';
import { GroupsTab } from './tournament/GroupsTab';
import { MatchesTab } from './tournament/MatchesTab';
import { StandingsTab } from './tournament/StandingsTab';
import { PlayoffsTab } from './tournament/PlayoffsTab';
import { StatisticsTab } from './tournament/StatisticsTab';
import { LiveMatchesTab } from './tournament/LiveMatchesTab';
import { StartMatchDialog } from './tournament/StartMatchDialog';
import { EditMatchPlayersDialog } from './tournament/EditMatchPlayersDialog';
import { CorrectResultDialog } from './tournament/CorrectResultDialog';
import { EditSettingsDialog } from './tournament/EditSettingsDialog';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { assignGroupScorers, assignPlayoffScorers } from '../utils/scorerAssignment';
import { resolveActiveTemplate, nextPow2 } from '../utils/seedSlots';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirmDialog';

  // Generate unique ID for playoff matches (using crypto.randomUUID for proper UUIDs)
  const generateId = () => {
    return crypto.randomUUID();
  };

// Stable ordering for live match cards. We deliberately do NOT sort by
// last_activity_at (which changes constantly as matches are scored, causing
// cards to jump around). Order by board number, then match id — both stable
// for the lifetime of a match.
const compareLiveMatchesStable = (a, b) => {
  const boardA = a.live_board_number ?? Number.MAX_SAFE_INTEGER;
  const boardB = b.live_board_number ?? Number.MAX_SAFE_INTEGER;
  if (boardA !== boardB) return boardA - boardB;
  return String(a.id).localeCompare(String(b.id));
};

export function TournamentManagement({ tournament, onMatchStart, onBack, onDeleteTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Player names open the player's profile (career stats, history, form)
  const renderPlayerLink = (player, className = '') => {
    if (!player?.id) return <span className={className}>{player?.name || t('common.unknown')}</span>;
    return (
      <button
        type="button"
        className={cn('font-medium text-foreground hover:underline', className)}
        onClick={(e) => { e.stopPropagation(); navigate(`/player/${player.id}`); }}
        title={t('playerProfile.viewProfile')}
      >
        {player.name}
      </button>
    );
  };
  
  // Valid tabs (will be filtered for playoff-only tournaments)
  const validTabs = ['groups', 'matches', 'standings', 'playoffs', 'statistics', 'liveMatches', 'scorers', 'summary'];
  
  // Initialize activeTab from URL or default
  const getInitialTab = () => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      return tabFromUrl;
    }
    // For completed tournaments, default to summary tab
    if (tournament?.status === 'completed') {
      return 'summary';
    }
    // For playoff-only tournaments, default to playoffs tab
    if (tournament?.tournamentType === 'playoff_only') {
      return 'playoffs';
    }
    return 'groups';
  };
  
  const [activeTab, setActiveTab] = useState(() => getInitialTab());
  const [showEditSettings, setShowEditSettings] = useState(false);
  // Targets for "share as image" (ExportMenu)
  const standingsRef = useRef(null);
  const bracketRef = useRef(null);
  const [editingMatch, setEditingMatch] = useState(null); // Match being edited
  const [correctingMatch, setCorrectingMatch] = useState(null); // Match whose result is being corrected
  const [liveMatches, setLiveMatches] = useState([]);
  const [matchStatistics, setMatchStatistics] = useState(null); // Match to show statistics for
  const liveMatchesRef = useRef([]);
  const [favoriteMatchIds, setFavoriteMatchIds] = useState(() => {
    try {
      const saved = localStorage.getItem('darts-favorite-matches');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const modalOpenRef = useRef(false); // Track if any modal is open
  const activeTabRef = useRef(activeTab); // Track active tab for interval callback
  // Refs mirroring tournament scope so the realtime channel handlers (which only
  // re-subscribe on tournament id) never read stale group/playoff id sets.
  const tournamentGroupIdsRef = useRef(new Set());
  const tournamentPlayoffIdsRef = useRef(new Set());
  const applyRemoteMatchResultRef = useRef(null);
  const [matchGroupFilter, setMatchGroupFilter] = useState('all'); // Filter by group
  const [matchPlayerFilter, setMatchPlayerFilter] = useState(''); // Filter by player name
  const [bracketViewMode, setBracketViewMode] = useState('detailed'); // 'detailed' or 'compact'
  const [matchToConfirm, setMatchToConfirm] = useState(null); // Match waiting for start confirmation
  const [selectedQualifierIds, setSelectedQualifierIds] = useState([]);
  const [qualifiersTouched, setQualifiersTouched] = useState(false);
  
  // Deduplicate groups - ensure each group appears only once
  const uniqueGroups = useMemo(() => {
    if (!tournament?.groups) return [];
    const seen = new Map();
    return tournament.groups.filter(group => {
      if (seen.has(group.id)) {
        return false;
      }
      seen.set(group.id, true);
      return true;
    });
  }, [tournament?.groups]);

  // Suggested scorers ("Automatic scorer assignment") — computed, not stored
  const autoScorersEnabled = tournament?.groupSettings?.autoScorerAssignment === true;
  const groupScorerByMatch = useMemo(
    () => (autoScorersEnabled ? assignGroupScorers(tournament?.groups) : new Map()),
    [autoScorersEnabled, tournament?.groups]
  );
  const playoffScorerByMatch = useMemo(
    () => (autoScorersEnabled ? assignPlayoffScorers(tournament?.playoffs) : new Map()),
    [autoScorersEnabled, tournament?.playoffs]
  );

  // Fast lookup sets for current tournament scope
  const tournamentGroupIds = useMemo(() => new Set(uniqueGroups?.map(g => g.id) || []), [uniqueGroups]);
  const tournamentPlayoffIds = useMemo(() => new Set(tournament.playoffMatches?.map(m => m.id) || []), [tournament.playoffMatches]);
  const hasTournamentStarted = useMemo(() => {
    const groupMatches = uniqueGroups?.flatMap(g => g.matches || []) || [];
    const playoffMatches = tournament.playoffMatches || [];
    return [...groupMatches, ...playoffMatches].some(m => m?.status && m.status !== 'pending');
  }, [uniqueGroups, tournament.playoffMatches]);
  // Live legs/board/leg lookup for the match cards (fed by the realtime channel below)
  const liveInfoById = useMemo(() => new Map(liveMatches.map(m => [m.id, m])), [liveMatches]);
  
  // Update URL when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    activeTabRef.current = tab; // Update ref immediately
    setSearchParams({ tab });
  };
  
  // Sync activeTab with URL on mount and when URL changes (but not when we programmatically change it)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      activeTabRef.current = tabFromUrl; // Update ref
    } else if (!tabFromUrl && activeTab !== 'groups') {
      // If no tab in URL and we're not on default, update URL
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep ref in sync with activeTab state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  useEffect(() => {
    try {
      localStorage.setItem('darts-favorite-matches', JSON.stringify([...favoriteMatchIds]));
    } catch { /* quota exceeded */ }
  }, [favoriteMatchIds]);

  const toggleFavoriteMatch = useCallback((matchId) => {
    setFavoriteMatchIds(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }, []);

  // Sync ref with state whenever state changes
  useEffect(() => {
    liveMatchesRef.current = liveMatches;
  }, [liveMatches]);

  // Keep tournament-scope refs current for the realtime channel handlers
  useEffect(() => {
    tournamentGroupIdsRef.current = tournamentGroupIds;
  }, [tournamentGroupIds]);
  useEffect(() => {
    tournamentPlayoffIdsRef.current = tournamentPlayoffIds;
  }, [tournamentPlayoffIds]);
  // NOTE: the applyRemoteMatchResult ref-sync effect lives AFTER the
  // useTournament() destructuring below — referencing it here would hit the
  // temporal dead zone (the const isn't initialized until later in render).

  // Track modal state in ref so interval callback can check it
  useEffect(() => {
    modalOpenRef.current = showEditSettings || !!editingMatch || !!matchStatistics || !!matchToConfirm;
  }, [showEditSettings, editingMatch, matchStatistics, matchToConfirm]);

  useEffect(() => {
    setQualifiersTouched(false);
    setSelectedQualifierIds([]);
  }, [tournament?.id]);

  // Auto-switch to summary tab when tournament is completed
  const prevTournamentStatusRef = useRef(tournament?.status);
  useEffect(() => {
    const prev = prevTournamentStatusRef.current;
    const current = tournament?.status;
    prevTournamentStatusRef.current = current;
    // Only auto-switch if status just changed to 'completed' (not on initial load)
    if (current === 'completed' && prev && prev !== 'completed') {
      handleTabChange('summary');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.status]);

  // Handler for starting a match - shows confirmation dialog first
  const handleStartMatchRequest = (matchData) => {
    // Belt and braces: the buttons below are hidden for non-scorers, but
    // the database would discard everything such a user scored.
    if (canScore !== true) {
      toast.info(t('management.notScorerHint'));
      return;
    }
    setMatchToConfirm(matchData);
  };

  // Confirm and start the match
  const confirmStartMatch = () => {
    if (matchToConfirm) {
      onMatchStart(matchToConfirm);
      setMatchToConfirm(null);
    }
  };

  // Cancel match start
  const cancelStartMatch = () => {
    setMatchToConfirm(null);
  };
  
  const [tournamentSettings, setTournamentSettings] = useState({
    legsToWin: tournament.legsToWin || 3,
    startingScore: tournament.startingScore || 501,
    defaultScoringMode: tournament.defaultScoringMode || 'dart',
    // Use the tournament's real group settings — a hardcoded default here
    // silently reset type/value (and any extra flags) on every settings save.
    groupSettings: tournament.groupSettings || {
      type: 'groups',
      value: 2
    },
    standingsCriteriaOrder: tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
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
        playersPerGroup: 1,
        seedingMethod: tournament.playoffSettings?.seedingMethod || 'standard',
        groupMatchups: tournament.playoffSettings?.groupMatchups || [],
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
  const { isMatchLive, toggleFavoriteGroup, isGroupFavorite, getFavoriteGroups } = useLiveMatch();
  const { isAdmin } = useAdmin();
  const isOwner = user && tournament?.userId && user.id === tournament.userId;
  const canManage = isAdmin || isOwner;

  // Whether this user may count matches: managers always, everyone else only
  // when listed as a tournament/league scorer (can_score_tournament in the
  // DB). null = not resolved yet. The RLS policies enforce the same rule, so
  // showing "Start match" to anyone else let them score a match whose result
  // the database then silently refused to save.
  const [canScore, setCanScore] = useState(canManage ? true : null);
  useEffect(() => {
    if (!user || !tournament?.id) {
      setCanScore(false);
      return;
    }
    if (canManage) {
      setCanScore(true);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const allowed = await tournamentService.canScore(tournament.id);
      if (!cancelled) setCanScore(allowed);
    };
    check();
    // Re-check when the tab comes back into view — the manager may have
    // added this user as a scorer in the meantime.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, tournament?.id, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manager nudge: how many people besides the manager can count. Tournament
  // and league scorers are tracked separately because the Scorers tab only
  // edits the former. null = unknown (loading or lookup failed) — no nudge.
  const [tournamentScorerCount, setTournamentScorerCount] = useState(null);
  const [leagueScorerCount, setLeagueScorerCount] = useState(null);
  const scorerCount = tournamentScorerCount === null || leagueScorerCount === null
    ? null
    : tournamentScorerCount + leagueScorerCount;
  const nudgeDismissKey = tournament?.id ? `dartlead-scorer-nudge-dismissed:${tournament.id}` : null;
  const [isScorerNudgeDismissed, setIsScorerNudgeDismissed] = useState(() => {
    try {
      return nudgeDismissKey ? localStorage.getItem(nudgeDismissKey) === '1' : false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!canManage || !tournament?.id || tournament.status === 'completed') {
      setTournamentScorerCount(null);
      setLeagueScorerCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tournamentScorers = await tournamentService.listScorers(tournament.id);
        const leagueScorers = tournament.leagueId
          ? await leagueService.listScorers(tournament.leagueId)
          : [];
        if (cancelled) return;
        setTournamentScorerCount(tournamentScorers.length);
        setLeagueScorerCount(leagueScorers.length);
      } catch {
        if (cancelled) return;
        setTournamentScorerCount(null);
        setLeagueScorerCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [canManage, tournament?.id, tournament?.leagueId, tournament?.status]);

  const dismissScorerNudge = () => {
    setIsScorerNudgeDismissed(true);
    try {
      if (nudgeDismissKey) localStorage.setItem(nudgeDismissKey, '1');
    } catch {
      // localStorage unavailable — the nudge just comes back next visit
    }
  };

  const showScorerNudge = canManage && scorerCount === 0 && !isScorerNudgeDismissed
    && tournament?.status !== 'completed' && activeTab !== 'scorers';

  const { startPlayoffs: contextStartPlayoffs, resetPlayoffs: contextResetPlayoffs, updateTournamentSettings, getTournament, applyRemoteMatchResult } = useTournament();

  // Keep the apply-remote fn in a ref for the realtime channel handlers.
  // Placed here (after useTournament) to avoid a temporal-dead-zone error.
  useEffect(() => {
    applyRemoteMatchResultRef.current = applyRemoteMatchResult;
  }, [applyRemoteMatchResult]);

  // Update tournamentSettings when tournament prop changes (e.g., after reload from DB)
  useEffect(() => {
    if (tournament) {
      setTournamentSettings({
        legsToWin: tournament.legsToWin || 3,
        startingScore: tournament.startingScore || 501,
        defaultScoringMode: tournament.defaultScoringMode || 'dart',
        groupSettings: tournament.groupSettings || {
          type: 'groups',
          value: 2
        },
        standingsCriteriaOrder: tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
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
            qualificationMode: 'perGroup', // 'perGroup' or 'totalPlayers'
            playersPerGroup: 1,
            totalPlayersToAdvance: 8,
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
  }, [tournament?.id, tournament?.standingsCriteriaOrder, tournament?.playoffSettings]);

  // NOTE: The previous 8-second full-tournament refetch poll was removed here.
  // It called getTournament() which replaced the entire currentTournament object
  // reference, re-rendering this whole component and causing visible flicker.
  // Cross-device updates are now handled granularly:
  //   - Live Matches tab: the realtime channel below updates the separate
  //     `liveMatches` array (never the tournament object).
  //   - Playoffs / Standings tabs: the realtime channel detects matches that
  //     transition to 'completed' and applies them via applyRemoteMatchResult,
  //     which mutates only the affected bracket/standings subtrees.

  // Simple function to check if match exists in localStorage (started on this device)
  const isMatchInLocalStorage = (matchId) => {
    const savedState = localStorage.getItem(`match-state-${matchId}`);
    return savedState !== null;
  };

  // Enhanced function to check if match should be considered "live" (either in live context or localStorage)
  const isMatchActuallyLive = (matchId) => {
    // First check the match status - if it's completed, it's not live
    // Check both group matches and playoff matches
    const groupMatch = tournament?.groups?.flatMap(g => g.matches || []).find(m => m.id === matchId);
    const playoffMatch = tournament?.playoffMatches?.find(m => m.id === matchId);
    const match = groupMatch || playoffMatch;
    
    if (match?.status === 'completed') {
      return false;
    }
    // NOTE: a 'pending' status must NOT short-circuit here, and must never
    // delete the saved state — the cached tournament can be stale (the scorer
    // started the match and came back before any refetch), and deleting from
    // this render path destroyed their in-progress match. Real progress in
    // localStorage wins below; a truly fresh pending match has none.

    // Then check if it's in the live matches context
    if (isMatchLive(matchId)) {
      return true;
    }

    // If not in live context, check if it exists in localStorage and is not completed
    const savedState = localStorage.getItem(`match-state-${matchId}`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Consider it live if it's not completed and has some progress
        return !parsed.matchComplete && (parsed.currentLeg > 1 || parsed.matchStarter !== null);
      } catch (error) {
        console.error('Error parsing saved match state:', error);
        return false;
      }
    }
    
    return false;
  };

  // Number of players in a bracket round, used to look up that round's leg count.
  // The 3rd-place match is stored inside the FINAL round's match list, so counting
  // raw matches reports the final as a 4-player round and applies the semi-final
  // leg count to both the final and the 3rd-place match.
  const getRoundSize = (round) => {
    const bracketMatches = (round?.matches || []).filter(m => !m.isThirdPlaceMatch).length;
    return Math.max(2, bracketMatches * 2);
  };

  // Get legs to win for a specific playoff round based on number of players in that round
  const getPlayoffLegsToWin = (roundSize) => {
    if (!tournament?.playoffSettings) {
      return 3; // Default fallback
    }
    
    // If new structure exists, use it
    if (tournament.playoffSettings.legsToWinByRound) {
      return tournament.playoffSettings.legsToWinByRound[roundSize] || 3;
    }
    
    // Fallback to old structure for backward compatibility
    if (tournament.playoffSettings.playoffLegsToWin) {
      return tournament.playoffSettings.playoffLegsToWin;
    }
    
    return 3; // Default
  };

  // Update playoff match players
  const updatePlayoffMatchPlayers = async (matchId, player1, player2) => {
    if (!tournament?.playoffs?.rounds) return;
    try {
      // Atomic in the database: locks the tournament row and rewrites only this
      // match (players, pending status, cleared result) plus its matches row.
      // Writing the whole bracket from here raced with boards finishing
      // matches at the same moment.
      await tournamentService.setPlayoffMatchPlayers(tournament.id, matchId, player1, player2);
      await getTournament(tournament.id);
      setEditingMatch(null);
      toast.success(t('management.playoffMatchUpdated'));
    } catch (error) {
      console.error('Error updating playoff match:', error);
      toast.error(t('management.failedToUpdatePlayoffMatch'));
    }
  };

  // Generate playoff rounds if they don't exist
  // Rounds should start at the appropriate level based on number of qualifiers
  // Top 8 = Quarterfinals, Top 16 = Round of 16, etc.
  const generatePlayoffRounds = useCallback((totalQualifiers, includeThirdPlaceMatch = true) => {
    const rounds = [];
    // Round up to next power of 2 for proper bracket with byes
    let bracketSize = 1;
    while (bracketSize < totalQualifiers) bracketSize *= 2;
    let currentRoundSize = bracketSize;
    let roundNumber = 1;
    let hasSemifinals = false;

    // Generate rounds from first round to final
    while (currentRoundSize > 1) {
      const numMatches = currentRoundSize / 2;
      
      const round = {
        id: generateId(),
        name: getRoundNameByMatches(numMatches, rounds.length),
        matches: [],
        isComplete: false
      };

      // Create matches for this round
      for (let i = 0; i < numMatches; i++) {
        round.matches.push({
          id: generateId(),
          player1: null,
          player2: null,
          status: 'pending',
          result: null,
          isPlayoff: true,
          playoffRound: roundNumber,
          playoffMatchNumber: i + 1
        });
      }

      rounds.push(round);
      
      // Track if we have a semifinals (will need 3rd place match)
      if (numMatches === 2) {
        hasSemifinals = true;
      }
      
      currentRoundSize = numMatches;
      roundNumber++;
    }

    // Add 3rd place match if enabled and we have semifinals (at least 4 qualifiers)
    if (includeThirdPlaceMatch && hasSemifinals && rounds.length >= 2) {
      const finalRound = rounds[rounds.length - 1];
      finalRound.matches.push({
        id: generateId(),
        player1: null,
        player2: null,
        status: 'pending',
        result: null,
        isPlayoff: true,
        playoffRound: roundNumber - 1,
        playoffMatchNumber: finalRound.matches.length + 1,
        isThirdPlaceMatch: true
      });
    }

    return rounds;
  }, []);

  // Apply a prepared seed-slot template, overriding the hardcoded group/standard
  // seeding below. resolveActiveTemplate picks, in order: a per-tournament custom
  // template (if its signature still matches), then a matching league-prepared
  // library preset keyed by (groups, bracket start). Returns the seeded firstRound,
  // or null so the caller falls through to automatic seeding.
  const applyCustomSeeding = useCallback((qualifyingPlayers, firstRound, tournament) => {
    const active = resolveActiveTemplate(tournament?.playoffSettings, tournament?.groups);
    if (!active) return null;

    const qualifyingIds = new Set((qualifyingPlayers || []).map(p => p?.id).filter(Boolean));

    // Build resolver maps.
    let playerByGroupRank = {};
    let playerBySeed = {};
    if (active.mode === 'global' || !(tournament?.groups?.length)) {
      // Global mode: qualifyingPlayers is already globally sorted (getQualifyingPlayers).
      (qualifyingPlayers || []).forEach((p, i) => { playerBySeed[i + 1] = p; });
    } else {
      const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
      tournament.groups.forEach(group => {
        if (!group?.standings) return;
        const sorted = sortStandingsByCriteria(group.standings, criteriaOrder);
        const ranked = sorted
          .map(s => s.player)
          .filter(p => p?.id && qualifyingIds.has(p.id));
        const byRank = {};
        ranked.forEach((p, i) => { byRank[i + 1] = p; });
        playerByGroupRank[group.name] = byRank;
      });
    }

    const resolve = (slot) => {
      if (!slot) return null;
      if (slot.seed != null) return playerBySeed[slot.seed] || null;
      if (slot.group != null && slot.rank != null) {
        return playerByGroupRank[slot.group]?.[slot.rank] || null;
      }
      return null;
    };

    const numMatches = firstRound.matches.length;
    for (let m = 0; m < numMatches; m++) {
      const match = firstRound.matches[m];
      match.player1 = resolve(active.slots[m * 2]);
      match.player2 = resolve(active.slots[m * 2 + 1]);
      match.status = 'pending';
    }

    console.log(`Applied seed template (${active.source}) to first round`);
    return firstRound;
  }, []);

  // Seed first round using standard tournament seeding or group-based seeding
  const seedFirstRound = useCallback((qualifyingPlayers, firstRound, tournament) => {
    if (!firstRound || !firstRound.matches || qualifyingPlayers.length === 0) {
      return firstRound;
    }

    // Custom seed-slot template takes precedence over all automatic seeding.
    const customSeeded = applyCustomSeeding(qualifyingPlayers, firstRound, tournament);
    if (customSeeded) return customSeeded;

    const numMatches = firstRound.matches.length;
    const totalPlayers = qualifyingPlayers.length;
    
    // For tournaments with groups, always use group-based seeding (Slovak Darts Association rules).
    // This ensures the best players from different groups are kept apart until as late as possible.
    // The seedingMethod setting is kept for backwards compatibility but no longer affects behavior
    // for groups_with_playoffs tournaments.
    const hasGroups = tournament?.groups && tournament.groups.length > 0;
    
    // Group-based seeding (automatic for all group tournaments)
    if (hasGroups) {
      let groupMatchups = tournament.playoffSettings?.groupMatchups;
      const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 1;
      const numGroups = tournament.groups.length;
      const isEvenGroups = numGroups % 2 === 0;
      
      // Auto-generate group matchups if not configured
      // Only use cross-group pairing for even number of groups (2, 4, 6, ...)
      // For odd groups (3, 5, ...) we use global seeding with group separation instead
      if (!groupMatchups || groupMatchups.length === 0) {
        const groupNames = tournament.groups.map(g => g.name);
        groupMatchups = [];

        if (isEvenGroups) {
          if (groupNames.length === 2) {
            groupMatchups.push({ group1: groupNames[0], group2: groupNames[1] });
          } else {
            // Crossover: first half vs second half (reversed)
            const halfLength = Math.floor(groupNames.length / 2);
            for (let i = 0; i < halfLength; i++) {
              groupMatchups.push({
                group1: groupNames[i],
                group2: groupNames[groupNames.length - 1 - i]
              });
            }
          }
          console.log('Auto-generated cross-group matchups:', groupMatchups);
        } else {
          console.log(`Odd number of groups (${numGroups}), using global seeding with group separation`);
        }
      }
      
      // Set of players who actually qualified for the playoffs. We organize the
      // bracket from THESE players (in each group's seeded order) rather than from
      // the raw playersPerGroup setting — this is what makes "top N" brackets seed
      // correctly even when groups have fewer players than N (the missing top seeds
      // simply become byes). qualifyingPlayers already respects the qualification
      // mode (perGroup vs totalPlayers).
      const qualifyingIds = new Set((qualifyingPlayers || []).map(p => p?.id).filter(Boolean));

      // Get players organized by group
      const playersByGroup = {};
      tournament.groups.forEach(group => {
        if (group.standings && group.standings.length > 0) {
          const sortedStandings = [...group.standings].sort((a, b) => {
            // Use tournament's standings criteria order
            const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
            for (const criterion of criteriaOrder) {
              let comparison = 0;
              switch (criterion) {
                case 'matchesWon':
                  comparison = b.matchesWon - a.matchesWon;
                  break;
                case 'legDifference': {
                  const legDiffA = a.legsWon - a.legsLost;
                  const legDiffB = b.legsWon - b.legsLost;
                  comparison = legDiffB - legDiffA;
                  break;
                }
                case 'average':
                  comparison = (b.average || 0) - (a.average || 0);
                  break;
                case 'headToHead': {
                  const aWinsVsB = a.headToHeadWins?.[b.player.id] || 0;
                  const bWinsVsA = b.headToHeadWins?.[a.player.id] || 0;
                  comparison = bWinsVsA - aWinsVsB;
                  break;
                }
              }
              if (comparison !== 0) return comparison;
            }
            return 0;
          });
          
          // Take this group's qualifying players, in seeded order. Falls back to the
          // playersPerGroup slice if qualifying info isn't available (defensive).
          const qualifiedFromGroup = sortedStandings
            .map(s => s.player)
            .filter(p => p?.id && qualifyingIds.has(p.id));
          const topPlayers = qualifiedFromGroup.length > 0
            ? qualifiedFromGroup
            : sortedStandings.slice(0, playersPerGroup).map(s => s.player);
          playersByGroup[group.name] = topPlayers;
        }
      });
      
      // Create matches based on group matchups using official Slovak Darts Association bracket seeding.
      // The goal is to keep the best players from meeting each other until as late as possible
      // in the playoff bracket.
      //
      // For 2 groups with 4 advancing each (8 players total - "Pavúk na 8 hráčov"):
      //   Match 0: A1 vs B4  (top half)
      //   Match 1: A3 vs B2  (top half)
      //   Match 2: A2 vs B3  (bottom half)
      //   Match 3: A4 vs B1  (bottom half)
      //
      // Semifinal progression (via standard bracket propagation):
      //   SF 0 (top half): Winner(A1vB4) vs Winner(A3vB2)
      //   SF 1 (bottom half): Winner(A2vB3) vs Winner(A4vB1)
      // Final: Winner(SF0) vs Winner(SF1) -> A1 and B1 can only meet here
      
      // Generate bracket match order for N cross-group pairings.
      // 
      // The goal: ensure the best players from each group are on OPPOSITE halves of
      // the bracket so they can only meet in the final.
      //
      // For N pairings (0-indexed by strength: 0=strongest, N-1=weakest):
      //   - Pairing 0 (A1vB4) and Pairing 1 (A2vB3) go to opposite halves
      //   - Within each half, the strongest pairing faces the weakest
      //
      // For 4 pairings, the official bracket order is [0, 2, 1, 3]:
      //   Match 0: Pairing 0 (A1vB4) \
      //   Match 1: Pairing 2 (A3vB2) / -> SF 0 (top half)
      //   Match 2: Pairing 1 (A2vB3) \
      //   Match 3: Pairing 3 (A4vB1) / -> SF 1 (bottom half)
      //
      // For 2 pairings: [0, 1] (A1vB2 vs A2vB1, winners meet in final)
      //
      // General algorithm for any power-of-2 number of pairings:
      //   Recursively split into halves, placing seed i and seed (i+1) on opposite halves
      //   (where seeds are consecutive pairs: (0,1), (2,3), (4,5), etc.)
      const generateCrossGroupBracketOrder = (n) => {
        if (n <= 0) return [];
        if (n === 1) return [0];
        if (n === 2) return [0, 1];
        
        // Round up to nearest power of 2
        const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
        
        // Recursive helper: produces bracket slot order for `size` seeds (0-indexed).
        // Key property: seed 0 and seed 1 end up on opposite halves,
        // seed 2 and seed 3 on opposite halves, etc.
        const helper = (size) => {
          if (size === 2) return [0, 1];
          
          const half = size / 2;
          const subOrder = helper(half);
          
          // For each position in the sub-bracket, we place two seeds:
          // - Seed (2*s) goes to the top half at position corresponding to subOrder
          // - Seed (2*s+1) goes to the bottom half (mirrored position)
          const topHalf = subOrder.map(s => s * 2);        // Even seeds: 0, 2, 4, ...
          const bottomHalf = subOrder.map(s => s * 2 + 1); // Odd seeds: 1, 3, 5, ...
          
          return [...topHalf, ...bottomHalf];
        };
        
        const positions = helper(bracketSize);
        // Filter out positions that exceed our actual number of pairings
        return positions.filter(p => p < n);
      };
      
      let matchIndex = 0;

      // For 4 groups with 4 advancing each (16 players), use the fixed bracket template.
      // This ensures group winners are in separate quarters and same-group players
      // can't meet until the semi-finals.
      //
      // Bracket structure:
      //   Match 0: A1-B4 \
      //   Match 1: C3-D2 / → QF1 → \
      //   Match 2: C2-A3 \           → SF1 → \
      //   Match 3: D4-B1 / → QF2 → /         \
      //                                        → Final
      //   Match 4: C1-A4 \                    /
      //   Match 5: D3-B2 / → QF3 → \        /
      //   Match 6: A2-B3 \           → SF2 →/
      //   Match 7: C4-D1 / → QF4 → /
      const groupNames = tournament.groups.map(g => g.name);
      const use4GroupTemplate = numGroups === 4 && playersPerGroup >= 4;

      if (use4GroupTemplate) {
        const A = playersByGroup[groupNames[0]] || [];
        const B = playersByGroup[groupNames[1]] || [];
        const C = playersByGroup[groupNames[2]] || [];
        const D = playersByGroup[groupNames[3]] || [];

        const bracketTemplate = [
          [A, 0, B, 3], // A1 vs B4
          [C, 2, D, 1], // C3 vs D2
          [C, 1, A, 2], // C2 vs A3
          [D, 3, B, 0], // D4 vs B1
          [C, 0, A, 3], // C1 vs A4
          [D, 2, B, 1], // D3 vs B2
          [A, 1, B, 2], // A2 vs B3
          [C, 3, D, 0], // C4 vs D1
        ];

        bracketTemplate.forEach(([g1, idx1, g2, idx2]) => {
          if (matchIndex >= numMatches) return;
          const player1 = g1[idx1];
          const player2 = g2[idx2];
          if (player1 && player2) {
            const match = firstRound.matches[matchIndex];
            match.player1 = player1;
            match.player2 = player2;
            match.status = 'pending';
            matchIndex++;
          }
        });
      } else {
        // For 2 groups (and other even, non-4 configurations), seed the bracket at
        // its FULL size — not just the number of players that happened to qualify.
        //
        // Example: 2 groups, "top 16" playoffs (8 first-round matches) but only 6
        // players qualified per group. We still seed it as an 8-per-group draw:
        //   A1-B8, A2-B7, ... A8-B1
        // Seeds 7 and 8 don't exist, so those slots become byes — the top seeds get
        // a free pass to the next round, exactly like a standard seeded bracket.
        //
        // Each cross-group matchup fills an equal share of the first-round matches.
        const numMatchups = groupMatchups.length || 1;
        const seedsPerGroup = Math.floor(numMatches / numMatchups);

        if (seedsPerGroup > 0) {
          groupMatchups.forEach(matchup => {
            const group1Players = playersByGroup[matchup.group1] || [];
            const group2Players = playersByGroup[matchup.group2] || [];

            // Build pairings for the FULL bracket size (A_i vs B_(N-1-i)), regardless
            // of how many players actually exist. A missing seed becomes null = bye.
            const crossPairings = [];
            for (let i = 0; i < seedsPerGroup; i++) {
              crossPairings.push({ g1Idx: i, g2Idx: seedsPerGroup - 1 - i });
            }

            const bracketOrder = generateCrossGroupBracketOrder(seedsPerGroup);

            bracketOrder.forEach(pairingIdx => {
              if (matchIndex >= numMatches) return;
              const pairing = crossPairings[pairingIdx];
              if (!pairing) return;

              const player1 = group1Players[pairing.g1Idx] || null;
              const player2 = group2Players[pairing.g2Idx] || null;

              // Only skip a slot if BOTH seeds are missing. A single player is kept
              // as a bye and advanced via the "Advance Player" button.
              if (!player1 && !player2) return;

              const match = firstRound.matches[matchIndex];
              match.player1 = player1;
              match.player2 = player2;
              match.status = 'pending';
              matchIndex++;
            });
          });
        }
      }

      // Check if cross-group seeding filled every first-round match.
      // A match counts as assigned even if it holds a bye (exactly one player).
      const assignedMatches = firstRound.matches.filter(m => m.player1 || m.player2).length;
      if (assignedMatches >= numMatches) {
        console.log(`Cross-group bracket seeding assigned ${assignedMatches} matches`);
        return firstRound;
      }
      
      // Cross-group pairing didn't fill all matches (odd number of groups, or misconfigured matchups).
      // Use global seeding with group separation instead:
      // 1. Rank all qualifying players globally (they come pre-sorted from getQualifyingPlayers)
      // 2. Place them in standard bracket positions (1v8, 4v5, 2v7, 3v6)
      // 3. Detect same-group conflicts in first-round matchups
      // 4. Swap players between matches to eliminate conflicts where possible
      console.log(`Cross-group seeding assigned ${assignedMatches}/${numMatches}, using global seeding with group separation`);
      
      // Clear any partial assignments from the failed cross-group attempt
      firstRound.matches.forEach(m => {
        m.player1 = null;
        m.player2 = null;
        m.status = 'pending';
      });
      
      // Build player-to-group lookup from tournament data
      const playerGroupMap = {};
      tournament.groups.forEach(group => {
        if (group.standings) {
          group.standings.forEach(s => {
            if (s.player?.id) {
              playerGroupMap[s.player.id] = group.id || group.name;
            }
          });
        }
      });
      
      // Use the standard bracket seeding algorithm (same as the one below for 'standard' method)
      const genBracketPos = (n) => {
        const bSize = Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
        const h = (size) => {
          if (size === 1) return [1];
          if (size === 2) return [1, 2];
          const result = [];
          const half = size / 2;
          const top = h(half);
          const bottom = h(half);
          for (let i = 0; i < half; i++) {
            result.push(top[i]);
            result.push(bottom[i] + half);
          }
          return result;
        };
        return h(bSize);
      };
      
      const globalBracketSize = numMatches * 2;
      const bracketPos = genBracketPos(globalBracketSize);

      // Create initial seeded bracket: pairs[i] = [seed1, seed2]
      // Standard bracket: position[0] vs position[N-1], position[1] vs position[N-2], etc.
      // Seeds beyond totalPlayers become byes (handled after conflict resolution)
      const seededSlots = [];
      const byeMatches = [];
      for (let i = 0; i < numMatches; i++) {
        const s1 = bracketPos[i];
        const s2 = bracketPos[globalBracketSize - 1 - i];
        const p1Valid = s1 >= 1 && s1 <= totalPlayers;
        const p2Valid = s2 >= 1 && s2 <= totalPlayers;

        if (p1Valid && p2Valid && s1 !== s2) {
          seededSlots.push({
            matchIdx: i,
            player1Idx: s1 - 1,
            player2Idx: s2 - 1
          });
        } else {
          // Bye match — one or no real player
          const match = firstRound.matches[i];
          match.player1 = p1Valid ? (qualifyingPlayers[s1 - 1] || null) : null;
          match.player2 = p2Valid ? (qualifyingPlayers[s2 - 1] || null) : null;
          match.seed1 = s1;
          match.seed2 = s2;
          match.status = 'pending';
          byeMatches.push(i);
        }
      }
      
      // Detect same-group conflicts and try to resolve by swapping
      // Strategy: for each match with a same-group conflict, try to swap one player
      // with a player from another match (preferring swaps that don't create new conflicts)
      const getGroup = (playerIdx) => {
        const player = qualifyingPlayers[playerIdx];
        return player?.id ? (playerGroupMap[player.id] || null) : null;
      };
      
      const hasConflict = (slot) => {
        const g1 = getGroup(slot.player1Idx);
        const g2 = getGroup(slot.player2Idx);
        return g1 && g2 && g1 === g2;
      };
      
      // Try swapping players between conflicting and non-conflicting matches
      let improved = true;
      let maxIterations = seededSlots.length * seededSlots.length; // Prevent infinite loops
      while (improved && maxIterations > 0) {
        improved = false;
        maxIterations--;
        
        for (let i = 0; i < seededSlots.length; i++) {
          if (!hasConflict(seededSlots[i])) continue;
          
          // This match has a same-group conflict, try swapping player2 with player2 from another match
          for (let j = 0; j < seededSlots.length; j++) {
            if (i === j) continue;
            
            // Try swapping player2 of match i with player2 of match j
            const origConflictsI = hasConflict(seededSlots[i]) ? 1 : 0;
            const origConflictsJ = hasConflict(seededSlots[j]) ? 1 : 0;
            const origTotal = origConflictsI + origConflictsJ;
            
            // Temporarily swap
            const temp = seededSlots[i].player2Idx;
            seededSlots[i].player2Idx = seededSlots[j].player2Idx;
            seededSlots[j].player2Idx = temp;
            
            const newConflictsI = hasConflict(seededSlots[i]) ? 1 : 0;
            const newConflictsJ = hasConflict(seededSlots[j]) ? 1 : 0;
            const newTotal = newConflictsI + newConflictsJ;
            
            if (newTotal < origTotal) {
              // Swap reduced conflicts, keep it
              improved = true;
              break;
            } else {
              // Swap didn't help, revert
              seededSlots[j].player2Idx = seededSlots[i].player2Idx;
              seededSlots[i].player2Idx = temp;
            }
          }
          
          if (improved) break; // Restart the outer loop after a successful swap
        }
      }
      
      // Also try swapping player1 with player1 if conflicts remain
      improved = true;
      maxIterations = seededSlots.length * seededSlots.length;
      while (improved && maxIterations > 0) {
        improved = false;
        maxIterations--;
        
        for (let i = 0; i < seededSlots.length; i++) {
          if (!hasConflict(seededSlots[i])) continue;
          
          for (let j = 0; j < seededSlots.length; j++) {
            if (i === j) continue;
            
            const origTotal = (hasConflict(seededSlots[i]) ? 1 : 0) + (hasConflict(seededSlots[j]) ? 1 : 0);
            
            const temp = seededSlots[i].player1Idx;
            seededSlots[i].player1Idx = seededSlots[j].player1Idx;
            seededSlots[j].player1Idx = temp;
            
            const newTotal = (hasConflict(seededSlots[i]) ? 1 : 0) + (hasConflict(seededSlots[j]) ? 1 : 0);
            
            if (newTotal < origTotal) {
              improved = true;
              break;
            } else {
              seededSlots[j].player1Idx = seededSlots[i].player1Idx;
              seededSlots[i].player1Idx = temp;
            }
          }
          
          if (improved) break;
        }
      }
      
      // Assign the (possibly swapped) seeding to matches
      const remainingConflicts = seededSlots.filter(s => hasConflict(s)).length;
      if (remainingConflicts > 0) {
        console.log(`Global seeding with group separation: ${remainingConflicts} same-group matchups could not be avoided`);
      } else {
        console.log('Global seeding with group separation: all same-group conflicts resolved');
      }
      
      seededSlots.forEach(slot => {
        const match = firstRound.matches[slot.matchIdx];
        match.player1 = qualifyingPlayers[slot.player1Idx] || null;
        match.player2 = qualifyingPlayers[slot.player2Idx] || null;
        match.seed1 = slot.player1Idx + 1;
        match.seed2 = slot.player2Idx + 1;
        match.status = 'pending';
      });
      
      return firstRound;
    }
    
    // Standard tournament bracket seeding (default)
    // Standard bracket seeding pattern:
    // For 16 players: 1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11
    // Algorithm: Recursively place seeds in bracket positions using standard tournament structure
    const generateBracketPositions = (n) => {
      // Ensure we work with the nearest power of two to avoid infinite recursion on odd sizes
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));

      const helper = (size) => {
        if (size === 1) return [1];
        if (size === 2) return [1, 2];
      
      const result = [];
        const half = size / 2;
        const topHalf = helper(half);
        const bottomHalf = helper(half);
      
      for (let i = 0; i < half; i++) {
        result.push(topHalf[i]);
        result.push(bottomHalf[i] + half);
      }
      
      return result;
      };

      return helper(bracketSize);
    };
    
    // Generate bracket positions using the bracket size (power of 2)
    const bracketSize = numMatches * 2;
    const bracketPositions = generateBracketPositions(bracketSize);

    // Create pairs: position 0 with position N-1, position 1 with position N-2, etc.
    const pairs = [];
    for (let i = 0; i < numMatches; i++) {
      const pos1 = bracketPositions[i];
      const pos2 = bracketPositions[bracketSize - 1 - i];
      pairs.push([pos1, pos2]);
    }

    // Assign players to matches (seeds beyond totalPlayers become byes → null)
    for (let i = 0; i < numMatches && i < pairs.length; i++) {
      const match = firstRound.matches[i];
      const [seed1, seed2] = pairs[i];

      match.player1 = (seed1 >= 1 && seed1 <= totalPlayers) ? (qualifyingPlayers[seed1 - 1] || null) : null;
      match.player2 = (seed2 >= 1 && seed2 <= totalPlayers) ? (qualifyingPlayers[seed2 - 1] || null) : null;
      match.seed1 = seed1;
      match.seed2 = seed2;
      match.status = 'pending';
    }

    return firstRound;
  }, [applyCustomSeeding]);

  // Populate playoff bracket with qualifying players using proper seeding
  // Seeding: Best vs Worst, 2nd best vs 2nd worst, etc.
  const populatePlayoffBracket = useCallback((qualifyingPlayers, rounds) => {
    
    // Get the thirdPlaceMatch setting from tournament (default to true for backwards compatibility)
    const includeThirdPlaceMatch = tournament?.playoffSettings?.thirdPlaceMatch !== false;
    
    // If no rounds exist, generate them first.
    // When a valid (non-stale) custom seed template is present, honor its declared
    // bracketSize so a "top 16" template still builds a 16-slot bracket even if
    // fewer players qualified (the missing seeds become byes).
    if (!rounds || rounds.length === 0) {
      let generationSize = qualifyingPlayers.length;
      const active = resolveActiveTemplate(tournament?.playoffSettings, tournament?.groups);
      if (active && active.bracketSize) {
        generationSize = Math.max(generationSize, active.bracketSize);
      }
      rounds = generatePlayoffRounds(nextPow2(generationSize), includeThirdPlaceMatch);
    }
    
    const updatedRounds = [...rounds];
    
    // Automatically seed the first round
    if (updatedRounds.length > 0 && qualifyingPlayers.length > 0) {
      const firstRound = updatedRounds[0];
      // Only seed if first round matches don't have players assigned
      const needsSeeding = firstRound.matches.every(match => !match.player1 && !match.player2);
      
      if (needsSeeding) {
        updatedRounds[0] = seedFirstRound(qualifyingPlayers, firstRound, tournament);
      }
    }
    
    // Ensure all other rounds have proper status
    for (let i = 1; i < updatedRounds.length; i++) {
      updatedRounds[i].matches.forEach(match => {
        // Only reset if match doesn't already have players (preserve existing assignments)
        if (!match.player1 && !match.player2) {
          match.player1 = null;
          match.player2 = null;
          match.status = 'pending';
        }
      });
    }
    
    return updatedRounds;
  }, [generatePlayoffRounds, seedFirstRound, tournament]);

  // Note: Removed automatic playoff player assignment - playoffs should only start when user clicks button

  // Check if group stage is complete
  const isGroupStageComplete = () => {
    if (!tournament) return false;
    // For playoff-only tournaments, there is no group stage to complete
    if (tournament.tournamentType === 'playoff_only') {
      return true;
    }
    if (!tournament.groups) return false;
    return tournament.groups.every(group => 
      group.matches.every(match => match.status === 'completed')
    );
  };

  // Shared sorting function that uses the tournament's standingsCriteriaOrder
  // This ensures standings are sorted the SAME way everywhere (UI display, qualifying players, seeding)
  const sortStandingsByCriteria = (standings, criteriaOrder) => {
    return [...standings].sort((a, b) => {
      for (const criterion of criteriaOrder) {
        let comparison = 0;
        switch (criterion) {
          case 'matchesWon':
            comparison = (b.matchesWon || b.points / 3 || 0) - (a.matchesWon || a.points / 3 || 0);
            break;
          case 'legDifference': {
            const legDiffA = (a.legsWon || 0) - (a.legsLost || 0);
            const legDiffB = (b.legsWon || 0) - (b.legsLost || 0);
            comparison = legDiffB - legDiffA;
            break;
          }
          case 'average':
            comparison = (b.average || 0) - (a.average || 0);
            break;
          case 'headToHead': {
            const aWinsVsB = a.headToHeadWins?.[b.player?.id] || 0;
            const bWinsVsA = b.headToHeadWins?.[a.player?.id] || 0;
            comparison = bWinsVsA - aWinsVsB;
            break;
          }
        }
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  };

  const comparePlayersByCriteria = (a, b, criteriaOrder) => {
    for (const criterion of criteriaOrder) {
      let comparison = 0;
      switch (criterion) {
        case 'matchesWon':
          comparison = (b.matchesWon || b.points / 3 || 0) - (a.matchesWon || a.points / 3 || 0);
          break;
        case 'legDifference':
          comparison = ((b.legsWon || 0) - (b.legsLost || 0)) - ((a.legsWon || 0) - (a.legsLost || 0));
          break;
        case 'average':
          comparison = (b.average || 0) - (a.average || 0);
          break;
        case 'headToHead': {
          const aWinsVsB = a.headToHeadWins?.[b.player?.id] || 0;
          const bWinsVsA = b.headToHeadWins?.[a.player?.id] || 0;
          comparison = bWinsVsA - aWinsVsB;
          break;
        }
      }
      if (comparison !== 0) return comparison;
    }
    return (a.groupPosition || 0) - (b.groupPosition || 0);
  };

  // Get qualifying players based on group standings, sorted by performance for seeding
  const getQualifyingPlayers = () => {
    if (!tournament) return [];
    
    // For playoff-only tournaments, all registered players qualify,
    // sorted by name (or keep current order if you prefer)
    if (tournament.tournamentType === 'playoff_only') {
      const players = tournament.players || [];
      return [...players].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    if (!tournament.groups) return [];
    
    // Use the same criteria order as the UI standings display
    const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
    const qualificationMode = tournament.playoffSettings?.qualificationMode || 'perGroup';
    const allQualifyingPlayers = [];
    const allPlayersValue = 9999; // Special value to represent "all players"
    
    if (qualificationMode === 'totalPlayers') {
      // Mode: Total players to advance
      const totalPlayersToAdvance = tournament.playoffSettings?.totalPlayersToAdvance || 8;
      const numberOfGroups = tournament.groups.length;
      const playersPerGroup = Math.floor(totalPlayersToAdvance / numberOfGroups);
      const remainder = totalPlayersToAdvance % numberOfGroups;
      
      // First, collect players from each group (equal distribution)
      const playersByPosition = {}; // position -> array of players from all groups
      
      tournament.groups.forEach(group => {
        if (group.standings && group.standings.length > 0) {
          // Sort using the same criteria as the UI standings
          const sortedStandings = sortStandingsByCriteria(group.standings, criteriaOrder);
          
          // Take playersPerGroup players from this group
          for (let i = 0; i < playersPerGroup && i < sortedStandings.length; i++) {
            const standing = sortedStandings[i];
            allQualifyingPlayers.push({
              ...standing,
              groupPosition: i + 1,
              legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
              groupId: group.id
            });
          }
          
          // Store remaining players by position for remainder selection
          for (let i = playersPerGroup; i < sortedStandings.length; i++) {
            const standing = sortedStandings[i];
            const position = i + 1;
            if (!playersByPosition[position]) {
              playersByPosition[position] = [];
            }
            playersByPosition[position].push({
              ...standing,
              groupPosition: position,
              legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
              groupId: group.id
            });
          }
        }
      });
      
      // If there's a remainder, take the best players from the next position
      if (remainder > 0) {
        const nextPosition = playersPerGroup + 1;
        if (playersByPosition[nextPosition]) {
          // Sort remainder candidates using the same criteria
          const candidates = sortStandingsByCriteria(playersByPosition[nextPosition], criteriaOrder);
          
          // Take top 'remainder' players
          for (let i = 0; i < remainder && i < candidates.length; i++) {
            allQualifyingPlayers.push(candidates[i]);
          }
        }
      }
    } else {
      // Mode: Players per group (original logic)
      const playersPerGroup = tournament.playoffSettings?.playersPerGroup || 2;
      
      tournament.groups.forEach(group => {
        if (group.standings && group.standings.length > 0) {
          // Sort using the same criteria as the UI standings
          const sortedStandings = sortStandingsByCriteria(group.standings, criteriaOrder);
          
          // Take top N players from each group with their position info
          // If playersPerGroup is 9999 (all players), take all players
          const topPlayers = playersPerGroup === allPlayersValue 
            ? sortedStandings 
            : sortedStandings.slice(0, playersPerGroup);
          topPlayers.forEach((standing, index) => {
            allQualifyingPlayers.push({
              ...standing,
              groupPosition: index + 1, // 1st, 2nd, etc. in group
              legDifference: (standing.legsWon || 0) - (standing.legsLost || 0)
            });
          });
        }
      });
    }
    
    // Sort all qualifying players globally for seeding using the same criteria as UI standings,
    // with group position as final tiebreaker (1st in group > 2nd in group)
    allQualifyingPlayers.sort((a, b) => comparePlayersByCriteria(a, b, criteriaOrder));
    
    return allQualifyingPlayers.map(qp => qp.player);
  };

  const getRankedPlayersForSeeding = () => {
    if (!tournament) return [];

    if (tournament.tournamentType === 'playoff_only') {
      const players = tournament.players || [];
      return [...players].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!tournament.groups) return [];

    const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];
    const allPlayers = [];

    tournament.groups.forEach(group => {
      if (group.standings && group.standings.length > 0) {
        const sortedStandings = sortStandingsByCriteria(group.standings, criteriaOrder);
        sortedStandings.forEach((standing, index) => {
          allPlayers.push({
            ...standing,
            groupPosition: index + 1,
            legDifference: (standing.legsWon || 0) - (standing.legsLost || 0),
            groupId: group.id
          });
        });
      } else if (group.players && group.players.length > 0) {
        group.players.forEach((player, index) => {
          allPlayers.push({
            player,
            groupPosition: index + 1,
            legsWon: 0,
            legsLost: 0,
            matchesWon: 0,
            average: 0
          });
        });
      }
    });

    allPlayers.sort((a, b) => comparePlayersByCriteria(a, b, criteriaOrder));

    const seen = new Set();
    return allPlayers
      .filter(entry => {
        const playerId = entry.player?.id;
        if (!playerId || seen.has(playerId)) return false;
        seen.add(playerId);
        return true;
      })
      .map(entry => entry.player);
  };

  const areArraysEqual = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const defaultQualifyingPlayers = getQualifyingPlayers();
  const defaultQualifierIds = defaultQualifyingPlayers.map(player => player.id);
  const defaultQualifierIdSet = new Set(defaultQualifierIds);
  const rankedPlayersForSeeding = getRankedPlayersForSeeding();
  const activeQualifierIds = qualifiersTouched ? selectedQualifierIds : defaultQualifierIds;
  const activeQualifierIdSet = new Set(activeQualifierIds);
  const allTournamentPlayers = tournament?.players?.length
    ? tournament.players
    : (uniqueGroups?.flatMap(group => group.players || []) || []);

  const manualSelectedPlayers = (() => {
    if (selectedQualifierIds.length === 0) return [];
    const selectedSet = new Set(selectedQualifierIds);
    const rankedSelected = rankedPlayersForSeeding.filter(player => selectedSet.has(player.id));
    if (rankedSelected.length === selectedQualifierIds.length) {
      return rankedSelected;
    }
    const rankedIds = new Set(rankedSelected.map(player => player.id));
    const fallbackPlayers = allTournamentPlayers.filter(player => selectedSet.has(player.id) && !rankedIds.has(player.id));
    return [...rankedSelected, ...fallbackPlayers];
  })();

  const activeQualifyingPlayers = qualifiersTouched ? manualSelectedPlayers : defaultQualifyingPlayers;

  useEffect(() => {
    if (qualifiersTouched) return;
    setSelectedQualifierIds(prev => {
      if (areArraysEqual(prev, defaultQualifierIds)) return prev;
      return defaultQualifierIds;
    });
  }, [defaultQualifierIds, qualifiersTouched]);

  const toggleQualifierSelection = (playerId) => {
    setQualifiersTouched(true);
    setSelectedQualifierIds(prev => {
      const base = qualifiersTouched ? prev : defaultQualifierIds;
      const next = new Set(base);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return Array.from(next);
    });
  };

  const resetQualifierSelection = () => {
    setQualifiersTouched(false);
    setSelectedQualifierIds(defaultQualifierIds);
  };

  // Start playoffs by populating the bracket with qualifying players
  const startPlayoffs = async () => {
    if (!tournament) return;
    
    // For group-based tournaments, ensure group stage is complete first
    if (tournament.tournamentType !== 'playoff_only') {
      if (!isGroupStageComplete()) {
        toast.error(t('management.groupStageMustBeCompleted'));
        return;
      }
    }

    const qualifyingPlayers = activeQualifyingPlayers;
    if (qualifyingPlayers.length === 0) {
      toast.error(t('management.noQualifyingPlayers'));
      return;
    }

    // Create updated playoffs data
    const updatedPlayoffs = {
      ...tournament.playoffs,
      qualifyingPlayers,
      currentRound: 1,
      rounds: populatePlayoffBracket(qualifyingPlayers, tournament.playoffs?.rounds || [])
    };

    // Update tournament through context (now async and saves to database).
    // startPlayoffs throws if the DB write fails — never show success (or play
    // matches) against a bracket that only exists locally.
    try {
      await contextStartPlayoffs(updatedPlayoffs);
      toast.success(t('management.playoffsStartedSuccess', { count: qualifyingPlayers.length }));
    } catch (error) {
      console.error('Error starting playoffs:', error);
      toast.error(error.message);
    }
  };

  // Reset playoffs to allow restarting
  const handleResetPlayoffs = async () => {
    if (!tournament) return;
    
    const confirmMessage = t('management.confirmResetPlayoffs') || 
      'Are you sure you want to reset the playoffs? This will clear all playoff matches and results. Group stage data will be preserved.';
    
    if ((await confirmDialog(confirmMessage))) {
      try {
        await contextResetPlayoffs();
        toast.success(t('management.playoffsResetSuccess'));
      } catch (error) {
        console.error('Error resetting playoffs:', error);
        toast.error(t('management.failedToResetPlayoffs'));
      }
    }
  };

  const handleAdvanceBye = async (match) => {
    if (!tournament?.playoffs?.rounds) return;

    const player = match.player1 || match.player2;
    if (!player) return;

    // A bye is just a completed match with one player: the same database
    // function that scores real matches records it, places the player in the
    // next round and bumps currentRound — atomically, unlike the old
    // whole-bracket write from this device.
    try {
      await tournamentService.completePlayoffMatch(tournament.id, match.id, {
        matchId: match.id,
        winner: player.id,
        player1Id: match.player1?.id || null,
        player2Id: match.player2?.id || null,
        player1Name: match.player1?.name || null,
        player2Name: match.player2?.name || null,
        player1Legs: 0,
        player2Legs: 0,
        isBye: true,
        isPlayoff: true,
        playoffRound: match.playoffRound
      });
      await getTournament(tournament.id);
    } catch (error) {
      console.error('Error advancing bye:', error);
      toast.error(error.message);
    }
  };

  // Get round name based on number of matches, not players
  // This ensures standard names even with odd numbers of qualifiers
  const getRoundNameByMatches = (numMatches) => {
    // Determine round name based on number of matches
    // Standard tournament naming: 1 match = Final, 2 matches = Semifinals, 4 matches = Quarterfinals, etc.
    switch (numMatches) {
      case 1: return t('management.final');
      case 2: return t('management.semiFinals');
      case 4: return t('management.quarterFinals');
      case 8: return t('management.top16');
      case 16: return t('management.roundOf', { count: 32 });
      case 32: return t('management.roundOf', { count: 64 });
      default:
        // For other numbers, determine based on closest standard round
        if (numMatches === 3) {
          // 3 matches - closest to Quarterfinals (4 matches)
          return t('management.quarterFinals');
        } else if (numMatches <= 2) {
          return numMatches === 1 ? t('management.final') : t('management.semiFinals');
        } else if (numMatches <= 4) {
          return t('management.quarterFinals');
        } else if (numMatches <= 8) {
          return t('management.top16');
        } else {
          // For larger numbers, calculate Round of X
          const totalPlayers = numMatches * 2;
          return t('management.roundOf', { count: totalPlayers });
        }
    }
  };
  
  const handleDeleteTournament = async () => {
    if (!tournament) return;
    
    if (!canManage) {
      toast.error(t('management.onlyAdminsCanDelete'));
      return;
    }

    const confirmMessage = t('management.confirmDeleteTournament', { name: tournament.name });
    
    if ((await confirmDialog(confirmMessage))) {
      try {
        await onDeleteTournament(tournament.id);
        // Redirect to tournaments list after successful deletion
        onBack();
      } catch (error) {
        console.error('Error deleting tournament:', error);
        toast.error(t('management.failedToDeleteTournament'));
      }
    }
  };

  const updateSettings = async () => {
    try {
      await updateTournamentSettings(tournament.id, tournamentSettings);
      setShowEditSettings(false);
      toast.success(t('registration.settingsUpdatedSuccessfully'));
    } catch (error) {
      console.error('Error updating tournament settings:', error);
      toast.error(t('registration.failedToUpdateSettings'));
    }
  };

  // ── Admin match corrections (bracket-aware) ────────────────────────────────
  // Locate a match inside a playoffs.rounds structure. Returns null for group
  // matches (no bracket bookkeeping needed).
  const getBracketContext = (rounds, matchId) => {
    if (!rounds?.length) return null;
    for (let r = 0; r < rounds.length; r++) {
      const all = rounds[r].matches || [];
      const nonThird = all.filter(m => !m.isThirdPlaceMatch);
      const idx = nonThird.findIndex(m => m.id === matchId);
      if (idx !== -1) {
        const isSemifinal = nonThird.length === 2 && r < rounds.length - 1;
        const finalRound = rounds[rounds.length - 1];
        const nextNonThird = r < rounds.length - 1
          ? (rounds[r + 1].matches || []).filter(m => !m.isThirdPlaceMatch)
          : [];
        return {
          roundIndex: r,
          bracketIndex: idx,
          entry: nonThird[idx],
          isFirstOfPair: idx % 2 === 0,
          nextMatch: nextNonThird[Math.floor(idx / 2)] || null,
          thirdPlaceMatch: isSemifinal ? (finalRound.matches.find(m => m.isThirdPlaceMatch) || null) : null,
          isThirdPlace: false
        };
      }
      const third = all.find(m => m.isThirdPlaceMatch && m.id === matchId);
      if (third) {
        return { roundIndex: r, bracketIndex: -1, entry: third, isFirstOfPair: true, nextMatch: null, thirdPlaceMatch: null, isThirdPlace: true };
      }
    }
    return null;
  };

  // A downstream match blocks reset/correct once it has been played or is
  // being played — the DB row is authoritative over the bracket entry.
  const isDownstreamBlocked = (ctx) => {
    const started = (bracketMatch) => {
      if (!bracketMatch) return false;
      const row = tournament?.playoffMatches?.find(m => m.id === bracketMatch.id);
      const status = row?.status || bracketMatch.status || 'pending';
      return status === 'in_progress' || status === 'completed';
    };
    return started(ctx.nextMatch) || started(ctx.thirdPlaceMatch);
  };

  const handleAdminResetMatch = async (match) => {
    if (!(await confirmDialog(t('manager.confirmReset', { matchId: match.id }), { destructive: true }))) return;
    try {
      const ctx = getBracketContext(tournament?.playoffs?.rounds, match.id);
      if (ctx && isDownstreamBlocked(ctx)) {
        toast.error(t('manager.downstreamStarted'));
        return;
      }

      await matchService.resetMatchToPending(match.id);

      if (ctx) {
        // Sync the bracket JSONB: mark the entry pending and clear the slots
        // its winner/loser already occupied downstream.
        const playoffs = structuredClone(tournament.playoffs);
        const c = getBracketContext(playoffs.rounds, match.id);
        c.entry.status = 'pending';
        c.entry.result = null;
        const downstreamRowIds = [];
        if (c.nextMatch) {
          if (c.isFirstOfPair) c.nextMatch.player1 = null; else c.nextMatch.player2 = null;
          c.nextMatch.status = 'pending';
          c.nextMatch.result = null;
          downstreamRowIds.push(c.nextMatch.id);
        }
        if (c.thirdPlaceMatch) {
          if (c.bracketIndex === 0) c.thirdPlaceMatch.player1 = null; else c.thirdPlaceMatch.player2 = null;
          c.thirdPlaceMatch.status = 'pending';
          c.thirdPlaceMatch.result = null;
          downstreamRowIds.push(c.thirdPlaceMatch.id);
        }

        // Downstream DB rows (pending by the guard above) still carry the old
        // players — delete them so the UI falls back to the cleared bracket.
        const existingDownstream = downstreamRowIds.filter(id =>
          tournament?.playoffMatches?.some(m => m.id === id)
        );
        if (existingDownstream.length > 0) {
          const { error: delError } = await supabase
            .from('matches')
            .delete()
            .in('id', existingDownstream);
          if (delError) throw delError;
        }

        await tournamentService.updateTournamentPlayoffs(tournament.id, playoffs);
      }

      // Any reset on a finished tournament (final, 3rd place, or a group match
      // of a group-only tournament) means it is no longer complete.
      if (tournament.status === 'completed') {
        await tournamentService.updateTournamentStatus(tournament.id, 'started');
      }

      await getTournament(tournament.id);
    } catch (error) {
      console.error('Error resetting match:', error);
      toast.error(error.message);
    }
  };

  // Opens the correction dialog; applyCorrectedResult does the actual write.
  const handleAdminCorrectMatch = (match) => setCorrectingMatch(match);

  const applyCorrectedResult = async (match, score1, score2) => {
    const winnerId = score1 > score2 ? match.player1?.id : (score2 > score1 ? match.player2?.id : null);
    if (!winnerId) {
      toast.error(t('manager.winnerMoreLegsError'));
      return;
    }

    try {
      const ctx = getBracketContext(tournament?.playoffs?.rounds, match.id);
      if (ctx && isDownstreamBlocked(ctx)) {
        toast.error(t('manager.downstreamStarted'));
        return;
      }

      await matchService.updateMatchResult(match.id, {
        winner: winnerId,
        player1Legs: score1,
        player2Legs: score2
      });

      if (ctx) {
        // Sync the bracket JSONB: patch the entry's result and re-propagate
        // winner/loser into the downstream slots.
        const playoffs = structuredClone(tournament.playoffs);
        const c = getBracketContext(playoffs.rounds, match.id);
        c.entry.status = 'completed';
        c.entry.result = {
          ...(c.entry.result || {}),
          winner: winnerId,
          player1Legs: score1,
          player2Legs: score2,
          manuallyCorrected: true
        };

        const winnerPlayer = c.entry.player1?.id === winnerId ? c.entry.player1 : c.entry.player2;
        const loserPlayer = c.entry.player1?.id === winnerId ? c.entry.player2 : c.entry.player1;

        const rowUpdates = [];
        if (c.nextMatch && winnerPlayer) {
          if (c.isFirstOfPair) c.nextMatch.player1 = winnerPlayer; else c.nextMatch.player2 = winnerPlayer;
          rowUpdates.push({
            id: c.nextMatch.id,
            [c.isFirstOfPair ? 'player1_id' : 'player2_id']: winnerPlayer.id
          });
        }
        if (c.thirdPlaceMatch && loserPlayer) {
          if (c.bracketIndex === 0) c.thirdPlaceMatch.player1 = loserPlayer; else c.thirdPlaceMatch.player2 = loserPlayer;
          rowUpdates.push({
            id: c.thirdPlaceMatch.id,
            [c.bracketIndex === 0 ? 'player1_id' : 'player2_id']: loserPlayer.id
          });
        }

        // Keep existing downstream DB rows (pending by the guard) in step
        for (const { id, ...fields } of rowUpdates) {
          if (tournament?.playoffMatches?.some(m => m.id === id)) {
            const { error: rowError } = await supabase.from('matches').update(fields).eq('id', id);
            if (rowError) throw rowError;
          }
        }

        await tournamentService.updateTournamentPlayoffs(tournament.id, playoffs);
      }

      await getTournament(tournament.id);
      setCorrectingMatch(null);
    } catch (error) {
      console.error('Error correcting match result:', error);
      toast.error(error.message);
    }
  };

  const getMatchStatusText = (status, matchId) => {
    if (isMatchActuallyLive(matchId)) {
      if (isMatchInLocalStorage(matchId)) {
        return t('management.liveThisDevice');
      } else if (canManage) {
        return t('management.liveAdminAccess');
      } else {
        return t('management.liveOtherDevice');
      }
    }
    
    switch (status) {
      case 'completed': return t('common.completed');
      case 'in_progress': return t('management.inProgress');
      default: return t('management.pending');
    }
  };
  useEffect(() => {
    if (!tournament?.id) {
      return;
    }

    // Reset previously viewed tournament live matches to avoid cross-tournament bleed
    setLiveMatches([]);
    liveMatchesRef.current = [];

    const loadLiveMatches = async () => {
      try {
        // Get all group IDs for this tournament
        const groupIds = uniqueGroups?.map(g => g.id) || [];
        const groupIdSet = new Set(groupIds);
        
        // Get playoff matches for this tournament
        const playoffMatchIds = tournament.playoffMatches?.map(m => m.id) || [];
        const playoffIdSet = new Set(playoffMatchIds);

        // Helper to ensure we only keep matches belonging to this tournament
        const belongsToThisTournament = (match) => {
          const matchGroupId = match.group_id || match.group?.id;
          return groupIdSet.has(matchGroupId) || playoffIdSet.has(match.id);
        };
        
        const allLiveMatches = [];

        // Load group matches if we have groups
        if (groupIds.length > 0) {
          const groupQuery = supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('status', 'in_progress')
            .in('group_id', groupIds);

          const { data: groupData, error: groupError } = await groupQuery;
          if (!groupError && groupData) {
            allLiveMatches.push(...groupData);
          }
        }

        // Load playoff matches if we have playoff matches
        if (playoffMatchIds.length > 0) {
          const playoffQuery = supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*)
            `)
            .eq('status', 'in_progress')
            .in('id', playoffMatchIds);

          const { data: playoffData, error: playoffError } = await playoffQuery;
          if (!playoffError && playoffData) {
            // Merge playoff matches, avoiding duplicates
            const existingIds = new Set(allLiveMatches.map(m => m.id));
            playoffData.forEach(match => {
              if (!existingIds.has(match.id)) {
                allLiveMatches.push(match);
              }
            });
          }
        }

        // Stable order (board number, then id) so cards don't jump around
        allLiveMatches.sort(compareLiveMatchesStable);

        // Smart merge: preserve existing matches and only update changed ones
        // This prevents cards from disappearing during refresh
        setLiveMatches(prev => {
          // Always use ref first to get the most current matches (prev might be stale in async context)
          // This ensures we never lose existing matches during async operations
          const currentMatches = (liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev)
            .filter(belongsToThisTournament); // Drop matches from other tournaments
          
          // Create a map of new matches by ID for quick lookup
          const newMatchesMap = new Map(allLiveMatches.map(m => [m.id, m]));
          
          // Start with existing matches, updating them if we have new data
          // This ensures existing cards stay visible
          const mergedMatches = currentMatches.map(existingMatch => {
            const newMatch = newMatchesMap.get(existingMatch.id);
            // If match is no longer in_progress, remove it
            if (newMatch && newMatch.status !== 'in_progress') {
              return null; // Mark for removal
            }
            // Return updated match if available, otherwise keep existing (preserves card)
            return newMatch || existingMatch;
          }).filter(m => m !== null && m.status === 'in_progress' && belongsToThisTournament(m)); // Only keep live matches from this tournament
          
          // Add any new matches that weren't in the previous list
          const existingIds = new Set(currentMatches.map(m => m.id));
          allLiveMatches.forEach(newMatch => {
            if (!existingIds.has(newMatch.id) && newMatch.status === 'in_progress' && belongsToThisTournament(newMatch)) {
              mergedMatches.push(newMatch);
            }
          });
          
          // Sort the merged result in the same stable order
          mergedMatches.sort(compareLiveMatchesStable);

          // Update ref with merged matches BEFORE returning
          // This ensures next update has the latest data
          liveMatchesRef.current = mergedMatches;
          return mergedMatches;
        });
      } catch (err) {
        console.error('Error loading live matches:', err);
      }
    };

    // Load initial matches
    loadLiveMatches();

    // Lightweight polling fallback for live scores. The realtime subscription
    // below only delivers if Postgres realtime is enabled on the `matches`
    // table; this poll guarantees live scores still refresh otherwise. It
    // re-runs loadLiveMatches (which smart-merges into the `liveMatches` array
    // only — never the whole tournament), so it does NOT cause page flicker.
    // Runs only while the Live Matches tab is active to avoid needless queries.
    const livePollInterval = setInterval(() => {
      if (activeTabRef.current === 'liveMatches') {
        loadLiveMatches();
      }
    }, 5000);

    // Set up real-time subscription
    const channel = supabase
      .channel(`live-matches-tournament-${tournament.id}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'matches',
          filter: 'status=eq.in_progress'
        },
        async (payload) => {
          // Check if this match belongs to this tournament
          const match = payload.new;
          const belongsToTournament = 
            (uniqueGroups?.some(g => g.id === match.group_id)) ||
            (tournament.playoffMatches?.some(m => m.id === match.id));

          if (!belongsToTournament) {
            return; // Not our tournament, ignore
          }

          // Reload the full match data
          const { data: updatedMatch, error } = await supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('id', match.id)
            .single();

          if (!error && updatedMatch) {
            if (updatedMatch.status === 'in_progress') {
              setLiveMatches(prev => {
                const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
                const existing = currentMatches.find(m => m.id === updatedMatch.id);
                const updated = existing 
                  ? currentMatches.map(m => m.id === updatedMatch.id ? updatedMatch : m)
                  : [...currentMatches, updatedMatch];
                liveMatchesRef.current = updated;
                return updated;
              });
            } else {
              // Match completed or status changed, remove from live matches
              setLiveMatches(prev => {
                const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
                const filtered = currentMatches.filter(m => m.id !== match.id);
                liveMatchesRef.current = filtered;
                return filtered;
              });
            }
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: 'status=eq.in_progress'
        },
        async (payload) => {
          const match = payload.new;
          const belongsToTournament = 
            (uniqueGroups?.some(g => g.id === match.group_id)) ||
            (tournament.playoffMatches?.some(m => m.id === match.id));

          if (!belongsToTournament) {
            return;
          }

          // Load full match data
          const { data: newMatch, error } = await supabase
            .from('matches')
            .select(`
              *,
              player1:players!matches_player1_id_fkey(*),
              player2:players!matches_player2_id_fkey(*),
              group:groups(
                *,
                tournament:tournaments(*)
              )
            `)
            .eq('id', match.id)
            .single();

          if (!error && newMatch) {
            setLiveMatches(prev => {
              const currentMatches = liveMatchesRef.current.length > 0 ? liveMatchesRef.current : prev;
              if (currentMatches.find(m => m.id === newMatch.id)) {
                return currentMatches;
              }
              const updated = [...currentMatches, newMatch];
              liveMatchesRef.current = updated;
              return updated;
            });
          }
        }
      )
      // Detect matches that transition to 'completed' on another device and
      // apply them granularly to the local bracket/standings. NOTE: no status
      // filter here — the in_progress-filtered listeners above can never match
      // a row whose new status is 'completed'. We filter in JS instead.
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches'
        },
        (payload) => {
          const match = payload.new;
          if (!match || match.status !== 'completed') {
            return; // Only care about completions here
          }

          const belongsToTournament =
            tournamentGroupIdsRef.current.has(match.group_id) ||
            tournamentPlayoffIdsRef.current.has(match.id);

          if (!belongsToTournament) {
            return;
          }

          // Build a matchResult from the payload row. saveMatchResult writes the
          // full result JSONB + winner + leg counts, so the payload carries
          // everything the standings/bracket transform needs. applyMatchCompletion
          // synthesizes a minimal result if `result` is somehow absent.
          const matchResult = {
            matchId: match.id,
            winner: match.winner_id,
            player1Id: match.player1_id,
            player2Id: match.player2_id,
            player1Legs: match.player1_legs,
            player2Legs: match.player2_legs,
            isPlayoff: !!match.is_playoff,
            playoffRound: match.playoff_round,
            groupId: match.group_id,
            result: match.result || null,
            ...(match.result || {})
          };

          const apply = applyRemoteMatchResultRef.current;
          if (apply) {
            apply(matchResult);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(livePollInterval);
      supabase.removeChannel(channel);
    };
  }, [tournament?.id]); // Only depend on tournament ID to avoid unnecessary reloads

  // Show loading state if tournament is not loaded yet. This must stay BELOW
  // every hook call (rules of hooks): an early return above a hook makes the
  // hook count differ between the null render and the hydrated render.
  if (!tournament) {
    return <LoadingState text={t('common.loading')} />;
  }

  const belongsToThisTournament = (match) => {
    const matchGroupId = match.group_id || match.group?.id;
    return tournamentGroupIds.has(matchGroupId) || tournamentPlayoffIds.has(match.id);
  };
  const filteredLiveMatches = liveMatches
    .filter(belongsToThisTournament)
    .sort((a, b) => {
      // Favorites pinned first (deliberate user action), then a stable order
      // (board, then id) so cards don't reshuffle as scores update.
      const aFav = favoriteMatchIds.has(a.id) ? 1 : 0;
      const bFav = favoriteMatchIds.has(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return compareLiveMatchesStable(a, b);
    });

  // Everything a group/playoff match card needs from this component.
  const card = {
    user, canScore, canManage, isAdmin, isMatchActuallyLive, isMatchInLocalStorage, getMatchStatusText, liveInfoById,
    setMatchStatistics, handleAdminResetMatch, handleAdminCorrectMatch, handleStartMatchRequest, onMatchStart
  };

  const isPlayoffOnly = tournament.tournamentType === 'playoff_only';
  const playerCount = tournament.players?.length || uniqueGroups?.reduce((total, group) => total + (group.players?.length || 0), 0) || 0;
  const overview = [
    `${playerCount} ${t('common.players')}`,
    `${uniqueGroups?.length || 0} ${t('common.groups')}`,
    tournament.legsToWin && (tournament.legsToWin === 1
      ? t('tournaments.firstToLeg', { count: 1 })
      : t('tournaments.firstToLegs', { count: tournament.legsToWin })),
    tournament.startingScore && `${t('tournaments.startingScore')} ${tournament.startingScore}`
  ].filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('common.backToDashboard')}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
              <StatusBadge status={tournament.status} t={t} />
              {user && (
                <Badge variant="outline">
                  {canManage ? t('management.youAreManaging') : t('management.youAreViewing')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">{overview.join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton />
            <Button variant="outline" asChild>
              <a
                href={`/tv/${tournament.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={t('management.tvModeHint')}
                aria-label={t('management.tvMode')}
              >
                <Monitor />
                {t('management.tvMode')}
              </a>
            </Button>
            {canManage && user && (
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
            {canManage && user && (
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
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {!isPlayoffOnly && (
            <>
              <TabsTrigger value="groups">{t('management.groups')}</TabsTrigger>
              <TabsTrigger value="matches">{t('management.matches')}</TabsTrigger>
              <TabsTrigger value="standings">{t('management.standings')}</TabsTrigger>
            </>
          )}
          {tournament.playoffSettings?.enabled && (
            <TabsTrigger value="playoffs">{t('management.playoffs')}</TabsTrigger>
          )}
          <TabsTrigger value="statistics">{t('management.statistics')}</TabsTrigger>
          <TabsTrigger value="liveMatches">
            <Activity />
            {t('management.liveMatches')}
            {filteredLiveMatches.length > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 tabular-nums">{filteredLiveMatches.length}</Badge>
            )}
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="scorers">
              <ClipboardList />
              {t('scorers.title')}
            </TabsTrigger>
          )}
          {tournament.status === 'completed' && (
            <TabsTrigger value="summary">
              <Trophy />
              {t('summary.tab')}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-4">
        {showScorerNudge && (
          <Alert role="status" className="pr-12">
            <ClipboardList />
            <AlertTitle>{t('management.noScorersTitle')}</AlertTitle>
            <AlertDescription>
              <p>{t('management.noScorersText')}</p>
              <Button type="button" size="sm" className="mt-1" onClick={() => handleTabChange('scorers')}>
                {t('management.addScorers')}
              </Button>
            </AlertDescription>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
              onClick={dismissScorerNudge}
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X />
            </Button>
          </Alert>
        )}
        {!isPlayoffOnly && activeTab === 'groups' && (
          <GroupsTab
            tournament={tournament}
            uniqueGroups={uniqueGroups}
            getFavoriteGroups={getFavoriteGroups}
            isGroupFavorite={isGroupFavorite}
            toggleFavoriteGroup={toggleFavoriteGroup}
            renderPlayerLink={renderPlayerLink}
            t={t}
          />
        )}
        {!isPlayoffOnly && activeTab === 'matches' && (
          <MatchesTab
            tournament={tournament}
            uniqueGroups={uniqueGroups}
            matchGroupFilter={matchGroupFilter}
            setMatchGroupFilter={setMatchGroupFilter}
            matchPlayerFilter={matchPlayerFilter}
            setMatchPlayerFilter={setMatchPlayerFilter}
            getFavoriteGroups={getFavoriteGroups}
            toggleFavoriteGroup={toggleFavoriteGroup}
            groupScorerByMatch={groupScorerByMatch}
            card={card}
            t={t}
          />
        )}
        {!isPlayoffOnly && activeTab === 'standings' && (
          <StandingsTab
            tournament={tournament}
            uniqueGroups={uniqueGroups}
            defaultQualifierIdSet={defaultQualifierIdSet}
            standingsRef={standingsRef}
            renderPlayerLink={renderPlayerLink}
            t={t}
          />
        )}
        {activeTab === 'playoffs' && (
          <PlayoffsTab
            tournament={tournament}
            uniqueGroups={uniqueGroups}
            isGroupStageComplete={isGroupStageComplete}
            bracketViewMode={bracketViewMode}
            setBracketViewMode={setBracketViewMode}
            bracketRef={bracketRef}
            handleResetPlayoffs={handleResetPlayoffs}
            getRoundSize={getRoundSize}
            getPlayoffLegsToWin={getPlayoffLegsToWin}
            setEditingMatch={setEditingMatch}
            handleAdvanceBye={handleAdvanceBye}
            playoffScorerByMatch={playoffScorerByMatch}
            activeQualifierIds={activeQualifierIds}
            defaultQualifierIds={defaultQualifierIds}
            activeQualifierIdSet={activeQualifierIdSet}
            defaultQualifierIdSet={defaultQualifierIdSet}
            rankedPlayersForSeeding={rankedPlayersForSeeding}
            sortStandingsByCriteria={sortStandingsByCriteria}
            toggleQualifierSelection={toggleQualifierSelection}
            resetQualifierSelection={resetQualifierSelection}
            qualifiersTouched={qualifiersTouched}
            startPlayoffs={startPlayoffs}
            card={card}
            t={t}
          />
        )}
        {activeTab === 'statistics' && (
          <StatisticsTab tournament={tournament} uniqueGroups={uniqueGroups} renderPlayerLink={renderPlayerLink} t={t} />
        )}
        {activeTab === 'liveMatches' && (
          <LiveMatchesTab
            liveMatches={filteredLiveMatches}
            favoriteMatchIds={favoriteMatchIds}
            toggleFavoriteMatch={toggleFavoriteMatch}
            t={t}
          />
        )}
        {activeTab === 'scorers' && canManage && (
          <ScorersPanel
            type="tournament"
            entityId={tournament.id}
            onScorersChange={(list) => setTournamentScorerCount(list.length)}
          />
        )}
        {activeTab === 'summary' && <TournamentSummary tournament={tournament} />}
      </div>

      {/* Match Start Confirmation Modal */}
      <StartMatchDialog match={matchToConfirm} onConfirm={confirmStartMatch} onCancel={cancelStartMatch} t={t} />

      {/* Edit Settings Modal */}
      <EditSettingsDialog
        open={showEditSettings && !!user}
        onClose={() => setShowEditSettings(false)}
        onSave={updateSettings}
        tournament={tournament}
        tournamentSettings={tournamentSettings}
        setTournamentSettings={setTournamentSettings}
        hasTournamentStarted={hasTournamentStarted}
        t={t}
      />

      {/* Edit Playoff Match Modal */}
      <EditMatchPlayersDialog
        match={editingMatch}
        qualifyingPlayers={tournament.playoffs?.qualifyingPlayers || []}
        allRounds={tournament.playoffs?.rounds || []}
        onSave={(player1, player2) => updatePlayoffMatchPlayers(editingMatch.id, player1, player2)}
        onCancel={() => setEditingMatch(null)}
        t={t}
      />

      <CorrectResultDialog
        match={correctingMatch}
        onSave={(score1, score2) => applyCorrectedResult(correctingMatch, score1, score2)}
        onCancel={() => setCorrectingMatch(null)}
        t={t}
      />

      {/* Match Statistics Modal */}
      <MatchStatisticsModal match={matchStatistics} onClose={() => setMatchStatistics(null)} />
    </div>
  );
}
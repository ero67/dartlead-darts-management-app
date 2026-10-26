import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Eye, Target } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTournament } from '../contexts/TournamentContext';
import { supabase } from '../lib/supabase';
import { matchService, tournamentService } from '../services/tournamentService';
import { enqueueWrite, QUEUE_TYPES } from '../lib/offlineQueue';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { useIsMobile } from '../hooks/use-mobile';
import { hapticTap, hapticLegWon, hapticMatchWon } from '../lib/haptics';
import {
  createCricketMatch, isCricketState, cricketApplyDart, cricketEndVisit, cricketAwardLegByBullup,
  cricketSetStarter, cricketCanUndo, cricketUndo, mprOf
} from '../lib/cricket';
import { displayLabel } from '../lib/x01Engine';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadingState } from './shared/LoadingState';
import { LegPips } from './shared/DartsAccents';
import { PreMatchCard } from './match/PreMatchCard';
import { StarterDialog, ViewOnlyDialog, BullupDialog } from './match/MatchDialogs';
import { MatchCompleteCard } from './match/MatchCompleteCard';
import { CricketBoard } from './cricket/CricketBoard';
import { CricketPad } from './cricket/CricketPad';
import { CricketMarksTable } from './cricket/CricketMarksTable';
import { MprInfo } from './cricket/MprInfo';
import { storableCricketState, withLegsTarget, cricketLiveUpdate, cricketStateFromRow, cricketMatchResult } from './match/cricket/cricketMatchState';
import { isLocalSnapshotStale, rememberServerStamp } from './match/liveSnapshot';

// Cricket legs stall when the leader keeps scoring instead of closing; a normal
// leg is 10–20 visits each, so 30 each is clearly stuck (X01 offers it at 15).
const BULLUP_VISIT_THRESHOLD = 30;


// Tournament Cricket scorer. Same lifecycle as MatchInterface (permission,
// live device, crash recovery, guarded live sync, bull-up, completion) but the
// rules and undo live in lib/cricket.js: this screen only holds its state.
export function CricketMatchInterface({ match, onMatchComplete, onBack }) {
  const { t } = useLanguage();
  if (!match) {
    return (
      <div className="flex flex-1 flex-col justify-center bg-background text-foreground">
        <LoadingState text={t('common.loading')} />
      </div>
    );
  }
  return <CricketMatchInner match={match} onMatchComplete={onMatchComplete} onBack={onBack} />;
}

function CricketMatchInner({ match, onMatchComplete, onBack }) {
  useKeepScreenAwake(true);
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentTournament } = useTournament();
  const { startLiveMatch, endLiveMatch, updateLiveMatch, isMatchLiveOnThisDevice, deviceId, deviceName, boardNumber } = useLiveMatch();

  const storageKey = `match-state-${match.id}`;
  const playerNames = [match.player1?.name || t('match.player1'), match.player2?.name || t('match.player2')];
  const enginePlayers = [
    { id: match.player1?.id, name: playerNames[0], kind: 'human' },
    { id: match.player2?.id, name: playerNames[1], kind: 'human' }
  ];

  // Crash recovery, read once: a saved Cricket state wins unless an admin
  // reset the match to pending and nothing was thrown yet (X01's rule), or the
  // row turns out newer than it (checked by the row load below).
  const initRef = useRef(null);
  if (initRef.current === null) {
    let saved = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey));
      if (parsed?.gameType === 'cricket' && isCricketState(parsed.engine)) saved = parsed;
    } catch {
      // corrupted entry: start from the row / a fresh match
    }
    const hasProgress = !!saved && !saved.engine.starterPending;
    if (match.status === 'pending' && !hasProgress) {
      localStorage.removeItem(storageKey);
      saved = null;
    }
    initRef.current = {
      hasProgress,
      serverUpdatedAt: saved?.serverUpdatedAt || null,
      engine: saved
        ? { ...saved.engine, undoStack: Array.isArray(saved.engine.undoStack) ? saved.engine.undoStack : [] }
        : createCricketMatch({ legsTarget: match.legsToWin || 3, players: enginePlayers, starter: 'bullup' })
    };
  }

  const [engine, setEngine] = useState(initRef.current.engine);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [isLoaded, setIsLoaded] = useState(initRef.current.hasProgress);
  // Row updated_at as of this device's last read or write (see liveSnapshot.js).
  const serverUpdatedAtRef = useRef(initRef.current.serverUpdatedAt);
  // No live write until the row load has compared the snapshot with the row.
  const isRowCheckedRef = useRef(false);
  // Set where this device marks the match live, so only the scoring device
  // writes (a ref: see MatchInterface).
  const isLiveHereRef = useRef(false);
  const [matchComplete, setMatchComplete] = useState(false);
  const [completedRow, setCompletedRow] = useState(null); // { legs, winnerId } when re-opening a finished match
  const [showBullup, setShowBullup] = useState(false);
  // Phones enter darts on the keypad; the board above it only shows them
  // (at phone size its rings are too thin to tap reliably).
  const isMobile = useIsMobile();

  // Scoring permission, exactly as MatchInterface: null until resolved,
  // offline (null from the RPC) counts as allowed.
  const tournamentId = match.tournamentId || match.tournament_id || currentTournament?.id || null;
  const [canScore, setCanScore] = useState(null);
  useEffect(() => {
    if (!user?.id || !tournamentId) {
      setCanScore(false);
      return;
    }
    let cancelled = false;
    tournamentService.canScore(tournamentId).then(allowed => {
      if (!cancelled) setCanScore(allowed === null ? true : allowed);
    });
    return () => { cancelled = true; };
  }, [user?.id, tournamentId]);
  const isViewOnly = !user || canScore === false;
  const isNotScorer = !!user && canScore === false;

  // Guarded, monotonic live write (see MatchInterface.updateMatchToDatabase):
  // never overwrites a completed match or a newer snapshot; queued offline.
  const syncLive = async (state = engineRef.current) => {
    if (!user || canScore === false || state.starterPending) return;
    // Only the device scoring the match writes, and only after the row check.
    if (!isRowCheckedRef.current || !isLiveHereRef.current) return;
    const update = cricketLiveUpdate(state);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueueWrite(QUEUE_TYPES.liveSync, { matchId: match.id, update }, `live:${match.id}`);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('matches')
        .update(update)
        .eq('id', match.id)
        .neq('status', 'completed')
        .or(`last_activity_at.is.null,last_activity_at.lt.${update.last_activity_at}`)
        .select('id, updated_at');
      if (error) throw error;
      if (data?.[0]?.updated_at) {
        serverUpdatedAtRef.current = data[0].updated_at;
        rememberServerStamp(storageKey, data[0].updated_at);
      }
    } catch (error) {
      console.error('Error updating cricket match, queueing live sync:', error);
      enqueueWrite(QUEUE_TYPES.liveSync, { matchId: match.id, update }, `live:${match.id}`);
    }
  };

  // The row first: format, completion elsewhere, and resume on another device.
  useEffect(() => {
    let cancelled = false;
    isRowCheckedRef.current = false;
    const load = async () => {
      try {
        const { data: row, error } = await supabase
          .from('matches')
          .select('legs_to_win, status, match_starter, current_leg, current_player, player1_legs, player2_legs, player1_current_score, player2_current_score, winner_id, live_state, updated_at')
          .eq('id', match.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled || !row) return;
        if (row.status === 'completed') {
          setCompletedRow({ legs: [row.player1_legs || 0, row.player2_legs || 0], winnerId: row.winner_id || null });
          setMatchComplete(true);
          return;
        }
        const legsTarget = match.legsToWin || row.legs_to_win || 3;
        const rowInProgress = row.status === 'in_progress'
          && (row.match_starter !== null || row.current_leg > 1 || row.player1_legs > 0 || row.player2_legs > 0);
        // Another device scored on, or a manager reset the match, after this
        // device last saw the row: drop the local state, the row wins.
        let snapshot = null;
        try {
          snapshot = JSON.parse(localStorage.getItem(storageKey));
        } catch {
          // corrupted entry: nothing to compare
        }
        const isStale = isLocalSnapshotStale(snapshot, row);
        if (isStale) localStorage.removeItem(storageKey);
        serverUpdatedAtRef.current = row.updated_at || serverUpdatedAtRef.current;
        rememberServerStamp(storageKey, row.updated_at);
        if ((!initRef.current.hasProgress || isStale) && rowInProgress) {
          setEngine(cricketStateFromRow(row, { legsTarget, players: enginePlayers }));
        } else if (isStale) {
          setEngine(createCricketMatch({ legsTarget, players: enginePlayers, starter: 'bullup' }));
        } else if (!match.legsToWin && row.legs_to_win) {
          setEngine(s => withLegsTarget(s, row.legs_to_win));
        }
      } catch (error) {
        console.error('Error loading cricket match row:', error);
      } finally {
        if (!cancelled) {
          isRowCheckedRef.current = true;
          setIsLoaded(true);
        }
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  // Mark the match live on this device and started (as MatchInterface).
  useEffect(() => {
    if (match.status === 'completed' || matchComplete || !user || canScore !== true) return;
    startLiveMatch(match.id, { player1: match.player1, player2: match.player2, gameType: 'cricket' });
    isLiveHereRef.current = true;
    // startMatch creates a playoff match's row, so the live device (TV, live
    // lists) and the resumed marks are written only after it.
    matchService.startMatch(match.id, user.id, match)
      .catch(error => console.error('Error marking match as started:', error))
      .then(() => {
        if (deviceId) {
          matchService.startLiveMatch(match.id, deviceId, deviceName, boardNumber).catch(error => {
            console.error('Error starting live match in database, queueing for retry:', error);
            enqueueWrite(QUEUE_TYPES.startLiveMatch, { matchId: match.id, deviceId, deviceName, boardNumber }, `start:${match.id}`);
          });
        }
        syncLive();
      });
    return () => {
      isLiveHereRef.current = false;
      endLiveMatch(match.id);
    };
    // Keyed on ids like MatchInterface (a token refresh hands out a new user object).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, match.id, canScore]);

  useEffect(() => {
    if (matchComplete || !user || !isMatchLiveOnThisDevice(match.id)) return;
    updateLiveMatch(match.id, { player1: match.player1, player2: match.player2, gameType: 'cricket', currentLeg: engine.legNumber, currentPlayer: engine.turn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, matchComplete, user?.id]);

  // Crash recovery. currentLeg / matchStarter / matchComplete are read by
  // TournamentManagement for the match list, keep them. Nothing is saved
  // before the starter is picked (as X01): an entry marks the match "live on
  // this device", and a scorer remounting after completion must not leave one.
  useEffect(() => {
    if (matchComplete || engine.starterPending) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        gameType: 'cricket',
        engine: storableCricketState(engine),
        currentLeg: engine.legNumber,
        currentPlayer: engine.starterPending ? null : engine.turn,
        matchStarter: engine.starterPending ? null : engine.settings.starter,
        matchComplete: false,
        serverUpdatedAt: serverUpdatedAtRef.current
      }));
    } catch (error) {
      console.error('Error saving cricket match state:', error);
    }
  }, [engine, matchComplete, storageKey]);

  // Live sync at visit boundaries only (turn, visit count, leg, legs change;
  // a dart inside a visit changes none of them), debounced like X01.
  const syncKey = engine.starterPending ? null : `${engine.legNumber}|${engine.turn}|${engine.leg.visits.length}|${engine.legsWon.join('-')}`;
  useEffect(() => {
    if (!syncKey || matchComplete || !user) return;
    const timeout = setTimeout(() => syncLive(), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey, matchComplete, user?.id, canScore]);

  // 30s safety net (a missed write, a backgrounded tab), never mid-visit.
  useEffect(() => {
    if (matchComplete || !user) return;
    const interval = setInterval(() => {
      if (engineRef.current.leg.visit.darts.length === 0) syncLive();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, matchComplete, user?.id, canScore]);

  const completeMatch = (state) => {
    localStorage.removeItem(storageKey);
    if (!match.player1?.id || !match.player2?.id) {
      console.error('Missing player IDs - cannot complete match');
      return;
    }
    setMatchComplete(true);
    endLiveMatch(match.id);
    matchService.endLiveMatch(match.id).catch(error => console.error('Error ending live match in database:', error));
    onMatchComplete(cricketMatchResult(state, match));
  };

  const applyResult = (next, outcome) => {
    setEngine(next);
    if (outcome === 'leg') hapticLegWon();
    if (outcome === 'match') {
      hapticMatchWon();
      completeMatch(next);
    }
  };

  const handleDart = (dart) => {
    hapticTap();
    if (isViewOnly || matchComplete) return;
    const { state, outcome } = cricketApplyDart(engine, dart);
    if (outcome) applyResult(state, outcome);
  };

  const handleEndVisit = () => {
    hapticTap();
    if (isViewOnly || matchComplete || engine.leg.visit.darts.length === 0) return;
    setEngine(cricketEndVisit(engine));
  };

  const handleUndo = () => {
    hapticTap();
    if (isViewOnly || matchComplete) return;
    setEngine(cricketUndo(engine));
  };

  const handleBullupPick = (winner) => {
    if (isViewOnly) return;
    setShowBullup(false);
    const next = cricketAwardLegByBullup(engine, winner);
    applyResult(next, next.finishedAt ? 'match' : 'leg');
  };

  const selectStarter = (starter) => {
    if (isViewOnly) return;
    setEngine(cricketSetStarter(engine, starter));
    // Another device needs the starter to resume (localStorage doesn't travel).
    supabase.from('matches').update({ match_starter: starter }).eq('id', match.id)
      .then(({ error }) => { if (error) console.error('Error persisting match starter:', error); });
  };

  if (matchComplete) {
    const legs = completedRow ? completedRow.legs : engine.legsWon;
    const winnerIsP1 = completedRow ? completedRow.winnerId === match.player1?.id : engine.winner === 0;
    return <MatchCompleteCard winnerName={playerNames[winnerIsP1 ? 0 : 1]} player1Legs={legs[0]} player2Legs={legs[1]} onBack={onBack} />;
  }

  const legsToWin = engine.settings.legsTarget;

  if (engine.starterPending) {
    if (!isLoaded) {
      return (
        <div className="flex flex-1 flex-col justify-center bg-background text-foreground">
          <LoadingState text={t('common.loading')} />
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col bg-background text-foreground">
        {isViewOnly ? (
          <ViewOnlyDialog description={isNotScorer ? t('match.notScorerDescription') : t('match.viewOnlyStartDescription')} onBack={onBack} />
        ) : (
          <StarterDialog players={playerNames.map((name, i) => ({ name, legs: engine.legsWon[i] }))} onSelect={selectStarter}>
            <PreMatchCard player1={match.player1} player2={match.player2} legsToWin={legsToWin} gameType="cricket" className="rounded-lg border p-3" />
          </StarterDialog>
        )}
      </div>
    );
  }

  const { leg, turn } = engine;
  const visitDarts = leg.visit.darts;
  const legVisits = (p) => leg.visits.filter(v => v.player === p).length;
  const isBullupDue = legVisits(0) >= BULLUP_VISIT_THRESHOLD && legVisits(1) >= BULLUP_VISIT_THRESHOLD;
  const canUndo = cricketCanUndo(engine);
  const mpr = (p) => mprOf(engine.totals[p].marks, engine.totals[p].darts).toFixed(2);
  const metaTitle = [match.groupName, `${t('match.leg')} ${engine.legNumber}`].filter(Boolean).join(' · ');

  // Fixed to the viewport like MatchInterface so the input never scrolls away.
  return (
    <div className="flex h-[calc(100dvh-var(--safe-area-inset-top,0px)-var(--safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-background text-foreground">
      <BullupDialog
        open={showBullup}
        onOpenChange={(open) => { if (!open) setShowBullup(false); }}
        players={playerNames.map(name => ({ name }))}
        description={t('cricket.match.bullupPrompt')}
        onPick={handleBullupPick}
      />

      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-2 short:h-11">
        <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('common.back')}
        </Button>
        <div className="flex min-w-0 flex-col items-center text-center">
          <span className="truncate text-sm font-medium">{metaTitle}</span>
          <span className="text-xs text-muted-foreground">
            {t('common.gameTypeCricket')} · {t(legsToWin === 1 ? 'tournaments.firstToLeg' : 'tournaments.firstToLegs', { count: legsToWin })}
          </span>
        </div>
        {isViewOnly ? (
          <Badge variant="outline"><Eye />{t('match.viewOnlyMode')}</Badge>
        ) : (
          <Badge className="bg-destructive text-white">{t('management.live')}</Badge>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 short:pb-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.05fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
        {/* Scores. Phone: two tiles; wide: the full marks table. */}
        <div className="flex shrink-0 flex-col gap-2 lg:min-h-0 lg:overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            {[0, 1].map((p) => (
              <div key={p} className={cn('flex min-w-0 flex-col gap-1 rounded-xl border bg-card px-3 py-2 transition-colors', turn === p && 'border-primary bg-primary text-primary-foreground shadow-md')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{playerNames[p]}</span>
                  <LegPips won={engine.legsWon[p]} total={legsToWin} label={`${engine.legsWon[p]} ${t('match.legs')}`} className={turn === p ? undefined : 'text-primary'} />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="font-display text-4xl font-semibold leading-none tabular-nums short:text-3xl">{leg.points[p]}</span>
                  <span className={cn('text-xs tabular-nums', turn === p ? 'opacity-85' : 'text-muted-foreground')}>
                    <MprInfo /> <b className="font-semibold">{mpr(p)}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <CricketMarksTable
            className="hidden lg:grid"
            size="md"
            thrower={turn}
            marks={leg.marks}
            players={playerNames.map((name, p) => ({ name, points: leg.points[p], legs: engine.legsWon[p] }))}
          />
          <div className="hidden grid-cols-2 text-sm tabular-nums text-muted-foreground lg:grid">
            <span><MprInfo /> <b className="font-semibold text-foreground">{mpr(0)}</b></span>
            <span className="text-right"><MprInfo /> <b className="font-semibold text-foreground">{mpr(1)}</b></span>
          </div>

          {!isViewOnly && isBullupDue && (
            <Alert className="flex flex-wrap items-center gap-2">
              <Target />
              <AlertDescription className="flex-1">{t('cricket.match.bullupOffer', { count: BULLUP_VISIT_THRESHOLD })}</AlertDescription>
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setShowBullup(true)}>
                <Target />
                {t('match.bullup.decideButton')}
              </Button>
            </Alert>
          )}

          {!isViewOnly && (
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-10 items-center justify-center rounded-md border bg-muted/40 font-display text-xl font-semibold short:h-8">
                  {displayLabel(visitDarts[i])}
                </div>
              ))}
              <div className="flex min-w-12 flex-col items-end leading-none">
                <span className="font-display text-3xl font-semibold tabular-nums">{leg.visit.marks}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('common.marks')}</span>
              </div>
            </div>
          )}
        </div>

        {isViewOnly ? (
          <>
            {/* Phones: the marks table lives above only on wide screens. */}
            <CricketMarksTable
              className="lg:hidden"
              size="sm"
              thrower={turn}
              marks={leg.marks}
              players={playerNames.map((name, p) => ({ name, points: leg.points[p], legs: engine.legsWon[p] }))}
            />
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center lg:col-span-2">
              <Eye className="size-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('match.viewOnlyMode')}</h3>
              <p className="text-sm text-muted-foreground">{isNotScorer ? t('match.notScorerDescription') : t('match.viewOnlyScoreDescription')}</p>
            </div>
          </>
        ) : (
          <>
            {/* Board shows the marks and the visit's darts; the keypad enters them.
                Too short a viewport (iPhone SE with toolbars) leaves it unreadable. */}
            <div className="flex min-h-0 flex-1 items-center justify-center [@media(max-height:640px)]:hidden">
              <CricketBoard
                marks={leg.marks}
                thrower={turn}
                visitDarts={visitDarts}
                onDart={isMobile ? undefined : handleDart}
                className="h-full max-h-full w-auto max-w-full"
              />
            </div>

            <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border lg:min-h-0 lg:flex-1">
              <CricketPad
                onDart={handleDart}
                onUndo={handleUndo}
                onEndVisit={handleEndVisit}
                canUndo={canUndo}
                dartsInVisit={visitDarts.length}
                marks={leg.marks}
                thrower={turn}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

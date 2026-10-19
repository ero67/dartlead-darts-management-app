import React, { useState, useEffect, useRef } from 'react';
import { Bot, CheckCircle, Flag, Keyboard, Minus, Plus, Target, Trophy, User, Users } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DartKeypad } from '../scoring/DartKeypad';
import { TurnTotalKeypad } from '../scoring/TurnTotalKeypad';
import { CheckoutDialog } from '../scoring/CheckoutDialog';
import { BullupDialog, StarterDialog } from '../match/MatchDialogs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BoardMotif, FormDots, LegPips } from '../shared/DartsAccents';
import {
  PracticeScreenHeader, PracticeSetup, PracticeField, PracticeChips, PracticeStepper,
  PracticeSummaryBar, PracticeSummaryHeader, PracticeSummaryActions, PracticeStatGrid, PracticeBandRow,
  PracticePlay, PracticeBoard, PracticeBoardLabel, PracticeBoardValue, PracticeCheckoutHint,
  PracticeLastThrows, PracticeBoardStats, PracticeKeypad
} from './PracticeShared';
import { cn } from '@/lib/utils';
import {
  createSoloX01, applyDart, applyVisitTotal, undo, canUndo, dartFromInput,
  liveRemaining, lastVisitLabels, displayLabel, computeStats, STARTING_SCORES
} from '../../lib/x01Engine';
import {
  createX01Match, matchApplyDart, matchApplyVisitTotal, matchUndoHuman, matchCanUndo,
  matchApplySequence, matchAwardLegByBullup, matchSetStarter, matchSetScoringMode, isBotTurn, currentPlayerState, computeMatchStats, isMatch, MATCH_LEG_OPTIONS
} from '../../lib/x01Match';
import { BOT_LEVELS, getBotLevel, botThrow, newSeed } from '../../lib/botPlayer';
import {
  loadActiveSession, saveActiveSession, clearActiveSession, appendHistory,
  newSessionId, loadGameSettings, saveGameSettings
} from '../../lib/practiceStorage';
import { formatDuration, formatSessionDate, pluralSuffix } from '../../lib/practiceGames';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { useOnScreenKeypad } from '../../hooks/useOnScreenKeypad';
import { hapticTap, hapticBust, hapticLegWon, hapticMatchWon } from '../../lib/haptics';
import checkoutData from '../../data/checkouts.json';

const GAME = 'x01';
const LEG_OPTIONS = [1, 2, 3, 4, 5, 10, null];
const DEFAULT_SETTINGS = { startingScore: 501, legsTarget: 3, scoringMode: 'dart', opponent: null, starter: 'bullup' };
const FLASH_MS = 900;
const BOT_DART_MS = 700;
const OPPONENT_NAME_MAX = 30;

const sanitizeSettings = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const startingScore = Number.isInteger(saved.startingScore) && saved.startingScore >= 2 && saved.startingScore <= 1001
    ? saved.startingScore : DEFAULT_SETTINGS.startingScore;
  const scoringMode = saved.scoringMode === 'turnTotal' ? 'turnTotal' : 'dart';
  // Opponent: null (solo), a second person on this device, or a bot level.
  const opponent = saved.opponent && saved.opponent.kind === 'human'
    ? { kind: 'human', name: String(saved.opponent.name || '').slice(0, OPPONENT_NAME_MAX) }
    : saved.opponent && saved.opponent.kind === 'bot'
      ? { kind: 'bot', level: BOT_LEVELS.some(l => l.level === saved.opponent.level) ? saved.opponent.level : 4 }
      : null;
  let legsTarget = saved.legsTarget === null || (Number.isInteger(saved.legsTarget) && saved.legsTarget > 0)
    ? saved.legsTarget : DEFAULT_SETTINGS.legsTarget;
  // A match is always "first to N": no unlimited legs against an opponent.
  if (opponent && !MATCH_LEG_OPTIONS.includes(legsTarget)) legsTarget = DEFAULT_SETTINGS.legsTarget;
  // 0 / 1 = a fixed starter, 'bullup' = decide at the bull when the match opens.
  const starter = saved.starter === 1 ? 1 : saved.starter === 0 ? 0 : 'bullup';
  return { startingScore, legsTarget, scoringMode, opponent, starter };
};

// X01 practice: solo against the board, or two people taking turns on one
// device. setup → play → summary. The session in progress is persisted on
// every change so leaving the screen (or a crash) never loses a leg.
export function PracticeX01() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isOnScreenKeypad = useOnScreenKeypad();

  const [session, setSession] = useState(() => {
    const active = loadActiveSession();
    return active?.game === GAME ? active.state : null;
  });
  const [settings, setSettings] = useState(() => sanitizeSettings(session?.settings || loadGameSettings(GAME)));
  // "Custom" picked on the starting-score control: shows the number field.
  const [isCustomScore, setIsCustomScore] = useState(() => !STARTING_SCORES.includes(settings.startingScore));
  const [summary, setSummary] = useState(null);
  // The finished state behind `summary`: the leg-by-leg table reads it. Not
  // persisted, so it is only there right after the session ends.
  const [finalState, setFinalState] = useState(null);
  const [inputMode, setInputMode] = useState('single');
  const [turnTotalInput, setTurnTotalInput] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [flash, setFlash] = useState(null); // { type: 'bust' } | { type: 'legWon', darts, by, byBullup }
  const [showBullup, setShowBullup] = useState(false); // over-long leg: decide it at the bull
  const flashTimer = useRef(null);
  // Bot visit in flight: timers animating the darts and the state to commit
  const botTimers = useRef([]);
  const pendingBot = useRef(null);

  const isPlaying = session !== null && summary === null;
  useKeepScreenAwake(isPlaying);

  useEffect(() => {
    if (session) saveActiveSession(GAME, session);
  }, [session]);

  const clearBotTimers = () => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
    pendingBot.current = null;
  };

  useEffect(() => () => { clearTimeout(flashTimer.current); clearBotTimers(); }, []);

  const myName = (user && getUserDisplayName(user)) || t('practice.setup.you');
  const botName = (level) => t('practice.bot.name', { level });
  const opponentName = settings.opponent?.kind === 'bot'
    ? botName(settings.opponent.level)
    : (settings.opponent?.name || '').trim() || t('practice.setup.opponentPlayer');

  const showFlash = (value) => {
    clearTimeout(flashTimer.current);
    setFlash(value);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  // History entry: the device owner's stats at the top level (that is what
  // personal bests and highlights read), the opponent's underneath.
  const buildEntry = (state) => {
    if (isMatch(state)) {
      const ms = computeMatchStats(state);
      const [me, other] = state.settings.players;
      return {
        id: newSessionId(),
        game: GAME,
        settings: {
          startingScore: state.settings.startingScore,
          legsTarget: state.settings.legsTarget,
          scoringMode: state.settings.scoringMode,
          opponent: { kind: other.kind, name: other.name, level: other.level ?? null },
          starter: state.settings.starter,
          myName: me.name
        },
        stats: {
          ...ms.players[0],
          legsFor: ms.legsFor,
          legsAgainst: ms.legsAgainst,
          won: ms.won,
          opponent: { name: other.name, stats: ms.players[1] }
        },
        startedAt: state.startedAt,
        finishedAt: state.finishedAt || Date.now()
      };
    }
    return {
      id: newSessionId(),
      game: GAME,
      settings: state.settings,
      stats: computeStats(state),
      startedAt: state.startedAt,
      finishedAt: state.finishedAt || Date.now()
    };
  };

  const finishSession = (state) => {
    const entry = buildEntry(state);
    appendHistory(entry);
    clearActiveSession();
    hapticMatchWon();
    setSummary(entry);
    setFinalState(state);
    setSession(null);
  };

  const handleOutcome = ({ state, outcome }, thrower) => {
    if (outcome === null) return;
    if (outcome === 'bust') {
      hapticBust();
      showFlash({ type: 'bust' });
    } else if (outcome === 'checkout') {
      hapticLegWon();
      const legDarts = isMatch(state)
        ? state.legLog[state.legLog.length - 1]?.darts
        : state.legs[state.legs.length - 1]?.darts;
      showFlash({ type: 'legWon', darts: legDarts, by: thrower });
    }
    if (state.finishedAt) {
      // Let the leg-won flash land before the summary replaces the board.
      setSession(state);
      setTimeout(() => finishSession(state), FLASH_MS);
      return;
    }
    setSession(state);
  };

  // Same rule as the tournament scorer: once both players have thrown 15
  // visits in a leg, offer to decide it at the bull. No checkout is recorded.
  const BULLUP_VISIT_THRESHOLD = 15;
  const legVisits = (p) => p.current.visits.length;
  const bothReachedBullupThreshold = !!(session && isMatch(session) && !session.finishedAt
    && session.players.every((p) => legVisits(p) >= BULLUP_VISIT_THRESHOLD));

  // Bull-up before the first dart: whoever won it starts (StarterDialog).
  const handleStarterPick = (starter) => {
    if (!session || !isMatch(session)) return;
    setSession(matchSetStarter(session, starter));
  };
  const handleStarterScoringMode = (scoringMode) => {
    if (!session || !isMatch(session)) return;
    setSession(matchSetScoringMode(session, scoringMode));
    setSettings((prev) => {
      const next = { ...prev, scoringMode };
      saveGameSettings(GAME, next);
      return next;
    });
  };

  const handleBullupPick = (winner) => {
    if (!session || !isMatch(session)) return;
    setShowBullup(false);
    clearBotTimers();
    const next = matchAwardLegByBullup(session, winner);
    hapticLegWon();
    showFlash({ type: 'legWon', by: winner, byBullup: true });
    if (next.finishedAt) {
      setSession(next);
      setTimeout(() => finishSession(next), FLASH_MS);
      return;
    }
    setSession(next);
  };

  const handleStart = () => {
    saveGameSettings(GAME, settings);
    setSummary(null);
    setInputMode('single');
    setTurnTotalInput('');
    clearBotTimers();
    if (settings.opponent) {
      const second = settings.opponent.kind === 'bot'
        ? { id: 'bot', name: botName(settings.opponent.level), kind: 'bot', level: settings.opponent.level }
        : { id: 'p2', name: opponentName, kind: 'human' };
      setSession(createX01Match({
        startingScore: settings.startingScore,
        legsTarget: settings.legsTarget,
        scoringMode: settings.scoringMode,
        players: [{ id: 'me', name: myName, kind: 'human' }, second],
        starter: settings.starter,
        seed: newSeed()
      }));
    } else {
      setSession(createSoloX01(settings));
    }
  };

  const throwerState = session ? (isMatch(session) ? currentPlayerState(session) : session) : null;
  const throwerIndex = session && isMatch(session) ? session.turn : 0;
  const botBusy = !!(session && isBotTurn(session));

  // Commit the bot's visit (after the animation, or at once when skipped).
  const commitBotVisit = () => {
    const pending = pendingBot.current;
    if (!pending) return;
    clearBotTimers();
    handleOutcome({ state: pending.final, outcome: pending.outcome }, pending.thrower);
  };

  // The bot's turn: throw the visit (engine decides when it ends), then show
  // the darts one by one and commit the whole visit as one undo step.
  useEffect(() => {
    if (!session || !isBotTurn(session) || flash || summary) return undefined;
    if (botTimers.current.length > 0) return undefined; // already animating

    const level = getBotLevel(session.settings.players[session.turn].level);
    const darts = [];
    let seed = session.seed;
    let probe = session;
    let outcome = null;
    for (let i = 0; i < 3; i++) {
      const ps = currentPlayerState(probe);
      const thrown = botThrow({
        remaining: liveRemaining(ps),
        dartsLeft: 3 - ps.current.visit.darts.length,
        level,
        checkouts: checkoutData,
        seed
      });
      seed = thrown.seed;
      const result = matchApplyDart(probe, thrown.dart);
      if (result.outcome === null) break;
      darts.push(thrown.dart);
      outcome = result.outcome;
      if (outcome !== 'dart') break;
      probe = result.state;
    }
    if (darts.length === 0) return undefined;

    const { states, final } = matchApplySequence(session, darts, seed);
    pendingBot.current = { final, outcome, thrower: session.turn };
    states.forEach((intermediate, i) => {
      const isLast = i === states.length - 1;
      botTimers.current.push(setTimeout(() => {
        if (isLast) commitBotVisit();
        else setSession(intermediate);
      }, BOT_DART_MS * (i + 1)));
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, flash, summary]);

  const handleDart = (number) => {
    if (!session || session.finishedAt || flash || botBusy) return;
    const dart = dartFromInput(number, inputMode);
    if (!dart) return;
    hapticTap();
    setInputMode('single');
    handleOutcome(isMatch(session) ? matchApplyDart(session, dart) : applyDart(session, dart), throwerIndex);
  };

  const handleUndo = () => {
    if (!session || flash || botBusy) return;
    hapticTap();
    setSession(isMatch(session) ? matchUndoHuman(session) : undo(session));
  };

  const applyTotal = (total, options) =>
    isMatch(session) ? matchApplyVisitTotal(session, total, options) : applyVisitTotal(session, total, options);

  const handleTurnTotal = (total) => {
    if (!session || session.finishedAt || flash || botBusy) return;
    hapticTap();
    if (throwerState.current.remaining - total === 0) {
      setPendingCheckout({ total, dartsUsed: 3, finishedOnDouble: true });
      return;
    }
    setTurnTotalInput('');
    handleOutcome(applyTotal(total, { finishedOnDouble: false }), throwerIndex);
  };

  const handleConfirmCheckout = (p) => {
    setPendingCheckout(null);
    setTurnTotalInput('');
    handleOutcome(applyTotal(p.total, { dartsUsed: p.dartsUsed, finishedOnDouble: p.finishedOnDouble }), throwerIndex);
  };

  // Unlimited sessions (and abandoned ones) end by hand.
  const handleFinishEarly = () => {
    if (!session) return;
    clearBotTimers();
    const states = isMatch(session) ? session.players : [session];
    const hasVisits = states.some(s => s.legs.length > 0 || s.current.visits.length > 0);
    if (!hasVisits) {
      clearActiveSession();
      setSession(null);
      return;
    }
    finishSession({ ...session, finishedAt: Date.now() });
  };

  const playerName = (index) => {
    if (!session || !isMatch(session)) return myName;
    return session.settings.players[index]?.name || (index === 0 ? myName : opponentName);
  };

  const canUndoNow = session ? (isMatch(session) ? matchCanUndo(session) : canUndo(session)) : false;

  // Leg-by-leg rows for the summary, from the device owner's leg records
  // (in a match every leg leaves one record per player, so they line up).
  const legTable = (state) => {
    if (!state) return [];
    const scoreOf = (leg) => leg.visits.reduce((sum, v) => sum + v.score, 0);
    const row = (leg, n, won) => {
      const scored = scoreOf(leg);
      const lastDart = leg.visits.at(-1)?.dartsList?.at(-1);
      const out = `${t('practice.summary.out', { score: leg.checkout })}${lastDart && !lastDart.isTurnTotal ? ` · ${displayLabel(lastDart.label)}` : ''}`;
      return {
        n,
        won,
        darts: leg.darts || null,
        average: leg.darts ? ((scored / leg.darts) * 3).toFixed(1) : null,
        note: leg.byBullup ? t('practice.summary.byBullup') : won ? out : t('practice.summary.left', { score: leg.startRemaining - scored })
      };
    };
    if (isMatch(state)) {
      return state.legLog.map((log, i) => {
        const leg = state.players[0].legs[i];
        return leg ? row(leg, log.leg, log.winner === 0) : { n: log.leg, won: log.winner === 0, darts: null, average: null, note: '' };
      });
    }
    return state.legs.map((leg, i) => row(leg, i + 1, !leg.lost));
  };

  // ---- Summary -------------------------------------------------------------
  if (summary) {
    const s = summary.stats;
    const dash = t('practice.noStats');
    const pct = (v) => (v === null || v === undefined ? dash : `${v.toFixed(0)}%`);
    const duration = formatDuration(summary.startedAt, summary.finishedAt);
    const opponent = summary.settings.opponent;
    const legsTarget = summary.settings.legsTarget;
    const resultText = !opponent
      ? `${t(`practice.legCount${s.legs === 1 ? 'One' : 'Many'}`, { count: s.legs })} · ${s.average.toFixed(1)} ${t('practice.stats.average')}`
      : s.won === true
        ? t('practice.match.youWon', { for: s.legsFor, against: s.legsAgainst })
        : s.won === false
          ? t('practice.match.opponentWon', { name: opponent.name, for: s.legsFor, against: s.legsAgainst })
          : t('practice.match.abandoned', { for: s.legsFor, against: s.legsAgainst });
    const eyebrow = opponent && s.won === true ? t('practice.summary.matchWon')
      : opponent && s.won === false ? t('practice.summary.matchLost')
        : t('practice.sessionComplete');
    const legsText = legsTarget === null
      ? t('practice.setup.unlimited')
      : opponent ? `${t('practice.setup.firstTo')} ${legsTarget}` : t(`practice.legCount${legsTarget === 1 ? 'One' : 'Many'}`, { count: legsTarget });
    const legRows = legTable(finalState);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 text-foreground md:p-8">
        <PracticeSummaryBar subtitle={`${t('practice.games.x01.title')} · ${formatSessionDate(summary.finishedAt, language)}${duration ? ` · ${duration}` : ''}`} />
        <PracticeSummaryHeader
          icon={opponent ? Trophy : CheckCircle}
          eyebrow={eyebrow}
          title={resultText}
          meta={`${opponent ? `${t('practice.match.vs')} ${opponent.name} · ` : ''}${summary.settings.startingScore} · ${legsText}`}
          aside={opponent && legsTarget && (
            <LegPips won={s.legsFor} total={legsTarget} label={`${s.legsFor} ${t('match.legs')}`} className="text-primary" />
          )}
        >
          {opponent && s.opponent?.stats && t('practice.match.opponentAverage', { name: opponent.name, average: (s.opponent.stats.average ?? 0).toFixed(1) })}
        </PracticeSummaryHeader>
        <PracticeStatGrid
          cards={[
            [t('practice.stats.average'), s.average.toFixed(1), t(`practice.stats.darts${pluralSuffix(s.totalDarts)}`, { count: s.totalDarts })],
            [t('practice.stats.firstNine'), s.firstNineAverage.toFixed(1), s.bestLegDarts ? `${t('practice.stats.bestLeg')} ${t(`practice.stats.darts${pluralSuffix(s.bestLegDarts)}`, { count: s.bestLegDarts })}` : undefined],
            [t('practice.stats.checkout'), pct(s.checkoutPercent), `${s.checkoutsHit}/${s.checkoutAttempts}`]
          ]}
        />
        <PracticeBandRow
          label={t('practice.summary.highScores')}
          bands={[[t('practice.stats.oneEighties'), s.oneEighties], [t('practice.stats.oneForties'), s.oneForties], [t('practice.stats.tons'), s.tons]]}
        />
        <PracticeStatGrid
          cards={[
            [t('practice.stats.highestCheckout'), s.highestCheckout || dash],
            [t('practice.stats.highestVisit'), s.highestVisit || dash],
            [t('practice.stats.busts'), s.busts]
          ]}
        />
        {legRows.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem] gap-2 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{t('match.leg')}</span><span>{t('practice.match.result')}</span><span className="text-right">{t('practice.stats.darts')}</span><span className="text-right">{t('match.average')}</span>
            </div>
            {legRows.map((leg) => (
              <div key={leg.n} className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <span className="font-display text-xl font-bold text-muted-foreground tabular-nums">{leg.n}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <FormDots results={[leg.won]} />
                  <span className={cn('font-medium', leg.won && 'text-primary')}>{t(leg.won ? 'practice.summary.legWon' : 'practice.summary.legLost')}</span>
                  <span className="truncate text-xs text-muted-foreground">{leg.note}</span>
                </span>
                <span className="text-right tabular-nums">{leg.darts ?? dash}</span>
                <span className="text-right text-muted-foreground tabular-nums">{leg.average ?? dash}</span>
              </div>
            ))}
          </div>
        )}
        <PracticeSummaryActions onPlayAgain={handleStart} onChangeSettings={() => setSummary(null)} />
      </div>
    );
  }

  // ---- Setup ---------------------------------------------------------------
  if (!session) {
    const hasOpponent = settings.opponent !== null;
    const opponentKind = settings.opponent?.kind || 'solo';
    const legOptions = hasOpponent ? MATCH_LEG_OPTIONS : LEG_OPTIONS;
    const legIndex = Math.max(0, legOptions.indexOf(settings.legsTarget));
    const setOpponent = (opponent) => setSettings(s => ({
      ...s,
      opponent,
      legsTarget: opponent && !MATCH_LEG_OPTIONS.includes(s.legsTarget) ? DEFAULT_SETTINGS.legsTarget : s.legsTarget
    }));
    const pickOpponent = (kind) => setOpponent(
      kind === 'solo' ? null
        : kind === 'human' ? { kind: 'human', name: settings.opponent?.name || '' }
          : { kind: 'bot', level: settings.opponent?.level || 4 }
    );
    const setBotLevel = (level) => {
      if (!BOT_LEVELS.some(l => l.level === level)) return;
      setSettings(s => ({ ...s, opponent: { kind: 'bot', level } }));
    };
    const stepLegs = (delta) => setSettings(s => ({
      ...s,
      legsTarget: legOptions[Math.min(legOptions.length - 1, Math.max(0, legIndex + delta))]
    }));
    const legsText = hasOpponent
      ? `${t('practice.setup.firstTo')} ${settings.legsTarget}`
      : settings.legsTarget === null
        ? t('practice.setup.unlimited')
        : t(settings.legsTarget === 1 ? 'practice.legCountOne' : 'practice.legCountMany', { count: settings.legsTarget });
    const starterChip = !hasOpponent ? t('practice.setup.soloPractice')
      : settings.starter === 'bullup' ? t('practice.setup.bullupDecides')
        : settings.starter === 0 ? t('practice.setup.youThrowFirst')
          : t('practice.setup.throwsFirst', { name: opponentName });
    const pips = settings.legsTarget !== null && settings.legsTarget <= 9 && (
      <LegPips won={0} total={settings.legsTarget} label={legsText} />
    );
    const previewSide = (name, alignEnd) => (
      <div className={cn('flex min-w-0 flex-col gap-1.5', alignEnd ? 'items-end' : 'items-start')}>
        <span className="max-w-full truncate text-sm font-semibold">{name}</span>
        <span className="font-display text-[54px] font-semibold leading-[0.82] tabular-nums">{settings.startingScore}</span>
        {pips}
      </div>
    );

    // The game as it is set up right now: who, from what, how many legs.
    const preview = (
      <section aria-label={t('practice.setup.preview')} className="relative overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <BoardMotif className="-right-24 -top-28 w-56 opacity-[0.08] dark:opacity-[0.12]" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {t('practice.games.x01.title')} · {t('practice.setup.newGame')}
            </h1>
            <Badge variant="secondary" className="max-w-[60%] gap-1.5 truncate">
              {hasOpponent && settings.starter === 'bullup' ? <Target /> : <Flag />}
              <span className="truncate">{starterChip}</span>
            </Badge>
          </div>
          {hasOpponent ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2.5">
              {previewSide(myName, false)}
              <span className="pb-5 text-xs font-semibold text-muted-foreground">{t('practice.match.vs')}</span>
              {previewSide(opponentName, true)}
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{t('practice.setup.vsBoard')}</span>
                <span className="font-display text-[54px] font-semibold leading-[0.82] tabular-nums">{settings.startingScore}</span>
              </div>
              <div className="pb-1">
                {settings.legsTarget === null
                  ? <span className="text-xs text-muted-foreground">{t('practice.setup.unlimited')}</span>
                  : pips}
              </div>
            </div>
          )}
          <p className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t('practice.setup.doubleOut')}</span>
            <span>{legsText}</span>
            <span>{t(settings.scoringMode === 'turnTotal' ? 'practice.setup.scoringTurnTotal' : 'practice.setup.scoringDart')}</span>
          </p>
        </div>
      </section>
    );

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 text-foreground md:p-8">
        <PracticeScreenHeader />
        <PracticeSetup preview={preview} onStart={handleStart}>
          <PracticeField label={t('practice.setup.startingScore')}>
            <PracticeChips
              options={[...STARTING_SCORES, 'custom']}
              value={isCustomScore ? 'custom' : settings.startingScore}
              numeric={(o) => o !== 'custom'}
              render={(o) => (o === 'custom' ? t('practice.setup.custom') : o)}
              onChange={(o) => {
                setIsCustomScore(o === 'custom');
                if (o !== 'custom') setSettings(s => ({ ...s, startingScore: o }));
              }}
            />
            {isCustomScore && (
              <Input
                className="h-11 font-display text-xl tabular-nums"
                type="number"
                min="2"
                max="1001"
                inputMode="numeric"
                aria-label={t('practice.setup.custom')}
                placeholder="2–1001"
                value={STARTING_SCORES.includes(settings.startingScore) ? '' : settings.startingScore}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(n) && n >= 2 && n <= 1001) setSettings(s => ({ ...s, startingScore: n }));
                }}
              />
            )}
          </PracticeField>

          <PracticeField label={t('practice.setup.opponent')}>
            <PracticeChips
              options={['solo', 'human', 'bot']}
              value={opponentKind}
              onChange={pickOpponent}
              render={(kind) => (
                <>
                  {kind === 'solo' ? <User className="max-sm:hidden" /> : kind === 'human' ? <Users className="max-sm:hidden" /> : <Bot className="max-sm:hidden" />}
                  <span className="truncate">
                    {t(kind === 'solo' ? 'practice.setup.opponentSolo' : kind === 'human' ? 'practice.setup.opponentPlayer' : 'practice.setup.opponentBot')}
                  </span>
                </>
              )}
            />
            {settings.opponent?.kind === 'bot' && (
              <div className="flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 pt-1.5 pb-1">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="size-11" aria-label={t('practice.bot.easier')} disabled={settings.opponent.level <= BOT_LEVELS[0].level} onClick={() => setBotLevel(settings.opponent.level - 1)}>
                    <Minus />
                  </Button>
                  <div aria-live="polite" className="flex flex-1 flex-col items-center leading-tight">
                    <span className="font-display text-2xl font-bold">{t('practice.bot.name', { level: settings.opponent.level })}</span>
                    <span className="text-xs text-primary">{t('practice.bot.aboutAverage', { average: getBotLevel(settings.opponent.level).average })}</span>
                  </div>
                  <Button type="button" variant="outline" size="icon" className="size-11" aria-label={t('practice.bot.harder')} disabled={settings.opponent.level >= BOT_LEVELS.at(-1).level} onClick={() => setBotLevel(settings.opponent.level + 1)}>
                    <Plus />
                  </Button>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {BOT_LEVELS.map(l => (
                    <button
                      key={l.level}
                      type="button"
                      aria-label={`${t('practice.bot.name', { level: l.level })} · ~${l.average}`}
                      aria-pressed={settings.opponent.level === l.level}
                      className="flex min-h-8 items-center"
                      onClick={() => setBotLevel(l.level)}
                    >
                      <span className={cn('h-1.5 w-full rounded-full', l.level <= settings.opponent.level ? 'bg-primary' : 'bg-border')} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {settings.opponent?.kind === 'human' && (
              <Input
                type="text"
                className="h-11"
                maxLength={OPPONENT_NAME_MAX}
                aria-label={t('practice.setup.opponentName')}
                placeholder={t('practice.setup.opponentName')}
                value={settings.opponent.name}
                onChange={(e) => setSettings(s => ({ ...s, opponent: { kind: 'human', name: e.target.value } }))}
              />
            )}
          </PracticeField>

          <PracticeField
            label={hasOpponent ? t('practice.setup.firstTo') : t('practice.setup.legs')}
            hint={hasOpponent
              ? t('practice.setup.firstToHint')
              : settings.legsTarget === null ? t('practice.setup.legsUnlimitedHint') : t('practice.setup.legsHint')}
            aside={(
              <PracticeStepper
                value={settings.legsTarget === null ? '∞' : settings.legsTarget}
                label={hasOpponent ? t('practice.setup.firstTo') : t('practice.setup.legs')}
                decrementLabel={t('practice.setup.fewerLegs')}
                incrementLabel={t('practice.setup.moreLegs')}
                canDecrement={legIndex > 0}
                canIncrement={legIndex < legOptions.length - 1}
                onDecrement={() => stepLegs(-1)}
                onIncrement={() => stepLegs(1)}
              />
            )}
          />

          {hasOpponent && (
            <PracticeField label={t('practice.setup.starter')}>
              <PracticeChips
                options={['bullup', 0, 1]}
                value={settings.starter}
                numeric={false}
                onChange={(starter) => setSettings(s => ({ ...s, starter }))}
                render={(i) => (i === 'bullup'
                  ? <><Target /><span className="truncate">{t('practice.setup.starterBullup')}</span></>
                  : <span className="truncate">{i === 0 ? myName : opponentName}</span>)}
              />
            </PracticeField>
          )}

          <PracticeField label={t('practice.setup.scoringMode')}>
            <PracticeChips
              options={['dart', 'turnTotal']}
              value={settings.scoringMode}
              onChange={(scoringMode) => setSettings(s => ({ ...s, scoringMode }))}
              render={(mode) => t(mode === 'turnTotal' ? 'practice.setup.scoringTurnTotal' : 'practice.setup.scoringDart')}
            />
            <p className="text-xs text-muted-foreground">
              {t(settings.scoringMode === 'turnTotal' ? 'practice.setup.scoringTurnTotalHint' : 'practice.setup.scoringDartHint')}
            </p>
          </PracticeField>
        </PracticeSetup>
      </div>
    );
  }

  // ---- Play ----------------------------------------------------------------
  const remaining = liveRemaining(throwerState);
  const suggestion = throwerState.current.visit.darts.length === 0 ? checkoutData[String(remaining)] : null;
  const legWonText = (f) => {
    if (f.byBullup) return t('practice.match.legWonByBullup', { name: playerName(f.by) });
    if (f.by === undefined) return t(`practice.legWon${pluralSuffix(f.darts)}`, { count: f.darts });
    return t(`practice.match.legWonBy${pluralSuffix(f.darts)}`, { name: playerName(f.by), count: f.darts });
  };
  const boardFlash = flash?.type === 'bust'
    ? { tone: 'bad', text: t('practice.bust') }
    : flash?.type === 'legWon' ? { tone: 'good', text: legWonText(flash) } : null;

  const renderSoloBoard = () => {
    const stats = computeStats(session);
    const legDarts = session.current.visits.reduce((sum, v) => sum + v.darts, 0) + session.current.visit.darts.length;
    const labels = lastVisitLabels(session);
    return (
      <PracticeBoard flash={boardFlash}>
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <PracticeBoardLabel>{t('practice.remaining')}</PracticeBoardLabel>
            <PracticeBoardValue>{remaining}</PracticeBoardValue>
          </div>
          <PracticeLastThrows labels={labels} className="max-w-[45%] justify-end" />
        </div>
        <PracticeCheckoutHint route={suggestion} />
        <PracticeBoardStats
          items={[
            [t('practice.thisLeg'), legDarts],
            [t('practice.stats.legs'), session.legs.length],
            [t('practice.stats.checkout'), stats.checkoutPercent === null ? t('practice.noStats') : `${stats.checkoutPercent.toFixed(0)}%`]
          ]}
        />
      </PracticeBoard>
    );
  };

  const renderMatchBoard = () => (
    <PracticeBoard
      flash={boardFlash}
      className={cn('px-3 py-3', botBusy && 'cursor-pointer')}
      onClick={botBusy ? commitBotVisit : undefined}
      title={botBusy ? t('practice.bot.skip') : undefined}
    >
      <div className="grid w-full grid-cols-2 gap-2">
        {session.players.map((p, i) => {
          const isTurn = i === session.turn;
          const stats = computeStats(p);
          const labels = lastVisitLabels(p);
          const legDarts = p.current.visits.reduce((sum, v) => sum + v.darts, 0) + p.current.visit.darts.length;
          return (
            <div key={i} className={cn('flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3', isTurn && 'border-primary bg-primary text-primary-foreground shadow-md [&_[data-variant=outline]]:border-current/40 [&_[data-variant=outline]]:text-inherit')}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{playerName(i)}</span>
                <Badge variant="secondary" className="tabular-nums">{session.legsWon[i]}</Badge>
              </div>
              <div className="font-display text-5xl font-semibold leading-none tabular-nums sm:text-6xl">{isTurn ? remaining : p.current.remaining}</div>
              <PracticeLastThrows labels={labels} className="min-h-7" />
              <div className={cn('text-xs tabular-nums', isTurn ? 'opacity-85' : 'text-muted-foreground')}>
                {t('practice.stats.average')} <b className={cn('font-semibold', !isTurn && 'text-foreground')}>{stats.average.toFixed(1)}</b>
                {' · '}
                {t('practice.thisLeg')} <b className={cn('font-semibold', !isTurn && 'text-foreground')}>{t(`practice.stats.darts${pluralSuffix(legDarts)}`, { count: legDarts })}</b>
              </div>
              {isTurn && <Badge variant="secondary" className="mt-1">{t('practice.match.toThrow', { name: playerName(i) })}</Badge>}
            </div>
          );
        })}
      </div>
      <PracticeCheckoutHint route={botBusy ? null : suggestion} className="justify-center">
        {botBusy && <span className="text-sm font-medium text-muted-foreground">{t('practice.bot.skip')}</span>}
      </PracticeCheckoutHint>
      {bothReachedBullupThreshold && !flash && (
        <Alert className="flex flex-wrap items-center gap-2">
          <Target />
          <AlertDescription className="flex-1">{t('match.bullup.offer')}</AlertDescription>
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={(e) => { e.stopPropagation(); setShowBullup(true); }}>
            <Target />
            {t('match.bullup.decideButton')}
          </Button>
        </Alert>
      )}
    </PracticeBoard>
  );

  const metaLeg = isMatch(session)
    ? `${t('practice.leg', { current: session.legNumber })} · ${t('practice.setup.firstTo')} ${session.settings.legsTarget}`
    : session.settings.legsTarget === null
      ? t('practice.leg', { current: session.legs.length + 1 })
      : t('practice.legOf', { current: session.legs.length + 1, total: session.settings.legsTarget });

  return (
    <PracticePlay
      onFinish={handleFinishEarly}
      title={`${t('practice.games.x01.title')} · ${metaLeg}`}
      subtitle={isMatch(session)
        ? t('practice.match.toThrow', { name: playerName(session.turn) })
        : <>{t('practice.stats.average')} <b>{computeStats(session).average.toFixed(1)}</b></>}
    >
      <CheckoutDialog
        pending={pendingCheckout}
        onChange={setPendingCheckout}
        onCancel={() => setPendingCheckout(null)}
        onConfirm={handleConfirmCheckout}
      />

      {isMatch(session) && session.starterPending && (
        <StarterDialog
          players={session.players.map((_, i) => ({ name: playerName(i), legs: session.legsWon[i] }))}
          scoringMode={session.settings.scoringMode}
          onScoringModeChange={handleStarterScoringMode}
          onSelect={handleStarterPick}
        />
      )}
      {isMatch(session) && (
        <BullupDialog
          open={showBullup}
          onOpenChange={(open) => { if (!open) setShowBullup(false); }}
          players={session.players.map((_, i) => ({ name: playerName(i) }))}
          onPick={handleBullupPick}
        />
      )}

      {isMatch(session) ? renderMatchBoard() : renderSoloBoard()}

      <PracticeKeypad>
        {session.settings.scoringMode === 'dart' ? (
          <DartKeypad
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            onDart={handleDart}
            onUndo={handleUndo}
            dartsInVisit={throwerState.current.visit.darts.length}
            canUndo={canUndoNow && !botBusy}
            disabled={flash !== null || botBusy}
          />
        ) : (
          <TurnTotalKeypad
            value={turnTotalInput}
            onChange={(next) => { hapticTap(); setTurnTotalInput(next); }}
            onSubmit={handleTurnTotal}
            onUndo={handleUndo}
            canUndo={canUndoNow && !botBusy}
            useOnScreenKeypad={isOnScreenKeypad}
            showQuickScores
            disabled={flash !== null || botBusy || pendingCheckout !== null}
          />
        )}
      </PracticeKeypad>
    </PracticePlay>
  );
}

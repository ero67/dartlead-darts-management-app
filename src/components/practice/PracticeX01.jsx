import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Flag, Keyboard, Target, Trophy, Users } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DartKeypad } from '../scoring/DartKeypad';
import { TurnTotalKeypad } from '../scoring/TurnTotalKeypad';
import { CheckoutDialog } from '../scoring/CheckoutDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatTile } from '../shared/StatTile';
import {
  PracticeScreenHeader, PracticeSetup, PracticeField, PracticeOptionCards, PracticeChips,
  PracticeSummaryHeader, PracticeSummaryActions, PracticePlay, PracticeBoard, PracticeBoardLabel,
  PracticeBoardValue, PracticeCheckoutHint, PracticeLastThrows, PracticeBoardStats, PracticeKeypad
} from './PracticeShared';
import { cn } from '@/lib/utils';
import {
  createSoloX01, applyDart, applyVisitTotal, undo, canUndo, dartFromInput,
  liveRemaining, lastVisitLabels, computeStats, STARTING_SCORES
} from '../../lib/x01Engine';
import {
  createX01Match, matchApplyDart, matchApplyVisitTotal, matchUndoHuman, matchCanUndo,
  matchApplySequence, isBotTurn, currentPlayerState, computeMatchStats, isMatch, MATCH_LEG_OPTIONS
} from '../../lib/x01Match';
import { BOT_LEVELS, getBotLevel, botThrow, newSeed } from '../../lib/botPlayer';
import {
  loadActiveSession, saveActiveSession, clearActiveSession, appendHistory,
  newSessionId, loadGameSettings, saveGameSettings
} from '../../lib/practiceStorage';
import { describeSession, formatDuration, pluralSuffix } from '../../lib/practiceGames';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { useOnScreenKeypad } from '../../hooks/useOnScreenKeypad';
import { hapticTap, hapticBust, hapticLegWon, hapticMatchWon } from '../../lib/haptics';
import checkoutData from '../../data/checkouts.json';

const GAME = 'x01';
const LEG_OPTIONS = [1, 2, 3, 4, 5, 10, null];
const DEFAULT_SETTINGS = { startingScore: 501, legsTarget: 3, scoringMode: 'dart', opponent: null, starter: 0 };
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
  const starter = saved.starter === 1 ? 1 : 0;
  return { startingScore, legsTarget, scoringMode, opponent, starter };
};

// X01 practice: solo against the board, or two people taking turns on one
// device. setup → play → summary. The session in progress is persisted on
// every change so leaving the screen (or a crash) never loses a leg.
export function PracticeX01() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isOnScreenKeypad = useOnScreenKeypad();

  const [session, setSession] = useState(() => {
    const active = loadActiveSession();
    return active?.game === GAME ? active.state : null;
  });
  const [settings, setSettings] = useState(() => sanitizeSettings(session?.settings || loadGameSettings(GAME)));
  const [summary, setSummary] = useState(null);
  const [inputMode, setInputMode] = useState('single');
  const [turnTotalInput, setTurnTotalInput] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [flash, setFlash] = useState(null); // { type: 'bust' } | { type: 'legWon', darts, by }
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

  // ---- Summary -------------------------------------------------------------
  if (summary) {
    const s = summary.stats;
    const pct = (v) => (v === null || v === undefined ? t('practice.noStats') : `${v.toFixed(0)}%`);
    const cards = [
      [t('practice.stats.average'), s.average.toFixed(1)],
      [t('practice.stats.firstNine'), s.firstNineAverage.toFixed(1)],
      [t('practice.stats.checkout'), `${pct(s.checkoutPercent)} (${s.checkoutsHit}/${s.checkoutAttempts})`],
      [t('practice.stats.legs'), s.legs],
      [t('practice.stats.darts'), s.totalDarts],
      [t('practice.stats.bestLeg'), s.bestLegDarts ?? t('practice.noStats')],
      [t('practice.stats.highestCheckout'), s.highestCheckout || t('practice.noStats')],
      [t('practice.stats.highestVisit'), s.highestVisit || t('practice.noStats')],
      [t('practice.stats.oneEighties'), s.oneEighties],
      [t('practice.stats.oneForties'), s.oneForties],
      [t('practice.stats.tons'), s.tons],
      [t('practice.stats.busts'), s.busts]
    ];
    const duration = formatDuration(summary.startedAt, summary.finishedAt);
    const opponent = summary.settings.opponent;
    const resultText = !opponent
      ? t('practice.sessionComplete')
      : s.won === true
        ? t('practice.match.youWon', { for: s.legsFor, against: s.legsAgainst })
        : s.won === false
          ? t('practice.match.opponentWon', { name: opponent.name, for: s.legsFor, against: s.legsAgainst })
          : t('practice.match.abandoned', { for: s.legsFor, against: s.legsAgainst });
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
        <PracticeSummaryHeader icon={opponent ? Trophy : CheckCircle} title={resultText}>
          <p className="text-sm text-muted-foreground">
            {summary.settings.startingScore}
            {opponent && ` · ${t('practice.match.vs')} ${opponent.name}`}
            {duration && ` · ${duration}`}
          </p>
          {opponent && s.opponent?.stats && (
            <p className="text-sm text-muted-foreground">
              {t('practice.match.opponentAverage', { name: opponent.name, average: (s.opponent.stats.average ?? 0).toFixed(1) })}
            </p>
          )}
        </PracticeSummaryHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([label, value]) => <StatTile key={label} label={label} value={value} />)}
        </div>
        <PracticeSummaryActions onPlayAgain={handleStart} onChangeSettings={() => setSummary(null)} />
      </div>
    );
  }

  // ---- Setup ---------------------------------------------------------------
  if (!session) {
    const isPreset = STARTING_SCORES.includes(settings.startingScore);
    const hasOpponent = settings.opponent !== null;
    const legOptions = hasOpponent ? MATCH_LEG_OPTIONS : LEG_OPTIONS;
    const setOpponent = (opponent) => setSettings(s => ({
      ...s,
      opponent,
      legsTarget: opponent && !MATCH_LEG_OPTIONS.includes(s.legsTarget) ? DEFAULT_SETTINGS.legsTarget : s.legsTarget
    }));
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
        <PracticeScreenHeader title={t('practice.games.x01.title')} description={t('practice.games.x01.desc')} />
        <PracticeSetup
          title={t('practice.setup.title')}
          subtitle={t('practice.setup.subtitle')}
          recap={describeSession({ game: GAME, settings }, t)}
          onStart={handleStart}
        >
          <PracticeField
            icon={Target}
            label={t('practice.setup.startingScore')}
            value={settings.startingScore}
          >
            <div className="flex flex-wrap items-center gap-2">
              <PracticeChips
                options={STARTING_SCORES}
                value={settings.startingScore}
                onChange={(startingScore) => setSettings(s => ({ ...s, startingScore }))}
              />
              <Input
                className="h-11 w-28 rounded-full border-dashed text-center font-medium tabular-nums"
                type="number"
                min="2"
                max="1001"
                inputMode="numeric"
                placeholder={t('practice.setup.custom')}
                value={isPreset ? '' : settings.startingScore}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(n) && n >= 2 && n <= 1001) setSettings(s => ({ ...s, startingScore: n }));
                }}
              />
            </div>
          </PracticeField>

          <PracticeField
            icon={Users}
            label={t('practice.setup.opponent')}
            hint={t('practice.setup.opponentHint')}
            value={
              settings.opponent?.kind === 'bot'
                ? `${t('practice.setup.opponentBot')} ${settings.opponent.level}`
                : settings.opponent?.kind === 'human'
                  ? (settings.opponent.name || t('practice.setup.opponentPlayer'))
                  : t('practice.setup.opponentSolo')
            }
          >
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={!hasOpponent ? 'default' : 'outline'}
                aria-pressed={!hasOpponent}
                className="min-h-11 rounded-full px-4"
                onClick={() => setOpponent(null)}
              >
                {t('practice.setup.opponentSolo')}
              </Button>
              <Button
                type="button"
                variant={settings.opponent?.kind === 'human' ? 'default' : 'outline'}
                aria-pressed={settings.opponent?.kind === 'human'}
                className="min-h-11 rounded-full px-4"
                onClick={() => setOpponent({ kind: 'human', name: settings.opponent?.name || '' })}
              >
                {t('practice.setup.opponentPlayer')}
              </Button>
              <Button
                type="button"
                variant={settings.opponent?.kind === 'bot' ? 'default' : 'outline'}
                aria-pressed={settings.opponent?.kind === 'bot'}
                className="min-h-11 rounded-full px-4"
                onClick={() => setOpponent({ kind: 'bot', level: settings.opponent?.level || 4 })}
              >
                {t('practice.setup.opponentBot')}
              </Button>
            </div>
            {settings.opponent?.kind === 'bot' && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {BOT_LEVELS.map(l => (
                    <Button
                      key={l.level}
                      type="button"
                      variant={settings.opponent.level === l.level ? 'default' : 'outline'}
                      aria-pressed={settings.opponent.level === l.level}
                      className="h-auto min-h-11 min-w-14 flex-col gap-0 rounded-full px-3 py-1.5 leading-tight tabular-nums"
                      onClick={() => setSettings(s => ({ ...s, opponent: { kind: 'bot', level: l.level } }))}
                    >
                      {l.level}<small className="text-[0.7rem] font-medium opacity-75">~{l.average}</small>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('practice.bot.levelHint', { level: settings.opponent.level, average: getBotLevel(settings.opponent.level).average })}
                </p>
              </div>
            )}
            {settings.opponent?.kind === 'human' && (
              <Input
                type="text"
                maxLength={OPPONENT_NAME_MAX}
                placeholder={t('practice.setup.opponentName')}
                value={settings.opponent.name}
                onChange={(e) => setSettings(s => ({ ...s, opponent: { kind: 'human', name: e.target.value } }))}
              />
            )}
          </PracticeField>

          <PracticeField
            icon={Trophy}
            label={hasOpponent ? t('practice.setup.firstTo') : t('practice.setup.legs')}
            value={settings.legsTarget === null ? t('practice.setup.unlimited') : settings.legsTarget}
          >
            <PracticeChips
              options={legOptions}
              value={settings.legsTarget}
              onChange={(legsTarget) => setSettings(s => ({ ...s, legsTarget }))}
              render={(legs) => (legs === null ? t('practice.setup.unlimited') : legs)}
            />
          </PracticeField>

          {hasOpponent && (
            <PracticeField
              icon={Flag}
              label={t('practice.setup.starter')}
              value={settings.starter === 0 ? myName : opponentName}
            >
              <PracticeChips
                options={[0, 1]}
                value={settings.starter}
                onChange={(starter) => setSettings(s => ({ ...s, starter }))}
                render={(i) => (i === 0 ? myName : opponentName)}
              />
            </PracticeField>
          )}

          <PracticeField
            icon={Keyboard}
            label={t('practice.setup.scoringMode')}
            value={t(settings.scoringMode === 'turnTotal' ? 'practice.setup.scoringTurnTotal' : 'practice.setup.scoringDart')}
          >
            <PracticeOptionCards
              options={[
                { value: 'dart', label: t('practice.setup.scoringDart'), hint: t('practice.setup.scoringDartHint') },
                { value: 'turnTotal', label: t('practice.setup.scoringTurnTotal'), hint: t('practice.setup.scoringTurnTotalHint') }
              ]}
              value={settings.scoringMode}
              onChange={(scoringMode) => setSettings(s => ({ ...s, scoringMode }))}
            />
          </PracticeField>
        </PracticeSetup>
      </div>
    );
  }

  // ---- Play ----------------------------------------------------------------
  const remaining = liveRemaining(throwerState);
  const suggestion = throwerState.current.visit.darts.length === 0 ? checkoutData[String(remaining)] : null;
  const legWonText = (f) => {
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
        <PracticeBoardLabel>{t('practice.remaining')}</PracticeBoardLabel>
        <PracticeBoardValue>{remaining}</PracticeBoardValue>
        <PracticeCheckoutHint>{suggestion ? suggestion.join(' → ') : ''}</PracticeCheckoutHint>
        <PracticeLastThrows labels={labels} />
        <PracticeBoardStats
          items={[
            [t('practice.thisLeg'), t(`practice.stats.darts${pluralSuffix(legDarts)}`, { count: legDarts })],
            [t('practice.stats.legs'), session.legs.length],
            ...(stats.checkoutPercent !== null ? [[t('practice.stats.checkout'), `${stats.checkoutPercent.toFixed(0)}%`]] : [])
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
          return (
            <div key={i} className={cn('flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3', isTurn && 'ring-1 ring-primary border-primary')}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{playerName(i)}</span>
                <Badge variant="secondary" className="tabular-nums">{session.legsWon[i]}</Badge>
              </div>
              <div className="text-5xl font-semibold leading-none tracking-tight tabular-nums sm:text-6xl">{isTurn ? remaining : p.current.remaining}</div>
              <PracticeLastThrows labels={labels} className="min-h-7" />
              <div className="text-xs text-muted-foreground">{t('practice.stats.average')} <b className="font-semibold text-foreground tabular-nums">{stats.average.toFixed(1)}</b></div>
              {isTurn && <Badge className="mt-1">{t('practice.match.toThrow', { name: playerName(i) })}</Badge>}
            </div>
          );
        })}
      </div>
      <PracticeCheckoutHint>
        {botBusy ? <span className="text-sm font-medium text-muted-foreground">{t('practice.bot.skip')}</span> : (suggestion ? suggestion.join(' → ') : '')}
      </PracticeCheckoutHint>
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
      meta={
        <>
          <span>{metaLeg}</span>
          {isMatch(session)
            ? <span>{t('practice.match.toThrow', { name: playerName(session.turn) })}</span>
            : <span>{t('practice.stats.average')} <b>{computeStats(session).average.toFixed(1)}</b></span>}
        </>
      }
    >
      <CheckoutDialog
        pending={pendingCheckout}
        onChange={setPendingCheckout}
        onCancel={() => setPendingCheckout(null)}
        onConfirm={handleConfirmCheckout}
      />

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
            disabled={flash !== null || botBusy}
          />
        )}
      </PracticeKeypad>
    </PracticePlay>
  );
}

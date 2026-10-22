import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bot, ChevronsRight, Flag, Target, Trophy, Users } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { StarterDialog } from '../match/MatchDialogs';
import { CricketBoard } from '../cricket/CricketBoard';
import { CricketPad } from '../cricket/CricketPad';
import { CricketMarksTable } from '../cricket/CricketMarksTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BoardMotif, FormDots, LegPips } from '../shared/DartsAccents';
import {
  PracticeScreenHeader, PracticeSetup, PracticeField, PracticeChips, PracticeStepper, PracticeBotLevelPicker,
  PracticeSummaryBar, PracticeSummaryHeader, PracticeSummaryActions, PracticeStatGrid,
  PracticePlay, PracticeBoard, PracticeKeypad
} from './PracticeShared';
import { cn } from '@/lib/utils';
import {
  createCricketMatch, cricketApplyDart, cricketEndVisit, cricketSetStarter, cricketCanUndo, cricketUndoHuman,
  isCricketBotTurn, cricketBotVisit, computeCricketStats, mprOf, CRICKET_LEG_OPTIONS
} from '../../lib/cricket';
import { dartFromInput, displayLabel } from '../../lib/x01Engine';
import { BOT_LEVELS, getBotLevel, newSeed } from '../../lib/botPlayer';
import { formatDuration, formatSessionDate, pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { hapticTap, hapticLegWon } from '../../lib/haptics';

const GAME = 'cricket';
const DEFAULT_SETTINGS = { legsTarget: 3, opponent: { kind: 'bot', level: 4 }, starter: 'bullup' };
const FLASH_MS = 900;
const BOT_DART_MS = 700;
const OPPONENT_NAME_MAX = 30;
// Bot MPR per level: bot vs same-level bot, 300 single legs each through
// cricketBotVisit (scratch simulation, 2026-10-22). Re-measure if the bot
// strategy in lib/cricket.js or the BOT_LEVELS sigmas change.
const BOT_MPR = { 1: 1.3, 2: 1.7, 3: 2.2, 4: 2.6, 5: 3.0, 6: 3.4, 7: 4.3, 8: 4.8 };

// Saved settings, or a resumed session's engine settings ({ players }), back
// to the setup shape. Cricket is always a match: a friend or a bot.
const sanitizeSettings = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const other = saved.opponent || saved.players?.[1];
  const opponent = other?.kind === 'human'
    ? { kind: 'human', name: String(other.name || '').slice(0, OPPONENT_NAME_MAX) }
    : { kind: 'bot', level: BOT_LEVELS.some(l => l.level === other?.level) ? other.level : 4 };
  const legsTarget = CRICKET_LEG_OPTIONS.includes(saved.legsTarget) ? saved.legsTarget : DEFAULT_SETTINGS.legsTarget;
  const starter = saved.starter === 1 ? 1 : saved.starter === 0 ? 0 : 'bullup';
  return { legsTarget, opponent, starter };
};

// Practice entries keep the darts under the key every practice summary sums.
const entryStats = ({ darts, ...rest }) => ({ ...rest, totalDarts: darts });

// History entry, same convention as an X01 match: the device owner's stats at
// the top level, the opponent's underneath. Compact: no per-dart logs.
const buildEntry = (state) => {
  const ms = computeCricketStats(state);
  const [me, other] = state.settings.players;
  return {
    settings: {
      legsTarget: state.settings.legsTarget,
      opponent: { kind: other.kind, name: other.name, level: other.level ?? null },
      starter: state.settings.starter,
      myName: me.name
    },
    stats: {
      ...entryStats(ms.players[0]),
      legsFor: ms.legsFor,
      legsAgainst: ms.legsAgainst,
      won: ms.won,
      opponent: { name: other.name, stats: entryStats(ms.players[1]) }
    }
  };
};

const hasThrown = (state) => state.legLog.length > 0 || state.totals.some(x => x.darts > 0);

// Cricket practice: two people on one device, or against a bot.
// setup → play → summary; the match in progress is saved on every change.
export function PracticeCricket() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard } = usePracticeSession(GAME, {
    defaultSettings: DEFAULT_SETTINGS,
    sanitize: sanitizeSettings,
    buildEntry
  });
  // The finished state behind `summary`, for the leg table (not persisted).
  const [finalState, setFinalState] = useState(null);
  const [input, setInput] = useState('board'); // 'board' | 'pad'
  const [flash, setFlash] = useState(null); // { by, darts, byBullup? }
  const flashTimer = useRef(null);
  const finishTimer = useRef(null); // pending summary after the winning dart
  // Bot visit in flight: timers animating the darts and the state to commit
  const botTimers = useRef([]);
  const pendingBot = useRef(null);

  useKeepScreenAwake(session !== null && summary === null);

  const clearBotTimers = () => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
    pendingBot.current = null;
  };
  useEffect(() => () => { clearTimeout(flashTimer.current); clearTimeout(finishTimer.current); clearBotTimers(); }, []);

  const myName = (user && getUserDisplayName(user)) || t('practice.setup.you');
  const botName = (level) => t('practice.bot.name', { level });
  const opponentName = settings.opponent.kind === 'bot'
    ? botName(settings.opponent.level)
    : settings.opponent.name.trim() || t('practice.setup.opponentPlayer');
  const playerName = (i) => session?.settings.players[i]?.name || (i === 0 ? myName : opponentName);

  const showFlash = (value) => {
    clearTimeout(flashTimer.current);
    setFlash(value);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const finishSession = (state) => {
    setFinalState(state);
    finish(state);
  };

  // Leg / match won: flash who took it, then (match) let it land before the summary.
  const handleResult = (state, outcome) => {
    if (outcome === 'leg' || outcome === 'match') {
      const log = state.legLog.at(-1);
      hapticLegWon();
      showFlash({ by: log.winner, darts: log.darts });
    }
    setSession(state);
    if (state.finishedAt) finishTimer.current = setTimeout(() => finishSession(state), FLASH_MS);
  };

  const handleStart = () => {
    clearTimeout(finishTimer.current);
    clearBotTimers();
    setFlash(null);
    start((s) => createCricketMatch({
      legsTarget: s.legsTarget,
      players: [
        { id: 'me', name: myName, kind: 'human' },
        s.opponent.kind === 'bot'
          ? { id: 'bot', name: botName(s.opponent.level), kind: 'bot', level: s.opponent.level }
          : { id: 'p2', name: opponentName, kind: 'human' }
      ],
      starter: s.starter,
      seed: newSeed()
    }));
  };

  const botBusy = !!(session && isCricketBotTurn(session));

  // Commit the bot's visit (after the animation, or at once when skipped).
  const commitBotVisit = () => {
    const pending = pendingBot.current;
    if (!pending) return;
    clearBotTimers();
    handleResult(pending.final, pending.outcome);
  };

  // The bot's turn: throw the whole visit, show the darts one by one and
  // commit it as one undo step.
  useEffect(() => {
    if (!session || !isCricketBotTurn(session) || flash || summary) return undefined;
    if (botTimers.current.length > 0) return undefined; // already animating
    const { states, final } = cricketBotVisit(session, getBotLevel(session.settings.players[session.turn].level));
    if (states.length === 0) return undefined;
    const outcome = final.finishedAt ? 'match' : final.legNumber !== session.legNumber ? 'leg' : 'visit';
    pendingBot.current = { final, outcome };
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

  const isLocked = !session || session.finishedAt || session.starterPending || flash || botBusy;

  const handleDart = (dart) => {
    if (isLocked || !dart) return;
    hapticTap();
    const { state, outcome } = cricketApplyDart(session, dart);
    if (outcome !== null) handleResult(state, outcome);
  };

  const handleEndVisit = () => {
    if (isLocked || session.leg.visit.darts.length === 0) return;
    hapticTap();
    setSession(cricketEndVisit(session));
  };

  const handleUndo = () => {
    if (!session || flash || botBusy) return;
    hapticTap();
    setSession(cricketUndoHuman(session));
  };

  const handleFinishEarly = () => {
    if (!session) return;
    clearTimeout(finishTimer.current);
    clearBotTimers();
    if (!hasThrown(session)) {
      discard();
      return;
    }
    finishSession({ ...session, finishedAt: Date.now() });
  };

  // ---- Summary -------------------------------------------------------------
  if (summary) {
    const s = summary.stats;
    const dash = t('practice.noStats');
    const opponent = summary.settings.opponent;
    const legsTarget = summary.settings.legsTarget;
    const duration = formatDuration(summary.startedAt, summary.finishedAt);
    const scores = { name: opponent.name, for: s.legsFor, against: s.legsAgainst };
    const resultText = s.won === true ? t('practice.match.youWon', scores)
      : s.won === false ? t('practice.match.opponentWon', scores)
        : t('practice.match.abandoned', scores);
    const eyebrow = s.won === true ? t('practice.summary.matchWon')
      : s.won === false ? t('practice.summary.matchLost')
        : t('practice.sessionComplete');
    const legRows = (finalState?.legLog || []).map((log) => ({
      n: log.leg,
      won: log.winner === 0,
      darts: log.playerDarts[0] || null,
      mpr: log.playerDarts[0] ? mprOf(log.playerMarks[0], log.playerDarts[0]).toFixed(2) : null,
      note: log.byBullup ? t('practice.summary.byBullup') : t('practice.cricket.points', { a: log.points[0], b: log.points[1] })
    }));
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 text-foreground md:p-8">
        <PracticeSummaryBar subtitle={`${t('practice.games.cricket.title')} · ${formatSessionDate(summary.finishedAt, language)}${duration ? ` · ${duration}` : ''}`} />
        <PracticeSummaryHeader
          icon={Trophy}
          eyebrow={eyebrow}
          title={resultText}
          meta={`${t('practice.match.vs')} ${opponent.name} · ${t('practice.setup.firstTo')} ${legsTarget}`}
          aside={<LegPips won={s.legsFor} total={legsTarget} label={`${s.legsFor} ${t('match.legs')}`} className="text-primary" />}
        >
          {s.opponent?.stats && t('practice.cricket.opponentMpr', { name: opponent.name, mpr: (s.opponent.stats.mpr ?? 0).toFixed(2) })}
        </PracticeSummaryHeader>
        <PracticeStatGrid
          cards={[
            [t('common.mpr'), s.mpr.toFixed(2), t('practice.cricket.stats.marksDarts', { marks: s.marks, darts: s.totalDarts })],
            [t('practice.cricket.stats.bestVisit'), s.bestVisit || dash, s.bestVisit ? t('common.marks') : undefined],
            [t('practice.cricket.stats.fiveMarkVisits'), s.fiveMarkVisits, s.nineMarkVisits ? t('practice.cricket.stats.nineMarkVisits', { count: s.nineMarkVisits }) : undefined]
          ]}
        />
        {legRows.length > 0 && (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem] gap-2 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{t('match.leg')}</span><span>{t('practice.match.result')}</span><span className="text-right">{t('practice.stats.darts')}</span><span className="text-right">{t('common.mpr')}</span>
            </div>
            {legRows.map((leg) => (
              <div key={leg.n} className="grid grid-cols-[2.5rem_1fr_3.5rem_3.5rem] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
                <span className="font-display text-xl font-bold text-muted-foreground tabular-nums">{leg.n}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <FormDots results={[leg.won]} />
                  <span className={cn('font-medium', leg.won && 'text-primary')}>{t(leg.won ? 'practice.summary.legWon' : 'practice.summary.legLost')}</span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">{leg.note}</span>
                </span>
                <span className="text-right tabular-nums">{leg.darts ?? dash}</span>
                <span className="text-right text-muted-foreground tabular-nums">{leg.mpr ?? dash}</span>
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
    const legIndex = Math.max(0, CRICKET_LEG_OPTIONS.indexOf(settings.legsTarget));
    const legsText = `${t('practice.setup.firstTo')} ${settings.legsTarget}`;
    const pickOpponent = (kind) => setSettings(s => ({
      ...s,
      opponent: kind === 'human' ? { kind: 'human', name: '' } : { kind: 'bot', level: 4 }
    }));
    const setBotLevel = (level) => {
      if (!BOT_LEVELS.some(l => l.level === level)) return;
      setSettings(s => ({ ...s, opponent: { kind: 'bot', level } }));
    };
    const stepLegs = (delta) => setSettings(s => ({
      ...s,
      legsTarget: CRICKET_LEG_OPTIONS[Math.min(CRICKET_LEG_OPTIONS.length - 1, Math.max(0, legIndex + delta))]
    }));
    const starterChip = settings.starter === 'bullup' ? t('practice.setup.bullupDecides')
      : settings.starter === 0 ? t('practice.setup.youThrowFirst')
        : t('practice.setup.throwsFirst', { name: opponentName });
    const previewSide = (name, alignEnd) => (
      <div className={cn('flex min-w-0 flex-col gap-1.5', alignEnd ? 'items-end' : 'items-start')}>
        <span className="max-w-full truncate text-sm font-semibold">{name}</span>
        <span className="font-display text-[54px] font-semibold leading-[0.82] tabular-nums">0</span>
        {settings.legsTarget <= 9 && <LegPips won={0} total={settings.legsTarget} label={legsText} />}
      </div>
    );

    const preview = (
      <section aria-label={t('practice.setup.preview')} className="relative overflow-hidden rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
        <BoardMotif className="-right-24 -top-28 w-56 opacity-[0.08] dark:opacity-[0.12]" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {t('practice.games.cricket.title')} · {t('practice.setup.newGame')}
            </h1>
            <Badge variant="secondary" className="max-w-[60%] gap-1.5 truncate">
              {settings.starter === 'bullup' ? <Target /> : <Flag />}
              <span className="truncate">{starterChip}</span>
            </Badge>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2.5">
            {previewSide(myName, false)}
            <span className="pb-5 text-xs font-semibold text-muted-foreground">{t('practice.match.vs')}</span>
            {previewSide(opponentName, true)}
          </div>
          <p className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t('practice.cricket.rules')}</span>
            <span>{legsText}</span>
          </p>
        </div>
      </section>
    );

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 text-foreground md:p-8">
        <PracticeScreenHeader />
        <PracticeSetup preview={preview} onStart={handleStart}>
          <PracticeField label={t('practice.setup.opponent')}>
            <PracticeChips
              options={['human', 'bot']}
              value={settings.opponent.kind}
              onChange={pickOpponent}
              render={(kind) => (
                <>
                  {kind === 'human' ? <Users /> : <Bot />}
                  <span className="truncate">{t(kind === 'human' ? 'practice.setup.opponentPlayer' : 'practice.setup.opponentBot')}</span>
                </>
              )}
            />
            {settings.opponent.kind === 'bot' ? (
              <PracticeBotLevelPicker
                level={settings.opponent.level}
                levels={BOT_LEVELS}
                describe={(level) => t('practice.cricket.aboutMpr', { mpr: BOT_MPR[level].toFixed(1) })}
                onChange={setBotLevel}
              />
            ) : (
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
            label={t('practice.setup.firstTo')}
            hint={t('practice.setup.firstToHint')}
            aside={(
              <PracticeStepper
                value={settings.legsTarget}
                label={t('practice.setup.firstTo')}
                decrementLabel={t('practice.setup.fewerLegs')}
                incrementLabel={t('practice.setup.moreLegs')}
                canDecrement={legIndex > 0}
                canIncrement={legIndex < CRICKET_LEG_OPTIONS.length - 1}
                onDecrement={() => stepLegs(-1)}
                onIncrement={() => stepLegs(1)}
              />
            )}
          />

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
        </PracticeSetup>
      </div>
    );
  }

  // ---- Play ----------------------------------------------------------------
  const { leg, turn } = session;
  const isBotMatch = session.settings.players.some(p => p.kind === 'bot');
  // Against a bot the board keeps the human's colours; 1v1 it turns with the thrower.
  const viewer = isBotMatch ? 0 : turn;
  const visitDarts = leg.visit.darts;
  const lastVisit = (i) => leg.visits.filter(v => v.player === i).at(-1);
  const canUndoNow = cricketCanUndo(session) && !botBusy;
  const boardFlash = flash ? {
    tone: 'good',
    text: flash.darts
      ? t(`practice.match.legWonBy${pluralSuffix(flash.darts)}`, { name: playerName(flash.by), count: flash.darts })
      : t('practice.match.legWonByBullup', { name: playerName(flash.by) })
  } : null;

  // Name, legs, points and MPR per player; the darts of the visit in progress
  // (or their last visit) underneath.
  const playerCard = (i) => {
    const isTurn = i === turn && !session.finishedAt;
    const darts = isTurn && visitDarts.length ? visitDarts : (lastVisit(i)?.darts || []);
    return (
      <div key={i} className={cn('flex min-w-0 flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2', isTurn && 'border-primary bg-primary text-primary-foreground shadow-md')}>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{playerName(i)}</span>
          <Badge variant="secondary" className="tabular-nums" aria-label={`${session.legsWon[i]} ${t('match.legs')}`}>{session.legsWon[i]}</Badge>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="font-display text-5xl font-semibold leading-[0.85] tabular-nums" aria-label={`${leg.points[i]} ${t('common.points')}`}>{leg.points[i]}</span>
          <span className={cn('text-xs tabular-nums', isTurn ? 'opacity-85' : 'text-muted-foreground')}>
            {t('common.mpr')} <b className={cn('font-semibold', !isTurn && 'text-foreground')}>{mprOf(session.totals[i].marks, session.totals[i].darts).toFixed(2)}</b>
          </span>
        </div>
        <div className="flex h-6 gap-1">
          {darts.map((label, k) => (
            <span key={k} className={cn('flex min-w-9 items-center justify-center rounded-md border px-1 text-xs font-semibold tabular-nums', isTurn ? 'border-current/40' : 'bg-background')}>{displayLabel(label)}</span>
          ))}
        </div>
      </div>
    );
  };

  const actionKey = 'h-12 flex-1 font-medium';
  return (
    <PracticePlay
      onFinish={handleFinishEarly}
      title={`${t('practice.games.cricket.title')} · ${t('practice.leg', { current: session.legNumber })} · ${t('practice.setup.firstTo')} ${session.settings.legsTarget}`}
      subtitle={t('practice.match.toThrow', { name: playerName(turn) })}
    >
      {session.starterPending && (
        <StarterDialog
          players={session.settings.players.map((_, i) => ({ name: playerName(i), legs: session.legsWon[i] }))}
          onSelect={(starter) => setSession(cricketSetStarter(session, starter))}
        />
      )}

      <PracticeBoard
        flash={boardFlash}
        className={cn('gap-2 px-2 py-2 sm:px-3 sm:py-3', botBusy && 'cursor-pointer')}
        onClick={botBusy ? commitBotVisit : undefined}
        title={botBusy ? t('practice.bot.skip') : undefined}
      >
        <div className="grid grid-cols-2 gap-2">{[0, 1].map(playerCard)}</div>
        {input === 'board' && (
          <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
            <CricketBoard
              marks={leg.marks}
              thrower={viewer}
              visitDarts={visitDarts}
              onDart={isLocked ? undefined : handleDart}
              className="mx-auto max-w-[min(100%,26rem)]"
            />
            {/* Wide screens only: on phones the board shows both sides' marks
                (and in pad mode the pad rows do). */}
            <CricketMarksTable
              players={[0, 1].map(i => ({ name: playerName(i), points: leg.points[i], legs: session.legsWon[i] }))}
              marks={leg.marks}
              thrower={turn}
              className="max-md:hidden"
            />
          </div>
        )}
        <div className="flex min-h-6 items-center justify-center">
          {botBusy && <span className="text-sm font-medium text-muted-foreground">{t('practice.bot.skip')}</span>}
        </div>
      </PracticeBoard>

      <div role="group" aria-label={t('practice.cricket.input')} className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-[3px]">
        {['board', 'pad'].map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={input === mode}
            onClick={() => setInput(mode)}
            className={cn('min-h-11 rounded-md text-[13px] font-semibold text-muted-foreground', input === mode && 'bg-background text-foreground shadow-sm dark:bg-input/60')}
          >
            {t(mode === 'board' ? 'practice.cricket.inputBoard' : 'practice.cricket.inputPad')}
          </button>
        ))}
      </div>

      {input === 'pad' ? (
        <PracticeKeypad>
          <CricketPad
            onDart={handleDart}
            onUndo={handleUndo}
            onEndVisit={handleEndVisit}
            canUndo={canUndoNow}
            dartsInVisit={visitDarts.length}
            disabled={!!isLocked}
            marks={leg.marks}
            thrower={turn}
          />
        </PracticeKeypad>
      ) : (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className={actionKey} disabled={!!isLocked} onClick={() => handleDart(dartFromInput(0))}>
            {t('match.miss')}
          </Button>
          <Button type="button" variant="outline" className={cn(actionKey, 'border-destructive/30 bg-destructive/10 text-destructive')} disabled={!canUndoNow || !!flash} onClick={handleUndo}>
            <ArrowLeft /> {t('match.undo')}
          </Button>
          <Button type="button" className={actionKey} disabled={!!isLocked || visitDarts.length === 0} onClick={handleEndVisit}>
            {t('cricket.pad.nextPlayer')} <ChevronsRight />
          </Button>
        </div>
      )}
    </PracticePlay>
  );
}

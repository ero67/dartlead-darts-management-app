import React, { useState, useEffect } from 'react';
import { Check, CircleDot, X, RotateCcw, Target } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeHardestList, PracticeSetup, PracticeField,
  PracticePlay, PracticeBoard, PracticeBoardLabel, PracticeBoardValue, PracticeBoardStats, PracticeKeypad
} from './PracticeShared';
import { createAroundTheClock, applyThrow, undo, canUndo, currentTarget, computeStats, ATC_MODES } from '../../lib/aroundTheClock';
import { describeSession, formatDuration, pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { hapticTap, hapticBust, hapticLegWon } from '../../lib/haptics';
import { cn } from '@/lib/utils';

const GAME = 'aroundTheClock';
const DEFAULT_SETTINGS = { mode: 'singles', includeBull: true };
// Numbers clockwise from the top, as on the board.
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RING_RADIUS = 41.5; // % of the ring box

const sanitize = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const mode = ATC_MODES.includes(saved.mode) ? saved.mode : 'singles';
  return { mode, includeBull: mode === 'trebles' ? false : saved.includeBull !== false };
};

const formatSeconds = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// The 20 numbers around the current target: hit ones filled, the current one
// outlined, the rest muted. The centre is whatever the caller puts there.
function TargetRing({ targetIndex, targets, children }) {
  const current = targets[targetIndex];
  const hit = new Set(targets.slice(0, targetIndex));
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[310px]">
      <div aria-hidden="true">
        <span className="absolute inset-6 rounded-full border border-dashed border-primary/30" />
        {BOARD_ORDER.map((n, i) => {
          const angle = (i * 18 * Math.PI) / 180;
          const isHit = hit.has(n);
          const isCurrent = n === current;
          return (
            <span
              key={n}
              style={{ left: `${50 + RING_RADIUS * Math.sin(angle)}%`, top: `${50 - RING_RADIUS * Math.cos(angle)}%` }}
              className={cn(
                'absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-display text-lg font-bold tabular-nums',
                isHit && 'border-primary bg-primary text-primary-foreground',
                isCurrent && 'border-foreground bg-background text-foreground ring-4 ring-primary/30',
                !isHit && !isCurrent && 'border-border bg-card text-muted-foreground/70'
              )}
            >
              {n}
            </span>
          );
        })}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">{children}</div>
    </div>
  );
}

export function PracticeAroundTheClock() {
  const { t } = useLanguage();
  const { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard } =
    usePracticeSession(GAME, { defaultSettings: DEFAULT_SETTINGS, sanitize, computeStats });
  const [, setTick] = useState(0);

  const isPlaying = session !== null && summary === null;
  useKeepScreenAwake(isPlaying);

  // Timer readout: re-render once a second while darts are being thrown.
  useEffect(() => {
    if (!isPlaying || !session?.firstDartAt) return undefined;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [isPlaying, session?.firstDartAt]);

  const handleStart = () => start((s) => createAroundTheClock(s));

  const handleThrow = (hit) => {
    if (!session) return;
    const { state, outcome } = applyThrow(session, hit);
    if (outcome === null) return;
    if (outcome === 'finished') hapticLegWon();
    else if (outcome === 'hit') hapticTap();
    else hapticBust();
    setSession(state);
    if (state.finishedAt) finish(state);
  };

  const handleUndo = () => {
    if (!session) return;
    hapticTap();
    setSession(undo(session));
  };

  const handleFinishEarly = () => {
    if (!session) return;
    if (session.dartsPerTarget.length === 0 && session.currentDarts === 0) { discard(); return; }
    finish({ ...session, finishedAt: Date.now() });
  };

  const targetLabel = (n) => (n === 25 ? 'Bull' : n);
  const modePrefix = (mode) => (mode === 'doubles' ? 'D' : mode === 'trebles' ? 'T' : '');

  if (summary) {
    const s = summary.stats;
    const complete = s.targetsCompleted === s.targetsTotal;
    return (
      <PracticeSummary
        subtitle={`${t('practice.games.aroundTheClock.title')} · ${t(`practice.aroundTheClock.modes.${summary.settings.mode}`)}${complete ? '' : ` · ${s.targetsCompleted}/${s.targetsTotal}`}`}
        meta={formatDuration(summary.startedAt, summary.finishedAt)}
        cards={[
          [t('practice.stats.darts'), s.totalDarts],
          [t('practice.aroundTheClock.time'), formatSeconds(s.seconds)],
          [t('practice.aroundTheClock.stats.avgDartsPerTarget'), s.avgDartsPerTarget ?? t('practice.noStats')],
          [t('practice.aroundTheClock.stats.firstDartHits'), `${s.firstDartHits}/${s.targetsCompleted}`]
        ]}
        extra={
          <PracticeHardestList
            title={t('practice.aroundTheClock.stats.hardest')}
            items={s.hardest.filter(item => item.darts > 1)}
            unitLabel={(item) => t(`practice.stats.darts${pluralSuffix(item.darts)}`, { count: item.darts })}
          />
        }
        onPlayAgain={handleStart}
        onChangeSettings={() => setSummary(null)}
      />
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
        <PracticeScreenHeader title={t('practice.games.aroundTheClock.title')} description={t('practice.aroundTheClock.rules')} />
        <PracticeSetup
          title={t('practice.aroundTheClock.setup.title')}
          subtitle={t('practice.aroundTheClock.setup.subtitle')}
          recap={describeSession({ game: GAME, settings }, t)}
          onStart={handleStart}
        >
          <PracticeField
            icon={CircleDot}
            label={t('practice.aroundTheClock.setup.mode')}
            hint={t('practice.aroundTheClock.setup.modeHint')}
            value={t(`practice.aroundTheClock.modes.${settings.mode}`)}
          >
            <PracticeChips options={ATC_MODES} value={settings.mode} onChange={(mode) => setSettings(s => ({ ...s, mode, includeBull: mode === 'trebles' ? false : s.includeBull }))} render={(m) => t(`practice.aroundTheClock.modes.${m}`)} />
          </PracticeField>
          {settings.mode !== 'trebles' && (
            <PracticeField
              icon={Target}
              label={t('practice.aroundTheClock.setup.includeBull')}
              value={settings.includeBull ? t('common.yes') : t('common.no')}
            >
              <PracticeChips options={[true, false]} value={settings.includeBull} onChange={(includeBull) => setSettings(s => ({ ...s, includeBull }))} render={(v) => (v ? t('common.yes') : t('common.no'))} />
            </PracticeField>
          )}
        </PracticeSetup>
      </div>
    );
  }

  const stats = computeStats(session);
  const target = currentTarget(session);
  const modeLabel = t(`practice.aroundTheClock.modes.${session.settings.mode}`);
  const hasBull = session.settings.includeBull;
  const isBullHit = hasBull && session.targetIndex >= session.targets.length;

  return (
    <PracticePlay
      onFinish={handleFinishEarly}
      title={`${t('practice.games.aroundTheClock.title')} · ${modeLabel}`}
      subtitle={<><span className="tabular-nums">{session.targetIndex}/{session.targets.length}</span> · {t('practice.aroundTheClock.time')} <b>{formatSeconds(stats.seconds)}</b></>}
    >
      <PracticeBoard className="gap-1">
        <div className="flex items-center justify-between gap-2">
          <PracticeBoardLabel>{t('practice.aroundTheClock.target')} · {modeLabel}</PracticeBoardLabel>
          <span className="text-xs text-muted-foreground tabular-nums">{t('practice.aroundTheClock.hitCount', { hit: session.targetIndex, total: session.targets.length })}</span>
        </div>
        <TargetRing targets={session.targets} targetIndex={session.targetIndex}>
          <PracticeBoardValue className={cn(target === 25 ? 'text-6xl' : 'text-[7rem]')}>
            {target === 25 ? targetLabel(target) : `${modePrefix(session.settings.mode)}${targetLabel(target)}`}
          </PracticeBoardValue>
          {hasBull && (
            <span className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold',
              isBullHit ? 'border-primary bg-primary text-primary-foreground' : target === 25 ? 'border-foreground text-foreground' : 'text-muted-foreground'
            )}>
              <span className={cn('size-1.5 rounded-full', isBullHit ? 'bg-current' : 'bg-live')} /> Bull
            </span>
          )}
        </TargetRing>
        <PracticeBoardStats
          items={[
            [t('practice.aroundTheClock.dartsAtTarget'), session.currentDarts],
            [t('practice.stats.darts'), stats.totalDarts],
            [t('practice.aroundTheClock.stats.firstDartHits'), stats.firstDartHits, 'text-primary']
          ]}
        />
      </PracticeBoard>

      <PracticeKeypad>
        <div className="grid grid-cols-[1fr_1.4fr_0.7fr] gap-2 p-2">
          <button
            type="button"
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border bg-card font-display text-2xl font-bold tracking-wide transition-colors hover:bg-accent active:scale-[0.98]"
            onClick={() => handleThrow(false)}
          >
            <X className="size-6 text-muted-foreground" /> {t('practice.aroundTheClock.miss')}
          </button>
          <button
            type="button"
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-primary font-display text-2xl font-bold tracking-wide text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
            onClick={() => handleThrow(true)}
          >
            <Check className="size-7" /> {t('practice.aroundTheClock.hit')}
          </button>
          <button
            type="button"
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs text-muted-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
            onClick={handleUndo}
            disabled={!canUndo(session)}
          >
            <RotateCcw className="size-5" /> {t('match.undo')}
          </button>
        </div>
      </PracticeKeypad>
    </PracticePlay>
  );
}

import React, { useState, useEffect } from 'react';
import { Check, CircleDot, X, RotateCcw, Target } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeHardestList, PracticeSetup, PracticeField,
  PracticePlay, PracticeBoard, PracticeBoardLabel, PracticeBoardValue, PracticeBoardStats, PracticeKeypad
} from './PracticeShared';
import { Progress } from '@/components/ui/progress';
import { createAroundTheClock, applyThrow, undo, canUndo, currentTarget, computeStats, ATC_MODES } from '../../lib/aroundTheClock';
import { describeSession, pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { hapticTap, hapticBust, hapticLegWon } from '../../lib/haptics';

const GAME = 'aroundTheClock';
const DEFAULT_SETTINGS = { mode: 'singles', includeBull: true };

const sanitize = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const mode = ATC_MODES.includes(saved.mode) ? saved.mode : 'singles';
  return { mode, includeBull: mode === 'trebles' ? false : saved.includeBull !== false };
};

const formatSeconds = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
      <div className="tw mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
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
  const progress = (session.targetIndex / session.targets.length) * 100;

  return (
    <PracticePlay
      onFinish={handleFinishEarly}
      meta={
        <>
          <span className="tabular-nums">{session.targetIndex}/{session.targets.length}</span>
          <span>{t('practice.aroundTheClock.time')} <b>{formatSeconds(stats.seconds)}</b></span>
        </>
      }
    >
      <PracticeBoard>
        <Progress value={progress} className="mb-2 h-1.5" />
        <PracticeBoardLabel>{t('practice.aroundTheClock.target')} · {t(`practice.aroundTheClock.modes.${session.settings.mode}`)}</PracticeBoardLabel>
        <PracticeBoardValue>{target === 25 ? targetLabel(target) : `${modePrefix(session.settings.mode)}${targetLabel(target)}`}</PracticeBoardValue>
        <PracticeBoardStats
          items={[
            [t('practice.aroundTheClock.dartsAtTarget'), session.currentDarts],
            [t('practice.stats.darts'), stats.totalDarts],
            [t('practice.aroundTheClock.stats.firstDartHits'), stats.firstDartHits]
          ]}
        />
      </PracticeBoard>

      <PracticeKeypad>
        <div className="flex flex-col gap-2 p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex min-h-28 items-center justify-center gap-2 rounded-lg bg-destructive text-xl font-semibold text-white transition-transform active:scale-[0.98]"
              onClick={() => handleThrow(false)}
            >
              <X className="size-7" /> {t('practice.aroundTheClock.miss')}
            </button>
            <button
              type="button"
              className="flex min-h-28 items-center justify-center gap-2 rounded-lg bg-primary text-xl font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
              onClick={() => handleThrow(true)}
            >
              <Check className="size-7" /> {t('practice.aroundTheClock.hit')}
            </button>
          </div>
          <button
            type="button"
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-base font-semibold text-destructive disabled:pointer-events-none disabled:opacity-40"
            onClick={handleUndo}
            disabled={!canUndo(session)}
          >
            <RotateCcw className="size-5" /> <span>{t('match.undo')}</span>
          </button>
        </div>
      </PracticeKeypad>
    </PracticePlay>
  );
}

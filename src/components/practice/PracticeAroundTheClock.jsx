import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, X, RotateCcw, Flag } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeHardestList } from './PracticeShared';
import { createAroundTheClock, applyThrow, undo, canUndo, currentTarget, computeStats, ATC_MODES } from '../../lib/aroundTheClock';
import { pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { hapticTap, hapticBust, hapticLegWon } from '../../lib/haptics';
import './Practice.css';

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
  const navigate = useNavigate();
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
      <div className="practice-page">
        <PracticeScreenHeader title={t('practice.games.aroundTheClock.title')} description={t('practice.aroundTheClock.rules')} />
        <div className="practice-setup">
          <h2>{t('practice.aroundTheClock.setup.title')}</h2>
          <div className="practice-field">
            <label>{t('practice.aroundTheClock.setup.mode')}</label>
            <PracticeChips options={ATC_MODES} value={settings.mode} onChange={(mode) => setSettings(s => ({ ...s, mode, includeBull: mode === 'trebles' ? false : s.includeBull }))} render={(m) => t(`practice.aroundTheClock.modes.${m}`)} />
          </div>
          {settings.mode !== 'trebles' && (
            <div className="practice-field">
              <label>{t('practice.aroundTheClock.setup.includeBull')}</label>
              <PracticeChips options={[true, false]} value={settings.includeBull} onChange={(includeBull) => setSettings(s => ({ ...s, includeBull }))} render={(v) => (v ? t('common.yes') : t('common.no'))} />
            </div>
          )}
          <div className="practice-setup-actions">
            <button type="button" className="create-tournament-btn" onClick={handleStart}>{t('practice.start')}</button>
          </div>
        </div>
      </div>
    );
  }

  const stats = computeStats(session);
  const target = currentTarget(session);
  const progress = (session.targetIndex / session.targets.length) * 100;

  return (
    <div className="practice-play">
      <div className="practice-play-top">
        <button type="button" className="back-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={18} /> {t('practice.title')}
        </button>
        <div className="practice-play-meta">
          <span>{session.targetIndex}/{session.targets.length}</span>
          <span>{t('practice.aroundTheClock.time')} <b>{formatSeconds(stats.seconds)}</b></span>
        </div>
      </div>

      <div className="practice-board">
        <div className="practice-progress"><div className="practice-progress-bar" style={{ width: `${progress}%` }} /></div>
        <div className="practice-remaining-label">{t('practice.aroundTheClock.target')} · {t(`practice.aroundTheClock.modes.${session.settings.mode}`)}</div>
        <div className="practice-remaining">{target === 25 ? targetLabel(target) : `${modePrefix(session.settings.mode)}${targetLabel(target)}`}</div>
        <div className="practice-board-stats">
          <span>{t('practice.aroundTheClock.dartsAtTarget')}: <b>{session.currentDarts}</b></span>
          <span>{t('practice.stats.darts')}: <b>{stats.totalDarts}</b></span>
          <span>{t('practice.aroundTheClock.stats.firstDartHits')}: <b>{stats.firstDartHits}</b></span>
        </div>
      </div>

      <div className="dart-board practice-atc-pad">
        <div className="practice-atc-buttons">
          <button type="button" className="practice-atc-btn miss" onClick={() => handleThrow(false)}>
            <X size={28} /> {t('practice.aroundTheClock.miss')}
          </button>
          <button type="button" className="practice-atc-btn hit" onClick={() => handleThrow(true)}>
            <Check size={28} /> {t('practice.aroundTheClock.hit')}
          </button>
        </div>
        <div className="remove-last-row">
          <button type="button" className="remove-last-btn dart-btn" onClick={handleUndo} disabled={!canUndo(session)}>
            <RotateCcw size={20} /> <span>{t('match.undo')}</span>
          </button>
        </div>
      </div>

      <div className="practice-play-footer">
        <button type="button" className="practice-ghost-btn" onClick={handleFinishEarly}>
          <Flag size={16} /> {t('practice.finishSession')}
        </button>
      </div>
    </div>
  );
}

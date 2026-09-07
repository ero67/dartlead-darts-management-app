import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { DartKeypad } from '../scoring/DartKeypad';
import { PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeHardestList } from './PracticeShared';
import { dartFromInput, displayLabel } from '../../lib/x01Engine';
import {
  createCheckoutTrainer, applyDart, undo, canUndo, liveRemaining, computeStats,
  CHECKOUT_RANGES, ATTEMPT_OPTIONS
} from '../../lib/checkoutTrainer';
import { pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { hapticTap, hapticBust, hapticLegWon } from '../../lib/haptics';
import checkoutData from '../../data/checkouts.json';
import './Practice.css';

const GAME = 'checkout';
const FLASH_MS = 800;
const RANGE_KEYS = Object.keys(CHECKOUT_RANGES);
const DEFAULT_SETTINGS = { range: 'all', min: 2, max: 170, oneDartOnly: false, attemptsTarget: 20 };

const rangeToSettings = (range) => ({ range, ...CHECKOUT_RANGES[range], oneDartOnly: Boolean(CHECKOUT_RANGES[range].oneDartOnly) });

const sanitize = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const range = RANGE_KEYS.includes(saved.range) ? saved.range : 'all';
  const attemptsTarget = saved.attemptsTarget === null || ATTEMPT_OPTIONS.includes(saved.attemptsTarget)
    ? saved.attemptsTarget : DEFAULT_SETTINGS.attemptsTarget;
  return { ...rangeToSettings(range), attemptsTarget };
};

export function PracticeCheckout() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard } =
    usePracticeSession(GAME, { defaultSettings: DEFAULT_SETTINGS, sanitize, computeStats });
  const [inputMode, setInputMode] = useState('single');
  const [flash, setFlash] = useState(null); // { type: 'hit' | 'miss' | 'bust', darts }
  const flashTimer = useRef(null);

  useKeepScreenAwake(session !== null && summary === null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const showFlash = (value) => {
    clearTimeout(flashTimer.current);
    setFlash(value);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const handleStart = () => start((s) => createCheckoutTrainer(s));

  const handleDart = (number) => {
    if (!session || flash) return;
    const dart = dartFromInput(number, inputMode);
    if (!dart) return;
    hapticTap();
    setInputMode('single');
    const { state, outcome } = applyDart(session, dart);
    if (outcome === null) return;
    if (outcome === 'hit') { hapticLegWon(); showFlash({ type: 'hit', darts: state.attempts.at(-1).dartsUsed }); }
    else if (outcome === 'bust') { hapticBust(); showFlash({ type: 'bust' }); }
    else if (outcome === 'miss') { hapticBust(); showFlash({ type: 'miss' }); }
    setSession(state);
    if (state.finishedAt) setTimeout(() => finish(state), FLASH_MS);
  };

  const handleUndo = () => {
    if (!session || flash) return;
    hapticTap();
    setSession(undo(session));
  };

  const handleFinishEarly = () => {
    if (!session) return;
    if (session.attempts.length === 0) { discard(); return; }
    finish({ ...session, finishedAt: Date.now() });
  };

  const rangeLabel = (s) => (s.range === 'doubles' ? t('practice.checkout.ranges.doubles') : `${s.min}–${s.max}`);

  if (summary) {
    const s = summary.stats;
    const pct = (v) => (v === null || v === undefined ? t('practice.noStats') : `${v.toFixed(0)}%`);
    return (
      <PracticeSummary
        subtitle={`${t('practice.games.checkout.title')} · ${rangeLabel(summary.settings)}`}
        cards={[
          [t('practice.checkout.stats.hitRate'), `${pct(s.hitPercent)} (${s.hits}/${s.attempts})`],
          [t('practice.checkout.stats.doubleRate'), `${pct(s.doublePercent)} (${s.doublesHit}/${s.dartsAtDouble})`],
          [t('practice.checkout.stats.avgDartsPerHit'), s.avgDartsPerHit ?? t('practice.noStats')],
          [t('practice.checkout.stats.bestStreak'), s.bestStreak],
          [t('practice.stats.darts'), s.totalDarts],
          [t('practice.stats.busts'), s.busts]
        ]}
        extra={
          <PracticeHardestList
            title={t('practice.checkout.stats.hardest')}
            items={s.hardest}
            unitLabel={(item) => t(`practice.checkout.missCount${pluralSuffix(item.misses)}`, { count: item.misses })}
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
        <PracticeScreenHeader title={t('practice.games.checkout.title')} description={t('practice.games.checkout.desc')} />
        <div className="practice-setup">
          <h2>{t('practice.checkout.setup.title')}</h2>
          <div className="practice-field">
            <label>{t('practice.checkout.setup.range')}</label>
            <PracticeChips
              options={RANGE_KEYS}
              value={settings.range}
              onChange={(range) => setSettings(s => ({ ...rangeToSettings(range), attemptsTarget: s.attemptsTarget }))}
              render={(range) => `${t(`practice.checkout.ranges.${range}`)}${range === 'doubles' ? '' : ` ${CHECKOUT_RANGES[range].min}–${CHECKOUT_RANGES[range].max}`}`}
            />
          </div>
          <div className="practice-field">
            <label>{t('practice.checkout.setup.attempts')}</label>
            <PracticeChips
              options={ATTEMPT_OPTIONS}
              value={settings.attemptsTarget}
              onChange={(attemptsTarget) => setSettings(s => ({ ...s, attemptsTarget }))}
              render={(n) => (n === null ? t('practice.setup.unlimited') : n)}
            />
          </div>
          <p className="practice-setup-note">{t('practice.checkout.setup.note')}</p>
          <div className="practice-setup-actions">
            <button type="button" className="create-tournament-btn" onClick={handleStart}>{t('practice.start')}</button>
          </div>
        </div>
      </div>
    );
  }

  const stats = computeStats(session);
  const remaining = liveRemaining(session);
  const attemptNumber = session.attempts.length + 1;
  const suggestion = checkoutData[String(remaining)];
  const labels = session.current.darts.map(d => displayLabel(d.label));
  const lastAttempt = session.attempts.at(-1);
  const flashClass = flash?.type === 'hit' ? 'leg-won' : flash ? 'bust' : '';

  return (
    <div className="practice-play">
      <div className="practice-play-top">
        <button type="button" className="back-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={18} /> {t('practice.title')}
        </button>
        <div className="practice-play-meta">
          <span>
            {session.settings.attemptsTarget === null
              ? t('practice.checkout.attempt', { current: attemptNumber })
              : t('practice.checkout.attemptOf', { current: attemptNumber, total: session.settings.attemptsTarget })}
          </span>
          <span>{t('practice.checkout.stats.hitRate')} <b>{stats.hitPercent === null ? t('practice.noStats') : `${stats.hitPercent.toFixed(0)}%`}</b></span>
        </div>
      </div>

      <div className={`practice-board ${flashClass}`}>
        {flash?.type === 'hit' && <div className="practice-board-flash">{t(`practice.checkout.hit${pluralSuffix(flash.darts)}`, { count: flash.darts })}</div>}
        {flash?.type === 'miss' && <div className="practice-board-flash">{t('practice.checkout.miss')}</div>}
        {flash?.type === 'bust' && <div className="practice-board-flash">{t('practice.bust')}</div>}
        <div className="practice-remaining-label">
          {t('practice.checkout.target')} {session.current.target}
          {remaining !== session.current.target && ` · ${t('practice.remaining')}`}
        </div>
        <div className="practice-remaining">{remaining}</div>
        <div className="practice-checkout-hint">{suggestion ? suggestion.join(' → ') : ''}</div>
        <div className="practice-last-throws">
          {(labels.length > 0 ? labels : (lastAttempt?.darts.map(d => displayLabel(d.label)) || [])).map((label, idx) => (
            <span key={idx} className={labels.length === 0 ? 'faded' : ''}>{label}</span>
          ))}
        </div>
        <div className="practice-board-stats">
          <span>{t('practice.checkout.stats.hits')}: <b>{stats.hits}/{stats.attempts}</b></span>
          <span>{t('practice.checkout.stats.doubleRate')}: <b>{stats.doublePercent === null ? t('practice.noStats') : `${stats.doublePercent.toFixed(0)}%`}</b></span>
          <span>{t('practice.checkout.stats.bestStreak')}: <b>{stats.bestStreak}</b></span>
        </div>
      </div>

      <div className="dart-board">
        <DartKeypad
          inputMode={inputMode}
          onInputModeChange={setInputMode}
          onDart={handleDart}
          onUndo={handleUndo}
          dartsInVisit={session.current.darts.length}
          canUndo={canUndo(session)}
          disabled={flash !== null}
        />
      </div>

      <div className="practice-play-footer">
        <button type="button" className="practice-ghost-btn" onClick={handleFinishEarly}>
          <Flag size={16} /> {t('practice.finishSession')}
        </button>
      </div>
    </div>
  );
}

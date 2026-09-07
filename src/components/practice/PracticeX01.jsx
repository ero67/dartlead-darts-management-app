import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Flag, RotateCcw, Settings2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { DartKeypad } from '../scoring/DartKeypad';
import { TurnTotalKeypad } from '../scoring/TurnTotalKeypad';
import { CheckoutDialog } from '../scoring/CheckoutDialog';
import {
  createSoloX01, applyDart, applyVisitTotal, undo, canUndo, dartFromInput,
  liveRemaining, lastVisitLabels, computeStats, STARTING_SCORES
} from '../../lib/x01Engine';
import {
  loadActiveSession, saveActiveSession, clearActiveSession, appendHistory,
  newSessionId, loadGameSettings, saveGameSettings
} from '../../lib/practiceStorage';
import { formatDuration, pluralSuffix } from '../../lib/practiceGames';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { useOnScreenKeypad } from '../../hooks/useOnScreenKeypad';
import { hapticTap, hapticBust, hapticLegWon, hapticMatchWon } from '../../lib/haptics';
import checkoutData from '../../data/checkouts.json';
import './Practice.css';

const GAME = 'x01';
const LEG_OPTIONS = [1, 3, 5, 10, null];
const DEFAULT_SETTINGS = { startingScore: 501, legsTarget: 3, scoringMode: 'dart' };
const FLASH_MS = 900;

const sanitizeSettings = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const startingScore = Number.isInteger(saved.startingScore) && saved.startingScore >= 2 && saved.startingScore <= 1001
    ? saved.startingScore : DEFAULT_SETTINGS.startingScore;
  const legsTarget = saved.legsTarget === null || (Number.isInteger(saved.legsTarget) && saved.legsTarget > 0)
    ? saved.legsTarget : DEFAULT_SETTINGS.legsTarget;
  const scoringMode = saved.scoringMode === 'turnTotal' ? 'turnTotal' : 'dart';
  return { startingScore, legsTarget, scoringMode };
};

// Solo X01: setup → play → summary. The session in progress is persisted on
// every change so leaving the screen (or a crash) never loses a leg.
export function PracticeX01() {
  const { t } = useLanguage();
  const navigate = useNavigate();
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
  const [flash, setFlash] = useState(null); // { type: 'bust' } | { type: 'legWon', darts }
  const flashTimer = useRef(null);

  const isPlaying = session !== null && summary === null;
  useKeepScreenAwake(isPlaying);

  useEffect(() => {
    if (session) saveActiveSession(GAME, session);
  }, [session]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const showFlash = (value) => {
    clearTimeout(flashTimer.current);
    setFlash(value);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const finishSession = (state) => {
    const stats = computeStats(state);
    const entry = {
      id: newSessionId(),
      game: GAME,
      settings: state.settings,
      stats,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt || Date.now()
    };
    appendHistory(entry);
    clearActiveSession();
    hapticMatchWon();
    setSummary(entry);
    setSession(null);
  };

  const handleOutcome = ({ state, outcome }) => {
    if (outcome === null) return;
    if (outcome === 'bust') {
      hapticBust();
      showFlash({ type: 'bust' });
    } else if (outcome === 'checkout') {
      hapticLegWon();
      const legDarts = state.legs[state.legs.length - 1]?.darts;
      showFlash({ type: 'legWon', darts: legDarts });
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
    setSession(createSoloX01(settings));
  };

  const handleDart = (number) => {
    if (!session || session.finishedAt || flash) return;
    const dart = dartFromInput(number, inputMode);
    if (!dart) return;
    hapticTap();
    setInputMode('single');
    handleOutcome(applyDart(session, dart));
  };

  const handleUndo = () => {
    if (!session || flash) return;
    hapticTap();
    setSession(undo(session));
  };

  const handleTurnTotal = (total) => {
    if (!session || session.finishedAt || flash) return;
    hapticTap();
    if (session.current.remaining - total === 0) {
      setPendingCheckout({ total, dartsUsed: 3, finishedOnDouble: true });
      return;
    }
    setTurnTotalInput('');
    handleOutcome(applyVisitTotal(session, total, { finishedOnDouble: false }));
  };

  const handleConfirmCheckout = (p) => {
    setPendingCheckout(null);
    setTurnTotalInput('');
    handleOutcome(applyVisitTotal(session, p.total, { dartsUsed: p.dartsUsed, finishedOnDouble: p.finishedOnDouble }));
  };

  // Unlimited sessions (and abandoned ones) end by hand.
  const handleFinishEarly = () => {
    if (!session) return;
    const hasVisits = session.legs.length > 0 || session.current.visits.length > 0;
    if (!hasVisits) {
      clearActiveSession();
      setSession(null);
      return;
    }
    finishSession({ ...session, finishedAt: Date.now() });
  };

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
    return (
      <div className="practice-summary">
        <div className="practice-summary-header">
          <CheckCircle size={44} />
          <h2>{t('practice.sessionComplete')}</h2>
          <p>
            {summary.settings.startingScore}
            {duration && ` · ${duration}`}
          </p>
        </div>
        <div className="stats-grid">
          {cards.map(([label, value]) => (
            <div className="stat-card" key={label}>
              <div className="stat-content">
                <h3>{value}</h3>
                <p>{label}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="practice-summary-actions">
          <button type="button" className="create-tournament-btn" onClick={handleStart}>
            <RotateCcw size={18} /> {t('practice.playAgain')}
          </button>
          <button type="button" className="practice-ghost-btn" onClick={() => setSummary(null)}>
            <Settings2 size={16} /> {t('practice.changeSettings')}
          </button>
          <button type="button" className="practice-ghost-btn" onClick={() => navigate('/practice')}>
            <ArrowLeft size={16} /> {t('practice.backToPractice')}
          </button>
        </div>
      </div>
    );
  }

  // ---- Setup ---------------------------------------------------------------
  if (!session) {
    const isPreset = STARTING_SCORES.includes(settings.startingScore);
    return (
      <div className="practice-page">
        <div className="practice-header">
          <div>
            <button type="button" className="practice-link-btn" onClick={() => navigate('/practice')}>
              <ArrowLeft size={16} /> {t('practice.backToPractice')}
            </button>
            <h1>{t('practice.games.x01.title')}</h1>
            <p>{t('practice.games.x01.desc')}</p>
          </div>
        </div>
        <div className="practice-setup">
          <h2>{t('practice.setup.title')}</h2>

          <div className="practice-field">
            <label>{t('practice.setup.startingScore')}</label>
            <div className="practice-chips">
              {STARTING_SCORES.map(score => (
                <button
                  key={score}
                  type="button"
                  className={`practice-chip ${settings.startingScore === score ? 'active' : ''}`}
                  onClick={() => setSettings(s => ({ ...s, startingScore: score }))}
                >
                  {score}
                </button>
              ))}
              <input
                className="practice-chip-input"
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
          </div>

          <div className="practice-field">
            <label>{t('practice.setup.legs')}</label>
            <div className="practice-chips">
              {LEG_OPTIONS.map(legs => (
                <button
                  key={legs === null ? 'unlimited' : legs}
                  type="button"
                  className={`practice-chip ${settings.legsTarget === legs ? 'active' : ''}`}
                  onClick={() => setSettings(s => ({ ...s, legsTarget: legs }))}
                >
                  {legs === null ? t('practice.setup.unlimited') : legs}
                </button>
              ))}
            </div>
          </div>

          <div className="practice-field">
            <label>{t('practice.setup.scoringMode')}</label>
            <div className="practice-mode-cards">
              <button
                type="button"
                className={`practice-mode-card ${settings.scoringMode === 'dart' ? 'active' : ''}`}
                onClick={() => setSettings(s => ({ ...s, scoringMode: 'dart' }))}
              >
                <strong>{t('practice.setup.scoringDart')}</strong>
                <span>{t('practice.setup.scoringDartHint')}</span>
              </button>
              <button
                type="button"
                className={`practice-mode-card ${settings.scoringMode === 'turnTotal' ? 'active' : ''}`}
                onClick={() => setSettings(s => ({ ...s, scoringMode: 'turnTotal' }))}
              >
                <strong>{t('practice.setup.scoringTurnTotal')}</strong>
                <span>{t('practice.setup.scoringTurnTotalHint')}</span>
              </button>
            </div>
          </div>

          <div className="practice-setup-actions">
            <button type="button" className="create-tournament-btn" onClick={handleStart}>
              {t('practice.start')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Play ----------------------------------------------------------------
  const stats = computeStats(session);
  const remaining = liveRemaining(session);
  const legDarts = session.current.visits.reduce((sum, v) => sum + v.darts, 0) + session.current.visit.darts.length;
  const legNumber = session.legs.length + 1;
  const labels = lastVisitLabels(session);
  const suggestion = session.current.visit.darts.length === 0 ? checkoutData[String(remaining)] : null;
  const boardClass = `practice-board ${flash?.type === 'bust' ? 'bust' : ''} ${flash?.type === 'legWon' ? 'leg-won' : ''}`;

  return (
    <div className="practice-play">
      <CheckoutDialog
        pending={pendingCheckout}
        onChange={setPendingCheckout}
        onCancel={() => setPendingCheckout(null)}
        onConfirm={handleConfirmCheckout}
      />

      <div className="practice-play-top">
        <button type="button" className="back-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={18} /> {t('practice.title')}
        </button>
        <div className="practice-play-meta">
          <span>
            {session.settings.legsTarget === null
              ? t('practice.leg', { current: legNumber })
              : t('practice.legOf', { current: legNumber, total: session.settings.legsTarget })}
          </span>
          <span>{t('practice.stats.average')} <b>{stats.average.toFixed(1)}</b></span>
        </div>
      </div>

      <div className={boardClass}>
        {flash?.type === 'bust' && <div className="practice-board-flash">{t('practice.bust')}</div>}
        {flash?.type === 'legWon' && (
          <div className="practice-board-flash">{t(`practice.legWon${pluralSuffix(flash.darts)}`, { count: flash.darts })}</div>
        )}
        <div className="practice-remaining-label">{t('practice.remaining')}</div>
        <div className="practice-remaining">{remaining}</div>
        <div className="practice-checkout-hint">{suggestion ? suggestion.join(' → ') : ''}</div>
        <div className="practice-last-throws">
          {labels.map((label, idx) => <span key={idx}>{label}</span>)}
        </div>
        <div className="practice-board-stats">
          <span>{t('practice.thisLeg')}: <b>{t(`practice.stats.darts${pluralSuffix(legDarts)}`, { count: legDarts })}</b></span>
          <span>{t('practice.stats.legs')}: <b>{session.legs.length}</b></span>
          {stats.checkoutPercent !== null && (
            <span>{t('practice.stats.checkout')}: <b>{stats.checkoutPercent.toFixed(0)}%</b></span>
          )}
        </div>
      </div>

      <div className="dart-board">
        {session.settings.scoringMode === 'dart' ? (
          <DartKeypad
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            onDart={handleDart}
            onUndo={handleUndo}
            dartsInVisit={session.current.visit.darts.length}
            canUndo={canUndo(session)}
            disabled={flash !== null}
          />
        ) : (
          <TurnTotalKeypad
            value={turnTotalInput}
            onChange={(next) => { hapticTap(); setTurnTotalInput(next); }}
            onSubmit={handleTurnTotal}
            onUndo={handleUndo}
            canUndo={canUndo(session)}
            useOnScreenKeypad={isOnScreenKeypad}
            disabled={flash !== null}
          />
        )}
      </div>

      <div className="practice-play-footer">
        <button type="button" className="practice-ghost-btn" onClick={handleFinishEarly}>
          <Flag size={16} /> {t('practice.finishSession')}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, Keyboard, Repeat, Target, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { DartKeypad } from '../scoring/DartKeypad';
import { TurnTotalKeypad } from '../scoring/TurnTotalKeypad';
import { CheckoutDialog } from '../scoring/CheckoutDialog';
import {
  PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeSetup, PracticeField, PracticeOptionCards
} from './PracticeShared';
import { dartFromInput, liveRemaining, lastVisitLabels, canUndo as x01CanUndo } from '../../lib/x01Engine';
import {
  createOneTwentyOne, applyDart, applyVisitTotal, undo, canUndo, computeStats, visitsLeft,
  ROUND_OPTIONS, MIN_TARGET, MAX_TARGET
} from '../../lib/oneTwentyOne';
import { describeSession, pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { useOnScreenKeypad } from '../../hooks/useOnScreenKeypad';
import { hapticTap, hapticBust, hapticLegWon } from '../../lib/haptics';
import checkoutData from '../../data/checkouts.json';
import './Practice.css';

const GAME = 'oneTwentyOne';
const FLASH_MS = 900;
const START_OPTIONS = [61, 81, 101, 121];
const DEFAULT_SETTINGS = { startTarget: 121, roundsTarget: 10, scoringMode: 'dart', onFail: 'down' };

const sanitize = (saved) => {
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS;
  const startTarget = Number.isInteger(saved.startTarget) && saved.startTarget >= MIN_TARGET && saved.startTarget <= MAX_TARGET
    ? saved.startTarget : DEFAULT_SETTINGS.startTarget;
  const roundsTarget = saved.roundsTarget === null || ROUND_OPTIONS.includes(saved.roundsTarget)
    ? saved.roundsTarget : DEFAULT_SETTINGS.roundsTarget;
  return {
    startTarget,
    roundsTarget,
    scoringMode: saved.scoringMode === 'turnTotal' ? 'turnTotal' : 'dart',
    onFail: saved.onFail === 'stay' ? 'stay' : 'down'
  };
};

export function PracticeOneTwentyOne() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isOnScreenKeypad = useOnScreenKeypad();
  const { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard } =
    usePracticeSession(GAME, { defaultSettings: DEFAULT_SETTINGS, sanitize, computeStats });
  const [inputMode, setInputMode] = useState('single');
  const [turnTotalInput, setTurnTotalInput] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [flash, setFlash] = useState(null); // { type: 'success' | 'fail' | 'bust', target }
  const flashTimer = useRef(null);

  useKeepScreenAwake(session !== null && summary === null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const showFlash = (value) => {
    clearTimeout(flashTimer.current);
    setFlash(value);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const handleStart = () => start((s) => createOneTwentyOne(s));

  const handleOutcome = ({ state, outcome }) => {
    if (outcome === null) return;
    if (outcome === 'success') { hapticLegWon(); showFlash({ type: 'success', target: state.target }); }
    else if (outcome === 'fail') { hapticBust(); showFlash({ type: 'fail', target: state.target }); }
    else if (outcome === 'bust') { hapticBust(); showFlash({ type: 'bust' }); }
    setSession(state);
    if (state.finishedAt) setTimeout(() => finish(state), FLASH_MS);
  };

  const handleDart = (number) => {
    if (!session || flash) return;
    const dart = dartFromInput(number, inputMode);
    if (!dart) return;
    hapticTap();
    setInputMode('single');
    handleOutcome(applyDart(session, dart));
  };

  const handleTurnTotal = (total) => {
    if (!session || flash) return;
    hapticTap();
    if (session.round.current.remaining - total === 0) {
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

  const handleUndo = () => {
    if (!session || flash) return;
    hapticTap();
    setSession(undo(session));
  };

  const handleFinishEarly = () => {
    if (!session) return;
    if (session.rounds.length === 0) { discard(); return; }
    finish({ ...session, finishedAt: Date.now() });
  };

  if (summary) {
    const s = summary.stats;
    return (
      <PracticeSummary
        subtitle={`${t('practice.games.oneTwentyOne.title')} · ${summary.settings.startTarget} → ${s.finalTarget}`}
        cards={[
          [t('practice.oneTwentyOne.stats.highestSuccess'), s.highestSuccess ?? t('practice.noStats')],
          [t('practice.oneTwentyOne.stats.successRate'), s.successPercent === null ? t('practice.noStats') : `${s.successPercent.toFixed(0)}% (${s.successes}/${s.rounds})`],
          [t('practice.oneTwentyOne.stats.finalTarget'), s.finalTarget],
          [t('practice.oneTwentyOne.stats.bestStreak'), s.bestStreak],
          [t('practice.oneTwentyOne.stats.avgDartsPerSuccess'), s.avgDartsPerSuccess ?? t('practice.noStats')],
          [t('practice.stats.darts'), s.totalDarts]
        ]}
        onPlayAgain={handleStart}
        onChangeSettings={() => setSummary(null)}
      />
    );
  }

  if (!session) {
    const roundsLabel = settings.roundsTarget === null
      ? t('practice.setup.unlimited')
      : t(`practice.oneTwentyOne.roundCount${pluralSuffix(settings.roundsTarget)}`, { count: settings.roundsTarget });
    return (
      <div className="practice-page">
        <PracticeScreenHeader title={t('practice.games.oneTwentyOne.title')} description={t('practice.oneTwentyOne.rules')} />
        <PracticeSetup
          title={t('practice.oneTwentyOne.setup.title')}
          subtitle={t('practice.oneTwentyOne.setup.subtitle')}
          recap={describeSession({ game: GAME, settings }, t)}
          onStart={handleStart}
        >
          <PracticeField
            icon={Target}
            tone="green"
            label={t('practice.oneTwentyOne.setup.startTarget')}
            hint={t('practice.oneTwentyOne.setup.startTargetHint')}
            value={settings.startTarget}
          >
            <div className="practice-chips">
              {START_OPTIONS.map(n => (
                <button key={n} type="button" className={`practice-chip ${settings.startTarget === n ? 'active' : ''}`} onClick={() => setSettings(s => ({ ...s, startTarget: n }))}>{n}</button>
              ))}
              <input
                className="practice-chip-input"
                type="number"
                min={MIN_TARGET}
                max={MAX_TARGET}
                inputMode="numeric"
                placeholder={t('practice.setup.custom')}
                value={START_OPTIONS.includes(settings.startTarget) ? '' : settings.startTarget}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isInteger(n) && n >= MIN_TARGET && n <= MAX_TARGET) setSettings(s => ({ ...s, startTarget: n }));
                }}
              />
            </div>
          </PracticeField>

          <PracticeField
            icon={Repeat}
            tone="blue"
            label={t('practice.oneTwentyOne.setup.rounds')}
            hint={t('practice.oneTwentyOne.setup.roundsHint')}
            value={roundsLabel}
          >
            <PracticeChips options={ROUND_OPTIONS} value={settings.roundsTarget} onChange={(roundsTarget) => setSettings(s => ({ ...s, roundsTarget }))} render={(n) => (n === null ? t('practice.setup.unlimited') : n)} />
          </PracticeField>

          <PracticeField
            icon={TrendingDown}
            tone="amber"
            label={t('practice.oneTwentyOne.setup.onFail')}
            hint={t('practice.oneTwentyOne.setup.onFailHint', { target: settings.startTarget })}
            value={t(`practice.oneTwentyOne.setup.onFail_${settings.onFail}`)}
          >
            <PracticeChips options={['down', 'stay']} value={settings.onFail} onChange={(onFail) => setSettings(s => ({ ...s, onFail }))} render={(v) => t(`practice.oneTwentyOne.setup.onFail_${v}`)} />
          </PracticeField>

          <PracticeField
            icon={Keyboard}
            tone="violet"
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

  const stats = computeStats(session);
  const remaining = liveRemaining(session.round);
  const left = visitsLeft(session);
  const roundNumber = session.rounds.length + 1;
  const labels = lastVisitLabels(session.round);
  const suggestion = session.round.current.visit.darts.length === 0 ? checkoutData[String(remaining)] : null;
  const flashClass = flash?.type === 'success' ? 'leg-won' : flash ? 'bust' : '';

  return (
    <div className="practice-play">
      <CheckoutDialog pending={pendingCheckout} onChange={setPendingCheckout} onCancel={() => setPendingCheckout(null)} onConfirm={handleConfirmCheckout} />

      <div className="practice-play-top">
        <button type="button" className="back-btn" onClick={() => navigate('/practice')}>
          <ArrowLeft size={18} /> {t('practice.title')}
        </button>
        <div className="practice-play-meta">
          <span>
            {session.settings.roundsTarget === null
              ? t('practice.oneTwentyOne.round', { current: roundNumber })
              : t('practice.oneTwentyOne.roundOf', { current: roundNumber, total: session.settings.roundsTarget })}
          </span>
          <span>{t('practice.oneTwentyOne.stats.successes')} <b>{stats.successes}/{stats.rounds}</b></span>
        </div>
      </div>

      <div className={`practice-board ${flashClass}`}>
        {flash?.type === 'success' && <div className="practice-board-flash">{t('practice.oneTwentyOne.success', { target: flash.target })}</div>}
        {flash?.type === 'fail' && <div className="practice-board-flash">{t('practice.oneTwentyOne.fail', { target: flash.target })}</div>}
        {flash?.type === 'bust' && <div className="practice-board-flash">{t('practice.bust')}</div>}
        <div className="practice-remaining-label">
          {t('practice.checkout.target')} {session.target}
          {remaining !== session.target && ` · ${t('practice.remaining')}`}
        </div>
        <div className="practice-remaining">{remaining}</div>
        <div className="practice-checkout-hint">{suggestion ? suggestion.join(' → ') : ''}</div>
        <div className="practice-last-throws">
          {labels.map((label, idx) => <span key={idx}>{label}</span>)}
        </div>
        <div className="practice-visits">
          {[0, 1, 2].map(i => <span key={i} className={`practice-visit-dot ${i < 3 - left ? 'used' : ''}`} />)}
          <span className="practice-visits-label">{t(`practice.oneTwentyOne.visitsLeft${pluralSuffix(left)}`, { count: left })}</span>
        </div>
      </div>

      <div className="dart-board">
        {session.settings.scoringMode === 'dart' ? (
          <DartKeypad
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            onDart={handleDart}
            onUndo={handleUndo}
            dartsInVisit={session.round.current.visit.darts.length}
            canUndo={canUndo(session) || x01CanUndo(session.round)}
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

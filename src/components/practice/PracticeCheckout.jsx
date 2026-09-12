import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crosshair, Flag, Repeat } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { TurnTotalKeypad } from '../scoring/TurnTotalKeypad';
import { CheckoutDialog } from '../scoring/CheckoutDialog';
import {
  PracticeScreenHeader, PracticeChips, PracticeSummary, PracticeHardestList,
  PracticeSetup, PracticeField
} from './PracticeShared';
import {
  createCheckoutTrainer, applyVisitTotal, undo, canUndo, liveRemaining, computeStats,
  CHECKOUT_RANGES, ATTEMPT_OPTIONS
} from '../../lib/checkoutTrainer';
import { describeSession, pluralSuffix } from '../../lib/practiceGames';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useKeepScreenAwake } from '../../hooks/useKeepScreenAwake';
import { useOnScreenKeypad } from '../../hooks/useOnScreenKeypad';
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

// Checkout trainer: one three-dart total per attempt. A total that lands
// exactly on the target opens the checkout dialog, which is the only way the
// trainer can tell a finish on a double from a bust.
export function PracticeCheckout() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isOnScreenKeypad = useOnScreenKeypad();
  const { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard } =
    usePracticeSession(GAME, { defaultSettings: DEFAULT_SETTINGS, sanitize, computeStats });
  const [turnTotalInput, setTurnTotalInput] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState(null);
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

  const handleOutcome = ({ state, outcome }) => {
    if (outcome === null) return;
    if (outcome === 'hit') { hapticLegWon(); showFlash({ type: 'hit', darts: state.attempts.at(-1).dartsUsed }); }
    else if (outcome === 'bust') { hapticBust(); showFlash({ type: 'bust' }); }
    else if (outcome === 'miss') { hapticBust(); showFlash({ type: 'miss' }); }
    setSession(state);
    if (state.finishedAt) setTimeout(() => finish(state), FLASH_MS);
  };

  const handleTurnTotal = (total) => {
    if (!session || flash) return;
    hapticTap();
    // Landing on the target: ask how many darts, and whether it was a double.
    if (liveRemaining(session) - total === 0) {
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
    const attemptsLabel = settings.attemptsTarget === null
      ? t('practice.setup.unlimited')
      : t(`practice.checkout.attemptCount${pluralSuffix(settings.attemptsTarget)}`, { count: settings.attemptsTarget });
    return (
      <div className="practice-page">
        <PracticeScreenHeader title={t('practice.games.checkout.title')} description={t('practice.games.checkout.desc')} />
        <PracticeSetup
          title={t('practice.checkout.setup.title')}
          subtitle={t('practice.checkout.setup.subtitle')}
          note={t('practice.checkout.setup.note')}
          recap={describeSession({ game: GAME, settings }, t)}
          onStart={handleStart}
        >
          <PracticeField
            icon={Crosshair}
            tone="green"
            label={t('practice.checkout.setup.range')}
            hint={t('practice.checkout.setup.rangeHint')}
            value={rangeLabel(settings)}
          >
            <PracticeChips
              options={RANGE_KEYS}
              value={settings.range}
              onChange={(range) => setSettings(s => ({ ...rangeToSettings(range), attemptsTarget: s.attemptsTarget }))}
              render={(range) => `${t(`practice.checkout.ranges.${range}`)}${range === 'doubles' ? '' : ` ${CHECKOUT_RANGES[range].min}–${CHECKOUT_RANGES[range].max}`}`}
            />
          </PracticeField>

          <PracticeField
            icon={Repeat}
            tone="blue"
            label={t('practice.checkout.setup.attempts')}
            hint={t('practice.checkout.setup.attemptsHint')}
            value={attemptsLabel}
          >
            <PracticeChips
              options={ATTEMPT_OPTIONS}
              value={settings.attemptsTarget}
              onChange={(attemptsTarget) => setSettings(s => ({ ...s, attemptsTarget }))}
              render={(n) => (n === null ? t('practice.setup.unlimited') : n)}
            />
          </PracticeField>
        </PracticeSetup>
      </div>
    );
  }

  const stats = computeStats(session);
  const remaining = liveRemaining(session);
  const attemptNumber = session.attempts.length + 1;
  const suggestion = checkoutData[String(remaining)];
  const lastAttempt = session.attempts.at(-1);
  const flashClass = flash?.type === 'hit' ? 'leg-won' : flash ? 'bust' : '';

  return (
    <div className="practice-play">
      <CheckoutDialog
        pending={pendingCheckout}
        onChange={setPendingCheckout}
        onCancel={() => setPendingCheckout(null)}
        onConfirm={handleConfirmCheckout}
        doubleOutHint={t('practice.checkout.dialogHit')}
        bustHint={t('practice.checkout.dialogBust')}
      />

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
          {lastAttempt && (
            <span className="faded">
              {t('practice.checkout.lastAttempt', { target: lastAttempt.target })} {lastAttempt.hit ? '✓' : '✗'}
            </span>
          )}
        </div>
        <div className="practice-board-stats">
          <span>{t('practice.checkout.stats.hits')}: <b>{stats.hits}/{stats.attempts}</b></span>
          <span>{t('practice.checkout.stats.avgDartsPerHit')}: <b>{stats.avgDartsPerHit ?? t('practice.noStats')}</b></span>
          <span>{t('practice.checkout.stats.bestStreak')}: <b>{stats.bestStreak}</b></span>
        </div>
      </div>

      <div className="dart-board">
        <TurnTotalKeypad
          value={turnTotalInput}
          onChange={(next) => { hapticTap(); setTurnTotalInput(next); }}
          onSubmit={handleTurnTotal}
          onUndo={handleUndo}
          canUndo={canUndo(session)}
          useOnScreenKeypad={isOnScreenKeypad}
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

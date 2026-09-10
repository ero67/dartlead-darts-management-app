import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { normalizeTurnTotalInput, appendTurnTotalDigit, parseTurnTotal } from '../../lib/turnTotalInput';

// 3-dart total entry: big readout, undo, and either an on-screen keypad or a
// text field for keyboards. Presentational; the caller owns the input string.
export function TurnTotalKeypad({
  value,
  onChange,
  onSubmit,
  onUndo,
  canUndo = true,
  useOnScreenKeypad = true,
  disabled = false
}) {
  const { t } = useLanguage();
  const isInvalid = value.length > 0 && parseTurnTotal(value) === null;
  const inputRef = useRef(null);

  // Keyboard entry: the field is disabled while the other side throws (a bot
  // visit, a bust/leg flash) and a disabled input drops focus. Put the caret
  // back the moment it is enabled again, so the next visit can just be typed.
  useEffect(() => {
    if (!useOnScreenKeypad && !disabled) inputRef.current?.focus();
  }, [useOnScreenKeypad, disabled]);

  const append = (digit) => onChange(appendTurnTotalDigit(value, digit));
  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');
  const submit = () => {
    if (disabled || isInvalid) return;
    onSubmit(parseTurnTotal(value));
  };

  const okButton = (
    <button
      className="dart-btn turn-total-ok"
      onClick={submit}
      disabled={disabled || isInvalid}
      type="button"
    >
      <span>{t('match.ok')}</span>
      {!value && <span className="turn-total-ok-sub">{t('match.okZero')}</span>}
    </button>
  );

  return (
    <div className="turn-total-container">
      <div className="turn-total-display">
        <div className="turn-total-display-row">
          <div className="turn-total-label">{t('match.turnTotalLabel')}</div>
          {/* Undo lives up here, away from OK: it used to sit right
              under the big green button and got hit by mistake. */}
          <button
            className="turn-total-undo"
            onClick={onUndo}
            disabled={disabled || !canUndo}
            type="button"
            title={t('match.undoLastVisit')}
          >
            <RotateCcw size={14} />
            {t('match.undoLastVisit')}
          </button>
        </div>
        <div className={`turn-total-value ${isInvalid ? 'invalid' : ''} ${value ? '' : 'empty'}`}>
          {value || '0'}
        </div>
        <div className="turn-total-hint">
          {isInvalid
            ? t('match.turnTotalInvalid')
            : (useOnScreenKeypad ? t('match.turnTotalKeypadHint') : t('match.turnTotalTypeHint'))}
        </div>
      </div>
      {useOnScreenKeypad ? (
        <div className="turn-total-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} className="dart-btn" onClick={() => append(n)} type="button" disabled={disabled}>
              {n}
            </button>
          ))}
          <button className="dart-btn turn-total-clear" onClick={clear} type="button" disabled={disabled || !value}>
            {t('match.clear')}
          </button>
          <button className="dart-btn" onClick={() => append(0)} type="button" disabled={disabled}>0</button>
          <button className="dart-btn turn-total-backspace" onClick={backspace} type="button" disabled={disabled || !value} title={t('match.backspace')}>
            ⌫
          </button>
          {okButton}
        </div>
      ) : (
        <div className="turn-total-desktop">
          <input
            ref={inputRef}
            autoFocus
            className={`turn-total-input ${isInvalid ? 'invalid' : ''}`}
            value={value}
            onChange={(e) => onChange(normalizeTurnTotalInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                clear();
              }
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0–180"
            disabled={disabled}
          />
          {okButton}
          <button className="dart-btn turn-total-clear" onClick={clear} type="button" disabled={disabled || !value}>
            {t('match.clear')}
          </button>
        </div>
      )}
    </div>
  );
}

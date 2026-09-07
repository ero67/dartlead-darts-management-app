import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { DART_NUMBERS } from '../../lib/x01Engine';

// Dart-by-dart keypad: 1–20, bull, miss, with double/triple toggles and undo.
// Presentational only; the caller owns the scoring rules. Markup and class
// names are shared with the match screen so both look identical.
export function DartKeypad({
  inputMode,
  onInputModeChange,
  onDart,
  onUndo,
  dartsInVisit = 0,
  canUndo = true,
  disabled = false
}) {
  const { t } = useLanguage();

  const toggleMode = (mode) => onInputModeChange(inputMode === mode ? 'single' : mode);

  return (
    <>
      {/* Number buttons grid */}
      <div className="dart-numbers">
        {DART_NUMBERS.map((number) => (
          <button
            key={number}
            type="button"
            className={`dart-btn ${number === 25 ? 'bull' : inputMode === 'triple' ? 'triple' : inputMode === 'double' ? 'double' : 'single'}`}
            onClick={() => onDart(number)}
            disabled={disabled || dartsInVisit >= 3 || (number === 25 && inputMode === 'triple')}
          >
            {number}
          </button>
        ))}
      </div>
      {/* Mode buttons */}
      <div className="mode-buttons-row">
        <button
          type="button"
          className={`mode-btn-inline ${inputMode === 'double' ? 'active' : ''}`}
          onClick={() => toggleMode('double')}
        >
          {t('match.double')}
        </button>
        <button
          type="button"
          className={`mode-btn-inline ${inputMode === 'triple' ? 'active' : ''}`}
          onClick={() => toggleMode('triple')}
        >
          {t('match.triple')}
        </button>
      </div>
      {/* Remove button - separate row */}
      <div className="remove-last-row">
        <button
          type="button"
          className="remove-last-btn dart-btn"
          onClick={onUndo}
          disabled={disabled || !canUndo}
        >
          <ArrowLeft size={20} />
          <span>{t('match.undo')}</span>
        </button>
      </div>
    </>
  );
}

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { DART_NUMBERS } from '../../lib/x01Engine';
import { cn } from '@/lib/utils';

const KEY = 'flex min-h-12 items-center justify-center rounded-lg border bg-card text-xl font-semibold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40';

// Dart-by-dart keypad: 1–20, bull, miss, with double/triple toggles and undo.
// Presentational only; the caller owns the scoring rules. Shared by the
// match screen and the practice games; it fills whatever height its flex
// parent gives it (phones) and sits at 48px keys otherwise.
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
  // Numbers take the tint of the live modifier so a pending Double/Triple is visible on every key.
  const modeClass = inputMode === 'single' ? '' : 'border-primary/40 bg-primary/10';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 p-1 text-foreground">
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-5 gap-1 max-lg:landscape:grid-cols-8">
        {DART_NUMBERS.map((number) => (
          <button
            key={number}
            type="button"
            className={cn(KEY, 'h-full', number === 25 ? 'border-primary/40 bg-primary/10 text-primary' : modeClass)}
            onClick={() => onDart(number)}
            disabled={disabled || dartsInVisit >= 3 || (number === 25 && inputMode === 'triple')}
          >
            {number}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          className={cn(KEY, 'text-lg', inputMode === 'double' && 'border-primary bg-primary text-primary-foreground')}
          aria-pressed={inputMode === 'double'}
          onClick={() => toggleMode('double')}
        >
          {t('match.double')}
        </button>
        <button
          type="button"
          className={cn(KEY, 'text-lg', inputMode === 'triple' && 'border-primary bg-primary text-primary-foreground')}
          aria-pressed={inputMode === 'triple'}
          onClick={() => toggleMode('triple')}
        >
          {t('match.triple')}
        </button>
      </div>
      <button
        type="button"
        className={cn(KEY, 'min-h-11 gap-2 border-destructive/30 bg-destructive/10 text-base text-destructive')}
        onClick={onUndo}
        disabled={disabled || !canUndo}
      >
        <ArrowLeft className="size-5" />
        <span>{t('match.undo')}</span>
      </button>
    </div>
  );
}

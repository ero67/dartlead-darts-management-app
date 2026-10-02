import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { normalizeTurnTotalInput, appendTurnTotalDigit, parseTurnTotal } from '../../lib/turnTotalInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const KEY = 'flex min-h-12 items-center justify-center rounded-lg border bg-card text-xl font-semibold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40';

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
    <Button
      className="col-span-3 h-14 w-full flex-col gap-0 text-lg"
      onClick={submit}
      disabled={disabled || isInvalid}
      type="button"
    >
      <span>{t('match.ok')}</span>
      {!value && <span className="text-xs font-normal opacity-80">{t('match.okZero')}</span>}
    </Button>
  );

  const clearButton = (
    <button className={cn(KEY, 'text-base text-muted-foreground')} onClick={clear} type="button" disabled={disabled || !value}>
      {t('match.clear')}
    </button>
  );

  return (
    <div className="tw flex min-h-0 flex-1 flex-col gap-2 p-2 text-foreground">
      <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('match.turnTotalLabel')}</span>
          {/* Undo lives up here, away from OK: it used to sit right
              under the big green button and got hit by mistake. */}
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 text-muted-foreground"
            onClick={onUndo}
            disabled={disabled || !canUndo}
            type="button"
            title={t('match.undoLastVisit')}
          >
            <RotateCcw />
            {t('match.undoLastVisit')}
          </Button>
        </div>
        <div className={cn('text-5xl font-semibold tracking-tight tabular-nums', isInvalid && 'text-destructive', !value && 'text-muted-foreground')}>
          {value || '0'}
        </div>
        <div className={cn('text-xs', isInvalid ? 'text-destructive' : 'text-muted-foreground')}>
          {isInvalid
            ? t('match.turnTotalInvalid')
            : (useOnScreenKeypad ? t('match.turnTotalKeypadHint') : t('match.turnTotalTypeHint'))}
        </div>
      </div>
      {useOnScreenKeypad ? (
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-3 gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} className={KEY} onClick={() => append(n)} type="button" disabled={disabled}>
              {n}
            </button>
          ))}
          {clearButton}
          <button className={KEY} onClick={() => append(0)} type="button" disabled={disabled}>0</button>
          <button className={cn(KEY, 'text-muted-foreground')} onClick={backspace} type="button" disabled={disabled || !value} title={t('match.backspace')}>
            ⌫
          </button>
          {okButton}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            ref={inputRef}
            autoFocus
            className="h-12 text-center text-2xl font-semibold tabular-nums md:text-2xl"
            aria-invalid={isInvalid || undefined}
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
          {clearButton}
        </div>
      )}
    </div>
  );
}

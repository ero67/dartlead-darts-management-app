import React, { useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { normalizeTurnTotalInput, appendTurnTotalDigit, parseTurnTotal } from '../../lib/turnTotalInput';
import { useVoiceScore } from '../../hooks/useVoiceScore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const VOICE_KEY = 'dartlead-voice-scoring';
const KEY = 'flex min-h-12 short:min-h-7 items-center justify-center rounded-lg border bg-card font-display text-2xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40';

// Visit totals that come up all the time; one tap fills the readout.
const QUICK_SCORES = [26, 41, 45, 60, 81, 85, 100, 140, 180];

// 3-dart total entry: big readout, undo, and either an on-screen keypad or a
// text field for keyboards. Presentational; the caller owns the input string.
export function TurnTotalKeypad({
  value,
  onChange,
  onSubmit,
  onUndo,
  canUndo = true,
  useOnScreenKeypad = true,
  showQuickScores = false,
  disabled = false
}) {
  const { t, language } = useLanguage();
  const isInvalid = value.length > 0 && parseTurnTotal(value) === null;
  const inputRef = useRef(null);
  const [isVoiceMissed, setIsVoiceMissed] = useState(false);
  // Hands-free mode sticks across matches on this device.
  const [isVoiceOn, setIsVoiceOn] = useState(() => localStorage.getItem(VOICE_KEY) === '1');
  const submitRef = useRef(null);
  const voice = useVoiceScore({
    lang: language,
    enabled: isVoiceOn,
    active: !disabled,
    onResult: (result) => {
      setIsVoiceMissed(false);
      if (result.command === 'submit') submitRef.current?.();
      else if (result.submit) onSubmit(result.score);
      else onChange(String(result.score));
    },
    onGiveUp: () => { setIsVoiceOn(false); setIsVoiceMissed(true); }
  });
  const handleVoice = () => {
    setIsVoiceMissed(false);
    setIsVoiceOn((on) => { localStorage.setItem(VOICE_KEY, on ? '0' : '1'); return !on; });
  };

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
  submitRef.current = submit;

  const okButton = (
    <Button
      className="col-span-3 h-14 w-full flex-col gap-0 text-lg short:h-10"
      onClick={submit}
      disabled={disabled || isInvalid}
      type="button"
    >
      <span>{t('match.ok')}</span>
      {!value && <span className="text-xs font-normal opacity-80">{t('match.okZero')}</span>}
    </Button>
  );

  const clearButton = (
    <button className={cn(KEY, 'font-sans text-base font-medium text-muted-foreground')} onClick={clear} type="button" disabled={disabled || !value}>
      {t('match.clear')}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 text-foreground">
      <div className="flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 short:py-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('match.turnTotalLabel')}</span>
          {/* Undo lives up here, away from OK: it used to sit right
              under the big green button and got hit by mistake. */}
          <span className="flex items-center">
          {voice.isSupported && (
            <Button
              variant="ghost"
              size="sm"
              className={cn('text-muted-foreground', isVoiceOn && 'text-foreground', voice.isListening && 'animate-pulse text-live')}
              onClick={handleVoice}
              type="button"
              aria-pressed={isVoiceOn}
              title={t('match.voiceScore')}
            >
              <Mic />
              {voice.isListening ? t('match.voiceListening') : isVoiceOn ? t('match.voiceOn') : t('match.voiceScore')}
            </Button>
          )}
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
          </span>
        </div>
        <div className={cn('font-display text-5xl font-semibold tabular-nums short:text-3xl', isInvalid && 'text-destructive', !value && 'text-muted-foreground')}>
          {value || '0'}
        </div>
        <div className={cn('text-xs', isInvalid || isVoiceMissed ? 'text-destructive' : 'text-muted-foreground short:hidden')}>
          {isInvalid
            ? t('match.turnTotalInvalid')
            : isVoiceMissed
              ? t('match.voiceMissed')
              : (useOnScreenKeypad ? t('match.turnTotalKeypadHint') : t('match.turnTotalTypeHint'))}
        </div>
      </div>
      {useOnScreenKeypad && showQuickScores && (
        <div className="flex shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] short:hidden [&::-webkit-scrollbar]:hidden">
          {QUICK_SCORES.map(n => (
            <button
              key={n}
              type="button"
              className="h-9 shrink-0 rounded-md border px-3 font-display text-lg font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              onClick={() => onChange(String(n))}
              disabled={disabled}
            >
              {n}
            </button>
          ))}
        </div>
      )}
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

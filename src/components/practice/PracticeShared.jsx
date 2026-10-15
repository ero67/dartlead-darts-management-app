import React, { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Flag, Play, RotateCcw, Settings2, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { StatTile } from '../shared/StatTile';
import { BoardMotif, CheckoutRoute } from '../shared/DartsAccents';
import { cn } from '@/lib/utils';

// ---- History rows -----------------------------------------------------------

// Short game tag in a tinted box, the first thing in every session row.
export function PracticeGameAbbr({ game, className }) {
  const { t } = useLanguage();
  return (
    <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-display text-[15px] font-bold text-primary', className)}>
      {t(`practice.games.${game}.short`)}
    </span>
  );
}

// Back link + page header used by every game's setup screen.
export function PracticeScreenHeader({ title, description, children }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => navigate('/practice')}>
          <ArrowLeft /> {t('practice.backToPractice')}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// Setup screen shell: the settings card every game shows before the first
// dart. `children` are PracticeField sections; `recap` is the one-line
// read-back of the current settings shown above the start button.
export function PracticeSetup({ title, subtitle, recap, children, note, onStart }) {
  const { t } = useLanguage();
  const sections = React.Children.toArray(children);
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {sections.map((section, i) => (
          <React.Fragment key={section.key ?? i}>
            {i > 0 && <Separator />}
            {section}
          </React.Fragment>
        ))}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {recap && <p className="text-center text-sm text-muted-foreground">{recap}</p>}
        <Button size="lg" className="h-14 w-full font-display text-2xl font-bold tracking-wide" onClick={onStart}>
          <Play /> {t('practice.start')}
        </Button>
      </CardFooter>
    </Card>
  );
}

// One settings section inside PracticeSetup: icon box, label, hint and the
// current value as a badge, then the controls.
export function PracticeField({ icon: Icon, label, hint, value, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
        {value !== null && value !== undefined && value !== '' && (
          <Badge variant="secondary" className="max-w-[45%] truncate tabular-nums">{value}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// Two-up (or more) option cards for a setting that needs a line of
// explanation each. Option values are compared as strings (Radix radios
// only carry strings) and mapped back to the original value.
export function PracticeOptionCards({ options, value, onChange }) {
  const id = useId();
  return (
    <RadioGroup
      value={String(value)}
      onValueChange={(next) => onChange(options.find(o => String(o.value) === next)?.value)}
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map((option) => {
        const itemId = `${id}-${String(option.value)}`;
        return (
          <Label
            key={String(option.value)}
            htmlFor={itemId}
            className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent has-data-[state=checked]:border-primary has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary"
          >
            <RadioGroupItem value={String(option.value)} id={itemId} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium leading-none">{option.label}</span>
              {option.hint && <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>}
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

// Chip row for a setting with a small fixed set of values.
export function PracticeChips({ options, value, onChange, render }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={String(option)}
          type="button"
          variant={value === option ? 'default' : 'outline'}
          aria-pressed={value === option}
          className="min-h-11 rounded-full px-4 tabular-nums"
          onClick={() => onChange(option)}
        >
          {render ? render(option) : option}
        </Button>
      ))}
    </div>
  );
}

// ---- Summary screens --------------------------------------------------------

// Top bar of the end-of-session screens: close (back to practice), centred
// "Session complete" and a muted meta line underneath.
export function PracticeSummaryBar({ subtitle }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={t('practice.backToPractice')} onClick={() => navigate('/practice')}>
        <X />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col items-center text-center leading-tight">
        <span className="text-sm font-semibold">{t('practice.sessionComplete')}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <span className="size-11 shrink-0" />
    </div>
  );
}

// Result card: eyebrow, headline, a meta line with an optional accent on the
// right (leg pips, a badge) and a faint board in the corner.
export function PracticeSummaryHeader({ icon: Icon = CheckCircle, eyebrow, title, meta, aside, children }) {
  return (
    <Card className="relative gap-1.5 overflow-hidden bg-gradient-to-br from-primary/10 to-card px-5 py-5">
      <BoardMotif className="-right-20 -top-24 w-60" />
      <span className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        {Icon && <Icon className="size-4" />}
        {eyebrow}
      </span>
      <h1 className="relative text-2xl font-semibold tracking-tight">{title}</h1>
      {(meta || aside) && (
        <div className="relative flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="min-w-0">{meta}</span>
          {aside}
        </div>
      )}
      {children && <div className="relative text-xs text-muted-foreground">{children}</div>}
    </Card>
  );
}

// Play again / change settings / back column under a summary.
export function PracticeSummaryActions({ onPlayAgain, onChangeSettings }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Button size="lg" className="h-14 w-full font-display text-2xl font-bold tracking-wide" onClick={onPlayAgain}>
        <RotateCcw /> {t('practice.playAgain')}
      </Button>
      <Button variant="outline" size="lg" className="w-full" onClick={onChangeSettings}>
        <Settings2 /> {t('practice.changeSettings')}
      </Button>
      <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => navigate('/practice')}>
        <ArrowLeft /> {t('practice.backToPractice')}
      </Button>
    </div>
  );
}

// End-of-session screen: result card, stat tiles, optional extras and the
// actions. `subtitle` names the game + settings, `meta` is the duration line.
export function PracticeSummary({ subtitle, meta, cards, extra, onPlayAgain, onChangeSettings }) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 text-foreground md:p-8">
      <PracticeSummaryBar subtitle={meta} />
      <PracticeSummaryHeader eyebrow={t('practice.sessionComplete')} title={subtitle} />
      <PracticeStatGrid cards={cards} />
      {extra}
      <PracticeSummaryActions onPlayAgain={onPlayAgain} onChangeSettings={onChangeSettings} />
    </div>
  );
}

// Stat tiles, two up on phones. `cards` = [[label, value, hint?], ...].
export function PracticeStatGrid({ cards }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map(([label, value, hint]) => <StatTile key={label} label={label} value={value} hint={hint} />)}
    </div>
  );
}

// 180 / 140+ / 100+ counts in one bordered row; the first cell carries the
// live-red tint the scoring screens use for trebles.
export function PracticeBandRow({ bands, label }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card">
      {bands.map(([name, value], i) => (
        <div key={name} className={cn('flex items-baseline justify-center gap-2 px-2 py-3', i === 0 && 'bg-gradient-to-br from-live/15 to-card')}>
          <span className="font-display text-3xl font-bold leading-none tabular-nums">{value}</span>
          <span className={cn('text-xs', i === 0 ? 'font-semibold text-live' : 'text-muted-foreground')}>{name}</span>
        </div>
      ))}
    </div>
  );
}

// "Hardest numbers" list shown under a summary.
export function PracticeHardestList({ title, items, unitLabel }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap justify-center gap-2">
        {items.map((item) => (
          <Badge key={item.target} variant="outline" className="gap-1 px-3 py-1 text-sm font-normal text-muted-foreground">
            <b className="font-semibold text-foreground tabular-nums">{item.target === 25 ? 'Bull' : item.target}</b> {unitLabel(item)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---- Play screens -----------------------------------------------------------

// Shell for a game in progress, phone-first: back button, the title and meta
// line, "finish session" on the right, then the board + keypad as children.
// Follows the theme like the match screen does (no forced dark root).
export function PracticePlay({ title, subtitle, onFinish, children }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-2 sm:p-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={t('practice.backToPractice')} onClick={() => navigate('/practice')}>
            <ArrowLeft />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{title}</span>
            {subtitle && <span className="truncate text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_b]:tabular-nums">{subtitle}</span>}
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={onFinish}>
            <Flag /> {t('practice.finishSession')}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Target card: green-tinted shell for the number being thrown at. `flash` is
// { tone: 'good' | 'bad', text } or null, shown as a badge over the top edge
// while the border takes its colour.
export function PracticeBoard({ flash, className, children, ...props }) {
  return (
    <Card
      className={cn(
        'relative gap-3 overflow-hidden border-primary/40 bg-gradient-to-b from-primary/10 to-card px-4 py-4 transition-colors',
        flash?.tone === 'bad' && 'border-destructive from-destructive/15',
        flash?.tone === 'good' && 'border-primary from-primary/25',
        className
      )}
      {...props}
    >
      {flash && (
        <Badge className={cn('absolute left-1/2 top-2 z-10 -translate-x-1/2 px-3 py-1 font-display text-lg font-bold uppercase tracking-wide', flash.tone === 'bad' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground')}>
          {flash.text}
        </Badge>
      )}
      {children}
    </Card>
  );
}

// Small uppercase caption above a board number.
export function PracticeBoardLabel({ className, children }) {
  return <div className={cn('text-[11px] font-semibold uppercase tracking-widest text-primary', className)}>{children}</div>;
}

// The big remaining / target number.
export function PracticeBoardValue({ children, className }) {
  return <div className={cn('font-display text-8xl font-bold leading-[0.85] tabular-nums', className)}>{children}</div>;
}

// Suggested finish as checkout chips; `children` is shown instead when there is no route.
export function PracticeCheckoutHint({ route, className, children }) {
  return (
    <div className={cn('flex min-h-6 items-center', className)}>
      {route?.length ? <CheckoutRoute route={route} /> : children}
    </div>
  );
}

// The darts of the last visit as chips.
export function PracticeLastThrows({ labels, className }) {
  return (
    <div className={cn('flex min-h-8 flex-wrap justify-center gap-1.5', className)}>
      {labels.map((label, idx) => (
        <Badge key={idx} variant="outline" className="min-w-10 justify-center px-2.5 py-1 text-sm tabular-nums">{label}</Badge>
      ))}
    </div>
  );
}

// Stats under the board number: big numeral over a muted label, three up.
// `items` = [[label, value, valueClassName?], ...].
export function PracticeBoardStats({ items }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-t border-primary/20 pt-3">
      {items.map(([label, value, valueClass]) => (
        <span key={label} className="flex min-w-0 flex-col leading-tight">
          <b className={cn('font-display text-2xl font-bold tabular-nums', valueClass)}>{value}</b>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </span>
      ))}
    </div>
  );
}

// Progress strip of attempts / rounds: one cell each, oldest first. `cells` =
// [{ label, tone: 'good' | 'bad' | 'muted' | 'current' | 'empty', title }].
const STRIP_TONE = {
  good: 'border-primary bg-primary text-primary-foreground',
  bad: 'border-live bg-live/15 text-live',
  muted: 'border-muted-foreground/50 text-muted-foreground',
  current: 'border-primary text-foreground ring-2 ring-primary/30',
  empty: 'border-border text-muted-foreground/50'
};
export function PracticeStrip({ cells, round = false, label, className }) {
  return (
    <div role="img" aria-label={label} className={cn('flex gap-1 px-1', round && 'justify-between', className)}>
      {cells.map((cell, i) => (
        <span
          key={i}
          title={cell.title}
          className={cn(
            'flex h-7 items-center justify-center border font-display text-sm font-semibold tabular-nums',
            round ? 'w-7 shrink-0 rounded-full' : 'min-w-0 flex-1 rounded-md',
            STRIP_TONE[cell.tone] || STRIP_TONE.empty
          )}
        >
          {cell.label}
        </span>
      ))}
    </div>
  );
}

// Wrapper that gives the keypad its card.
export function PracticeKeypad({ children }) {
  return <div className="flex flex-col overflow-hidden rounded-xl border">{children}</div>;
}

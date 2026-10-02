import React, { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Flag, Play, RotateCcw, Settings2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { StatTile } from '../shared/StatTile';
import { cn } from '@/lib/utils';

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
        <Button size="lg" className="w-full" onClick={onStart}>
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

// Header shared by the end-of-session screens: green check, title, subtitle.
export function PracticeSummaryHeader({ icon: Icon = CheckCircle, title, children }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
        {Icon && <Icon className="size-7" />}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

// Play again / change settings / back row under a summary.
export function PracticeSummaryActions({ onPlayAgain, onChangeSettings }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button onClick={onPlayAgain}>
        <RotateCcw /> {t('practice.playAgain')}
      </Button>
      <Button variant="outline" onClick={onChangeSettings}>
        <Settings2 /> {t('practice.changeSettings')}
      </Button>
      <Button variant="ghost" onClick={() => navigate('/practice')}>
        <ArrowLeft /> {t('practice.backToPractice')}
      </Button>
    </div>
  );
}

// End-of-session screen: stat tiles plus play again / settings / back.
export function PracticeSummary({ subtitle, cards, extra, onPlayAgain, onChangeSettings }) {
  const { t } = useLanguage();
  return (
    <div className="tw mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
      <PracticeSummaryHeader title={t('practice.sessionComplete')}>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </PracticeSummaryHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => <StatTile key={label} label={label} value={value} />)}
      </div>
      {extra}
      <PracticeSummaryActions onPlayAgain={onPlayAgain} onChangeSettings={onChangeSettings} />
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

// ---- Play screens (dark board) ---------------------------------------------

// Shell for a game in progress: dark regardless of theme, phone-first. Top bar
// with the back button and the meta line, the board + keypad as children, and
// the "finish session" footer.
export function PracticePlay({ meta, onFinish, children }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <div className="tw dark-mode flex flex-1 flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-2 sm:p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => navigate('/practice')}>
            <ArrowLeft /> {t('practice.title')}
          </Button>
          <div className="flex flex-1 flex-wrap justify-end gap-x-3 text-xs text-muted-foreground sm:text-sm [&_b]:font-semibold [&_b]:text-foreground [&_b]:tabular-nums">
            {meta}
          </div>
        </div>
        {children}
        <div className="flex justify-center pt-1">
          <Button variant="ghost" className="text-muted-foreground" onClick={onFinish}>
            <Flag /> {t('practice.finishSession')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Scoreboard card. `flash` is { tone: 'good' | 'bad', text } or null and is
// shown as a prominent badge over the top edge while the border takes its colour.
export function PracticeBoard({ flash, className, children, ...props }) {
  return (
    <Card
      className={cn(
        'relative items-center gap-2 px-4 py-5 text-center transition-colors',
        flash?.tone === 'bad' && 'border-destructive bg-destructive/10',
        flash?.tone === 'good' && 'border-primary bg-primary/10',
        className
      )}
      {...props}
    >
      {flash && (
        <Badge className={cn('absolute left-1/2 top-2 z-10 -translate-x-1/2 px-3 py-1 text-sm', flash.tone === 'bad' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground')}>
          {flash.text}
        </Badge>
      )}
      {children}
    </Card>
  );
}

// Small uppercase caption above the big number.
export function PracticeBoardLabel({ children }) {
  return <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</div>;
}

// The big remaining / target number.
export function PracticeBoardValue({ children, className }) {
  return <div className={cn('text-7xl font-semibold leading-none tracking-tight tabular-nums', className)}>{children}</div>;
}

// Suggested checkout path (or any one-line hint under the number).
export function PracticeCheckoutHint({ children }) {
  return <div className="min-h-6 text-base font-semibold text-primary">{children}</div>;
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

// Muted "label: value" stats line at the bottom of the board.
export function PracticeBoardStats({ items }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {items.map(([label, value]) => (
        <span key={label}>{label}: <b className="font-semibold text-foreground tabular-nums">{value}</b></span>
      ))}
    </div>
  );
}

// Wrapper that gives the keypad its card.
export function PracticeKeypad({ children }) {
  return <div className="flex flex-col overflow-hidden rounded-xl border">{children}</div>;
}

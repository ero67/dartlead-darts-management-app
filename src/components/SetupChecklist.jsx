import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Circle, CircleCheck, CircleDot, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useTournament } from '../contexts/TournamentContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Set by the venue card when the TV view is opened or its link copied (per device).
export const VENUE_READY_KEY = 'venue-ready';

const readFlag = (key) => {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
};
const writeFlag = (key) => {
  try { localStorage.setItem(key, '1'); } catch { /* private mode: the guide just stays */ }
};

// Guide for a new manager, from an empty account to the first league night
// running. Every step ticks itself off from real data and links to the exact
// screen. Hidden once any of the manager's tournaments has started, so
// managers who already run nights never see it, or when dismissed.
export function SetupChecklist() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { leagues } = useLeague();
  const { tournaments } = useTournament();
  const { boardNumber } = useLiveMatch();
  const navigate = useNavigate();
  const dismissKey = `setup-checklist-dismissed:${user?.id}`;
  const [isDismissed, setIsDismissed] = useState(() => readFlag(dismissKey));

  const ownLeagues = leagues.filter(l => l.createdBy === user?.id || l.managerIds?.includes(user?.id));
  const ownLeagueIds = new Set(ownLeagues.map(l => l.id));
  const mine = tournaments.filter(tr => tr.userId === user?.id || ownLeagueIds.has(tr.leagueId));
  const hasStarted = mine.some(tr => tr.status !== 'open_for_registration');
  if (!user || isDismissed || hasStarted) return null;

  const league = ownLeagues[0];
  const round = league && tournaments
    .filter(tr => tr.leagueId === league.id)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  const roundPath = round && `/tournament/${round.id}`;

  const steps = [
    { id: 'league', done: Boolean(league), to: '/create-league' },
    { id: 'defaults', done: Boolean(league?.defaultTournamentSettings), to: league && `/league/${league.id}?tab=settings&section=defaults` },
    { id: 'round', done: Boolean(round), to: league && `/create-tournament?leagueId=${league.id}` },
    { id: 'players', done: (round?.playerCount ?? 0) >= 2, to: roundPath },
    { id: 'venue', done: Boolean(boardNumber) || readFlag(VENUE_READY_KEY), to: roundPath, optional: true },
    { id: 'start', done: hasStarted, to: roundPath },
  ];
  // Optional steps never block: the next step is the first required one not done.
  const current = steps.find(s => !s.done && !s.optional);
  const doneCount = steps.filter(s => s.done).length;

  const handleDismiss = () => {
    writeFlag(dismissKey);
    setIsDismissed(true);
  };

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="text-lg">{t('setup.title')}</CardTitle>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {t('setup.progress', { done: doneCount, total: steps.length })}
          </span>
        </div>
        <Progress value={(doneCount / steps.length) * 100} aria-label={t('setup.title')} />
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-1" aria-label={t('setup.title')}>
          {steps.map(step => {
            const isCurrent = step === current;
            const Icon = step.done ? CircleCheck : isCurrent ? CircleDot : Circle;
            const showAction = !step.done && step.to && (isCurrent || step.optional);
            return (
              <li
                key={step.id}
                className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg px-3 py-2.5', isCurrent && 'bg-muted/50')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('mt-0.5 size-5 shrink-0', step.done || isCurrent ? 'text-primary' : 'text-muted-foreground/60')}
                />
                {/* basis-40: on phones the button wraps under the text instead of squeezing it */}
                <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                  <span className={cn('text-sm', isCurrent ? 'font-semibold' : step.done ? 'text-muted-foreground' : 'font-medium')}>
                    {t(`setup.steps.${step.id}.title`)}
                    {step.optional && <span className="font-normal text-muted-foreground"> · {t('setup.optional')}</span>}
                    {step.done && <span className="sr-only"> ({t('setup.done')})</span>}
                  </span>
                  {isCurrent && <p className="text-sm text-muted-foreground">{t(`setup.steps.${step.id}.hint`)}</p>}
                </div>
                {showAction && (
                  <Button size="sm" variant={isCurrent ? 'default' : 'outline'} className="shrink-0 max-sm:ml-8" onClick={() => navigate(step.to)}>
                    {t(`setup.steps.${step.id}.action`)}
                    <ArrowRight />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleDismiss}>
          <X />
          {t('setup.dismiss')}
        </Button>
      </CardFooter>
    </Card>
  );
}

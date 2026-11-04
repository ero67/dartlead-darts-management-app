import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleAlert, Loader, X } from 'lucide-react';

import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// A write the assistant proposes (the "action" stream event, see assistant/src/assistant/tools.py). Nothing is
// written until Confirm; the panel runs the write and resumes the run. Afterwards the card only shows the outcome.
export function AssistantAction({ action, isDisabled, onConfirm, onCancel }) {
  const { t, language } = useLanguage();
  const { draft, state } = action;
  const isNextRound = action.action === 'propose_next_round';
  const isSettled = state !== 'pending' && state !== 'running';
  const cardRef = useRef(null);
  const statusRef = useRef(null);

  // The buttons just unmounted under the user's focus: hand it to the status line, never away from the composer.
  useEffect(() => {
    const active = document.activeElement;
    if (isSettled && (active === document.body || cardRef.current?.contains(active))) statusRef.current?.focus();
  }, [isSettled]);

  // The server accepts "2026-11-13 19:00" too, which some WebViews cannot parse: use the ISO "T". A date without a
  // time parses as UTC midnight, so it shows in UTC as that day only.
  const when = (value) => {
    if (!value) return t('assistant.action.noDate');
    const iso = value.replace(' ', 'T');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return value;
    const options = iso.includes('T') ? { dateStyle: 'full', timeStyle: 'short' } : { dateStyle: 'full', timeZone: 'UTC' };
    return date.toLocaleString(language === 'sk' ? 'sk-SK' : 'en-GB', options);
  };
  const field = (label, value) => (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );

  return (
    <Card ref={cardRef} className="gap-3 py-4 text-sm animate-in fade-in duration-300">
      <CardHeader className="px-4">
        <CardTitle>{t(isNextRound ? 'assistant.action.nextRoundTitle' : 'assistant.action.addMembersTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <dl className="flex flex-col gap-1.5">
          {field(t('assistant.action.league'), draft.league)}
          {isNextRound ? (
            <>
              {field(t('assistant.action.name'), draft.name)}
              {field(t('assistant.action.date'), when(draft.starts_at))}
              {draft.venue && field(t('assistant.action.venue'), draft.venue)}
              {field(t('assistant.action.playerCount', { count: draft.players.length }), draft.players.map(p => p.name).join(', '))}
            </>
          ) : (
            field(t('assistant.action.players'), (
              <ul className="flex flex-col gap-1">
                {draft.existing.map(p => <li key={p.id}>{p.name}</li>)}
                {draft.new.map(name => (
                  <li key={`new-${name}`} className="flex items-center gap-1.5">
                    {name}
                    <Badge variant="secondary">{t('assistant.action.new')}</Badge>
                  </li>
                ))}
                {draft.already_members.map(name => (
                  <li key={`member-${name}`} className="text-muted-foreground">{name} · {t('assistant.action.alreadyMember')}</li>
                ))}
              </ul>
            ))
          )}
        </dl>
      </CardContent>
      <CardFooter className="flex-wrap gap-2 px-4">
        {!isSettled && (
          <>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={isDisabled || state === 'running'}
              aria-busy={state === 'running'}
              aria-label={state === 'running' ? t('assistant.action.working') : undefined}
            >
              {state === 'running' && <Loader className="animate-spin" />}
              {t('assistant.action.confirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={isDisabled || state === 'running'}>
              {t('assistant.action.cancel')}
            </Button>
          </>
        )}
        {/* Mounted from the start, so screen readers announce the outcome when it appears */}
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className={`flex items-center gap-1.5 outline-none ${state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {state === 'done' && <><Check className="size-4" />{t('assistant.action.confirmed')}</>}
          {state === 'cancelled' && <><X className="size-4" />{t('assistant.action.cancelled')}</>}
          {state === 'failed' && <><CircleAlert className="size-4 shrink-0" />{t('assistant.action.failed', { error: action.error })}</>}
        </p>
        {state === 'done' && action.tournamentId && (
          <Button size="sm" variant="link" className="px-0" asChild>
            <Link to={`/tournament/${action.tournamentId}`}>{t('assistant.action.openTournament')}</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

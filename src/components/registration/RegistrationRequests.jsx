import React from 'react';
import { AlertCircle, Check, CheckCircle, Copy, UserCheck, XCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';

const initials = (name) => (name || '')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join('');

// Manager view: self-registration requests waiting for approval.
export function RegistrationRequests({ registrations, error, linkCopied, onCopyLink, onApprove, onReject, processingRegId }) {
  const { t } = useLanguage();
  const pendingCount = registrations.filter(r => r.status === 'pending').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="size-4" />
          {t('registration.registrationRequests')}
          {pendingCount > 0 && (
            <Badge variant="secondary" className="tabular-nums">{pendingCount} {t('registration.statusPending')}</Badge>
          )}
        </CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onCopyLink} title={t('registration.copyLinkHint')}>
            {linkCopied ? <Check /> : <Copy />}
            {linkCopied ? t('registration.linkCopied') : t('registration.copyRegistrationLink')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {registrations.length === 0 ? (
          <EmptyState icon={UserCheck} title={t('registration.noRequestsPending')} />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {registrations.map(reg => (
              <li key={reg.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Avatar>
                  <AvatarFallback>{initials(reg.player_name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{reg.player_name}</span>
                  <span className="text-xs text-muted-foreground">{new Date(reg.created_at).toLocaleDateString()}</span>
                </div>
                {reg.status === 'pending' ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => onApprove(reg.id)} disabled={processingRegId === reg.id}>
                      <CheckCircle /> {t('registration.approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(reg.id)} disabled={processingRegId === reg.id}>
                      <XCircle /> {t('registration.reject')}
                    </Button>
                  </div>
                ) : reg.status === 'approved' ? (
                  <Badge variant="outline" className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                    <CheckCircle />
                    {t('registration.statusApproved')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">
                    <XCircle />
                    {t('registration.statusRejected')}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

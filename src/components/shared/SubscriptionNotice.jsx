import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { subscriptionLevel } from '../../utils/billing';

const LEVEL_CLASS = {
  expired: 'border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
  warn: 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
};

// Warns that a paid period is about to end or has ended. `statuses` comes from
// useSubscriptionStatus(); the paying manager and the co-managers of their
// leagues both get it. Nothing is blocked: this is a reminder only.
export function SubscriptionNotice({ statuses }) {
  const { t } = useLanguage();
  const due = (statuses || [])
    .map((s) => ({ ...s, level: subscriptionLevel(s.paid_until) }))
    .filter((s) => s.level === 'warn' || s.level === 'expired');
  if (due.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {due.map((s) => {
        const Icon = s.level === 'expired' ? AlertTriangle : Clock;
        const key = `manager.subscriptionNotice${s.is_own ? 'Own' : 'Shared'}${s.level === 'expired' ? 'Expired' : 'Soon'}`;
        return (
          <Alert key={s.owner_id} className={LEVEL_CLASS[s.level]}>
            <Icon />
            <AlertDescription className="text-current">
              {t(key, {
                date: new Date(s.paid_until).toLocaleDateString(),
                name: s.owner_name || t('manager.subscriptionLeagueOwner'),
                leagues: (s.league_names || []).join(', ')
              })}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}

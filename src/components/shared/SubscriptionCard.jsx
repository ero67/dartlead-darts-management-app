import React from 'react';
import { CreditCard } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { subscriptionLevel } from '../../utils/billing';

// Subscriptions that cover this manager: their own, or (as a co-manager) the
// league owner's. `statuses` comes from useSubscriptionStatus (null = loading).
export function SubscriptionCard({ statuses }) {
  const { t } = useLanguage();
  const dated = (statuses || []).filter(s => s.paid_until);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4" />
          {t('manager.subscriptionTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {!statuses ? (
          <p className="text-muted-foreground">{t('common.loading')}</p>
        ) : dated.length === 0 ? (
          <p className="text-muted-foreground">{t('manager.subscriptionNone')}</p>
        ) : dated.map((s) => {
          const level = subscriptionLevel(s.paid_until);
          const date = new Date(s.paid_until).toLocaleDateString();
          return (
            <div key={s.owner_id} className="flex flex-col gap-1">
              {!s.is_own && (
                <p className="text-muted-foreground">
                  {t('manager.subscriptionCoveredBy', { name: s.owner_name || t('manager.subscriptionLeagueOwner') })}
                </p>
              )}
              <Badge
                variant="outline"
                className={
                  level === 'expired'
                    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                    : level === 'warn'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                }
              >
                {level === 'expired'
                  ? t('manager.subscriptionExpired', { date })
                  : t('manager.subscriptionActiveUntil', { date })}
              </Badge>
              {level === 'warn' && (
                <p className="text-muted-foreground">{t('manager.subscriptionExpiresSoon')}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

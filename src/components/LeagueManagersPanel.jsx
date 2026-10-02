import React, { useState, useEffect, useCallback } from 'react';
import { X, Crown, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { UserSearchPicker } from './UserSearchPicker';
import { leagueService } from '../services/leagueService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from './shared/EmptyState';

// Co-managers of a league. They share the creator's subscription and have the
// same rights inside the league; only the creator (or an admin) edits the list.
// Enforcement happens in the database (RPCs + RLS); canEdit only shapes the UI.
export function LeagueManagersPanel({ leagueId, canEdit }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [hasAccess, setHasAccess] = useState(true);

  const loadManagers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setManagers(await leagueService.listManagers(leagueId));
    } catch (err) {
      if (err?.message?.includes('not_authorized')) {
        setHasAccess(false);
      } else {
        setError(t('leagueManagers.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, t]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  const handleAddManager = async (picked) => {
    if (!picked?.email || isAdding) return;
    setIsAdding(true);
    setError('');
    try {
      const result = await leagueService.addManager(leagueId, picked.email);
      if (result?.success) {
        setManagers(prev => {
          if (prev.some(m => m.userId === result.user_id)) return prev;
          return [...prev, { userId: result.user_id, email: result.email, fullName: result.full_name, isOwner: false }];
        });
      } else if (result?.error === 'user_not_found') {
        setError(t('leagueManagers.userNotFound'));
      } else if (result?.error === 'already_owner') {
        setError(t('leagueManagers.alreadyOwner'));
      } else if (result?.error === 'not_authorized') {
        setError(t('leagueManagers.notAuthorized'));
      } else {
        setError(t('leagueManagers.addError'));
      }
    } catch {
      setError(t('leagueManagers.addError'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveManager = async (userId) => {
    setError('');
    try {
      await leagueService.removeManager(leagueId, userId);
      setManagers(prev => prev.filter(m => m.userId !== userId));
    } catch {
      setError(t('leagueManagers.removeError'));
    }
  };

  if (!hasAccess) return null;

  return (
    <Card className="text-foreground">
      <CardHeader>
        <CardTitle>{t('leagueManagers.title')}</CardTitle>
        <CardDescription>
          {canEdit ? t('leagueManagers.description') : t('leagueManagers.descriptionReadOnly')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit && (
          <div className="flex flex-col gap-2">
            <UserSearchPicker
              onSelect={handleAddManager}
              excludeIds={managers.map(m => m.userId)}
            />
            {isAdding && (
              <p className="text-sm text-muted-foreground">{t('common.saving')}</p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : managers.length === 0 ? (
          <EmptyState icon={Users} title={t('leagueManagers.title')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {managers.map((manager) => {
              const canRemove = !manager.isOwner && (canEdit || manager.userId === user?.id);
              const actionLabel = manager.userId === user?.id && !canEdit ? t('leagueManagers.leave') : t('leagueManagers.remove');
              return (
                <li
                  key={manager.userId}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{(manager.fullName || manager.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className="truncate">{manager.fullName || manager.email}</span>
                        {manager.isOwner && (
                          <Badge variant="secondary" title={t('leagueManagers.owner')}>
                            <Crown />
                            {t('leagueManagers.owner')}
                          </Badge>
                        )}
                      </div>
                      {manager.fullName && <div className="truncate text-xs text-muted-foreground">{manager.email}</div>}
                    </div>
                  </div>
                  {canRemove && (
                    <Button
                      type="button"
                      variant={manager.userId === user?.id && !canEdit ? 'outline' : 'ghost'}
                      size={manager.userId === user?.id && !canEdit ? 'sm' : 'icon'}
                      onClick={() => handleRemoveManager(manager.userId)}
                      aria-label={actionLabel}
                      title={actionLabel}
                    >
                      <X />
                      {manager.userId === user?.id && !canEdit && actionLabel}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

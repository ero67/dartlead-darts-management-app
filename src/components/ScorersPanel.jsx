import React, { useState, useEffect, useCallback } from 'react';
import { X, ClipboardList } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { UserSearchPicker } from './UserSearchPicker';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from './shared/EmptyState';

// Manage the scorer allowlist of a tournament (type="tournament") or a league
// (type="league"). Scorers are registered users the manager authorizes to run
// the match scoring UI; enforcement happens in the database (RLS).
export function ScorersPanel({ type, entityId, onScorersChange }) {
  const { t } = useLanguage();
  const [scorers, setScorers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [hasAccess, setHasAccess] = useState(true);

  const service = type === 'league' ? leagueService : tournamentService;

  const loadScorers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await service.listScorers(entityId);
      setScorers(data);
    } catch (err) {
      // The list RPC raises not_authorized for non-managers; hide the panel
      if (err?.message?.includes('not_authorized')) {
        setHasAccess(false);
      } else {
        setError(t('scorers.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [service, entityId, t]);

  useEffect(() => {
    loadScorers();
  }, [loadScorers]);

  // Let the parent react to the list (e.g. hide its "no scorers yet" nudge).
  useEffect(() => {
    if (!isLoading && hasAccess) onScorersChange?.(scorers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scorers, isLoading, hasAccess]);

  // Called when the manager picks a user from the search dropdown. The RPC
  // still resolves the account by email; the picker only saves typing it.
  const handleAddScorer = async (user) => {
    if (!user?.email || isAdding) return;

    setIsAdding(true);
    setError('');
    try {
      const result = await service.addScorer(entityId, user.email);
      if (result?.success) {
        setScorers(prev => {
          if (prev.some(s => s.userId === result.user_id)) return prev;
          return [...prev, { userId: result.user_id, email: result.email, fullName: result.full_name }];
        });
      } else if (result?.error === 'user_not_found') {
        setError(t('scorers.userNotFound'));
      } else if (result?.error === 'not_authorized') {
        setError(t('scorers.notAuthorized'));
      } else {
        setError(t('scorers.addError'));
      }
    } catch {
      setError(t('scorers.addError'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveScorer = async (userId) => {
    setError('');
    try {
      await service.removeScorer(entityId, userId);
      setScorers(prev => prev.filter(s => s.userId !== userId));
    } catch {
      setError(t('scorers.removeError'));
    }
  };

  if (!hasAccess) return null;

  return (
    <Card className="text-foreground">
      <CardHeader>
        <CardTitle>{t('scorers.title')}</CardTitle>
        <CardDescription>
          {type === 'league' ? t('scorers.descriptionLeague') : t('scorers.descriptionTournament')}
          {' '}
          {t('scorers.managerNote')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <UserSearchPicker
            onSelect={handleAddScorer}
            excludeIds={scorers.map(s => s.userId)}
          />
          {isAdding && (
            <p className="text-sm text-muted-foreground">{t('common.saving')}</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : scorers.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t('scorers.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {scorers.map((scorer) => (
              <li
                key={scorer.userId}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{(scorer.fullName || scorer.email || '?').charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{scorer.fullName || scorer.email}</div>
                    {scorer.fullName && <div className="truncate text-xs text-muted-foreground">{scorer.email}</div>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveScorer(scorer.userId)}
                  aria-label={t('scorers.remove')}
                  title={t('scorers.remove')}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

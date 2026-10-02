import React from 'react';
import { Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';
import { cn } from '@/lib/utils';

export function GroupsTab({ tournament, uniqueGroups, getFavoriteGroups, isGroupFavorite, toggleFavoriteGroup, renderPlayerLink, t }) {
  const favoriteGroupIds = getFavoriteGroups(tournament.id);
  const hasFavorites = favoriteGroupIds.length > 0;

  // Sort groups - favorites first
  const sortedGroups = [...(uniqueGroups || [])].sort((a, b) => {
    const aIsFavorite = favoriteGroupIds.includes(a.id);
    const bIsFavorite = favoriteGroupIds.includes(b.id);
    if (aIsFavorite && !bIsFavorite) return -1;
    if (!aIsFavorite && bIsFavorite) return 1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t('management.tournamentGroups')}</h2>
        {hasFavorites && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Star className="size-3.5 fill-current text-amber-500" />
            {t('favorites.showingFavorites')}
          </p>
        )}
      </div>

      {sortedGroups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedGroups.map(group => {
            const isFavorite = isGroupFavorite(tournament.id, group.id);
            const completedCount = group.matches.filter(m => m.status === 'completed').length;
            return (
              <Card key={group.id} className={cn('gap-3', isFavorite && 'border-amber-500/50')}>
                <CardHeader className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-base font-semibold">{group.name}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="secondary" className="tabular-nums">{group.players.length} {t('common.players')}</Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleFavoriteGroup(tournament.id, group.id)}
                      title={isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
                      aria-label={isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
                      aria-pressed={isFavorite}
                    >
                      <Star className={cn(isFavorite && 'fill-current text-amber-500')} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y text-sm">
                    {group.players.map(player => (
                      <li key={player.id} className="py-1.5">
                        {renderPlayerLink(player)}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground tabular-nums">
                  {group.matches.length} {t('common.matches')} · {completedCount} {t('management.completed')}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Users} title={t('management.noGroupsYet')} />
      )}
    </div>
  );
}

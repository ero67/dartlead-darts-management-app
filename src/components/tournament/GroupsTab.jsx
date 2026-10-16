import React from 'react';
import { Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';
import { LiveDot } from '../shared/DartsAccents';
import { cn } from '@/lib/utils';

// One cell of the round-robin grid, read from the row player's side:
// legs for/against, whether they won, or live/pending.
function resultCell(match, rowPlayerId, liveInfoById) {
  if (!match) return null;
  const isRowP1 = match.player1?.id === rowPlayerId;
  if (match.status === 'completed' && match.result) {
    const own = isRowP1 ? match.result.player1Legs : match.result.player2Legs;
    const other = isRowP1 ? match.result.player2Legs : match.result.player1Legs;
    return { state: match.result.winner === rowPlayerId ? 'won' : 'lost', text: `${own ?? 0}–${other ?? 0}` };
  }
  if (match.status === 'in_progress') {
    const live = liveInfoById?.get(match.id);
    const own = isRowP1 ? live?.player1_legs : live?.player2_legs;
    const other = isRowP1 ? live?.player2_legs : live?.player1_legs;
    return { state: 'live', text: live ? `${own ?? 0}–${other ?? 0}` : '' };
  }
  return { state: 'pending', text: '–' };
}

const CELL_CLASS = {
  won: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  lost: 'bg-muted text-muted-foreground',
  live: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  pending: 'text-muted-foreground/60'
};

// Players x players grid of results. Rows and columns are numbered so two
// players with the same initials never get confused.
function RoundRobinGrid({ group, liveInfoById, renderPlayerLink, t }) {
  const players = group.players || [];
  const findMatch = (a, b) => (group.matches || []).find(m =>
    (m.player1?.id === a && m.player2?.id === b) || (m.player1?.id === b && m.player2?.id === a));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th scope="col" className="sr-only">{t('management.player')}</th>
            {players.map((p, j) => (
              <th key={p.id} scope="col" className="min-w-10 text-center text-xs font-medium text-muted-foreground" title={p.name}>{j + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((rowPlayer, i) => (
            <tr key={rowPlayer.id}>
              <th scope="row" className="pr-2 text-left font-normal">
                <div className="flex max-w-40 items-center gap-1.5">
                  <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  {renderPlayerLink(rowPlayer, 'truncate')}
                </div>
              </th>
              {players.map((colPlayer, j) => {
                if (i === j) {
                  return <td key={colPlayer.id} aria-hidden="true" className="h-8 rounded-md bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,transparent_4px_8px)]" />;
                }
                const cell = resultCell(findMatch(rowPlayer.id, colPlayer.id), rowPlayer.id, liveInfoById);
                return (
                  <td
                    key={colPlayer.id}
                    title={`${rowPlayer.name} – ${colPlayer.name}`}
                    className={cn('relative h-8 rounded-md text-center font-display text-base font-semibold leading-none', CELL_CLASS[cell?.state || 'pending'])}
                  >
                    {cell?.text ?? '–'}
                    {cell?.state === 'live' && <LiveDot className="absolute top-1 right-1" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroupsTab({ tournament, uniqueGroups, getFavoriteGroups, isGroupFavorite, toggleFavoriteGroup, renderPlayerLink, liveInfoById, t }) {
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
                  <RoundRobinGrid group={group} liveInfoById={liveInfoById} renderPlayerLink={renderPlayerLink} t={t} />
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

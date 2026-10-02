import React from 'react';
import { Activity, Play, Star, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';
import { cn } from '@/lib/utils';

function LivePlayerRow({ name, legs, score, isActive, t }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2', isActive && 'bg-primary/10')}>
      <div className="flex min-w-0 items-center gap-2">
        {isActive && (
          <Play className="size-3.5 shrink-0 fill-current text-primary" aria-label={t('management.playerTurn')} />
        )}
        <span className="truncate text-lg font-medium">{name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge variant="secondary" className="tabular-nums">{legs}</Badge>
        <span className="min-w-[3ch] text-right text-5xl font-semibold tracking-tight tabular-nums">{score}</span>
      </div>
    </div>
  );
}

// `liveMatches` is already filtered to this tournament and sorted (favorites first).
export function LiveMatchesTab({ liveMatches, favoriteMatchIds, toggleFavoriteMatch, t }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Activity className="size-5 text-muted-foreground" />
          {t('management.liveMatches')}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {liveMatches.length} {t('management.matchesInProgress')}
        </p>
      </div>

      {liveMatches.length === 0 ? (
        <EmptyState icon={Activity} title={t('management.noLiveMatches')} description={t('management.noLiveMatchesDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {liveMatches.map(match => {
            const isFavorite = favoriteMatchIds.has(match.id);
            return (
              <Card key={match.id} className={cn('dark-mode gap-3 bg-card p-4 text-foreground', isFavorite && 'border-amber-500/50')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground tabular-nums">
                    {match.live_board_number ? (
                      <span className="flex items-center gap-1">
                        <Target className="size-3" />
                        {t('deviceSettings.board')} {match.live_board_number}
                      </span>
                    ) : null}
                    <span>{t('management.firstTo')} {match.legs_to_win || 3}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge className="bg-destructive text-white">
                      <Activity />
                      {t('management.live')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleFavoriteMatch(match.id)}
                      title={t('management.toggleFavorite')}
                      aria-label={t('management.toggleFavorite')}
                      aria-pressed={isFavorite}
                    >
                      <Star className={cn(isFavorite && 'fill-current text-amber-500')} />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="px-3 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('management.legs')}</div>
                  <LivePlayerRow
                    name={match.player1?.name || t('common.unknown')}
                    legs={match.player1_legs || 0}
                    score={match.player1_current_score || 501}
                    isActive={match.current_player === 0}
                    t={t}
                  />
                  <LivePlayerRow
                    name={match.player2?.name || t('common.unknown')}
                    legs={match.player2_legs || 0}
                    score={match.player2_current_score || 501}
                    isActive={match.current_player === 1}
                    t={t}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {match.group && <span>{match.group.name}</span>}
                  {match.current_leg ? <span className="tabular-nums">{t('management.leg')} {match.current_leg}</span> : null}
                  {match.live_device_name && <span className="truncate">{match.live_device_name}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

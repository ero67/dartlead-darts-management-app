import React from 'react';
import { Star, Search, X, BarChart3, RotateCcw, Pencil, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '../shared/EmptyState';
import { MatchStatusBadge, PlayerScoreRow, LoginHint, MatchActions } from './MatchCardParts';
import { cn } from '@/lib/utils';

// `card` bundles the match-card callbacks/flags owned by TournamentManagement:
// user, canScore, canManage, isAdmin, isMatchActuallyLive, isMatchInLocalStorage,
// getMatchStatusText, liveInfoById, setMatchStatistics, handleAdminResetMatch,
// handleAdminCorrectMatch, handleStartMatchRequest, onMatchStart.
export function MatchesTab({
  tournament, uniqueGroups, matchGroupFilter, setMatchGroupFilter, matchPlayerFilter, setMatchPlayerFilter,
  getFavoriteGroups, toggleFavoriteGroup, groupScorerByMatch, card, t
}) {
  // Get favorite groups for this tournament
  const favoriteGroupIds = getFavoriteGroups(tournament.id);
  const hasFavorites = favoriteGroupIds.length > 0;
  const showOnlyFavorites = hasFavorites && matchGroupFilter === 'favorites';

  // Collect all matches from all groups
  const allMatches = uniqueGroups?.flatMap(group =>
    group.matches.map(match => ({ ...match, groupId: group.id, groupName: group.name }))
  ) || [];

  // Filter matches
  const filteredMatches = allMatches.filter(match => {
    // Filter by favorites
    if (showOnlyFavorites) {
      if (!favoriteGroupIds.includes(match.groupId)) {
        return false;
      }
    } else if (matchGroupFilter !== 'all' && match.groupId !== matchGroupFilter) {
      // Filter by specific group
      return false;
    }

    // Filter by player name
    if (matchPlayerFilter.trim()) {
      const searchTerm = matchPlayerFilter.trim().toLowerCase();
      const player1Name = (match.player1?.name || '').toLowerCase();
      const player2Name = (match.player2?.name || '').toLowerCase();
      if (!player1Name.includes(searchTerm) && !player2Name.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });

  // Group filtered matches by group
  const matchesByGroup = filteredMatches.reduce((acc, match) => {
    if (!acc[match.groupId]) {
      acc[match.groupId] = {
        groupId: match.groupId,
        groupName: match.groupName,
        isFavorite: favoriteGroupIds.includes(match.groupId),
        matches: []
      };
    }
    acc[match.groupId].matches.push(match);
    return acc;
  }, {});

  // Sort groups - favorites first
  const sortedGroupData = Object.values(matchesByGroup).sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return 0;
  });

  const { user, canManage, isMatchActuallyLive, isMatchInLocalStorage, getMatchStatusText, liveInfoById } = card;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t('management.allMatches')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-filter" className="text-xs text-muted-foreground">{t('management.filterByGroup')}</Label>
            <Select value={matchGroupFilter} onValueChange={setMatchGroupFilter}>
              <SelectTrigger id="group-filter" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('management.allGroups')}</SelectItem>
                {hasFavorites && (
                  <SelectItem value="favorites">⭐ {t('favorites.favoriteGroups')}</SelectItem>
                )}
                {uniqueGroups.map(group => {
                  const isFav = favoriteGroupIds.includes(group.id);
                  return (
                    <SelectItem key={group.id} value={group.id}>
                      {isFav ? '⭐ ' : ''}{group.name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="player-filter" className="text-xs text-muted-foreground">{t('management.filterByPlayer')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="player-filter"
                type="text"
                className="w-56 pl-8 pr-8"
                placeholder={t('management.searchPlayerName')}
                value={matchPlayerFilter}
                onChange={(e) => setMatchPlayerFilter(e.target.value)}
              />
              {matchPlayerFilter && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                  onClick={() => setMatchPlayerFilter('')}
                  title={t('management.clearFilter')}
                  aria-label={t('management.clearFilter')}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {sortedGroupData.length > 0 ? sortedGroupData.map(groupData => {
        const completedCount = groupData.matches.filter(m => m.status === 'completed').length;
        return (
          <section key={groupData.groupId} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-base font-semibold">
                {groupData.isFavorite && <Star className="size-3.5 fill-current text-amber-500" />}
                {groupData.groupName}
              </h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {groupData.matches.length} {t('common.matches')} · {completedCount} {t('management.completed')}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => toggleFavoriteGroup(tournament.id, groupData.groupId)}
                title={groupData.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
                aria-label={groupData.isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
                aria-pressed={groupData.isFavorite}
              >
                <Star className={cn(groupData.isFavorite && 'fill-current text-amber-500')} />
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupData.matches.map(match => {
                const isPlayer1Winner = match.status === 'completed' && match.result && match.result.winner === match.player1?.id;
                const isPlayer2Winner = match.status === 'completed' && match.result && match.result.winner === match.player2?.id;
                const isCompleted = match.status === 'completed' && match.result;
                const isLive = isMatchActuallyLive(match.id);
                const isLiveHere = isMatchInLocalStorage(match.id);
                const live = liveInfoById.get(match.id);
                const buildMatchData = (kind) => (kind === 'admin'
                  ? {
                    ...match,
                    adminOverride: true,
                    legsToWin: match.legsToWin || tournament.legsToWin,
                    startingScore: match.startingScore || tournament.startingScore,
                    defaultScoringMode: tournament.defaultScoringMode
                  }
                  : {
                    ...match,
                    tournamentId: tournament.id,
                    groupId: match.groupId,
                    legsToWin: match.legsToWin || tournament.legsToWin,
                    startingScore: match.startingScore || tournament.startingScore,
                    defaultScoringMode: tournament.defaultScoringMode
                  });

                return (
                  <Card key={match.id} className={cn('gap-3 p-4', isLive && 'border-destructive/50')}>
                    <div className="flex items-center justify-between gap-2">
                      <MatchStatusBadge status={match.status} isLive={isLive}>
                        {getMatchStatusText(match.status, match.id)}
                      </MatchStatusBadge>
                      <div className="flex items-center">
                        {isCompleted && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => card.setMatchStatistics(match)}
                            title={t('management.viewStatistics')}
                            aria-label={t('management.viewStatistics')}
                          >
                            <BarChart3 />
                          </Button>
                        )}
                        {canManage && user && (
                          <>
                            {match.status !== 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => card.handleAdminResetMatch(match)}
                                title={t('manager.resetMatchToPending')}
                                aria-label={t('manager.resetMatchToPending')}
                              >
                                <RotateCcw />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => card.handleAdminCorrectMatch(match)}
                              title={t('manager.manualMatchResult')}
                              aria-label={t('manager.manualMatchResult')}
                            >
                              <Pencil />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <PlayerScoreRow
                        name={match.player1?.name || t('common.unknown')}
                        score={isCompleted ? match.result.player1Legs : (isLive && live ? (live.player1_legs ?? 0) : null)}
                        isWinner={isPlayer1Winner}
                        isLoser={isCompleted && !isPlayer1Winner}
                      />
                      <PlayerScoreRow
                        name={match.player2?.name || t('common.unknown')}
                        score={isCompleted ? match.result.player2Legs : (isLive && live ? (live.player2_legs ?? 0) : null)}
                        isWinner={isPlayer2Winner}
                        isLoser={isCompleted && !isPlayer2Winner}
                      />
                      {isLive && live && (live.live_board_number || live.current_leg) && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                          <Target className="size-3" />
                          {live.live_board_number ? `${t('deviceSettings.board')} ${live.live_board_number}` : null}
                          {live.live_board_number && live.current_leg ? ' · ' : null}
                          {live.current_leg ? `${t('management.leg')} ${live.current_leg}` : null}
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground" title={match.status === 'pending' && groupScorerByMatch.has(match.id) ? t('management.suggestedScorerHint') : undefined}>
                        {match.status === 'pending' && groupScorerByMatch.has(match.id) && (
                          <>{t('management.scorerLabel')}: <strong className="font-medium text-foreground">{groupScorerByMatch.get(match.id).name}</strong></>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {match.status === 'pending' && !user && !isLive && <LoginHint t={t} />}
                        <MatchActions
                          match={match}
                          canStart={match.status === 'pending'}
                          isLive={isLive}
                          isLiveHere={isLiveHere}
                          user={user}
                          canScore={card.canScore}
                          canManage={canManage}
                          isAdmin={card.isAdmin}
                          t={t}
                          onRequestStart={card.handleStartMatchRequest}
                          onMatchStart={card.onMatchStart}
                          buildMatchData={buildMatchData}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      }) : (
        <EmptyState
          icon={Target}
          title={matchGroupFilter !== 'all' || matchPlayerFilter ? t('management.noMatchesFound') : t('management.noMatchesYet')}
        />
      )}
    </div>
  );
}

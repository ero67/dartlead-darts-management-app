import React from 'react';
import { Trophy, CheckCircle, BarChart3, RotateCcw, Pencil, Users, Grid3x3, List, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BracketVisualization } from '../BracketVisualization';
import { ExportMenu } from '../ExportMenu';
import { EmptyState } from '../shared/EmptyState';
import { mergeBracketRounds } from '../../utils/bracketView';
import { MatchStatusBadge, PlayerScoreRow, LoginHint, MatchActions } from './MatchCardParts';
import { cn } from '@/lib/utils';

function StartPlayoffsSection({
  tournament, uniqueGroups, activeQualifierIds, defaultQualifierIds, activeQualifierIdSet, defaultQualifierIdSet,
  rankedPlayersForSeeding, sortStandingsByCriteria, toggleQualifierSelection, resetQualifierSelection, qualifiersTouched,
  startPlayoffs, t
}) {
  const selectedCount = activeQualifierIds.length;
  const autoQualifiedCount = defaultQualifierIds.length;
  const criteriaOrder = tournament.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'];

  const renderQualifierChip = (player, position) => {
    if (!player) return null;
    const isSelected = activeQualifierIdSet.has(player.id);
    const isAutoQualified = defaultQualifierIdSet.has(player.id);
    return (
      <Badge key={player.id} asChild variant={isSelected ? 'default' : 'outline'} className="h-8 cursor-pointer gap-1.5 px-3 text-sm font-normal">
        <button type="button" aria-pressed={isSelected} onClick={() => toggleQualifierSelection(player.id)}>
          <span className="tabular-nums opacity-70">{position}.</span>
          <span>{player.name}</span>
          {isAutoQualified && (
            <span className={cn('rounded-full px-1.5 text-[10px] font-medium uppercase', isSelected ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>
              {t('management.autoQualifiedTag')}
            </span>
          )}
        </button>
      </Badge>
    );
  };

  const renderGroupQualifiers = (title, groupPlayers, key) => (
    <div key={key} className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {groupPlayers.length > 0 ? (
          groupPlayers.map(({ player, position }) => renderQualifierChip(player, position))
        ) : (
          <span className="text-sm italic text-muted-foreground">{t('management.noPlayersInGroup')}</span>
        )}
      </div>
    </div>
  );

  const playoffOnlyPlayers = tournament.tournamentType === 'playoff_only'
    ? rankedPlayersForSeeding
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Trophy className="size-5 text-primary" />
          {t('management.readyToStartPlayoffs')}
        </CardTitle>
        <CardDescription>
          {t('management.groupStageCompleted')} · <span className="tabular-nums">{selectedCount} {t('management.playersQualified')}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
            <span>{t('management.selectedPlayers', { count: selectedCount })}</span>
            <span className="text-muted-foreground">{t('management.autoQualified', { count: autoQualifiedCount })}</span>
          </div>
          <Button variant="outline" size="sm" onClick={resetQualifierSelection} disabled={!qualifiersTouched}>
            <RotateCcw />
            {t('management.resetQualifiers')}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t('management.qualifyingPlayers')}</h3>
            <p className="text-sm text-muted-foreground">{t('management.qualifyingAdjustHint')}</p>
          </div>
          {tournament.tournamentType === 'playoff_only' ? (
            renderGroupQualifiers(
              t('management.allPlayers'),
              playoffOnlyPlayers.map((player, index) => ({ player, position: index + 1 })),
              'all'
            )
          ) : (
            uniqueGroups && uniqueGroups.length > 0 ? (
              uniqueGroups.map(group => renderGroupQualifiers(
                group.name,
                group.standings && group.standings.length > 0
                  ? sortStandingsByCriteria(group.standings, criteriaOrder)
                    .map((standing, index) => ({ player: standing.player, position: index + 1 }))
                  : (group.players || []).map((player, index) => ({ player, position: index + 1 })),
                group.id
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('management.noGroupsYet')}</p>
            )
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2">
        <Button size="lg" onClick={startPlayoffs}>
          <Trophy />
          {t('management.startPlayoffs')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('management.playoffsNote')}</p>
      </CardFooter>
    </Card>
  );
}

function PlayoffPlayerName({ name, isTbd, t }) {
  if (name) return name;
  return isTbd
    ? <span className="italic text-muted-foreground">{t('management.tbd')}</span>
    : <Badge variant="outline" className="ml-0">{t('management.bye')}</Badge>;
}

// `card` is the same callback bundle MatchesTab receives (see there).
export function PlayoffsTab(props) {
  const {
    tournament, isGroupStageComplete, bracketViewMode, setBracketViewMode, bracketRef, handleResetPlayoffs,
    getRoundSize, getPlayoffLegsToWin, setEditingMatch, handleAdvanceBye, playoffScorerByMatch, card, t
  } = props;
  const { user, canManage, isMatchActuallyLive, isMatchInLocalStorage, getMatchStatusText, liveInfoById } = card;

  // Check if playoffs are enabled
  if (!tournament.playoffSettings?.enabled) {
    return (
      <EmptyState icon={Trophy} title={t('management.playoffsNotEnabled')} description={t('management.tournamentWithoutPlayoffs')} />
    );
  }

  // If playoffs object doesn't exist but playoffs are enabled, show group stage completion check
  if (!tournament.playoffs) {
    const groupStageComplete = isGroupStageComplete();
    if (groupStageComplete) {
      return <StartPlayoffsSection {...props} />;
    } else {
      return (
        <EmptyState icon={Trophy} title={t('management.playoffsNotAvailable')} description={t('management.playoffsAvailableAfterGroups')} />
      );
    }
  }

  // Check if group stage is complete but playoffs haven't started
  const groupStageComplete = isGroupStageComplete();
  const hasQualifyingPlayers = tournament.playoffs?.qualifyingPlayers && tournament.playoffs.qualifyingPlayers.length > 0;
  const hasPlayoffRounds = tournament.playoffs?.rounds && tournament.playoffs.rounds.length > 0;
  // Playoffs are started if we have qualifying players and rounds (players don't need to be assigned yet)
  const playoffsStarted = hasQualifyingPlayers && hasPlayoffRounds;

  if (groupStageComplete && !playoffsStarted) {
    return <StartPlayoffsSection {...props} />;
  }

  const { rounds, currentRound, qualifyingPlayers } = tournament.playoffs;
  const playoffMatches = tournament.playoffMatches || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{t('management.playoffBracket')}</h2>
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums">{qualifyingPlayers.length} {t('management.playersQualified')}</span>
            {' · '}
            {t('management.currentRound')}: {rounds[currentRound - 1]?.name || t('common.completed')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={bracketViewMode} onValueChange={setBracketViewMode}>
            <TabsList>
              <TabsTrigger value="detailed" title={t('management.detailedView')}>
                <List />
                {t('management.detailed')}
              </TabsTrigger>
              <TabsTrigger value="compact" title={t('management.bracket')}>
                <Grid3x3 />
                {t('management.bracket')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <ExportMenu tournament={tournament} imageTarget={bracketRef} imageSuffix="bracket" items={['image', 'results']} />
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleResetPlayoffs}
              title={t('management.confirmResetPlayoffs')}
            >
              <RotateCcw />
              {t('management.resetPlayoffs')}
            </Button>
          )}
        </div>
      </div>

      <div ref={bracketRef} className="bg-background">
        {bracketViewMode === 'compact' ? (
          <BracketVisualization rounds={mergeBracketRounds(rounds, playoffMatches, tournament.players)} playoffMatches={playoffMatches} />
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-4">
            {rounds.map((round, index) => {
              const isCurrent = index + 1 === currentRound;
              const legsToWin = getPlayoffLegsToWin(getRoundSize(round));
              const count = round.matches.filter(m => !m.isThirdPlaceMatch).length;
              return (
                <div key={round.id} className="flex min-w-[260px] flex-1 flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <h3 className={cn('text-xs font-semibold uppercase tracking-wide', isCurrent ? 'text-primary' : 'text-muted-foreground')}>
                      {round.name}
                    </h3>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t(count === 1 ? 'common.matchCountOne' : count < 5 ? 'common.matchCountFew' : 'common.matchCountMany', { count })}
                      {round.matches.some(m => m.isThirdPlaceMatch) && ` ${t('management.plusThirdPlace')}`}
                      {' · '}{t('management.firstTo')} {legsToWin}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {round.matches.map((bracketMatch) => {
                      // Find the actual database match for this bracket match
                      const match = playoffMatches.find(pm => pm.id === bracketMatch.id) || bracketMatch;
                      const isCompleted = match.status === 'completed' && match.result;
                      const isLive = isMatchActuallyLive(match.id);
                      const isLiveHere = isMatchInLocalStorage(match.id);
                      const hasBothPlayers = !!(match.player1 && match.player2);
                      const isByeSlot = match.status === 'pending' && ((match.player1 && !match.player2) || (!match.player1 && match.player2));
                      const live = liveInfoById.get(match.id);
                      const buildMatchData = (kind) => {
                        // Calculate round size from number of matches (each match has 2 players)
                        const roundSize = getRoundSize(round);
                        const data = {
                          ...match,
                          legsToWin: getPlayoffLegsToWin(roundSize),
                          startingScore: tournament.startingScore,
                          defaultScoringMode: tournament.defaultScoringMode,
                          isPlayoff: true
                        };
                        if (kind === 'start') data.tournamentId = tournament.id;
                        if (kind === 'admin') data.adminOverride = true;
                        return data;
                      };

                      return (
                        <Card key={match.id} className={cn('gap-3 p-4', isLive && 'border-destructive/50', bracketMatch.isThirdPlaceMatch && 'border-dashed')}>
                          {bracketMatch.isThirdPlaceMatch && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('management.thirdPlaceMatch')}</span>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <MatchStatusBadge status={match.status} isLive={isLive}>
                              {getMatchStatusText(match.status, match.id)}
                            </MatchStatusBadge>
                            <div className="flex items-center">
                              {canManage && match.status === 'pending' && !isLive && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setEditingMatch({ ...match, isThirdPlaceMatch: bracketMatch.isThirdPlaceMatch })}
                                  title={t('management.editMatchPlayers')}
                                  aria-label={t('management.editMatchPlayers')}
                                >
                                  <Users />
                                </Button>
                              )}
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
                              {canManage && user && match.status !== 'pending' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => card.handleAdminResetMatch(match)}
                                    title={t('manager.resetMatchToPending')}
                                    aria-label={t('manager.resetMatchToPending')}
                                  >
                                    <RotateCcw />
                                  </Button>
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

                          {isCompleted ? (
                            match.result.isBye ? (
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate text-sm font-semibold">{(match.player1 || match.player2)?.name || t('management.tbd')}</span>
                                <Badge variant="outline">{t('management.bye')}</Badge>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <PlayerScoreRow
                                  name={match.player1?.name || t('management.tbd')}
                                  score={match.result.player1Legs}
                                  isWinner={match.result?.winner === match.player1?.id}
                                  isLoser={match.result?.winner !== match.player1?.id}
                                />
                                <PlayerScoreRow
                                  name={match.player2?.name || t('management.tbd')}
                                  score={match.result.player2Legs}
                                  isWinner={match.result?.winner === match.player2?.id}
                                  isLoser={match.result?.winner !== match.player2?.id}
                                />
                              </div>
                            )
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              <PlayerScoreRow
                                name={<PlayoffPlayerName name={match.player1?.name} isTbd={!match.player2} t={t} />}
                                score={isLive && live ? (live.player1_legs ?? 0) : null}
                              />
                              <PlayerScoreRow
                                name={<PlayoffPlayerName name={match.player2?.name} isTbd={!match.player1} t={t} />}
                                score={isLive && live ? (live.player2_legs ?? 0) : null}
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
                          )}

                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground" title={match.status === 'pending' && hasBothPlayers && playoffScorerByMatch.has(match.id) ? t('management.suggestedScorerHint') : undefined}>
                              {match.status === 'pending' && hasBothPlayers && playoffScorerByMatch.has(match.id) && (
                                <>{t('management.scorerLabel')}: <strong className="font-medium text-foreground">{playoffScorerByMatch.get(match.id).name}</strong></>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              {match.status === 'pending' && !user && hasBothPlayers && !isLive && <LoginHint t={t} />}
                              {isByeSlot && (
                                <Button size="sm" variant="outline" onClick={() => handleAdvanceBye(match)}>
                                  <CheckCircle />
                                  {t('management.advancePlayer')}
                                </Button>
                              )}
                              <MatchActions
                                match={match}
                                canStart={match.status === 'pending' && hasBothPlayers}
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

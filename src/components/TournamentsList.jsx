import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, Users, Calendar, Trash2, Play, Crown, Target } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { LeagueLogo } from './shared/LeagueLogo';
import { EmptyState } from './shared/EmptyState';
import { PhaseBar } from './shared/DartsAccents';
import { RoundSchedule } from './shared/RoundSchedule';
import { isTournamentRunning, tournamentStatusClass, getTournamentPhase, tournamentPhaseLabel } from '../utils/tournamentStatus';
import { upcomingRounds, upcomingFirst } from '../utils/roundSchedule';
import { isCricketGame } from '@/lib/cricket';
import { pluralSuffix } from '@/lib/practiceGames';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirmDialog';

const EMPTY_FILTER_TITLE = {
  active: 'tournaments.noInProgressTournaments',
  completed: 'tournaments.noCompletedTournaments',
  mine: 'tournaments.noMyTournaments',
};

export function TournamentsList({ tournaments, onCreateTournament, onSelectTournament, onDeleteTournament }) {
  const { t, language } = useLanguage();
  const countOf = (key, n) => t(`common.${key}${pluralSuffix(n)}`, { count: n });
  const { user } = useAuth();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'mine'
  const [sortBy, setSortBy] = useState('updated'); // 'updated', 'created', 'name'
  const [leagueFilter, setLeagueFilter] = useState('all'); // 'all' or a league id
  const { isAdmin, canCreateTournaments } = useAdmin();
  const { leagues } = useLeague();

  const canCreate = Boolean(user && canCreateTournaments);
  const isMine = (tournament) => Boolean(user && tournament.userId && user.id === tournament.userId);

  // Only leagues that actually have rounds in this list
  const leaguesInList = leagues.filter(l => tournaments.some(x => x.leagueId === l.id));
  const inLeague = leagueFilter === 'all' ? tournaments : tournaments.filter(x => x.leagueId === leagueFilter);

  const filters = [
    { key: 'all', label: t('tournaments.all'), count: inLeague.length },
    { key: 'active', label: t('tournaments.filterInProgress'), count: inLeague.filter(x => isTournamentRunning(x.status)).length },
    { key: 'completed', label: t('tournaments.filterCompleted'), count: inLeague.filter(x => x.status === 'completed').length },
    ...(canCreate ? [{ key: 'mine', label: t('tournaments.myTournaments'), count: inLeague.filter(isMine).length }] : []),
  ];

  const filteredTournaments = inLeague.filter(tournament => {
    if (filter === 'all') return true;
    if (filter === 'mine') return isMine(tournament);
    if (filter === 'active') return isTournamentRunning(tournament.status);
    return tournament.status === filter;
  });

  const sortedTournaments = [...filteredTournaments].sort((a, b) => {
    switch (sortBy) {
      case 'created':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'updated':
      default:
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });
  // Default order: rounds being played now, then planned rounds (soonest first), then the rest.
  const byDefault = upcomingFirst(sortedTournaments);
  const visibleTournaments = sortBy === 'updated'
    ? [...byDefault.filter(x => isTournamentRunning(x.status)), ...byDefault.filter(x => !isTournamentRunning(x.status))]
    : sortedTournaments;
  const upcomingIds = new Set(upcomingRounds(filteredTournaments).map(x => x.id));

  const handleDelete = async (tournament) => {
    if (!(await confirmDialog(t('management.confirmDeleteTournament', { name: tournament.name }), { destructive: true }))) return;
    Promise.resolve(onDeleteTournament(tournament.id)).catch(() => {
      toast.error(t('management.failedToDeleteTournament'));
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('tournaments.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {countOf('tournamentsCount', tournaments.length)}
          </p>
        </div>
        {canCreate && (
          <Button onClick={onCreateTournament}>
            <Plus />
            {t('tournaments.create')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {filters.map(f => (
              <TabsTrigger key={f.key} value={f.key}>
                {f.label}
                <span className="text-muted-foreground tabular-nums">{f.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          {leaguesInList.length > 0 && (
            <Select value={leagueFilter} onValueChange={setLeagueFilter}>
              <SelectTrigger className="w-44" aria-label={t('tournaments.filterByLeague')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('tournaments.allLeagues')}</SelectItem>
                {leaguesInList.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-sm text-muted-foreground">{t('tournaments.sortBy')}</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-44" aria-label={t('tournaments.sortBy')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">{t('tournaments.lastUpdated')}</SelectItem>
              <SelectItem value="created">{t('tournaments.dateCreated')}</SelectItem>
              <SelectItem value="name">{t('common.name')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {visibleTournaments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTournaments.map(tournament => {
            const phase = getTournamentPhase(tournament);
            const hasActiveMatches = (tournament.pendingMatches ?? 0) > 0;
            const isOwner = isMine(tournament);
            const linkedLeague = tournament.leagueId ? leagues.find(l => l.id === tournament.leagueId) : null;
            const running = isTournamentRunning(tournament.status);
            const isCompleted = tournament.status === 'completed';
            const totalMatches = tournament.totalMatches ?? 0;

            return (
              <Card key={tournament.id} className="gap-4">
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <LeagueLogo src={linkedLeague?.logoUrl} className="size-6" />
                        <h3 className="truncate text-base font-semibold leading-6">{tournament.name}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={tournament.status} t={t} />
                        {upcomingIds.has(tournament.id) && <Badge variant="outline">{t('schedule.upcoming')}</Badge>}
                        {isCricketGame(tournament.gameType) && <Badge variant="secondary">{t('common.gameTypeCricket')}</Badge>}
                        {isOwner && <Badge variant="outline">{t('tournaments.yours')}</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {hasActiveMatches && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSelectTournament(tournament)}
                          title={t('tournaments.continueTournament')}
                          aria-label={t('tournaments.continueTournament')}
                        >
                          <Play />
                        </Button>
                      )}
                      {(isAdmin || isOwner) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(tournament)}
                          title={t('management.deleteTournament')}
                          aria-label={t('management.deleteTournament')}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>
                  {linkedLeague && (
                    <Link
                      to={`/league/${linkedLeague.id}`}
                      className="flex w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <Crown className="size-3" />
                      <span className="truncate">{linkedLeague.name}</span>
                    </Link>
                  )}
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  {isCompleted && tournament.winnerName && (
                    <p className="flex min-w-0 items-center gap-2 text-sm">
                      <Trophy className="size-4 shrink-0" aria-hidden="true" />
                      <span className="text-muted-foreground">{t('tournaments.winner')}</span>
                      <span className="truncate font-semibold">{tournament.winnerName}</span>
                    </p>
                  )}
                  <RoundSchedule startsAt={tournament.startsAt} venue={tournament.venue} className="font-medium text-foreground" />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" />
                      {countOf('playersCount', tournament.playerCount ?? tournament.players?.length ?? 0)}
                    </span>
                    {running && totalMatches > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Target className="size-4" />
                        {t(`common.matchCount${pluralSuffix(totalMatches)}`, { count: `${tournament.completedMatches ?? 0}/${totalMatches}` })}
                      </span>
                    )}
                    {!tournament.startsAt && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        {new Date(tournament.createdAt).toLocaleDateString(language === 'sk' ? 'sk-SK' : 'en-GB')}
                      </span>
                    )}
                  </div>
                  {!isCompleted && (
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{tournamentPhaseLabel(phase, t)}</span>
                        {tournament.status !== 'open_for_registration' && (
                          <span className="tabular-nums">{phase.percent}%</span>
                        )}
                      </div>
                      <PhaseBar {...phase} />
                    </div>
                  )}
                </CardContent>

                <CardFooter className="mt-auto flex items-center justify-between gap-2">
                  <Button variant={running ? 'default' : 'outline'} onClick={() => onSelectTournament(tournament)}>
                    {running ? t('tournaments.continueTournament') : t('tournaments.openTournament')}
                  </Button>
                  {tournament.status === 'open_for_registration' && user && !isOwner && (
                    <Badge variant="outline" className={tournamentStatusClass('open_for_registration')}>
                      {t('registration.openForRegistration')}
                    </Badge>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {visibleTournaments.length === 0 && (
        <EmptyState
          icon={Trophy}
          title={t(EMPTY_FILTER_TITLE[filter] ?? 'tournaments.noTournamentsFound')}
          description={filter === 'all'
            ? t(canCreate ? 'tournaments.createFirstToGetStarted' : 'tournaments.noTournamentsYetHint')
            : undefined}
        >
          {filter === 'all' && canCreate && (
            <Button onClick={onCreateTournament}>
              <Plus />
              {t('tournaments.create')}
            </Button>
          )}
        </EmptyState>
      )}
    </div>
  );
}

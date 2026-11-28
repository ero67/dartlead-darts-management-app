import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, Users, Calendar, Trash2, Crown, ArrowDownUp } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { useTournament } from '../contexts/TournamentContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { CardGridSkeleton } from './shared/LoadingState';
import { LeagueLogo } from './shared/LeagueLogo';
import { EmptyState } from './shared/EmptyState';
import { PhaseBar } from './shared/DartsAccents';
import { RoundSchedule } from './shared/RoundSchedule';
import { isTournamentRunning, getTournamentPhase, tournamentPhaseLabel } from '../utils/tournamentStatus';
import { upcomingFirst } from '../utils/roundSchedule';
import { isCricketGame } from '@/lib/cricket';
import { pluralSuffix } from '@/lib/practiceGames';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirmDialog';

const EMPTY_FILTER_TITLE = {
  registration: 'tournaments.noRegistrationTournaments',
  active: 'tournaments.noInProgressTournaments',
  completed: 'tournaments.noCompletedTournaments',
  mine: 'tournaments.noMyTournaments',
};

const matchesFilter = (filter, tournament, isMine) => {
  if (filter === 'mine') return isMine(tournament);
  if (filter === 'registration') return tournament.status === 'open_for_registration';
  if (filter === 'active') return isTournamentRunning(tournament.status);
  if (filter === 'completed') return tournament.status === 'completed';
  return true;
};

export function TournamentsList({ tournaments, onCreateTournament, onSelectTournament, onDeleteTournament }) {
  const { t, language } = useLanguage();
  const countOf = (key, n) => t(`common.${key}${pluralSuffix(n)}`, { count: n });
  const { user } = useAuth();
  const [filter, setFilter] = useState('all'); // 'all', 'registration', 'active', 'completed', 'mine'
  const [sortBy, setSortBy] = useState('updated'); // 'updated' (suggested order), 'created', 'name'
  const [leagueFilter, setLeagueFilter] = useState('all'); // 'all' or a league id
  const { isAdmin, canCreateTournaments } = useAdmin();
  const { leagues } = useLeague();
  const { loading: tournamentsLoading } = useTournament();
  const isLoading = tournamentsLoading && tournaments.length === 0;

  const canCreate = Boolean(user && canCreateTournaments);
  const isMine = (tournament) => Boolean(user && tournament.userId && user.id === tournament.userId);
  // "Yours" only tells rounds apart when the list mixes your rounds with other people's.
  const showOwnership = tournaments.some(isMine) && tournaments.some(x => !isMine(x));

  // Only leagues that actually have rounds in this list
  const leaguesInList = leagues.filter(l => tournaments.some(x => x.leagueId === l.id));
  const inLeague = leagueFilter === 'all' ? tournaments : tournaments.filter(x => x.leagueId === leagueFilter);

  const filters = [
    { key: 'all', label: t('tournaments.all') },
    { key: 'registration', label: t('tournaments.statusOpenForRegistration') },
    { key: 'active', label: t('tournaments.filterInProgress') },
    { key: 'completed', label: t('tournaments.filterCompleted') },
    ...(canCreate ? [{ key: 'mine', label: t('tournaments.myTournaments') }] : []),
  ].map(f => ({ ...f, count: inLeague.filter(x => matchesFilter(f.key, x, isMine)).length }));
  // A tab that narrows nothing (none, or the same as All) is noise; the one in use always stays.
  const shownFilters = filters.filter(f => f.key === 'all' || f.key === filter || (f.count > 0 && f.count < inLeague.length));
  const showTabs = shownFilters.length > 1;

  const filteredTournaments = inLeague.filter(x => matchesFilter(filter, x, isMine));

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
  // Suggested order: rounds being played now, then planned rounds (soonest first), then the rest.
  const byDefault = upcomingFirst(sortedTournaments);
  const visibleTournaments = sortBy === 'updated'
    ? [...byDefault.filter(x => isTournamentRunning(x.status)), ...byDefault.filter(x => !isTournamentRunning(x.status))]
    : sortedTournaments;

  const handleDelete = async (tournament) => {
    if (!(await confirmDialog(t('management.confirmDeleteTournament', { name: tournament.name }), { destructive: true }))) return;
    Promise.resolve(onDeleteTournament(tournament.id)).catch(() => {
      toast.error(t('management.failedToDeleteTournament'));
    });
  };

  const results = (
    <div className="flex flex-col gap-6">
      {isLoading && <CardGridSkeleton label={t('tournaments.loadingTournaments')} />}

      {visibleTournaments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTournaments.map(tournament => {
            const phase = getTournamentPhase(tournament);
            const isOwner = isMine(tournament);
            const linkedLeague = tournament.leagueId ? leagues.find(l => l.id === tournament.leagueId) : null;
            const running = isTournamentRunning(tournament.status);
            const isCompleted = tournament.status === 'completed';
            const totalMatches = tournament.totalMatches ?? 0;
            // List summaries know match counts; a round hydrated by opening it falls back to its phase name.
            const progressLabel = totalMatches > 0
              ? t(`common.matchCount${pluralSuffix(totalMatches)}`, { count: `${tournament.completedMatches ?? 0}/${totalMatches}` })
              : tournamentPhaseLabel(phase, t);

            return (
              <Card key={tournament.id} className="gap-4">
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <LeagueLogo src={linkedLeague?.logoUrl} className="size-6" />
                        <h2 className="truncate text-base font-semibold leading-6">{tournament.name}</h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={tournament.status} t={t} />
                        {isCricketGame(tournament.gameType) && <Badge variant="secondary">{t('common.gameTypeCricket')}</Badge>}
                        {showOwnership && isOwner && <Badge variant="outline">{t('tournaments.yours')}</Badge>}
                      </div>
                    </div>
                    {(isAdmin || isOwner) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(tournament)}
                        title={t('management.deleteTournament')}
                        aria-label={t('management.deleteTournament')}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  {linkedLeague && (
                    <Link
                      to={`/league/${linkedLeague.id}`}
                      className="flex min-h-6 w-fit max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
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
                    {!tournament.startsAt && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        {new Date(tournament.createdAt).toLocaleDateString(language === 'sk' ? 'sk-SK' : 'en-GB')}
                      </span>
                    )}
                  </div>
                  {running && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{progressLabel}</span>
                      <PhaseBar {...phase} label={progressLabel} />
                    </div>
                  )}
                </CardContent>

                <CardFooter className="mt-auto">
                  <Button variant={running ? 'default' : 'outline'} onClick={() => onSelectTournament(tournament)}>
                    {running ? t('tournaments.continueTournament') : t('tournaments.openTournament')}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && visibleTournaments.length === 0 && (
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

      {/* The filter tabs control the results below (TabsContent), so their aria-controls resolve. */}
      <Tabs value={filter} onValueChange={setFilter} className="gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showTabs && (
            <TabsList aria-label={t('common.filterByStatus')}>
              {shownFilters.map(f => (
                <TabsTrigger key={f.key} value={f.key}>
                  {f.label}{' '}
                  <span className="text-muted-foreground tabular-nums">{f.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          )}

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
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger aria-label={t('tournaments.sortBy')}>
                <ArrowDownUp className="text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">{t('tournaments.sortSuggested')}</SelectItem>
                <SelectItem value="created">{t('tournaments.sortNewest')}</SelectItem>
                <SelectItem value="name">{t('tournaments.sortByName')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {showTabs ? <TabsContent value={filter} tabIndex={-1}>{results}</TabsContent> : results}
      </Tabs>
    </div>
  );
}

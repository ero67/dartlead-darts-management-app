import React, { useState } from 'react';
import { Plus, Trophy, Users, Calendar, Trash2, Play, Crown, LayoutGrid } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';
import { isTournamentRunning, tournamentStatusClass } from '../utils/tournamentStatus';

export function TournamentsList({ tournaments, onCreateTournament, onSelectTournament, onDeleteTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'mine'
  const [sortBy, setSortBy] = useState('updated'); // 'updated', 'created', 'name'
  const { isAdmin, canCreateTournaments } = useAdmin();
  const { leagues } = useLeague();

  const canCreate = Boolean(user && canCreateTournaments);
  const isMine = (tournament) => Boolean(user && tournament.userId && user.id === tournament.userId);

  const filters = [
    { key: 'all', label: t('tournaments.all'), count: tournaments.length },
    { key: 'active', label: t('common.active'), count: tournaments.filter(x => isTournamentRunning(x.status)).length },
    { key: 'completed', label: t('common.completed'), count: tournaments.filter(x => x.status === 'completed').length },
    ...(canCreate ? [{ key: 'mine', label: t('tournaments.myTournaments'), count: tournaments.filter(isMine).length }] : []),
  ];
  const filterLabels = Object.fromEntries(filters.map(f => [f.key, f.label]));

  const filteredTournaments = tournaments.filter(tournament => {
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

  const getTournamentProgress = (tournament) => {
    // Counts come from the lightweight summary (getTournamentsSummary).
    const totalMatches = tournament.totalMatches ?? 0;
    const completedMatches = tournament.completedMatches ?? 0;
    return totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;
  };

  const handleDelete = (tournament) => {
    if (!window.confirm(t('management.confirmDeleteTournament', { name: tournament.name }))) return;
    Promise.resolve(onDeleteTournament(tournament.id)).catch(() => {
      alert(t('management.failedToDeleteTournament'));
    });
  };

  return (
    <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('tournaments.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {tournaments.length} {t('tournaments.title').toLowerCase()}
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

        <div className="flex items-center gap-2">
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

      {sortedTournaments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedTournaments.map(tournament => {
            const progress = getTournamentProgress(tournament);
            const hasActiveMatches = (tournament.pendingMatches ?? 0) > 0;
            const isOwner = isMine(tournament);
            const linkedLeague = tournament.leagueId ? leagues.find(l => l.id === tournament.leagueId) : null;
            const running = isTournamentRunning(tournament.status);

            return (
              <Card key={tournament.id} className="gap-4">
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-2">
                      <h3 className="truncate text-base font-semibold leading-6">{tournament.name}</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={tournament.status} t={t} />
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
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Crown className="size-3" />
                      <span className="truncate">{linkedLeague.name}</span>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" />
                      {tournament.playerCount ?? tournament.players?.length ?? 0} {t('common.players')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <LayoutGrid className="size-4" />
                      {tournament.groupCount ?? tournament.groups?.length ?? 0} {t('common.groups')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-4" />
                      {new Date(tournament.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t('tournaments.progress')}</span>
                      <span className="tabular-nums">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                </CardContent>

                <CardFooter className="flex items-center justify-between gap-2">
                  <Button variant={running ? 'default' : 'outline'} onClick={() => onSelectTournament(tournament)}>
                    {running ? t('tournaments.continue') : t('tournaments.view')} {t('tournaments.tournament')}
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

      {sortedTournaments.length === 0 && (
        <EmptyState
          icon={Trophy}
          title={t('tournaments.noTournamentsFound')}
          description={filter === 'all'
            ? t('tournaments.createFirstToGetStarted')
            : t('tournaments.noFilteredTournaments', { filter: filterLabels[filter].toLowerCase() })}
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

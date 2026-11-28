import React, { useState } from 'react';
import { Plus, Trophy, Users, CalendarClock, Crown } from 'lucide-react';
import { useLeague } from '../contexts/LeagueContext';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { LeagueLogo } from './shared/LeagueLogo';
import { EmptyState } from './shared/EmptyState';
import { pluralSuffix } from '@/lib/practiceGames';
import { formatRoundDate } from '../utils/roundSchedule';

const STATUS_LABEL = { active: 'leagues.statusActive', completed: 'leagues.statusCompleted', archived: 'leagues.statusArchived' };
const EMPTY_FILTER_TITLE = {
  active: 'leagues.noActiveLeagues',
  completed: 'leagues.noCompletedLeagues',
  archived: 'leagues.noArchivedLeagues',
  mine: 'leagues.noMyLeagues',
};

export function LeaguesList({ onCreateLeague, onSelectLeague }) {
  const { t, language } = useLanguage();
  const countOf = (key, n) => t(`common.${key}${pluralSuffix(n)}`, { count: n });
  const { user } = useAuth();
  const { canCreateTournaments } = useAdmin();
  const { leagues, loading } = useLeague();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'archived', 'mine'

  const canCreate = Boolean(user && canCreateTournaments);
  const isMyLeague = (league) => Boolean(user && (
    league.createdBy === user.id || (league.managerIds && league.managerIds.includes(user.id))
  ));

  const filters = [
    { key: 'all', label: t('tournaments.all'), count: leagues.length },
    { key: 'active', label: t('common.active'), count: leagues.filter(l => l.status === 'active').length },
    { key: 'completed', label: t('leagues.filterCompleted'), count: leagues.filter(l => l.status === 'completed').length },
    { key: 'archived', label: t('common.archived'), count: leagues.filter(l => l.status === 'archived').length },
    ...(canCreate ? [{ key: 'mine', label: t('leagues.myLeagues'), count: leagues.filter(isMyLeague).length }] : []),
  ];

  const filteredLeagues = leagues.filter(league => {
    if (filter === 'all') return true;
    if (filter === 'mine') return isMyLeague(league);
    return league.status === filter;
  });

  // LeagueDetail loads the league itself; fetching here only delayed navigation.
  const handleSelectLeague = (league) => onSelectLeague(league);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('leagues.title')}</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground">{countOf('leaguesCount', leagues.length)}</p>
          )}
        </div>
        {canCreate && (
          <Button onClick={onCreateLeague}>
            <Plus />
            {t('leagues.createLeague')}
          </Button>
        )}
      </div>

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

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={t('leagues.loadingLeagues')}>
          {[0, 1, 2].map(i => (
            <Card key={i} className="gap-4">
              <CardHeader className="gap-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent><Skeleton className="h-4 w-1/2" /></CardContent>
              <CardFooter><Skeleton className="h-9 w-32" /></CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredLeagues.length === 0 ? (
        <EmptyState
          icon={Crown}
          title={t(EMPTY_FILTER_TITLE[filter] ?? 'leagues.noLeaguesFound')}
          description={filter === 'all'
            ? t(canCreate ? 'leagues.createFirstLeagueHint' : 'leagues.noLeaguesYetHint')
            : undefined}
        >
          {filter === 'all' && canCreate && (
            <Button onClick={onCreateLeague}>
              <Plus />
              {t('leagues.createLeague')}
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLeagues.map(league => (
            <Card key={league.id} className="gap-4">
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <LeagueLogo src={league.logoUrl} className="size-6" />
                    <h3 className="truncate text-base font-semibold leading-6">{league.name}</h3>
                  </div>
                  <StatusBadge status={league.status} t={t} label={STATUS_LABEL[league.status] && t(STATUS_LABEL[league.status])} />
                </div>
                {league.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{league.description}</p>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {(league.leaderName || league.nextRoundAt) && (
                  <div className="flex flex-col gap-1.5 text-sm">
                    {league.leaderName && (
                      <p className="flex min-w-0 items-center gap-2">
                        <Crown className="size-4 shrink-0" aria-hidden="true" />
                        <span className="text-muted-foreground">{t('leagues.leader')}</span>
                        <span className="truncate font-semibold">{league.leaderName}</span>
                        {league.leaderPoints != null && (
                          <span className="shrink-0 tabular-nums text-muted-foreground">{countOf('pointsCount', league.leaderPoints)}</span>
                        )}
                      </p>
                    )}
                    {league.nextRoundAt && (
                      <p className="flex min-w-0 items-center gap-2">
                        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
                        <span className="text-muted-foreground">{t('leagues.nextRound')}</span>
                        <time dateTime={league.nextRoundAt} className="truncate font-medium">{formatRoundDate(league.nextRoundAt, language)}</time>
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" />
                    {countOf('membersCount', league.memberCount || 0)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Trophy className="size-4" />
                    {countOf('tournamentsCount', league.tournamentCount || 0)}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="mt-auto">
                <Button variant="outline" className="w-full" onClick={() => handleSelectLeague(league)}>
                  {t('leagues.openLeague')}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

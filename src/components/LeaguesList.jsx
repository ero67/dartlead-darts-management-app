import React, { useState } from 'react';
import { Plus, Trophy, Users, Calendar, Crown } from 'lucide-react';
import { useLeague } from '../contexts/LeagueContext';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';

export function LeaguesList({ onCreateLeague, onSelectLeague }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canCreateTournaments } = useAdmin();
  const { leagues, loading, selectLeague } = useLeague();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'archived', 'mine'

  const canCreate = Boolean(user && canCreateTournaments);
  const isMyLeague = (league) => Boolean(user && (
    league.createdBy === user.id || (league.managerIds && league.managerIds.includes(user.id))
  ));

  const filters = [
    { key: 'all', label: t('tournaments.all'), count: leagues.length },
    { key: 'active', label: t('common.active'), count: leagues.filter(l => l.status === 'active').length },
    { key: 'completed', label: t('common.completed'), count: leagues.filter(l => l.status === 'completed').length },
    { key: 'archived', label: t('common.archived'), count: leagues.filter(l => l.status === 'archived').length },
    ...(canCreate ? [{ key: 'mine', label: t('leagues.myLeagues'), count: leagues.filter(isMyLeague).length }] : []),
  ];

  const filteredLeagues = leagues.filter(league => {
    if (filter === 'all') return true;
    if (filter === 'mine') return isMyLeague(league);
    return league.status === filter;
  });

  const handleSelectLeague = async (league) => {
    try {
      await selectLeague(league.id);
      onSelectLeague(league);
    } catch (error) {
      console.error('Error selecting league:', error);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('leagues.title')}</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground">{leagues.length} {t('leagues.title').toLowerCase()}</p>
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
        <EmptyState icon={Crown} title={t('leagues.noLeaguesFound')} description={t('leagues.createFirstLeagueHint')}>
          {canCreate && (
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
                  <h3 className="truncate text-base font-semibold leading-6">{league.name}</h3>
                  <StatusBadge status={league.status} t={t} />
                </div>
                {league.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{league.description}</p>
                )}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  {league.memberCount || 0} {t('leagues.members')}
                </span>
                <span className="flex items-center gap-1.5">
                  <Trophy className="size-4" />
                  {league.tournamentCount || 0} {t('leagues.tournaments')}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  {new Date(league.createdAt).toLocaleDateString()}
                </span>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={() => handleSelectLeague(league)}>
                  {t('leagues.viewLeague')}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

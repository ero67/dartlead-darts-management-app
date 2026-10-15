import React from 'react';
import { Plus, Trophy, Users, Target, Calendar, TrendingUp, Crown, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { PlayerHome } from './PlayerHome';
import { StatusBadge } from './shared/StatusBadge';
import { BoardMotif, LiveDot, PhaseBar } from './shared/DartsAccents';
import { EmptyState } from './shared/EmptyState';
import { StatTile } from './shared/StatTile';
import { isTournamentRunning, getTournamentPhase, tournamentPhaseLabel } from '../utils/tournamentStatus';
import { getUserDisplayName } from '../utils/userDisplayName';

// Running tournaments with matches on a board right now (counts from the summary RPC).
function LiveNowCard({ tournaments, onSelectTournament, t }) {
  return (
    <Card className="relative gap-4 overflow-hidden">
      <BoardMotif />
      <CardHeader className="relative flex flex-wrap items-center gap-2">
        <Badge className="border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">
          <LiveDot />
          {t('dashboard.liveNow')}
        </Badge>
      </CardHeader>
      <CardContent className="relative grid gap-3 md:grid-cols-2">
        {tournaments.map(tournament => {
          const phase = getTournamentPhase(tournament);
          return (
            <div key={tournament.id} className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{tournament.name}</span>
                  <span className="text-xs text-muted-foreground">{tournamentPhaseLabel(phase, t)} · {phase.percent}%</span>
                </div>
                <span className="flex shrink-0 items-baseline gap-1 text-sm text-muted-foreground">
                  <span className="font-display text-3xl font-semibold leading-none text-foreground">{tournament.inProgressMatches}</span>
                  {t('dashboard.liveMatchesShort')}
                </span>
              </div>
              <PhaseBar {...phase} />
              <Button size="sm" className="self-start" onClick={() => onSelectTournament(tournament)}>
                {t('dashboard.manage')} {t('tournaments.tournament')}
                <ArrowRight />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function Dashboard({ onCreateTournament, onSelectTournament, onCreateLeague, onSelectLeague, onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, canManage, canCreateTournaments } = useAdmin();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();

  if (!(user && canManage)) return <PlayerHome onNavigate={onNavigate} />;

  const myTournaments = tournaments
    .filter(tr => tr.userId === user.id)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const myLeagues = leagues.filter(l => l.createdBy === user.id || (l.managerIds && l.managerIds.includes(user.id)));
  const myActiveTournaments = myTournaments.filter(tr => isTournamentRunning(tr.status));
  const liveTournaments = myActiveTournaments.filter(tr => (tr.inProgressMatches ?? 0) > 0);
  const openForRegistration = myTournaments.filter(tr => tr.status === 'open_for_registration').length;
  // Counts come from the lightweight summary (getTournamentsSummary).
  const myActiveMatches = myTournaments.reduce((sum, tr) => sum + (tr.inProgressMatches ?? 0), 0);
  const displayName = getUserDisplayName(user) || user?.email?.split('@')[0] || t('common.roleManager');

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.welcomeManager', { name: displayName })}</h1>
          <Badge variant="secondary">{isAdmin ? t('common.roleAdmin') : t('common.roleManager')}</Badge>
        </div>
        {canCreateTournaments && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreateTournament}>
              <Plus />
              {t('tournaments.create')}
            </Button>
            <Button variant="outline" onClick={onCreateLeague}>
              <Plus />
              {t('leagues.title')}
            </Button>
          </div>
        )}
      </div>

      {liveTournaments.length > 0 && (
        <LiveNowCard tournaments={liveTournaments} onSelectTournament={onSelectTournament} t={t} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('dashboard.myTournaments')} value={myTournaments.length} icon={Trophy} />
        <StatTile
          label={t('dashboard.myActiveTournaments')}
          value={myActiveTournaments.length}
          icon={Target}
          hint={openForRegistration > 0 ? `${openForRegistration} ${t('tournaments.statusOpenForRegistration').toLowerCase()}` : undefined}
        />
        <StatTile label={t('dashboard.myLeagues')} value={myLeagues.length} icon={Crown} />
        <StatTile label={t('dashboard.myActiveMatches')} value={myActiveMatches} icon={TrendingUp} />
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title={t('dashboard.myLeagues')}
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate('/leagues')}>
              {t('leagues.title')}
              <ArrowRight />
            </Button>
          }
        />
        {myLeagues.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {myLeagues.map(league => (
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
                </CardContent>
                <CardFooter>
                  <Button variant="outline" onClick={() => onSelectLeague(league)}>
                    {t('tournaments.view')} {t('leagues.title')}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={Crown} title={t('dashboard.noMyLeagues')} description={t('dashboard.createFirstLeague')}>
            {canCreateTournaments && (
              <Button onClick={onCreateLeague}>
                <Plus />
                {t('leagues.title')}
              </Button>
            )}
          </EmptyState>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title={t('dashboard.myTournaments')}
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate('/tournaments')}>
              {t('tournaments.title')}
              <ArrowRight />
            </Button>
          }
        />
        {myTournaments.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {myTournaments.map(tournament => {
              const phase = getTournamentPhase(tournament);
              const linkedLeague = tournament.leagueId ? leagues.find(l => l.id === tournament.leagueId) : null;
              const running = isTournamentRunning(tournament.status);
              return (
                <Card key={tournament.id} className="gap-4">
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-base font-semibold leading-6">{tournament.name}</h3>
                      <StatusBadge status={tournament.status} t={t} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {linkedLeague ? (
                        <>
                          <Crown className="size-3" />
                          <span className="truncate">{linkedLeague.name}</span>
                        </>
                      ) : (
                        <span>{t('dashboard.standalone')}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-4" />
                        {tournament.playerCount ?? tournament.players?.length ?? 0} {t('common.players')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-4" />
                        {new Date(tournament.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{tournamentPhaseLabel(phase, t)}</span>
                        {tournament.status !== 'open_for_registration' && (
                          <span className="tabular-nums">{phase.percent}%</span>
                        )}
                      </div>
                      <PhaseBar {...phase} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant={running ? 'default' : 'outline'} onClick={() => onSelectTournament(tournament)}>
                      {running ? t('dashboard.manage') : t('dashboard.viewResults')} {t('tournaments.tournament')}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Trophy} title={t('dashboard.noMyTournaments')} description={t('dashboard.createFirstTournament')}>
            {canCreateTournaments && (
              <Button onClick={onCreateTournament}>
                <Plus />
                {t('tournaments.create')}
              </Button>
            )}
          </EmptyState>
        )}
      </section>
    </div>
  );
}

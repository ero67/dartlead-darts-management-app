import React from 'react';
import { Plus, Trophy, Users, Target, Calendar, TrendingUp, Crown, LogIn, Play, User, Flame, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';
import { StatTile } from './shared/StatTile';
import { isTournamentRunning } from '../utils/tournamentStatus';
import { getUserDisplayName } from '../utils/userDisplayName';
import { loadActiveSession, loadHistory } from '../lib/practiceStorage';
import { PRACTICE_GAMES } from '../lib/practiceGames';

const getTournamentProgress = (tournament) => {
  const totalMatches = tournament.totalMatches ?? 0;
  const completedMatches = tournament.completedMatches ?? 0;
  return totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;
};

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

// Not logged in or regular user: practice first, then browsing.
function PlayerDashboard({ onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const playerName = user ? (getUserDisplayName(user) || user?.email?.split('@')[0]) : null;
  const activePractice = loadActiveSession();
  const activeGame = activePractice ? PRACTICE_GAMES.find(g => g.id === activePractice.game) : null;
  const practiceTotals = loadHistory().reduce((acc, entry) => {
    const st = entry.stats || {};
    acc.sessions += 1;
    acc.oneEighties += st.oneEighties || 0;
    if (entry.game === 'x01' && (st.totalDarts || 0) >= 9 && st.average > acc.bestAverage) acc.bestAverage = st.average;
    return acc;
  }, { sessions: 0, oneEighties: 0, bestAverage: 0 });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {playerName ? t('dashboard.welcomePlayer', { name: playerName }) : t('dashboard.title')}
      </h1>

      <Card className="flex-row flex-wrap items-center gap-4 p-6">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
          <Target className="size-6" />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <h2 className="text-base font-semibold">{t('dashboard.practiceTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.practiceDesc')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeGame && (
            <Button onClick={() => onNavigate(activeGame.path)}>
              <Play />
              {t('dashboard.continueSession')}
            </Button>
          )}
          <Button variant={activeGame ? 'outline' : 'default'} onClick={() => onNavigate('/practice')}>
            <Target />
            {t('dashboard.practiceCta')}
          </Button>
        </div>
      </Card>

      {practiceTotals.sessions > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label={t('practice.stats.sessions')} value={practiceTotals.sessions} icon={Target} />
          <StatTile
            label={t('practice.stats.bestAverage')}
            value={practiceTotals.bestAverage ? practiceTotals.bestAverage.toFixed(1) : t('practice.noStats')}
            icon={TrendingUp}
          />
          <StatTile label={t('practice.stats.oneEighties')} value={practiceTotals.oneEighties} icon={Flame} />
        </div>
      )}

      <Card className="items-center gap-4 p-8 text-center">
        <Trophy className="size-8 text-muted-foreground" />
        <p className="max-w-md text-sm text-muted-foreground">{t('dashboard.playerIntro')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {!user && (
            <Button onClick={() => onNavigate('/login')}>
              <LogIn />
              {t('navigation.login')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onNavigate('/tournaments')}>
            <Trophy />
            {t('dashboard.browsePublic')}
          </Button>
          <Button variant="outline" onClick={() => onNavigate('/leagues')}>
            <Crown />
            {t('dashboard.browseLeagues')}
          </Button>
          {user && (
            <Button variant="outline" onClick={() => onNavigate('/my-profile')}>
              <User />
              {t('navigation.myProfile')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export function Dashboard({ onCreateTournament, onSelectTournament, onCreateLeague, onSelectLeague, onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, canManage, canCreateTournaments } = useAdmin();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();

  if (!(user && canManage)) return <PlayerDashboard onNavigate={onNavigate} />;

  const myTournaments = tournaments
    .filter(tr => tr.userId === user.id)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const myLeagues = leagues.filter(l => l.createdBy === user.id || (l.managerIds && l.managerIds.includes(user.id)));
  const myActiveTournaments = myTournaments.filter(tr => isTournamentRunning(tr.status));
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
              const progress = getTournamentProgress(tournament);
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
                        <span>{t('tournaments.progress')}</span>
                        <span className="tabular-nums">{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} />
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

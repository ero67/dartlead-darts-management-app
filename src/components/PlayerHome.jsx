import React, { useEffect, useState } from 'react';
import { Trophy, Target, TrendingUp, Crown, LogIn, Play, User, Flame, ArrowRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './shared/StatusBadge';
import { BoardMotif, FormDots, LegPips, LiveDot } from './shared/DartsAccents';
import { StatTile } from './shared/StatTile';
import { RoundSchedule } from './shared/RoundSchedule';
import { CricketMarksTable } from './cricket/CricketMarksTable';
import { tournamentService, matchService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { getUserDisplayName } from '../utils/userDisplayName';
import { loadActiveSession, loadHistory } from '../lib/practiceStorage';
import { PRACTICE_GAMES } from '../lib/practiceGames';
import { isCricketGame } from '../lib/cricket';
import { upcomingRounds } from '../utils/roundSchedule';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Practice totals from the on-device history (same numbers the practice pages show).
function summarizePractice(history, formatDate) {
  const now = Date.now();
  return history.reduce((acc, entry) => {
    const st = entry.stats || {};
    acc.sessions += 1;
    if (entry.finishedAt && now - entry.finishedAt < WEEK_MS) acc.thisWeek += 1;
    if (st.oneEighties) {
      acc.oneEighties += st.oneEighties;
      if (!acc.lastOneEightyAt && entry.finishedAt) acc.lastOneEightyAt = formatDate(entry.finishedAt);
    }
    if (entry.game === 'x01' && (st.totalDarts || 0) >= 9 && st.average > acc.bestAverage) {
      acc.bestAverage = st.average;
      acc.bestAverageAt = entry.finishedAt ? formatDate(entry.finishedAt) : null;
    }
    return acc;
  }, { sessions: 0, thisWeek: 0, oneEighties: 0, bestAverage: 0, bestAverageAt: null, lastOneEightyAt: null });
}

// The signed-in player's own live match: both players, legs and the running
// leg score (Cricket: points and marks on the scoreboard).
function MyLiveMatchCard({ match, playerId, tournamentName, onOpen, t }) {
  const rows = [
    { player: match.player1, legs: match.player1_legs, score: match.player1_current_score },
    { player: match.player2, legs: match.player2_legs, score: match.player2_current_score },
  ];
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            {t('dashboard.yourMatch')}
            {match.live_board_number ? ` · ${t('tv.board')} ${match.live_board_number}` : ''}
          </span>
          <span className="truncate text-base font-semibold">{tournamentName}</span>
        </div>
        <Badge className="shrink-0 border-transparent bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">
          <LiveDot />
          {t('liveMatches.live')}
        </Badge>
      </div>
      {isCricketGame(match.game_type) ? (
        <CricketMarksTable
          size="sm"
          players={rows.map(({ player, legs, score }) => ({ name: player?.name || t('management.tbd'), points: score ?? 0, legs: legs || 0 }))}
          marks={match.live_state?.marks}
          thrower={match.current_player}
        />
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-1">
          {rows.map(({ player, legs, score }) => {
            const isMe = player?.id === playerId;
            return (
              <React.Fragment key={player?.id || 'tbd'}>
                <span className={isMe ? 'truncate font-semibold' : 'truncate font-medium text-muted-foreground'}>
                  {player?.name || t('management.tbd')}
                  {isMe && <span className="ml-1.5 text-xs font-medium text-primary">{t('practice.setup.you').toLowerCase()}</span>}
                </span>
                <LegPips won={legs || 0} total={match.legs_to_win} label={`${legs || 0} ${t('match.legs')}`} className={isMe ? 'text-primary' : 'text-muted-foreground'} />
                <span className={`font-display text-3xl font-semibold leading-none ${isMe ? '' : 'text-muted-foreground'}`}>
                  {score ?? match.starting_score ?? '—'}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
        <span>{t('match.firstTo')} {match.legs_to_win} {t('match.legs')}</span>
        <Button variant="ghost" size="sm" className="-mr-2" onClick={onOpen}>
          {t('tournaments.view')}
          <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

// League standing with form dots; `standing` = { league, rank, entry, leader, memberCount }.
function MyLeagueCard({ standing, onOpen, t }) {
  const { league, rank, entry, leader, memberCount } = standing;
  const behind = leader ? leader.totalPoints - entry.totalPoints : 0;
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{t('dashboard.yourLeaguePosition')}</span>
          <span className="truncate text-base font-semibold">{league.name}</span>
        </div>
        <StatusBadge status={league.status} t={t} className="shrink-0" />
      </div>
      <div className="flex items-center gap-4">
        <span className="font-display text-6xl font-semibold leading-none text-primary">#{rank}</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">
            <span className="font-display text-2xl font-semibold text-foreground">{entry.totalPoints}</span> {t('common.pts')}
            {rank > 1 && leader?.player?.name ? ` · ${t('dashboard.behindLeader', { count: behind, name: leader.player.name })}` : ''}
          </span>
          {entry.last5?.length > 0 && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {t('leagues.form')}
              <FormDots results={entry.last5} />
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
        <span>{memberCount} {t('leagues.members')}</span>
        <Button variant="ghost" size="sm" className="-mr-2" onClick={onOpen}>
          {t('leagues.leaderboard')}
          <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

// Next planned rounds in the player's leagues, soonest first.
function UpcomingRoundsCard({ rounds, leagueNames, onOpen, t }) {
  return (
    <Card className="gap-3 p-5">
      <span className="text-xs text-muted-foreground">{t('schedule.upcomingRounds')}</span>
      <ul className="flex flex-col divide-y">
        {rounds.map(round => (
          <li key={round.id} className="py-3 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => onOpen(round)}
              className="flex w-full min-w-0 flex-col gap-1 rounded-md text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-base font-semibold">{round.name}</span>
              {leagueNames[round.leagueId] && (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Crown className="size-3 shrink-0" />
                  <span className="truncate">{leagueNames[round.leagueId]}</span>
                </span>
              )}
              <RoundSchedule startsAt={round.startsAt} venue={round.venue} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Not logged in or regular user: practice first, then what they are playing in.
export function PlayerHome({ onNavigate }) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();
  const [following, setFollowing] = useState({ playerId: null, liveMatch: null, standings: [], leagueNames: {} });

  const locale = language === 'sk' ? 'sk-SK' : 'en-GB';
  const playerName = user ? (getUserDisplayName(user) || user?.email?.split('@')[0]) : null;
  const activePractice = loadActiveSession();
  const activeGame = activePractice ? PRACTICE_GAMES.find(g => g.id === activePractice.game) : null;
  const practice = summarizePractice(loadHistory(), ts => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' }));
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // "Following": the player row linked to this account, their live match and league positions.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const loadFollowing = async () => {
      const player = await tournamentService.getPlayerByUserId(user.id);
      if (!player || cancelled) return;
      const [liveMatches, playerLeagues] = await Promise.all([
        matchService.getLiveMatches({ playerId: player.id }).catch(() => []),
        leagueService.getPlayerLeagues(player.id).catch(() => []),
      ]);
      const liveMatch = (liveMatches || []).find(m => m.player1_id === player.id || m.player2_id === player.id) || null;
      const activeLeagues = playerLeagues.filter(m => m.leagues && m.is_active !== false);
      const leagueNames = Object.fromEntries(activeLeagues.map(m => [m.leagues.id, m.leagues.name]));
      const memberships = activeLeagues.slice(0, 3);
      const standings = (await Promise.all(memberships.map(async m => {
        const leaderboard = await leagueService.getLeaderboard(m.leagues.id);
        const index = leaderboard.findIndex(e => e.player?.id === player.id);
        if (index < 0) return null;
        return { league: m.leagues, rank: index + 1, entry: leaderboard[index], leader: leaderboard[0], memberCount: leaderboard.length };
      }))).filter(Boolean);
      if (!cancelled) setFollowing({ playerId: player.id, liveMatch, standings, leagueNames });
    };
    loadFollowing().catch(error => console.error('Error loading player home:', error));
    return () => { cancelled = true; };
  }, [user]);

  const { playerId, liveMatch, standings, leagueNames } = following;
  const liveTournament = liveMatch ? tournaments.find(tr => tr.id === liveMatch.tournament_id) : null;
  const myUpcoming = upcomingRounds(tournaments.filter(tr => leagueNames[tr.leagueId])).slice(0, 3);
  const hasFollowing = Boolean(liveMatch || standings.length > 0 || myUpcoming.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground first-letter:uppercase">{today}</span>
          <h1 className="font-display text-4xl font-bold leading-none tracking-tight md:text-5xl">
            {playerName ? t('dashboard.welcomePlayer', { name: playerName }) : t('dashboard.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.playerIntro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </header>

      <Card className="relative flex-row flex-wrap items-center gap-6 overflow-hidden bg-gradient-to-br from-primary/10 to-card p-6">
        <BoardMotif className="-right-24 -top-36 w-80" />
        <div className="relative flex min-w-64 flex-1 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">{t('navigation.practice')}</span>
          <h2 className="font-display text-3xl font-bold leading-none">{t('dashboard.practiceTitle')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('dashboard.practiceDesc')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
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
        </div>
        {practice.sessions > 0 && (
          <div className="relative grid flex-1 grid-cols-1 gap-3 min-[480px]:grid-cols-3 min-[480px]:min-w-80">
            <StatTile
              label={t('practice.stats.sessions')}
              value={practice.sessions}
              icon={Target}
              hint={practice.thisWeek > 0 ? t('dashboard.thisWeek', { count: practice.thisWeek }) : undefined}
            />
            <StatTile
              label={t('practice.stats.bestAverage')}
              value={practice.bestAverage ? practice.bestAverage.toFixed(1) : t('practice.noStats')}
              icon={TrendingUp}
              hint={practice.bestAverageAt || undefined}
            />
            <StatTile
              label={t('practice.stats.oneEighties')}
              value={practice.oneEighties}
              icon={Flame}
              hint={practice.lastOneEightyAt ? t('dashboard.lastOne', { date: practice.lastOneEightyAt }) : undefined}
            />
          </div>
        )}
      </Card>

      {hasFollowing && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{t('dashboard.following')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {myUpcoming.length > 0 && (
              <UpcomingRoundsCard
                rounds={myUpcoming}
                leagueNames={leagueNames}
                onOpen={(round) => onNavigate(`/tournament/${round.id}`)}
                t={t}
              />
            )}
            {liveMatch && (
              <MyLiveMatchCard
                match={liveMatch}
                playerId={playerId}
                tournamentName={liveTournament?.name || t('tournaments.tournament')}
                onOpen={() => onNavigate(`/tournament/${liveMatch.tournament_id}`)}
                t={t}
              />
            )}
            {standings.map(standing => (
              <MyLeagueCard
                key={standing.league.id}
                standing={{ ...standing, memberCount: leagues.find(l => l.id === standing.league.id)?.memberCount || standing.memberCount }}
                onOpen={() => onNavigate(`/league/${standing.league.id}`)}
                t={t}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

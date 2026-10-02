import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Trophy, Target, Crown, Calendar, TrendingUp, Award, Medal,
  Flame, Zap, Percent, Swords, ShieldCheck, ChevronRight, Activity, Pencil, BarChart3
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';
import { StatTile } from './shared/StatTile';
import { DisplayNameEditor } from './DisplayNameEditor';
import { AccountDeletion } from './AccountDeletion';
import { MatchStatisticsModal } from './MatchStatisticsModal';
import { PracticeBests } from './practice/PracticeBests';
import { tournamentService } from '../services/tournamentService';
import { loadHistory } from '../lib/practiceStorage';

const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const placementLabel = (placement, t) => {
  if (placement === 1) return t('playerProfile.placementWinner');
  if (placement === 2) return t('playerProfile.placementRunnerUp');
  if (placement === 3) return t('playerProfile.placementThird');
  return null;
};

const WIN_BADGE = 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
const LOSS_BADGE = 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
const TITLE_BADGE = 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
const MEDAL_CLASS = { 1: 'text-amber-500', 2: 'text-zinc-400', 3: 'text-amber-700' };

const ROW_BUTTON = 'flex w-full items-center gap-3 px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none';

function Section({ icon: Icon, title, children }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function BackButton({ onBack, t }) {
  return (
    <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
      <ArrowLeft />
      {t('common.back')}
    </Button>
  );
}

export function PlayerProfile({ playerId, onBack, onSelectTournament, onSelectLeague, onSelectPlayer, onSelectPractice }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsMatch, setStatsMatch] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const data = await tournamentService.getPlayerProfile(playerId);
        if (!cancelled) setProfileData(data);
      } catch (error) {
        console.error('Error loading player profile:', error);
        if (!cancelled) setProfileData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (playerId) loadProfile();
    return () => { cancelled = true; };
  }, [playerId]);

  if (loading) {
    return (
      <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
        <BackButton onBack={onBack} t={t} />
        <EmptyState icon={Target} title={t('playerProfile.playerNotFound')} />
      </div>
    );
  }

  // Slovak needs three plural forms (1 / 2-4 / 5+); English reuses one string
  // for the last two, so the same lookup works for both locales.
  const plural = (keyBase, count) => {
    const form = count === 1 ? 'One' : (count >= 2 && count <= 4 ? 'Few' : 'Many');
    return t(`playerProfile.${keyBase}${form}`, { count });
  };

  const { player, tournaments, careerStats, leagues, recentMatches = [] } = profileData;
  const isOwnProfile = !!(user && player.user_id && player.user_id === user.id);
  const winRate = careerStats.matchesPlayed > 0
    ? (careerStats.wins / careerStats.matchesPlayed) * 100
    : 0;

  // Current run of identical results, newest first (recentMatches is ordered desc)
  const streak = recentMatches.reduce((acc, match) => {
    if (acc.done) return acc;
    if (acc.count === 0) return { won: match.won, count: 1, done: false };
    if (match.won === acc.won) return { ...acc, count: acc.count + 1 };
    return { ...acc, done: true };
  }, { won: false, count: 0, done: false });

  const heroStats = [
    {
      key: 'matches',
      icon: Swords,
      label: t('playerProfile.matchesPlayed'),
      value: careerStats.matchesPlayed
    },
    {
      key: 'winRate',
      icon: Percent,
      label: t('playerProfile.winRate'),
      value: `${winRate.toFixed(careerStats.matchesPlayed > 0 ? 1 : 0)}%`,
      hint: careerStats.matchesPlayed > 0
        ? `${plural('winsCount', careerStats.wins)} · ${plural('lossesCount', careerStats.losses)}`
        : undefined
    },
    {
      key: 'average',
      icon: TrendingUp,
      label: t('playerProfile.overallAverage'),
      value: careerStats.overallAverage.toFixed(2)
    }
  ];

  const statTiles = [
    { key: 'wins', icon: Trophy, label: t('playerProfile.wins'), value: careerStats.wins },
    { key: 'losses', icon: Target, label: t('playerProfile.losses'), value: careerStats.losses },
    { key: 'bestAverage', icon: Award, label: t('playerProfile.bestAverage'), value: careerStats.bestAverage.toFixed(2) },
    { key: 'highestCheckout', icon: Zap, label: t('playerProfile.highestCheckout'), value: careerStats.highestCheckout || '—' },
    { key: 'total180s', icon: Flame, label: t('playerProfile.total180s'), value: careerStats.total180s || 0 },
    { key: 'legs', icon: Activity, label: t('playerProfile.legsRecord'), value: `${careerStats.totalLegsWon || 0}:${careerStats.totalLegsLost || 0}` },
    { key: 'titles', icon: Crown, label: t('playerProfile.tournamentWins'), value: careerStats.tournamentWins || 0 },
    { key: 'darts', icon: Target, label: t('playerProfile.dartsThrown'), value: (careerStats.totalDarts || 0).toLocaleString() }
  ];

  const practiceHistory = isOwnProfile ? loadHistory() : [];

  return (
    <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 text-foreground md:p-8">
      <BackButton onBack={onBack} t={t} />

      {/* Hero */}
      <Card className="flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="size-20 shrink-0">
            <AvatarFallback className="text-2xl font-semibold text-foreground">{getInitials(player.name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {isOwnProfile && isEditingName ? (
              <DisplayNameEditor
                currentName={player.name}
                onSaved={(newName) => {
                  setProfileData(prev => prev ? { ...prev, player: { ...prev.player, name: newName } } : prev);
                  setIsEditingName(false);
                }}
                onCancel={() => setIsEditingName(false)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">{player.name}</h1>
                {isOwnProfile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => setIsEditingName(true)}
                    title={t('playerProfile.editName')}
                    aria-label={t('playerProfile.editName')}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {isOwnProfile && (
                <Badge>{t('playerProfile.yourProfile')}</Badge>
              )}
              {player.user_id && (
                <Badge variant="secondary">
                  <ShieldCheck />
                  {t('playerProfile.linkedAccount')}
                </Badge>
              )}
              <Badge variant="outline">
                <Trophy />
                {plural('tournamentsCount', careerStats.tournamentsPlayed ?? tournaments.length)}
              </Badge>
              {careerStats.tournamentWins > 0 && (
                <Badge variant="outline" className={TITLE_BADGE}>
                  <Crown />
                  {plural('titlesCount', careerStats.tournamentWins)}
                </Badge>
              )}
              {streak.count > 1 && (
                <Badge variant="outline" className={streak.won ? WIN_BADGE : LOSS_BADGE}>
                  <Flame />
                  {plural(streak.won ? 'winStreakCount' : 'lossStreakCount', streak.count)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[28rem]">
          <div className="grid gap-3 sm:grid-cols-3">
            {heroStats.map(stat => (
              <StatTile key={stat.key} label={stat.label} value={stat.value} icon={stat.icon} hint={stat.hint} />
            ))}
          </div>
          {careerStats.matchesPlayed > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{plural('winsCount', careerStats.wins)}</span>
                <span>{plural('lossesCount', careerStats.losses)}</span>
              </div>
              <Progress value={winRate} aria-label={t('playerProfile.winRate')} />
            </div>
          )}
        </div>
      </Card>

      {/* Career Statistics */}
      <Section icon={Activity} title={t('playerProfile.careerStats')}>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {statTiles.map(tile => (
            <StatTile key={tile.key} label={tile.label} value={tile.value} icon={tile.icon} />
          ))}
        </div>
      </Section>

      {/* Practice bests */}
      {isOwnProfile && practiceHistory.length > 0 && (
        <Section icon={Target} title={t('practice.bests.profileTitle')}>
          <Card>
            <CardContent>
              <PracticeBests entries={practiceHistory} compact />
            </CardContent>
            <CardFooter>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => onSelectPractice?.()}>
                {t('practice.bests.openPractice')} <ChevronRight />
              </Button>
            </CardFooter>
          </Card>
        </Section>
      )}

      {/* Recent matches */}
      <Section icon={Swords} title={t('playerProfile.recentMatches')}>
        {recentMatches.length > 0 ? (
          <Card className="gap-4 pb-0">
            <CardHeader>
              <div className="flex flex-wrap gap-1">
                {[...recentMatches].reverse().map(match => (
                  <Badge
                    key={match.id}
                    variant="outline"
                    className={cn('size-6 justify-center p-0', match.won ? WIN_BADGE : LOSS_BADGE)}
                    title={`${match.opponentName || t('common.unknown')} ${match.legsFor}:${match.legsAgainst}`}
                  >
                    {match.won ? t('playerProfile.formWin') : t('playerProfile.formLoss')}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {recentMatches.map(match => (
                <div key={match.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                  <Badge variant="outline" className={cn('size-6 shrink-0 justify-center p-0', match.won ? WIN_BADGE : LOSS_BADGE)}>
                    {match.won ? t('playerProfile.formWin') : t('playerProfile.formLoss')}
                  </Badge>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span>
                        {t('playerProfile.versus')}{' '}
                        {match.opponentId && onSelectPlayer ? (
                          <button
                            type="button"
                            className="font-medium underline-offset-4 hover:underline"
                            onClick={() => onSelectPlayer({ id: match.opponentId })}
                          >
                            {match.opponentName || t('common.unknown')}
                          </button>
                        ) : (
                          match.opponentName || t('common.unknown')
                        )}
                      </span>
                      {match.isPlayoff && (
                        <Badge variant="outline">{t('playerProfile.playoffTag')}</Badge>
                      )}
                    </span>
                    {(match.tournamentName || match.playedAt) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          match.tournamentName,
                          match.playedAt ? new Date(match.playedAt).toLocaleDateString() : null
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-lg font-semibold tabular-nums">{match.legsFor}:{match.legsAgainst}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {match.average ? match.average.toFixed(2) : '—'} {t('playerProfile.avgShort')}
                    </span>
                  </div>
                  {match.result && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      onClick={() => setStatsMatch(match)}
                      title={t('matchStats.open')}
                      aria-label={t('matchStats.open')}
                    >
                      <BarChart3 />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Swords} title={t('playerProfile.noMatches')} />
        )}
      </Section>

      {/* Tournament History */}
      <Section icon={Trophy} title={t('playerProfile.tournamentHistory')}>
        {tournaments.length > 0 ? (
          <Card className="py-0">
            <CardContent className="divide-y px-0">
              {tournaments.map((tourn, index) => (
                <button
                  type="button"
                  key={tourn.id}
                  className={ROW_BUTTON}
                  onClick={() => onSelectTournament && onSelectTournament(tourn)}
                >
                  <span className="flex w-8 shrink-0 items-center justify-center">
                    {tourn.placement && tourn.placement <= 3 ? (
                      <Medal className={cn('size-5', MEDAL_CLASS[tourn.placement])} />
                    ) : (
                      <span className="text-xs text-muted-foreground tabular-nums">{tourn.placement || index + 1}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{tourn.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3.5" />
                      {new Date(tourn.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  {tourn.placement && placementLabel(tourn.placement, t) && (
                    <Badge variant="outline" className={cn(tourn.placement === 1 && TITLE_BADGE)}>
                      {placementLabel(tourn.placement, t)}
                    </Badge>
                  )}
                  <StatusBadge status={tourn.status} t={t} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Trophy} title={t('playerProfile.noTournaments')} />
        )}
      </Section>

      {/* League Memberships */}
      {leagues.length > 0 && (
        <Section icon={Crown} title={t('playerProfile.leagues')}>
          <Card className="py-0">
            <CardContent className="divide-y px-0">
              {leagues.map(lm => (
                <button
                  type="button"
                  key={lm.league_id}
                  className={ROW_BUTTON}
                  onClick={() => onSelectLeague && onSelectLeague({ id: lm.league_id })}
                >
                  <Crown className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{lm.leagues?.name || lm.league_id}</span>
                  {lm.is_active && <Badge variant="outline" className={WIN_BADGE}>{t('common.active')}</Badge>}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </Section>
      )}

      {isOwnProfile && <AccountDeletion />}

      {statsMatch && (
        <MatchStatisticsModal match={statsMatch} onClose={() => setStatsMatch(null)} />
      )}
    </div>
  );
}

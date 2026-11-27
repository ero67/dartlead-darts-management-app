import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Trophy, Target, Crown, Calendar, TrendingUp, Award,
  Flame, Zap, Swords, ShieldCheck, ChevronRight, Activity, Pencil, BarChart3, Camera, Loader, X
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from './shared/StatusBadge';
import { EmptyState } from './shared/EmptyState';
import { StatTile } from './shared/StatTile';
import { RankMedal, MILESTONE_TEXT } from './shared/RankMedal';
import { FormChange, FormTrend } from './FormRating';
import { DisplayNameEditor } from './DisplayNameEditor';
import { AvatarCropDialog } from './AvatarCropDialog';
import { AccountDeletion } from './AccountDeletion';
import { MatchStatisticsModal } from './MatchStatisticsModal';
import { PracticeBests } from './practice/PracticeBests';
import { tournamentService } from '../services/tournamentService';
import { mediaService } from '../services/mediaService';
import { toast } from 'sonner';
import { confirmDialog } from '../lib/confirmDialog';
import { loadHistory } from '../lib/practiceStorage';
import { useFormRating } from '../hooks/useFormRating';

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
// Darts milestones get board red, as on the Statistics boards: a 100+ average, a ton-plus checkout
const milestone = (value) => (value >= 100 ? MILESTONE_TEXT : undefined);

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

// One headline number in the hero: label, the number, a supporting line
function Figure({ label, value, sub, isLead = false, valueClassName }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className={cn('font-display font-semibold leading-none tabular-nums', isLead ? 'text-5xl' : 'text-4xl', valueClassName)}>{value}</div>
      {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
    </div>
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
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const photoInputRef = useRef(null);
  // Loads alongside the profile; the hero leads with it
  const form = useFormRating(playerId);

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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
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

  const { player, tournaments, careerStats, leagues, recentMatches = [], cricketStats } = profileData;
  // X01 numbers come from X01 matches only; name them so when Cricket is in the mix,
  // and leave them out for a player who has only played Cricket.
  const hasX01 = !cricketStats || careerStats.matchesPlayed > cricketStats.matches;
  const x01 = (label) => (cricketStats ? `${label} · ${t('common.gameTypeX01')}` : label);
  const isOwnProfile = !!(user && player.user_id && player.user_id === user.id);

  // file = upload or replace your photo (crop = the square picked in the crop dialog); null = remove it.
  const handleRemovePhoto = async () => {
    const confirmed = await confirmDialog(t('playerProfile.removePhotoConfirm'), {
      destructive: true,
      confirmLabel: t('playerProfile.removePhoto'),
    });
    if (confirmed) handlePhotoChange(null);
  };

  const handlePhotoChange = async (file, crop) => {
    const path = `avatars/${user.id}.webp`;
    setIsSavingPhoto(true);
    try {
      let url = null;
      if (file) {
        url = await mediaService.uploadImage(path, file, { maxSide: 256, square: true, crop });
      } else {
        await mediaService.removeImage(path);
      }
      await tournamentService.setMyAvatar(url);
      setProfileData(prev => prev ? { ...prev, player: { ...prev.player, avatar_url: url } } : prev);
      toast.success(t(url ? 'playerProfile.photoSaved' : 'playerProfile.photoRemoved'));
    } catch (error) {
      console.error('Error saving player photo:', error);
      if (error.code === 'too_large') toast.error(t('media.tooLarge'));
      else if (error.code === 'unsupported') toast.error(t('media.unsupportedImage'));
      else toast.error(t('media.uploadFailed'));
    } finally {
      setIsSavingPhoto(false);
    }
  };
  const hasMatches = careerStats.matchesPlayed > 0;
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

  // Hero: form leads (it drives the win chances), then the average and the record
  const formLabel = x01(t('playerProfile.formRating'));
  const averageFigure = hasX01
    ? { label: x01(t('playerProfile.overallAverage')), value: careerStats.overallAverage.toFixed(2), valueClassName: milestone(careerStats.overallAverage) }
    : { label: t('playerProfile.cricketMpr'), value: cricketStats.mpr.toFixed(2) };
  const recordSub = `${t('playerProfile.winRate')} ${winRate.toFixed(1)}% · ${plural('matchesCount', careerStats.matchesPlayed)}`;

  const x01Tiles = hasX01 ? [
    { key: 'bestAverage', icon: Award, label: x01(t('playerProfile.bestAverage')), value: careerStats.bestAverage.toFixed(2), tone: 'primary', valueClassName: milestone(careerStats.bestAverage) },
    { key: 'highestCheckout', icon: Zap, label: x01(t('playerProfile.highestCheckout')), value: careerStats.highestCheckout || '—', tone: 'live', valueClassName: milestone(careerStats.highestCheckout) },
    { key: 'total180s', icon: Flame, label: x01(t('playerProfile.total180s')), value: careerStats.total180s || 0, tone: 'primary' }
  ] : [];
  const cricketTiles = cricketStats ? [
    { key: 'cricketMatches', icon: Swords, label: t('playerProfile.cricketMatches'), value: cricketStats.matches },
    { key: 'cricketMpr', icon: TrendingUp, label: t('playerProfile.cricketMpr'), value: (cricketStats.mpr || 0).toFixed(2), tone: 'primary' },
    { key: 'cricketBestMpr', icon: Award, label: t('playerProfile.cricketBestMpr'), value: (cricketStats.bestMpr || 0).toFixed(2), tone: 'primary' }
  ] : [];
  const statTiles = [
    ...x01Tiles,
    { key: 'legs', icon: Activity, label: t('playerProfile.legsRecord'), value: `${careerStats.totalLegsWon || 0}:${careerStats.totalLegsLost || 0}` },
    { key: 'titles', icon: Crown, label: t('playerProfile.tournamentWins'), value: careerStats.tournamentWins || 0 },
    ...(hasX01 ? [{ key: 'darts', icon: Target, label: x01(t('playerProfile.dartsThrown')), value: (careerStats.totalDarts || 0).toLocaleString() }] : []),
    ...cricketTiles
  ];

  const practiceHistory = isOwnProfile ? loadHistory() : [];
  const showPractice = isOwnProfile && practiceHistory.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 text-foreground md:p-8">
      <BackButton onBack={onBack} t={t} />

      {/* Hero: who it is, then how they are playing */}
      <Card className="gap-6 p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative size-20 shrink-0">
            <Avatar className="size-20">
              <AvatarImage src={player.avatar_url || undefined} alt="" />
              <AvatarFallback className="text-2xl font-semibold text-foreground">{getInitials(player.name)}</AvatarFallback>
            </Avatar>
            {isOwnProfile && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ''; // picking the same file again still fires onChange
                    if (file) setCropFile(file);
                  }}
                />
                {/* Mounted per file, so each new photo starts centred at zoom 1. */}
                {cropFile && <AvatarCropDialog
                  file={cropFile}
                  onCancel={() => setCropFile(null)}
                  onSave={(crop) => {
                    setCropFile(null);
                    handlePhotoChange(cropFile, crop);
                  }}
                  onUnsupported={() => {
                    setCropFile(null);
                    toast.error(t('media.unsupportedImage'));
                  }}
                />}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="absolute -right-1 -bottom-1 rounded-full shadow-sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isSavingPhoto}
                  title={t('playerProfile.changePhoto')}
                  aria-label={t('playerProfile.changePhoto')}
                >
                  {isSavingPhoto ? <Loader className="animate-spin" /> : <Camera />}
                </Button>
                {player.avatar_url && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="absolute -top-1 -right-1 size-6 rounded-full shadow-sm"
                    onClick={handleRemovePhoto}
                    disabled={isSavingPhoto}
                    title={t('playerProfile.removePhoto')}
                    aria-label={t('playerProfile.removePhoto')}
                  >
                    <X />
                  </Button>
                )}
              </>
            )}
          </div>
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

        {hasMatches && (
          // Trend always under the figures: beside them it was squeezed to ~90px even at 1280-1440
          <div className="flex flex-col gap-6 border-t pt-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
              {form.status !== 'none' && (
                <Figure
                  isLead
                  label={formLabel}
                  value={form.status === 'ready' ? form.now.toFixed(1) : <Skeleton className="h-12 w-24" />}
                  sub={form.status === 'ready' ? <FormChange form={form} /> : null}
                />
              )}
              <Figure label={averageFigure.label} value={averageFigure.value} valueClassName={averageFigure.valueClassName} />
              <Figure label={t('playerProfile.record')} value={`${careerStats.wins}–${careerStats.losses}`} sub={recordSub} />
            </div>
            {form.status === 'ready' && <FormTrend form={form} />}
          </div>
        )}
      </Card>

      {/* Career Statistics */}
      <Section icon={Activity} title={t('playerProfile.careerStats')}>
        {hasMatches ? (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            {statTiles.map(tile => (
              <StatTile key={tile.key} label={tile.label} value={tile.value} icon={tile.icon} tone={tile.tone} valueClassName={tile.valueClassName} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Activity} title={t('playerProfile.noStatsYet')} description={t('playerProfile.noStatsYetHint')} />
        )}
      </Section>

      {/* Everything below the stats is one tap away instead of a long scroll */}
      <Tabs defaultValue={hasMatches ? 'matches' : 'tournaments'} className="gap-4">
        <TabsList>
          {hasMatches && <TabsTrigger value="matches"><Swords />{t('playerProfile.recentMatches')}</TabsTrigger>}
          <TabsTrigger value="tournaments"><Trophy />{t('tournaments.title')}</TabsTrigger>
          {leagues.length > 0 && <TabsTrigger value="leagues"><Crown />{t('leagues.title')}</TabsTrigger>}
          {showPractice && <TabsTrigger value="practice"><Target />{t('practice.bests.profileTitle')}</TabsTrigger>}
        </TabsList>
        {hasMatches && (
          <TabsContent value="matches">
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
                      <span className="font-display text-xl font-semibold">{match.legsFor}:{match.legsAgainst}</span>
                      <span className={cn('text-xs text-muted-foreground tabular-nums', match.gameType !== 'cricket' && milestone(match.average))}>
                        {match.gameType === 'cricket'
                          ? `${match.mpr ? match.mpr.toFixed(2) : '—'} ${t('common.mpr')}`
                          : `${match.average ? match.average.toFixed(2) : '—'} ${t('playerProfile.avgShort')}`}
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
          </TabsContent>
        )}
        <TabsContent value="tournaments">
        {tournaments.length > 0 ? (
          <Card className="py-0">
            <CardContent className="divide-y px-0">
              {tournaments.map((tourn) => (
                <button
                  type="button"
                  key={tourn.id}
                  className={ROW_BUTTON}
                  onClick={() => onSelectTournament && onSelectTournament(tourn)}
                >
                  <span className="flex w-8 shrink-0 items-center justify-center">
                    {/* Gold / silver / bronze chips, other places as a plain number */}
                    {tourn.placement && <RankMedal rank={tourn.placement} />}
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
        </TabsContent>
        {leagues.length > 0 && (
          <TabsContent value="leagues">
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
          </TabsContent>
        )}
        {showPractice && (
          <TabsContent value="practice">
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
          </TabsContent>
        )}
      </Tabs>

      {/* Stays a visible section: the public delete-account page sends users here */}
      {isOwnProfile && <AccountDeletion />}

      {statsMatch && (
        <MatchStatisticsModal match={statsMatch} onClose={() => setStatsMatch(null)} />
      )}
    </div>
  );
}

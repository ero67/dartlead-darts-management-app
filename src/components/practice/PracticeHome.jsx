import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Play, Trash2, Smartphone, Cloud, CloudOff, RefreshCw, LogIn } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOffline } from '../../contexts/OfflineContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BoardMotif, CheckoutRoute, LiveDot } from '../shared/DartsAccents';
import { PracticeBests } from './PracticeBests';
import { PracticeGameAbbr } from './PracticeShared';
import { sessionHeadline } from './practiceView';
import { PRACTICE_GAMES, describeSession, formatSessionDate, sessionHighlights } from '../../lib/practiceGames';
import { loadActiveSession, saveActiveSession, clearActiveSession, loadHistory, countPendingSync } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { computeStats } from '../../lib/x01Engine';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { cn } from '@/lib/utils';

const RECENT_LIMIT = 5;

const formatTime = (timestamp, language) => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString(language === 'sk' ? 'sk-SK' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Headline number for the session in progress, per game. Everything here is
// read from the saved state, nothing is estimated.
const activeKpi = (active, t) => {
  const s = active.state;
  switch (active.game) {
    case 'x01': {
      const stats = computeStats(s.kind === 'match' ? s.players[0] : s);
      return [stats.average.toFixed(1), t('practice.stats.average')];
    }
    case 'checkout':
      return [`${s.attempts.filter(a => a.hit).length}/${s.attempts.length}`, t('practice.checkout.stats.hits')];
    case 'oneTwentyOne':
      return [`${s.rounds.filter(r => r.success).length}/${s.rounds.length}`, t('practice.oneTwentyOne.stats.successes')];
    case 'aroundTheClock':
      return [`${s.targetIndex}/${s.targets.length}`, t('practice.aroundTheClock.target')];
    default:
      return null;
  }
};

// Decorative previews inside the game cards (aria-hidden, illustrative numbers).
const PREVIEW_CHIP = 'rounded bg-muted px-2 py-px font-display text-sm font-semibold text-muted-foreground';
const GAME_PREVIEWS = {
  x01: (
    <div className="flex items-center justify-center gap-3">
      <span className="font-display text-5xl font-bold leading-none text-muted-foreground/50 line-through decoration-2">501</span>
      <span className="flex flex-col gap-1"><span className={PREVIEW_CHIP}>−100</span><span className={PREVIEW_CHIP}>−60</span></span>
      <span className="font-display text-5xl font-bold leading-none">341</span>
    </div>
  ),
  checkout: (
    <div className="flex flex-col items-center gap-1.5">
      <span className="font-display text-5xl font-bold leading-[0.9]">87</span>
      <CheckoutRoute route={['T17', 'D18']} />
    </div>
  ),
  oneTwentyOne: (
    <div className="flex h-full items-end gap-1.5 px-4 py-3">
      {[['121', 'h-6 bg-primary/70'], ['122', 'h-9 bg-primary/70'], ['123', 'h-12 bg-primary'], ['124', 'h-15 border border-dashed']].map(([n, bar], i) => (
        <span key={n} className="flex flex-1 flex-col items-center gap-1">
          <span className={cn('font-display text-sm font-semibold', i === 2 ? 'text-foreground' : i === 3 ? 'text-muted-foreground/60' : 'text-primary')}>{n}</span>
          <span className={cn('w-full rounded-t', bar)} />
        </span>
      ))}
    </div>
  ),
  aroundTheClock: (
    <div className="grid w-full grid-cols-7 gap-1 px-3">
      {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={cn(
            'flex h-5 items-center justify-center rounded border font-display text-[13px] font-semibold',
            n < 7 && 'border-primary/30 bg-primary/10 text-primary',
            n === 7 && 'border-primary bg-primary text-primary-foreground',
            n > 7 && 'text-muted-foreground/60'
          )}
        >
          {n === 21 ? 'B' : n}
        </span>
      ))}
    </div>
  )
};

// Practice landing: pick a game, resume an unfinished session, see personal
// bests and recent results. History lives on the device and, for signed-in
// players, is mirrored to their account (practiceService).
export function PracticeHome() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  const [active, setActive] = useState(() => loadActiveSession());
  const [discarded, setDiscarded] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | ok | error
  const pending = countPendingSync();

  const runSync = useCallback(async () => {
    if (!user?.id || !isOnline) return;
    setSyncState('syncing');
    try {
      const merged = await practiceService.sync(user.id);
      setHistory(merged);
      setSyncState('ok');
    } catch (error) {
      console.error('Practice sync failed:', error);
      setSyncState('error');
    }
  }, [user?.id, isOnline]);

  useEffect(() => { runSync(); }, [runSync]);

  const activeGame = active ? PRACTICE_GAMES.find(g => g.id === active.game) : null;
  const kpi = active ? activeKpi(active, t) : null;
  const isActiveMatch = active?.game === 'x01' && active.state.kind === 'match';

  const handleDiscard = () => {
    setDiscarded(active);
    clearActiveSession();
    setActive(null);
  };

  // Put the discarded session back exactly as it was saved.
  const handleRestore = () => {
    saveActiveSession(discarded.game, discarded.state);
    setActive(loadActiveSession());
    setDiscarded(null);
  };

  const syncPill = user && (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border px-3', syncState === 'ok' && 'border-primary/40 text-primary', syncState === 'error' && 'border-destructive/40 text-destructive', (syncState === 'idle' || syncState === 'syncing') && 'text-muted-foreground')}>
        {syncState === 'syncing' && <><RefreshCw className="size-3.5 animate-spin" /> {t('practice.sync.syncing')}</>}
        {syncState === 'ok' && <><Cloud className="size-3.5" /> {t('practice.sync.synced')}</>}
        {syncState === 'error' && <><CloudOff className="size-3.5" /> {t('practice.sync.failed')}</>}
        {syncState === 'idle' && !isOnline && <><CloudOff className="size-3.5" /> {t('practice.sync.offline', { count: pending })}</>}
        {syncState === 'idle' && isOnline && <><Cloud className="size-3.5" /> {t('practice.sync.idle')}</>}
      </span>
      {syncState !== 'syncing' && isOnline && (
        <Button variant="link" size="sm" className="h-8 px-1 text-muted-foreground" onClick={runSync}>
          {t('practice.sync.retry')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-2">
          {user && <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{getUserDisplayName(user)}</span>}
          <h1 className="font-display text-4xl font-bold leading-none tracking-tight md:text-5xl">{t('practice.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('practice.subtitle')}</p>
        </div>
        {syncPill}
      </header>

      {active && activeGame && (
        <Card className="relative flex-row flex-wrap items-center justify-between gap-4 overflow-hidden border-primary/40 bg-gradient-to-br from-primary/10 to-card p-5 sm:p-6">
          <BoardMotif className="-right-24 -top-36 w-80" />
          <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <LiveDot /> {t('practice.resumeTitle')}
            </span>
            <h2 className="font-display text-3xl font-bold leading-none">
              {t(`practice.games.${active.game}.title`)} · {describeSession({ game: active.game, settings: active.state.settings }, t)}
            </h2>
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground [&_b]:tabular-nums">
              {isActiveMatch && <span>{t('practice.stats.legs')} <b>{active.state.legsWon[0]} – {active.state.legsWon[1]}</b></span>}
              {active.state.startedAt && <span>{t('practice.startedAt', { time: formatTime(active.state.startedAt, language) })}</span>}
            </span>
          </div>
          <div className="relative flex flex-wrap items-center gap-5">
            {kpi && (
              <span className="flex flex-col leading-none">
                <span className="font-display text-5xl font-bold tabular-nums">{kpi[0]}</span>
                <span className="text-xs text-muted-foreground">{kpi[1]}</span>
              </span>
            )}
            <span className="flex gap-2">
              <Button variant="outline" onClick={handleDiscard}>
                <Trash2 /> {t('practice.discard')}
              </Button>
              <Button onClick={() => navigate(activeGame.path)}>
                <Play /> {t('practice.resume')}
              </Button>
            </span>
          </div>
        </Card>
      )}
      {discarded && !active && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <span>{t('practice.discarded')}</span>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={handleRestore}>{t('match.undo')}</Button>
        </div>
      )}

      <section aria-label={t('practice.startGame')} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t('practice.startGame')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PRACTICE_GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors hover:border-muted-foreground/40 disabled:cursor-default disabled:opacity-60 disabled:hover:border-border"
              disabled={!game.available}
              onClick={() => game.available && navigate(game.path)}
            >
              {!game.available && <Badge variant="secondary" className="absolute right-4 top-4 z-10">{t('practice.comingSoon')}</Badge>}
              <div aria-hidden="true" className="flex h-26 items-center justify-center overflow-hidden rounded-lg border bg-background">
                {GAME_PREVIEWS[game.id]}
              </div>
              <span className="flex items-center justify-between">
                <span className="text-base font-semibold">{t(`practice.games.${game.id}.title`)}</span>
                <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
              </span>
              <p className="-mt-1 text-sm text-muted-foreground">{t(`practice.games.${game.id}.desc`)}</p>
            </button>
          ))}
        </div>
      </section>

      {history.length > 0 && <PracticeBests entries={history} title={t('practice.bests.title')} />}

      <div className="flex flex-wrap items-start gap-6">
        {history.length > 0 && (
          <section aria-label={t('practice.history.recent')} className="flex min-w-0 flex-[999_1_20rem] flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">{t('practice.history.recent')}</h2>
              <Button variant="link" size="sm" className="px-0" onClick={() => navigate('/practice/history')}>
                {t('practice.history.viewAll')} <ArrowRight />
              </Button>
            </div>
            <Card className="gap-0 divide-y py-0">
              {history.slice(0, RECENT_LIMIT).map((entry) => (
                <SessionRow key={entry.id} entry={entry} t={t} language={language} />
              ))}
            </Card>
          </section>
        )}

        {!user && history.length > 0 && (
          <Card className="flex-[1_1_18rem] flex-row flex-wrap items-center gap-3 px-4 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Cloud className="size-4" /></span>
            <span className="flex min-w-40 flex-1 flex-col leading-snug">
              <span className="text-sm font-semibold">{t('practice.sync.signInTitle')}</span>
              <span className="text-xs text-muted-foreground">{t('practice.sync.signInText')}</span>
            </span>
            <Button variant="outline" onClick={() => navigate('/login', { state: { from: '/practice' } })}>
              <LogIn /> {t('navigation.login')}
            </Button>
          </Card>
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {user ? <Cloud className="size-3.5" /> : <Smartphone className="size-3.5" />}
        {' '}{user ? t('practice.sync.note') : t('practice.savedLocally')}
      </p>
    </div>
  );
}

// One finished session in a divide-y list: game, date and the headline stat.
export function SessionRow({ entry, t, language, onDelete }) {
  const headline = sessionHeadline(entry, t);
  const detail = sessionHighlights(entry, t)[1];
  return (
    <div className="flex items-center gap-3 py-2.5 pl-4 pr-2">
      <PracticeGameAbbr game={entry.game} />
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate text-sm font-medium">{t(`practice.games.${entry.game}.title`)} · {describeSession(entry, t)}</span>
        <span className="text-xs text-muted-foreground">{formatSessionDate(entry.finishedAt, language)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end text-right leading-snug">
        <span className={cn('text-sm font-semibold tabular-nums', headline.isWin && 'text-primary')}>{headline.text}</span>
        {detail && <span className="text-xs text-muted-foreground tabular-nums">{detail[1]} {detail[0]}</span>}
      </span>
      {onDelete && (
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => onDelete(entry.id)} title={t('practice.history.delete')} aria-label={t('practice.history.delete')}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, ChevronRight, Smartphone, Cloud, CloudOff, RefreshCw, LogIn } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOffline } from '../../contexts/OfflineContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { PracticeBests } from './PracticeBests';
import { PRACTICE_GAMES, describeSession, formatSessionDate, sessionHighlights } from '../../lib/practiceGames';
import { loadActiveSession, clearActiveSession, loadHistory, countPendingSync } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { computeStats } from '../../lib/x01Engine';

const RECENT_LIMIT = 5;

const ICON_BOX = 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary';

// Practice landing: pick a game, resume an unfinished session, see personal
// bests and recent results. History lives on the device and, for signed-in
// players, is mirrored to their account (practiceService).
export function PracticeHome() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  const [active, setActive] = useState(() => loadActiveSession());
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

  // A two-player session keeps one solo state per player; the owner is first.
  const activeStats = active?.game === 'x01'
    ? computeStats(active.state.kind === 'match' ? active.state.players[0] : active.state)
    : null;
  const activeGame = active ? PRACTICE_GAMES.find(g => g.id === active.game) : null;

  const handleDiscard = () => {
    clearActiveSession();
    setActive(null);
  };

  return (
    <div className="tw mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('practice.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('practice.subtitle')}</p>
        </div>
        {user && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {syncState === 'syncing' && <span className="flex items-center gap-1.5"><RefreshCw className="size-4 animate-spin" /> {t('practice.sync.syncing')}</span>}
            {syncState === 'ok' && <span className="flex items-center gap-1.5 text-primary"><Cloud className="size-4" /> {t('practice.sync.synced')}</span>}
            {syncState === 'error' && <span className="flex items-center gap-1.5 text-destructive"><CloudOff className="size-4" /> {t('practice.sync.failed')}</span>}
            {syncState === 'idle' && !isOnline && <span className="flex items-center gap-1.5"><CloudOff className="size-4" /> {t('practice.sync.offline', { count: pending })}</span>}
            {syncState === 'idle' && isOnline && <span className="flex items-center gap-1.5"><Cloud className="size-4" /> {t('practice.sync.idle')}</span>}
            {syncState !== 'syncing' && isOnline && (
              <Button variant="ghost" size="sm" onClick={runSync}>
                <RefreshCw /> {t('practice.sync.retry')}
              </Button>
            )}
          </div>
        )}
      </div>

      {active && activeGame && (
        <Card className="flex-row flex-wrap items-center gap-4 p-6">
          <div className={ICON_BOX}><activeGame.icon className="size-5" /></div>
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <h2 className="text-base font-semibold">{t('practice.resumeTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(`practice.games.${active.game}.title`)}
              {' · '}
              {describeSession({ game: active.game, settings: active.state.settings }, t)}
              {activeStats && ` · ${t('practice.stats.average')} ${activeStats.average.toFixed(1)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDiscard}>
              <Trash2 /> {t('practice.discard')}
            </Button>
            <Button onClick={() => navigate(activeGame.path)}>
              <Play /> {t('practice.resume')}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PRACTICE_GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            className="relative flex flex-col items-start gap-3 rounded-xl border bg-card p-6 text-left text-card-foreground shadow-sm transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-card"
            disabled={!game.available}
            onClick={() => game.available && navigate(game.path)}
          >
            {!game.available && <Badge variant="secondary" className="absolute right-4 top-4">{t('practice.comingSoon')}</Badge>}
            <div className={ICON_BOX}><game.icon className="size-5" /></div>
            <h3 className="text-base font-semibold">{t(`practice.games.${game.id}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`practice.games.${game.id}.desc`)}</p>
          </button>
        ))}
      </div>

      {!user && history.length > 0 && (
        <Card className="flex-row flex-wrap items-center gap-4 border-dashed p-6 shadow-none">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <h2 className="text-base font-semibold">{t('practice.sync.signInTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('practice.sync.signInText')}</p>
          </div>
          <Button onClick={() => navigate('/login', { state: { from: '/practice' } })}>
            <LogIn /> {t('navigation.login')}
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight">{t('practice.bests.title')}</h2>
            <PracticeBests entries={history} />
          </section>

          <Card className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between py-4">
              <CardTitle>{t('practice.history.recent')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/practice/history')}>
                {t('practice.history.viewAll')} <ChevronRight />
              </Button>
            </CardHeader>
            <div className="divide-y border-t">
              {history.slice(0, RECENT_LIMIT).map((entry) => (
                <SessionRow key={entry.id} entry={entry} t={t} language={language} />
              ))}
            </div>
          </Card>
        </>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {user ? <Cloud className="size-3.5" /> : <Smartphone className="size-3.5" />}
        {' '}{user ? t('practice.sync.note') : t('practice.savedLocally')}
      </p>
    </div>
  );
}

// One finished session in a divide-y list (home + history).
export function SessionRow({ entry, t, language, onDelete }) {
  const game = PRACTICE_GAMES.find(g => g.id === entry.game);
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3">
      <div className={ICON_BOX}>{game && <game.icon className="size-5" />}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{t(`practice.games.${entry.game}.title`)} · {describeSession(entry, t)}</span>
        <span className="text-xs text-muted-foreground">{formatSessionDate(entry.finishedAt, language)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sessionHighlights(entry, t).map(([label, value]) => (
          <Badge key={label} variant="outline" className="gap-1 font-normal text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{value}</span> {label}
          </Badge>
        ))}
      </div>
      {onDelete && (
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => onDelete(entry.id)} title={t('practice.history.delete')} aria-label={t('practice.history.delete')}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

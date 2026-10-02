import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize2, Pause, Play, Trophy, Target, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { BracketVisualization } from './BracketVisualization';
import { EmptyState } from './shared/EmptyState';
import { StatusBadge } from './shared/StatusBadge';
import { mergeBracketRounds, upcomingPlayoffMatches } from '../utils/bracketView';

// TV / wall display for a tournament: no login, no navigation, big type,
// dark high-contrast palette independent of the app theme. Cycles through
// live boards, group standings and the bracket; refreshes on realtime
// changes with a polling fallback.
//
//   /tv/:id                 rotate through every available view
//   /tv/:id?view=standings  pin one view (live | standings | bracket)
//   /tv/:id?rotate=20       seconds per view (default 12)
//   keys: ← → switch view (pauses rotation), space pause/resume, F fullscreen

const DEFAULT_ROTATE_SECONDS = 12;
const POLL_MS = 30000;

const fmtClock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const sameData = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
};

// Interleave per-group queues so every group is represented in "up next"
// (A1, B1, C1, A2, B2, ...) instead of the first group filling the list.
const roundRobin = (queues) => {
  const out = [];
  const max = Math.max(0, ...queues.map((q) => q.length));
  for (let i = 0; i < max; i++) for (const q of queues) if (q[i]) out.push(q[i]);
  return out;
};

// Standings: up to four group cards side by side on a wide screen.
const GROUP_COLS = { 1: '', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' };

// Each view stays mounted (rotation only toggles `hidden`) so scroll positions
// survive. On a large screen inactive views are stacked in the same grid cell
// and hidden with `visibility` — display:none would reset their scroll offsets
// (the bracket "jumping back"). On phones the page scrolls normally and hidden
// views simply collapse.
const VIEW_CLASS = 'min-h-0 lg:col-start-1 lg:row-start-1 lg:h-full lg:[&[hidden]]:pointer-events-none lg:[&[hidden]]:invisible lg:[&[hidden]]:block';

export function TvDisplay() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useLanguage();
  useKeepScreenAwake(true);

  const pinnedView = params.get('view');
  const rotateMs = Math.max(5, Number(params.get('rotate')) || DEFAULT_ROTATE_SECONDS) * 1000;

  const [tournament, setTournament] = useState(null);
  const [liveMatches, setLiveMatches] = useState([]);
  const [error, setError] = useState('');
  const [viewIndex, setViewIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(new Date());
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [full, live] = await Promise.all([
        tournamentService.getTournament(id),
        matchService.getLiveMatches().catch(() => [])
      ]);
      const liveNow = (live || []).filter((m) => m.tournament_id === id && m.status !== 'completed');
      // Realtime + polling refetch every few seconds during a match. Keep the
      // previous object when nothing changed so memos, the bracket layout and
      // its scroll position survive the refresh.
      setTournament((prev) => (sameData(prev, full) ? prev : full));
      setLiveMatches((prev) => (sameData(prev, liveNow) ? prev : liveNow));
      setError('');
    } catch (err) {
      console.error('TV display load failed:', err);
      setError(t('tv.loadError'));
    }
  }, [id, t]);

  // Initial load, realtime-triggered reloads (debounced), polling fallback.
  useEffect(() => {
    load();
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 500);
    };
    const channel = supabase
      .channel(`tv-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` }, schedule)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` }, schedule)
      .subscribe();
    const poll = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(tick);
  }, []);

  // Which views make sense for this tournament right now.
  const views = useMemo(() => {
    if (!tournament) return ['live'];
    const list = ['live'];
    const hasGroups = tournament.tournamentType !== 'playoff_only' && (tournament.groups || []).length > 0;
    const rounds = tournament.playoffs?.rounds || [];
    const hasBracket = rounds.some((r) => (r.matches || []).some((m) => m.player1 || m.player2));
    if (hasGroups) list.push('standings');
    if (hasBracket) list.push('bracket');
    return list;
  }, [tournament]);

  const activeView = pinnedView && views.includes(pinnedView) ? pinnedView : views[viewIndex % views.length];

  useEffect(() => {
    if (pinnedView || paused || views.length < 2) return undefined;
    const rot = setInterval(() => setViewIndex((i) => (i + 1) % views.length), rotateMs);
    return () => clearInterval(rot);
  }, [pinnedView, paused, views.length, rotateMs]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { setViewIndex((i) => (i + 1) % views.length); setPaused(true); }
      else if (e.key === 'ArrowLeft') { setViewIndex((i) => (i - 1 + views.length) % views.length); setPaused(true); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [views.length]);

  const toggleFullscreen = () => {
    const el = rootRef.current || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  // ---- derived data -------------------------------------------------------
  const boards = useMemo(() => [...liveMatches].sort((a, b) => (a.live_board_number || 999) - (b.live_board_number || 999)), [liveMatches]);

  const playoffRows = useMemo(() => (tournament?.playoffMatches || []), [tournament]);

  // Bracket entries with the match rows merged in and next-round slots only
  // filled once the feeding match completed (see utils/bracketView.js).
  const bracketRounds = useMemo(
    () => mergeBracketRounds(tournament?.playoffs?.rounds, playoffRows, tournament?.players),
    [tournament, playoffRows]
  );

  const upNext = useMemo(() => {
    if (!tournament) return [];
    const liveIds = new Set(liveMatches.map((m) => m.id));
    // Anything that is not pending is either live (with or without a paired
    // device) or done — never "up next".
    const ready = (m) => m.status === 'pending' && m.player1 && m.player2 && !liveIds.has(m.id);
    const groupQueues = (tournament.groups || []).map((g) =>
      (g.matches || []).filter(ready).map((m) => ({ id: m.id, label: g.name, p1: m.player1.name, p2: m.player2.name }))
    );
    const playoffItems = upcomingPlayoffMatches(bracketRounds)
      .filter((m) => !liveIds.has(m.id))
      .map((m) => ({ id: m.id, label: m.roundName, p1: m.player1.name, p2: m.player2.name }));
    return [...roundRobin(groupQueues), ...playoffItems].slice(0, 8);
  }, [tournament, liveMatches, bracketRounds]);

  const qualifiersPerGroup = tournament?.playoffSettings?.enabled ? Number(tournament.playoffSettings.qualifiersPerGroup || tournament.playoffSettings.playersPerGroup || 0) : 0;

  // ---- render -------------------------------------------------------------
  const renderPlayerRow = (name, legs, score, isThrowing) => (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 rounded-md border-l-4 border-transparent px-4 py-2',
        isThrowing && 'border-primary bg-muted/40'
      )}
    >
      <span className="truncate text-3xl font-semibold">{name}</span>
      <span className="min-w-[2.5em] rounded-full bg-muted px-3 py-1 text-center text-xl font-semibold tabular-nums text-muted-foreground">{legs}</span>
      <span className="min-w-[3ch] text-right text-8xl font-semibold leading-none tracking-tight tabular-nums">{score}</span>
    </div>
  );

  const renderLive = () => (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Target className="size-5" />{t('tv.liveBoards')}
        </h2>
        {boards.length === 0 ? (
          <EmptyState icon={Target} title={t('tv.noLiveMatches')} />
        ) : (
          <div className={cn('grid gap-4', boards.length > 1 && 'xl:grid-cols-2')}>
            {boards.map((m) => {
              const p1 = m.player1?.name || '—';
              const p2 = m.player2?.name || '—';
              const turn = m.current_player;
              return (
                <Card key={m.id} className="gap-3 py-4">
                  <CardHeader className="flex items-center justify-between gap-3 px-4">
                    <span className="font-mono text-sm font-semibold uppercase tracking-wider text-primary">
                      {m.live_board_number ? `${t('deviceSettings.board')} ${m.live_board_number}` : (m.live_device_name || t('tv.board'))}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('tv.leg')} {m.current_leg || 1} · {t('management.firstTo')} {m.legs_to_win || 3}</span>
                    <Badge className="bg-destructive text-white">{t('liveMatches.live')}</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1 px-4">
                    {renderPlayerRow(p1, m.player1_legs ?? 0, m.player1_current_score ?? m.starting_score ?? 501, turn === 0)}
                    {renderPlayerRow(p2, m.player2_legs ?? 0, m.player2_current_score ?? m.starting_score ?? 501, turn === 1)}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      <Card className="shrink-0 gap-3 py-4 lg:w-96">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="size-4" />{t('tv.upNext')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {upNext.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('tv.nothingQueued')}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {upNext.map((m) => (
                <li key={m.id} className="flex flex-col gap-0.5 py-2.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  <span className="text-lg font-semibold">{m.p1} <span className="mx-1 font-normal text-muted-foreground">vs</span> {m.p2}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderStandings = () => (
    <div className={cn('grid content-start gap-4', GROUP_COLS[Math.min((tournament.groups || []).length, 4)])}>
      {(tournament.groups || []).map((g) => {
        const rows = g.standings || [];
        return (
          <Card key={g.id} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{g.name}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <Table className="text-lg">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-muted-foreground">#</TableHead>
                    <TableHead className="text-muted-foreground">{t('management.player')}</TableHead>
                    <TableHead className="text-right text-muted-foreground">{t('management.played')}</TableHead>
                    <TableHead className="text-right text-muted-foreground">{t('management.won')}</TableHead>
                    <TableHead className="text-right text-muted-foreground">{t('management.legsWL')}</TableHead>
                    <TableHead className="text-right text-muted-foreground">{t('management.legsDiff')}</TableHead>
                    <TableHead className="text-right text-muted-foreground">{t('management.avg')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">{t('management.noMatchesPlayedYet')}</TableCell></TableRow>
                  ) : rows.map((s, i) => {
                    const diff = (s.legsWon || 0) - (s.legsLost || 0);
                    const qualifies = qualifiersPerGroup > 0 && i < qualifiersPerGroup;
                    return (
                      <TableRow key={s.player.id}>
                        <TableCell className={cn('font-semibold tabular-nums text-muted-foreground', qualifies && 'text-primary')}>{i + 1}</TableCell>
                        <TableCell className="max-w-[40vw] truncate font-semibold">
                          {s.player.name}
                          {qualifies && <span className="ml-2 inline-block size-1.5 rounded-full bg-primary align-middle" />}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.matchesPlayed}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.matchesWon}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.legsWon}:{s.legsLost}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', diff >= 0 ? 'text-primary' : 'text-destructive')}>{diff > 0 ? '+' : ''}{diff}</TableCell>
                        <TableCell className="text-right tabular-nums">{(s.average || 0).toFixed(1)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const renderBracket = () => (
    <div className="h-full overflow-auto">
      <BracketVisualization rounds={bracketRounds} playoffMatches={playoffRows} scale={1.6} />
    </div>
  );

  const viewLabel = { live: t('tv.liveBoards'), standings: t('management.standings'), bracket: t('management.playoffs') };

  return (
    <div className="tw dark-mode flex min-h-screen flex-col bg-background text-foreground lg:fixed lg:inset-0 lg:overflow-hidden [&:fullscreen]:cursor-none" ref={rootRef}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-3 lg:h-20 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="size-7 shrink-0 text-primary" />
          <h1 className="truncate text-3xl font-semibold">{tournament?.name || '…'}</h1>
          {tournament && <StatusBadge status={tournament.status} t={t} className="shrink-0" />}
        </div>
        <Tabs
          value={activeView}
          onValueChange={(v) => { setViewIndex(views.indexOf(v)); setPaused(true); }}
          className="order-3 w-full items-center lg:order-none lg:w-auto"
          aria-label={t('tv.views')}
        >
          <TabsList>
            {views.map((v) => (
              <TabsTrigger key={v} value={v}>{viewLabel[v]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold tabular-nums text-muted-foreground">{fmtClock(now)}</span>
          {!pinnedView && views.length > 1 && (
            <Button variant="ghost" size="icon-lg" onClick={() => setPaused((p) => !p)} title={paused ? t('tv.resume') : t('tv.pause')} aria-label={paused ? t('tv.resume') : t('tv.pause')}>
              {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" onClick={toggleFullscreen} title={t('tv.fullscreen')} aria-label={t('tv.fullscreen')}>
            <Maximize2 className="size-5" />
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 p-6 lg:grid lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {error && <p className="py-8 text-center text-xl text-destructive lg:col-start-1 lg:row-start-1 lg:self-start">{error}</p>}
        {!tournament && !error && <p className="py-8 text-center text-xl text-muted-foreground lg:col-start-1 lg:row-start-1 lg:self-start">{t('common.loading')}</p>}
        {tournament && views.map((v) => (
          <div key={v} className={cn(VIEW_CLASS, v === 'standings' && 'lg:overflow-auto')} hidden={v !== activeView}>
            {v === 'live' && renderLive()}
            {v === 'standings' && renderStandings()}
            {v === 'bracket' && renderBracket()}
          </div>
        ))}
      </main>

      <footer className="flex h-12 items-center justify-between border-t px-6 text-sm text-muted-foreground">
        <span>dartlead.app</span>
        <span>
          {pinnedView
            ? t('tv.pinned')
            : paused
              ? t('tv.paused')
              : views.length > 1
                ? t('tv.rotating', { seconds: rotateMs / 1000 })
                : ''}
        </span>
      </footer>
    </div>
  );
}

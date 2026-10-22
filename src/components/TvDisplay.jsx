import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize2, Pause, Play, Trophy, Target, Clock, Flame } from 'lucide-react';
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
import { matchWinProbability } from '../lib/winProbability';
import { liveMatchChance } from '../lib/legChance';
import { biggestUpset, firstResultAt, formatChance } from '../utils/upsets';
import checkoutData from '../data/checkouts.json';
import { LastVisitChip } from './tournament/LiveMatchesTab';
import { useLastVisits } from '@/hooks/useLastVisits';
import { usePlayerHistories, usePlayerStrengths, strengthsOf } from '@/hooks/usePlayerStrengths';
import { PreMatchCard } from './match/PreMatchCard';
import { CricketBoard } from './cricket/CricketBoard';
import { CricketMarksTable } from './cricket/CricketMarksTable';
import { isCricketGame } from '../lib/cricket';

// TV / wall display for a tournament: no login, no navigation, big type,
// dark high-contrast palette independent of the app theme. Cycles through
// live boards, group standings and the bracket; refreshes on realtime
// changes with a polling fallback.
//
//   /tv/:id                 rotate through every available view
//   /tv/:id?view=standings  pin one view (live | standings | bracket)
//   /tv/:id?rotate=20       seconds per view (default 12)
//   keys: ← → switch view (holds it for a minute), space pause/resume, F fullscreen

const DEFAULT_ROTATE_SECONDS = 12;
// Picking a view by hand holds it this long, then rotation resumes on its own:
// a wall screen nobody touches again must never stay stuck on one view.
const MANUAL_HOLD_MS = 60000;
const MAX_BRACKET_SCALE = 1.6;
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
  const [holdUntil, setHoldUntil] = useState(0);
  const [now, setNow] = useState(new Date());
  const [bracketScale, setBracketScale] = useState(MAX_BRACKET_SCALE);
  const rootRef = useRef(null);
  const bracketBoxRef = useRef(null);

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

  const toggleFullscreen = () => {
    const el = rootRef.current || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  // ---- derived data -------------------------------------------------------
  const boards = useMemo(() => [...liveMatches].sort((a, b) => (a.live_board_number || 999) - (b.live_board_number || 999)), [liveMatches]);
  const lastVisits = useLastVisits(liveMatches);

  const playoffRows = useMemo(() => (tournament?.playoffMatches || []), [tournament]);

  // Bracket entries with the match rows merged in and next-round slots only
  // filled once the feeding match completed (see utils/bracketView.js).
  const bracketRounds = useMemo(
    () => mergeBracketRounds(tournament?.playoffs?.rounds, playoffRows, tournament?.players),
    [tournament, playoffRows]
  );

  // Which views make sense for this tournament right now. The bracket counts
  // once any slot has a player, in the JSONB or in the playoff match rows.
  const views = useMemo(() => {
    if (!tournament) return ['live'];
    const list = ['live'];
    const hasGroups = tournament.tournamentType !== 'playoff_only' && (tournament.groups || []).length > 0;
    const hasBracket = bracketRounds.some((r) => r.matches.some((m) => m.player1 || m.player2));
    if (hasGroups) list.push('standings');
    if (hasBracket) list.push('bracket');
    return list;
  }, [tournament, bracketRounds]);

  const activeView = pinnedView && views.includes(pinnedView) ? pinnedView : views[viewIndex % views.length];

  // One timer per shown view: the next view comes after rotateMs, or after the
  // manual hold ran out.
  useEffect(() => {
    if (pinnedView || paused || views.length < 2) return undefined;
    const delay = Math.max(rotateMs, holdUntil - Date.now());
    const timer = setTimeout(() => setViewIndex((i) => (i + 1) % views.length), delay);
    return () => clearTimeout(timer);
  }, [pinnedView, paused, views.length, rotateMs, viewIndex, holdUntil]);

  const showView = useCallback((index) => {
    setViewIndex((index + views.length) % views.length);
    setHoldUntil(Date.now() + MANUAL_HOLD_MS);
  }, [views.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') showView(viewIndex + 1);
      else if (e.key === 'ArrowLeft') showView(viewIndex - 1);
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showView, viewIndex]);

  // Player strengths from all their matches, for the win chances on the boards
  // and the queue. Reloaded when a match of this tournament completes.
  const completedCount = useMemo(
    () => (tournament?.groups || []).reduce((n, g) => n + (g.matches || []).filter((m) => m.status === 'completed').length, 0)
      + playoffRows.filter((m) => m.status === 'completed').length,
    [tournament, playoffRows]
  );
  // Win chance, form rating and upsets are X01 numbers: none of them for Cricket.
  const isCricketTournament = isCricketGame(tournament?.gameType);
  const tournamentPlayerIds = useMemo(() => (tournament?.players || []).map((p) => p.id), [tournament?.players]);
  const histories = usePlayerHistories(tournamentPlayerIds, completedCount);
  const avgById = useMemo(() => strengthsOf(histories), [histories]);
  // Upset of the night, rated on form from before the first result.
  const completedMatches = useMemo(
    () => [...(tournament?.groups || []).flatMap((g) => g.matches || []), ...playoffRows].filter((m) => m.status === 'completed'),
    [tournament, playoffRows]
  );
  const strengthsBefore = usePlayerStrengths(tournamentPlayerIds, 0, firstResultAt(completedMatches));
  const upset = useMemo(
    () => (isCricketTournament ? null : biggestUpset(completedMatches, strengthsBefore)),
    [isCricketTournament, completedMatches, strengthsBefore]
  );
  const winChance = useCallback(
    (m, legsA = 0, legsB = 0) => (isCricketTournament ? null
      : matchWinProbability(avgById[m.player1?.id], avgById[m.player2?.id], { legsToWin: m.legs_to_win || m.legsToWin || 3, legsA, legsB })),
    [avgById, isCricketTournament]
  );

  const upNext = useMemo(() => {
    if (!tournament) return [];
    const liveIds = new Set(liveMatches.map((m) => m.id));
    // Anything that is not pending is either live (with or without a paired
    // device) or done — never "up next".
    const ready = (m) => m.status === 'pending' && m.player1 && m.player2 && !liveIds.has(m.id);
    const groupQueues = (tournament.groups || []).map((g) =>
      (g.matches || []).filter(ready).map((m) => ({ id: m.id, label: g.name, p1: m.player1.name, p2: m.player2.name, player1: m.player1, player2: m.player2, legsToWin: m.legsToWin || m.legs_to_win || 3, chance: winChance(m) }))
    );
    const playoffItems = upcomingPlayoffMatches(bracketRounds)
      .filter((m) => !liveIds.has(m.id))
      .map((m) => ({ id: m.id, label: m.roundName, p1: m.player1.name, p2: m.player2.name, player1: m.player1, player2: m.player2, legsToWin: m.legsToWin || m.legs_to_win || 3, chance: winChance(m) }));
    return [...roundRobin(groupQueues), ...playoffItems].slice(0, 8);
  }, [tournament, liveMatches, bracketRounds, winChance]);

  const qualifiersPerGroup = tournament?.playoffSettings?.enabled ? Number(tournament.playoffSettings.qualifiersPerGroup || tournament.playoffSettings.playersPerGroup || 0) : 0;

  const liveScores = useMemo(
    () => Object.fromEntries(liveMatches.map((m) => [m.id, { player1Legs: m.player1_legs ?? 0, player2Legs: m.player2_legs ?? 0 }])),
    [liveMatches]
  );

  // A wall screen cannot scroll: shrink the bracket until every round fits the
  // view. Sizes scale linearly with `scale`, so one measurement gives the
  // factor. Only where the view has a fixed height (lg+); phones scroll.
  useEffect(() => {
    const box = bracketBoxRef.current;
    if (!box) return undefined;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bracket = box.firstElementChild;
        const columns = bracket?.firstElementChild;
        if (!bracket || !columns || !box.clientHeight || !window.matchMedia('(min-width: 1024px)').matches) return;
        setBracketScale((s) => {
          const k = Math.min(box.clientWidth / columns.scrollWidth, box.clientHeight / bracket.scrollHeight);
          // Shrink on any overflow, grow only with real room; the 3% margin
          // absorbs the paddings that do not scale, so it settles in one step.
          if (k >= 1 && k <= 1.05) return s;
          const next = Math.min(MAX_BRACKET_SCALE, s * k * 0.97);
          return Math.abs(next - s) > 0.01 ? next : s;
        });
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [bracketRounds, views]);

  // ---- render -------------------------------------------------------------
  // More than four boards don't fit two-up on a 1080p screen: go three-up and smaller.
  const isCompact = boards.length > 4;
  const renderPlayerRow = (name, legs, score, isThrowing, visit) => (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-md border-l-4 border-transparent px-4',
        isCompact ? 'gap-4 py-1' : 'gap-6 py-2',
        isThrowing && 'border-primary bg-muted/40'
      )}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span className={cn('truncate font-semibold', isCompact ? 'text-2xl' : 'text-3xl')}>{name}</span>
        <LastVisitChip visit={visit} t={t} className={isCompact ? 'text-3xl' : 'text-4xl'} />
      </span>
      <span className="min-w-[2.5em] rounded-full bg-muted px-3 py-1 text-center font-display text-2xl font-semibold text-muted-foreground">{legs}</span>
      <span className={cn('min-w-[3ch] text-right font-display font-semibold leading-none', isCompact ? 'text-7xl' : 'text-8xl')}>{score}</span>
    </div>
  );

  // Mirrored bar: left share in primary, right in amber, same as head-to-head.
  const renderWinChance = (p) => p === null || p === undefined ? null : (
    <div className="mt-1 flex items-center gap-3 px-4 text-sm text-muted-foreground">
      <span className="w-10 tabular-nums">{Math.round(p * 100)}%</span>
      <span className="flex h-1.5 flex-1 gap-1">
        <span className="rounded-full bg-primary" style={{ flex: Math.max(p, 0.02) }} />
        <span className="rounded-full bg-amber-500" style={{ flex: Math.max(1 - p, 0.02) }} />
      </span>
      <span className="w-10 text-right tabular-nums">{Math.round((1 - p) * 100)}%</span>
      <span className="text-xs uppercase tracking-wider">{t('tv.winChance')}</span>
    </div>
  );

  const renderBoardHeader = (m) => (
    <CardHeader className="flex items-center justify-between gap-3 px-4">
      <span className="font-mono text-sm font-semibold uppercase tracking-wider text-primary">
        {m.live_board_number ? `${t('deviceSettings.board')} ${m.live_board_number}` : (m.live_device_name || t('tv.board'))}
      </span>
      <span className="text-sm text-muted-foreground">{t('tv.leg')} {m.current_leg || 1} · {t('management.firstTo')} {m.legs_to_win || 3}</span>
      <Badge className="bg-destructive text-white">{t('liveMatches.live')}</Badge>
    </CardHeader>
  );

  // Cricket: the scoreboard (points, legs, marks); a lone board also gets the
  // dartboard from the thrower's side with the darts of the visit in progress.
  const renderCricketBoard = (m, p1, p2) => {
    const marks = m.live_state?.marks;
    return (
      <Card key={m.id} className="gap-3 py-4">
        {renderBoardHeader(m)}
        <CardContent className="flex items-center gap-8 px-4">
          <CricketMarksTable
            size={boards.length <= 2 ? 'tv' : 'md'}
            players={[
              { name: p1, points: m.player1_current_score ?? 0, legs: m.player1_legs ?? 0 },
              { name: p2, points: m.player2_current_score ?? 0, legs: m.player2_legs ?? 0 }
            ]}
            marks={marks}
            thrower={m.current_player}
            className="min-w-0 flex-1"
          />
          {boards.length === 1 && (
            <CricketBoard marks={marks} thrower={m.current_player ?? 0} visitDarts={m.live_state?.visit} className="hidden w-[34rem] shrink-0 xl:block" />
          )}
        </CardContent>
      </Card>
    );
  };

  const renderLive = () => (
    <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Target className="size-5" />{t('tv.liveBoards')}
        </h2>
        {boards.length === 0 ? (
          <EmptyState icon={Target} title={t('tv.noLiveMatches')} />
        ) : (
          <div className={cn('grid gap-4', boards.length > 1 && 'xl:grid-cols-2', isCompact && 'xl:grid-cols-3')}>
            {boards.map((m) => {
              const p1 = m.player1?.name || '—';
              const p2 = m.player2?.name || '—';
              const turn = m.current_player;
              if (isCricketGame(m.game_type)) return renderCricketBoard(m, p1, p2);
              return (
                <Card key={m.id} className="gap-3 py-4">
                  {renderBoardHeader(m)}
                  <CardContent className="flex flex-col gap-1 px-4">
                    {renderPlayerRow(p1, m.player1_legs ?? 0, m.player1_current_score ?? m.starting_score ?? 501, turn === 0, lastVisits[m.id]?.player === 0 ? lastVisits[m.id] : null)}
                    {renderPlayerRow(p2, m.player2_legs ?? 0, m.player2_current_score ?? m.starting_score ?? 501, turn === 1, lastVisits[m.id]?.player === 1 ? lastVisits[m.id] : null)}
                    {renderWinChance(liveMatchChance({
                      strengths: [avgById[m.player1?.id], avgById[m.player2?.id]],
                      legsToWin: m.legs_to_win || 3,
                      legs: [m.player1_legs ?? 0, m.player2_legs ?? 0],
                      remaining: [m.player1_current_score ?? m.starting_score ?? 501, m.player2_current_score ?? m.starting_score ?? 501],
                      thrower: m.current_player,
                      startingScore: m.starting_score ?? 501,
                      checkouts: checkoutData
                    }))}
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
              {upNext.map((m, i) => (i === 0 && (avgById[m.player1?.id] || avgById[m.player2?.id]) ? (
                <li key={m.id} className="flex flex-col gap-2 pb-4 pt-2.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  <PreMatchCard player1={m.player1} player2={m.player2} legsToWin={m.legsToWin} gameType={tournament.gameType} histories={histories} size="tv" />
                </li>
              ) : (
                <li key={m.id} className="flex flex-col gap-0.5 py-2.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  <span className="text-lg font-semibold">{m.p1} <span className="mx-1 font-normal text-muted-foreground">vs</span> {m.p2}</span>
                  {m.chance != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(m.chance * 100)}% · {Math.round((1 - m.chance) * 100)}%</span>
                  )}
                </li>
              )))}
            </ul>
          )}
        </CardContent>
        {upset && (
          <CardContent className="border-t px-4 pt-4">
            <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <Flame className="size-4 text-live" />{t('tv.upsetOfTheNight')}
            </span>
            <span className="mt-1 block text-lg font-semibold">
              {upset.winner?.name} <span className="mx-1 font-display tabular-nums">{upset.score}</span> {upset.loser?.name}
            </span>
            <span className="text-sm text-muted-foreground">{t('tv.upsetChance', { pct: formatChance(upset.chance) })}</span>
          </CardContent>
        )}
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
                    <TableHead className="text-right text-muted-foreground">{isCricketTournament ? t('common.mpr') : t('management.avg')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">{t('management.noMatchesPlayedYet')}</TableCell></TableRow>
                  ) : rows.map((s, i) => {
                    const diff = (s.legsWon || 0) - (s.legsLost || 0);
                    const qualifies = qualifiersPerGroup > 0 && i < qualifiersPerGroup;
                    return (
                      <TableRow key={s.player.id} className={cn(qualifies && 'bg-primary/15 shadow-[inset_4px_0_0_var(--primary)] hover:bg-primary/15')}>
                        <TableCell className={cn('font-display text-xl font-semibold text-muted-foreground', qualifies && 'text-primary')}>{i + 1}</TableCell>
                        {/* The name takes whatever width the stats leave and
                            truncates; with a fixed max width a long name pushed
                            the stats out of the card (seen with four groups). */}
                        <TableCell className="w-full max-w-0 truncate font-semibold">{s.player.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.matchesPlayed}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.matchesWon}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.legsWon}:{s.legsLost}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', diff >= 0 ? 'text-primary' : 'text-destructive')}>{diff > 0 ? '+' : ''}{diff}</TableCell>
                        <TableCell className="text-right tabular-nums">{(s.average || 0).toFixed(isCricketTournament ? 2 : 1)}</TableCell>
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
    <div className="h-full overflow-auto" ref={bracketBoxRef}>
      <BracketVisualization rounds={bracketRounds} playoffMatches={playoffRows} scale={bracketScale} liveScores={liveScores} />
    </div>
  );

  const viewLabel = { live: t('tv.liveBoards'), standings: t('management.standings'), bracket: t('management.playoffs') };

  return (
    <div className="dark-mode flex min-h-screen flex-col bg-background text-foreground lg:fixed lg:inset-0 lg:overflow-hidden [&:fullscreen]:cursor-none" ref={rootRef}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-3 lg:h-20 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="size-7 shrink-0 text-primary" />
          <h1 className="truncate text-3xl font-semibold">{tournament?.name || '…'}</h1>
          {tournament && <StatusBadge status={tournament.status} t={t} className="shrink-0" />}
        </div>
        <Tabs
          value={activeView}
          onValueChange={(v) => showView(views.indexOf(v))}
          activationMode="manual"
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
          <span className="font-display text-3xl font-semibold text-muted-foreground">{fmtClock(now)}</span>
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

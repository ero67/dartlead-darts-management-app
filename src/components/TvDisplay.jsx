import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize2, Pause, Play, Trophy, Target, Flame, Crown, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BracketVisualization } from './BracketVisualization';
import { EmptyState } from './shared/EmptyState';
import { LeagueLogo } from './shared/LeagueLogo';
import { mergeBracketRounds, upcomingPlayoffMatches } from '../utils/bracketView';
import { roundLabel } from '../utils/playoffRoundName';
import { boardQueues } from '../utils/boardSchedule';
import { getQualifyingPlayers } from '../utils/qualifiers';
import { liveMatchChance } from '../lib/legChance';
import { biggestUpset, firstResultAt, formatChance } from '../utils/upsets';
import { tvStage, currentRound, podium, scenesFor, boardNumberOf } from '../utils/tvStage';
import checkoutData from '../data/checkouts.json';
import { LastVisitChip } from './tournament/LiveMatchesTab';
import { useLastVisits } from '@/hooks/useLastVisits';
import { useTvMoments } from '@/hooks/useTvMoments';
import { usePlayerHistories, usePlayerStrengths, strengthsOf } from '@/hooks/usePlayerStrengths';
import { CricketBoard } from './cricket/CricketBoard';
import { CricketMarksTable } from './cricket/CricketMarksTable';
import { isCricketGame } from '../lib/cricket';
import { x01Leaderboards } from '../utils/tournamentStats';
import { PartnerStrip } from './shared/PartnerStrip';

// TV / wall display for a tournament: no login, no navigation, read from
// across the room. The screen follows the stage of the night (utils/tvStage):
// before the start the players, during groups the live boards and standings,
// in the playoffs the bracket, at the end the podium. A rail at the bottom
// always says who plays next on which board; a 180, a ton-plus checkout or a
// match won takes over the screen for a few seconds.
//
//   /tv/:id                     follow the stage
//   /tv/:id?view=standings      pin one scene (welcome | live | standings | bracket | stats | champion)
//   /tv/:id?rotate=20           seconds per scene (default 12)
//   /tv/:id?preview=moments     show sample takeovers (setup / demo)
//   keys: ← → switch scene (holds it for a minute), space pause/resume, F fullscreen

const DEFAULT_ROTATE_SECONDS = 12;
// Picking a scene by hand holds it this long, then rotation resumes on its own:
// a wall screen nobody touches again must never stay stuck on one scene.
const MANUAL_HOLD_MS = 60000;
const MAX_BRACKET_SCALE = 2.6;
const POLL_MS = 30000;
// No successful load for this long and the header says the screen is offline.
const STALE_MS = 75000;
// The `tv` variant in tailwind.css: where the fixed wall layout (and root-font scaling) applies.
const TV_QUERY = '(orientation: landscape) and (min-width: 900px) and (min-height: 500px)';

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

// Scenes stay mounted (rotation toggles `hidden`) so scroll positions and the
// bracket fit survive. On a TV they sit in one grid cell and cross-fade; on a
// phone the page scrolls and hidden scenes collapse.
const SCENE_CLASS = 'min-h-0 transition-opacity duration-700 motion-reduce:transition-none tv:col-start-1 tv:row-start-1 tv:h-full tv:[&[hidden]]:block tv:[&[hidden]]:pointer-events-none tv:[&[hidden]]:opacity-0';

// Live board sizes by how many boards share the screen (TV only; phones get
// the base sizes).
const BOARD_SIZE = {
  xl: { name: 'tv:text-[4rem]', score: 'tv:text-[13rem]', legs: 'tv:text-[3rem]', plate: 'tv:text-[3.5rem]', meta: 'tv:text-[1.75rem]', row: 'tv:gap-8 tv:px-6 tv:py-4', chip: 'tv:text-[4rem]', chance: 'tv:text-[1.5rem]' },
  lg: { name: 'tv:text-[3rem]', score: 'tv:text-[9rem]', legs: 'tv:text-[2.25rem]', plate: 'tv:text-[3rem]', meta: 'tv:text-[1.5rem]', row: 'tv:gap-6 tv:px-5 tv:py-3', chip: 'tv:text-[3rem]', chance: 'tv:text-[1.375rem]' },
  md: { name: 'tv:text-[2.25rem]', score: 'tv:text-[6.5rem]', legs: 'tv:text-[1.75rem]', plate: 'tv:text-[2.5rem]', meta: 'tv:text-[1.375rem]', row: 'tv:gap-5 tv:px-4 tv:py-2', chip: 'tv:text-[2.5rem]', chance: 'tv:text-[1.25rem]' },
  sm: { name: 'tv:text-[1.75rem]', score: 'tv:text-[4.5rem]', legs: 'tv:text-[1.375rem]', plate: 'tv:text-[2rem]', meta: 'tv:text-[1.125rem]', row: 'tv:gap-4 tv:px-3 tv:py-1', chip: 'tv:text-[2rem]', chance: 'tv:text-[1.125rem]' }
};

// Podium steps: gold / silver / bronze as on the rank medals.
const STEP_CLASS = {
  1: 'h-40 bg-amber-400 text-amber-950 tv:h-[52%] tv:text-[9rem]',
  2: 'h-28 bg-zinc-300 text-zinc-900 tv:h-[36%] tv:text-[7rem]',
  3: 'h-20 bg-orange-700 text-white tv:h-[24%] tv:text-[6rem]'
};

// The board number as a plate: the first thing to read on a card and in the rail.
function BoardPlate({ n, t, className }) {
  return (
    <span className={cn('inline-flex shrink-0 items-baseline gap-[0.25em] rounded-lg bg-primary px-[0.35em] py-[0.15em] font-display text-2xl font-semibold leading-none text-primary-foreground', className)}>
      <span className="text-[0.45em] uppercase tracking-wider">{t('tv.board')}</span>
      <span>{n ?? '–'}</span>
    </span>
  );
}

export function TvDisplay() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useLanguage();
  useKeepScreenAwake(true);

  // Scale the rem-based layout to the screen; only while this page is shown.
  useEffect(() => {
    document.documentElement.classList.add('tv-scale');
    return () => document.documentElement.classList.remove('tv-scale');
  }, []);

  const pinnedScene = params.get('view');
  const previewMoments = params.get('preview') === 'moments';
  const rotateMs = Math.max(5, Number(params.get('rotate')) || DEFAULT_ROTATE_SECONDS) * 1000;

  const [tournament, setTournament] = useState(null);
  const [liveMatches, setLiveMatches] = useState([]);
  const [error, setError] = useState(false);
  const [lastOkAt, setLastOkAt] = useState(0);
  const [viewIndex, setViewIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holdUntil, setHoldUntil] = useState(0);
  const [now, setNow] = useState(new Date());
  const [bracketScale, setBracketScale] = useState(MAX_BRACKET_SCALE);
  const [isAwake, setIsAwake] = useState(false);
  const rootRef = useRef(null);
  const bracketBoxRef = useRef(null);
  const liveIdsRef = useRef(new Set());
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    // Realtime, polling and reconnects can overlap: only the newest load may land.
    const seq = ++loadSeqRef.current;
    try {
      const [full, live] = await Promise.all([
        tournamentService.getTournament(id),
        matchService.getLiveMatches({ tournamentId: id }).catch(() => [])
      ]);
      if (seq !== loadSeqRef.current) return;
      const liveNow = (live || []).filter((m) => m.status !== 'completed');
      liveIdsRef.current = new Set(liveNow.map((m) => m.id));
      // Keep the previous object when nothing changed so memos, the bracket
      // layout and its scroll position survive the refresh.
      setTournament((prev) => (sameData(prev, full) ? prev : full));
      setLiveMatches((prev) => (sameData(prev, liveNow) ? prev : liveNow));
      setError(false);
      setLastOkAt(Date.now());
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      console.error('TV display load failed:', err);
      setError(true);
    }
  }, [id]);

  // Initial load, realtime-triggered reloads (debounced), polling fallback,
  // and a catch-up after the connection or the screen comes back.
  useEffect(() => {
    load();
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 500);
    };
    // A turn on a board already shown only changes that row: patch it in place.
    // Anything else (new live match, completion, released board) can move
    // standings or the bracket, so it reloads the tournament.
    const onMatchChange = (payload) => {
      const row = payload.new;
      if (payload.eventType === 'UPDATE' && row?.status === 'in_progress' && row.live_device_id && liveIdsRef.current.has(row.id)) {
        setLiveMatches((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
        return;
      }
      schedule();
    };
    const channel = supabase
      .channel(`tv-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` }, onMatchChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` }, schedule)
      // Events missed while the socket was down only arrive with the next
      // load: fetch once it is subscribed again.
      .subscribe((status) => { if (status === 'SUBSCRIBED') schedule(); });
    const poll = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', load);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', load);
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(tick);
  }, []);

  // Controls only appear while a mouse moves: nothing on the wall but the night.
  useEffect(() => {
    if (!isAwake) return undefined;
    const timer = setTimeout(() => setIsAwake(false), 3000);
    return () => clearTimeout(timer);
  }, [isAwake]);

  const toggleFullscreen = () => {
    const el = rootRef.current || document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  // ---- derived data -------------------------------------------------------
  const boards = useMemo(() => [...liveMatches].sort((a, b) => (boardNumberOf(a) || 999) - (boardNumberOf(b) || 999)), [liveMatches]);
  const lastVisits = useLastVisits(liveMatches);
  const playoffRows = useMemo(() => (tournament?.playoffMatches || []), [tournament]);

  // Bracket entries with the match rows merged in and next-round slots only
  // filled once the feeding match completed (see utils/bracketView.js).
  const bracketRounds = useMemo(
    () => mergeBracketRounds(
      // Round names in the viewer's language (the stored name is the creator's).
      tournament?.playoffs?.rounds?.map((round) => ({ ...round, name: roundLabel(round, t) })),
      playoffRows,
      tournament?.players
    ),
    [tournament, playoffRows, t]
  );

  // Top-5 boards for the stats scene, one row per player (same numbers as the
  // Statistics tab). X01 only: none of the four stats applies to Cricket.
  const statBoards = useMemo(() => {
    if (!tournament || isCricketGame(tournament.gameType)) return [];
    const matches = [...(tournament.groups || []).flatMap((g) => g.matches || []), ...playoffRows];
    const lb = x01Leaderboards(matches, { unknownName: t('common.unknown'), limit: 5 });
    return [
      { key: 'checkout', title: t('tv.statCheckout'), rows: lb.bestCheckouts.map((e) => ({ player: e.player, value: e.checkouts[0] })) },
      { key: 'average', title: t('tv.statAverage'), rows: lb.bestAverages.map((e) => ({ player: e.player, value: e.average.toFixed(1) })) },
      { key: '180s', title: t('tv.stat180s'), rows: lb.highScores.filter((e) => e.bands[180] > 0).map((e) => ({ player: e.player, value: e.bands[180] })) },
      { key: 'darts', title: t('tv.statFewestDarts'), rows: lb.fewestDarts.map((e) => ({ player: e.player, value: e.darts })) },
    ];
  }, [tournament, playoffRows, t]);
  const hasStats = statBoards.some((b) => b.rows.length > 0);

  const stage = tvStage(tournament, bracketRounds);
  const hasGroups = !!tournament && tournament.tournamentType !== 'playoff_only' && (tournament.groups || []).length > 0;
  const hasBracket = bracketRounds.some((r) => r.matches.some((m) => m.player1 || m.player2));
  const scenes = useMemo(
    () => scenesFor(stage, { live: boards.length > 0, standings: hasGroups, bracket: hasBracket, stats: hasStats }),
    [stage, boards.length, hasGroups, hasBracket, hasStats]
  );
  const activeScene = pinnedScene && scenes.includes(pinnedScene) ? pinnedScene : scenes[viewIndex % scenes.length];

  // Win chance, form and upsets are X01 numbers: none of them for Cricket.
  const isCricketTournament = isCricketGame(tournament?.gameType);
  const completedMatches = useMemo(
    () => [...(tournament?.groups || []).flatMap((g) => g.matches || []), ...playoffRows].filter((m) => m.status === 'completed'),
    [tournament, playoffRows]
  );
  const completedById = useMemo(() => new Map(completedMatches.map((m) => [m.id, m])), [completedMatches]);
  const { current: moment, push: pushMoment } = useTvMoments(liveMatches, completedById);

  // One timer per shown scene: the next comes after rotateMs, or after the
  // manual hold ran out. A takeover holds the rotation while it is up.
  useEffect(() => {
    if (pinnedScene || paused || moment || scenes.length < 2) return undefined;
    const delay = Math.max(rotateMs, holdUntil - Date.now());
    const timer = setTimeout(() => setViewIndex((i) => (i + 1) % scenes.length), delay);
    return () => clearTimeout(timer);
  }, [pinnedScene, paused, moment, scenes.length, rotateMs, viewIndex, holdUntil]);

  const showScene = useCallback((index) => {
    setViewIndex((index + scenes.length) % scenes.length);
    setHoldUntil(Date.now() + MANUAL_HOLD_MS);
  }, [scenes.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') showScene(viewIndex + 1);
      else if (e.key === 'ArrowLeft') showScene(viewIndex - 1);
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showScene, viewIndex]);

  // Player strengths from all their matches, for the live win chances.
  // Reloaded when a match of this tournament completes.
  const tournamentPlayerIds = useMemo(() => (tournament?.players || []).map((p) => p.id), [tournament?.players]);
  const histories = usePlayerHistories(tournamentPlayerIds, completedMatches.length);
  const avgById = useMemo(() => strengthsOf(histories), [histories]);
  // Upset of the night, rated on form from before the first result.
  const strengthsBefore = usePlayerStrengths(tournamentPlayerIds, 0, firstResultAt(completedMatches));
  const upset = useMemo(
    () => (isCricketTournament ? null : biggestUpset(completedMatches, strengthsBefore)),
    [isCricketTournament, completedMatches, strengthsBefore]
  );

  // The live win chance simulates legs, which is far too slow to redo on every
  // render (clock, rotation, chips) for every board: cache by board state.
  const chanceCacheRef = useRef(new Map());
  const chanceFor = (m) => {
    const remaining = [m.player1_current_score ?? m.starting_score ?? 501, m.player2_current_score ?? m.starting_score ?? 501];
    const strengths = [avgById[m.player1?.id], avgById[m.player2?.id]];
    const legs = [m.player1_legs ?? 0, m.player2_legs ?? 0];
    const key = [...strengths, ...legs, ...remaining, m.current_player, m.legs_to_win, m.starting_score].join('|');
    const cache = chanceCacheRef.current;
    if (!cache.has(key)) {
      if (cache.size > 300) cache.clear();
      cache.set(key, liveMatchChance({
        strengths,
        legsToWin: m.legs_to_win || 3,
        legs,
        remaining,
        thrower: m.current_player,
        startingScore: m.starting_score ?? 501,
        checkouts: checkoutData
      }));
    }
    return cache.get(key);
  };

  const upNext = useMemo(() => {
    if (!tournament) return [];
    const liveIds = new Set(liveMatches.map((m) => m.id));
    // Anything that is not pending is either live or done — never "up next".
    const ready = (m) => m.status === 'pending' && m.player1 && m.player2 && !liveIds.has(m.id);
    const groupQueues = (tournament.groups || []).map((g) => (g.matches || []).filter(ready).map((m) => ({ ...m, label: g.name })));
    const playoffItems = upcomingPlayoffMatches(bracketRounds).filter((m) => !liveIds.has(m.id)).map((m) => ({ ...m, label: m.roundName }));
    return [...roundRobin(groupQueues), ...playoffItems];
  }, [tournament, liveMatches, bracketRounds]);

  // Waiting matches per assigned board, in the order they will be played.
  const queues = useMemo(
    () => (tournament ? boardQueues(tournament, new Set(liveMatches.map((m) => m.id))) : new Map()),
    [tournament, liveMatches]
  );

  // Same qualifiers as the management Standings tab, in either qualification mode.
  const qualifierIds = useMemo(
    () => new Set(tournament?.playoffSettings?.enabled ? getQualifyingPlayers(tournament).map((p) => p.id) : []),
    [tournament]
  );

  const liveScores = useMemo(
    () => Object.fromEntries(liveMatches.map((m) => [m.id, { player1Legs: m.player1_legs ?? 0, player2Legs: m.player2_legs ?? 0 }])),
    [liveMatches]
  );

  // Group or round of every match, for the live cards.
  const matchLabels = useMemo(() => {
    const map = new Map();
    (tournament?.groups || []).forEach((g) => (g.matches || []).forEach((m) => map.set(m.id, g.name)));
    bracketRounds.forEach((r) => r.matches.forEach((m) => map.set(m.id, r.name)));
    return map;
  }, [tournament, bracketRounds]);

  // `?preview=moments`: a sample takeover every few seconds, with real names.
  const previewSourceRef = useRef(null);
  previewSourceRef.current = { boards, players: tournament?.players || [] };
  useEffect(() => {
    if (!previewMoments) return undefined;
    let i = 0;
    const timer = setInterval(() => {
      const { boards: live, players } = previewSourceRef.current;
      const pool = [live[0]?.player1, live[0]?.player2, ...players].filter(Boolean);
      if (pool.length < 2) return;
      const board = boardNumberOf(live[0]) || 1;
      const samples = [
        { kind: '180', value: 180, player: pool[0], board },
        { kind: 'checkout', value: 121, player: pool[1], board },
        { kind: 'match', player: pool[0], opponent: pool[1], score: '3:1', board }
      ];
      pushMoment(samples[i++ % samples.length]);
    }, 7000);
    return () => clearInterval(timer);
  }, [previewMoments, pushMoment]);

  // A wall screen cannot scroll: fit the bracket to the scene. Sizes scale
  // linearly with `scale`, so one measurement gives the factor. Only where the
  // scene has a fixed height (tv); phones scroll.
  useEffect(() => {
    const box = bracketBoxRef.current;
    if (!box) return undefined;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bracket = box.firstElementChild;
        const columns = bracket?.firstElementChild;
        if (!bracket || !columns || !box.clientHeight || !window.matchMedia(TV_QUERY).matches) return;
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
  }, [bracketRounds, scenes]);

  const isStale = !!tournament && (error || (lastOkAt > 0 && now.getTime() - lastOkAt > STALE_MS));
  const round = currentRound(bracketRounds);
  const stageLabel = {
    waiting: t('tv.stageWaiting'),
    groups: t('tv.stageGroups'),
    playoffs: round?.name || t('management.playoffs'),
    finished: t('tv.stageFinished')
  }[stage];
  const sceneLabel = {
    welcome: t('tv.sceneWelcome'),
    live: t('tv.liveBoards'),
    standings: t('management.standings'),
    bracket: t('management.playoffs'),
    stats: t('tv.stats'),
    champion: t('tv.scenePodium')
  };

  // ---- scenes -------------------------------------------------------------
  const tier = boards.length <= 1 ? 'xl' : boards.length === 2 ? 'lg' : boards.length <= 4 ? 'md' : 'sm';
  const S = BOARD_SIZE[tier];

  const renderPlayerRow = (name, legs, score, isThrowing, visit) => (
    <div className={cn(
      // The rail marks who is throwing; the tint carries it from across the room.
      'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-lg border-l-[0.375rem] border-transparent px-3 py-1',
      S.row,
      isThrowing && 'border-primary bg-primary/10'
    )}>
      <span className="flex min-w-0 items-center gap-4">
        <span className={cn('truncate text-xl font-semibold', S.name)}>{name}</span>
        <LastVisitChip visit={visit} t={t} className={cn('text-2xl', S.chip)} />
      </span>
      <span className={cn('min-w-[2em] rounded-full bg-muted px-[0.5em] py-[0.1em] text-center font-display text-lg font-semibold text-muted-foreground', S.legs)}>{legs}</span>
      <span className={cn('min-w-[3ch] text-right font-display text-5xl font-semibold leading-none tabular-nums', S.score)}>{score}</span>
    </div>
  );

  // Mirrored bar: left share in primary, right in amber, same as head-to-head.
  const renderWinChance = (p) => (p === null || p === undefined ? null : (
    <div className={cn('mt-1 flex items-center gap-3 px-4 text-sm text-muted-foreground', S.chance)}>
      <span className="w-[3ch] tabular-nums">{Math.round(p * 100)}%</span>
      <span className="flex h-[0.4em] flex-1 gap-1">
        <span className="rounded-full bg-primary" style={{ flex: Math.max(p, 0.02) }} />
        <span className="rounded-full bg-amber-500" style={{ flex: Math.max(1 - p, 0.02) }} />
      </span>
      <span className="w-[3ch] text-right tabular-nums">{Math.round((1 - p) * 100)}%</span>
      <span>{t('tv.winChance')}</span>
    </div>
  ));

  const renderBoardHeader = (m) => (
    <div className="flex items-center gap-4 px-4">
      {/* No board known at all (no paired board, nothing assigned): the group or round leads instead of a bare "Board". */}
      {(boardNumberOf(m) || m.live_device_name) && <BoardPlate n={boardNumberOf(m) ?? m.live_device_name} t={t} className={S.plate} />}
      <div className={cn('flex min-w-0 flex-1 flex-col text-base', S.meta)}>
        {matchLabels.get(m.id) && <span className="truncate font-semibold">{matchLabels.get(m.id)}</span>}
        <span className="truncate text-muted-foreground">{t('tv.leg')} {m.current_leg || 1} · {t('management.firstTo')} {m.legs_to_win || 3}</span>
      </div>
      <Badge className={cn('bg-live-solid px-3 py-1 text-white', S.meta)}>{t('liveMatches.live')}</Badge>
    </div>
  );

  // Cricket scoreboards are tall and narrow: up to four boards share one row
  // (two rows of them would clip the bull). X01 cards are wide: 2x2, then 3-up.
  const isAllCricket = boards.length > 0 && boards.every((m) => isCricketGame(m.game_type));
  const cricketInRow = isAllCricket && boards.length <= 4;
  const LIVE_COLS = { 2: 'tv:grid-cols-2', 3: 'tv:grid-cols-3', 4: 'tv:grid-cols-4' };
  const renderLive = () => (
    <div className={cn(
      'grid gap-5 tv:h-full',
      cricketInRow
        ? cn(LIVE_COLS[boards.length], 'tv:grid-rows-1')
        : cn(
          boards.length > 1 && (boards.length <= 4 ? 'tv:grid-cols-2' : 'tv:grid-cols-3'),
          boards.length <= 2 ? 'tv:grid-rows-1' : boards.length <= 6 ? 'tv:grid-rows-2' : 'tv:grid-rows-3'
        )
    )}>
      {boards.map((m) => {
        const p1 = m.player1?.name || '—';
        const p2 = m.player2?.name || '—';
        if (isCricketGame(m.game_type)) {
          const marks = m.live_state?.marks;
          return (
            <Card key={m.id} className="min-h-0 justify-center gap-4 overflow-hidden py-4">
              {renderBoardHeader(m)}
              <div className="flex items-center gap-8 px-4">
                <CricketMarksTable
                  size={cricketInRow ? 'lg' : 'md'}
                  players={[
                    { name: p1, points: m.player1_current_score ?? 0, legs: m.player1_legs ?? 0 },
                    { name: p2, points: m.player2_current_score ?? 0, legs: m.player2_legs ?? 0 }
                  ]}
                  marks={marks}
                  thrower={m.current_player}
                  className="min-w-0 flex-1"
                />
                {boards.length === 1 && (
                  <CricketBoard marks={marks} thrower={m.current_player ?? 0} visitDarts={m.live_state?.visit} className="hidden w-[34rem] shrink-0 tv:block" />
                )}
              </div>
            </Card>
          );
        }
        const turn = m.current_player;
        return (
          <Card key={m.id} className="min-h-0 justify-center gap-3 overflow-hidden py-4">
            {renderBoardHeader(m)}
            <div className="flex flex-col gap-1 px-2">
              {renderPlayerRow(p1, m.player1_legs ?? 0, m.player1_current_score ?? m.starting_score ?? 501, turn === 0, lastVisits[m.id]?.player === 0 ? lastVisits[m.id] : null)}
              {renderPlayerRow(p2, m.player2_legs ?? 0, m.player2_current_score ?? m.starting_score ?? 501, turn === 1, lastVisits[m.id]?.player === 1 ? lastVisits[m.id] : null)}
            </div>
            {renderWinChance(chanceFor(m))}
          </Card>
        );
      })}
    </div>
  );

  // Rows stretch to fill the scene: the table is read from across the room.
  const groupCount = (tournament?.groups || []).length;
  const standingsText = groupCount <= 2 ? 'tv:text-[2rem]' : groupCount <= 4 ? 'tv:text-[1.625rem]' : 'tv:text-[1.375rem]';
  const STANDINGS_COLS = 'grid grid-cols-[2ch_minmax(0,1fr)_2ch_2ch_3.5ch_4.5ch] items-center gap-x-[0.8em] px-[0.5em]';
  const renderStandings = () => (
    <div className={cn(
      'grid gap-5 tv:h-full',
      groupCount === 2 && 'tv:grid-cols-2',
      groupCount > 2 && groupCount <= 4 && 'tv:grid-cols-2 tv:grid-rows-2',
      groupCount > 4 && 'tv:grid-cols-3'
    )}>
      {(tournament.groups || []).map((g) => {
        const rows = g.standings || [];
        return (
          <Card key={g.id} className="min-h-0 gap-2 overflow-hidden px-4 py-4">
            <h2 className="px-2 text-xl font-semibold tv:text-[1.75rem]">{g.name}</h2>
            <div className={cn('grid min-h-0 flex-1 text-lg', standingsText)} style={{ gridTemplateRows: `auto repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}>
              <div className={cn(STANDINGS_COLS, 'border-b pb-1 text-base text-muted-foreground tv:text-[1.125rem]')}>
                <span>#</span>
                <span>{t('management.player')}</span>
                <span className="text-right">{t('management.played')}</span>
                <span className="text-right">{t('management.won')}</span>
                <span className="text-right">{t('management.legsDiff')}</span>
                <span className="truncate text-right">{isCricketTournament ? t('common.mpr') : t('management.avg')}</span>
              </div>
              {rows.length === 0 ? (
                <p className="self-center text-center text-muted-foreground">{t('management.noMatchesPlayedYet')}</p>
              ) : rows.map((s, i) => {
                const diff = (s.legsWon || 0) - (s.legsLost || 0);
                const qualifies = qualifierIds.has(s.player.id);
                return (
                  <div key={s.player.id} className={cn(STANDINGS_COLS, 'rounded-md tabular-nums', qualifies && 'bg-primary/15 shadow-[inset_0.3em_0_0_var(--primary)]')}>
                    <span className={cn('font-display font-semibold text-muted-foreground', qualifies && 'text-primary')}>{i + 1}</span>
                    <span className="truncate font-semibold">{s.player.name}</span>
                    <span className="text-right">{s.matchesPlayed}</span>
                    <span className="text-right">{s.matchesWon}</span>
                    <span className={cn('text-right', diff >= 0 ? 'text-primary' : 'text-destructive')}>{diff > 0 ? '+' : ''}{diff}</span>
                    <span className="text-right">{(s.average || 0).toFixed(isCricketTournament ? 2 : 1)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );

  const renderBracket = () => (
    <div className="h-full overflow-auto tv:flex tv:items-center tv:justify-center tv:overflow-hidden" ref={bracketBoxRef}>
      <BracketVisualization rounds={bracketRounds} playoffMatches={playoffRows} scale={bracketScale} liveScores={liveScores} className="tv:w-fit tv:overflow-visible" />
    </div>
  );

  const renderUpset = () => upset && (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border bg-card px-6 py-4 text-lg tv:text-[1.5rem]">
      <span className="flex items-center gap-2 font-semibold"><Flame className="size-[1.1em] text-live" />{t('tv.upsetOfTheNight')}</span>
      <span className="font-semibold">{upset.winner?.name} <span className="mx-1 font-display tabular-nums">{upset.score}</span> {upset.loser?.name}</span>
      <span className="text-muted-foreground">{t('tv.upsetChance', { pct: formatChance(upset.chance) })}</span>
    </div>
  );

  const renderStats = () => (
    <div className="flex flex-col gap-5 tv:h-full">
      <div className="grid min-h-0 flex-1 gap-5 tv:grid-cols-2 tv:grid-rows-2">
        {statBoards.map((b) => (
          <Card key={b.key} className="min-h-0 gap-2 overflow-hidden px-6 py-4">
            <h2 className="text-xl font-semibold text-primary tv:text-[1.75rem]">{b.title}</h2>
            {b.rows.length === 0 ? (
              <p className="py-6 text-center text-xl text-muted-foreground">—</p>
            ) : b.rows.map((r, i) => (
              <div key={r.player?.id || i} className={cn('grid grid-cols-[1.5ch_minmax(0,1fr)_auto] items-baseline gap-x-4 text-xl leading-snug tv:text-[1.75rem]', i === 0 && 'font-semibold tv:text-[2.375rem]')}>
                <span className={cn('font-display text-muted-foreground', i === 0 && 'text-primary')}>{i + 1}</span>
                <span className="truncate">{r.player?.name || t('common.unknown')}</span>
                <span className="font-display tabular-nums">{r.value}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>
      {renderUpset()}
    </div>
  );

  const renderChampion = () => {
    const pod = podium(tournament, bracketRounds);
    const records = statBoards.filter((b) => b.rows[0]).map((b) => ({ key: b.key, title: b.title, value: b.rows[0].value, name: b.rows[0].player?.name }));
    const groupWinners = (tournament.groups || []).map((g) => ({ id: g.id, group: g.name, player: g.standings?.[0]?.player })).filter((w) => w.player);
    return (
      // minmax(0, …): the nowrap names must not widen the column past a phone screen
      <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-8 tv:h-full', (records.length > 0 || upset) && 'tv:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        {pod ? (
          <div className="flex min-h-0 items-end justify-center gap-6 tv:h-full">
            {[{ place: 2, players: [pod.second] }, { place: 1, players: [pod.first] }, { place: 3, players: pod.third }].map(({ place, players }) => (
              <div key={place} className="flex h-full w-1/3 min-w-0 flex-col items-center justify-end gap-4">
                {place === 1 && <Crown className="size-12 text-amber-400 tv:size-[5rem]" />}
                {(players.length ? players : [null]).map((p, i) => (
                  <span key={p?.id || i} className={cn('line-clamp-2 max-w-full text-center font-semibold tv:line-clamp-1', place === 1 ? 'text-2xl tv:text-[3.75rem]' : 'text-lg tv:text-[2.25rem]')}>
                    {p?.name || '—'}
                  </span>
                ))}
                <div className={cn('flex w-full shrink-0 items-start justify-center rounded-t-2xl pt-[0.15em] font-display text-6xl font-bold leading-none', STEP_CLASS[place])}>{place}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid content-center gap-5 tv:grid-cols-2">
            <h2 className="text-2xl font-semibold tv:col-span-2 tv:text-[2.25rem]">{t('tv.groupWinners')}</h2>
            {groupWinners.map((w) => (
              <Card key={w.id} className="gap-1 px-6 py-5">
                <span className="text-lg text-muted-foreground tv:text-[1.5rem]">{w.group}</span>
                <span className="flex items-center gap-3 truncate text-3xl font-semibold tv:text-[3rem]"><Crown className="size-[0.8em] shrink-0 text-amber-400" />{w.player.name}</span>
              </Card>
            ))}
          </div>
        )}
        {(records.length > 0 || upset) && (
          <div className="flex min-h-0 flex-col justify-center gap-5">
            {records.length > 0 && (
              <Card className="gap-4 px-8 py-6">
                <h2 className="text-2xl font-semibold tv:text-[2rem]">{t('tv.recordsTitle')}</h2>
                {records.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-6 border-t pt-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-base text-muted-foreground tv:text-[1.25rem]">{r.title}</span>
                      <span className="truncate text-xl font-semibold tv:text-[1.75rem]">{r.name}</span>
                    </div>
                    <span className="font-display text-4xl font-semibold text-primary tabular-nums tv:text-[3.5rem]">{r.value}</span>
                  </div>
                ))}
              </Card>
            )}
            {renderUpset()}
          </div>
        )}
      </div>
    );
  };

  // Before the start: who is playing, by group once drawn.
  const renderWelcome = () => {
    const players = tournament.players || [];
    const drawn = (tournament.groups || []).filter((g) => (g.standings || g.players || []).length > 0);
    return (
      <div className="flex flex-col gap-6 tv:h-full">
        <div className="flex items-baseline gap-5">
          <span className="font-display text-6xl font-semibold leading-none tv:text-[7rem]">{players.length}</span>
          <span className="text-2xl text-muted-foreground tv:text-[2.25rem]">{t('tv.sceneWelcome')}</span>
        </div>
        {drawn.length > 0 ? (
          <div className={cn('grid min-h-0 flex-1 gap-5', drawn.length > 1 && 'tv:grid-cols-2', drawn.length > 2 && 'tv:grid-cols-4')}>
            {drawn.map((g) => (
              <Card key={g.id} className="min-h-0 gap-2 overflow-hidden px-6 py-5">
                <h2 className="text-xl font-semibold text-primary tv:text-[1.75rem]">{g.name}</h2>
                {(g.standings ? g.standings.map((s) => s.player) : g.players).map((p) => (
                  <span key={p.id} className="truncate text-xl tv:text-[1.75rem]">{p.name}</span>
                ))}
              </Card>
            ))}
          </div>
        ) : (
          <div className="columns-2 gap-10 text-xl tv:columns-4 tv:text-[1.875rem]">
            {players.map((p) => <div key={p.id} className="truncate py-1">{p.name}</div>)}
          </div>
        )}
      </div>
    );
  };

  // ---- takeover -----------------------------------------------------------
  const renderMoment = () => (
    <div key={moment.key} className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl bg-background/95 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-500">
      {moment.kind === '180' && (
        <span className="font-display text-[9rem] font-bold leading-none text-live tv:text-[20rem]">180</span>
      )}
      {moment.kind === 'checkout' && (
        <>
          <span className="font-display text-[8rem] font-bold leading-none text-primary tv:text-[18rem]">{moment.value}</span>
          <span className="text-2xl uppercase tracking-widest text-muted-foreground tv:text-[2.5rem]">{t('tv.momentCheckout')}</span>
        </>
      )}
      {moment.kind === 'match' && <Crown className="size-16 text-amber-400 tv:size-[6rem]" />}
      <span className={cn('max-w-full truncate font-semibold', moment.kind === 'match' ? 'text-5xl tv:text-[6.5rem]' : 'text-4xl tv:text-[4.5rem]')}>{moment.player?.name}</span>
      {moment.kind === 'match' && (
        <>
          <span className="font-display text-4xl font-semibold text-primary tv:text-[4rem]">{t('tv.momentMatchWins', { score: moment.score })}</span>
          {moment.opponent && <span className="text-2xl text-muted-foreground tv:text-[2.5rem]">{t('tv.momentAgainst', { name: moment.opponent.name })}</span>}
        </>
      )}
      {moment.board && <BoardPlate n={moment.board} t={t} className="mt-2 tv:text-[2.5rem]" />}
    </div>
  );

  // ---- rail ---------------------------------------------------------------
  // Who plays next on which board, on every scene. Without assigned boards,
  // the next matches in play order with their group or round.
  const railItems = stage === 'groups' || stage === 'playoffs'
    ? (queues.size > 0
      ? [...queues].slice(0, 4).map(([board, list]) => ({ key: `b${board}`, board, match: list[0] }))
      : upNext.slice(0, 3).map((m) => ({ key: m.id, label: m.label, match: m })))
    : [];

  return (
    <div
      ref={rootRef}
      onPointerMove={() => { if (!isAwake) setIsAwake(true); }}
      // tv: inset from the screen edge, so TVs that overscan don't crop the header or rail
      className="dark-mode flex min-h-screen flex-col bg-background text-foreground tv:fixed tv:inset-0 tv:overflow-hidden tv:px-[2.5rem] tv:py-[1.25rem] [&:fullscreen]:cursor-none"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 tv:h-[5.5rem] tv:flex-nowrap tv:px-0 tv:py-0">
        {tournament?.leagueLogoUrl
          ? <LeagueLogo src={tournament.leagueLogoUrl} className="h-12 max-w-32 tv:h-[4rem] tv:max-w-[10rem]" />
          : <Trophy className="size-8 shrink-0 text-primary tv:size-[3rem]" />}
        <h1 className="min-w-0 truncate text-2xl font-semibold tv:text-[2.5rem]">{tournament?.name || '…'}</h1>
        {tournament && (
          <span className={cn(
            'shrink-0 rounded-full border px-[0.8em] py-[0.25em] text-lg font-semibold tv:text-[1.5rem]',
            stage === 'finished' && 'border-amber-400/50 bg-amber-400/15 text-amber-300',
            (stage === 'groups' || stage === 'playoffs') && 'border-primary/50 bg-primary/15 text-primary'
          )}>{stageLabel}</span>
        )}
        <span className="hidden flex-1 tv:block" />
        {isStale && (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-live/15 px-[0.8em] py-[0.25em] text-lg font-semibold text-live tv:text-[1.375rem]">
            <WifiOff className="size-[1em]" />{t('tv.offline', { time: lastOkAt ? fmtClock(new Date(lastOkAt)) : '—' })}
          </span>
        )}
        {paused && !pinnedScene && <Pause className="size-6 shrink-0 text-muted-foreground tv:size-[2rem]" />}
        <div className={cn('flex shrink-0 items-center gap-1 transition-opacity focus-within:opacity-100 motion-reduce:transition-none', isAwake ? 'opacity-100' : 'opacity-0')}>
          {!pinnedScene && scenes.length > 1 && (
            <Button variant="ghost" size="icon-lg" onClick={() => setPaused((p) => !p)} title={paused ? t('tv.resume') : t('tv.pause')} aria-label={paused ? t('tv.resume') : t('tv.pause')}>
              {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" onClick={toggleFullscreen} title={t('tv.fullscreen')} aria-label={t('tv.fullscreen')}>
            <Maximize2 className="size-5" />
          </Button>
        </div>
        <span className="font-display text-3xl font-semibold text-muted-foreground tv:text-[2.75rem]">{fmtClock(now)}</span>
      </header>

      {/* Where the screen is in its cycle: a segment per scene, the shown one filling up. */}
      {tournament && scenes.length > 1 && (
        <div className="flex gap-3 px-4 pt-2 tv:px-0" aria-hidden="true">
          {scenes.map((s) => {
            const isActive = s === activeScene;
            const isRunning = isActive && !pinnedScene && !paused && !moment;
            return (
              <div key={s} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  {isActive && (
                    <div
                      key={`${s}-${viewIndex}-${holdUntil}`}
                      className="h-full origin-left rounded-full bg-primary motion-reduce:!animate-none"
                      style={isRunning ? { animation: `tv-progress ${Math.max(rotateMs, holdUntil - Date.now())}ms linear forwards` } : undefined}
                    />
                  )}
                </div>
                <span className={cn('truncate text-base font-medium tv:text-[1.125rem]', isActive ? 'text-foreground' : 'text-muted-foreground')}>{sceneLabel[s]}</span>
              </div>
            );
          })}
        </div>
      )}

      <main className="relative min-h-0 flex-1 p-4 tv:grid tv:grid-rows-[minmax(0,1fr)] tv:overflow-hidden tv:px-0 tv:py-5">
        {!tournament && error && (
          <div className="tv:self-center"><EmptyState icon={Target} title={t('tv.loadError')} description={t('tv.loadErrorHint')} /></div>
        )}
        {!tournament && !error && <p className="py-8 text-center text-2xl text-muted-foreground tv:col-start-1 tv:row-start-1 tv:self-center">{t('common.loading')}</p>}
        {tournament && scenes.map((s) => (
          <div key={s} className={cn(SCENE_CLASS, s === 'standings' && 'tv:overflow-auto')} hidden={s !== activeScene}>
            {s === 'welcome' && renderWelcome()}
            {s === 'live' && renderLive()}
            {s === 'standings' && renderStandings()}
            {s === 'bracket' && renderBracket()}
            {s === 'stats' && renderStats()}
            {s === 'champion' && renderChampion()}
          </div>
        ))}
        {moment && renderMoment()}
      </main>

      <footer className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t px-4 py-3 tv:h-[5.5rem] tv:flex-nowrap tv:px-0 tv:py-0">
        {railItems.length > 0 && (
          <>
            <span className="shrink-0 text-lg font-semibold uppercase tracking-wider text-muted-foreground tv:text-[1.25rem]">{t('tv.next')}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 tv:grid tv:gap-8" style={{ gridTemplateColumns: `repeat(${railItems.length}, minmax(0, 1fr))` }}>
              {railItems.map((item) => (
                <div key={item.key} className="flex min-w-0 items-center gap-3">
                  {item.board
                    ? <BoardPlate n={item.board} t={t} className="tv:text-[1.875rem]" />
                    : <span className="shrink-0 rounded-lg border px-3 py-1 text-base font-semibold tv:text-[1.25rem]">{item.label}</span>}
                  <span className="min-w-0 truncate text-xl font-semibold tv:text-[1.625rem]">
                    {item.match.player1?.name} <span className="font-normal text-muted-foreground">–</span> {item.match.player2?.name}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-6 text-base text-muted-foreground tv:text-[1.125rem]">
          <PartnerStrip variant="tv" />
          <span>dartlead.app</span>
        </span>
      </footer>
    </div>
  );
}

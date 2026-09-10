import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize2, Pause, Play, Trophy, Target, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tournamentService, matchService } from '../services/tournamentService';
import { useLanguage } from '../contexts/LanguageContext';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { BracketVisualization } from './BracketVisualization';
import { mergeBracketRounds, upcomingPlayoffMatches } from '../utils/bracketView';
import './TvDisplay.css';

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
  const renderLive = () => (
    <div className="tv-live">
      <section className="tv-boards">
        <h2><Target size={28} />{t('tv.liveBoards')}</h2>
        {boards.length === 0 ? (
          <p className="tv-empty">{t('tv.noLiveMatches')}</p>
        ) : (
          <div className={`tv-board-grid tv-board-grid--${Math.min(boards.length, 4)}`}>
            {boards.map((m) => {
              const p1 = m.player1?.name || '—';
              const p2 = m.player2?.name || '—';
              const turn = m.current_player;
              return (
                <div key={m.id} className="tv-board">
                  <div className="tv-board__head">
                    <span className="tv-board__number">{m.live_board_number ? `${t('deviceSettings.board')} ${m.live_board_number}` : (m.live_device_name || t('tv.board'))}</span>
                    <span className="tv-board__format">{t('tv.leg')} {m.current_leg || 1} · {t('management.firstTo')} {m.legs_to_win || 3}</span>
                  </div>
                  <div className={`tv-board__player ${turn === 0 ? 'is-throwing' : ''}`}>
                    <span className="tv-board__name">{p1}</span>
                    <span className="tv-board__legs">{m.player1_legs ?? 0}</span>
                    <span className="tv-board__score">{m.player1_current_score ?? m.starting_score ?? 501}</span>
                  </div>
                  <div className={`tv-board__player ${turn === 1 ? 'is-throwing' : ''}`}>
                    <span className="tv-board__name">{p2}</span>
                    <span className="tv-board__legs">{m.player2_legs ?? 0}</span>
                    <span className="tv-board__score">{m.player2_current_score ?? m.starting_score ?? 501}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <aside className="tv-upnext">
        <h2><Clock size={24} />{t('tv.upNext')}</h2>
        {upNext.length === 0 ? (
          <p className="tv-empty">{t('tv.nothingQueued')}</p>
        ) : (
          <ul>
            {upNext.map((m) => (
              <li key={m.id}>
                <span className="tv-upnext__label">{m.label}</span>
                <span className="tv-upnext__players">{m.p1} <em>vs</em> {m.p2}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );

  const renderStandings = () => (
    <div className={`tv-standings tv-standings--${Math.min((tournament.groups || []).length, 4)}`}>
      {(tournament.groups || []).map((g) => {
        const rows = g.standings || [];
        return (
          <div key={g.id} className="tv-group">
            <h2>{g.name}</h2>
            <table className="tv-table">
              <thead>
                <tr>
                  <th className="pos">#</th>
                  <th className="name">{t('management.player')}</th>
                  <th>{t('management.played')}</th>
                  <th>{t('management.won')}</th>
                  <th>{t('management.legsWL')}</th>
                  <th>{t('management.legsDiff')}</th>
                  <th>{t('management.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="tv-empty">{t('management.noMatchesPlayedYet')}</td></tr>
                ) : rows.map((s, i) => {
                  const diff = (s.legsWon || 0) - (s.legsLost || 0);
                  const qualifies = qualifiersPerGroup > 0 && i < qualifiersPerGroup;
                  return (
                    <tr key={s.player.id} className={qualifies ? 'qualifies' : ''}>
                      <td className="pos">{i + 1}</td>
                      <td className="name">{s.player.name}</td>
                      <td>{s.matchesPlayed}</td>
                      <td>{s.matchesWon}</td>
                      <td>{s.legsWon}:{s.legsLost}</td>
                      <td className={diff >= 0 ? 'pos-diff' : 'neg-diff'}>{diff > 0 ? '+' : ''}{diff}</td>
                      <td>{(s.average || 0).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );

  const renderBracket = () => (
    <div className="tv-bracket">
      <div className="tv-bracket-inner">
        <BracketVisualization rounds={bracketRounds} playoffMatches={playoffRows} scale={1.6} />
      </div>
    </div>
  );

  const viewLabel = { live: t('tv.liveBoards'), standings: t('management.standings'), bracket: t('management.playoffs') };

  return (
    <div className="tv-root" ref={rootRef}>
      <header className="tv-header">
        <div className="tv-header__title">
          <Trophy size={30} />
          <div>
            <h1>{tournament?.name || '…'}</h1>
            {tournament && (
              <span className={`tv-status tv-status--${tournament.status}`}>
                {tournament.status === 'completed' ? t('tv.completed') : t('tv.inProgress')}
              </span>
            )}
          </div>
        </div>
        <nav className="tv-views" aria-label={t('tv.views')}>
          {views.map((v, i) => (
            <button key={v} type="button" className={v === activeView ? 'active' : ''} onClick={() => { setViewIndex(i); setPaused(true); }}>
              {viewLabel[v]}
            </button>
          ))}
        </nav>
        <div className="tv-header__right">
          <span className="tv-clock">{fmtClock(now)}</span>
          {!pinnedView && views.length > 1 && (
            <button type="button" className="tv-icon-btn" onClick={() => setPaused((p) => !p)} title={paused ? t('tv.resume') : t('tv.pause')}>
              {paused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}
          <button type="button" className="tv-icon-btn" onClick={toggleFullscreen} title={t('tv.fullscreen')}>
            <Maximize2 size={20} />
          </button>
        </div>
      </header>

      <main className="tv-main">
        {error && <p className="tv-error">{error}</p>}
        {!tournament && !error && <p className="tv-empty">{t('common.loading')}</p>}
        {tournament && views.map((v) => (
          <div key={v} className="tv-view" hidden={v !== activeView}>
            {v === 'live' && renderLive()}
            {v === 'standings' && renderStandings()}
            {v === 'bracket' && renderBracket()}
          </div>
        ))}
      </main>

      <footer className="tv-footer">
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

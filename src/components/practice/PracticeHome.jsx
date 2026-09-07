import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Trash2, ChevronRight, Smartphone, Cloud, CloudOff, RefreshCw, LogIn } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOffline } from '../../contexts/OfflineContext';
import { PracticeBests } from './PracticeBests';
import { PRACTICE_GAMES, describeSession, formatSessionDate, sessionHighlights } from '../../lib/practiceGames';
import { loadActiveSession, clearActiveSession, loadHistory, countPendingSync } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { computeStats } from '../../lib/x01Engine';
import './Practice.css';

const RECENT_LIMIT = 5;

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

  const activeStats = active?.game === 'x01' ? computeStats(active.state) : null;
  const activeGame = active ? PRACTICE_GAMES.find(g => g.id === active.game) : null;

  const handleDiscard = () => {
    clearActiveSession();
    setActive(null);
  };

  return (
    <div className="practice-page">
      <div className="practice-header">
        <div>
          <h1>{t('practice.title')}</h1>
          <p>{t('practice.subtitle')}</p>
        </div>
      </div>

      {active && activeGame && (
        <div className="practice-resume">
          <div className="practice-resume-text">
            <strong>{t('practice.resumeTitle')}</strong>
            <span>
              {t(`practice.games.${active.game}.title`)}
              {' · '}
              {describeSession({ game: active.game, settings: active.state.settings }, t)}
              {activeStats && ` · ${t('practice.stats.average')} ${activeStats.average.toFixed(1)}`}
            </span>
          </div>
          <div className="practice-resume-actions">
            <button type="button" className="practice-ghost-btn danger" onClick={handleDiscard}>
              <Trash2 size={16} /> {t('practice.discard')}
            </button>
            <button type="button" className="create-tournament-btn" onClick={() => navigate(activeGame.path)}>
              <Play size={18} /> {t('practice.resume')}
            </button>
          </div>
        </div>
      )}

      <div className="practice-game-grid">
        {PRACTICE_GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            className="practice-game-tile"
            disabled={!game.available}
            onClick={() => game.available && navigate(game.path)}
          >
            {!game.available && <span className="practice-soon-badge">{t('practice.comingSoon')}</span>}
            <div className="practice-game-icon"><game.icon size={22} /></div>
            <h3>{t(`practice.games.${game.id}.title`)}</h3>
            <p>{t(`practice.games.${game.id}.desc`)}</p>
          </button>
        ))}
      </div>

      {!user && history.length > 0 && (
        <div className="practice-signin">
          <p>
            <strong>{t('practice.sync.signInTitle')}</strong>
            {t('practice.sync.signInText')}
          </p>
          <button type="button" className="create-tournament-btn" onClick={() => navigate('/login', { state: { from: '/practice' } })}>
            <LogIn size={18} /> {t('navigation.login')}
          </button>
        </div>
      )}

      {user && (
        <div className="practice-sync">
          {syncState === 'syncing' && <span className="practice-sync-text"><RefreshCw size={15} className="spin" /> {t('practice.sync.syncing')}</span>}
          {syncState === 'ok' && <span className="practice-sync-text ok"><Cloud size={15} /> {t('practice.sync.synced')}</span>}
          {syncState === 'error' && <span className="practice-sync-text error"><CloudOff size={15} /> {t('practice.sync.failed')}</span>}
          {syncState === 'idle' && !isOnline && <span className="practice-sync-text"><CloudOff size={15} /> {t('practice.sync.offline', { count: pending })}</span>}
          {syncState === 'idle' && isOnline && <span className="practice-sync-text"><Cloud size={15} /> {t('practice.sync.idle')}</span>}
          {syncState !== 'syncing' && isOnline && (
            <button type="button" className="practice-link-btn" onClick={runSync}>
              <RefreshCw size={14} /> {t('practice.sync.retry')}
            </button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="practice-section-title">
            <h2>{t('practice.bests.title')}</h2>
          </div>
          <PracticeBests entries={history} />

          <div className="practice-section-title">
            <h2>{t('practice.history.recent')}</h2>
            <button type="button" className="practice-link-btn" onClick={() => navigate('/practice/history')}>
              {t('practice.history.viewAll')} <ChevronRight size={16} />
            </button>
          </div>
          <div className="practice-session-list">
            {history.slice(0, RECENT_LIMIT).map((entry) => (
              <SessionRow key={entry.id} entry={entry} t={t} language={language} />
            ))}
          </div>
        </>
      )}

      <p className="practice-note">
        {user ? <Cloud size={14} /> : <Smartphone size={14} />}
        {' '}{user ? t('practice.sync.note') : t('practice.savedLocally')}
      </p>
    </div>
  );
}

export function SessionRow({ entry, t, language, onDelete }) {
  return (
    <div className="practice-session-row">
      <div className="practice-session-main">
        <strong>{t(`practice.games.${entry.game}.title`)} · {describeSession(entry, t)}</strong>
        <span>{formatSessionDate(entry.finishedAt, language)}</span>
      </div>
      <div className="practice-session-stats">
        {sessionHighlights(entry, t).map(([label, value]) => (
          <div key={label}><b>{value}</b><small>{label}</small></div>
        ))}
      </div>
      {onDelete && (
        <button type="button" className="practice-session-delete" onClick={() => onDelete(entry.id)} title={t('practice.history.delete')}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

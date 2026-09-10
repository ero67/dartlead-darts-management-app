import React from 'react';
import { Plus, Trophy, Users, Target, Calendar, TrendingUp, Crown, LogIn, Play, User, Flame } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';
import { tournamentStatusLabel, isTournamentRunning } from '../utils/tournamentStatus';
import { getUserDisplayName } from '../utils/userDisplayName';
import { loadActiveSession, loadHistory } from '../lib/practiceStorage';
import { PRACTICE_GAMES } from '../lib/practiceGames';

export function Dashboard({ onCreateTournament, onSelectTournament, onCreateLeague, onSelectLeague, onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, canManage, canCreateTournaments } = useAdmin();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();

  const isManagerUser = user && canManage;

  // Filter to user's own data
  const myTournaments = isManagerUser
    ? tournaments.filter(tr => tr.userId === user.id)
    : [];
  const myLeagues = isManagerUser
    ? leagues.filter(l => l.createdBy === user.id || (l.managerIds && l.managerIds.includes(user.id)))
    : [];

  const myActiveTournaments = myTournaments.filter(tr => isTournamentRunning(tr.status));
  // Counts come from the lightweight summary (getTournamentsSummary).
  const myActiveMatches = myTournaments.reduce(
    (sum, tr) => sum + (tr.inProgressMatches ?? 0),
    0
  );

  const getTournamentProgress = (tournament) => {
    const totalMatches = tournament.totalMatches ?? 0;
    const completedMatches = tournament.completedMatches ?? 0;
    return totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;
  };

  // Not logged in or regular user — player view: practice first, then browsing
  if (!isManagerUser) {
    const playerName = user ? (getUserDisplayName(user) || user?.email?.split('@')[0]) : null;
    const activePractice = loadActiveSession();
    const activeGame = activePractice ? PRACTICE_GAMES.find(g => g.id === activePractice.game) : null;
    const practiceHistory = loadHistory();
    const practiceTotals = practiceHistory.reduce((acc, entry) => {
      const st = entry.stats || {};
      acc.sessions += 1;
      acc.oneEighties += st.oneEighties || 0;
      if (entry.game === 'x01' && (st.totalDarts || 0) >= 9 && st.average > acc.bestAverage) acc.bestAverage = st.average;
      return acc;
    }, { sessions: 0, oneEighties: 0, bestAverage: 0 });

    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>{playerName ? t('dashboard.welcomePlayer', { name: playerName }) : t('dashboard.title')}</h1>
        </div>

        <div className="dashboard-player-hero">
          <div className="dashboard-player-hero__icon"><Target size={28} /></div>
          <div className="dashboard-player-hero__text">
            <h2>{t('dashboard.practiceTitle')}</h2>
            <p>{t('dashboard.practiceDesc')}</p>
          </div>
          <div className="dashboard-player-hero__actions">
            {activeGame && (
              <button className="create-tournament-btn" onClick={() => onNavigate(activeGame.path)}>
                <Play size={20} />
                {t('dashboard.continueSession')}
              </button>
            )}
            <button
              className="create-tournament-btn"
              onClick={() => onNavigate('/practice')}
              style={activeGame ? { background: 'var(--bg-tertiary)', color: 'var(--text-primary)' } : undefined}
            >
              <Target size={20} />
              {t('dashboard.practiceCta')}
            </button>
          </div>
        </div>

        {practiceTotals.sessions > 0 && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><Target size={24} /></div>
              <div className="stat-content">
                <h3>{practiceTotals.sessions}</h3>
                <p>{t('practice.stats.sessions')}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon active"><TrendingUp size={24} /></div>
              <div className="stat-content">
                <h3>{practiceTotals.bestAverage ? practiceTotals.bestAverage.toFixed(1) : t('practice.noStats')}</h3>
                <p>{t('practice.stats.bestAverage')}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Flame size={24} /></div>
              <div className="stat-content">
                <h3>{practiceTotals.oneEighties}</h3>
                <p>{t('practice.stats.oneEighties')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-welcome">
          <Trophy size={40} />
          <p>{t('dashboard.playerIntro')}</p>
          <div className="quick-actions-bar">
            {!user && (
              <button className="create-tournament-btn" onClick={() => onNavigate('/login')}>
                <LogIn size={20} />
                {t('navigation.login')}
              </button>
            )}
            <button className="create-tournament-btn" onClick={() => onNavigate('/tournaments')} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              <Trophy size={20} />
              {t('dashboard.browsePublic')}
            </button>
            <button className="create-tournament-btn" onClick={() => onNavigate('/leagues')} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              <Crown size={20} />
              {t('dashboard.browseLeagues')}
            </button>
            {user && (
              <button className="create-tournament-btn" onClick={() => onNavigate('/my-profile')} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <User size={20} />
                {t('navigation.myProfile')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Manager / Admin dashboard
  const displayName = getUserDisplayName(user) || user?.email?.split('@')[0] || t('common.roleManager');

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>{t('dashboard.welcomeManager', { name: displayName })}</h1>
          <span className="role-label">
            {isAdmin ? t('common.roleAdmin') : t('common.roleManager')}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      {canCreateTournaments && (
        <div className="quick-actions-bar">
          <button className="create-tournament-btn" onClick={onCreateTournament}>
            <Plus size={20} />
            {t('tournaments.create')}
          </button>
          <button className="create-tournament-btn" onClick={onCreateLeague}>
            <Plus size={20} />
            {t('leagues.title')}
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Trophy size={24} />
          </div>
          <div className="stat-content">
            <h3>{myTournaments.length}</h3>
            <p>{t('dashboard.myTournaments')}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon active">
            <Target size={24} />
          </div>
          <div className="stat-content">
            <h3>{myActiveTournaments.length}</h3>
            <p>{t('dashboard.myActiveTournaments')}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Crown size={24} />
          </div>
          <div className="stat-content">
            <h3>{myLeagues.length}</h3>
            <p>{t('dashboard.myLeagues')}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <h3>{myActiveMatches}</h3>
            <p>{t('dashboard.myActiveMatches')}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {/* My Leagues Section */}
        <div className="my-leagues-section">
          <h2>{t('dashboard.myLeagues')}</h2>
          {myLeagues.length > 0 ? (
            <div className="tournaments-grid">
              {myLeagues.map(league => (
                <div key={league.id} className="tournament-card" onClick={() => onSelectLeague(league)}>
                  <div className="card-header">
                    <div className="tournament-info">
                      <h3>{league.name}</h3>
                      <span className={`status-badge ${league.status}`}>
                        {tournamentStatusLabel(league.status, t)}
                      </span>
                    </div>
                  </div>
                  {league.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                      {league.description}
                    </p>
                  )}
                  <div className="tournament-stats">
                    <div className="stat">
                      <Users size={16} />
                      <span>{league.memberCount || 0} {t('leagues.members')}</span>
                    </div>
                    <div className="stat">
                      <Trophy size={16} />
                      <span>{league.tournamentCount || 0} {t('leagues.tournaments')}</span>
                    </div>
                  </div>
                  <div className="card-footer">
                    <button
                      className="view-tournament-btn"
                      onClick={(e) => { e.stopPropagation(); onSelectLeague(league); }}
                    >
                      {t('tournaments.view')} {t('leagues.title')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Crown size={48} />
              <h3>{t('dashboard.noMyLeagues')}</h3>
              <p>{t('dashboard.createFirstLeague')}</p>
              {canCreateTournaments && (
                <button className="create-first-btn" onClick={onCreateLeague}>
                  <Plus size={20} />
                  {t('leagues.title')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* My Tournaments Section */}
        <div className="my-tournaments-section">
          <h2>{t('dashboard.myTournaments')}</h2>
          {myTournaments.length > 0 ? (
            <div className="tournaments-grid">
              {myTournaments
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .map(tournament => {
                  const progress = getTournamentProgress(tournament);
                  const linkedLeague = tournament.leagueId
                    ? leagues.find(l => l.id === tournament.leagueId)
                    : null;

                  return (
                    <div key={tournament.id} className="tournament-card" onClick={() => onSelectTournament(tournament)}>
                      <div className="card-header">
                        <div className="tournament-info">
                          <h3>{tournament.name}</h3>
                          <span className={`status-badge ${tournament.status}`}>
                            {tournamentStatusLabel(tournament.status, t)}
                          </span>
                        </div>
                      </div>

                      {linkedLeague ? (
                        <div className="league-badge">
                          <Crown size={12} />
                          <span>{linkedLeague.name}</span>
                        </div>
                      ) : (
                        <div className="league-badge standalone">
                          <span>{t('dashboard.standalone')}</span>
                        </div>
                      )}

                      <div className="tournament-stats">
                        <div className="stat">
                          <Users size={16} />
                          <span>{tournament.playerCount ?? tournament.players?.length ?? 0} {t('common.players')}</span>
                        </div>
                        <div className="stat">
                          <Calendar size={16} />
                          <span>{new Date(tournament.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="progress-section">
                        <div className="progress-header">
                          <span>{t('tournaments.progress')}</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>

                      <div className="card-footer">
                        <button
                          className="view-tournament-btn"
                          onClick={(e) => { e.stopPropagation(); onSelectTournament(tournament); }}
                        >
                          {isTournamentRunning(tournament.status)
                            ? t('dashboard.manage')
                            : t('dashboard.viewResults')} {t('tournaments.tournament')}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="empty-state">
              <Trophy size={48} />
              <h3>{t('dashboard.noMyTournaments')}</h3>
              <p>{t('dashboard.createFirstTournament')}</p>
              {canCreateTournaments && (
                <button className="create-first-btn" onClick={onCreateTournament}>
                  <Plus size={20} />
                  {t('tournaments.create')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

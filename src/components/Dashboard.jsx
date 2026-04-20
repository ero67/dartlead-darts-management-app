import React from 'react';
import { Plus, Trophy, Users, Target, Calendar, TrendingUp, Crown, LogIn } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useTournament } from '../contexts/TournamentContext';
import { useLeague } from '../contexts/LeagueContext';

export function Dashboard({ onCreateTournament, onSelectTournament, onCreateLeague, onSelectLeague, onNavigate }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { isAdmin, isManager, canCreateTournaments } = useAdmin();
  const { tournaments } = useTournament();
  const { leagues } = useLeague();

  const isManagerUser = user && (isAdmin || isManager);

  // Filter to user's own data
  const myTournaments = isManagerUser
    ? tournaments.filter(tr => tr.userId === user.id)
    : [];
  const myLeagues = isManagerUser
    ? leagues.filter(l => l.createdBy === user.id || (l.managerIds && l.managerIds.includes(user.id)))
    : [];

  const myActiveTournaments = myTournaments.filter(tr => tr.status === 'active');
  const myActiveMatches = myTournaments.reduce((sum, tr) =>
    sum + tr.groups.reduce((gs, g) =>
      gs + g.matches.filter(m => m.status === 'in_progress').length, 0
    ), 0
  );

  const getTournamentProgress = (tournament) => {
    const totalMatches = tournament.groups.reduce((sum, g) => sum + g.matches.length, 0);
    const completedMatches = tournament.groups.reduce((sum, g) =>
      sum + g.matches.filter(m => m.status === 'completed').length, 0
    );
    return totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;
  };

  // Not logged in or regular user — show public welcome
  if (!isManagerUser) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>{t('dashboard.title')}</h1>
        </div>

        <div className="dashboard-welcome">
          <Trophy size={48} />
          <h2>{t('dashboard.welcome')}</h2>
          <p>{t('dashboard.loginToManage')}</p>
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
          </div>
        </div>
      </div>
    );
  }

  // Manager / Admin dashboard
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Manager';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>{t('dashboard.welcomeManager', { name: displayName })}</h1>
          <span className="role-label">
            {isAdmin ? 'Admin' : 'Manager'}
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
                        {league.status}
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
                            {tournament.status}
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
                          <span>{tournament.players.length} {t('common.players')}</span>
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
                          {tournament.status === 'active'
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

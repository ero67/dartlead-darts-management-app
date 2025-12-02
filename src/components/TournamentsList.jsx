import React, { useState } from 'react';
import { Plus, Trophy, Users, Target, Calendar, Trash2, Play, MoreVertical } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function TournamentsList({ tournaments, onCreateTournament, onSelectTournament, onDeleteTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed'
  const [sortBy, setSortBy] = useState('updated'); // 'updated', 'created', 'name'
  const { isAdmin } = useAdmin();

  const filteredTournaments = tournaments.filter(tournament => {
    if (filter === 'all') return true;
    return tournament.status === filter;
  });

  const sortedTournaments = [...filteredTournaments].sort((a, b) => {
    switch (sortBy) {
      case 'created':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'updated':
      default:
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });

  const getTournamentProgress = (tournament) => {
    const totalMatches = tournament.groups.reduce((sum, g) => sum + g.matches.length, 0);
    const completedMatches = tournament.groups.reduce((sum, g) => 
      sum + g.matches.filter(m => m.status === 'completed').length, 0
    );
    return totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;
  };

  return (
    <div className="tournaments-list">
      <div className="list-header">
        <h1>{t('tournaments.title')}</h1>
        {user && (
          <button className="create-tournament-btn" onClick={onCreateTournament}>
            <Plus size={20} />
            {t('tournaments.create')}
          </button>
        )}
      </div>

      <div className="list-controls">
        <div className="filter-controls">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('tournaments.all')} ({tournaments.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            {t('common.active')} ({tournaments.filter(t => t.status === 'active').length})
          </button>
          <button 
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            {t('common.completed')} ({tournaments.filter(t => t.status === 'completed').length})
          </button>
        </div>

        <div className="sort-controls">
          <label>{t('tournaments.sortBy')}:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="updated">{t('tournaments.lastUpdated')}</option>
            <option value="created">{t('tournaments.dateCreated')}</option>
            <option value="name">{t('common.name')}</option>
          </select>
        </div>
      </div>

      <div className="tournaments-grid">
        {sortedTournaments.map(tournament => {
          const progress = getTournamentProgress(tournament);
          const hasActiveMatches = tournament.groups.some(g => 
            g.matches.some(m => m.status === 'pending')
          );
          
          // Check if current user owns this tournament
          const isOwner = user && tournament.userId && user.id === tournament.userId;

          return (
            <div key={tournament.id} className="tournament-card">
              <div className="card-header">
                <div className="tournament-info">
                  <h3>{tournament.name}</h3>
                  <span className={`status-badge ${tournament.status}`}>
                    {tournament.status}
                  </span>
                </div>
                <div className="card-actions">
                  {hasActiveMatches && (
                    <button 
                      className="action-btn play"
                      onClick={() => onSelectTournament(tournament)}
                      title="Continue Tournament"
                    >
                      <Play size={16} />
                    </button>
                  )}
                  {isAdmin && isOwner && (
                    <button 
                      className="action-btn delete"
                      onClick={() => onDeleteTournament(tournament.id)}
                      title="Delete Tournament"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="tournament-stats">
                <div className="stat">
                  <Users size={16} />
                  <span>{tournament.players.length} {t('common.players')}</span>
                </div>
                <div className="stat">
                  <Trophy size={16} />
                  <span>{tournament.groups.length} {t('common.groups')}</span>
                </div>
                <div className="stat">
                  <Calendar size={16} />
                  <span>{new Date(tournament.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="progress-section">
                <div className="progress-header">
                  <span>{t('tournaments.progress')}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <div className="card-footer">
                <button 
                  className="view-tournament-btn"
                  onClick={() => onSelectTournament(tournament)}
                >
                  {tournament.status === 'active' ? t('tournaments.continue') : t('tournaments.view')} {t('tournaments.tournament')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sortedTournaments.length === 0 && (
        <div className="empty-state">
          <Trophy size={48} />
          <h3>{t('tournaments.noTournamentsFound')}</h3>
          <p>
            {filter === 'all' 
              ? t('tournaments.createFirstToGetStarted')
              : t('tournaments.noFilteredTournaments', { filter })
            }
          </p>
          {filter === 'all' && user && (
            <button className="create-first-btn" onClick={onCreateTournament}>
              <Plus size={20} />
              {t('tournaments.create')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

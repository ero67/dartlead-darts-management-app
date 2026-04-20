import React, { useState, useEffect } from 'react';
import { Plus, Trophy, Users, Calendar } from 'lucide-react';
import { useLeague } from '../contexts/LeagueContext';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export function LeaguesList({ onCreateLeague, onSelectLeague }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { canCreateTournaments } = useAdmin();
  const { leagues, loading, selectLeague } = useLeague();
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'archived'

  useEffect(() => {
    // Leagues are loaded in LeagueContext
  }, []);

  const isMyLeague = (league) => user && (
    league.createdBy === user.id || (league.managerIds && league.managerIds.includes(user.id))
  );

  const filteredLeagues = leagues.filter(league => {
    if (filter === 'all') return true;
    if (filter === 'mine') return isMyLeague(league);
    return league.status === filter;
  });

  const handleSelectLeague = async (league) => {
    try {
      await selectLeague(league.id);
      onSelectLeague(league);
    } catch (error) {
      console.error('Error selecting league:', error);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading leagues...</p>
      </div>
    );
  }

  return (
    <div className="tournaments-list">
      <div className="list-header">
        <h1>Leagues</h1>
        {user && canCreateTournaments && (
          <button className="create-tournament-btn" onClick={onCreateLeague}>
            <Plus size={20} />
            Create League
          </button>
        )}
      </div>

      <div className="list-controls">
        <div className="filter-controls">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({leagues.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({leagues.filter(l => l.status === 'active').length})
          </button>
          <button 
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed ({leagues.filter(l => l.status === 'completed').length})
          </button>
          <button
            className={`filter-btn ${filter === 'archived' ? 'active' : ''}`}
            onClick={() => setFilter('archived')}
          >
            Archived ({leagues.filter(l => l.status === 'archived').length})
          </button>
          {user && canCreateTournaments && (
            <button
              className={`filter-btn ${filter === 'mine' ? 'active' : ''}`}
              onClick={() => setFilter('mine')}
            >
              {t('leagues.myLeagues')} ({leagues.filter(l => isMyLeague(l)).length})
            </button>
          )}
        </div>
      </div>

      {filteredLeagues.length === 0 ? (
        <div className="empty-state">
          <Trophy size={48} />
          <h3>No leagues found</h3>
          <p>Create your first league to organize tournaments and track player standings.</p>
          {user && canCreateTournaments && (
            <button className="create-first-btn" onClick={onCreateLeague}>
              <Plus size={20} />
              Create League
            </button>
          )}
        </div>
      ) : (
        <div className="tournaments-grid">
          {filteredLeagues.map(league => (
            <div key={league.id} className="tournament-card" onClick={() => handleSelectLeague(league)}>
              <div className="card-header">
                <div className="tournament-info">
                  <h3>{league.name}</h3>
                  <span className={`status-badge ${league.status}`}>
                    {league.status}
                  </span>
                </div>
              </div>

              {league.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  {league.description}
                </p>
              )}

              <div className="tournament-stats">
                <div className="stat">
                  <Users size={16} />
                  <span>{league.memberCount || 0} members</span>
                </div>
                <div className="stat">
                  <Trophy size={16} />
                  <span>{league.tournamentCount || 0} tournaments</span>
                </div>
                <div className="stat">
                  <Calendar size={16} />
                  <span>{new Date(league.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="card-footer">
                <button 
                  className="view-tournament-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectLeague(league);
                  }}
                >
                  View League
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


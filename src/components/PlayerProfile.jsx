import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Trophy, Target, Crown, Calendar } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { tournamentService } from '../services/tournamentService';

export function PlayerProfile({ playerId, onBack, onSelectTournament, onSelectLeague }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await tournamentService.getPlayerProfile(playerId);
        setProfileData(data);
      } catch (error) {
        console.error('Error loading player profile:', error);
      } finally {
        setLoading(false);
      }
    };
    if (playerId) loadProfile();
  }, [playerId]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="player-profile">
        <div className="profile-header">
          <button className="back-btn" onClick={onBack}><ArrowLeft size={20} /></button>
          <h1>{t('playerProfile.playerNotFound')}</h1>
        </div>
      </div>
    );
  }

  const { player, tournaments, careerStats, leagues } = profileData;
  const winRate = careerStats.matchesPlayed > 0
    ? ((careerStats.wins / careerStats.matchesPlayed) * 100).toFixed(1)
    : 0;

  return (
    <div className="player-profile">
      <div className="profile-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <h1>
          <User size={24} />
          {player.name}
        </h1>
        {player.user_id && <span className="linked-badge">{t('playerProfile.linkedAccount')}</span>}
      </div>

      {/* Career Statistics */}
      <div className="profile-section">
        <h2>{t('playerProfile.careerStats')}</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.matchesPlayed}</h3>
              <p>{t('playerProfile.matchesPlayed')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.wins}</h3>
              <p>{t('playerProfile.wins')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.losses}</h3>
              <p>{t('playerProfile.losses')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{winRate}%</h3>
              <p>{t('playerProfile.winRate')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.bestAverage.toFixed(2)}</h3>
              <p>{t('playerProfile.bestAverage')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.overallAverage.toFixed(2)}</h3>
              <p>{t('playerProfile.overallAverage')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.highestCheckout || '-'}</h3>
              <p>{t('playerProfile.highestCheckout')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.total180s || 0}</h3>
              <p>{t('playerProfile.total180s')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.totalLegsWon || 0}:{careerStats.totalLegsLost || 0}</h3>
              <p>{t('playerProfile.legsRecord')}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-content">
              <h3>{careerStats.tournamentWins || 0}</h3>
              <p>{t('playerProfile.tournamentWins')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tournament History */}
      <div className="profile-section">
        <h2>{t('playerProfile.tournamentHistory')}</h2>
        {tournaments.length > 0 ? (
          tournaments.map(tourn => (
            <div
              key={tourn.id}
              className="tournament-history-item"
              onClick={() => onSelectTournament && onSelectTournament(tourn)}
            >
              <Trophy size={16} />
              <span className="tournament-name">{tourn.name}</span>
              <span className={`status-badge ${tourn.status}`}>{tourn.status}</span>
              <span className="tournament-date">
                <Calendar size={14} />
                {new Date(tourn.created_at).toLocaleDateString()}
              </span>
            </div>
          ))
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>{t('playerProfile.noTournaments')}</p>
        )}
      </div>

      {/* League Memberships */}
      {leagues.length > 0 && (
        <div className="profile-section">
          <h2>{t('playerProfile.leagues')}</h2>
          {leagues.map(lm => (
            <div
              key={lm.league_id}
              className="league-membership-item"
              onClick={() => onSelectLeague && onSelectLeague({ id: lm.league_id })}
            >
              <Crown size={16} />
              <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary)' }}>
                {lm.leagues?.name || lm.league_id}
              </span>
              {lm.is_active && <span className="active-badge">{t('common.active')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

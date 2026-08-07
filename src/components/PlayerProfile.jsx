import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Trophy, Target, Crown, Calendar, TrendingUp, Award, Medal,
  Flame, Zap, Percent, Swords, ShieldCheck, ChevronRight, Activity
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { tournamentService } from '../services/tournamentService';

const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const statusLabel = (status, t) => {
  if (status === 'open_for_registration') return t('tournaments.statusOpenForRegistration');
  if (status === 'started') return t('tournaments.statusStarted');
  if (status === 'completed') return t('tournaments.statusCompleted');
  return status;
};

const placementLabel = (placement, t) => {
  if (placement === 1) return t('playerProfile.placementWinner');
  if (placement === 2) return t('playerProfile.placementRunnerUp');
  if (placement === 3) return t('playerProfile.placementThird');
  return null;
};

export function PlayerProfile({ playerId, onBack, onSelectTournament, onSelectLeague, onSelectPlayer }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const data = await tournamentService.getPlayerProfile(playerId);
        if (!cancelled) setProfileData(data);
      } catch (error) {
        console.error('Error loading player profile:', error);
        if (!cancelled) setProfileData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (playerId) loadProfile();
    return () => { cancelled = true; };
  }, [playerId]);

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
        <div className="profile-topbar">
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
            {t('common.back')}
          </button>
        </div>
        <div className="profile-empty-state">
          <Target size={40} />
          <h2>{t('playerProfile.playerNotFound')}</h2>
        </div>
      </div>
    );
  }

  // Slovak needs three plural forms (1 / 2-4 / 5+); English reuses one string
  // for the last two, so the same lookup works for both locales.
  const plural = (keyBase, count) => {
    const form = count === 1 ? 'One' : (count >= 2 && count <= 4 ? 'Few' : 'Many');
    return t(`playerProfile.${keyBase}${form}`, { count });
  };

  const { player, tournaments, careerStats, leagues, recentMatches = [] } = profileData;
  const isOwnProfile = !!(user && player.user_id && player.user_id === user.id);
  const winRate = careerStats.matchesPlayed > 0
    ? (careerStats.wins / careerStats.matchesPlayed) * 100
    : 0;

  // Current run of identical results, newest first (recentMatches is ordered desc)
  const streak = recentMatches.reduce((acc, match) => {
    if (acc.done) return acc;
    if (acc.count === 0) return { won: match.won, count: 1, done: false };
    if (match.won === acc.won) return { ...acc, count: acc.count + 1 };
    return { ...acc, done: true };
  }, { won: false, count: 0, done: false });

  const heroStats = [
    {
      key: 'matches',
      icon: Swords,
      label: t('playerProfile.matchesPlayed'),
      value: careerStats.matchesPlayed
    },
    {
      key: 'winRate',
      icon: Percent,
      label: t('playerProfile.winRate'),
      value: `${winRate.toFixed(careerStats.matchesPlayed > 0 ? 1 : 0)}%`
    },
    {
      key: 'average',
      icon: TrendingUp,
      label: t('playerProfile.overallAverage'),
      value: careerStats.overallAverage.toFixed(2)
    }
  ];

  const statTiles = [
    { key: 'wins', icon: Trophy, accent: 'success', label: t('playerProfile.wins'), value: careerStats.wins },
    { key: 'losses', icon: Target, accent: 'danger', label: t('playerProfile.losses'), value: careerStats.losses },
    { key: 'bestAverage', icon: Award, accent: 'primary', label: t('playerProfile.bestAverage'), value: careerStats.bestAverage.toFixed(2) },
    { key: 'highestCheckout', icon: Zap, accent: 'warning', label: t('playerProfile.highestCheckout'), value: careerStats.highestCheckout || '—' },
    { key: 'total180s', icon: Flame, accent: 'danger', label: t('playerProfile.total180s'), value: careerStats.total180s || 0 },
    { key: 'legs', icon: Activity, accent: 'primary', label: t('playerProfile.legsRecord'), value: `${careerStats.totalLegsWon || 0}:${careerStats.totalLegsLost || 0}` },
    { key: 'titles', icon: Crown, accent: 'warning', label: t('playerProfile.tournamentWins'), value: careerStats.tournamentWins || 0 },
    { key: 'darts', icon: Target, accent: 'neutral', label: t('playerProfile.dartsThrown'), value: (careerStats.totalDarts || 0).toLocaleString() }
  ];

  return (
    <div className="player-profile">
      <div className="profile-topbar">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('common.back')}
        </button>
      </div>

      {/* Hero */}
      <header className="profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar">{getInitials(player.name)}</div>
          <div className="profile-identity">
            <h1>{player.name}</h1>
            <div className="profile-meta">
              {isOwnProfile && (
                <span className="profile-chip profile-chip--you">{t('playerProfile.yourProfile')}</span>
              )}
              {player.user_id && (
                <span className="profile-chip profile-chip--linked">
                  <ShieldCheck size={13} />
                  {t('playerProfile.linkedAccount')}
                </span>
              )}
              <span className="profile-chip">
                <Trophy size={13} />
                {plural('tournamentsCount', careerStats.tournamentsPlayed ?? tournaments.length)}
              </span>
              {careerStats.tournamentWins > 0 && (
                <span className="profile-chip profile-chip--title">
                  <Crown size={13} />
                  {plural('titlesCount', careerStats.tournamentWins)}
                </span>
              )}
              {streak.count > 1 && (
                <span className={`profile-chip ${streak.won ? 'profile-chip--win' : 'profile-chip--loss'}`}>
                  <Flame size={13} />
                  {plural(streak.won ? 'winStreakCount' : 'lossStreakCount', streak.count)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-hero-stats">
          {heroStats.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.key} className="profile-hero-stat">
                <Icon size={16} />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            );
          })}
        </div>

        {careerStats.matchesPlayed > 0 && (
          <div className="profile-winrate">
            <div className="profile-winrate-labels">
              <span className="win">{plural('winsCount', careerStats.wins)}</span>
              <span className="loss">{plural('lossesCount', careerStats.losses)}</span>
            </div>
            <div className="profile-winrate-bar">
              <span className="profile-winrate-fill" style={{ width: `${winRate}%` }} />
            </div>
          </div>
        )}
      </header>

      {/* Career Statistics */}
      <section className="profile-section">
        <h2><Activity size={18} />{t('playerProfile.careerStats')}</h2>
        <div className="profile-stats-grid">
          {statTiles.map(tile => {
            const Icon = tile.icon;
            return (
              <div key={tile.key} className={`profile-stat-tile accent-${tile.accent}`}>
                <span className="profile-stat-icon"><Icon size={16} /></span>
                <strong className="profile-stat-value">{tile.value}</strong>
                <span className="profile-stat-label">{tile.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent form */}
      <section className="profile-section">
        <h2><Swords size={18} />{t('playerProfile.recentMatches')}</h2>
        {recentMatches.length > 0 ? (
          <>
            <div className="profile-form-pills">
              {[...recentMatches].reverse().map(match => (
                <span
                  key={match.id}
                  className={`profile-form-pill ${match.won ? 'win' : 'loss'}`}
                  title={`${match.opponentName || t('common.unknown')} ${match.legsFor}:${match.legsAgainst}`}
                >
                  {match.won ? t('playerProfile.formWin') : t('playerProfile.formLoss')}
                </span>
              ))}
            </div>
            <div className="profile-match-list">
              {recentMatches.map(match => (
                <div key={match.id} className={`profile-match-row ${match.won ? 'win' : 'loss'}`}>
                  <span className={`profile-match-result ${match.won ? 'win' : 'loss'}`}>
                    {match.won ? t('playerProfile.formWin') : t('playerProfile.formLoss')}
                  </span>
                  <div className="profile-match-main">
                    <span className="profile-match-opponent">
                      {t('playerProfile.versus')}{' '}
                      {match.opponentId && onSelectPlayer ? (
                        <button
                          type="button"
                          className="profile-link-btn"
                          onClick={() => onSelectPlayer({ id: match.opponentId })}
                        >
                          {match.opponentName || t('common.unknown')}
                        </button>
                      ) : (
                        match.opponentName || t('common.unknown')
                      )}
                    </span>
                    <span className="profile-match-context">
                      {match.isPlayoff && (
                        <span className="profile-match-tag">{t('playerProfile.playoffTag')}</span>
                      )}
                      {match.tournamentName && (
                        <span className="profile-match-tournament">{match.tournamentName}</span>
                      )}
                      {match.playedAt && (
                        <span className="profile-match-date">
                          {new Date(match.playedAt).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="profile-match-score">{match.legsFor}:{match.legsAgainst}</span>
                  <span className="profile-match-avg">
                    {match.average ? match.average.toFixed(2) : '—'}
                    <small>{t('playerProfile.avgShort')}</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="profile-empty-text">{t('playerProfile.noMatches')}</p>
        )}
      </section>

      {/* Tournament History */}
      <section className="profile-section">
        <h2><Trophy size={18} />{t('playerProfile.tournamentHistory')}</h2>
        {tournaments.length > 0 ? (
          <div className="profile-tournament-list">
            {tournaments.map(tourn => (
              <button
                type="button"
                key={tourn.id}
                className="tournament-history-item"
                onClick={() => onSelectTournament && onSelectTournament(tourn)}
              >
                <span className={`profile-placement place-${tourn.placement || 'none'}`}>
                  {tourn.placement ? (
                    <>
                      <Medal size={14} />
                      {tourn.placement}
                    </>
                  ) : (
                    <Trophy size={14} />
                  )}
                </span>
                <span className="tournament-name">{tourn.name}</span>
                {tourn.placement && (
                  <span className={`profile-placement-label place-${tourn.placement}`}>
                    {placementLabel(tourn.placement, t)}
                  </span>
                )}
                <span className={`status-badge ${tourn.status}`}>{statusLabel(tourn.status, t)}</span>
                <span className="tournament-date">
                  <Calendar size={14} />
                  {new Date(tourn.created_at).toLocaleDateString()}
                </span>
                <ChevronRight size={16} className="profile-row-chevron" />
              </button>
            ))}
          </div>
        ) : (
          <p className="profile-empty-text">{t('playerProfile.noTournaments')}</p>
        )}
      </section>

      {/* League Memberships */}
      {leagues.length > 0 && (
        <section className="profile-section">
          <h2><Crown size={18} />{t('playerProfile.leagues')}</h2>
          <div className="profile-tournament-list">
            {leagues.map(lm => (
              <button
                type="button"
                key={lm.league_id}
                className="league-membership-item"
                onClick={() => onSelectLeague && onSelectLeague({ id: lm.league_id })}
              >
                <Crown size={16} />
                <span className="league-membership-name">{lm.leagues?.name || lm.league_id}</span>
                {lm.is_active && <span className="active-badge">{t('common.active')}</span>}
                <ChevronRight size={16} className="profile-row-chevron" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

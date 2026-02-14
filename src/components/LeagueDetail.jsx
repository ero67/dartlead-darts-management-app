import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Users, Settings, TrendingUp, Plus, Edit, Trash2, X, Check, Calendar, Save, ChevronUp, ChevronDown, Link, Unlink } from 'lucide-react';
import { useLeague } from '../contexts/LeagueContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

// Default tournament settings shape (matches TournamentCreation defaults)
const DEFAULT_TOURNAMENT_SETTINGS = {
  tournamentType: 'groups_with_playoffs',
  legsToWin: 3,
  startingScore: 501,
  groupSettings: { type: 'groups', value: 2 },
  standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead'],
  playoffSettings: {
    enabled: true,
    qualificationMode: 'perGroup',
    playersPerGroup: 1,
    totalPlayersToAdvance: 8,
    startingRoundPlayers: 8,
    seedingMethod: 'groupBased',
    thirdPlaceMatch: true,
    legsToWinByRound: { 32: 3, 16: 3, 8: 3, 4: 3, 2: 3 }
  }
};

export function LeagueDetail({ leagueId, onBack, onCreateTournament, onSelectTournament }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentLeague, selectLeague, updateLeague, deleteLeague, addMembers, updateMemberStatus, removeMember, refreshLeaderboard, getUnlinkedTournaments, linkTournamentToLeague, unlinkTournamentFromLeague } = useLeague();
  const [activeTab, setActiveTab] = useState('leaderboard'); // 'leaderboard', 'tournaments', 'players', 'settings'
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [scoringRules, setScoringRules] = useState([]);
  const [isSavingScoring, setIsSavingScoring] = useState(false);
  const [newPlacement, setNewPlacement] = useState({ position: '', points: '' });

  // Default tournament settings state
  const [tournamentDefaults, setTournamentDefaults] = useState(DEFAULT_TOURNAMENT_SETTINGS);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  // Add existing tournament state
  const [isLinkingTournament, setIsLinkingTournament] = useState(false);
  const [unlinkedTournaments, setUnlinkedTournaments] = useState([]);
  const [loadingUnlinked, setLoadingUnlinked] = useState(false);
  const [selectedTournamentToLink, setSelectedTournamentToLink] = useState('');

  useEffect(() => {
    if (leagueId && (!currentLeague || currentLeague.id !== leagueId)) {
      selectLeague(leagueId);
    }
  }, [leagueId, currentLeague, selectLeague]);

  useEffect(() => {
    if (currentLeague && !isEditing) {
      setEditForm({
        name: currentLeague.name || '',
        description: currentLeague.description || ''
      });
    }
  }, [currentLeague, isEditing]);

  // Load scoring rules when league changes
  useEffect(() => {
    if (currentLeague?.scoringRules?.placementPoints) {
      const points = currentLeague.scoringRules.placementPoints;
      const rulesArray = Object.entries(points)
        .filter(([key]) => key !== 'default' && key !== 'playoffDefault')
        .map(([position, pts]) => ({ position: parseInt(position), points: pts }))
        .sort((a, b) => a.position - b.position);
      
      // Always show playoffDefault (default to 1 if not stored yet)
      rulesArray.push({
        position: 'playoffDefault',
        points: points.playoffDefault !== undefined ? points.playoffDefault : 1
      });
      // Always show default / non-playoff (default to 0 if not stored yet)
      rulesArray.push({
        position: 'default',
        points: points.default !== undefined ? points.default : 0
      });
      
      setScoringRules(rulesArray);
    }
  }, [currentLeague]);

  // Load default tournament settings when league changes
  useEffect(() => {
    if (currentLeague?.defaultTournamentSettings) {
      setTournamentDefaults({
        ...DEFAULT_TOURNAMENT_SETTINGS,
        ...currentLeague.defaultTournamentSettings,
        groupSettings: {
          ...DEFAULT_TOURNAMENT_SETTINGS.groupSettings,
          ...(currentLeague.defaultTournamentSettings.groupSettings || {})
        },
        playoffSettings: {
          ...DEFAULT_TOURNAMENT_SETTINGS.playoffSettings,
          ...(currentLeague.defaultTournamentSettings.playoffSettings || {}),
          legsToWinByRound: {
            ...DEFAULT_TOURNAMENT_SETTINGS.playoffSettings.legsToWinByRound,
            ...(currentLeague.defaultTournamentSettings.playoffSettings?.legsToWinByRound || {})
          }
        },
        standingsCriteriaOrder: currentLeague.defaultTournamentSettings.standingsCriteriaOrder || DEFAULT_TOURNAMENT_SETTINGS.standingsCriteriaOrder
      });
    } else {
      setTournamentDefaults(DEFAULT_TOURNAMENT_SETTINGS);
    }
  }, [currentLeague]);

  if (!currentLeague) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('leagues.loading')}</p>
      </div>
    );
  }

  const isManager = user && (
    currentLeague.createdBy === user.id || 
    (currentLeague.managerIds && currentLeague.managerIds.includes(user.id))
  );

  const handleUpdateLeague = async () => {
    try {
      await updateLeague(currentLeague.id, {
        name: editForm.name,
        description: editForm.description
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating league:', error);
      alert(t('leagues.failedToUpdateLeague'));
    }
  };

  const handleDeleteLeague = async () => {
    if (window.confirm(t('leagues.confirmDeleteLeague'))) {
      try {
        await deleteLeague(currentLeague.id);
        onBack();
      } catch (error) {
        console.error('Error deleting league:', error);
        alert(t('leagues.failedToDeleteLeague'));
      }
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    try {
      await addMembers(currentLeague.id, [{ name: newPlayerName.trim() }]);
      setNewPlayerName('');
      setIsAddingPlayer(false);
    } catch (error) {
      console.error('Error adding player:', error);
      alert(t('leagues.failedToAddPlayer'));
    }
  };

  const handleTogglePlayerActive = async (playerId, currentActive) => {
    try {
      await updateMemberStatus(currentLeague.id, playerId, {
        isActive: !currentActive
      });
    } catch (error) {
      console.error('Error updating player status:', error);
      alert(t('leagues.failedToUpdatePlayerStatus'));
    }
  };

  const handleRemovePlayer = async (playerId) => {
    if (window.confirm(t('leagues.confirmRemovePlayer'))) {
      try {
        await removeMember(currentLeague.id, playerId);
      } catch (error) {
        console.error('Error removing player:', error);
        alert(t('leagues.failedToRemovePlayer'));
      }
    }
  };

  const handleScoringRuleChange = (index, field, value) => {
    const updated = [...scoringRules];
    if (field === 'points') {
      updated[index].points = parseInt(value) || 0;
    }
    setScoringRules(updated);
  };

  const handleAddPlacement = () => {
    const position = (newPlacement.position === 'default' || newPlacement.position === 'playoffDefault')
      ? newPlacement.position
      : parseInt(newPlacement.position);
    const points = parseInt(newPlacement.points) || 0;
    
    if (position === '' || (position !== 'default' && position !== 'playoffDefault' && (isNaN(position) || position < 1))) {
      alert(t('leagues.invalidPosition'));
      return;
    }
    
    // Check if position already exists
    if (scoringRules.some(r => r.position === position)) {
      alert(t('leagues.placementExists'));
      return;
    }
    
    const updated = [...scoringRules, { position, points }];
    // Sort: numeric positions first, then playoffDefault, then default
    updated.sort((a, b) => {
      if (a.position === 'default') return 1;
      if (b.position === 'default') return -1;
      if (a.position === 'playoffDefault') return 1;
      if (b.position === 'playoffDefault') return -1;
      return a.position - b.position;
    });
    
    setScoringRules(updated);
    setNewPlacement({ position: '', points: '' });
  };

  const handleRemovePlacement = (index) => {
    const updated = scoringRules.filter((_, i) => i !== index);
    setScoringRules(updated);
  };

  const handleSaveScoringRules = async () => {
    setIsSavingScoring(true);
    try {
      // Convert array back to object format
      const placementPoints = {};
      scoringRules.forEach(rule => {
        placementPoints[rule.position.toString()] = rule.points;
      });
      
      await updateLeague(currentLeague.id, {
        scoring_rules: {
          ...currentLeague.scoringRules,
          placementPoints
        }
      });
      
      alert(t('leagues.scoringSaved'));
    } catch (error) {
      console.error('Error saving scoring rules:', error);
      alert(t('leagues.scoringSaveFailed'));
    } finally {
      setIsSavingScoring(false);
    }
  };

  const handleSaveTournamentDefaults = async () => {
    setIsSavingDefaults(true);
    try {
      await updateLeague(currentLeague.id, {
        default_tournament_settings: tournamentDefaults
      });
      alert(t('leagues.defaultsSaved'));
    } catch (error) {
      console.error('Error saving tournament defaults:', error);
      alert(t('leagues.defaultsSaveFailed'));
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const handleResetTournamentDefaults = () => {
    setTournamentDefaults(DEFAULT_TOURNAMENT_SETTINGS);
  };

  const handleOpenLinkTournament = async () => {
    setIsLinkingTournament(true);
    setLoadingUnlinked(true);
    try {
      const tournaments = await getUnlinkedTournaments();
      setUnlinkedTournaments(tournaments);
    } catch (error) {
      console.error('Error loading unlinked tournaments:', error);
    } finally {
      setLoadingUnlinked(false);
    }
  };

  const handleLinkTournament = async () => {
    if (!selectedTournamentToLink || !currentLeague) return;
    try {
      await linkTournamentToLeague(currentLeague.id, selectedTournamentToLink);
      // Refresh the league to get updated tournament list
      await selectLeague(currentLeague.id);
      setIsLinkingTournament(false);
      setSelectedTournamentToLink('');
      setUnlinkedTournaments([]);
    } catch (error) {
      console.error('Error linking tournament:', error);
    }
  };

  const handleUnlinkTournament = async (tournamentId, tournamentName) => {
    if (!window.confirm(t('leagues.confirmUnlinkTournament') || `Remove "${tournamentName}" from this league?`)) return;
    try {
      await unlinkTournamentFromLeague(currentLeague.id, tournamentId);
      // Refresh the league to get updated tournament list
      await selectLeague(currentLeague.id);
    } catch (error) {
      console.error('Error unlinking tournament:', error);
    }
  };

  const getPlacementLabel = (position) => {
    if (position === 'playoffDefault') return t('leagues.playoffParticipant') || '🏟️ Other Playoff Participants';
    if (position === 'default') return t('leagues.nonPlayoffParticipant') || '👥 Non-Playoff Participants';
    if (position === 1) return `${t('leagues.1stPlace')} 🥇`;
    if (position === 2) return `${t('leagues.2ndPlace')} 🥈`;
    if (position === 3) return `${t('leagues.3rdPlace')} 🥉`;
    return `${position}. ${t('leagues.position').replace(':', '')}`;
  };

  return (
    <div className="tournament-management">
      <div className="management-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('leagues.backToLeagues')}
        </button>
        <div className="tournament-title">
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder={t('leagues.leagueName')}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '1.5rem',
                  fontWeight: '600'
                }}
              />
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder={t('leagues.descriptionOptional')}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="action-btn play"
                  onClick={handleUpdateLeague}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  <Check size={16} />
                  {t('common.save')}
                </button>
                <button 
                  className="action-btn delete"
                  onClick={() => setIsEditing(false)}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  <X size={16} />
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <h2>{currentLeague.name}</h2>
                <span className={`status-badge ${currentLeague.status}`}>
                  {currentLeague.status}
                </span>
                {isManager && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                    <button 
                      className="action-btn play"
                      onClick={() => setIsEditing(true)}
                      title={t('leagues.editLeague')}
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      className="action-btn delete"
                      onClick={handleDeleteLeague}
                      title={t('leagues.deleteLeague')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              {currentLeague.description && (
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  {currentLeague.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <div className="stat">
                  <Users size={16} />
                  <span>{currentLeague.members?.length || 0} {t('leagues.members')}</span>
                </div>
                <div className="stat">
                  <Trophy size={16} />
                  <span>{currentLeague.tournaments?.length || 0} {t('leagues.tournaments')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="management-tabs">
        <button
          className={activeTab === 'leaderboard' ? 'active' : ''}
          onClick={() => setActiveTab('leaderboard')}
        >
          <TrendingUp size={18} />
          {t('leagues.leaderboard')}
        </button>
        <button
          className={activeTab === 'tournaments' ? 'active' : ''}
          onClick={() => setActiveTab('tournaments')}
        >
          <Trophy size={18} />
          {t('tournaments.title')}
        </button>
        <button
          className={activeTab === 'players' ? 'active' : ''}
          onClick={() => setActiveTab('players')}
        >
          <Users size={18} />
          {t('leagues.players')}
        </button>
        {isManager && (
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            {t('leagues.settings')}
          </button>
        )}
      </div>

      <div className="management-content">
        {activeTab === 'leaderboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--text-primary)' }}>{t('leagues.leaderboard')}</h2>
              {isManager && (
                <button 
                  className="create-tournament-btn" 
                  onClick={async () => {
                    try {
                      await refreshLeaderboard(currentLeague.id);
                      alert(t('leagues.recalculateSuccess'));
                    } catch (error) {
                      console.error('Error refreshing leaderboard:', error);
                      alert(t('leagues.recalculateFailed'));
                    }
                  }}
                  title={t('leagues.recalculate')}
                >
                  <TrendingUp size={18} />
                  {t('leagues.recalculate')}
                </button>
              )}
            </div>
            {currentLeague.leaderboard && currentLeague.leaderboard.length > 0 ? (
              <div className="group-card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('leagues.rank')}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('leagues.player')}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('leagues.points')}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('tournaments.title')}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('leagues.best')}</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-primary)', fontWeight: '600' }}>{t('leagues.avgPlacement')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLeague.leaderboard.map((entry, index) => (
                      <tr key={entry.player?.id || index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', color: 'var(--text-primary)', fontWeight: '600' }}>{index + 1}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-primary)' }}>{entry.player?.name || t('common.unknown')}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-primary)', fontWeight: '600' }}>{entry.totalPoints || 0}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{entry.tournamentsPlayed || 0}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{entry.bestPlacement || '-'}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{entry.avgPlacement ? entry.avgPlacement.toFixed(1) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <Trophy size={48} />
                <p>{t('leagues.noResultsYet')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tournaments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ color: 'var(--text-primary)' }}>{t('tournaments.title')}</h2>
              {isManager && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="create-tournament-btn" onClick={handleOpenLinkTournament} style={{ background: 'var(--accent-secondary)', color: '#fff' }}>
                    <Link size={18} />
                    {t('leagues.addExistingTournament') || 'Add Existing'}
                  </button>
                  {onCreateTournament && (
                    <button className="create-tournament-btn" onClick={() => onCreateTournament(currentLeague)}>
                      <Plus size={18} />
                      {t('leagues.createTournament')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Link existing tournament picker */}
            {isLinkingTournament && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>
                    {t('leagues.selectTournamentToLink') || 'Select a tournament to add to this league'}
                  </h3>
                  <button
                    className="action-btn delete"
                    onClick={() => { setIsLinkingTournament(false); setSelectedTournamentToLink(''); }}
                  >
                    <X size={16} />
                  </button>
                </div>
                {loadingUnlinked ? (
                  <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0' }}>{t('common.loading') || 'Loading...'}</p>
                ) : unlinkedTournaments.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                    {t('leagues.noUnlinkedTournaments') || 'No unlinked tournaments found. All your tournaments are already in a league.'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={selectedTournamentToLink}
                      onChange={(e) => setSelectedTournamentToLink(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: '200px',
                        padding: '0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem'
                      }}
                    >
                      <option value="">{t('leagues.chooseTournament') || '-- Choose tournament --'}</option>
                      {unlinkedTournaments.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.status}) — {new Date(t.created_at).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                    <button
                      className="action-btn play"
                      onClick={handleLinkTournament}
                      disabled={!selectedTournamentToLink}
                      style={{ opacity: selectedTournamentToLink ? 1 : 0.5 }}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentLeague.tournaments && currentLeague.tournaments.length > 0 ? (
              <div className="tournaments-grid">
                {currentLeague.tournaments.map(tournament => (
                  <div key={tournament.id} className="tournament-card" style={{ position: 'relative' }}>
                    <div onClick={() => onSelectTournament && onSelectTournament(tournament)} style={{ cursor: 'pointer' }}>
                      <div className="card-header">
                        <div className="tournament-info">
                          <h3>{tournament.name}</h3>
                          <span className={`status-badge ${tournament.status}`}>
                            {tournament.status}
                          </span>
                        </div>
                      </div>
                      <div className="tournament-stats">
                        <div className="stat">
                          <Calendar size={16} />
                          <span>{new Date(tournament.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    {isManager && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnlinkTournament(tournament.id, tournament.name); }}
                        title={t('leagues.unlinkTournament') || 'Remove from league'}
                        style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: '0.25rem',
                          borderRadius: '6px',
                          transition: 'color 0.2s, background 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-danger)'; e.currentTarget.style.background = 'var(--card-bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'none'; }}
                      >
                        <Unlink size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Trophy size={48} />
                <p>{t('leagues.noTournamentsYet')}</p>
                {isManager && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button className="create-first-btn" onClick={handleOpenLinkTournament}>
                      <Link size={20} />
                      {t('leagues.addExistingTournament') || 'Add Existing'}
                    </button>
                    {onCreateTournament && (
                      <button className="create-first-btn" onClick={() => onCreateTournament(currentLeague)}>
                        <Plus size={20} />
                        {t('leagues.createTournament')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--text-primary)' }}>{t('leagues.players')}</h2>
              {isManager && (
                <>
                  {!isAddingPlayer ? (
                    <button className="create-tournament-btn" onClick={() => setIsAddingPlayer(true)}>
                      <Plus size={18} />
                      {t('leagues.addPlayer')}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder={t('leagues.playerName')}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          background: 'var(--input-bg)',
                          color: 'var(--text-primary)'
                        }}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddPlayer()}
                      />
                      <button className="action-btn play" onClick={handleAddPlayer}>
                        <Check size={16} />
                      </button>
                      <button className="action-btn delete" onClick={() => {
                        setIsAddingPlayer(false);
                        setNewPlayerName('');
                      }}>
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {currentLeague.members && currentLeague.members.length > 0 ? (
              <div className="groups-grid">
                {currentLeague.members.map(member => (
                  <div key={member.player?.id || member.id} className="group-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                          {member.player?.name || t('common.unknown')}
                        </h3>
                        {member.role === 'manager' && (
                          <span className="status-badge active" style={{ fontSize: '0.75rem' }}>{t('leagues.manager')}</span>
                        )}
                      </div>
                      {isManager && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={member.isActive}
                              onChange={() => handleTogglePlayerActive(member.player.id, member.isActive)}
                              style={{ cursor: 'pointer' }}
                            />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('leagues.active')}</span>
                          </label>
                          <button
                            className="action-btn delete"
                            onClick={() => handleRemovePlayer(member.player.id)}
                            title={t('leagues.removePlayer')}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Users size={48} />
                <p>{t('leagues.noPlayersYet')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && isManager && (
          <div>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>{t('leagues.leagueSettings')}</h2>
            
            {/* Scoring Rules Editor */}
            <div className="group-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>{t('leagues.scoringRules')}</h3>
                <button 
                  className="create-tournament-btn"
                  onClick={handleSaveScoringRules}
                  disabled={isSavingScoring}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  <Save size={16} />
                  {isSavingScoring ? t('common.saving') : t('leagues.saveChanges')}
                </button>
              </div>
              
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {t('leagues.scoringRulesDescription')}
              </p>
              
              {/* Scoring Rules List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {scoringRules.map((rule, index) => (
                  <div 
                    key={rule.position} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <span style={{ 
                      flex: 1, 
                      color: 'var(--text-primary)',
                      fontWeight: rule.position <= 3 ? '600' : '400'
                    }}>
                      {getPlacementLabel(rule.position)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="number"
                        min="0"
                        value={rule.points}
                        onChange={(e) => handleScoringRuleChange(index, 'points', e.target.value)}
                        style={{
                          width: '80px',
                          padding: '0.5rem',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          background: 'var(--input-bg)',
                          color: 'var(--text-primary)',
                          textAlign: 'center',
                          fontSize: '1rem',
                          fontWeight: '600'
                        }}
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>{t('common.pts')}</span>
                      <button
                        onClick={() => handleRemovePlacement(index)}
                        style={{
                          padding: '0.5rem',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          borderRadius: '4px'
                        }}
                        title={t('leagues.removePlacement')}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Add New Placement */}
              <div style={{ 
                padding: '1rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px dashed var(--border-color)'
              }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  {t('leagues.addNewPlacement')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('leagues.position')}</label>
                    <input
                      type="text"
                      placeholder="e.g. 6"
                      value={newPlacement.position}
                      onChange={(e) => setNewPlacement({ ...newPlacement, position: e.target.value })}
                      style={{
                        width: '80px',
                        padding: '0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        textAlign: 'center'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('leagues.points')}:</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 2"
                      value={newPlacement.points}
                      onChange={(e) => setNewPlacement({ ...newPlacement, points: e.target.value })}
                      style={{
                        width: '80px',
                        padding: '0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        textAlign: 'center'
                      }}
                    />
                  </div>
                  <button 
                    className="action-btn play"
                    onClick={handleAddPlacement}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Plus size={16} />
                    {t('common.add')}
                  </button>
                </div>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  {t('leagues.defaultPlacementTip')}
                </p>
              </div>
            </div>
            
            {/* Default Tournament Settings Editor */}
            <div className="group-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>{t('leagues.defaultTournamentSettings')}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="action-btn delete"
                    onClick={handleResetTournamentDefaults}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    {t('leagues.resetDefaults')}
                  </button>
                  <button
                    className="create-tournament-btn"
                    onClick={handleSaveTournamentDefaults}
                    disabled={isSavingDefaults}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Save size={16} />
                    {isSavingDefaults ? t('common.saving') : t('leagues.saveChanges')}
                  </button>
              </div>
              </div>

              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                {t('leagues.defaultTournamentSettingsDescription')}
              </p>

              {/* Tournament Type */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.5rem' }}>
                  {t('leagues.defaultTournamentType')}
                </label>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="defaultTournamentType"
                      value="groups_with_playoffs"
                      checked={tournamentDefaults.tournamentType === 'groups_with_playoffs'}
                      onChange={(e) => setTournamentDefaults({ ...tournamentDefaults, tournamentType: e.target.value })}
                    />
                    {t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="defaultTournamentType"
                      value="playoff_only"
                      checked={tournamentDefaults.tournamentType === 'playoff_only'}
                      onChange={(e) => setTournamentDefaults({ ...tournamentDefaults, tournamentType: e.target.value })}
                    />
                    {t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}
                  </label>
                </div>
              </div>

              {/* Match Settings */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.5rem' }}>
                  {t('registration.matchSettings')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div className="input-group">
                    <label>{t('leagues.defaultLegsToWin')}</label>
                    <select
                      value={tournamentDefaults.legsToWin}
                      onChange={(e) => setTournamentDefaults({ ...tournamentDefaults, legsToWin: parseInt(e.target.value) })}
                      className="legs-selector"
                    >
                      <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                      <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                      <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                      <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                      <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                      <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                      <option value={9}>{t('tournaments.firstToLegs', { count: 9 })}</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>{t('leagues.defaultStartingScore')}</label>
                    <select
                      value={tournamentDefaults.startingScore}
                      onChange={(e) => setTournamentDefaults({ ...tournamentDefaults, startingScore: parseInt(e.target.value) })}
                    >
                      <option value={301}>301</option>
                      <option value={501}>501</option>
                      <option value={701}>701</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Group Settings - only for groups_with_playoffs */}
              {tournamentDefaults.tournamentType === 'groups_with_playoffs' && (
                <>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.5rem' }}>
                      {t('leagues.defaultGroupSettings')}
                    </label>
                    <div className="radio-group" style={{ marginBottom: '0.75rem' }}>
                      <label>
                        <input
                          type="radio"
                          name="defaultGroupType"
                          value="groups"
                          checked={tournamentDefaults.groupSettings.type === 'groups'}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            groupSettings: { ...tournamentDefaults.groupSettings, type: e.target.value }
                          })}
                        />
                        {t('registration.numberOfGroups')}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="defaultGroupType"
                          value="playersPerGroup"
                          checked={tournamentDefaults.groupSettings.type === 'playersPerGroup'}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            groupSettings: { ...tournamentDefaults.groupSettings, type: e.target.value }
                          })}
                        />
                        {t('registration.playersPerGroup')}
                      </label>
                    </div>
                    <div className="input-group">
                      <label>
                        {tournamentDefaults.groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={tournamentDefaults.groupSettings.type === 'groups' ? '16' : '8'}
                        value={tournamentDefaults.groupSettings.value}
                        onChange={(e) => setTournamentDefaults({
                          ...tournamentDefaults,
                          groupSettings: { ...tournamentDefaults.groupSettings, value: parseInt(e.target.value) || 1 }
                        })}
                      />
                    </div>
                  </div>

                  {/* Standings Criteria Order */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.5rem' }}>
                      {t('leagues.defaultStandingsCriteria')}
                    </label>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                      {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings.'}
                    </p>
                    <div className="criteria-order-list">
                      {tournamentDefaults.standingsCriteriaOrder.map((criterion, index) => {
                        const criterionLabels = {
                          matchesWon: t('registration.matchesWon'),
                          legDifference: t('registration.legDifference'),
                          average: t('registration.average'),
                          headToHead: t('registration.headToHead')
                        };
                        return (
                          <div key={criterion} className="criteria-order-item">
                            <span className="criteria-number" style={{ marginRight: '0.75rem', fontWeight: 'bold', minWidth: '2rem' }}>{index + 1}.</span>
                            <span className="criteria-label" style={{ flex: 1 }}>{criterionLabels[criterion] || criterion}</span>
                            <div className="criteria-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (index > 0) {
                                    const newOrder = [...tournamentDefaults.standingsCriteriaOrder];
                                    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                    setTournamentDefaults({ ...tournamentDefaults, standingsCriteriaOrder: newOrder });
                                  }
                                }}
                                className={index === 0 ? 'move-btn disabled' : 'move-btn'}
                                disabled={index === 0}
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (index < tournamentDefaults.standingsCriteriaOrder.length - 1) {
                                    const newOrder = [...tournamentDefaults.standingsCriteriaOrder];
                                    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                    setTournamentDefaults({ ...tournamentDefaults, standingsCriteriaOrder: newOrder });
                                  }
                                }}
                                className={index === tournamentDefaults.standingsCriteriaOrder.length - 1 ? 'move-btn disabled' : 'move-btn'}
                                disabled={index === tournamentDefaults.standingsCriteriaOrder.length - 1}
                              >
                                <ChevronDown size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Playoff Settings */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontWeight: '600', marginBottom: '0.5rem' }}>
                  {t('leagues.defaultPlayoffSettings')}
                </label>

                {tournamentDefaults.tournamentType === 'groups_with_playoffs' && (
                  <div className="checkbox-group" style={{ marginBottom: '0.75rem' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={tournamentDefaults.playoffSettings.enabled}
                        onChange={(e) => setTournamentDefaults({
                          ...tournamentDefaults,
                          playoffSettings: { ...tournamentDefaults.playoffSettings, enabled: e.target.checked }
                        })}
                      />
                      {t('registration.enablePlayoffs')}
                    </label>
                  </div>
                )}

                {tournamentDefaults.playoffSettings.enabled && (
                  <div className="playoff-options">
                    {tournamentDefaults.tournamentType === 'groups_with_playoffs' ? (
                      <>
                        <div className="radio-section" style={{ marginBottom: '0.75rem' }}>
                          <label className="radio-section-label">{t('leagues.defaultQualificationMode')}</label>
                          <div className="radio-group">
                            <label>
                              <input
                                type="radio"
                                name="defaultQualificationMode"
                                value="perGroup"
                                checked={tournamentDefaults.playoffSettings.qualificationMode === 'perGroup'}
                                onChange={(e) => setTournamentDefaults({
                                  ...tournamentDefaults,
                                  playoffSettings: { ...tournamentDefaults.playoffSettings, qualificationMode: e.target.value }
                                })}
                              />
                              {t('registration.qualificationModePerGroup')}
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="defaultQualificationMode"
                                value="totalPlayers"
                                checked={tournamentDefaults.playoffSettings.qualificationMode === 'totalPlayers'}
                                onChange={(e) => setTournamentDefaults({
                                  ...tournamentDefaults,
                                  playoffSettings: { ...tournamentDefaults.playoffSettings, qualificationMode: e.target.value }
                                })}
                              />
                              {t('registration.qualificationModeTotalPlayers')}
                            </label>
                          </div>
                        </div>

                        {tournamentDefaults.playoffSettings.qualificationMode === 'perGroup' ? (
                          <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label>{t('leagues.defaultPlayersPerGroup')}</label>
                            <select
                              value={tournamentDefaults.playoffSettings.playersPerGroup}
                              onChange={(e) => setTournamentDefaults({
                                ...tournamentDefaults,
                                playoffSettings: { ...tournamentDefaults.playoffSettings, playersPerGroup: parseInt(e.target.value) }
                              })}
                            >
                              {Array.from({ length: 8 }, (_, i) => i + 1).map(num => (
                                <option key={num} value={num}>{num}</option>
                              ))}
                              <option value={9999}>{t('registration.all')}</option>
                            </select>
                          </div>
                        ) : (
                          <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                            <label>{t('leagues.defaultTotalPlayersToAdvance')}</label>
                            <input
                              type="number"
                              min="1"
                              max="64"
                              value={tournamentDefaults.playoffSettings.totalPlayersToAdvance || 8}
                              onChange={(e) => setTournamentDefaults({
                                ...tournamentDefaults,
                                playoffSettings: { ...tournamentDefaults.playoffSettings, totalPlayersToAdvance: parseInt(e.target.value) || 8 }
                              })}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                        <label>{t('leagues.defaultStartingRoundPlayers')}</label>
                        <select
                          value={tournamentDefaults.playoffSettings.startingRoundPlayers}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: { ...tournamentDefaults.playoffSettings, startingRoundPlayers: parseInt(e.target.value) }
                          })}
                        >
                          <option value={2}>{t('management.final') || 'Final (2 players)'}</option>
                          <option value={4}>{t('management.semiFinals') || 'Semi-finals (4 players)'}</option>
                          <option value={8}>{t('management.quarterFinals') || 'Quarter-finals (8 players)'}</option>
                          <option value={16}>{t('management.top16') || 'Round of 16 (16 players)'}</option>
                          <option value={32}>{t('management.top32') || 'Round of 32 (32 players)'}</option>
                        </select>
                      </div>
                    )}

                    {/* 3rd Place Match */}
                    <div className="radio-section" style={{ marginBottom: '0.75rem' }}>
                      <label className="radio-section-label">{t('leagues.defaultThirdPlaceMatch')}</label>
                      <div className="radio-group">
                        <label>
                          <input
                            type="radio"
                            name="defaultThirdPlaceMatch"
                            value="true"
                            checked={tournamentDefaults.playoffSettings.thirdPlaceMatch === true}
                            onChange={() => setTournamentDefaults({
                              ...tournamentDefaults,
                              playoffSettings: { ...tournamentDefaults.playoffSettings, thirdPlaceMatch: true }
                            })}
                          />
                          {t('registration.thirdPlaceMatchYes') || 'Yes - Semifinal losers play for 3rd/4th place'}
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="defaultThirdPlaceMatch"
                            value="false"
                            checked={tournamentDefaults.playoffSettings.thirdPlaceMatch === false}
                            onChange={() => setTournamentDefaults({
                              ...tournamentDefaults,
                              playoffSettings: { ...tournamentDefaults.playoffSettings, thirdPlaceMatch: false }
                            })}
                          />
                          {t('registration.thirdPlaceMatchNo') || 'No - Both semifinal losers share 3rd place'}
                        </label>
                      </div>
                    </div>

                    {/* Playoff Legs by Round */}
                    <div className="playoff-legs-settings">
                      <h5>{t('leagues.defaultPlayoffLegs')}:</h5>
                      <div className="input-group">
                        <label>{t('management.top32')}:</label>
                        <select
                          value={tournamentDefaults.playoffSettings.legsToWinByRound?.[32] || 3}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: {
                              ...tournamentDefaults.playoffSettings,
                              legsToWinByRound: { ...tournamentDefaults.playoffSettings.legsToWinByRound, 32: parseInt(e.target.value) }
                            }
                          })}
                        >
                          {[1,2,3,4,5,6,7].map(v => (
                            <option key={v} value={v}>{v === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: v })}</option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.top16')}:</label>
                        <select
                          value={tournamentDefaults.playoffSettings.legsToWinByRound?.[16] || 3}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: {
                              ...tournamentDefaults.playoffSettings,
                              legsToWinByRound: { ...tournamentDefaults.playoffSettings.legsToWinByRound, 16: parseInt(e.target.value) }
                            }
                          })}
                        >
                          {[1,2,3,4,5,6,7].map(v => (
                            <option key={v} value={v}>{v === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: v })}</option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.quarterFinals')}:</label>
                        <select
                          value={tournamentDefaults.playoffSettings.legsToWinByRound?.[8] || 3}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: {
                              ...tournamentDefaults.playoffSettings,
                              legsToWinByRound: { ...tournamentDefaults.playoffSettings.legsToWinByRound, 8: parseInt(e.target.value) }
                            }
                          })}
                        >
                          {[1,2,3,4,5,6,7].map(v => (
                            <option key={v} value={v}>{v === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: v })}</option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.semiFinals')}:</label>
                        <select
                          value={tournamentDefaults.playoffSettings.legsToWinByRound?.[4] || 3}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: {
                              ...tournamentDefaults.playoffSettings,
                              legsToWinByRound: { ...tournamentDefaults.playoffSettings.legsToWinByRound, 4: parseInt(e.target.value) }
                            }
                          })}
                        >
                          {[1,2,3,4,5,6,7].map(v => (
                            <option key={v} value={v}>{v === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: v })}</option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.final')}:</label>
                        <select
                          value={tournamentDefaults.playoffSettings.legsToWinByRound?.[2] || 3}
                          onChange={(e) => setTournamentDefaults({
                            ...tournamentDefaults,
                            playoffSettings: {
                              ...tournamentDefaults.playoffSettings,
                              legsToWinByRound: { ...tournamentDefaults.playoffSettings.legsToWinByRound, 2: parseInt(e.target.value) }
                            }
                          })}
                        >
                          {[1,2,3,4,5,6,7].map(v => (
                            <option key={v} value={v}>{v === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: v })}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


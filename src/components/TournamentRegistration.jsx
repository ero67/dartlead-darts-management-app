import React, { useState, useEffect } from 'react';
import { Plus, Users, Play, ArrowLeft, Settings, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tournamentService } from '../services/tournamentService';

export function TournamentRegistration({ tournament, onBack }) {
  const { t } = useLanguage();
  // Ensure players is always an array
  const players = tournament.players || [];
  const [newPlayerName, setNewPlayerName] = useState('');
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [showGroupsPreview, setShowGroupsPreview] = useState(false);
  const [draftGroups, setDraftGroups] = useState([]);
  const [tournamentSettings, setTournamentSettings] = useState({
    legsToWin: tournament.legsToWin || 3,
    startingScore: tournament.startingScore || 501,
    tournamentType: tournament.tournamentType || 'groups_with_playoffs',
    groupSettings: tournament.groupSettings || {
      type: 'groups', // 'groups' or 'playersPerGroup'
      value: 2,
      standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead']
    },
    standingsCriteriaOrder: tournament.standingsCriteriaOrder || tournament.groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
    playoffSettings: (() => {
      const existing = tournament.playoffSettings;
      if (existing && existing.legsToWinByRound) {
        return existing;
      }
      // Migrate old structure to new structure
      if (existing && existing.playoffLegsToWin) {
        return {
          ...existing,
          legsToWinByRound: {
            32: existing.playoffLegsToWin,
            16: existing.playoffLegsToWin,
            8: existing.playoffLegsToWin,
            4: existing.playoffLegsToWin,
            2: existing.playoffLegsToWin
          }
        };
      }
      // Default new structure
      return {
        enabled: false,
        qualificationMode: 'perGroup',
        playersPerGroup: 1,
        totalPlayersToAdvance: 8,
        seedingMethod: tournament.playoffSettings?.seedingMethod || 'standard',
        groupMatchups: tournament.playoffSettings?.groupMatchups || [],
        startingRoundPlayers: tournament.playoffSettings?.startingRoundPlayers || 8,
        legsToWinByRound: {
          32: 3,  // Round of 32
          16: 3,  // Round of 16
          8: 3,   // Quarter-finals
          4: 3,   // Semi-finals
          2: 3    // Final
        }
      };
    })()
  });
  const { addPlayerToTournament, removePlayerFromTournament, startTournament, updateTournamentSettings } = useTournament();

  // Update tournamentSettings when tournament prop changes (e.g., after reload from DB)
  useEffect(() => {
    if (tournament) {
      setTournamentSettings({
        legsToWin: tournament.legsToWin || 3,
        startingScore: tournament.startingScore || 501,
        tournamentType: tournament.tournamentType || 'groups_with_playoffs',
        groupSettings: tournament.groupSettings || {
          type: 'groups',
          value: 2,
          standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead']
        },
        standingsCriteriaOrder: tournament.standingsCriteriaOrder || tournament.groupSettings?.standingsCriteriaOrder || ['matchesWon', 'legDifference', 'average', 'headToHead'],
        playoffSettings: (() => {
          const existing = tournament.playoffSettings;
          if (existing && existing.legsToWinByRound) {
            return existing;
          }
          // Migrate old structure to new structure
          if (existing && existing.playoffLegsToWin) {
            return {
              ...existing,
              legsToWinByRound: {
                16: existing.playoffLegsToWin,
                8: existing.playoffLegsToWin,
                4: existing.playoffLegsToWin,
                2: existing.playoffLegsToWin
              }
            };
          }
          // Default new structure
          return {
            enabled: false,
            qualificationMode: 'perGroup',
            playersPerGroup: 1,
            totalPlayersToAdvance: 8,
            startingRoundPlayers: tournament.playoffSettings?.startingRoundPlayers || 8,
            legsToWinByRound: {
              16: 3,  // Round of 16
              8: 3,   // Quarter-finals
              4: 3,   // Semi-finals
              2: 3    // Final
            }
          };
        })()
      });
    }
  }, [tournament?.id, tournament?.legsToWin, tournament?.startingScore, tournament?.tournamentType, tournament?.groupSettings, tournament?.standingsCriteriaOrder, tournament?.playoffSettings]);

  const addPlayer = async () => {
    if (!newPlayerName.trim()) {
      alert(t('registration.pleaseEnterPlayerName'));
      return;
    }

    if (players.length >= 64) {
      alert(t('registration.tournamentFull'));
      return;
    }

    try {
      await addPlayerToTournament(newPlayerName.trim());
      setNewPlayerName('');
    } catch (error) {
      console.error('Error adding player:', error);
      alert(t('registration.failedToAddPlayer'));
    }
  };

  const removePlayer = async (playerId) => {
    if (tournament.status !== 'open_for_registration') {
      alert(t('registration.cannotRemovePlayerAfterStart') || 'Cannot remove players after tournament has started');
      return;
    }

    if (!confirm(t('registration.confirmRemovePlayer') || `Are you sure you want to remove this player?`)) {
      return;
    }

    try {
      await removePlayerFromTournament(playerId);
    } catch (error) {
      console.error('Error removing player:', error);
      alert(t('registration.failedToRemovePlayer') || 'Failed to remove player. Please try again.');
    }
  };

  const handleStartTournament = async () => {
    if (players.length < 2) {
      alert(t('registration.needsAtLeast2Players'));
      return;
    }

    try {
      // For playoff-only tournaments, there is no group stage to generate
      if (tournament.tournamentType === 'playoff_only') {
        // Just mark tournament as started in DB via settings update
        await updateTournamentSettings(tournament.id, {
          ...tournamentSettings,
          status: 'started'
        });
      } else {
        // Show preview + allow edits before we officially start (create groups + matches in DB)
        const generated = tournamentService.generateGroups(players, tournamentSettings.groupSettings);
        setDraftGroups(generated);
        setShowGroupsPreview(true);
      }
    } catch (error) {
      console.error('Error starting tournament:', error);
      alert(t('registration.failedToStartTournament'));
    }
  };

  const movePlayerToGroup = (playerId, toGroupId) => {
    setDraftGroups(prev => {
      const fromGroup = prev.find(g => (g.players || []).some(p => p.id === playerId));
      if (!fromGroup) return prev;
      if (fromGroup.id === toGroupId) return prev;

      const playerObj = (fromGroup.players || []).find(p => p.id === playerId);
      if (!playerObj) return prev;

      return prev.map(g => {
        if (g.id === fromGroup.id) {
          return { ...g, players: (g.players || []).filter(p => p.id !== playerId) };
        }
        if (g.id === toGroupId) {
          return { ...g, players: [...(g.players || []), playerObj] };
        }
        return g;
      }).filter(g => (g.players || []).length > 0);
    });
  };

  const regenerateGroupsPreview = () => {
    const generated = tournamentService.generateGroups(players, tournamentSettings.groupSettings);
    setDraftGroups(generated);
  };

  const confirmStartWithGroups = async () => {
    try {
      await startTournament(tournamentSettings.groupSettings, draftGroups);
      setShowGroupsPreview(false);
    } catch (error) {
      console.error('Error starting tournament with custom groups:', error);
      alert(t('registration.failedToStartTournament'));
    }
  };

  const updateSettings = async () => {
    try {
      await updateTournamentSettings(tournament.id, tournamentSettings);
      setShowEditSettings(false);
      alert(t('registration.settingsUpdatedSuccessfully'));
    } catch (error) {
      console.error('Error updating tournament settings:', error);
      alert(t('registration.failedToUpdateSettings'));
    }
  };

  return (
    <div className="tournament-registration">
      <div className="registration-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('registration.backToTournaments')}
        </button>
        <h1>{tournament.name}</h1>
        <div className="header-actions">
          <button 
            className="edit-settings-btn"
            onClick={() => setShowEditSettings(true)}
            title={t('registration.editTournamentSettings')}
          >
            <Settings size={18} />
            {t('registration.editSettings')}
          </button>
          <div className="tournament-status">
            <span className="status-badge open">{t('registration.openForRegistration')}</span>
          </div>
        </div>
      </div>

      <div className="registration-content">
        <div className="players-section">
          <div className="section-header">
            <h2>
              <Users size={20} />
              {t('registration.players')} ({players.length})
            </h2>
            <div className="add-player-form">
              <input
                type="text"
                placeholder={t('registration.enterPlayerName')}
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
                maxLength={50}
              />
              <button 
                className="add-player-btn"
                onClick={addPlayer}
                disabled={!newPlayerName.trim() || players.length >= 64}
              >
                <Plus size={16} />
                {t('registration.addPlayer')}
              </button>
            </div>
          </div>

          <div className="players-list">
            {players.length === 0 ? (
              <div className="no-players">
                <p>{t('registration.noPlayersYet')}</p>
              </div>
            ) : (
              <div className="players-grid">
                {players.map((player, index) => (
                  <div key={player.id} className="player-card">
                    <span className="player-number">{index + 1}</span>
                    <span className="player-name">{player.name}</span>
                    {tournament.status === 'open_for_registration' && (
                      <button
                        className="remove-player-btn"
                        onClick={() => removePlayer(player.id)}
                        title={t('registration.removePlayer') || 'Remove player'}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {players.length >= 2 && (
          <div className="start-tournament-section">
            <button 
              className="start-tournament-btn"
              onClick={handleStartTournament}
            >
              <Play size={20} />
              {t('registration.startTournament')}
            </button>
          </div>
        )}
      </div>

      {/* Edit Settings Modal */}
      {showEditSettings && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{t('registration.editTournamentSettings')}</h3>
              <button 
                className="close-btn"
                onClick={() => setShowEditSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="group-settings">
                <h4>{t('registration.tournamentType') || 'Tournament Type'}</h4>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="tournamentType"
                      value="groups_with_playoffs"
                      checked={tournamentSettings.tournamentType === 'groups_with_playoffs'}
                      onChange={(e) => setTournamentSettings(prev => ({
                        ...prev,
                        tournamentType: e.target.value,
                        // If switching back to groups, keep playoffs enabled toggle as-is
                        playoffSettings: {
                          ...prev.playoffSettings,
                          enabled: prev.playoffSettings.enabled ?? false
                        }
                      }))}
                    />
                    {t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="tournamentType"
                      value="playoff_only"
                      checked={tournamentSettings.tournamentType === 'playoff_only'}
                      onChange={(e) => setTournamentSettings(prev => ({
                        ...prev,
                        tournamentType: e.target.value,
                        // Playoff-only tournaments must have playoffs enabled
                        playoffSettings: {
                          ...prev.playoffSettings,
                          enabled: true
                        }
                      }))}
                    />
                    {t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}
                  </label>
                </div>
              </div>

              <div className="group-settings">
                <h4>{t('registration.matchSettings')}</h4>
                <div className="input-group">
                  <label>{t('registration.legsToWin')}:</label>
                  <select 
                    value={tournamentSettings.legsToWin}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      legsToWin: parseInt(e.target.value)
                    })}
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
                  <label>{t('registration.startingScore')}:</label>
                  <select 
                    value={tournamentSettings.startingScore}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      startingScore: parseInt(e.target.value)
                    })}
                  >
                    <option value={301}>301</option>
                    <option value={501}>501</option>
                    <option value={701}>701</option>
                  </select>
                </div>
              </div>

              {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
              <div className="group-settings">
                <h4>{t('registration.standingsCriteriaOrder')}</h4>
                <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings.'}
                </p>
                <div className="criteria-order-list" style={{ marginBottom: '1.5rem' }}>
                  {tournamentSettings.standingsCriteriaOrder.map((criterion, index) => {
                    const criterionLabels = {
                      matchesWon: t('registration.matchesWon'),
                      legDifference: t('registration.legDifference'),
                      average: t('registration.average'),
                      headToHead: t('registration.headToHead')
                    };
                    return (
                      <div key={criterion} className="criteria-order-item">
                        <span className="criteria-number">{index + 1}.</span>
                        <span className="criteria-label">{criterionLabels[criterion] || criterion}</span>
                        <div className="criteria-actions">
                          <button
                            type="button"
                            className={index === 0 ? 'move-btn disabled' : 'move-btn'}
                            onClick={() => {
                              if (index > 0) {
                                const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                setTournamentSettings({
                                  ...tournamentSettings,
                                  standingsCriteriaOrder: newOrder
                                });
                              }
                            }}
                            disabled={index === 0}
                            title={t('registration.moveUp')}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className={index === tournamentSettings.standingsCriteriaOrder.length - 1 ? 'move-btn disabled' : 'move-btn'}
                            onClick={() => {
                              if (index < tournamentSettings.standingsCriteriaOrder.length - 1) {
                                const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                                [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                setTournamentSettings({
                                  ...tournamentSettings,
                                  standingsCriteriaOrder: newOrder
                                });
                              }
                            }}
                            disabled={index === tournamentSettings.standingsCriteriaOrder.length - 1}
                            title={t('registration.moveDown')}
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

              {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
              <div className="group-settings">
                <h4>{t('registration.groupSettings')}</h4>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="groups"
                      checked={tournamentSettings.groupSettings.type === 'groups'}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    {t('registration.numberOfGroups')}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="groupType"
                      value="playersPerGroup"
                      checked={tournamentSettings.groupSettings.type === 'playersPerGroup'}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        groupSettings: {
                          ...tournamentSettings.groupSettings,
                          type: e.target.value
                        }
                      })}
                    />
                    {t('registration.playersPerGroup')}
                  </label>
                </div>
                <div className="input-group">
                  <label>
                    {tournamentSettings.groupSettings.type === 'groups' ? t('registration.numberOfGroups') : t('registration.playersPerGroup')}:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={tournamentSettings.groupSettings.type === 'groups' ? '16' : '8'}
                    value={tournamentSettings.groupSettings.value}
                    onChange={(e) => setTournamentSettings({
                      ...tournamentSettings,
                      groupSettings: {
                        ...tournamentSettings.groupSettings,
                        value: parseInt(e.target.value) || 1
                      }
                    })}
                  />
                </div>
              </div>
              )}

              <div className="group-settings">
                <h4>{t('registration.playoffSettings')}</h4>
                {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
                <div className="checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={tournamentSettings.playoffSettings.enabled}
                      onChange={(e) => setTournamentSettings({
                        ...tournamentSettings,
                        playoffSettings: {
                          ...tournamentSettings.playoffSettings,
                          enabled: e.target.checked
                        }
                      })}
                    />
                    {t('registration.enablePlayoffs')}
                  </label>
                </div>
                )}
                
                {tournamentSettings.playoffSettings.enabled && (() => {
                  // Calculate max players per group based on group settings
                  const calculateMaxPlayersPerGroup = () => {
                    if (tournamentSettings.groupSettings.type === 'groups') {
                      return Math.ceil(players.length / tournamentSettings.groupSettings.value);
                    } else {
                      return tournamentSettings.groupSettings.value;
                    }
                  };
                  const maxPlayersPerGroup = calculateMaxPlayersPerGroup();
                  const allPlayersValue = 9999; // Special value to represent "all players"
                  
                  return (
                    <div className="playoff-options">
                      {tournamentSettings.tournamentType === 'groups_with_playoffs' ? (
                        <>
                          <div className="input-group">
                            <label>{t('registration.qualificationMode')}</label>
                            <div className="radio-group">
                              <label>
                                <input
                                  type="radio"
                                  name="qualificationMode"
                                  value="perGroup"
                                  checked={tournamentSettings.playoffSettings.qualificationMode === 'perGroup'}
                                  onChange={(e) => setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      qualificationMode: e.target.value
                                    }
                                  })}
                                />
                                {t('registration.qualificationModePerGroup')}
                              </label>
                              <label>
                                <input
                                  type="radio"
                                  name="qualificationMode"
                                  value="totalPlayers"
                                  checked={tournamentSettings.playoffSettings.qualificationMode === 'totalPlayers'}
                                  onChange={(e) => setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      qualificationMode: e.target.value
                                    }
                                  })}
                                />
                                {t('registration.qualificationModeTotalPlayers')}
                              </label>
                            </div>
                          </div>

                          {tournamentSettings.playoffSettings.qualificationMode === 'perGroup' ? (
                      <div className="input-group">
                        <label>{t('registration.playersAdvancingPerGroup')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.playersPerGroup}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              playersPerGroup: parseInt(e.target.value)
                            }
                          })}
                        >
                          {Array.from({ length: maxPlayersPerGroup }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                                <option value={allPlayersValue}>{t('registration.all') || 'All'}</option>
                        </select>
                      </div>
                          ) : (
                            <div className="input-group">
                              <label>{t('registration.totalPlayersToAdvance')}</label>
                              <input
                                type="number"
                                min="1"
                                max="64"
                                value={tournamentSettings.playoffSettings.totalPlayersToAdvance || 8}
                                onChange={(e) => setTournamentSettings({
                                  ...tournamentSettings,
                                  playoffSettings: {
                                    ...tournamentSettings.playoffSettings,
                                    totalPlayersToAdvance: parseInt(e.target.value) || 8
                                  }
                                })}
                              />
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                {t('registration.totalPlayersDescription')}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="input-group">
                          <label>{t('registration.playoffStartStage') || 'Playoff starts from'}</label>
                          <select
                            value={tournamentSettings.playoffSettings.startingRoundPlayers || 8}
                            onChange={(e) => setTournamentSettings({
                              ...tournamentSettings,
                              playoffSettings: {
                                ...tournamentSettings.playoffSettings,
                                startingRoundPlayers: parseInt(e.target.value)
                              }
                            })}
                          >
                            <option value={2}>{t('management.final') || 'Final (2 players)'}</option>
                            <option value={4}>{t('management.semiFinals') || 'Semi-finals (4 players)'}</option>
                            <option value={8}>{t('management.quarterFinals') || 'Quarter-finals (8 players)'}</option>
                            <option value={16}>{t('management.top16') || 'Round of 16 (16 players)'}</option>
                            <option value={32}>{t('management.top32') || 'Round of 32 (32 players)'}</option>
                          </select>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            {t('registration.playoffStartStageDescription') || 'This defines from which round the knockout bracket begins.'}
                          </p>
                        </div>
                      )}
                      
                      {tournamentSettings.tournamentType === 'groups_with_playoffs' && (
                      <div className="input-group">
                        <label>{t('registration.seedingMethod') || 'Seeding Method'}</label>
                        <div className="radio-group">
                          <label>
                            <input
                              type="radio"
                              name="seedingMethod"
                              value="standard"
                              checked={tournamentSettings.playoffSettings.seedingMethod === 'standard'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  seedingMethod: e.target.value
                                }
                              })}
                            />
                            {t('registration.seedingMethodStandard') || 'Standard Tournament Seeding'}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="seedingMethod"
                              value="groupBased"
                              checked={tournamentSettings.playoffSettings.seedingMethod === 'groupBased'}
                              onChange={(e) => setTournamentSettings({
                                ...tournamentSettings,
                                playoffSettings: {
                                  ...tournamentSettings.playoffSettings,
                                  seedingMethod: e.target.value
                                }
                              })}
                            />
                            {t('registration.seedingMethodGroupBased') || 'Group-Based Seeding'}
                          </label>
                        </div>
                      </div>
                      )}

                      {tournamentSettings.playoffSettings.seedingMethod === 'groupBased' && (
                        <div className="input-group">
                          <label>{t('registration.groupMatchups') || 'Group Matchups'}</label>
                          {tournament.groups && tournament.groups.length > 0 ? (
                            <>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                {t('registration.groupMatchupsDescription') || 'Configure which groups play against each other. 1st from Group A vs last advancing from Group D, etc.'}
                              </p>
                          <div className="group-matchups-config" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {(() => {
                              const groups = tournament.groups || [];
                              const numGroups = groups.length;
                              const matchups = tournamentSettings.playoffSettings.groupMatchups || [];
                              
                              // Initialize matchups if empty
                              if (matchups.length === 0 && numGroups >= 2) {
                                // Auto-generate default matchups: A vs last group, B vs second-to-last, etc.
                                const defaultMatchups = [];
                                for (let i = 0; i < Math.floor(numGroups / 2); i++) {
                                  const group1Index = i;
                                  const group2Index = numGroups - 1 - i;
                                  defaultMatchups.push({
                                    group1: groups[group1Index]?.name || `Group ${String.fromCharCode(65 + group1Index)}`,
                                    group2: groups[group2Index]?.name || `Group ${String.fromCharCode(65 + group2Index)}`
                                  });
                                }
                                // Update state with default matchups
                                setTimeout(() => {
                                  setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      groupMatchups: defaultMatchups
                                    }
                                  });
                                }, 0);
                                return null;
                              }
                              
                              return matchups.map((matchup, index) => {
                                const availableGroups = groups.map(g => g.name);
                                return (
                                  <div key={index} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem',
                                    padding: '0.75rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--bg-tertiary)'
                                  }}>
                                    <select
                                      value={matchup.group1}
                                      onChange={(e) => {
                                        const newMatchups = [...matchups];
                                        newMatchups[index].group1 = e.target.value;
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        flex: 1, 
                                        padding: '0.5rem',
                                        backgroundColor: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {availableGroups.map(groupName => (
                                        <option key={groupName} value={groupName}>{groupName}</option>
                                      ))}
                                    </select>
                                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>vs</span>
                                    <select
                                      value={matchup.group2}
                                      onChange={(e) => {
                                        const newMatchups = [...matchups];
                                        newMatchups[index].group2 = e.target.value;
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        flex: 1, 
                                        padding: '0.5rem',
                                        backgroundColor: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      {availableGroups.map(groupName => (
                                        <option key={groupName} value={groupName}>{groupName}</option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newMatchups = matchups.filter((_, i) => i !== index);
                                        setTournamentSettings({
                                          ...tournamentSettings,
                                          playoffSettings: {
                                            ...tournamentSettings.playoffSettings,
                                            groupMatchups: newMatchups
                                          }
                                        });
                                      }}
                                      style={{ 
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--card-bg)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.target.style.backgroundColor = 'var(--bg-tertiary)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.target.style.backgroundColor = 'var(--card-bg)';
                                      }}
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                );
                              });
                            })()}
                            <button
                              type="button"
                              onClick={() => {
                                const groups = tournament.groups || [];
                                const availableGroups = groups.map(g => g.name);
                                if (availableGroups.length >= 2) {
                                  const newMatchups = [
                                    ...(tournamentSettings.playoffSettings.groupMatchups || []),
                                    { group1: availableGroups[0], group2: availableGroups[1] }
                                  ];
                                  setTournamentSettings({
                                    ...tournamentSettings,
                                    playoffSettings: {
                                      ...tournamentSettings.playoffSettings,
                                      groupMatchups: newMatchups
                                    }
                                  });
                                }
                              }}
                              style={{
                                padding: '0.5rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                alignSelf: 'flex-start',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.backgroundColor = 'var(--bg-tertiary)';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'var(--card-bg)';
                              }}
                            >
                              {t('registration.addGroupMatchup') || '+ Add Group Matchup'}
                            </button>
                          </div>
                            </>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                              {t('registration.groupMatchupsNote') || 'Note: Groups must be created first (start the tournament) before you can configure group matchups.'}
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="playoff-legs-settings">
                      <h5>{t('registration.playoffLegsToWin')}:</h5>
                      <div className="input-group">
                        <label>{t('management.top32')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[32] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                32: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.top16')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[16] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                16: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.quarterFinals')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[8] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                8: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.semiFinals')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[4] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                4: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>{t('management.final')}:</label>
                        <select 
                          value={tournamentSettings.playoffSettings.legsToWinByRound?.[2] || 3}
                          onChange={(e) => setTournamentSettings({
                            ...tournamentSettings,
                            playoffSettings: {
                              ...tournamentSettings.playoffSettings,
                              legsToWinByRound: {
                                ...tournamentSettings.playoffSettings.legsToWinByRound,
                                2: parseInt(e.target.value)
                              }
                            }
                          })}
                        >
                          <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                          <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                          <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                          <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                          <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowEditSettings(false)}
              >
                {t('common.cancel')}
              </button>
              <button 
                className="confirm-btn"
                onClick={updateSettings}
              >
                {t('registration.updateSettings')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups Preview + Edit Modal (before tournament officially starts) */}
      {showGroupsPreview && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '900px' }}>
            <div className="modal-header">
              <h3>{t('registration.groupPreviewTitle') || 'Groups preview (edit before start)'}</h3>
              <button
                className="close-btn"
                onClick={() => setShowGroupsPreview(false)}
                title={t('common.close') || 'Close'}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                {t('registration.groupPreviewHint') || 'You can move players between groups. Groups + matches will be created only after you confirm Start.'}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="secondary-btn" onClick={regenerateGroupsPreview}>
                  {t('registration.regenerateGroups') || 'Shuffle / regenerate'}
                </button>
              </div>

              <div className="groups-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {draftGroups.map(group => (
                  <div key={group.id} className="group-preview-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem', gap: '0.5rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{group.name}</strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{(group.players || []).length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {(group.players || []).map(player => (
                        <div key={player.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{player.name}</span>
                          <select
                            value={group.id}
                            onChange={(e) => movePlayerToGroup(player.id, e.target.value)}
                            style={{ maxWidth: '120px' }}
                            title={t('registration.moveToGroup') || 'Move to group'}
                          >
                            {draftGroups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowGroupsPreview(false)}>
                {t('registration.cancel') || 'Cancel'}
              </button>
              <button className="save-btn" onClick={confirmStartWithGroups}>
                <Play size={18} />
                {t('registration.startTournament') || 'Start Tournament'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

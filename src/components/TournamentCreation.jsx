import React, { useState, useEffect } from 'react';
import { Trophy, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { useLocation } from 'react-router-dom';

// Generate unique ID for tournaments
const generateId = () => {
  return crypto.randomUUID();
};

export function TournamentCreation({ onTournamentCreated, onBack }) {
  const { t } = useLanguage();
  const { currentLeague, selectLeague } = useLeague();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const leagueId = searchParams.get('leagueId');
  
  // Initialize with league defaults if available
  const leagueDefaults = currentLeague?.defaultTournamentSettings || {};
  
  const [tournamentName, setTournamentName] = useState('');
  const [legsToWin, setLegsToWin] = useState(leagueDefaults.legsToWin || 3);
  const [startingScore, setStartingScore] = useState(leagueDefaults.startingScore || 501);
  const [tournamentType, setTournamentType] = useState(leagueDefaults.tournamentType || 'groups_with_playoffs');
  const [groupSettings, setGroupSettings] = useState(leagueDefaults.groupSettings || {
    type: 'groups',
    value: 2
  });
  const [standingsCriteriaOrder, setStandingsCriteriaOrder] = useState(
    leagueDefaults.standingsCriteriaOrder || [
      'matchesWon',
      'legDifference',
      'average',
      'headToHead'
    ]
  );
  const [playoffSettings, setPlayoffSettings] = useState(leagueDefaults.playoffSettings || {
    enabled: true,
    qualificationMode: 'perGroup',
    playersPerGroup: 1,
    totalPlayersToAdvance: 8,
    startingRoundPlayers: 8,
    seedingMethod: 'groupBased',
    groupMatchups: [],
    thirdPlaceMatch: true, // Whether to play a 3rd place match or both semifinal losers share 3rd
    legsToWinByRound: {
      32: 3,
      16: 3,
      8: 3,
      4: 3,
      2: 3
    }
  });
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  // Load league if leagueId is provided
  useEffect(() => {
    if (leagueId && (!currentLeague || currentLeague.id !== leagueId)) {
      selectLeague(leagueId);
    }
  }, [leagueId, currentLeague, selectLeague]);

  // Auto-select active league members when league is loaded
  useEffect(() => {
    if (currentLeague && currentLeague.members && leagueId) {
      const activeMembers = currentLeague.members
        .filter(m => m.isActive)
        .map(m => m.player);
      setSelectedPlayers(activeMembers);
    }
  }, [currentLeague, leagueId]);

  const createTournament = () => {
    if (!tournamentName.trim()) {
      alert(t('tournaments.pleaseEnterName'));
      return;
    }

    const tournament = {
      id: generateId(),
      name: tournamentName.trim(),
      players: selectedPlayers.length > 0 ? selectedPlayers : [], // Pre-populate with league members if available
      groups: [], // Groups will be generated when tournament starts
      legsToWin: legsToWin,
      startingScore: startingScore,
      groupSettings: groupSettings,
      playoffSettings: playoffSettings,
      tournamentType,
      standingsCriteriaOrder: standingsCriteriaOrder,
      playoffs: null, // Playoffs will be created only when user clicks "Start Playoffs"
      leagueId: leagueId || null, // Link to league if created from league
      createdAt: new Date().toISOString(),
      status: 'open_for_registration' // Tournament is open for player registration
    };

    onTournamentCreated(tournament);
  };



  return (
    <div className="tournament-creation">
      <div className="creation-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('common.backToDashboard')}
        </button>
        <div className="header-content">
          <Trophy className="header-icon" />
          <h2>{t('tournaments.createNew')}</h2>
        </div>
      </div>

      <div className="creation-form">
        <div className="form-section">
          <h3>{t('registration.tournamentType') || 'Tournament Type'}</h3>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                name="tournamentType"
                value="groups_with_playoffs"
                checked={tournamentType === 'groups_with_playoffs'}
                onChange={(e) => setTournamentType(e.target.value)}
              />
              {t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}
            </label>
            <label>
              <input
                type="radio"
                name="tournamentType"
                value="playoff_only"
                checked={tournamentType === 'playoff_only'}
                onChange={(e) => setTournamentType(e.target.value)}
              />
              {t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}
            </label>
          </div>
        </div>

        <div className="form-section">
          <label htmlFor="tournament-name">{t('tournaments.tournamentName')}</label>
          <input
            id="tournament-name"
            type="text"
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            placeholder={t('tournaments.enterTournamentName')}
            maxLength={50}
          />
        </div>

        <div className="form-section">
          <h3>{t('registration.matchSettings')}</h3>
          <div className="input-group">
            <label htmlFor="legs-to-win">{t('tournaments.defaultLegsToWin')}</label>
            <select
              id="legs-to-win"
              value={legsToWin}
              onChange={(e) => setLegsToWin(parseInt(e.target.value))}
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
            <label htmlFor="starting-score">{t('tournaments.startingScore')}:</label>
            <select
              id="starting-score"
              value={startingScore}
              onChange={(e) => setStartingScore(parseInt(e.target.value))}
            >
              <option value={301}>301</option>
              <option value={501}>501</option>
              <option value={701}>701</option>
            </select>
          </div>
        </div>

        <div className="form-section">
          {tournamentType === 'groups_with_playoffs' && (
          <>
          <h3>{t('registration.standingsCriteriaOrder')}</h3>
          <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings. Criteria will be used in this order when values are equal.'}
          </p>
          <div className="criteria-order-list" style={{ marginBottom: '1.5rem' }}>
            {standingsCriteriaOrder.map((criterion, index) => {
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
                          const newOrder = [...standingsCriteriaOrder];
                          [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                          setStandingsCriteriaOrder(newOrder);
                        }
                      }}
                      title={t('registration.moveUp')}
                      className={index === 0 ? 'move-btn disabled' : 'move-btn'}
                      disabled={index === 0}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (index < standingsCriteriaOrder.length - 1) {
                          const newOrder = [...standingsCriteriaOrder];
                          [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                          setStandingsCriteriaOrder(newOrder);
                        }
                      }}
                      title={t('registration.moveDown')}
                      className={index === standingsCriteriaOrder.length - 1 ? 'move-btn disabled' : 'move-btn'}
                      disabled={index === standingsCriteriaOrder.length - 1}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>

        {tournamentType === 'groups_with_playoffs' && (
          <div className="form-section">
            <h3>{t('registration.groupSettings')}</h3>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="groupType"
                  value="groups"
                  checked={groupSettings.type === 'groups'}
                  onChange={(e) => setGroupSettings({
                    ...groupSettings,
                    type: e.target.value
                  })}
                />
                {t('registration.numberOfGroups')}
              </label>
              <label>
                <input
                  type="radio"
                  name="groupType"
                  value="playersPerGroup"
                  checked={groupSettings.type === 'playersPerGroup'}
                  onChange={(e) => setGroupSettings({
                    ...groupSettings,
                    type: e.target.value
                  })}
                />
                {t('registration.playersPerGroup')}
              </label>
            </div>
            <div className="input-group">
              <label>
                {groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
              </label>
              <input
                type="number"
                min="1"
                max={groupSettings.type === 'groups' ? '16' : '8'}
                value={groupSettings.value}
                onChange={(e) => setGroupSettings({
                  ...groupSettings,
                  value: parseInt(e.target.value) || 1
                })}
              />
            </div>
          </div>
        )}

        <div className="form-section">
          <h3>{t('registration.playoffSettings')}</h3>
          
          {tournamentType === 'groups_with_playoffs' && (
            <div className="checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={playoffSettings.enabled}
                  onChange={(e) => setPlayoffSettings({
                    ...playoffSettings,
                    enabled: e.target.checked
                  })}
                />
                {t('registration.enablePlayoffs')}
              </label>
            </div>
          )}
          
          {playoffSettings.enabled && (
            <div className="playoff-options">
              {tournamentType === 'groups_with_playoffs' ? (
                <>
                  <div className="radio-section">
                    <label className="radio-section-label">{t('registration.qualificationMode')}</label>
                    <div className="radio-group">
                      <label>
                        <input
                          type="radio"
                          name="qualificationMode"
                          value="perGroup"
                          checked={playoffSettings.qualificationMode === 'perGroup'}
                          onChange={(e) => setPlayoffSettings({
                            ...playoffSettings,
                            qualificationMode: e.target.value
                          })}
                        />
                        {t('registration.qualificationModePerGroup')}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="qualificationMode"
                          value="totalPlayers"
                          checked={playoffSettings.qualificationMode === 'totalPlayers'}
                          onChange={(e) => setPlayoffSettings({
                            ...playoffSettings,
                            qualificationMode: e.target.value
                          })}
                        />
                        {t('registration.qualificationModeTotalPlayers')}
                      </label>
                    </div>
                  </div>
                  
                  {playoffSettings.qualificationMode === 'perGroup' ? (
                    <div className="input-group">
                      <label>{t('registration.playersAdvancingPerGroup')}</label>
                      <select 
                        value={playoffSettings.playersPerGroup}
                        onChange={(e) => setPlayoffSettings({
                          ...playoffSettings,
                          playersPerGroup: parseInt(e.target.value)
                        })}
                      >
                        {Array.from({ length: 8 }, (_, i) => i + 1).map(num => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                        <option value={9999}>{t('registration.all')}</option>
                      </select>
                    </div>
                  ) : (
                    <div className="input-group">
                      <label>{t('registration.totalPlayersToAdvance')}</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={playoffSettings.totalPlayersToAdvance || 8}
                        onChange={(e) => setPlayoffSettings({
                          ...playoffSettings,
                          totalPlayersToAdvance: parseInt(e.target.value) || 8
                        })}
                      />
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        {t('registration.totalPlayersDescription')}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="input-group">
                    <label>{t('registration.playoffStartStage') || 'Playoff starts from'}</label>
                    <select
                      value={playoffSettings.startingRoundPlayers}
                      onChange={(e) => setPlayoffSettings({
                        ...playoffSettings,
                        startingRoundPlayers: parseInt(e.target.value)
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
                </>
              )}
              


              <div className="radio-section">
                <label className="radio-section-label">{t('registration.thirdPlaceMatch') || '3rd Place Match'}</label>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="thirdPlaceMatch"
                      value="true"
                      checked={playoffSettings.thirdPlaceMatch === true}
                      onChange={() => setPlayoffSettings({
                        ...playoffSettings,
                        thirdPlaceMatch: true
                      })}
                    />
                    {t('registration.thirdPlaceMatchYes') || 'Yes - Semifinal losers play for 3rd/4th place'}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="thirdPlaceMatch"
                      value="false"
                      checked={playoffSettings.thirdPlaceMatch === false}
                      onChange={() => setPlayoffSettings({
                        ...playoffSettings,
                        thirdPlaceMatch: false
                      })}
                    />
                    {t('registration.thirdPlaceMatchNo') || 'No - Both semifinal losers share 3rd place'}
                  </label>
                </div>
              </div>
              
              <div className="playoff-legs-settings">
                <h5>{t('registration.playoffLegsToWin')}:</h5>
                <div className="input-group">
                  <label>{t('management.top32')}:</label>
                  <select 
                    value={playoffSettings.legsToWinByRound?.[32] || 3}
                    onChange={(e) => setPlayoffSettings({
                      ...playoffSettings,
                      legsToWinByRound: {
                        ...playoffSettings.legsToWinByRound,
                        32: parseInt(e.target.value)
                      }
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('management.top16')}:</label>
                  <select 
                    value={playoffSettings.legsToWinByRound?.[16] || 3}
                    onChange={(e) => setPlayoffSettings({
                      ...playoffSettings,
                      legsToWinByRound: {
                        ...playoffSettings.legsToWinByRound,
                        16: parseInt(e.target.value)
                      }
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('management.quarterFinals')}:</label>
                  <select 
                    value={playoffSettings.legsToWinByRound?.[8] || 3}
                    onChange={(e) => setPlayoffSettings({
                      ...playoffSettings,
                      legsToWinByRound: {
                        ...playoffSettings.legsToWinByRound,
                        8: parseInt(e.target.value)
                      }
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('management.semiFinals')}:</label>
                  <select 
                    value={playoffSettings.legsToWinByRound?.[4] || 3}
                    onChange={(e) => setPlayoffSettings({
                      ...playoffSettings,
                      legsToWinByRound: {
                        ...playoffSettings.legsToWinByRound,
                        4: parseInt(e.target.value)
                      }
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{t('management.final')}:</label>
                  <select 
                    value={playoffSettings.legsToWinByRound?.[2] || 3}
                    onChange={(e) => setPlayoffSettings({
                      ...playoffSettings,
                      legsToWinByRound: {
                        ...playoffSettings.legsToWinByRound,
                        2: parseInt(e.target.value)
                      }
                    })}
                  >
                    <option value={1}>{t('tournaments.firstToLeg', { count: 1 })}</option>
                    <option value={2}>{t('tournaments.firstToLegs', { count: 2 })}</option>
                    <option value={3}>{t('tournaments.firstToLegs', { count: 3 })}</option>
                    <option value={4}>{t('tournaments.firstToLegs', { count: 4 })}</option>
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
                    <option value={6}>{t('tournaments.firstToLegs', { count: 6 })}</option>
                    <option value={7}>{t('tournaments.firstToLegs', { count: 7 })}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>




        <button 
          className="create-tournament-btn"
          onClick={createTournament}
          disabled={!tournamentName.trim()}
        >
          <Trophy size={20} />
          {t('tournaments.create')}
        </button>
      </div>
    </div>
  );
}

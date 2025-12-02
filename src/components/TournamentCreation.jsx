import React, { useState } from 'react';
import { Trophy, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

// Generate unique ID for tournaments
const generateId = () => {
  return crypto.randomUUID();
};

export function TournamentCreation({ onTournamentCreated, onBack }) {
  const { t } = useLanguage();
  const [tournamentName, setTournamentName] = useState('');
  const [legsToWin, setLegsToWin] = useState(3);
  const [startingScore, setStartingScore] = useState(501);
  const [groupSettings, setGroupSettings] = useState({
    type: 'groups', // 'groups' or 'playersPerGroup'
    value: 2
  });
  const [standingsCriteriaOrder, setStandingsCriteriaOrder] = useState([
    'matchesWon',
    'legDifference',
    'average',
    'headToHead'
  ]);
  const [playoffSettings, setPlayoffSettings] = useState({
    enabled: false,
    qualificationMode: 'perGroup', // 'perGroup' or 'totalPlayers'
    playersPerGroup: 1,
    totalPlayersToAdvance: 8,
    legsToWinByRound: {
      16: 3,  // Round of 16
      8: 3,   // Quarter-finals
      4: 3,   // Semi-finals
      2: 3    // Final
    }
  });

  const createTournament = () => {
    if (!tournamentName.trim()) {
      alert(t('tournaments.pleaseEnterName'));
      return;
    }

    const tournament = {
      id: generateId(),
      name: tournamentName.trim(),
      players: [], // Players will be added after creation
      groups: [], // Groups will be generated when tournament starts
      legsToWin: legsToWin,
      startingScore: startingScore,
      groupSettings: groupSettings,
      playoffSettings: playoffSettings,
      standingsCriteriaOrder: standingsCriteriaOrder,
      playoffs: null, // Playoffs will be created only when user clicks "Start Playoffs"
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
        </div>

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

        <div className="form-section">
          <h3>{t('registration.playoffSettings')}</h3>
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
          
          {playoffSettings.enabled && (
            <div className="playoff-options">
              <div className="input-group">
                <label>{t('registration.qualificationMode')}</label>
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
              <div className="playoff-legs-settings">
                <h5>{t('registration.playoffLegsToWin')}:</h5>
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
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
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
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
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
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
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
                    <option value={5}>{t('tournaments.firstToLegs', { count: 5 })}</option>
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

import React, { useState } from 'react';
import { Trophy, ArrowLeft, Save } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const generateId = () => {
  return crypto.randomUUID();
};

export function LeagueCreation({ onLeagueCreated, onBack }) {
  const { t } = useLanguage();
  const [leagueName, setLeagueName] = useState('');
  const [description, setDescription] = useState('');
  const [scoringRules, setScoringRules] = useState({
    placementPoints: {
      "1": 12,
      "2": 9,
      "3": 7,
      "4": 5,
      "5": 3,
      "default": 1
    },
    allowManualOverride: true
  });

  const createLeague = () => {
    if (!leagueName.trim()) {
      alert(t('leagues.pleaseEnterLeagueName'));
      return;
    }

    const league = {
      id: generateId(),
      name: leagueName.trim(),
      description: description.trim() || null,
      status: 'active',
      scoringRules: scoringRules,
      defaultTournamentSettings: null, // Can be set later in settings
      players: [] // Players can be added after creation
    };

    onLeagueCreated(league);
  };

  const updatePlacementPoints = (placement, value) => {
    const numValue = parseInt(value) || 0;
    setScoringRules({
      ...scoringRules,
      placementPoints: {
        ...scoringRules.placementPoints,
        [placement]: numValue
      }
    });
  };

  return (
    <div className="tournament-creation">
      <div className="creation-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          {t('leagues.backToLeagues')}
        </button>
        <div className="header-content">
          <Trophy className="header-icon" />
          <h2>{t('leagues.createNewLeague')}</h2>
        </div>
      </div>

      <div className="creation-form">
        <div className="form-section">
          <label htmlFor="league-name">{t('leagues.leagueName')} *</label>
          <input
            id="league-name"
            type="text"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder={t('leagues.enterLeagueName')}
            maxLength={100}
          />
        </div>

        <div className="form-section">
          <label htmlFor="league-description">{t('leagues.descriptionOptional')}</label>
          <textarea
            id="league-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('leagues.describeLeague')}
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="form-section">
          <h3>{t('leagues.scoringRules')}</h3>
          <p className="settings-description" style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            {t('leagues.scoringRulesCreateDescription')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="input-group">
              <label>{t('leagues.1stPlace')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["1"] || 0}
                onChange={(e) => updatePlacementPoints("1", e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>{t('leagues.2ndPlace')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["2"] || 0}
                onChange={(e) => updatePlacementPoints("2", e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>{t('leagues.3rdPlace')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["3"] || 0}
                onChange={(e) => updatePlacementPoints("3", e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>{t('leagues.4thPlace')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["4"] || 0}
                onChange={(e) => updatePlacementPoints("4", e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>{t('leagues.5thPlace')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["5"] || 0}
                onChange={(e) => updatePlacementPoints("5", e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>{t('leagues.defaultSixthPlus')}:</label>
              <input
                type="number"
                min="0"
                value={scoringRules.placementPoints["default"] || 0}
                onChange={(e) => updatePlacementPoints("default", e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          className="create-tournament-btn"
          onClick={createLeague}
          disabled={!leagueName.trim()}
        >
          <Save size={20} />
          {t('leagues.createLeague')}
        </button>
      </div>
    </div>
  );
}


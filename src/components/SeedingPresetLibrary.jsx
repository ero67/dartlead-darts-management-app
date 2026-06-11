import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { BracketSeedingEditor } from './BracketSeedingEditor';
import { presetKey, nextPow2 } from '../utils/seedSlots';
import './SeedingPresetLibrary.css';

// A library of prepared seeding configs, each keyed by (number of groups, bracket
// start size). At tournament time the matching preset is auto-selected by
// resolveActiveTemplate (see seedSlots.js). Lives in league default settings.
//
// Stored shape: playoffSettings.seedingPresets = {
//   "4-16": { enabled, mode:'perGroup', bracketSize:16, numGroups:4, signature, slots:[...] },
//   ...
// }
const GROUP_OPTIONS = [2, 3, 4, 5, 6, 8];
const BRACKET_START_OPTIONS = [4, 8, 16, 32];

export function SeedingPresetLibrary({ presets, onChange }) {
  const { t } = useLanguage();
  const [newGroups, setNewGroups] = useState(4);
  const [newBracket, setNewBracket] = useState(16);

  const library = presets && typeof presets === 'object' ? presets : {};
  const entries = Object.entries(library);

  const synthesizeGroups = (numGroups) =>
    Array.from({ length: numGroups }, (_, i) => ({ name: `Group ${String.fromCharCode(65 + i)}` }));

  const addPreset = () => {
    const key = presetKey(newGroups, newBracket);
    if (library[key]) return; // already exists
    onChange({
      ...library,
      [key]: {
        enabled: true,
        mode: 'perGroup',
        bracketSize: newBracket,
        numGroups: newGroups,
        slots: new Array(newBracket).fill(null),
      },
    });
  };

  const updatePreset = (key, customSeeding) => {
    if (!customSeeding) {
      // Editor disabled -> remove the preset entirely.
      removePreset(key);
      return;
    }
    onChange({
      ...library,
      [key]: {
        ...customSeeding,
        numGroups: library[key]?.numGroups,
      },
    });
  };

  const removePreset = (key) => {
    const next = { ...library };
    delete next[key];
    onChange(next);
  };

  const bracketLabel = (size) => t('registration.presetBracketTop', { count: size });

  return (
    <div className="seeding-preset-library">
      <div className="preset-add-row">
        <div className="preset-add-field">
          <label>{t('registration.presetGroups')}</label>
          <select value={newGroups} onChange={(e) => setNewGroups(parseInt(e.target.value, 10))}>
            {GROUP_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="preset-add-field">
          <label>{t('registration.presetBracketStart')}</label>
          <select value={newBracket} onChange={(e) => setNewBracket(parseInt(e.target.value, 10))}>
            {BRACKET_START_OPTIONS.map((n) => (
              <option key={n} value={n}>{bracketLabel(n)}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="preset-add-btn"
          onClick={addPreset}
          disabled={!!library[presetKey(newGroups, newBracket)]}
        >
          <Plus size={16} />
          {t('registration.presetAdd')}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="seeding-editor-note">{t('registration.presetEmpty')}</p>
      ) : (
        <div className="preset-list">
          {entries
            .sort((a, b) => (b[1].numGroups - a[1].numGroups) || (b[1].bracketSize - a[1].bracketSize))
            .map(([key, preset]) => {
              const numGroups = preset.numGroups || 0;
              return (
                <div key={key} className="preset-card">
                  <div className="preset-card-header">
                    <span className="preset-card-title">
                      {t('registration.presetCardTitle', { groups: numGroups, bracket: preset.bracketSize })}
                    </span>
                    <button
                      type="button"
                      className="preset-remove-btn"
                      onClick={() => removePreset(key)}
                      aria-label={t('registration.presetRemove')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <BracketSeedingEditor
                    playoffSettings={{ qualificationMode: 'perGroup' }}
                    groups={synthesizeGroups(numGroups)}
                    bracketSizeOverride={preset.bracketSize || nextPow2(numGroups)}
                    value={preset}
                    onChange={(customSeeding) => updatePreset(key, customSeeding)}
                    hideToggle
                  />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

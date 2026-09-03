import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { tournamentService } from '../services/tournamentService';
import { normalizeDisplayName, DISPLAY_NAME_MAX } from '../utils/userDisplayName';

// Inline form that lets a signed-in user rename themselves. Saves the name to
// their account (works for Google sign-ins too) and to the player row linked
// to the account, so leaderboards and match history pick it up.
export function DisplayNameEditor({ currentName, onSaved, onCancel }) {
  const { t } = useLanguage();
  const { updateDisplayName } = useAuth();
  const [value, setValue] = useState(currentName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    const cleaned = normalizeDisplayName(value);
    if (!cleaned) {
      setError(t('playerProfile.nameInvalid'));
      return;
    }
    if (cleaned === (currentName || '').trim()) {
      onCancel();
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const { error: authError } = await updateDisplayName(cleaned);
      if (authError) throw authError;
      const player = await tournamentService.renameMyPlayer(cleaned);
      onSaved(cleaned, player);
    } catch (err) {
      console.error('Error saving display name:', err);
      setError(t('playerProfile.nameSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="display-name-editor" onSubmit={handleSubmit}>
      <label className="display-name-editor-label" htmlFor="display-name-input">
        {t('playerProfile.yourName')}
      </label>
      <div className="display-name-editor-row">
        <input
          id="display-name-input"
          type="text"
          value={value}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          disabled={isSaving}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        />
        <button type="submit" className="action-btn play" disabled={isSaving} title={t('common.save')}>
          <Check size={16} />
        </button>
        <button type="button" className="action-btn delete" disabled={isSaving} onClick={onCancel} title={t('common.cancel')}>
          <X size={16} />
        </button>
      </div>
      {error
        ? <p className="display-name-editor-error">{error}</p>
        : <p className="display-name-editor-hint">{t('playerProfile.nameHint')}</p>}
    </form>
  );
}

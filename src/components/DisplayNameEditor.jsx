import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      // Player row first: it is the step that can be refused (name already in
      // the roster). Changing the account name afterwards keeps both in sync
      // instead of leaving the account renamed and the player not.
      const player = await tournamentService.renameMyPlayer(cleaned);
      const { error: authError } = await updateDisplayName(cleaned);
      if (authError) throw authError;
      onSaved(cleaned, player);
    } catch (err) {
      console.error('Error saving display name:', err);
      setError(t(err?.message?.includes('name_taken') ? 'playerProfile.nameTaken' : 'playerProfile.nameSaveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="tw flex w-full max-w-sm flex-col gap-2 text-foreground" onSubmit={handleSubmit}>
      <Label htmlFor="display-name-input">{t('playerProfile.yourName')}</Label>
      <div className="flex items-center gap-2">
        <Input
          id="display-name-input"
          type="text"
          value={value}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          disabled={isSaving}
          aria-invalid={error ? true : undefined}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        />
        <Button type="submit" size="icon" disabled={isSaving} title={t('common.save')} aria-label={t('common.save')}>
          <Check />
        </Button>
        <Button type="button" variant="outline" size="icon" disabled={isSaving} onClick={onCancel} title={t('common.cancel')} aria-label={t('common.cancel')}>
          <X />
        </Button>
      </div>
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : <p className="text-xs text-muted-foreground">{t('playerProfile.nameHint')}</p>}
    </form>
  );
}

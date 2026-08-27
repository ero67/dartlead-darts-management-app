import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

// Landing page of the password-recovery email link. Supabase exchanges the
// token in the URL for a recovery session automatically (detectSessionInUrl),
// after which updatePassword() can set the new password.
export function ResetPassword() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, loading, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setIsSaving(true);
    const { error: updateError } = await updatePassword(password);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setIsDone(true);
    setTimeout(() => navigate('/dashboard'), 2000);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  // No recovery session: the link is expired, already used, or opened cold
  if (!user) {
    return (
      <div className="unauthorized-container">
        <h2>{t('auth.resetLinkInvalidTitle')}</h2>
        <p>{t('auth.resetLinkInvalid')}</p>
        <button
          className="create-tournament-btn"
          onClick={() => navigate('/login')}
          style={{ marginTop: '1rem' }}
        >
          {t('auth.backToLogin')}
        </button>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="unauthorized-container">
        <h2>{t('auth.passwordUpdatedTitle')}</h2>
        <p>{t('auth.passwordUpdated')}</p>
      </div>
    );
  }

  return (
    <div className="unauthorized-container" style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2>{t('auth.setNewPasswordTitle')}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('auth.newPassword')}
          autoComplete="new-password"
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t('auth.confirmNewPassword')}
          autoComplete="new-password"
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
        />
        {error && (
          <p style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.875rem', margin: 0 }}>{error}</p>
        )}
        <button
          type="submit"
          className="create-tournament-btn"
          disabled={isSaving || !password || !confirmPassword}
        >
          {isSaving ? t('common.saving') : t('auth.updatePassword')}
        </button>
      </form>
    </div>
  );
}

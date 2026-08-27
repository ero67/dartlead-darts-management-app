import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';

// Manage the scorer allowlist of a tournament (type="tournament") or a league
// (type="league"). Scorers are registered users the manager authorizes to run
// the match scoring UI; enforcement happens in the database (RLS).
export function ScorersPanel({ type, entityId }) {
  const { t } = useLanguage();
  const [scorers, setScorers] = useState([]);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [hasAccess, setHasAccess] = useState(true);

  const service = type === 'league' ? leagueService : tournamentService;

  const loadScorers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await service.listScorers(entityId);
      setScorers(data);
    } catch (err) {
      // The list RPC raises not_authorized for non-managers; hide the panel
      if (err?.message?.includes('not_authorized')) {
        setHasAccess(false);
      } else {
        setError(t('scorers.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [service, entityId, t]);

  useEffect(() => {
    loadScorers();
  }, [loadScorers]);

  const handleAddScorer = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || isAdding) return;

    setIsAdding(true);
    setError('');
    try {
      const result = await service.addScorer(entityId, trimmedEmail);
      if (result?.success) {
        setEmail('');
        setScorers(prev => {
          if (prev.some(s => s.userId === result.user_id)) return prev;
          return [...prev, { userId: result.user_id, email: result.email, fullName: result.full_name }];
        });
      } else if (result?.error === 'user_not_found') {
        setError(t('scorers.userNotFound'));
      } else if (result?.error === 'not_authorized') {
        setError(t('scorers.notAuthorized'));
      } else {
        setError(t('scorers.addError'));
      }
    } catch {
      setError(t('scorers.addError'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveScorer = async (userId) => {
    setError('');
    try {
      await service.removeScorer(entityId, userId);
      setScorers(prev => prev.filter(s => s.userId !== userId));
    } catch {
      setError(t('scorers.removeError'));
    }
  };

  if (!hasAccess) return null;

  return (
    <div className="group-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{t('scorers.title')}</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {type === 'league' ? t('scorers.descriptionLeague') : t('scorers.descriptionTournament')}
      </p>

      <form onSubmit={handleAddScorer} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('scorers.emailPlaceholder')}
          style={{
            flex: '1 1 200px',
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)'
          }}
        />
        <button
          type="submit"
          className="create-tournament-btn"
          disabled={isAdding || !email.trim()}
          style={{ padding: '0.5rem 1rem' }}
        >
          <UserPlus size={16} />
          {isAdding ? t('common.saving') : t('scorers.add')}
        </button>
      </form>

      {error && (
        <p style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('common.loading')}</p>
      ) : scorers.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('scorers.empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {scorers.map((scorer) => (
            <li
              key={scorer.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'var(--bg-secondary)'
              }}
            >
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {scorer.fullName ? `${scorer.fullName} (${scorer.email})` : scorer.email}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveScorer(scorer.userId)}
                aria-label={t('scorers.remove')}
                title={t('scorers.remove')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

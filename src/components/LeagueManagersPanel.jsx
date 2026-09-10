import React, { useState, useEffect, useCallback } from 'react';
import { X, Crown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { UserSearchPicker } from './UserSearchPicker';
import { leagueService } from '../services/leagueService';

// Co-managers of a league. They share the creator's subscription and have the
// same rights inside the league; only the creator (or an admin) edits the list.
// Enforcement happens in the database (RPCs + RLS); canEdit only shapes the UI.
export function LeagueManagersPanel({ leagueId, canEdit }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [managers, setManagers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [hasAccess, setHasAccess] = useState(true);

  const loadManagers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setManagers(await leagueService.listManagers(leagueId));
    } catch (err) {
      if (err?.message?.includes('not_authorized')) {
        setHasAccess(false);
      } else {
        setError(t('leagueManagers.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, t]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  const handleAddManager = async (picked) => {
    if (!picked?.email || isAdding) return;
    setIsAdding(true);
    setError('');
    try {
      const result = await leagueService.addManager(leagueId, picked.email);
      if (result?.success) {
        setManagers(prev => {
          if (prev.some(m => m.userId === result.user_id)) return prev;
          return [...prev, { userId: result.user_id, email: result.email, fullName: result.full_name, isOwner: false }];
        });
      } else if (result?.error === 'user_not_found') {
        setError(t('leagueManagers.userNotFound'));
      } else if (result?.error === 'already_owner') {
        setError(t('leagueManagers.alreadyOwner'));
      } else if (result?.error === 'not_authorized') {
        setError(t('leagueManagers.notAuthorized'));
      } else {
        setError(t('leagueManagers.addError'));
      }
    } catch {
      setError(t('leagueManagers.addError'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveManager = async (userId) => {
    setError('');
    try {
      await leagueService.removeManager(leagueId, userId);
      setManagers(prev => prev.filter(m => m.userId !== userId));
    } catch {
      setError(t('leagueManagers.removeError'));
    }
  };

  if (!hasAccess) return null;

  return (
    <div className="group-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{t('leagueManagers.title')}</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
        {canEdit ? t('leagueManagers.description') : t('leagueManagers.descriptionReadOnly')}
      </p>

      {canEdit && (
        <div style={{ marginBottom: '1rem' }}>
          <UserSearchPicker
            onSelect={handleAddManager}
            excludeIds={managers.map(m => m.userId)}
          />
          {isAdding && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>{t('common.saving')}</p>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--error-color, #e5484d)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('common.loading')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {managers.map((manager) => {
            const canRemove = !manager.isOwner && (canEdit || manager.userId === user?.id);
            return (
              <li
                key={manager.userId}
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
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {manager.isOwner && <Crown size={14} title={t('leagueManagers.owner')} style={{ flexShrink: 0 }} />}
                  <span>{manager.fullName ? `${manager.fullName} (${manager.email})` : manager.email}</span>
                  {manager.isOwner && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('leagueManagers.owner')}</span>
                  )}
                </span>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemoveManager(manager.userId)}
                    aria-label={manager.userId === user?.id && !canEdit ? t('leagueManagers.leave') : t('leagueManagers.remove')}
                    title={manager.userId === user?.id && !canEdit ? t('leagueManagers.leave') : t('leagueManagers.remove')}
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
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

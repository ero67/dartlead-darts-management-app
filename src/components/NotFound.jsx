import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export function NotFound() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="unauthorized-container">
      <h2>{t('notFound.title')}</h2>
      <p>{t('notFound.message')}</p>
      <button
        className="create-tournament-btn"
        onClick={() => navigate('/dashboard')}
        style={{ marginTop: '1rem' }}
      >
        {t('notFound.goHome')}
      </button>
    </div>
  );
}

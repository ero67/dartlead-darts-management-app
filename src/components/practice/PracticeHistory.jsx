import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { loadHistory, clearHistory } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { SessionRow } from './PracticeHome';
import './Practice.css';

export function PracticeHistory() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => loadHistory());
  const [error, setError] = useState(null);

  const handleDelete = async (id) => {
    setError(null);
    try {
      setHistory(await practiceService.deleteSession(user?.id, id));
    } catch (err) {
      console.error('Failed to delete practice session:', err);
      setHistory(loadHistory());
      setError(t('practice.sync.deleteFailed'));
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(t(user ? 'practice.history.confirmClearCloud' : 'practice.history.confirmClear'))) return;
    setError(null);
    try {
      await practiceService.deleteAll(user?.id);
      clearHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear practice history:', err);
      setError(t('practice.sync.deleteFailed'));
    }
  };

  return (
    <div className="practice-page">
      <div className="practice-header">
        <div>
          <button type="button" className="practice-link-btn" onClick={() => navigate('/practice')}>
            <ArrowLeft size={16} /> {t('practice.backToPractice')}
          </button>
          <h1>{t('practice.history.title')}</h1>
          <p>{user ? t('practice.sync.note') : t('practice.savedLocally')}</p>
        </div>
        {history.length > 0 && (
          <button type="button" className="practice-ghost-btn danger" onClick={handleClearAll}>
            {t('practice.history.clearAll')}
          </button>
        )}
      </div>

      {error && <p className="practice-error">{error}</p>}

      {history.length === 0 ? (
        <div className="practice-empty">
          <History size={40} />
          <h3>{t('practice.history.empty')}</h3>
          <p>{t('practice.history.emptyHint')}</p>
        </div>
      ) : (
        <div className="practice-session-list">
          {history.map((entry) => (
            <SessionRow key={entry.id} entry={entry} t={t} language={language} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, History } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';
import { loadHistory, clearHistory } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { SessionRow } from './PracticeHome';

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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => navigate('/practice')}>
            <ArrowLeft /> {t('practice.backToPractice')}
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{t('practice.history.title')}</h1>
          <p className="text-sm text-muted-foreground">{user ? t('practice.sync.note') : t('practice.savedLocally')}</p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" className="text-destructive" onClick={handleClearAll}>
            {t('practice.history.clearAll')}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {history.length === 0 ? (
        <EmptyState icon={History} title={t('practice.history.empty')} description={t('practice.history.emptyHint')} />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {history.map((entry) => (
            <SessionRow key={entry.id} entry={entry} t={t} language={language} onDelete={handleDelete} />
          ))}
        </Card>
      )}
    </div>
  );
}

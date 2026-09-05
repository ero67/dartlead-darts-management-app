import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTournament } from '../contexts/TournamentContext';
import { useLanguage } from '../contexts/LanguageContext';

// Manual "get the latest data" control for the tournament pages. The app also
// refreshes on its own (return to foreground, reconnect, navigation), so this
// is the fallback for "I don't trust what I'm seeing" — important in the
// native shell, which has no browser reload button.
export function RefreshButton() {
  const { t } = useLanguage();
  const { refreshCurrentTournament } = useTournament();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshCurrentTournament();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button
      type="button"
      className="refresh-btn"
      onClick={handleRefresh}
      disabled={isRefreshing}
      title={t('common.refresh')}
      aria-label={t('common.refresh')}
    >
      <RefreshCw size={18} className={isRefreshing ? 'refresh-btn__icon--spinning' : ''} />
      <span className="btn-label">{isRefreshing ? t('common.refreshing') : t('common.refresh')}</span>
    </button>
  );
}

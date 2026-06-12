import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOffline } from '../contexts/OfflineContext';
import { useLanguage } from '../contexts/LanguageContext';

// Minimal fixed banner. Only surfaces things the user needs to act on or know:
//   - that they're currently OFFLINE (scores are being queued), and
//   - that a new app version is ready to load.
// When online we do NOT show a "syncing" bar — the queue flushes on its own,
// so a persistent banner there would just be noise.
export function OfflineBanner() {
  const { isOnline, hasPendingWrites, pendingWrites, needRefresh, applyUpdate } = useOffline();
  const { t } = useLanguage();

  const handleRefresh = () => {
    applyUpdate();
  };

  // Nothing to show when online and there's no pending update.
  if (isOnline && !needRefresh) {
    return null;
  }

  return (
    <div className="offline-banner-stack">
      {!isOnline && (
        <div className="offline-banner offline-banner--offline">
          <WifiOff size={16} />
          <span>
            {t('offline.youAreOffline')}
            {hasPendingWrites
              ? ` — ${t('offline.pendingCount', { count: pendingWrites })}`
              : ` — ${t('offline.scoresQueued')}`}
          </span>
        </div>
      )}

      {needRefresh && (
        <div className="offline-banner offline-banner--update">
          <RefreshCw size={16} />
          <span>{t('offline.updateAvailable')}</span>
          <button className="offline-banner__btn" onClick={handleRefresh}>
            {t('offline.refresh')}
          </button>
        </div>
      )}
    </div>
  );
}

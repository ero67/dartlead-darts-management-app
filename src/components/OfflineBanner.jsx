import React from 'react';
import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { useOffline } from '../contexts/OfflineContext';
import { useLanguage } from '../contexts/LanguageContext';

// Minimal fixed banner that surfaces offline status, queued-write count, and a
// soft "update available" prompt. Rendered once near the app root.
export function OfflineBanner() {
  const { isOnline, hasPendingWrites, pendingWrites, needRefresh, applyUpdate } = useOffline();
  const { t } = useLanguage();

  const handleRefresh = () => {
    applyUpdate();
  };

  // Nothing to show when fully online, synced, and up to date.
  if (isOnline && !hasPendingWrites && !needRefresh) {
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

      {isOnline && hasPendingWrites && (
        <div className="offline-banner offline-banner--syncing">
          <CloudUpload size={16} />
          <span>{t('offline.pendingCount', { count: pendingWrites })}</span>
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

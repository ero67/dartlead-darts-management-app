import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOffline } from '../contexts/OfflineContext';
import { useLanguage } from '../contexts/LanguageContext';

// Minimal fixed banner. Only surfaces things the user needs to know:
//   - that they're currently OFFLINE (scores are being queued), and
//   - that a new app version is waiting. Updates apply themselves everywhere
//     except the match screen, so in practice this only shows mid-match, to
//     explain the reload that will happen when the scorer leaves the match.
// When online we do NOT show a "syncing" bar — the queue flushes on its own,
// so a persistent banner there would just be noise.
export function OfflineBanner() {
  const { isOnline, hasPendingWrites, pendingWrites, needRefresh } = useOffline();
  const { t } = useLanguage();

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
        </div>
      )}
    </div>
  );
}

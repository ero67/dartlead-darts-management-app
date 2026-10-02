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
    <div
      className="fixed inset-x-0 z-50 flex flex-col gap-px text-sm font-medium"
      style={{ top: 'var(--safe-area-inset-top, 0px)' }}
      role="status"
    >
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-amber-950">
          <WifiOff className="size-4 shrink-0" />
          <span>
            {t('offline.youAreOffline')}
            {hasPendingWrites
              ? ` — ${t('offline.pendingCount', { count: pendingWrites })}`
              : ` — ${t('offline.scoresQueued')}`}
          </span>
        </div>
      )}

      {needRefresh && (
        <div className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <RefreshCw className="size-4 shrink-0" />
          <span>{t('offline.updateAvailable')}</span>
        </div>
      )}
    </div>
  );
}

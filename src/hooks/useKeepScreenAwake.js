import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

// Keep the display on while `active` (used by the match screen: a tablet on a
// board must not dim or lock between visits). Native shell: KeepAwake plugin.
// Browsers: Screen Wake Lock API, which the browser releases whenever the tab
// is hidden, so it is re-acquired when the tab becomes visible again.
export function useKeepScreenAwake(active = true) {
  useEffect(() => {
    if (!active) return undefined;

    if (Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake().catch(() => {});
      return () => {
        KeepAwake.allowSleep().catch(() => {});
      };
    }

    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;

    let sentinel = null;
    let disposed = false;
    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Refused (battery saver, permissions policy) — nothing to do.
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

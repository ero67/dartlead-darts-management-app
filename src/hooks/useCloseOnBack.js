import { useEffect, useRef } from 'react';

// Make the browser / Android back button close an open dialog instead of
// leaving the page underneath it. While `isOpen`, one history entry is pushed
// so "back" pops it (and we call onClose); closing through the UI pops that
// same entry so the history behind the page is left exactly as it was.
export function useCloseOnBack(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    // Deferred so React's development double-mount (StrictMode: mount,
    // cleanup, mount) does not push two entries or pop the page's own.
    let pushed = false;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      window.history.pushState({ ...(window.history.state || {}), dialog: true }, '');
      pushed = true;
    }, 0);

    const onPop = () => {
      pushed = false;
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      // Closed through the UI while our entry is on top: pop it so the page's
      // history is unchanged (the listener is gone, so onClose is not re-run).
      if (pushed && window.history.state?.dialog) window.history.back();
    };
  }, [isOpen]);
}

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { initOfflineQueue, flushQueue, subscribe, getQueueLength } from '../lib/offlineQueue.js';

const OfflineContext = createContext();

// How often an open tab asks the server whether a new build exists. Browsers
// only check on their own during a full page load (and at most daily), so a
// tablet left on the tournament page all evening would otherwise never see a
// deploy until someone reloads it by hand.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const isOnMatchScreen = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/match/');

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingWrites, setPendingWrites] = useState(getQueueLength());
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);
  const location = useLocation();

  // Start the queue flush triggers (online event, periodic retry, boot flush)
  useEffect(() => {
    initOfflineQueue();
  }, []);

  // Track online/offline; flush the queue as soon as we reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Reflect the queue length in the UI
  useEffect(() => {
    const unsubscribe = subscribe((length) => setPendingWrites(length));
    return unsubscribe;
  }, []);

  // Register the service worker. A new version waits in the background
  // (registerType 'prompt'); we keep asking the server for one periodically and
  // apply it ourselves at a safe moment — see the effect below.
  useEffect(() => {
    let intervalId = null;
    let registration = null;

    const checkForUpdate = async () => {
      if (!registration || registration.installing) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        await registration.update();
      } catch {
        // Offline / captive portal / server hiccup — try again next tick.
      }
    };

    // Also check when the tab comes back to the foreground or regains network:
    // that is exactly when a device that sat idle through a deploy needs it.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisteredSW(_swUrl, r) {
        registration = r || null;
        if (!registration) return;
        intervalId = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('online', checkForUpdate);
      }
    });
    setUpdateSW(() => update);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', checkForUpdate);
    };
  }, []);

  // Apply a pending SW update — but never while a match is being scored.
  // updateSW(true) tells the waiting worker to take over; the register helper
  // reloads the page once it is controlling. Match state and queued writes
  // live in localStorage, and the current tournament in sessionStorage, so the
  // reload lands the user back where they were.
  const applyUpdate = useCallback(() => {
    if (isOnMatchScreen()) {
      return false; // deferred until the user leaves the match screen
    }
    if (updateSW) {
      updateSW(true);
    }
    return true;
  }, [updateSW]);

  // Automatic update: as soon as a new version is waiting and we are not on
  // the match screen, load it. If the user is scoring, this re-runs on the
  // next route change (i.e. when they leave the match) and applies it then.
  useEffect(() => {
    if (!needRefresh || !updateSW) return;
    applyUpdate();
  }, [needRefresh, updateSW, location.pathname, applyUpdate]);

  const value = {
    isOnline,
    pendingWrites,
    hasPendingWrites: pendingWrites > 0,
    needRefresh,
    applyUpdate
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}

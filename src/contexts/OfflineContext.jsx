import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { initOfflineQueue, flushQueue, subscribe, getQueueLength } from '../lib/offlineQueue.js';

const OfflineContext = createContext();

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingWrites, setPendingWrites] = useState(getQueueLength());
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

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

  // Register the service worker. A new version waits (we don't auto-reload) so
  // an in-progress match is never interrupted — the banner offers a refresh.
  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      }
    });
    setUpdateSW(() => update);
  }, []);

  // Apply a pending SW update — but never while a match is being scored.
  const applyUpdate = useCallback(() => {
    const onMatchScreen =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/match/');
    if (onMatchScreen) {
      // Defer: don't reload mid-match. The banner stays until the user leaves.
      return false;
    }
    if (updateSW) {
      updateSW(true); // reloads the page with the new SW
    }
    return true;
  }, [updateSW]);

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

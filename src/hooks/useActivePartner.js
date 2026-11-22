import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { partnerService } from '../services/partnerService';

// One request per page load and per user: the four partner spots share it, and an admin
// who signs in later gets their own answer (the "admins only" preview) without a reload.
const cache = new Map();
const listeners = new Set();

const load = (key) => {
  if (!cache.has(key)) cache.set(key, partnerService.getActivePartner());
  return cache.get(key);
};

// After the admin changes partners or visibility: forget every answer and reload mounted spots.
export function refreshActivePartner() {
  cache.clear();
  listeners.forEach((notify) => notify());
}

// The partner to show, or null (none, hidden, still loading or failed).
export function useActivePartner() {
  const { user } = useAuth();
  const key = user?.id ?? 'anon';
  const [state, setState] = useState({ key: null, partner: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const notify = () => setVersion((v) => v + 1);
    listeners.add(notify);
    return () => listeners.delete(notify);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(key).then((partner) => {
      if (!cancelled) setState({ key, partner });
    });
    return () => { cancelled = true; };
  }, [key, version]);

  // Never show the previous user's answer while the new one loads.
  return state.key === key ? state.partner : null;
}

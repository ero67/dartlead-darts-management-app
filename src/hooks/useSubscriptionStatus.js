import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Subscriptions that cover the signed-in user: their own (managers) plus those
// of the managers whose leagues they co-manage. Rows are
// { owner_id, owner_name, is_own, paid_until, league_names }; null while loading.
// Co-managers cannot read manager_subscriptions (RLS), hence the RPC.
export function useSubscriptionStatus(isEnabled = true) {
  const { user } = useAuth();
  const userId = user?.id;
  const [statuses, setStatuses] = useState(null);

  useEffect(() => {
    if (!userId || !isEnabled) {
      setStatuses([]);
      return;
    }
    let cancelled = false;
    supabase.rpc('get_my_subscription_status').then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('Error loading subscription status:', error);
      setStatuses(data || []);
    });
    return () => { cancelled = true; };
  }, [userId, isEnabled]);

  return statuses;
}

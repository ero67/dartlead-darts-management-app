import React, { useState, useEffect, useCallback } from 'react';
import { Loader, RefreshCw, Ban, Undo2, Crown, X, StickyNote, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from './shared/EmptyState';
import { cn } from '@/lib/utils';
import { confirmDialog } from '../lib/confirmDialog';

// Admin panel section: managers with billing state (monthly, invoiced
// manually), resource counts, ban controls and role changes. Enforcement is
// deliberately manual — paid_until is the admin's ledger, nothing auto-blocks.
export function ManagerBilling() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_manager_overview');
      if (rpcError) throw rpcError;
      setRows(data || []);
    } catch (err) {
      console.error('Error loading manager overview:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const runAction = async (userId, fn) => {
    setBusyUserId(userId);
    setError('');
    try {
      const result = await fn();
      if (result && result.success === false) {
        throw new Error(result.error || 'Action failed');
      }
      await loadOverview();
    } catch (err) {
      console.error('Manager billing action failed:', err);
      setError(err.message);
    } finally {
      setBusyUserId(null);
    }
  };

  const addMonth = (row) => runAction(row.user_id, async () => {
    // Extend from paid_until if still in the future, otherwise from today
    const base = row.paid_until && new Date(row.paid_until) > new Date()
      ? new Date(row.paid_until)
      : new Date();
    base.setMonth(base.getMonth() + 1);
    const newDate = base.toISOString().slice(0, 10);
    const { data, error: rpcError } = await supabase.rpc('admin_update_subscription', {
      target_user_id: row.user_id,
      new_paid_until: newDate,
      new_notes: null
    });
    if (rpcError) throw rpcError;
    return data;
  });

  const setDate = (row) => {
    const input = window.prompt('Paid until (YYYY-MM-DD):', row.paid_until || new Date().toISOString().slice(0, 10));
    if (input === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
      setError('Invalid date format, expected YYYY-MM-DD');
      return;
    }
    runAction(row.user_id, async () => {
      const { data, error: rpcError } = await supabase.rpc('admin_update_subscription', {
        target_user_id: row.user_id,
        new_paid_until: input.trim(),
        new_notes: null
      });
      if (rpcError) throw rpcError;
      return data;
    });
  };

  const editNotes = (row) => {
    const input = window.prompt('Notes (invoice refs, etc.):', row.notes || '');
    if (input === null) return;
    runAction(row.user_id, async () => {
      const { data, error: rpcError } = await supabase.rpc('admin_update_subscription', {
        target_user_id: row.user_id,
        new_paid_until: row.paid_until,
        new_notes: input
      });
      if (rpcError) throw rpcError;
      return data;
    });
  };

  const toggleBan = async (row) => {
    const action = row.is_banned ? 'unban' : 'ban';
    if (!(await confirmDialog(`Really ${action} ${row.email}? ${row.is_banned ? '' : 'They will be signed out everywhere and unable to log in.'}`, { destructive: true }))) return;
    runAction(row.user_id, async () => {
      const { data, error: rpcError } = await supabase.rpc('admin_set_user_ban', {
        user_email: row.email,
        banned: !row.is_banned
      });
      if (rpcError) throw rpcError;
      return data;
    });
  };

  const changeRole = async (row, newRole) => {
    const label = newRole === null ? `remove the manager role from ${row.email}` : `make ${row.email} ${newRole === 'admin' ? 'an ADMIN (full access to everything)' : 'a manager'}`;
    if (!(await confirmDialog(`Really ${label}?`))) return;
    runAction(row.user_id, async () => {
      const { data, error: rpcError } = await supabase.rpc('set_user_role_secure', {
        user_email: row.email,
        user_role: newRole
      });
      if (rpcError) throw rpcError;
      return data;
    });
  };

  const paidBadge = (row) => {
    if (row.role === 'admin') return <span className="text-muted-foreground">—</span>;
    if (!row.paid_until) return <span className="text-muted-foreground">not set</span>;
    const until = new Date(row.paid_until);
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const color = until < now
      ? 'text-red-600 dark:text-red-400'
      : until < soon ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-400';
    const label = until < now ? `expired ${row.paid_until}` : `paid until ${row.paid_until}`;
    return <span className={cn('font-semibold tabular-nums', color)}>{label}</span>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Managers & Billing</CardTitle>
          <CardDescription>
            Monthly billing per manager, invoiced manually. New managers start on a 30-day trial.
            Nothing blocks automatically — expired means it is time to chase the invoice.
            Every change here is recorded in the audit log.
          </CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={loadOverview} disabled={isLoading} title="Refresh" aria-label="Refresh">
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader className="size-5 animate-spin" />
            <span>Loading managers...</span>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No managers yet." />
        ) : (
          <div className="divide-y rounded-lg border">
            {rows.map((row) => {
              const isSelf = row.user_id === user?.id;
              const busy = busyUserId === row.user_id;
              return (
                <div key={row.user_id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {row.email}
                      {row.role === 'admin' && <Crown className="size-3.5 text-amber-600 dark:text-amber-400" />}
                      {row.is_banned && <Badge variant="destructive">BANNED</Badge>}
                    </div>
                    {row.full_name && <div>{row.full_name}</div>}
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {row.tournament_count} tournaments · {row.league_count} leagues
                      {row.last_sign_in_at ? ` · last seen ${new Date(row.last_sign_in_at).toLocaleDateString()}` : ''}
                    </div>
                    <div>{paidBadge(row)}</div>
                    {row.notes && (
                      <div className="text-xs italic text-muted-foreground">{row.notes}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.role === 'manager' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => addMonth(row)} disabled={busy} title="Extend paid period by one month">
                          +1 month
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDate(row)} disabled={busy} title="Set paid-until date">
                          Set date
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => editNotes(row)} disabled={busy} title="Edit notes" aria-label="Edit notes">
                      <StickyNote />
                    </Button>
                    {!isSelf && row.role === 'manager' && (
                      <Button variant="outline" size="sm" onClick={() => changeRole(row, 'admin')} disabled={busy} title="Promote to admin">
                        <Crown />
                        Promote
                      </Button>
                    )}
                    {!isSelf && row.role === 'admin' && (
                      <Button variant="outline" size="sm" onClick={() => changeRole(row, 'manager')} disabled={busy} title="Demote to manager">
                        Demote
                      </Button>
                    )}
                    {!isSelf && row.role !== 'admin' && (
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => toggleBan(row)} disabled={busy} title={row.is_banned ? 'Unban user' : 'Ban user (blocks login)'}>
                        {row.is_banned ? <Undo2 /> : <Ban />}
                        {row.is_banned ? 'Unban' : 'Ban'}
                      </Button>
                    )}
                    {!isSelf && row.role === 'manager' && (
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => changeRole(row, null)} disabled={busy} title="Remove manager role">
                        <X />
                        Remove role
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

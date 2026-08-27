import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Loader, RefreshCw, Ban, Undo2, Crown, X, StickyNote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

  const toggleBan = (row) => {
    const action = row.is_banned ? 'unban' : 'ban';
    if (!window.confirm(`Really ${action} ${row.email}? ${row.is_banned ? '' : 'They will be signed out everywhere and unable to log in.'}`)) return;
    runAction(row.user_id, async () => {
      const { data, error: rpcError } = await supabase.rpc('admin_set_user_ban', {
        user_email: row.email,
        banned: !row.is_banned
      });
      if (rpcError) throw rpcError;
      return data;
    });
  };

  const changeRole = (row, newRole) => {
    const label = newRole === null ? `remove the manager role from ${row.email}` : `make ${row.email} ${newRole === 'admin' ? 'an ADMIN (full access to everything)' : 'a manager'}`;
    if (!window.confirm(`Really ${label}?`)) return;
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
    if (row.role === 'admin') return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
    if (!row.paid_until) return <span style={{ color: 'var(--text-secondary)' }}>not set</span>;
    const until = new Date(row.paid_until);
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const color = until < now ? '#e5484d' : until < soon ? '#f5a623' : '#30a46c';
    const label = until < now ? `expired ${row.paid_until}` : `paid until ${row.paid_until}`;
    return <span style={{ color, fontWeight: 600 }}>{label}</span>;
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <CreditCard size={20} />
        <h2>Managers & Billing</h2>
        <button
          className="admin-button small"
          onClick={loadOverview}
          disabled={isLoading}
          title="Refresh"
          style={{ marginLeft: 'auto' }}
        >
          <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
        </button>
      </div>
      <p className="admin-section-description">
        Monthly billing per manager, invoiced manually. New managers start on a 30-day trial.
        Nothing blocks automatically — expired means it is time to chase the invoice.
        Every change here is recorded in the audit log.
      </p>

      {error && (
        <p style={{ color: '#e5484d', fontSize: '0.875rem' }}>{error}</p>
      )}

      {isLoading && rows.length === 0 ? (
        <div className="admin-loading">
          <Loader size={20} className="spinning" />
          <span>Loading managers...</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="admin-empty">
          <p>No managers yet.</p>
        </div>
      ) : (
        <div className="managers-list">
          {rows.map((row) => {
            const isSelf = row.user_id === user?.id;
            const busy = busyUserId === row.user_id;
            return (
              <div key={row.user_id} className="manager-item" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <div className="manager-info" style={{ minWidth: '220px' }}>
                  <div className="manager-email">
                    {row.email}
                    {row.role === 'admin' && <Crown size={14} style={{ marginLeft: '0.4rem', verticalAlign: 'text-bottom', color: '#f5a623' }} />}
                    {row.is_banned && <span style={{ marginLeft: '0.4rem', color: '#e5484d', fontWeight: 700 }}>BANNED</span>}
                  </div>
                  {row.full_name && <div className="manager-name">{row.full_name}</div>}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {row.tournament_count} tournaments · {row.league_count} leagues
                    {row.last_sign_in_at ? ` · last seen ${new Date(row.last_sign_in_at).toLocaleDateString()}` : ''}
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>{paidBadge(row)}</div>
                  {row.notes && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{row.notes}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {row.role === 'manager' && (
                    <>
                      <button className="admin-button small" onClick={() => addMonth(row)} disabled={busy} title="Extend paid period by one month">
                        +1 month
                      </button>
                      <button className="admin-button small" onClick={() => setDate(row)} disabled={busy} title="Set paid-until date">
                        Set date
                      </button>
                    </>
                  )}
                  <button className="admin-button small" onClick={() => editNotes(row)} disabled={busy} title="Edit notes">
                    <StickyNote size={14} />
                  </button>
                  {!isSelf && row.role === 'manager' && (
                    <button className="admin-button small" onClick={() => changeRole(row, 'admin')} disabled={busy} title="Promote to admin">
                      <Crown size={14} />
                      Promote
                    </button>
                  )}
                  {!isSelf && row.role === 'admin' && (
                    <button className="admin-button small" onClick={() => changeRole(row, 'manager')} disabled={busy} title="Demote to manager">
                      Demote
                    </button>
                  )}
                  {!isSelf && row.role !== 'admin' && (
                    <button className="admin-button danger small" onClick={() => toggleBan(row)} disabled={busy} title={row.is_banned ? 'Unban user' : 'Ban user (blocks login)'}>
                      {row.is_banned ? <Undo2 size={14} /> : <Ban size={14} />}
                      {row.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  )}
                  {!isSelf && row.role === 'manager' && (
                    <button className="admin-button danger small" onClick={() => changeRole(row, null)} disabled={busy} title="Remove manager role">
                      <X size={14} />
                      Remove role
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

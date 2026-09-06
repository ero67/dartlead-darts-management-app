import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, AlertTriangle, Clock, Ban, Moon, RefreshCw, Loader, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Admin overview: subscription health at a glance plus usage per manager.
// Everything derives from get_manager_overview(); the thresholds below are
// the "call them" rules, not enforcement (billing stays manual).
const TRIAL_WARNING_DAYS = 7;
const RENEWAL_WARNING_DAYS = 7;
const INACTIVE_DAYS = 60;

const DAY = 24 * 60 * 60 * 1000;
const daysUntil = (date) => Math.ceil((new Date(date) - new Date()) / DAY);
const daysSince = (date) => Math.floor((new Date() - new Date(date)) / DAY);
const isTrial = (row) => /trial/i.test(row.notes || '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

function classifyManagers(rows) {
  const managers = rows.filter((r) => r.role === 'manager');
  const buckets = { trialEnding: [], trialLapsed: [], expired: [], renewingSoon: [], inactive: [], banned: [] };
  for (const r of managers) {
    if (r.is_banned) { buckets.banned.push(r); continue; }
    if (r.paid_until) {
      const d = daysUntil(r.paid_until);
      if (d < 0) (isTrial(r) ? buckets.trialLapsed : buckets.expired).push({ ...r, days: -d });
      else if (isTrial(r) && d <= TRIAL_WARNING_DAYS) buckets.trialEnding.push({ ...r, days: d });
      else if (!isTrial(r) && d <= RENEWAL_WARNING_DAYS) buckets.renewingSoon.push({ ...r, days: d });
    }
    const lastActivity = r.last_activity_at;
    if ((!lastActivity && daysSince(r.created_at) >= INACTIVE_DAYS) || (lastActivity && daysSince(lastActivity) >= INACTIVE_DAYS)) {
      buckets.inactive.push({ ...r, days: lastActivity ? daysSince(lastActivity) : null });
    }
  }
  return buckets;
}

export function AdminOverview({ onOpenBilling }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('matches_30d');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_manager_overview');
      if (rpcError) throw rpcError;
      setRows(data || []);
    } catch (err) {
      console.error('Error loading admin overview:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buckets = useMemo(() => classifyManagers(rows), [rows]);
  const managers = useMemo(() => {
    const list = rows.filter((r) => r.role === 'manager');
    const num = (v) => Number(v || 0);
    return [...list].sort((a, b) => {
      if (sortKey === 'last_activity_at') return new Date(b.last_activity_at || 0) - new Date(a.last_activity_at || 0);
      if (sortKey === 'paid_until') return new Date(a.paid_until || '2100-01-01') - new Date(b.paid_until || '2100-01-01');
      return num(b[sortKey]) - num(a[sortKey]);
    });
  }, [rows, sortKey]);

  const totals = useMemo(() => managers.reduce((acc, r) => ({
    managers: acc.managers + 1,
    paying: acc.paying + (r.paid_until && !isTrial(r) && daysUntil(r.paid_until) >= 0 ? 1 : 0),
    trials: acc.trials + (r.paid_until && isTrial(r) && daysUntil(r.paid_until) >= 0 ? 1 : 0),
    tournaments30: acc.tournaments30 + Number(r.tournaments_30d || 0),
    matches30: acc.matches30 + Number(r.matches_30d || 0)
  }), { managers: 0, paying: 0, trials: 0, tournaments30: 0, matches30: 0 }), [managers]);

  const attention = [
    { key: 'expired', icon: <AlertTriangle size={16} />, tone: 'danger', title: 'Payment overdue', items: buckets.expired, detail: (r) => `expired ${r.days} d ago` },
    { key: 'trialLapsed', icon: <Clock size={16} />, tone: 'danger', title: 'Trial ended, not converted', items: buckets.trialLapsed, detail: (r) => `ended ${r.days} d ago` },
    { key: 'trialEnding', icon: <Clock size={16} />, tone: 'warn', title: 'Trial ending soon', items: buckets.trialEnding, detail: (r) => `${r.days} d left` },
    { key: 'renewingSoon', icon: <CreditCard size={16} />, tone: 'warn', title: 'Renewal due within a week', items: buckets.renewingSoon, detail: (r) => `${r.days} d left` },
    { key: 'inactive', icon: <Moon size={16} />, tone: 'muted', title: `No activity for ${INACTIVE_DAYS}+ days`, items: buckets.inactive, detail: (r) => (r.days === null ? 'never active' : `${r.days} d ago`) },
    { key: 'banned', icon: <Ban size={16} />, tone: 'muted', title: 'Banned', items: buckets.banned, detail: () => '' }
  ].filter((a) => a.items.length > 0);

  return (
    <div className="admin-overview">
      <div className="admin-section">
        <div className="admin-section-header">
          <Activity size={20} />
          <h2>Overview</h2>
          <button className="admin-button small" onClick={load} disabled={isLoading} title="Refresh" style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
        {error && <p className="admin-error-text">{error}</p>}

        <div className="admin-kpis">
          <div className="admin-kpi"><span className="admin-kpi__value">{totals.managers}</span><span className="admin-kpi__label">managers</span></div>
          <div className="admin-kpi"><span className="admin-kpi__value">{totals.paying}</span><span className="admin-kpi__label">paying</span></div>
          <div className="admin-kpi"><span className="admin-kpi__value">{totals.trials}</span><span className="admin-kpi__label">on trial</span></div>
          <div className="admin-kpi"><span className="admin-kpi__value">{totals.tournaments30}</span><span className="admin-kpi__label">tournaments · 30 d</span></div>
          <div className="admin-kpi"><span className="admin-kpi__value">{totals.matches30}</span><span className="admin-kpi__label">matches · 30 d</span></div>
        </div>

        <h3 className="admin-subheading">Needs attention</h3>
        {isLoading && rows.length === 0 ? (
          <div className="admin-loading"><Loader size={20} className="spinning" /><span>Loading…</span></div>
        ) : attention.length === 0 ? (
          <p className="admin-muted">Nothing to chase — every manager is paid up or on an active trial and has been active recently.</p>
        ) : (
          <div className="admin-attention">
            {attention.map((a) => (
              <div key={a.key} className={`admin-attention-card admin-attention-card--${a.tone}`}>
                <div className="admin-attention-card__title">{a.icon}<span>{a.title}</span><span className="admin-attention-card__count">{a.items.length}</span></div>
                <ul>
                  {a.items.map((r) => (
                    <li key={r.user_id}>
                      <button type="button" className="admin-link" onClick={() => onOpenBilling?.(r.user_id)}>{r.full_name || r.email}</button>
                      {r.full_name && <span className="admin-muted"> · {r.email}</span>}
                      {a.detail(r) && <span className="admin-attention-card__detail">{a.detail(r)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <CreditCard size={20} />
          <h2>Usage per manager · last 30 days</h2>
        </div>
        <p className="admin-section-description">
          What each subscription is being used for. Sort by a column to find the heaviest users and the quiet ones.
        </p>
        {managers.length === 0 ? (
          <div className="admin-empty"><p>No managers yet.</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Manager</th>
                  {[
                    ['tournaments_30d', 'Tournaments'],
                    ['matches_30d', 'Matches'],
                    ['players_30d', 'Players'],
                    ['tournament_count', 'All time'],
                    ['last_activity_at', 'Last activity'],
                    ['paid_until', 'Paid until']
                  ].map(([key, label]) => (
                    <th key={key}>
                      <button type="button" className={`admin-sort${sortKey === key ? ' active' : ''}`} onClick={() => setSortKey(key)}>{label}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {managers.map((r) => {
                  const overdue = r.paid_until && daysUntil(r.paid_until) < 0;
                  return (
                    <tr key={r.user_id} className={r.is_banned ? 'is-banned' : ''}>
                      <td>
                        <div className="admin-table__primary">{r.full_name || r.email}</div>
                        {r.full_name && <div className="admin-muted">{r.email}</div>}
                      </td>
                      <td className="num">{r.tournaments_30d}</td>
                      <td className="num">{r.matches_30d}</td>
                      <td className="num">{r.players_30d}</td>
                      <td className="num">{r.tournament_count}</td>
                      <td>{fmtDate(r.last_activity_at)}</td>
                      <td className={overdue ? 'is-overdue' : ''}>{fmtDate(r.paid_until)}{isTrial(r) ? ' · trial' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Clock, Ban, Moon, RefreshCw, Loader, CreditCard, Users, Trophy, Target, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatTile } from './shared/StatTile';
import { EmptyState } from './shared/EmptyState';
import { cn } from '@/lib/utils';

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

const TONE_CLASS = {
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  muted: 'bg-muted text-muted-foreground'
};

const SORT_COLUMNS = [
  ['tournaments_30d', 'Tournaments'],
  ['matches_30d', 'Matches'],
  ['players_30d', 'Players'],
  ['tournament_count', 'All time'],
  ['last_activity_at', 'Last activity'],
  ['paid_until', 'Paid until']
];
const DATE_COLUMNS = new Set(['last_activity_at', 'paid_until']);

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
    { key: 'expired', icon: AlertTriangle, tone: 'danger', title: 'Payment overdue', items: buckets.expired, detail: (r) => `expired ${r.days} d ago` },
    { key: 'trialLapsed', icon: Clock, tone: 'danger', title: 'Trial ended, not converted', items: buckets.trialLapsed, detail: (r) => `ended ${r.days} d ago` },
    { key: 'trialEnding', icon: Clock, tone: 'warn', title: 'Trial ending soon', items: buckets.trialEnding, detail: (r) => `${r.days} d left` },
    { key: 'renewingSoon', icon: CreditCard, tone: 'warn', title: 'Renewal due within a week', items: buckets.renewingSoon, detail: (r) => `${r.days} d left` },
    { key: 'inactive', icon: Moon, tone: 'muted', title: `No activity for ${INACTIVE_DAYS}+ days`, items: buckets.inactive, detail: (r) => (r.days === null ? 'never active' : `${r.days} d ago`) },
    { key: 'banned', icon: Ban, tone: 'muted', title: 'Banned', items: buckets.banned, detail: () => '' }
  ].filter((a) => a.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <Button variant="outline" size="icon" onClick={load} disabled={isLoading} title="Refresh" aria-label="Refresh">
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="managers" value={totals.managers} icon={Users} />
        <StatTile label="paying" value={totals.paying} icon={CreditCard} />
        <StatTile label="on trial" value={totals.trials} icon={Clock} />
        <StatTile label="tournaments · 30 d" value={totals.tournaments30} icon={Trophy} />
        <StatTile label="matches · 30 d" value={totals.matches30} icon={Target} />
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-base font-semibold">Needs attention</h3>
        {isLoading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader className="size-5 animate-spin" /><span>Loading…</span></div>
        ) : attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to chase — every manager is paid up or on an active trial and has been active recently.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {attention.map((a) => (
              <Card key={a.key} className="gap-3 py-4">
                <CardHeader className="flex items-center gap-3 px-4">
                  <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_CLASS[a.tone])}>
                    <a.icon className="size-4" />
                  </div>
                  <CardTitle className="flex-1 text-sm">{a.title}</CardTitle>
                  <span className="text-xl font-semibold tabular-nums">{a.items.length}</span>
                </CardHeader>
                <CardContent className="px-4">
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {a.items.map((r) => (
                      <li key={r.user_id} className="flex flex-wrap items-baseline gap-x-2">
                        <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => onOpenBilling?.(r.user_id)}>{r.full_name || r.email}</button>
                        {r.full_name && <span className="text-muted-foreground">· {r.email}</span>}
                        {a.detail(r) && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{a.detail(r)}</span>}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Usage per manager · last 30 days</CardTitle>
          <CardDescription>
            What each subscription is being used for. Sort by a column to find the heaviest users and the quiet ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {managers.length === 0 ? (
            <EmptyState icon={Users} title="No managers yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  {SORT_COLUMNS.map(([key, label]) => (
                    <TableHead key={key} className={DATE_COLUMNS.has(key) ? '' : 'text-right'}>
                      <button
                        type="button"
                        className={cn('inline-flex items-center gap-1 hover:text-foreground', sortKey === key ? 'text-foreground' : 'text-muted-foreground')}
                        onClick={() => setSortKey(key)}
                      >
                        {label}
                        {sortKey === key && (key === 'paid_until' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {managers.map((r) => {
                  const overdue = r.paid_until && daysUntil(r.paid_until) < 0;
                  return (
                    <TableRow key={r.user_id} className={r.is_banned ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="font-medium">{r.full_name || r.email}</div>
                        {r.full_name && <div className="text-xs text-muted-foreground">{r.email}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.tournaments_30d}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.matches_30d}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.players_30d}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.tournament_count}</TableCell>
                      <TableCell className="tabular-nums">{fmtDate(r.last_activity_at)}</TableCell>
                      <TableCell className={cn('tabular-nums', overdue && 'font-medium text-red-600 dark:text-red-400')}>{fmtDate(r.paid_until)}{isTrial(r) ? ' · trial' : ''}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

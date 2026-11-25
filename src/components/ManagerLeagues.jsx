import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from './shared/EmptyState';
import { LoadingState } from './shared/LoadingState';
import { StatusBadge } from './shared/StatusBadge';
import { isTrial, todayIso } from '../utils/billing';
import { cn } from '@/lib/utils';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// Admin "Managers" tab: per manager, the leagues they created (newest first),
// the ones they co-manage, and their billing state. Billing and identity come
// from get_manager_overview(), leagues from get_manager_leagues().
export function ManagerLeagues() {
  const { t } = useLanguage();
  const [people, setPeople] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [overview, leagueList] = await Promise.all([
        supabase.rpc('get_manager_overview'),
        supabase.rpc('get_manager_leagues')
      ]);
      if (overview.error) throw overview.error;
      if (leagueList.error) throw leagueList.error;
      setPeople(overview.data || []);
      setLeagues(leagueList.data || []);
    } catch (err) {
      console.error('Error loading manager leagues:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => people
    .map((p) => ({
      ...p,
      owned: leagues.filter((l) => l.created_by === p.user_id), // already newest first
      coManaged: leagues.filter((l) => l.co_manager_ids?.includes(p.user_id))
    }))
    // Every manager; admins only when they actually run leagues.
    .filter((p) => p.role === 'manager' || p.owned.length > 0 || p.coManaged.length > 0)
    .sort((a, b) => new Date(b.owned[0]?.created_at || 0) - new Date(a.owned[0]?.created_at || 0)),
  [people, leagues]);

  const billing = (r) => {
    if (!r.paid_until) return { text: t('adminManagers.noSubscription'), tone: 'text-muted-foreground' };
    const date = fmtDate(r.paid_until);
    if (r.paid_until < todayIso()) return { text: t('adminManagers.overdueSince', { date }), tone: 'font-medium text-red-600 dark:text-red-400' };
    return { text: t(isTrial(r) ? 'adminManagers.trialUntil' : 'adminManagers.paidUntil', { date }), tone: '' };
  };

  const leagueLine = (l) => (
    <li key={l.league_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <Link to={`/league/${l.league_id}`} className="font-medium underline-offset-4 hover:underline">{l.name}</Link>
      <StatusBadge status={l.status} t={t} />
      {l.is_demo && <Badge variant="outline">{t('adminManagers.demo')}</Badge>}
      <span className="text-xs text-muted-foreground tabular-nums">
        {t('adminManagers.leagueMeta', { date: fmtDate(l.created_at), members: l.member_count, tournaments: l.tournament_count })}
      </span>
    </li>
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{t('adminManagers.title')}</CardTitle>
          <CardDescription>{t('adminManagers.description')}</CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={isLoading} title={t('adminManagers.refresh')} aria-label={t('adminManagers.refresh')}>
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {isLoading && rows.length === 0 ? (
          <LoadingState text={t('adminManagers.loading')} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title={t('adminManagers.empty')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0" />
                <TableHead>{t('adminManagers.manager')}</TableHead>
                <TableHead className="text-right">{t('adminManagers.leagues')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('adminManagers.latest')}</TableHead>
                <TableHead className="hidden lg:table-cell text-right">{t('adminManagers.coManaging')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('adminManagers.billing')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = openId === r.user_id;
                const active = r.owned.filter((l) => l.status === 'active').length;
                const latest = r.owned[0];
                const bill = billing(r);
                const toggle = () => setOpenId(isOpen ? null : r.user_id);
                return (
                  <React.Fragment key={r.user_id}>
                    <TableRow className={cn('cursor-pointer', (r.is_banned || r.hidden_from_overview) && 'opacity-60')} onClick={toggle}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={isOpen}
                          aria-label={t(isOpen ? 'adminManagers.collapse' : 'adminManagers.expand', { name: r.full_name || r.email })}
                          onClick={(e) => { e.stopPropagation(); toggle(); }}
                        >
                          {isOpen ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {r.full_name || r.email}
                          {r.role === 'admin' && <Badge variant="outline">{t('adminManagers.admin')}</Badge>}
                        </div>
                        {r.full_name && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" title={t('adminManagers.activeOfTotal')}>
                        {active} / {r.owned.length}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {latest ? (
                          <>
                            <div className="font-medium">{latest.name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">{fmtDate(latest.created_at)}</div>
                          </>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums" title={r.coManaged.map((l) => l.name).join(', ')}>
                        {r.coManaged.length}
                      </TableCell>
                      <TableCell className={cn('hidden md:table-cell tabular-nums', bill.tone)}>{bill.text}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="whitespace-normal bg-muted/40">
                          <div className="flex flex-col gap-4 px-2 py-2">
                            <p className={cn('text-sm md:hidden', bill.tone)}>{bill.text}</p>
                            <section>
                              <h4 className="text-sm font-semibold">{t('adminManagers.createdLeagues', { count: r.owned.length })}</h4>
                              {r.owned.length === 0
                                ? <p className="text-sm text-muted-foreground">{t('adminManagers.noLeagues')}</p>
                                : <ul className="divide-y">{r.owned.map(leagueLine)}</ul>}
                            </section>
                            {r.coManaged.length > 0 && (
                              <section>
                                <h4 className="text-sm font-semibold">{t('adminManagers.coManagedLeagues', { count: r.coManaged.length })}</h4>
                                <ul className="divide-y">{r.coManaged.map(leagueLine)}</ul>
                              </section>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

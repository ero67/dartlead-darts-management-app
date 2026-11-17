import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eraser, Loader, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { tournamentService } from '../services/tournamentService';
import { leagueService } from '../services/leagueService';
import { confirmDialog } from '../lib/confirmDialog';

const NONE = '__none';
const MAX_CLEAR = 20; // same cap as admin_clear_match_stats

const SKIP_REASONS = {
  not_found: 'match not found',
  not_completed: 'not completed',
  cricket: 'Cricket match',
  already_cleared: 'already cleared',
  no_stats: 'has no stats',
  no_backup: 'no backup to restore',
  rescored: 'scored again since the clear, left as is',
};

const COLUMNS = [
  { key: 'average', label: 'Average', digits: 1 },
  { key: 'bestCheckout', label: 'Best checkout' },
  { key: 'fewestDarts', label: 'Fewest darts', asc: true },
  { key: 'oneEighties', label: '180s' },
];

const fold = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const fmt = (v, digits = 0) => (v == null ? '–' : Number(v).toFixed(digits));
const isSuspicious = (row) => [row.p1, row.p2].some(s => s?.repetitive || s?.aboveAverage);

// A row sorts by the better side: highest value, or lowest for fewest darts.
const sortValue = (row, { key, asc }) => {
  const values = [row.p1?.[key], row.p2?.[key]].filter(v => v != null).map(Number);
  if (!values.length) return null;
  return asc ? Math.min(...values) : Math.max(...values);
};

const matchLine = (row) => {
  const pair = (key, digits) => `${fmt(row.p1?.[key], digits)} / ${fmt(row.p2?.[key], digits)}`;
  return `${row.p1?.name || '?'} vs ${row.p2?.name || '?'} (${row.p1?.legs ?? 0}:${row.p2?.legs ?? 0}) · avg ${pair('average', 1)} · best checkout ${pair('bestCheckout')} · fewest darts ${pair('fewestDarts')}`;
};

function SideFlags({ side }) {
  if (!side) return null;
  return (
    <>
      {side.repetitive && (
        <Badge variant="destructive">Repetitive visits ({Math.round(side.repeatShare * 100)}%)</Badge>
      )}
      {side.aboveAverage && (
        <Badge variant="outline">+{fmt(side.average - side.ownAverage, 1)} over own avg</Badge>
      )}
    </>
  );
}

export function MatchStatsCleanup() {
  const [leagues, setLeagues] = useState([]);
  const [leagueId, setLeagueId] = useState('');
  const [rows, setRows] = useState([]);
  const [roundId, setRoundId] = useState('');
  const [playerFilter, setPlayerFilter] = useState('');
  const [isSuspiciousOnly, setIsSuspiciousOnly] = useState(true);
  const [sort, setSort] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    leagueService.getLeagues()
      .then(setLeagues)
      .catch(err => toast.error(`Failed to load leagues: ${err.message}`));
  }, []);

  const loadRows = async (id, keepRound = false) => {
    setIsLoading(true);
    setSelectedIds([]);
    try {
      const data = await tournamentService.getMatchStatsReview(id);
      setRows(data);
      if (!keepRound) {
        const firstSuspicious = data.find(isSuspicious);
        setRoundId((firstSuspicious || data[0])?.tournament_id || '');
      }
    } catch (err) {
      toast.error(`Failed to load matches: ${err.message}`);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeagueChange = (id) => {
    setLeagueId(id);
    setRows([]);
    setRoundId('');
    if (id) loadRows(id);
  };

  const handleRoundChange = (id) => {
    setRoundId(id);
    setSelectedIds([]);
  };

  // Rows arrive ordered by round, so the first row of each round fixes the order.
  const rounds = useMemo(() => {
    const byId = new Map();
    rows.forEach(row => {
      const round = byId.get(row.tournament_id) || { id: row.tournament_id, name: row.tournament_name, suspicious: 0 };
      if (isSuspicious(row) && !row.stats_cleared) round.suspicious += 1;
      byId.set(row.tournament_id, round);
    });
    return [...byId.values()];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = fold(playerFilter.trim());
    const list = rows.filter(row =>
      row.tournament_id === roundId &&
      (!isSuspiciousOnly || isSuspicious(row) || row.stats_cleared) &&
      (!needle || fold(row.p1?.name).includes(needle) || fold(row.p2?.name).includes(needle))
    );
    if (!sort) return list;
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      if (va == null) return vb == null ? 0 : 1;
      if (vb == null) return -1;
      return sort.asc ? va - vb : vb - va;
    });
  }, [rows, roundId, isSuspiciousOnly, playerFilter, sort]);

  const handleSort = (column) => {
    setSort(prev => (prev?.key === column.key
      ? { ...prev, asc: !prev.asc }
      : { key: column.key, asc: !!column.asc }));
  };

  const toggleSelected = (id) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const reportSkipped = (skipped) => {
    if (!skipped?.length) return;
    const nameOf = (id) => {
      const row = rows.find(r => r.match_id === id);
      return row ? `${row.p1?.name} vs ${row.p2?.name}` : id;
    };
    toast.warning(skipped.map(s => `Skipped ${nameOf(s.match_id)}: ${SKIP_REASONS[s.reason] || s.reason}`).join('\n'));
  };

  const handleClear = async () => {
    const chosen = rows.filter(r => selectedIds.includes(r.match_id));
    const ok = await confirmDialog(
      `${chosen.map(matchLine).join('\n')}\n\nThese numbers will be removed from the stats. Winners and legs stay. You can restore from the backup.`,
      { title: `Clear stats of ${chosen.length} match(es)?`, confirmLabel: 'Clear stats', destructive: true }
    );
    if (!ok) return;
    setIsBusy(true);
    try {
      const result = await tournamentService.clearMatchStats(chosen.map(r => r.match_id));
      toast.success(`Cleared stats of ${result.cleared.length} match(es).`);
      reportSkipped(result.skipped);
      await loadRows(leagueId, true);
    } catch (err) {
      toast.error(`Clear failed: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestore = async (row) => {
    const ok = await confirmDialog(
      `${row.p1?.name} vs ${row.p2?.name}\n\nPuts the cleared averages, checkouts and darts back from the backup.`,
      { title: 'Restore stats?', confirmLabel: 'Restore' }
    );
    if (!ok) return;
    setIsBusy(true);
    try {
      const result = await tournamentService.restoreMatchStats([row.match_id]);
      if (result.restored.length) toast.success('Stats restored.');
      reportSkipped(result.skipped);
      await loadRows(leagueId, true);
    } catch (err) {
      toast.error(`Restore failed: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match stats</CardTitle>
        <CardDescription>
          Clear made-up averages, checkouts and darts from matches. Results stay. Cleared stats can be restored.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="statsLeague">League</Label>
            <Select value={leagueId || NONE} onValueChange={(v) => handleLeagueChange(v === NONE ? '' : v)} disabled={isBusy}>
              <SelectTrigger id="statsLeague" className="w-72 max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>-- Select a league --</SelectItem>
                {leagues.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {rounds.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="statsRound">Round</Label>
              <Select value={roundId || NONE} onValueChange={(v) => handleRoundChange(v === NONE ? '' : v)} disabled={isBusy}>
                <SelectTrigger id="statsRound" className="w-72 max-w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rounds.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.suspicious} suspicious)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {rounds.length > 0 && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="statsPlayer">Player</Label>
                <Input id="statsPlayer" className="w-56" placeholder="Filter by name" value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)} />
              </div>
              <Label htmlFor="statsSuspicious" className="h-9 gap-2 font-normal">
                <Switch id="statsSuspicious" checked={isSuspiciousOnly} onCheckedChange={setIsSuspiciousOnly} />
                Suspicious only
              </Label>
            </>
          )}
        </div>

        {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader className="size-4 animate-spin" /> Loading matches…</p>}
        {!isLoading && leagueId && rows.length === 0 && <p className="text-sm text-muted-foreground">No completed X01 matches in this league.</p>}

        {!isLoading && roundId && (
          visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches match the filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-0" />
                    <TableHead>Match</TableHead>
                    {COLUMNS.map(column => (
                      <TableHead key={column.key} className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleSort(column)}>
                          {column.label}
                          {sort?.key === column.key && (sort.asc ? <ArrowUp /> : <ArrowDown />)}
                        </Button>
                      </TableHead>
                    ))}
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map(row => {
                    const canSelect = row.has_stats && !row.stats_cleared;
                    return (
                      <TableRow key={row.match_id} data-state={selectedIds.includes(row.match_id) ? 'selected' : undefined}>
                        <TableCell>
                          {canSelect && (
                            <Checkbox
                              aria-label={`Select ${row.p1?.name} vs ${row.p2?.name}`}
                              checked={selectedIds.includes(row.match_id)}
                              onCheckedChange={() => toggleSelected(row.match_id)}
                              disabled={isBusy}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {[row.p1, row.p2].map((side, i) => (
                              <span key={i} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{side?.name || '?'}</span>
                                <span className="tabular-nums text-muted-foreground">{side?.legs ?? 0}</span>
                                {!row.stats_cleared && <SideFlags side={side} />}
                              </span>
                            ))}
                            {row.is_playoff && <span className="text-xs text-muted-foreground">Playoff</span>}
                          </div>
                        </TableCell>
                        {COLUMNS.map(column => (
                          <TableCell key={column.key} className="text-right tabular-nums">
                            <div className="flex flex-col gap-1">
                              <span>{fmt(row.p1?.[column.key], column.digits)}</span>
                              <span>{fmt(row.p2?.[column.key], column.digits)}</span>
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          {row.stats_cleared ? (
                            <span className="flex items-center justify-end gap-2">
                              <Badge variant="secondary">Cleared</Badge>
                              <Button variant="outline" size="sm" onClick={() => handleRestore(row)} disabled={isBusy}>
                                <RotateCcw /> Restore
                              </Button>
                            </span>
                          ) : !row.has_stats && (
                            <span className="text-xs text-muted-foreground">No stats</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {roundId && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={selectedIds.length === 0 || selectedIds.length > MAX_CLEAR || isBusy}
            >
              {isBusy ? <Loader className="animate-spin" /> : <Eraser />}
              Clear stats ({selectedIds.length})
            </Button>
            {selectedIds.length > MAX_CLEAR && (
              <span className="text-sm text-destructive">At most {MAX_CLEAR} matches at a time.</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

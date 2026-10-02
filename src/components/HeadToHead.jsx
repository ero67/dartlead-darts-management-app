import React, { useState, useEffect } from 'react';
import { Users, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// shadcn Select items need a non-empty value; '' (nobody picked) maps to this.
const NONE = '__none';

export function HeadToHead({ leagueId, players }) {
  const { t } = useLanguage();
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      setStats(null);
      return;
    }
    loadH2H();
  }, [player1Id, player2Id]);

  const loadH2H = async () => {
    setLoading(true);
    try {
      const { data: leagueTournaments } = await supabase
        .from('tournaments')
        .select('id')
        .eq('league_id', leagueId)
        .eq('deleted', false);

      const tIds = (leagueTournaments || []).map(t => t.id);
      if (tIds.length === 0) { setStats(null); setLoading(false); return; }

      const { data: matches } = await supabase
        .from('matches')
        .select('player1_id, player2_id, winner_id, player1_legs, player2_legs, result')
        .in('tournament_id', tIds)
        .eq('status', 'completed')
        .or(`and(player1_id.eq.${player1Id},player2_id.eq.${player2Id}),and(player1_id.eq.${player2Id},player2_id.eq.${player1Id})`);

      if (!matches || matches.length === 0) {
        setStats({ matches: 0 });
        setLoading(false);
        return;
      }

      let p1Wins = 0, p2Wins = 0, p1Legs = 0, p2Legs = 0;
      let p1TotalScore = 0, p1TotalDarts = 0, p2TotalScore = 0, p2TotalDarts = 0;

      matches.forEach(m => {
        if (m.winner_id === player1Id) p1Wins++;
        else if (m.winner_id === player2Id) p2Wins++;

        if (m.player1_id === player1Id) {
          p1Legs += m.player1_legs || 0;
          p2Legs += m.player2_legs || 0;
        } else {
          p1Legs += m.player2_legs || 0;
          p2Legs += m.player1_legs || 0;
        }

        if (m.result) {
          const p1Stats = m.player1_id === player1Id ? m.result.player1Stats : m.result.player2Stats;
          const p2Stats = m.player1_id === player1Id ? m.result.player2Stats : m.result.player1Stats;
          if (p1Stats) { p1TotalScore += p1Stats.totalScore || 0; p1TotalDarts += p1Stats.totalDarts || 0; }
          if (p2Stats) { p2TotalScore += p2Stats.totalScore || 0; p2TotalDarts += p2Stats.totalDarts || 0; }
        }
      });

      setStats({
        matches: matches.length,
        p1Wins,
        p2Wins,
        p1Legs,
        p2Legs,
        p1Avg: p1TotalDarts > 0 ? (p1TotalScore / p1TotalDarts) * 3 : 0,
        p2Avg: p2TotalDarts > 0 ? (p2TotalScore / p2TotalDarts) * 3 : 0
      });
    } catch (error) {
      console.error('Error loading H2H:', error);
    } finally {
      setLoading(false);
    }
  };

  const p1Name = players.find(p => p.id === player1Id)?.name || '';
  const p2Name = players.find(p => p.id === player2Id)?.name || '';

  const renderPlayerSelect = (value, onChange) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="w-full min-w-0 flex-1" aria-label={t('leagues.selectPlayer')}>
        <SelectValue placeholder={t('leagues.selectPlayer')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('leagues.selectPlayer')}</SelectItem>
        {players.map(p => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="tw text-card-foreground">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {t('leagues.headToHead')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {renderPlayerSelect(player1Id, setPlayer1Id)}
          <span className="px-1 text-xs font-medium uppercase text-muted-foreground">{t('leagues.statVs')}</span>
          {renderPlayerSelect(player2Id, setPlayer2Id)}
        </div>

        {loading && (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Loader className="size-4 animate-spin" />
          </div>
        )}

        {stats && !loading && stats.matches === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">{t('leagues.noH2HMatches')}</p>
        )}

        {stats && !loading && stats.matches > 0 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className={cn('flex flex-col gap-1', stats.p1Wins <= stats.p2Wins && 'text-muted-foreground')}>
                <span className="truncate text-sm font-medium">{p1Name}</span>
                <span className="text-4xl font-semibold tracking-tight tabular-nums">{stats.p1Wins}</span>
              </div>
              <span className="text-center text-xs text-muted-foreground">
                {t(stats.matches === 1 ? 'common.matchCountOne' : stats.matches < 5 ? 'common.matchCountFew' : 'common.matchCountMany', { count: stats.matches })}
              </span>
              <div className={cn('flex flex-col items-end gap-1 text-right', stats.p2Wins <= stats.p1Wins && 'text-muted-foreground')}>
                <span className="truncate text-sm font-medium">{p2Name}</span>
                <span className="text-4xl font-semibold tracking-tight tabular-nums">{stats.p2Wins}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">{t('leagues.legsRecord')}</span>
                <strong className="tabular-nums">{stats.p1Legs} : {stats.p2Legs}</strong>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">{t('leagues.avgAgainst')}</span>
                <strong className="tabular-nums">{stats.p1Avg.toFixed(1)} : {stats.p2Avg.toFixed(1)}</strong>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

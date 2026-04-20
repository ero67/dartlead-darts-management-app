import React, { useState, useEffect } from 'react';
import { Users, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

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

  return (
    <div className="h2h-section">
      <h3 className="h2h-title">
        <Users size={18} />
        {t('leagues.headToHead')}
      </h3>
      <div className="h2h-selectors">
        <select value={player1Id} onChange={(e) => setPlayer1Id(e.target.value)}>
          <option value="">{t('leagues.selectPlayer')}</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="h2h-vs">vs</span>
        <select value={player2Id} onChange={(e) => setPlayer2Id(e.target.value)}>
          <option value="">{t('leagues.selectPlayer')}</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="h2h-loading"><Loader size={16} className="spinning" /></div>
      )}

      {stats && !loading && stats.matches === 0 && (
        <p className="h2h-no-matches">{t('leagues.noH2HMatches')}</p>
      )}

      {stats && !loading && stats.matches > 0 && (
        <div className="h2h-results">
          <div className="h2h-record">
            <div className={`h2h-player ${stats.p1Wins > stats.p2Wins ? 'h2h-player--leading' : ''}`}>
              <span className="h2h-player-name">{p1Name}</span>
              <span className="h2h-player-wins">{stats.p1Wins}</span>
            </div>
            <div className="h2h-center">
              <span className="h2h-matches-count">{stats.matches} {stats.matches === 1 ? 'match' : 'matches'}</span>
            </div>
            <div className={`h2h-player ${stats.p2Wins > stats.p1Wins ? 'h2h-player--leading' : ''}`}>
              <span className="h2h-player-wins">{stats.p2Wins}</span>
              <span className="h2h-player-name">{p2Name}</span>
            </div>
          </div>
          <div className="h2h-details">
            <div className="h2h-stat">
              <span>{t('leagues.legsRecord')}</span>
              <strong>{stats.p1Legs} : {stats.p2Legs}</strong>
            </div>
            <div className="h2h-stat">
              <span>{t('leagues.avgAgainst')}</span>
              <strong>{stats.p1Avg.toFixed(1)} : {stats.p2Avg.toFixed(1)}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

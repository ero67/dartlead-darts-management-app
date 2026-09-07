import React from 'react';
import { TrendingUp, Crosshair, Hash, Clock, Flame, Zap, Target, Activity } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { computePracticeSummary } from '../../lib/practiceSummary';
import './Practice.css';

const secs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Personal bests across all practice games, from the finished-session history.
export function PracticeBests({ entries, compact = false }) {
  const { t } = useLanguage();
  const s = computePracticeSummary(entries);
  if (s.sessions === 0) return null;
  const dash = t('practice.noStats');
  const pct = (v) => (v === null || v === undefined ? dash : `${v.toFixed(0)}%`);

  const tiles = [
    { key: 'sessions', icon: Target, label: t('practice.stats.sessions'), value: s.sessions, sub: t('practice.bests.last30', { count: s.last30Days }) },
    { key: 'darts', icon: Activity, label: t('practice.stats.darts'), value: s.totalDarts.toLocaleString() },
    s.x01.sessions > 0 && { key: 'avg', icon: TrendingUp, label: t('practice.bests.bestAverage'), value: s.x01.bestAverage === null ? dash : s.x01.bestAverage.toFixed(1), sub: t('practice.games.x01.title') },
    s.x01.sessions > 0 && { key: 'first9', icon: TrendingUp, label: t('practice.bests.bestFirstNine'), value: s.x01.bestFirstNine === null ? dash : s.x01.bestFirstNine.toFixed(1) },
    s.x01.sessions > 0 && { key: '180', icon: Flame, label: t('practice.stats.oneEighties'), value: s.x01.oneEighties },
    s.x01.sessions > 0 && { key: 'hico', icon: Zap, label: t('practice.stats.highestCheckout'), value: s.x01.highestCheckout ?? dash },
    s.x01.bestLegDarts !== null && { key: 'bestleg', icon: Zap, label: t('practice.bests.bestLeg'), value: t(`practice.stats.darts${s.x01.bestLegDarts === 1 ? 'One' : s.x01.bestLegDarts <= 4 ? 'Few' : 'Many'}`, { count: s.x01.bestLegDarts }) },
    s.checkout.sessions > 0 && { key: 'co', icon: Crosshair, label: t('practice.bests.bestHitRate'), value: pct(s.checkout.bestHitPercent), sub: t('practice.games.checkout.title') },
    s.checkout.sessions > 0 && { key: 'costreak', icon: Crosshair, label: t('practice.checkout.stats.bestStreak'), value: s.checkout.bestStreak ?? dash },
    s.oneTwentyOne.sessions > 0 && { key: '121', icon: Hash, label: t('practice.oneTwentyOne.stats.highestSuccess'), value: s.oneTwentyOne.highestSuccess ?? dash, sub: t('practice.games.oneTwentyOne.title') },
    s.aroundTheClock.sessions > 0 && { key: 'atcd', icon: Clock, label: t('practice.bests.fewestDarts'), value: s.aroundTheClock.fewestDarts ?? dash, sub: t('practice.games.aroundTheClock.title') },
    s.aroundTheClock.sessions > 0 && { key: 'atct', icon: Clock, label: t('practice.bests.fastestTime'), value: s.aroundTheClock.fastestSeconds === null ? dash : secs(s.aroundTheClock.fastestSeconds) }
  ].filter(Boolean);

  return (
    <div className={`stats-grid practice-bests ${compact ? 'compact' : ''}`}>
      {tiles.map((tile) => (
        <div className="stat-card" key={tile.key}>
          <div className="stat-icon"><tile.icon size={22} /></div>
          <div className="stat-content">
            <h3>{tile.value}</h3>
            <p>{tile.label}{tile.sub ? <span className="practice-bests-sub"> · {tile.sub}</span> : null}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

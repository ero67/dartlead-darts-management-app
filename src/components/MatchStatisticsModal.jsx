import React from 'react';
import { createPortal } from 'react-dom';
import { X, BarChart3 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCloseOnBack } from '../hooks/useCloseOnBack';

// Statistics of one completed match: score hero, side-by-side comparison with
// the better side highlighted, leg-by-leg table, checkout chips. Used from the
// tournament match lists and from the player profile.
//
// `match` = { player1: {id,name}, player2: {id,name}, result: {...}, isPlayoff?,
//             tournamentName?, roundName?, groupName? }
// result comes from saveMatchResult: winner, player1Legs, player2Legs,
// player{1,2}Stats: { average, oneEighties, totalScore, totalDarts,
//   checkouts: [{leg, checkout, darts, totalDarts} | number],
//   legs: [{leg, darts, checkout, average, isWin}] }

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const checkoutValues = (stats) => (stats?.checkouts || [])
  .map((c) => (typeof c === 'object' ? num(c?.checkout) : num(c)))
  .filter((c) => c > 0)
  .sort((a, b) => b - a);
const bestLegDarts = (stats) => {
  const wins = (stats?.legs || []).filter((l) => l?.isWin && num(l.darts) > 0).map((l) => num(l.darts));
  return wins.length ? Math.min(...wins) : null;
};

export function MatchStatisticsModal({ match, onClose }) {
  // Back button closes the dialog rather than leaving the page behind it
  useCloseOnBack(!!match, onClose);
  const { t } = useLanguage();
  if (!match?.result) return null;

  const r = match.result;
  const s1 = r.player1Stats || {};
  const s2 = r.player2Stats || {};
  const p1 = match.player1?.name || t('management.player1');
  const p2 = match.player2?.name || t('management.player2');
  const p1Won = r.winner && r.winner === match.player1?.id;
  const p2Won = r.winner && r.winner === match.player2?.id;
  const hasDetails = (s1.legs?.length || s2.legs?.length || s1.totalDarts || s2.totalDarts) > 0;

  const co1 = checkoutValues(s1);
  const co2 = checkoutValues(s2);
  const rows = [
    { key: 'average', label: t('matchStats.average'), a: num(s1.average), b: num(s2.average), fmt: (v) => v.toFixed(2), higherBetter: true },
    { key: 'oneEighties', label: t('matchStats.oneEighties'), a: num(s1.oneEighties), b: num(s2.oneEighties), higherBetter: true },
    { key: 'highestCheckout', label: t('matchStats.highestCheckout'), a: co1[0] || 0, b: co2[0] || 0, higherBetter: true },
    { key: 'checkoutCount', label: t('matchStats.checkoutCount'), a: co1.length, b: co2.length, higherBetter: true },
    { key: 'bestLeg', label: t('matchStats.bestLeg'), a: bestLegDarts(s1), b: bestLegDarts(s2), higherBetter: false },
    { key: 'dartsThrown', label: t('matchStats.dartsThrown'), a: num(s1.totalDarts), b: num(s2.totalDarts), neutral: true },
    { key: 'pointsScored', label: t('matchStats.pointsScored'), a: num(s1.totalScore), b: num(s2.totalScore), neutral: true }
  ];

  const legCount = Math.max(s1.legs?.length || 0, s2.legs?.length || 0);
  const legs = Array.from({ length: legCount }, (_, i) => ({ l1: s1.legs?.[i], l2: s2.legs?.[i] }));

  const renderValue = (row, side) => {
    const v = side === 'a' ? row.a : row.b;
    const o = side === 'a' ? row.b : row.a;
    const shown = v === null || v === undefined ? '—' : row.fmt ? row.fmt(v) : String(v);
    let better = false;
    if (!row.neutral && v !== null && o !== null && v !== undefined && o !== undefined && v !== o) {
      better = row.higherBetter ? v > o : v < o;
    }
    const total = num(row.a) + num(row.b);
    const pct = total > 0 ? Math.round((num(v) / total) * 100) : 0;
    return (
      <div className={`mstats-row__value ${side === 'b' ? 'right' : ''} ${better ? 'better' : ''}`}>
        <span>{shown}</span>
        {!row.neutral && total > 0 && <div className="mstats-bar"><span style={{ width: `${pct}%` }} /></div>}
      </div>
    );
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal match-statistics-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><BarChart3 size={18} />{t('matchStats.title')}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label={t('common.close', 'Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-content">
          <div className="mstats-hero">
            <div className={`mstats-hero__player ${p1Won ? 'winner' : ''}`}>
              <span className="mstats-hero__name">{p1}</span>
              {p1Won && <span className="mstats-hero__tag">{t('matchStats.winner')}</span>}
            </div>
            <div className="mstats-hero__score">
              <span className={p1Won ? 'win' : ''}>{num(r.player1Legs)}</span>
              <span className="sep">:</span>
              <span className={p2Won ? 'win' : ''}>{num(r.player2Legs)}</span>
            </div>
            <div className={`mstats-hero__player right ${p2Won ? 'winner' : ''}`}>
              <span className="mstats-hero__name">{p2}</span>
              {p2Won && <span className="mstats-hero__tag">{t('matchStats.winner')}</span>}
            </div>
          </div>
          {(match.tournamentName || match.groupName || match.roundName || match.isPlayoff) && (
            <div className="mstats-context">
              {match.tournamentName && <span>{match.tournamentName}</span>}
              {match.groupName && <span>{match.groupName}</span>}
              {match.roundName && <span>{match.roundName}</span>}
              {!match.roundName && match.isPlayoff && <span>{t('management.playoffMatch')}</span>}
            </div>
          )}

          {!hasDetails ? (
            <p className="mstats-empty">{t('matchStats.noDetails')}</p>
          ) : (
            <>
              <div className="mstats-compare">
                {rows.map((row) => (
                  <div key={row.key} className="mstats-row">
                    {renderValue(row, 'a')}
                    <div className="mstats-row__label">{row.label}</div>
                    {renderValue(row, 'b')}
                  </div>
                ))}
              </div>

              {legs.length > 0 && (
                <div className="mstats-section">
                  <h4>{t('matchStats.legByLeg')}</h4>
                  <table className="mstats-legs">
                    <thead>
                      <tr>
                        <th>{t('matchStats.leg')}</th>
                        <th>{p1}</th>
                        <th>{p2}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map(({ l1, l2 }, i) => {
                        const cell = (leg) => {
                          if (!leg) return <td className="muted">—</td>;
                          return (
                            <td className={leg.isWin ? 'won' : ''}>
                              {num(leg.darts) > 0 ? `${num(leg.darts)} ${t('matchStats.darts').toLowerCase()}` : '—'}
                              {leg.average ? <span className="co"> · {t('matchStats.legAvg')} {num(leg.average).toFixed(1)}</span> : null}
                              {leg.isWin && num(leg.checkout) > 0 ? <span className="co"> · ✓ {num(leg.checkout)}</span> : null}
                            </td>
                          );
                        };
                        return (
                          <tr key={i}>
                            <td className="leg-no">{i + 1}</td>
                            {cell(l1)}
                            {cell(l2)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mstats-checkouts">
                <div>
                  <h4>{t('matchStats.checkoutsOf')} · {p1}</h4>
                  <div className="mstats-chips">
                    {co1.length ? co1.map((c, i) => <span key={i} className={`mstats-chip ${i === 0 ? 'top' : ''}`}>{c}</span>) : <span className="mstats-empty">{t('matchStats.noCheckouts')}</span>}
                  </div>
                </div>
                <div className="right">
                  <h4>{t('matchStats.checkoutsOf')} · {p2}</h4>
                  <div className="mstats-chips">
                    {co2.length ? co2.map((c, i) => <span key={i} className={`mstats-chip ${i === 0 ? 'top' : ''}`}>{c}</span>) : <span className="mstats-empty">{t('matchStats.noCheckouts')}</span>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

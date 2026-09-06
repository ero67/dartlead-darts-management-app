import React, { useState, useRef, useEffect } from 'react';
import { Share2, Image as ImageIcon, FileSpreadsheet, Loader } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { deliverFile, elementToPngBlob, buildStandingsCsv, buildResultsCsv, csvBlob, exportFileName } from '../lib/exportShare';

// "Share / export" dropdown for a tournament view. `imageTarget` is a ref to the
// DOM node to render as an image; the CSV items work from tournament data.
export function ExportMenu({ tournament, imageTarget, imageSuffix = 'standings', items = ['image', 'standings', 'results'] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      setOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      setError(t('export.failed'));
    } finally {
      setBusy('');
    }
  };

  const shareImage = () => run('image', async () => {
    const el = imageTarget?.current;
    if (!el) throw new Error('no target');
    const isDark = document.documentElement.classList.contains('dark-mode');
    const blob = await elementToPngBlob(el, { backgroundColor: isDark ? '#0f141c' : '#ffffff' });
    await deliverFile({ blob, filename: exportFileName(tournament.name, imageSuffix, 'png'), title: tournament.name, text: `${tournament.name} · dartlead.app` });
  });

  const labels = {
    group: t('export.colGroup'), position: t('management.pos'), player: t('management.player'), played: t('management.played'),
    won: t('management.won'), lost: t('management.lost'), legsWon: t('export.colLegsWon'), legsLost: t('export.colLegsLost'),
    legDiff: t('management.legsDiff'), average: t('management.avg'), points: t('management.pts'),
    stage: t('export.colStage'), player1: t('export.colPlayer1'), player2: t('export.colPlayer2'), legs1: t('export.colLegs1'), legs2: t('export.colLegs2'),
    winner: t('export.colWinner'), thirdPlace: t('export.thirdPlace')
  };

  const downloadStandings = () => run('standings', async () => {
    await deliverFile({ blob: csvBlob(buildStandingsCsv(tournament, labels)), filename: exportFileName(tournament.name, 'standings', 'csv'), title: tournament.name });
  });
  const downloadResults = () => run('results', async () => {
    await deliverFile({ blob: csvBlob(buildResultsCsv(tournament, labels)), filename: exportFileName(tournament.name, 'results', 'csv'), title: tournament.name });
  });

  return (
    <div className="export-menu" ref={wrapRef}>
      <button type="button" className="export-menu__btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={t('export.title')}>
        {busy ? <Loader size={16} className="spinning" /> : <Share2 size={16} />}
        <span className="btn-label">{t('export.title')}</span>
      </button>
      {open && (
        <div className="export-menu__list" role="menu">
          {items.includes('image') && (
            <button type="button" role="menuitem" onClick={shareImage} disabled={!!busy}>
              <ImageIcon size={16} />{t('export.shareImage')}
            </button>
          )}
          {items.includes('standings') && (
            <button type="button" role="menuitem" onClick={downloadStandings} disabled={!!busy}>
              <FileSpreadsheet size={16} />{t('export.standingsCsv')}
            </button>
          )}
          {items.includes('results') && (
            <button type="button" role="menuitem" onClick={downloadResults} disabled={!!busy}>
              <FileSpreadsheet size={16} />{t('export.resultsCsv')}
            </button>
          )}
          {error && <p className="export-menu__error">{error}</p>}
        </div>
      )}
    </div>
  );
}

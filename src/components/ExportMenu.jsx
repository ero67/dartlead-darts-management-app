import React, { useState } from 'react';
import { Share2, Image as ImageIcon, FileSpreadsheet, Loader } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { deliverFile, elementToPngBlob, buildStandingsCsv, buildResultsCsv, csvBlob, exportFileName } from '../lib/exportShare';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// "Share / export" dropdown for a tournament view. `imageTarget` is a ref to the
// DOM node to render as an image; the CSV items work from tournament data.
export function ExportMenu({ tournament, imageTarget, imageSuffix = 'standings', items = ['image', 'standings', 'results'] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

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

  // While an export runs the menu stays open so the spinner and any error are visible.
  const handleOpenChange = (next) => { if (!busy) setOpen(next); };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="tw" title={t('export.title')}>
          {busy ? <Loader className="animate-spin" /> : <Share2 />}
          <span className="hidden sm:inline">{t('export.title')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tw min-w-48">
        {items.includes('image') && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); shareImage(); }} disabled={!!busy}>
            <ImageIcon />{t('export.shareImage')}
          </DropdownMenuItem>
        )}
        {items.includes('standings') && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); downloadStandings(); }} disabled={!!busy}>
            <FileSpreadsheet />{t('export.standingsCsv')}
          </DropdownMenuItem>
        )}
        {items.includes('results') && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); downloadResults(); }} disabled={!!busy}>
            <FileSpreadsheet />{t('export.resultsCsv')}
          </DropdownMenuItem>
        )}
        {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

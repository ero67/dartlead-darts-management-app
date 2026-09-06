import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toPng } from 'html-to-image';

// Getting a file out of the app — an image of the standings/bracket or a CSV.
//
// Browser: the Web Share API with files where it exists (Android Chrome,
// Safari), otherwise a plain download. Capacitor shell: the WebView can
// neither download nor navigator.share, so the file is written to the app's
// cache directory and handed to the system share sheet, which covers
// "send to the group chat" as well as "save to Files".

const safeName = (s) => String(s || 'export').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'export';

export const exportFileName = (tournamentName, suffix, ext) => `${safeName(tournamentName)}-${suffix}.${ext}`;

export async function elementToPngBlob(element, { backgroundColor, pixelRatio = 2, padding = '1rem' } = {}) {
  const dataUrl = await toPng(element, { backgroundColor, pixelRatio, style: { padding }, cacheBust: true });
  const res = await fetch(dataUrl);
  return res.blob();
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.readAsDataURL(blob);
});

// Returns 'shared' | 'downloaded'. Throws if nothing worked (a cancelled
// share sheet is treated as success — the user chose to stop).
export async function deliverFile({ blob, filename, title, text }) {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try {
      await Share.share({ title, text, files: [uri], dialogTitle: title });
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) throw err;
    }
    return 'shared';
  }

  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, text, files: [file] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'shared';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

// ---- CSV -------------------------------------------------------------------
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Semicolon-separated with a BOM: opens correctly in Excel with a Slovak/Czech
// locale (comma is the decimal separator there) and still parses as CSV.
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
export const csvBlob = (text) => new Blob([text], { type: 'text/csv;charset=utf-8' });

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '');

export function buildStandingsCsv(tournament, labels) {
  const rows = [[labels.group, labels.position, labels.player, labels.played, labels.won, labels.lost, labels.legsWon, labels.legsLost, labels.legDiff, labels.average, labels.points]];
  for (const g of tournament.groups || []) {
    (g.standings || []).forEach((s, i) => {
      rows.push([g.name, i + 1, s.player?.name, s.matchesPlayed, s.matchesWon, s.matchesLost, s.legsWon, s.legsLost, (s.legsWon || 0) - (s.legsLost || 0), fmt(s.average), s.points]);
    });
  }
  return toCsv(rows);
}

export function buildResultsCsv(tournament, labels) {
  const rows = [[labels.stage, labels.player1, labels.player2, labels.legs1, labels.legs2, labels.winner]];
  const push = (stage, m) => {
    if (m.status !== 'completed' || !m.result) return;
    const r = m.result;
    const winner = r.winner === m.player1?.id ? m.player1?.name : r.winner === m.player2?.id ? m.player2?.name : '';
    rows.push([stage, m.player1?.name, m.player2?.name, r.player1Legs, r.player2Legs, winner]);
  };
  for (const g of tournament.groups || []) for (const m of g.matches || []) push(g.name, m);
  for (const rd of tournament.playoffs?.rounds || []) for (const m of rd.matches || []) push(m.isThirdPlaceMatch ? labels.thirdPlace : rd.name, m);
  return toCsv(rows);
}

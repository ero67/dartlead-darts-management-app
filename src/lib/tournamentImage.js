import { mergeBracketRounds } from '../utils/bracketView';

// Draws a tournament "poster" PNG on a canvas: podium, group standings, the
// playoff bracket results and (optionally) stat awards, as dense as a sheet
// of paper. Replaces screenshotting the DOM, which on a phone produced a
// narrow, mostly empty image of whatever happened to be on screen.
//
// Fixed 1080 px wide at 2x, height grows with content. Always dark: the
// image is shared into chats, so it should look the same for everyone.

const W = 1080;
const PAD = 40;
const SCALE = 2;
const C = {
  bg: '#09090b', panel: '#131316', line: '#27272a', text: '#fafafa', muted: '#a1a1aa', faint: '#52525b',
  green: '#22c55e', greenDim: '#14532d', gold: '#f59e0b', silver: '#a1a1aa', bronze: '#b45309'
};
const SANS = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";
const DISPLAY = "'Barlow Condensed', 'Geist Variable', ui-sans-serif, sans-serif";

const font = (size, weight = 400, family = SANS) => `${weight} ${size}px ${family}`;
const fmtAvg = (n, d = 1) => (Number.isFinite(n) && n > 0 ? n.toFixed(d) : '–');

function truncate(ctx, text, maxWidth) {
  let s = String(text ?? '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = C.panel;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.fill();
  ctx.stroke();
}

function text(ctx, s, x, y, { size = 14, weight = 400, color = C.text, align = 'left', family = SANS, max } = {}) {
  ctx.font = font(size, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(max ? truncate(ctx, s, max) : String(s ?? ''), x, y);
}

function sectionTitle(ctx, label, y) {
  text(ctx, label.toUpperCase(), PAD, y, { size: 12, weight: 600, color: C.muted });
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y + 10, W - PAD * 2, 1);
  return y + 30;
}

// ---- sections ----------------------------------------------------------------

function drawHeader(ctx, tournament, labels, y) {
  text(ctx, tournament.name, PAD, y + 44, { size: 44, weight: 700, family: DISPLAY, max: W - PAD * 2 });
  const date = tournament.createdAt ? new Date(tournament.createdAt) : null;
  const meta = [
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : null,
    `${tournament.gameType === 'cricket' ? labels.cricket : tournament.startingScore || 501} · ${labels.firstTo} ${tournament.legsToWin || 3}`,
    tournament.status === 'completed' ? labels.completed : null
  ].filter(Boolean).join('   ·   ');
  text(ctx, meta, PAD, y + 72, { size: 14, color: C.muted });
  text(ctx, 'dartlead.app', W - PAD, y + 72, { size: 14, weight: 600, color: C.green, align: 'right' });
  return y + 100;
}

function podiumFromRounds(rounds) {
  const finalRound = rounds[rounds.length - 1];
  if (!finalRound?.matches) return [];
  const done = (m) => m?.status === 'completed' && m.result;
  const winnerLoser = (m) => {
    const w = m.result.winner === m.player1?.id ? m.player1 : m.player2;
    const l = m.result.winner === m.player1?.id ? m.player2 : m.player1;
    return [w, l];
  };
  const out = [];
  const final = finalRound.matches.find((m) => !m.isThirdPlaceMatch);
  const third = finalRound.matches.find((m) => m.isThirdPlaceMatch);
  if (done(final)) {
    const [w, l] = winnerLoser(final);
    if (w) out.push({ place: 1, name: w.name });
    if (l) out.push({ place: 2, name: l.name });
  }
  if (done(third)) {
    const [w] = winnerLoser(third);
    if (w) out.push({ place: 3, name: w.name });
  } else if (!third && rounds.length >= 2) {
    (rounds[rounds.length - 2].matches || []).forEach((m) => {
      if (done(m)) out.push({ place: 3, name: winnerLoser(m)[1]?.name });
    });
  }
  return out.filter((p) => p.name);
}

function drawPodium(ctx, podium, y) {
  if (!podium.length) return y;
  const gap = 16;
  const w = (W - PAD * 2 - gap * (podium.length - 1)) / podium.length;
  const medal = { 1: C.gold, 2: C.silver, 3: C.bronze };
  podium.forEach((p, i) => {
    const x = PAD + i * (w + gap);
    panel(ctx, x, y, w, 76);
    ctx.fillStyle = medal[p.place];
    ctx.beginPath();
    ctx.arc(x + 34, y + 38, 18, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(p.place), x + 34, y + 45, { size: 20, weight: 700, color: '#09090b', align: 'center', family: DISPLAY });
    text(ctx, p.name, x + 64, y + 44, { size: 20, weight: 600, max: w - 80 });
  });
  return y + 76 + 24;
}

function drawStandings(ctx, tournament, labels, y) {
  const groups = (tournament.groups || []).filter((g) => g.standings?.length);
  if (!groups.length) return y;
  y = sectionTitle(ctx, labels.standings, y);

  const cols = groups.length > 1 ? 2 : 1;
  const gap = 16;
  const gw = (W - PAD * 2 - gap * (cols - 1)) / cols;
  const row = 26;
  const perGroup = tournament.playoffSettings?.enabled !== false && tournament.playoffSettings?.qualificationMode !== 'total'
    ? Number(tournament.playoffSettings?.playersPerGroup || 0) : 0;
  // Right-aligned numeric columns, from the right edge inward.
  const isCricket = tournament.gameType === 'cricket';
  const numCols = [['avg', 58], ['legs', 58], ['lost', 34], ['won', 34], ['played', 34]];

  let rowY = y;
  groups.forEach((g, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) rowY = y;
    const x = PAD + col * (gw + gap);
    const h = 44 + g.standings.length * row + 8;
    panel(ctx, x, rowY, gw, h);
    text(ctx, g.name, x + 14, rowY + 28, { size: 20, weight: 700, family: DISPLAY, max: gw - 28 });
    let cx = x + gw - 12;
    ctx.font = font(11, 600);
    numCols.forEach(([key, cw]) => {
      text(ctx, key === 'avg' && isCricket ? labels.mpr : labels[key], cx, rowY + 28, { size: 11, weight: 600, color: C.faint, align: 'right' });
      cx -= cw;
    });
    const nameMax = cx - (x + 44);
    g.standings.forEach((s, r) => {
      const ry = rowY + 44 + r * row;
      const qualifies = perGroup > 0 && r < perGroup;
      if (qualifies) {
        ctx.fillStyle = C.greenDim;
        ctx.fillRect(x + 6, ry - 2, gw - 12, row);
      }
      text(ctx, r + 1, x + 24, ry + 16, { size: 13, weight: 600, color: qualifies ? C.green : C.faint, align: 'center' });
      text(ctx, s.player?.name || '?', x + 44, ry + 16, { size: 14, weight: qualifies ? 600 : 400, max: nameMax });
      let vx = x + gw - 12;
      const vals = { avg: fmtAvg(s.average, isCricket ? 2 : 1), legs: `${s.legsWon || 0}:${s.legsLost || 0}`, lost: s.matchesLost || 0, won: s.matchesWon || 0, played: s.matchesPlayed || 0 };
      numCols.forEach(([key, cw]) => {
        text(ctx, vals[key], vx, ry + 16, { size: 13, color: key === 'won' ? C.text : C.muted, align: 'right' });
        vx -= cw;
      });
    });
    if (col === cols - 1 || i === groups.length - 1) y = Math.max(y, rowY + h + gap);
    else y = Math.max(y, rowY + h + gap);
  });
  return y + 8;
}

function drawBracket(ctx, rounds, labels, y) {
  const played = rounds.filter((r) => (r.matches || []).some((m) => m.player1 || m.player2));
  if (!played.length) return y;
  y = sectionTitle(ctx, labels.playoffs, y);

  const gap = 12;
  const cw = (W - PAD * 2 - gap * (played.length - 1)) / played.length;
  const box = 54;
  const maxMatches = Math.max(...played.map((r) => r.matches.length));
  played.forEach((r, i) => {
    const x = PAD + i * (cw + gap);
    text(ctx, r.name, x, y + 12, { size: 12, weight: 600, color: C.muted, max: cw });
    // Centre each column's matches vertically like a bracket.
    const extra = r.matches.some((m) => m.isThirdPlaceMatch) ? 14 : 0;
    const colH = maxMatches * (box + 10);
    const myH = r.matches.length * (box + 10) + extra;
    let my = y + 24 + (colH - myH) / 2;
    r.matches.forEach((m) => {
      if (m.isThirdPlaceMatch) {
        my += 14;
        text(ctx, labels.thirdPlace, x, my - 4, { size: 10, weight: 600, color: C.faint, max: cw });
      }
      panel(ctx, x, my, cw, box);
      const done = m.status === 'completed' && m.result;
      const live = m.status === 'in_progress';
      [[m.player1, m.result?.player1Legs, 0], [m.player2, m.result?.player2Legs, 1]].forEach(([p, legs, k]) => {
        const ly = my + 21 + k * 24;
        const won = done && m.result.winner === p?.id;
        text(ctx, p?.name || '–', x + 10, ly, { size: 14, weight: won ? 700 : 400, color: p ? (won ? C.text : C.muted) : C.faint, max: cw - 46 });
        text(ctx, done ? legs ?? '' : live ? (k === 0 ? m.player1Legs : m.player2Legs) ?? '' : '', x + cw - 10, ly, { size: 15, weight: 700, color: won ? C.green : C.muted, align: 'right', family: DISPLAY });
      });
      if (live) { ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(x + cw - 6, my + 6, 4, 0, Math.PI * 2); ctx.fill(); }
      my += box + 10;
    });
  });
  return y + 24 + Math.max(maxMatches * (box + 10), 2 * (box + 10) + 14) + 16;
}

function drawAwards(ctx, awards, labels, y) {
  if (!awards?.length) return y;
  y = sectionTitle(ctx, labels.awards, y);
  const cols = 3;
  const gap = 12;
  const w = (W - PAD * 2 - gap * (cols - 1)) / cols;
  const h = 84;
  awards.forEach((a, i) => {
    const x = PAD + (i % cols) * (w + gap);
    const ay = y + Math.floor(i / cols) * (h + gap);
    panel(ctx, x, ay, w, h);
    text(ctx, a.label.toUpperCase(), x + 14, ay + 22, { size: 10, weight: 600, color: C.muted, max: w - 28 });
    text(ctx, a.value, x + 14, ay + 54, { size: 30, weight: 700, family: DISPLAY, color: C.green });
    text(ctx, a.players.join(', '), x + 14, ay + 72, { size: 12, max: w - 28 });
  });
  return y + Math.ceil(awards.length / cols) * (h + gap) + 8;
}

// ---- entry -----------------------------------------------------------------

export const imageLabels = (t) => ({
  standings: t('management.groupStandings'), playoffs: t('management.playoffs'), awards: t('summary.tournamentAwards'),
  played: t('management.played'), won: t('management.won'), lost: t('management.lost'), legs: t('management.legs'), avg: t('management.avg'), mpr: t('common.mpr'), cricket: t('common.gameTypeCricket'),
  thirdPlace: t('export.thirdPlace'), firstTo: t('management.firstTo'), completed: t('tournaments.statusCompleted'), poweredBy: t('summary.poweredBy')
});

// labels: { standings, playoffs, awards, played, won, lost, legs, avg, mpr, cricket, thirdPlace, firstTo, completed, poweredBy }
// awards (optional): [{ label, value, players: [name] }]
export async function tournamentToPngBlob(tournament, labels, { awards = [] } = {}) {
  if (document.fonts?.load) {
    await Promise.allSettled([document.fonts.load(font(20, 700, DISPLAY)), document.fonts.load(font(14, 400, SANS)), document.fonts.load(font(14, 700, SANS))]);
  }
  const rounds = mergeBracketRounds(tournament.playoffs?.rounds, tournament.playoffMatches, tournament.players);

  // Draw on a tall scratch canvas, then crop to the used height.
  const scratch = document.createElement('canvas');
  scratch.width = W * SCALE;
  scratch.height = 8000 * SCALE;
  const ctx = scratch.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, 8000);

  let y = PAD;
  y = drawHeader(ctx, tournament, labels, y);
  y = drawPodium(ctx, podiumFromRounds(rounds), y);
  y = drawAwards(ctx, awards, labels, y);
  y = drawStandings(ctx, tournament, labels, y);
  y = drawBracket(ctx, rounds, labels, y);
  text(ctx, `${labels.poweredBy} DartLead · dartlead.app`, W / 2, y + 14, { size: 12, color: C.faint, align: 'center' });
  const height = Math.min(y + 40, 8000);

  const out = document.createElement('canvas');
  out.width = W * SCALE;
  out.height = height * SCALE;
  out.getContext('2d').drawImage(scratch, 0, 0, W * SCALE, height * SCALE, 0, 0, W * SCALE, height * SCALE);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

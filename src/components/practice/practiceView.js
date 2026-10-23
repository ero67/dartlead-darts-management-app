import { sessionHighlights } from '../../lib/practiceGames';

// Presentation helpers shared by the practice screens (kept out of
// PracticeShared.jsx so that file only exports components).

// Headline of a finished session: the match result for an X01 or Cricket match, the
// first highlight otherwise. `isWin` tints it green.
export const sessionHeadline = (entry, t) => {
  const s = entry.stats || {};
  if ((entry.game === 'x01' || entry.game === 'cricket') && s.legsFor !== undefined) {
    const scores = { for: s.legsFor, against: s.legsAgainst ?? 0, name: entry.settings?.opponent?.name || '' };
    if (s.won === true) return { text: t('practice.match.youWon', scores), isWin: true };
    if (s.won === false) return { text: t('practice.match.opponentWon', scores), isWin: false };
    return { text: t('practice.match.abandoned', scores), isWin: false };
  }
  const [label, value] = sessionHighlights(entry, t)[0];
  return { text: `${value} ${label}`, isWin: false };
};

// Window of the last `size` positions of a sequence, so a progress strip never
// has to wrap: for a fixed target shorter than `size` that is the whole sequence.
export const stripWindow = (count, target, size = 10) => {
  const total = target === null || target === undefined ? Math.max(size, count + 1) : target;
  const end = Math.min(total, Math.max(size, count + 1));
  return { start: Math.max(0, end - size), end };
};

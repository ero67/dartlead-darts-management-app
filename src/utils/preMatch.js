// Form and head-to-head for the pre-match card, from both players' recent
// histories (usePlayerHistories). Head-to-head counts only meetings within
// that window (the last 60 matches of each), which is what "recent" means.
export const preMatchFacts = (idA, idB, histories) => {
  const a = histories[idA] || [];
  const b = histories[idB] || [];
  const meetings = a.filter((m) => m.opponentId === idB);
  return {
    form: [a.slice(0, 5).map((m) => m.won), b.slice(0, 5).map((m) => m.won)],
    headToHead: [meetings.filter((m) => m.won).length, meetings.filter((m) => !m.won).length]
  };
};

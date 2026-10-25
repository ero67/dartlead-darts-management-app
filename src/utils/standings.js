// Group standings order, shared by the service, the context and the
// management screen so every view ranks the same way.
//
// Criteria are applied as a cascade: players tied on everything so far are
// split by the next criterion. Head-to-head ranks a tied set by a mini-table of
// only the matches among those players (wins, then leg difference), so a
// circular tie (A beat B, B beat C, C beat A) is settled by a rule instead of
// by input order. Players still tied after the last criterion keep input order.
export const DEFAULT_STANDINGS_CRITERIA = ['matchesWon', 'legDifference', 'average', 'headToHead'];

const CRITERION_VALUE = {
  matchesWon: (row) => [row.matchesWon || 0],
  legDifference: (row) => [(row.legsWon || 0) - (row.legsLost || 0)],
  average: (row) => [row.average || 0]
};

const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

const headToHeadKeys = (rows, matches) => {
  const table = new Map(rows.map((row) => [row.player?.id, [0, 0]]));
  (matches || []).forEach((m) => {
    const p1 = table.get(m.player1?.id);
    const p2 = table.get(m.player2?.id);
    if (m.status !== 'completed' || !m.result || !p1 || !p2 || p1 === p2) return;
    const legDiff = (m.result.player1Legs || 0) - (m.result.player2Legs || 0);
    p1[1] += legDiff;
    p2[1] -= legDiff;
    if (m.result.winner === m.player1.id) p1[0]++;
    else if (m.result.winner === m.player2.id) p2[0]++;
  });
  return (row) => table.get(row.player?.id) || [0, 0];
};

const rankTied = (rows, criteria, matches) => {
  if (rows.length < 2 || criteria.length === 0) return rows;
  const [criterion, ...rest] = criteria;
  const keyOf = criterion === 'headToHead' ? headToHeadKeys(rows, matches) : CRITERION_VALUE[criterion];
  if (!keyOf) return rankTied(rows, rest, matches);

  const keyed = rows.map((row) => ({ row, key: keyOf(row) }));
  keyed.sort((a, b) => compareKeys(b.key, a.key));
  const ranked = [];
  for (let i = 0; i < keyed.length;) {
    let j = i + 1;
    while (j < keyed.length && compareKeys(keyed[i].key, keyed[j].key) === 0) j++;
    ranked.push(...rankTied(keyed.slice(i, j).map((k) => k.row), rest, matches));
    i = j;
  }
  return ranked;
};

// rows: standings rows ({ player, matchesWon, legsWon, legsLost, average }).
// matches: the group's matches (or several groups'); only those between
// tied players count. Returns a new array.
export const sortStandings = (rows, criteriaOrder, matches) =>
  rankTied([...(rows || [])], criteriaOrder || DEFAULT_STANDINGS_CRITERIA, matches);

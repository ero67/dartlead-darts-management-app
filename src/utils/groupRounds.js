// Group-stage rounds. A group plays round robin in rounds where everyone plays
// at most once, so nobody waits for their first match while others play their
// third. Checked by scripts/check-group-rounds.mjs.

const touches = (pair, other) => !!other && (pair.includes(other[0]) || pair.includes(other[1]));

// Circle method (Berger tables): the first player stays, the rest rotate one
// seat per round. n players -> n-1 rounds (n rounds with a bye when n is odd).
// Returns rounds as arrays of [player1, player2]. Each round starts with a pair
// that is not in the last pair of the round before, so on one board nobody
// plays two matches back to back.
export const roundRobinRounds = (players) => {
  const seats = players.length % 2 ? [...players, null] : [...players];
  const rounds = [];
  for (let r = 0; r < seats.length - 1; r++) {
    const round = [];
    for (let i = 0; i < seats.length / 2; i++) {
      const a = seats[i];
      const b = seats[seats.length - 1 - i];
      if (a && b) round.push([a, b]);
    }
    const last = rounds.at(-1)?.at(-1);
    const first = round.findIndex((pair) => !touches(pair, last));
    if (first > 0) round.unshift(...round.splice(first, 1));
    rounds.push(round);
    seats.splice(1, 0, seats.pop());
  }
  return rounds;
};

// Round number of each match, read back from a group's matches in play order:
// consecutive blocks of floor(n/2) matches. Groups generated before rounds
// existed are in another order; when a block has someone twice the order is not
// in rounds and this returns null (the list shows without round headings).
export const roundByMatch = (matches) => {
  const ids = (m) => [m.player1?.id, m.player2?.id];
  const playerCount = new Set((matches || []).flatMap(ids)).size;
  const perRound = Math.floor(playerCount / 2);
  if (perRound < 2) return null; // 2-3 players: every match is its own round
  const rounds = new Map();
  for (let start = 0; start < matches.length; start += perRound) {
    const block = matches.slice(start, start + perRound);
    if (new Set(block.flatMap(ids)).size !== block.length * 2) return null;
    block.forEach((m) => rounds.set(m.id, start / perRound + 1));
  }
  return rounds;
};

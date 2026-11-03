import { boardQueues, pendingInPlayOrder } from './boardSchedule.js';

// What a tablet standing at `boardNumber` plays next: the first waiting
// match queued for that board and the rest of its queue. The device board
// is a string from localStorage; queue keys are numbers. `liveIds` are
// matches already running somewhere, which never count as waiting.
export function nextForBoard(tournament, boardNumber, liveIds) {
  const [next = null, ...then] = boardQueues(tournament, liveIds).get(Number(boardNumber)) || [];
  return { next, then };
}

// This device's own unfinished match (the scorer backed out of the scorer
// view): the first match not completed that `isLiveHere(id)` knows locally.
// The row may still read pending (the page's copy raced the start), and a
// first-round playoff match has no row at all until it starts, so bracket
// entries count too. Returns null when nothing is live here.
export function ownLiveMatch(tournament, isLiveHere) {
  const candidates = [
    ...(tournament?.groups || []).flatMap((g) => (g.matches || []).map((m) => ({ ...m, groupName: g.name }))),
    ...(tournament?.playoffMatches || []),
    ...pendingInPlayOrder(tournament).filter((m) => m.roundSize != null)
  ];
  return candidates.find((m) => m.status !== 'completed' && isLiveHere(m.id)) || null;
}

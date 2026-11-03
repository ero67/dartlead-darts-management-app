import { boardQueues } from './boardSchedule.js';

// What a tablet standing at `boardNumber` plays next: the first waiting
// match queued for that board and the rest of its queue. The device board
// is a string from localStorage; queue keys are numbers. `liveIds` are
// matches already running somewhere, which never count as waiting.
export function nextForBoard(tournament, boardNumber, liveIds) {
  const [next = null, ...then] = boardQueues(tournament, liveIds).get(Number(boardNumber)) || [];
  return { next, then };
}

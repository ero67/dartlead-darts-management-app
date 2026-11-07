# Board dispatch: central PC sends matches to board tablets

Date: 2026-11-03. Status: reviewed, awaiting approval.

## Intent

Some leagues run the night from one PC: the manager decides which match goes
on which board next, and a fixed tablet at each board should simply show
"this is your next match, press Start". Other leagues let the scorer at the
board pick any waiting match from the list. Both ways must keep working, on
the same night, with no mode switch.

A second, related gap: some leagues split groups over boards (group A plays
on boards 1–2, group B on 3–4). Auto-assign today spreads every group over
every board, so managers at such leagues cannot use it.

## What exists today (build on it, do not replace)

- `tournaments.board_count` and `matches.assigned_board` (nullable, migration
  `20261027130000_board_scheduling.sql`), written through the
  `set_match_boards` RPC which only touches pending matches.
- `src/utils/boardSchedule.js`: `planBoards` / `pendingInPlayOrder` /
  `autoAssignBoards` / `boardQueues`. The per-board queue order is derived,
  never stored.
- Manager UI: `BoardsControl` (board count, Auto-assign, Clear) above the
  match lists, and the per-card `MatchBoard` dropdown ("No board / Board N")
  for managers. Non-managers see a board chip only when a board is assigned.
- Device identity: `LiveMatchContext` keeps `deviceName` and `boardNumber` in
  localStorage, editable in `DeviceSettings` (sidebar). `StartMatchDialog`
  already warns when the device board differs from the match board.
- `TvDisplay` shows per-board "now playing / next" from `boardQueues`.
- `TournamentManagement` holds a realtime channel on `matches` filtered by
  tournament; it currently reacts only to `in_progress` and `completed` rows.

## Goals

1. A tablet set to board N shows a **board waiting screen** for the open
   tournament: the next match queued for board N with a Start button, the
   rest of that board's queue, and a way to pick any match manually.
2. The waiting screen follows manager changes live (assign, reassign, clear,
   another tablet starting the match).
3. Managers can restrict a group to a set of boards; auto-assign respects it.
4. Nothing changes for tablets without a board number, tournaments without a
   board count, or installed APKs that predate this (nullable columns only).

## Non-goals

- A dedicated "boards console" for the PC. The existing per-card dropdown,
  Auto-assign, and the TV page as overview are version one. Revisit if
  managers find the dropdown clumsy.
- Device registry / heartbeat / "is tablet 3 online". Board number is the
  tablet's identity; nothing else is tracked.
- Pushing a match onto a tablet that already has a live match. A live tablet
  is on the scoring screen; the queue only matters when it comes back.
- Locking a tablet to its board. The scorer may always pick any match.
- Per-group boards in the playoff stage. Playoff matches stay free to go on
  any board.
- Any new setting or mode toggle. Both workflows coexist by construction.

## Anti-goals

- A scorer stranded on the waiting screen with no way out. "Pick a match"
  must always be one tap away.
- A tablet starting a match that another tablet already started. Start goes
  through the same path as today, which already handles that.
- Breaking the "no board assigned" league: no chips, no queue, no screen
  content beyond "nothing queued" when nobody assigned anything.

## Design

### 1. Board waiting screen (tablet side)

Where: inside `TournamentManagement`, shown instead of the tabs when all of
these hold: the device has a `boardNumber`, the tournament has a
`boardCount`, the tournament is in a stage with playable matches
(group stage or playoffs, not completed), and the scorer has not dismissed
it for this tournament in this session.

Content:
- Header: "Board N" plus the tournament name.
- Next match for this board = first entry of `boardQueues(tournament,
  liveIds).get(boardNumber)`, where `liveIds` are matches currently
  `in_progress` (same exclusion the TV uses). Rendered like the body of
  `StartMatchDialog` (player names, group / round badge, Cricket badge) with
  one big Start button that calls the existing `handleStartMatchRequest`, so
  the confirm dialog and scorer checks are unchanged.
- Below: the remaining queue for this board ("Then: X vs Y").
- If nothing is queued: "Nothing queued for board N" and the same buttons.
- Buttons: "Pick a match" (dismisses the screen for this tournament in this
  session via `sessionStorage`, shows the normal tabs) and nothing else. A
  "Board N" button in the tabs header brings the waiting screen back.
- Non-scorers (viewers) never see the screen; they get the tabs as today.
- If this device has its own unfinished match (`isLiveHere`, the one the
  Live tab offers to continue), the waiting screen shows that match with a
  Continue button above the queue instead of a Start button. A scorer must
  never have to dig through tabs to get back to a match mid-leg.

Start needs the same match object the cards build (`buildMatchData` in
`MatchesTab` and `PlayoffsTab`: tournament id, group id, game type, legs to
win via `getPlayoffLegsToWin` for playoffs, starting score, scoring mode,
playoff flag, group name). Lift that into one shared helper and call it from
the cards and the waiting screen. Queue entries carry `label`, not
`groupName`, and bracket entries carry no legs-to-win, so the helper must
resolve those. `boardNumber` from localStorage is a string; compare with
`Number()` as `StartMatchDialog` does.

After a match: `MatchCompleteCard`'s back button already navigates to the
tournament page. On arrival the dismissal flag is cleared so the waiting
screen shows again. Builder's call: clear it in `onMatchStart` or on the
back navigation, whichever is simpler.

### 2. Live updates for pending matches

The realtime handlers in `TournamentManagement` currently return early for
rows that are neither `in_progress` nor `completed`. Three extensions:

- UPDATE handler: when a `pending` row's `assigned_board` differs between
  `payload.old` and `payload.new`, call the existing tournament reload
  (`getTournament`). `matches` has `REPLICA IDENTITY FULL` and is in the
  realtime publication, so `payload.old.assigned_board` is available.
- INSERT handler: first-round playoff assignments arrive as INSERTs with
  `assigned_board` set (the RPC creates those rows). Reload on a pending
  INSERT that carries a board.
- Subscribe to `tournaments` UPDATE for this id (as `TvDisplay` does) and
  reload, so a tablet already on the page sees the board count appear.

The TV page gets the same benefit if it shares that path; not required.

### 3. Per-group boards

Storage: new nullable column `groups.boards smallint[]`. NULL or empty means
"any board". Written by a new optional argument on `set_match_boards`
(`p_group_boards jsonb DEFAULT NULL`, `{ groupId: [1,2], ... }`) so the
permission check and the single-RPC pattern stay as they are. The migration
must `DROP FUNCTION public.set_match_boards(uuid, integer, jsonb)` before
creating the 4-argument version, otherwise PostgREST sees two overloads and
rejects the call; the defaulted argument keeps the old 3-argument callers
(installed APKs) working. Validation: integers 1..`p_board_count`, groups
must belong to the tournament; otherwise raise. When the board count is
lowered, the RPC prunes boards above the new count from every group of the
tournament, so stored sets never exceed the count. Read through the existing
`getTournament` groups mapping as `boards`.

UI: `BoardsControl` gains one line per group (only in the group stage, only
when the board count is set): group name and a toggle per board 1..count.
Saving writes the group boards and nothing else.

Scheduling: `pendingInPlayOrder` already labels each group match; it also
carries the group's `boards`. `planBoards` takes an optional allowed-board
set per match: a match may go on `m.board` if fixed, else on any board in its
allowed set, else any board. Within a slot each board first takes the first
remaining match restricted to it, and only when none is left takes the
first free match, so a free group never crowds a restricted group off its
own boards while it still has boards of its own (two-pass fill per board).
Defensive guard: an allowed set with no board in 1..boardCount is treated as
"any board", so the planning loop can always place every match.
`autoAssignBoards` passes the group's boards as the allowed set.
`boardQueues` is unchanged (it plans from fixed boards). The per-card
dropdown stays unrestricted so a manager can override.

Chip visibility: unchanged. The chip shows only when a match has an assigned
board, which only happens when a manager assigned or auto-assigned. Nothing
is shown for a league that never assigns boards.

### 4. Strings

New keys under `boards` in both `en.json` and `sk.json`. Slovak uses the
formal address as elsewhere.

## Constraints

- Nullable columns and an optional RPC argument only; the last tagged APK
  must keep working against the live database.
- Migration goes to staging and prod before the frontend is pushed (repo is
  public).
- Keep `boardSchedule.js` pure; add a small unit-style check for the
  allowed-set behaviour in `planBoards` (no player double-booked, group kept
  on its boards, free groups fill the rest).
- Reuse `StartMatchDialog` content, `DeviceBadge`, `Card`, `Button`; no new
  primitives.

## Left to the builder

- Exact layout of the waiting screen within the existing Card / Button
  system. Big tap targets; it runs on a tablet in a pub.
- Whether the "Board N" re-entry control lives in the tabs row or in the
  page header.
- How to detect "arrived back from a match" for clearing the dismissal flag.

# Board Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tablet set to board N shows the next match the manager queued for that board and starts it with one tap; managers can confine a group to a set of boards and auto-assign respects it.

**Architecture:** Everything hangs off the existing `matches.assigned_board` / `tournaments.board_count` model and the device's `boardNumber` in `LiveMatchContext`. One nullable column (`groups.boards`) and one optional RPC argument extend storage; the pure planner in `boardSchedule.js` learns allowed-board sets; a new `BoardWaitingScreen` replaces the tabs on board tablets and starts matches through the same confirm dialog as the cards; the tournament page's realtime channel starts reacting to pending-row changes.

**Tech Stack:** React 19, Supabase (PostgreSQL RPC + realtime), Tailwind v4 + shadcn/ui, plain `node:assert` check scripts.

**Spec:** `docs/superpowers/specs/2026-11-03-board-dispatch-design.md`

## Global Constraints

- Work on a new branch `feat/board-dispatch` cut from `main`; the current checkout (`feat/celebrations-polish`) has unrelated uncommitted changes, so use a worktree.
- Nullable columns and a defaulted RPC argument only; the last tagged APK must keep working.
- The migration must `DROP FUNCTION public.set_match_boards(uuid, integer, jsonb)` before creating the 4-argument version.
- Migration goes to staging and prod before the frontend is pushed (public repo).
- Every user-facing string goes through `t()`; add keys to `src/locales/en.json` and `src/locales/sk.json` together under `boards`; Slovak uses the formal address.
- Named exports only; import order React → external → contexts → components → services → CSS.
- Reuse `Card`, `Button`, `Badge`, `DeviceBadge`; no new primitives.
- `boardSchedule.js` stays pure; its check script is `scripts/check-board-schedule.mjs`.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Device board set as the string `"2"` from localStorage; the waiting screen must find queue key `2`. Pinned in Task 5 (`Number(boardNumber)` test of `nextForBoard`).
2. Group boards `[3,4]` and the manager lowers the count to 2; the save must succeed and the group must end up as "any board". Pinned in Task 1 (SQL check) and Task 2 (planner guard check).
3. Only group A restricted to boards 1–2, group B free, 4 boards: A must not wait behind B on boards 1–2. Pinned in Task 2.
4. A viewer with no scoring rights on a tablet with a board number must see the tabs, never the waiting screen. Pinned in Task 5 (gating condition includes `canScore === true`).
5. Another tablet starts the match shown as "next"; this tablet must drop it from the queue without a reload. Pinned in Task 6 (in-progress UPDATE already reloads live matches; the queue excludes live ids).

---

### Task 1: Migration and service for per-group boards

**Files:**
- Create: `supabase/migrations/20261103120000_group_boards.sql`
- Modify: `src/services/tournamentService.js:500-520` (select), `:671-675` (group mapping), `:1480-1487` (`setMatchBoards`)

**Interfaces:**
- Produces: `groups.boards smallint[]` (NULL = any board); RPC `set_match_boards(p_tournament_id uuid, p_board_count integer, p_assignments jsonb DEFAULT '{}', p_group_boards jsonb DEFAULT NULL)`; `tournamentService.setMatchBoards(tournamentId, boardCount, assignments = {}, groupBoards = null)`; each group from `getTournament` carries `boards: number[] | null`.

- [ ] **Step 1: Write the migration**

`ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS boards smallint[];` then `DROP FUNCTION IF EXISTS public.set_match_boards(uuid, integer, jsonb);` then recreate the function body from `20261027130000_board_scheduling.sql` with the fourth argument and these additions, in order, after the tournament update:

- If `p_group_boards` is not null: for each `(key, value)` in `jsonb_each`, require `jsonb_typeof(value) = 'array'`, cast elements to `smallint[]`, raise `22023` if any element `< 1` or `> COALESCE(p_board_count, 99)`; `UPDATE public.groups SET boards = NULLIF(array, '{}') WHERE id = key::uuid AND tournament_id = p_tournament_id`.
- Always, when `p_board_count` is not null: `UPDATE public.groups SET boards = NULLIF((SELECT array_agg(b) FROM unnest(boards) b WHERE b <= p_board_count), '{}') WHERE tournament_id = p_tournament_id AND boards IS NOT NULL;` (prune boards above the count; a group left empty becomes any board).

Finish with the same REVOKE/GRANT lines for the new signature `(uuid, integer, jsonb, jsonb)`.

- [ ] **Step 2: Apply to staging and check**

Run the migration against staging (credentials in `.env.staging.local`, see memory `staging-instance`), then in the SQL editor:

```sql
select set_match_boards('<tournament id>', 4, '{}', '{"<group id>": [3,4]}');
select boards from groups where id = '<group id>';          -- {3,4}
select set_match_boards('<tournament id>', 2, '{}');
select boards from groups where id = '<group id>';          -- NULL
select set_match_boards('<tournament id>', 2, '{}', '{"<group id>": [5]}'); -- ERROR 22023
```

Expected: the three comments hold. Old 3-argument call via PostgREST (`supabase.rpc('set_match_boards', { p_tournament_id, p_board_count, p_assignments })`) still works: run `tournamentService.setMatchBoards` from the app console once.

- [ ] **Step 3: Service changes**

In `getTournament` the `groups(*, ...)` select already returns `boards`; map it in the group object as `boards: group.boards ?? null`. Extend `setMatchBoards(tournamentId, boardCount, assignments = {}, groupBoards = null)` to pass `p_group_boards: groupBoards`.

- [ ] **Step 4: Lint, commit**

Run: `npm run lint` → no errors.

```bash
git add supabase/migrations/20261103120000_group_boards.sql src/services/tournamentService.js
git commit -m "Store which boards a group plays on"
```

---

### Task 2: Planner respects group boards

**Files:**
- Modify: `src/utils/boardSchedule.js`, `src/utils/bracketView.js:80-88`
- Test: `scripts/check-board-schedule.mjs`

**Interfaces:**
- Consumes: group `boards` from Task 1.
- Produces: `planBoards(matches, boardCount)` where each match is `{ id, p1, p2, board, allowed? }` (`allowed`: array of board numbers or null); `pendingInPlayOrder(tournament)` entries carry `boards` (group matches) and `roundSize` (playoff matches, from `upcomingPlayoffMatches`); `autoAssignBoards` unchanged signature.

- [ ] **Step 1: Write the failing checks** (append to `scripts/check-board-schedule.mjs` before the final `console.log`)

```js
// Group boards: A on 1-2, B free, 4 boards. A keeps its boards in slot 0;
// B takes the rest and never crowds A off 1-2 while A has matches left.
const split = { boardCount: 4, groups: [group('A', ['a1', 'a2', 'a3', 'a4']), group('B', ['b1', 'b2', 'b3', 'b4'])] };
split.groups[0].boards = [1, 2];
const sa = autoAssignBoards(split, 4);
assert.ok(Object.entries(sa).filter(([id]) => id.startsWith('A')).every(([, b]) => b === 1 || b === 2), 'A only on 1-2');
assert.deepEqual(new Set(Object.entries(sa).filter(([id]) => id.startsWith('B')).map(([, b]) => b)), new Set([3, 4]), 'B fills 3-4 first');
checkPlan(pendingInPlayOrder(split).map((m) => ({ id: m.id, p1: m.player1.id, p2: m.player2.id, board: null, allowed: m.boards })), planBoards(pendingInPlayOrder(split).map((m) => ({ id: m.id, p1: m.player1.id, p2: m.player2.id, board: null, allowed: m.boards })), 4), 'group boards');
// Allowed set with no board inside the count counts as any board (no hang).
const stale = planBoards([{ id: 's', p1: 'A', p2: 'B', board: null, allowed: [9] }], 2);
assert.deepEqual(stale.get('s'), { board: 1, slot: 0 });
// Playoff entries carry roundSize for legs-to-win.
assert.equal(pendingInPlayOrder(bracket).find((m) => m.id === 's1').roundSize, 4);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/check-board-schedule.mjs`
Expected: assertion failure at "A only on 1-2" (or "B fills 3-4 first").

- [ ] **Step 3: Implement**

`planBoards`: compute `usable = allowed?.filter(b => b >= 1 && b <= boards)`; `mayPlay(m, board) = m.board != null ? m.board === board : !usable(m)?.length || usable(m).includes(board)`. Per board per slot, two passes over `remaining` in order: first a match with a non-empty usable set that includes this board, then any match that may play here. Keep the busy-player rule in both passes. `pendingInPlayOrder`: group entries get `boards: g.boards ?? null`. `upcomingPlayoffMatches` adds `roundSize: Math.max(2, round.matches.filter(m => !m.isThirdPlaceMatch).length * 2)` (same formula as `getRoundSize` in `TournamentManagement`). `autoAssignBoards`: `toSlotInput` passes `allowed: m.boards ?? null`.

- [ ] **Step 4: Run to verify it passes**

Run: `node scripts/check-board-schedule.mjs`
Expected: `board schedule ok`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/boardSchedule.js src/utils/bracketView.js scripts/check-board-schedule.mjs
git commit -m "Keep a group's matches on the boards it was given"
```

---

### Task 3: Group boards in the Boards card

**Files:**
- Modify: `src/components/tournament/BoardsControl.jsx`, `src/locales/en.json`, `src/locales/sk.json`

**Interfaces:**
- Consumes: `tournament.groups[].boards`, `tournamentService.setMatchBoards(id, count, {}, groupBoards)` from Task 1.

- [ ] **Step 1: Strings**

Add under `boards`: `groupBoards` ("Boards per group" / "Terče pre skupiny"), `anyBoard` ("Any board" / "Ľubovoľný terč"), `groupBoardsSaved` ("Group boards saved" / "Terče skupín uložené").

- [ ] **Step 2: Implement**

Below the existing row, only when `isValid && tournament.groups?.length > 0 && pendingInPlayOrder(tournament).some((m) => m.groupId)` (there are still waiting group matches; playoff-only stages show nothing), render one line per `tournament.groups`: the group name, then a toggle `Button` (variant `outline`, `size="sm"`, `aria-pressed`) per board `1..boards`; none pressed = "Any board" caption. Local state `groupBoards: { [groupId]: number[] }` initialised from `tournament.groups`. A "Save" button calls `save(assignments = {}, t('boards.groupBoardsSaved'))` with `groupBoards` as the fourth argument; extend the local `save` helper with that argument.

- [ ] **Step 3: Verify in the dev server**

Run `npm run dev`, open a group-stage tournament as manager on the Matches tab. Expected: toggles appear once the count is set; Save persists after reload; Auto-assign keeps group A's matches on its boards (chips on cards).

- [ ] **Step 4: Lint, commit**

```bash
git add src/components/tournament/BoardsControl.jsx src/locales/en.json src/locales/sk.json
git commit -m "Let a manager pick the boards each group plays on"
```

---

### Task 4: Shared match-start data builder

**Files:**
- Create: `src/utils/matchStart.js`
- Modify: `src/components/tournament/MatchesTab.jsx:165-183`, `src/components/tournament/PlayoffsTab.jsx:246-260`

**Interfaces:**
- Produces: `buildMatchData(match, tournament, legsToWin)` → `{ ...match, tournamentId, groupId: match.groupId, gameType: match.gameType || tournament.gameType, legsToWin, startingScore: match.startingScore || tournament.startingScore, defaultScoringMode: tournament.defaultScoringMode, isPlayoff: !!match.isPlayoff }`.

- [ ] **Step 1: Implement the helper** with the shape above (pure, no imports).

- [ ] **Step 2: Use it in both cards**

`MatchesTab` non-admin branch → `buildMatchData(match, tournament, match.legsToWin || tournament.legsToWin)`. `PlayoffsTab` non-admin branch → `buildMatchData({ ...match, isPlayoff: true }, tournament, getPlayoffLegsToWin(getRoundSize(round)))`. Admin branches keep spreading `adminOverride: true` on top of the same call.

- [ ] **Step 3: Verify**

`npm run lint`; in the dev server start one group match and one playoff match from the cards; both open the scorer with the right legs-to-win.

- [ ] **Step 4: Commit**

```bash
git add src/utils/matchStart.js src/components/tournament/MatchesTab.jsx src/components/tournament/PlayoffsTab.jsx
git commit -m "Build match start data in one place"
```

---

### Task 5: Board waiting screen

**Files:**
- Create: `src/components/tournament/BoardWaitingScreen.jsx`, `src/utils/boardWaiting.js`
- Modify: `src/components/TournamentManagement.jsx` (gating around the `<Tabs>` block at ~2197; re-entry button in the tabs row), `src/locales/en.json`, `src/locales/sk.json`
- Test: `scripts/check-board-schedule.mjs` (one assertion for `nextForBoard`)

**Interfaces:**
- Consumes: `boardQueues`, `pendingInPlayOrder` (Task 2), `buildMatchData` (Task 4), `handleStartMatchRequest`, `onMatchStart`, `isMatchInLocalStorage`, `getPlayoffLegsToWin`, `canScore`, `boardNumber` from `useLiveMatch`.
- Produces: `nextForBoard(tournament, boardNumber, liveIds)` in `boardWaiting.js` → `{ next, then }` where `then` is the rest of that board's queue; `BoardWaitingScreen({ tournament, boardNumber, next, then, ownLive, onStart, onContinue, onPickMatch, t })`.

- [ ] **Step 1: Write the failing check** (append to the check script; import `nextForBoard` from `../src/utils/boardWaiting.js`)

```js
const q = nextForBoard(night, '2', new Set());
assert.equal(q.next.assignedBoard, 2, 'string board number resolves the numeric queue');
assert.ok(q.then.every((m) => m.assignedBoard === 2));
assert.deepEqual(nextForBoard(night, '9', new Set()), { next: null, then: [] });
```

- [ ] **Step 2: Run to verify it fails** — `node scripts/check-board-schedule.mjs`, expected: import error.

- [ ] **Step 3: Implement `nextForBoard`**

`const [next = null, ...then] = boardQueues(tournament, liveIds).get(Number(boardNumber)) || []; return { next, then };`

- [ ] **Step 4: Strings**

Under `boards`: `screenTitle` ("Board {{board}}" / "Terč {{board}}"), `nextUp` ("Next match on this board" / "Ďalší zápas na tomto terči"), `nothingQueued` ("Nothing queued for board {{board}}" / "Na terč {{board}} nie je naplánovaný žiadny zápas"), `pickMatch` ("Pick a match" / "Vybrať zápas"), `continueOwn` ("Continue your match" / "Pokračovať v zápase"), `backToBoard` ("Board {{board}}" / "Terč {{board}}"), `waitingForManager` ("The manager will send the next match here." / "Organizátor sem pošle ďalší zápas.").

- [ ] **Step 5: Implement `BoardWaitingScreen`**

A `Card` with: title `t('boards.screenTitle', { board })` and the tournament name; if `ownLive`, that match's players and a full-width `size="lg"` Continue button (`onContinue`); else if `next`, the same body as `StartMatchDialog` (names, `Badge` with `next.label`, Cricket badge) and a full-width `size="lg"` Start button (`onStart(next)`); else the `nothingQueued` line and `waitingForManager`. Then the `then` list as "Then: X vs Y" rows (reuse `t('boards.then')`), and an `outline` "Pick a match" button (`onPickMatch`). Tap targets at least 48px.

- [ ] **Step 6: Gate it in `TournamentManagement`**

Local state `isBoardDismissed` initialised from `sessionStorage.getItem(\`board-screen-dismissed-${tournament.id}\`) === '1'`. Show the screen instead of the `<Tabs>` + tab content when: `boardNumber && tournament.boardCount && canScore === true && user && isTournamentRunning(tournament.status) && !isBoardDismissed`. `liveIds` = ids of `liveMatches`. `ownLive` = the first pending-or-live match in `pendingInPlayOrder(tournament)` or `liveMatches` for which `isMatchInLocalStorage(id)`. `onStart(next)` → playoff entries are the ones with `next.roundSize != null`; `handleStartMatchRequest(buildMatchData(isPlayoff ? { ...next, isPlayoff: true } : next, tournament, isPlayoff ? getPlayoffLegsToWin(next.roundSize) : next.legsToWin || tournament.legsToWin))`. `onContinue` → `onMatchStart(buildMatchData(ownLive, ...))` (same as the card's Continue). `onPickMatch` sets the session flag and state. In `confirmStartMatch`, remove the session flag so the tablet returns to the screen after the match. Add a `TabsTrigger`-styled `Button` (`variant="ghost"`) at the end of the tabs row, visible only when the gating holds except for the dismissal, labelled `t('boards.backToBoard', { board })`, which clears the flag.

- [ ] **Step 7: Verify**

`node scripts/check-board-schedule.mjs` → `board schedule ok`. `npm run lint`. Dev server, two browser profiles: manager assigns a match to board 1 on the Matches tab; a second profile with device board 1 (set in the sidebar's device settings) opens the tournament and sees the match; Start opens the confirm dialog, scorer loads; after finishing, back lands on the waiting screen with the next match. Same device without a board number: tabs as before. A viewer account with board 1: tabs.

- [ ] **Step 8: Commit**

```bash
git add src/components/tournament/BoardWaitingScreen.jsx src/utils/boardWaiting.js src/components/TournamentManagement.jsx src/locales/en.json src/locales/sk.json scripts/check-board-schedule.mjs
git commit -m "Show board tablets the match the manager queued for them"
```

---

### Task 6: Live updates for pending matches

**Files:**
- Modify: `src/components/TournamentManagement.jsx:1963-2063` (realtime channel)

**Interfaces:**
- Consumes: existing `getTournament(tournament.id)` reload.

- [ ] **Step 1: Implement**

In the UPDATE handler, before the `in_progress` early return: `if (match?.status === 'pending') { if (payload.old?.assigned_board !== match.assigned_board) getTournament(tournament.id); return; }`. In the INSERT handler: `if (match?.status === 'pending' && match.assigned_board != null) { getTournament(tournament.id); return; }`. Add `.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: \`id=eq.${tournament.id}\` }, () => getTournament(tournament.id))` to the same channel (mirrors `TvDisplay.jsx:138`).

- [ ] **Step 2: Verify**

Dev server, two profiles as in Task 5: with the tablet profile sitting on the waiting screen, the manager (a) assigns a match to board 1, (b) moves it to board 2, (c) sets the board count on a tournament that had none, (d) starts the queued match from a third profile. Expected: (a) appears, (b) disappears, (c) the screen appears, (d) the next match replaces it, all without reload.

- [ ] **Step 3: Commit**

```bash
git add src/components/TournamentManagement.jsx
git commit -m "Follow board assignments live on the tournament page"
```

---

### Task 7: Ship

- [ ] **Step 1:** `npm run build` and `npm run lint` clean; `node scripts/check-board-schedule.mjs` prints `board schedule ok`.
- [ ] **Step 2:** Apply the migration to prod (Supabase CLI is linked to prod, see memory `supabase-cli-setup`), confirm with `select proargnames from pg_proc where proname = 'set_match_boards';` showing four arguments.
- [ ] **Step 3:** Open the PR against `main` from this branch; body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

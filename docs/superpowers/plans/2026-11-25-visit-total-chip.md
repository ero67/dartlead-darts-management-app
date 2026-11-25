# Visit Total Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the sum of the last visit's darts (or `BUST`) as a chip after the dart chips, on the match scoreboard and in practice X01.

**Architecture:** One pure helper computes a visit's total from its dart entries; one small presentational chip renders it. The match screen and practice X01 each pass their visit's darts and bust flag through to it. No data or storage changes.

**Tech Stack:** React 19, Tailwind v4, shadcn `Badge`, node self-check scripts (`scripts/check-*.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-25-visit-total-chip-design.md`

## Global Constraints

- Turn-total visits (a single entry with `isTurnTotal: true`) get no total chip.
- Bust shows the word Bust, never the raw sum. Reuse the existing key `match.checkout.bust` (already in `en.json` and `sk.json`), so no new strings.
- The chip sits on the same row as the dart chips: no extra height.
- On the active (green) and busting (red) scoreboard cards, chips use `text-inherit` with a translucent dark background, like `CheckoutRoute`'s `chipClassName` in `Scoreboard.jsx`.
- Named exports only; commit only when Erik asks, with `git -c user.name="Erik Laki" -c user.email="lakierik4@gmail.com" commit -F <file>`; never push.
- Branch: start `feat/visit-total` from `main` (the current branch `ci/play-upload` is unrelated work).

## Review Focus

- Undo of the last dart in a visit: the running total must drop with it (it's derived from `currentTurn.scores`, so check it visually).
- The bust animation window on the match screen: the busting player's in-progress darts must already show Bust, not the sum.
- A visit of three misses: the total is `0` (a real result), not hidden.
- A checkout visit: the total equals the score checked out (for example `D20` after `T20` `T20` shows `160`).
- Opponent's card on a new leg: the last visit comes from `turnHistory` and may be from the previous leg. That's today's behaviour for the dart chips too, so leave it alone.

---

### Task 1: Visit helpers with a self-check

**Files:**
- Modify: `src/utils/dartStats.js` (add `visitTotal`)
- Modify: `src/lib/x01Engine.js:259-267` (add `lastVisit`, rewrite `lastVisitLabels` on top of it)
- Create: `scripts/check-visit-total.mjs`

**Interfaces:**
- Produces: `visitTotal(darts: Array<{ value, isTurnTotal? }>) -> number | null`. It returns `null` for an empty or missing array, or a single `isTurnTotal` entry. Otherwise it returns the sum of `value`.
- Produces: `lastVisit(state) -> { darts: Array, isBust: boolean }`. The visit in progress comes first (`isBust: false`, since the engine settles busts immediately), then the last of `state.current.visits` (`dartsList`, `isBust`). With neither it returns `{ darts: [], isBust: false }`.
- `lastVisitLabels(state)` keeps its signature and result.

- [ ] **Step 1: Write `scripts/check-visit-total.mjs`** in the style of `scripts/check-live-snapshot.mjs` (`node:assert/strict`), asserting:

```js
assert.equal(visitTotal([]), null);
assert.equal(visitTotal(undefined), null);
assert.equal(visitTotal([{ value: 60, isTurnTotal: true }]), null);
assert.equal(visitTotal([{ value: 60 }, { value: 20 }, { value: 5 }]), 85);
assert.equal(visitTotal([{ value: 0 }, { value: 0 }, { value: 0 }]), 0);
assert.equal(visitTotal([{ value: 60 }, { value: 20 }]), 80);
// lastVisit on a real engine state: createSoloX01 + applyDart(dartFromInput(...))
//  - after T20, 20 in progress -> darts.length 2, isBust false
//  - after a completed visit -> that visit's dartsList
//  - after a bust (e.g. start 50, T20) -> isBust true
```

Build the engine states with the real `createSoloX01`, `applyDart` and `dartFromInput` exports. Read their signatures in `x01Engine.js` first.

- [ ] **Step 2: Run it.** `node scripts/check-visit-total.mjs` should fail because `visitTotal` and `lastVisit` aren't exported yet.
- [ ] **Step 3: Implement both helpers** as specified in Interfaces.
- [ ] **Step 4: Run the check again.** `node scripts/check-visit-total.mjs` should exit 0. Also run `node scripts/check-live-snapshot.mjs` and expect it to still pass.

### Task 2: The chip and practice X01

**Files:**
- Modify: `src/components/shared/DartsAccents.jsx` (add `VisitTotal`)
- Modify: `src/components/practice/PracticeShared.jsx:389-397` (`PracticeLastThrows`)
- Modify: `src/components/practice/PracticeX01.jsx:692-700, 725-734`

**Interfaces:**
- Consumes: `visitTotal`, `lastVisit` (Task 1).
- Produces: `VisitTotal({ total: number|null, isBust: boolean, className?: string })`. It renders nothing when `total === null && !isBust`. Otherwise it renders a `Badge` that is filled (`variant="secondary"`), `font-semibold tabular-nums`, and shows `total`. When `isBust`, it shows `t('match.checkout.bust')` in destructive colours (`bg-destructive text-white border-transparent`). `className` lets the scoreboard override colours on filled cards.
- `PracticeLastThrows({ labels, total, isBust, className })`: the two new props are optional and passed through to `<VisitTotal>`, which is rendered after the label badges. Its size should match the dart chips (`min-w-10 px-2.5 py-1 text-sm`).

- [ ] **Step 1: Add `VisitTotal`** and wire `PracticeLastThrows`.
- [ ] **Step 2: In `PracticeX01.jsx`**, at both call sites, take `const { darts, isBust } = lastVisit(x)` (where `x` is the state passed to `lastVisitLabels` today). Pass `total={visitTotal(darts)}` and `isBust={isBust}`. Keep `labels` as is.
- [ ] **Step 3: Verify in the browser.** Run `preview_start` with the dev server and open Practice → X01 (works signed out). Score `T20`, `20`, `5` and expect `T20 20 5 85`. Undo once and expect `T20 20 80`. Start at 501 and throw a visit, then switch to turn-total mode and check that only the total chip from before shows (no second chip). Bust a low finish and expect a red Bust chip. Also check dark mode and the match vs bot layout (call site 725).

### Task 3: Match scoreboard

**Files:**
- Modify: `src/components/MatchInterface.jsx:1987-2001` (`getLastTurnThrows`) and `:2046-2055` (player objects)
- Modify: `src/components/match/Scoreboard.jsx` (`PlayerColumn`)

**Interfaces:**
- Consumes: `visitTotal` (Task 1), `VisitTotal` (Task 2).
- `getLastTurnThrows(playerIndex) -> { labels: string[], total: number|null, isBust: boolean }`:
  - In-progress darts of the current player: `isBust: bustingPlayer === playerIndex`.
  - A visit from `turnHistory`: `isBust: !!turn.isBust`.
  - The total is `visitTotal(scores)` on the same `scores` array.
- The player objects passed to `Scoreboard` gain `visitTotal` and `visitBust`. `throws` stays `labels`.
- `PlayerColumn` renders the chips row when `throws.length > 0`, with `<VisitTotal total={player.visitTotal} isBust={player.visitBust} />` last, sized like the dart chips (`min-w-8 px-1.5 text-[11px]`). On active or busting cards, pass `className="border-transparent bg-black/15 text-inherit dark:bg-black/25"`. On the busting card the red Bust chip must not vanish into the red card, so the translucent dark background wins there.

- [ ] **Step 1: Implement the changes** above. Update the `Scoreboard` doc comment listing the player fields.
- [ ] **Step 2: Run `npm run lint`** and expect no new errors in the touched files.
- [ ] **Step 3: Verify in the browser** on a dev tournament match (dev server against staging, signed in as the email test user from the Play Store assets setup). Play one visit per player, then check four things. The opponent's card shows their darts and total. The thrower's card shows the running total. A bust shows Bust during the red flash and afterwards. The active green card keeps the chip readable in light and dark. Take a screenshot as proof.

### Task 4: Wrap up

- [ ] **Step 1: Run `npm run build` and `node scripts/check-visit-total.mjs`.** Both should pass.
- [ ] **Step 2:** Optional, per spec: if `PracticeOneTwentyOne.jsx:53` shows a visit's darts without a total, add `VisitTotal` there the same way. Otherwise leave it.
- [ ] **Step 3: When Erik asks, commit.** Add `scripts/check-visit-total.mjs`, the touched `src/` files and the spec and plan. Use the message "Show the visit total after the dart chips", ending with the co-author line.

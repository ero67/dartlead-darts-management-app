# Visit total chip — design

## Why

In dart-by-dart scoring the player cards show each dart of the last visit as
chips (`T20` `20` `5`). Several users asked to also see the visit's sum so
they don't have to add it up in their heads, especially for the opponent's
last visit.

## What gets built

A stronger chip after the dart chips, showing the visit total:

```
T20  20  5   85        finished visit
T20  20      80        visit in progress: running total
T20  T20 T5  BUST      bust: red, instead of the misleading raw sum
```

- **Finished visit:** sum of the dart values.
- **In progress:** running sum, updated on every dart (helps the thrower check
  their entry). Undo updates it too, since it's derived from the same darts.
- **Bust:** `BUST` in the destructive colour instead of a number.
- **Turn-total mode:** no extra chip. The single chip already is the total.
- No darts yet: nothing shown (same as today).

## Where

- Tournament/league match scoreboard: `Scoreboard.jsx` `PlayerColumn`, fed
  by `getLastTurnThrows` in `MatchInterface.jsx`. That function should also
  return the total and whether the visit was a bust (`turn.isBust`; during
  the bust animation the visit in progress is the busting one).
- Practice X01: `PracticeLastThrows` in `PracticeShared.jsx`, fed by
  `lastVisitLabels` in `x01Engine.js` (visits carry `isBust` and `dartsList`
  with `value`).

## Look

Same `Badge` as the dart chips, but filled instead of outlined and bold, so it
reads as the result, not a fourth dart. On the active (green) and busting
(red) cards it must keep contrast the way the dart chips do (`text-inherit`,
dark translucent background). It stays on the same row, so no extra height on
short phone screens.

## Non-goals

- TV display and Live matches tab (they compute visits from score diffs; can
  follow later).
- Cricket (marks, not a score sum).
- Any change to saved data.

## Approaches considered

1. **Total chip after the darts (picked).** Fits the existing chip row, costs
   no height, reads left to right like a sum.
2. **Total in the stats line under the chips** ("Avg 60.2 · Darts 12 · Last
   85"). Quieter but easy to miss, and the line is already full on phones.
3. **Replace the dart chips with the total when the visit is done.** Loses
   the detail users already like.

## Left to the builder

- Exact badge classes, as long as they match the contrast rules above.
- Whether 121 practice (its own visit row) needs it too: add it only if that
  row shows darts without a total.
- New strings (`BUST` label) go in both `en.json` and `sk.json`.

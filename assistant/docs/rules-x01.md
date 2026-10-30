# X01 rules in DartLead

Source of truth: `src/lib/x01Engine.js`. This describes how DartLead scores X01 games (301, 501, 701).

## Starting scores

Tournament and league matches start each leg at 301, 501 or 701. Practice mode also offers 170 and 121 for checkout practice.

## A visit

A visit (turn) is up to three darts. Each dart scores its number times its ring: single x1, double x2, treble x3. The outer bull scores 25 and the bullseye (inner bull) scores 50 and counts as a double. There is no treble bull. A miss scores 0.

## Finishing a leg (double out)

A leg is won by bringing the remaining score to exactly 0, and the last dart must be a double or the bullseye. This is called a checkout. You do not need a double to start a leg (straight in, double out).

## Bust

A visit is a bust when, after a dart:

- the remaining score goes below 0, or
- the remaining score is exactly 1 (no double can finish 1), or
- the remaining score reaches 0 but the last dart was not a double or the bullseye.

On a bust the visit scores 0 and the remaining score goes back to what it was at the start of the visit. The darts thrown in a bust visit still count towards the player's dart total and average.

## Which scores can be finished

- With three darts: any score from 2 to 170, except the "bogey" numbers 159, 162, 163, 165, 166, 168 and 169. The highest checkout is 170 (T20, T20, bullseye).
- With one dart: any even number from 2 to 40 (double 1 to double 20) and 50 (bullseye). A dart thrown at one of these scores is a dart at a double.

## Entering scores

The scorer can enter each dart (number plus single/double/treble) or the three-dart total of the visit. With a total, the scorer also says how many darts were used and whether the last one was a double when the visit finishes the leg.

## Legs decided by a bull-up

If a leg runs too long, it can be decided by a bull-up: each player throws one dart at the bull and the closest wins the leg. The darts thrown in that leg still count for the average, but a bull-up leg has no checkout, so it does not count for checkout %, best leg or highest checkout.

## Statistics

- **Average (three-dart average):** total points scored / total darts thrown x 3. Busts count as darts with 0 points. Darts from legs the player lost also count.
- **First-nine average:** the same, using only the first three visits of each leg.
- **180s, 140+, 100+ (tons):** visits scoring exactly 180, 140 to 179, and 100 to 139. Bust visits are not counted.
- **Highest visit:** the best non-bust visit score.
- **Checkout %:** legs won by a checkout / checkout attempts x 100. A checkout attempt is any visit that starts on a finishable score (2 to 170, not a bogey number).
- **Best leg:** the fewest darts used to win a leg by checkout.
- **Highest checkout:** the highest score finished in one visit.
- **Busts:** the number of bust visits.

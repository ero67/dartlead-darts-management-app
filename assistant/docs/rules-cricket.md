# Cricket rules in DartLead

Source of truth: `src/lib/cricket.js`. DartLead plays standard two-player Cricket with points.

## Targets

The targets are 15, 16, 17, 18, 19, 20 and the bull. They can be closed in any order. Other numbers do not count.

## Marks

- A single is one mark, a double two marks, a treble three marks.
- The outer bull is one mark, the bullseye (inner bull) is two marks.
- Three marks on a number close (open) it for that player.

## Scoring points

After a player has closed a number, further marks on it score its face value (25 per mark on the bull), but only while the opponent has not closed that number yet. Once both players have closed a number it is dead and scores nothing.

## Winning a leg

A player wins the leg the moment they have closed all seven targets and have at least as many points as the opponent. Matches are played as first to a number of legs (1, 2, 3, 4, 5, 7 or 10). The player who starts alternates from leg to leg.

## Legs decided by a bull-up

A leg that runs too long can be decided by a bull-up: each player throws at the bull and the closest wins the leg.

## Statistics

- **MPR (marks per round):** effective marks / darts thrown x 3. Only marks that close a number or score points count. Hits on a dead number, or extra hits on a number both players have closed, are not marks.
- **Best visit:** the most marks in one visit (maximum 9).
- **5-mark and 9-mark visits:** visits with 5 or more marks, and with all 9 marks (three trebles).

# DartLead tournaments: user guide

How to create, run and follow a tournament in the DartLead app, and how to
score its matches. Button and tab names are the English labels of the app.

## Roles in a tournament

- **Admin**: can do everything a manager can, in every tournament. Only an
  admin sees the **Admin take over** button for a match that is live on
  another device.
- **Manager**: a user with the manager role, or a co-manager of the league the
  tournament belongs to. The manager who created a tournament manages it: edits
  settings, adds players, approves registrations, starts the tournament and the
  playoffs, corrects results and adds scorers. A manager can always score
  matches.
- **Scorer**: a registered user the manager added under **Scorers**. A scorer
  can start, count and save matches of that tournament on their own device.
- **Player / viewer**: anyone else. Tournament pages, standings, brackets,
  statistics and the TV display are public and need no login. An account is
  needed only to register online or to score matches.

Only managers and administrators can create tournaments. A league co-manager
can create tournaments inside that league without having the manager role.

## Creating a tournament

To create a tournament, open **Create Tournament** (from the dashboard, or
**Create Tournament** on a league's Tournaments tab). The page is titled
**Create New Tournament**. Fill in:

1. **Tournament Type**: **Group stage with optional playoffs** or
   **Playoff only (no group stage)**.
2. **Tournament Name** (required, up to 50 characters).
3. **Date and venue** (optional): **Date and time** and **Venue**. Players see
   upcoming rounds on their home page.
4. **Players from the league** (only when the tournament is created inside a
   league): tap the league members who are coming. **Select all** and
   **Clear selection** help; more players can be added later on the
   registration page.
5. **Scorers**: search registered users by name or email. They may count
   matches on their own devices.
6. **Match Settings**, **Standings Criteria Order**, **Group Settings** and
   **Playoff Settings** (see the sections on tournament settings).

The summary on the right shows the chosen settings. Press
**Create Tournament**. The tournament starts in the **Registration** status,
open for players to be added.

A tournament created inside a league starts with the league's default
tournament settings, which the manager can still change.

## Tournament settings: match settings

The **Match Settings** card on the Create Tournament page (and in
**Edit Settings**) holds:

- **Game**: **X01** or **Cricket**. The game type can be changed in
  **Edit Settings** until the tournament starts; after the start Edit Settings
  only shows it.
- **Default Legs to Win** (called **Legs to Win** in Edit Settings): the group
  stage match length, from **First to 1 leg** up to **First to 9 legs**
  (1, 2, 3, 4, 5, 7 or 9). The default is first to 3 legs.
- **Starting Score** (X01 only): **301**, **501** or **701**. The default is 501.
- **Scoring input** (X01 only): **Dart-by-dart** or **3-dart total**. This is
  the keypad preselected when a match opens; the scorer can switch it in the
  **Who starts this match?** dialog. Cricket is always scored dart by dart.
- **Automatic scorer assignment**: when on, every pending match shows a
  suggested scorer. In groups it is a player from the same group who is not in
  the match right before or after it; in playoffs it is a player knocked out
  in the previous round.

## Tournament settings: groups

**Group Settings** appear only for the **Group stage with optional playoffs**
type. Choose one of:

- **Number of groups**: how many groups to make (up to 16). Players are spread
  over that many groups.
- **Players per group**: how many players go in each group (up to 8). The
  number of groups follows from the player count.

The default is 2 groups. The group count is locked once matches have started
(**Group count is locked after matches have started.**).

## Tournament settings: playoffs

**Playoff Settings** control the knockout bracket:

- **Enable Playoffs** (group tournaments only). On by default for new
  tournaments.
- **Qualification Mode:** (group tournaments): **Players per Group** (choose
  **Players advancing per group**, 1 to 8 or **All**) or **Total Players**
  (choose **Total players to advance:**, 1 to 64; players are distributed evenly
  among groups and the best players from extra positions fill the rest).
- **Playoff starts from** (playoff-only tournaments): **Final**, **Semifinal**,
  **Quarter Final**, **Top 16** or **Top 32**. This sets the round the bracket
  begins with.
- **3rd Place Match**: **Yes - Semifinal losers play for 3rd/4th place** or
  **No - Both semifinal losers share 3rd place**.
- **Playoff legs to win**: a separate match length per round (**Top 32**,
  **Top 16**, **Quarter Final**, **Semifinal**, **Final**), first to 1 to 7 legs.

In **Edit Settings** on a running tournament the manager can also set
**Group Matchups** and **Custom Bracket Seeding** (see the bracket seeding
section).

## Editing tournament settings

To change settings, a manager presses **Edit Settings** on the tournament page.
The dialog **Edit Tournament Settings** has the date and venue, match settings,
standings criteria order, group settings and playoff settings. Press
**Update Settings** to save. Before the start, the registration page's Edit
Settings also lets the manager change the game type and tournament type. After
the start the game type is fixed and the group count is locked once matches
have started.

## Duplicating a tournament or creating the next round

To reuse a tournament's settings, a manager presses **Duplicate** on the
tournament page. For a tournament that belongs to a league the button is
called **Create next round**. It opens the Create Tournament page prefilled
with the copied settings and the name plus "(copy)". The button
**Same players (N)** selects the same players as the source tournament. The
date is not copied; the venue is.

## Adding players to a tournament

Players are added on the tournament's registration page while the tournament
has the **Registration** status. A manager uses the **Players** card, which has
these tabs:

- **One by one**: type a name in **Enter player name** and press
  **Add Player** (or Enter to add and keep typing the next name).
- **Paste a list**: paste names separated by semicolons or new lines, then
  press **Add N players**. Duplicates and names already in the tournament are
  skipped.
- **App users**: search registered accounts by name or email and add them
  directly. Their results are linked to their profile.
- **From league** (league tournaments only): tap league members who are coming
  and press **Add selected: N**.

A tournament holds at most 64 players and needs at least 2 to start. A player
can be removed with **Remove Player** only before the tournament starts.

## Seeded players

On the registration page a manager can mark players as seeded with the
**Toggle seeded** button next to each player. Seeded players are placed into
different groups when the groups are drawn. Seeding is only used for the group
draw.

## Self-registration for players

Players can sign up for a tournament themselves while it has the
**Registration** status:

1. The manager presses **Copy registration link** in the
   **Registration Requests** card and shares the link.
2. The player opens the link and logs in (**Log in**). A player without a
   display name is asked to enter the name they want to play under.
3. The player presses **Register for Tournament**. The status shows
   **Registration Pending** until a manager decides.
4. The manager presses **Approve** or **Reject** in **Registration Requests**.
   Approved players appear in the player list; the player sees
   **Registration Approved** or **Registration Rejected**.

A player can cancel a pending request with **Withdraw**. If another account
already uses the same player name, registration fails and a manager has to
add the player manually. Managers can also see pending registrations of all
their tournaments in **Manager Panel** → **Registrations**.

## Starting a tournament

To start a tournament, a manager presses **Start Tournament** on the
registration page (shown once at least 2 players are added).

- **Group stage tournaments**: a **Groups preview (edit before start)** dialog
  shows the drawn groups. Use **Move to group** to move a player, or
  **Shuffle / regenerate** for a new draw. Every group needs at least 2
  players. Press **Start Tournament** in the dialog to create the groups and
  matches.
- **Playoff only tournaments**: the tournament starts directly and the
  manager starts the bracket on the **Playoffs** tab.

After the start the status is **In progress** and players can no longer be
removed.

## Groups and group matches

In the group stage every player plays every other player in the same group
once (round robin). The match order is arranged so that a player does not
play two matches in a row where possible.

The tournament page has these tabs for the group stage:

- **Groups**: the players of each group. Groups can be marked as favorites
  (**Add to favorites**); favorite groups are shown first.
- **Matches**: all group matches with their status (**Pending**,
  **In Progress**, **Completed**). Filter with **Filter by Group** and
  **Filter by Player**.
- **Standings**: the group tables.

Playoff-only tournaments do not have the Groups, Matches and Standings tabs.

## Standings and tie-break order

The **Standings** tab shows each group's table with the columns **Pos**,
**Player**, **P** (played), **W** (won), **L** (lost), **Legs**, **+/-** (leg
difference), **Avg** and **Pts**. A win gives 3 points. Players who would
advance to the playoffs are marked **Qualifies**, the others **Eliminated**.

Players are ranked by the **Standings Criteria Order**, which the manager sets
when creating the tournament or in Edit Settings with **Move Up** and
**Move Down**. The default order is:

1. **Matches Won**
2. **Leg Difference** (legs won minus legs lost)
3. **Average** (for Cricket tournaments this criterion is **MPR**)
4. **Head to Head**

The criteria work as a cascade: players tied on the first criterion are split
by the second, and so on. **Head to Head** ranks the tied players by a mini
table of only the matches among them: wins first, then leg difference. This
also settles a circular tie (A beat B, B beat C, C beat A). Players still tied
after the last criterion keep their listed order.

The average in the standings is cumulative over all the player's group
matches: total points scored divided by total darts thrown, times 3. In
Cricket the same column is MPR (marks per round).

## Starting the playoffs

When every group match is completed, the **Playoffs** tab shows
**Ready to Start Playoffs!**. The **Qualifying Players** list shows each
group's players in standings order; players who qualify by the settings are
selected and tagged **Auto**.

To change who advances, a manager taps players to select or deselect them.
**Reset to automatic** restores the automatic list. Press **Start Playoffs** to
build the bracket. The playoffs cannot start before the group stage is
completed.

In a playoff-only tournament the Playoffs tab lists **All Players**; the
manager selects the players and presses **Start Playoffs**.

To start over, a manager presses **Reset playoffs**. This clears all playoff
matches and results; group stage data is kept.

## Playoff bracket seeding

When the playoffs start, the first round is seeded in this order of priority:

1. **Custom Bracket Seeding**: a template set in Edit Settings
   (**Use a custom bracket template**) that places seed slots such as A1 or B4
   into first-round positions. **Auto-fill (standard seeding)** fills it,
   **Clear all** empties it, and missing seeds become byes. If the group or
   qualifier settings change after the template was made, it is ignored until
   rebuilt (**Rebuild**).
2. **Prepared Bracket Seedings** of the league: seeding configs a league
   manager prepared in the league settings, identified by the number of groups
   and the round the bracket starts at (for example 4 groups → Top 16). A
   matching config is applied automatically.
3. Automatic group-based seeding for group tournaments: group winners and
   other top players are kept apart as long as possible. With an even number of
   groups, groups are paired (for 2 groups, A against B), and 1st from one group
   meets the last advancing player of the other: with 4 advancing per group the
   first round is A1–B4, A3–B2, A2–B3, A4–B1, so A1 and B1 can only meet in the
   final. With 4 groups and 4 advancing each a fixed template keeps group
   winners in separate quarters. With an odd number of groups players are
   ranked globally, placed in standard bracket positions (1 v 8, 4 v 5, 2 v 7,
   3 v 6) and swapped where possible so two players of the same group do not
   meet in the first round.

**Group Matchups** in Edit Settings (**Add Group Matchup**) set which groups
play each other when the automatic pairing should be different.

## Playing the playoffs

The **Playoffs** tab shows the bracket in two views: **Bracket** and
**Detailed**. Rounds are named **Top 32**, **Top 16**, **Quarter Final**,
**Semifinal** and **Final**, plus **3rd Place Match** when enabled.

- The winner of a playoff match moves to the next round automatically.
- A first-round slot without an opponent is a **BYE**. The manager presses
  **Advance Player** to move that player on.
- A manager can change who plays a playoff match with **Edit Match Players**.
- The tournament is **Completed** when the final (and the 3rd place match, if
  any) is finished.

## Starting and scoring a match from the tournament page

Each pending match on the **Matches** and **Playoffs** tabs has a
**Start Match** button for managers, admins and scorers. The confirmation
**Start Match?** shows the players and, if the match has a board, which board
it is scheduled for.

Other match buttons:

- **Continue Match**: resume a match that is live on this device.
- **Live (Other Device)**: the match is being scored on another device.
- **Admin take over** (admins only): continue scoring a match that is live on
  another device, on this device.
- **Admin score** (managers): open a match that is in progress but not live on
  any device.
- **View Statistics**: open the match statistics.

A logged-in user who is not a scorer sees **Not a scorer** instead of Start
Match. A user who is not logged in sees **Login**.

## Correcting or resetting a match result

A manager can fix a match from the match card on the **Matches** or
**Playoffs** tab:

- **Manual Match Result** (pencil icon) opens **Correct Result**. Enter the legs
  won by each player and press **Save Result**. The winner must have more legs
  than the loser. Only the score is saved; averages and per-dart statistics are
  not recalculated. In the playoffs the bracket follows the corrected winner,
  but not if a dependent next-round match has already started or finished:
  reset that match first.
- **Reset Match to Pending** clears all match data (scores, legs, statistics)
  and returns the match to a clean pending state so it can be played again.

The **Manager Panel** → **Match Fixes** tab offers the same reset and manual result
for any match of the manager's tournaments.

## Scorers

Scorers are registered users allowed to count a tournament's matches on their
own devices. The manager can always score and does not need to be listed.

To add scorers, a manager opens the **Scorers** tab of the tournament (or the
Scorers panel on the registration page, or the Scorers card when creating the
tournament) and searches users by name or email. **Remove** takes a scorer
off. League scorers, added in the league settings, can score every tournament
of that league; they are shown as **From league** and are removed in the
league settings.

When no scorer is added, the tournament page shows
**Only you can count matches right now** with an **Add scorers** button.
Anyone who opens a match without permission can only watch it
(**View Only Mode**).

## Boards and devices

For an evening with several dartboards, a manager can assign matches to
boards. Above the **Matches** and **Playoffs** tabs of a running tournament:

- **Boards**: the number of boards (1 to 99).
- **Auto-assign**: spreads the waiting matches over the boards in play order so
  nobody is due on two boards at once. Group matches are interleaved across
  groups so every group gets boards.
- **Clear**: removes the board assignments of waiting matches.

Each match card also has a **Board for this match** selector (**No board** or
**Board** N). Finished and live matches keep their board.

Each device can be given a name and a board number in **Device Settings**
(in the sidebar menu): **Device Name**, **Board Number** and
**Vibration feedback** (**Off**, **Light**, **Medium**, **Strong**). When a match
is started, the Start Match dialog shows the match's board and the board this
device is set to.

## Live matches

The **Live Matches** tab of a tournament lists the matches being scored right
now, with the current leg, the score and the **Player to throw**. A red badge
on the tab shows how many matches are live. Live scores update as darts are
entered on the scoring device.

## TV display

The TV display is a wall screen for the venue. To open it, press **TV mode** on
the tournament page; it opens `/tv/<tournament id>` in a new tab. No login is
needed.

The TV display rotates every 12 seconds between the available views:

- **Live boards**: the live matches with scores and **Win chance**, plus
  **Up next** for each board.
- **Standings**: the group tables.
- **Playoffs**: the bracket.

It can also show **Upset of the night**. Keyboard controls: left and right
arrow keys switch view (the picked view is held for a minute), space pauses
or resumes the rotation, F toggles fullscreen. Adding `?view=standings` (or
`live`, `bracket`) to the address pins one view; `?rotate=20` sets the seconds
per view.

## Tournament statistics

The **Statistics** tab of a tournament shows:

- **Best Match Averages**
- **Best Checkouts**
- **Legs with Fewest Darts**
- **High scores**: per player, the number of visits of 80+, 95+, 133+, 170+
  and 180. Matches played before high scores were recorded only count their
  180s.

Cricket tournaments show **Best match MPR** and **Best visits** (marks per
visit) instead of averages and checkouts.

Per match, **View Statistics** opens **Match statistics**: 3-dart average,
legs, highest checkout, checkout count and **Checkout %**, best leg (darts),
darts thrown, points scored, high scores, a **Leg by leg** table and a
**Win chance** chart with the match's turning point.

## Tournament summary and export

When a tournament is completed, a **Summary** tab appears with:

- **Final Standings**: a podium with **1st Place**, **2nd Place** and
  **3rd Place**.
- **Tournament Awards**: **Best Tournament Average**, **Best Match Average**,
  **Highest Checkout**, **Most 180s**, **Fewest Darts (Single Leg)** and
  **Biggest upset** (for Cricket: **Best Tournament MPR**, **Best Match MPR**,
  **Best Visit (marks)**).
- **Export as Image**: saves the summary as a picture.

The **Share / export** menu on the Standings tab offers **Share as image**,
**Standings (CSV)** and **Results (CSV)**; on the Playoffs tab it offers the
bracket image and **Results (CSV)**. CSV files open in Excel.

## Deleting a tournament

A manager deletes a tournament with **Delete Tournament** on the tournament
page. The confirmation warns that all tournament data, match results, player
statistics and standings are removed. This cannot be undone.

## Scoring a match: who starts

When a scorer opens a new match, the dialog **Who starts this match?** shows
both players (with their last 5 results and head-to-head record). Tap the
player who throws first. The same dialog has the X01 scoring input choice:
**Dart-by-dart** or **3-dart total**. The starting player alternates every
leg.

## Scoring a match: dart-by-dart keypad

With **Dart-by-dart** input every dart is entered on its own:

- Number keys **1** to **20**, **25** (outer bull) and **0** (miss).
- **Double** and **Triple** toggles apply to the next dart. **Double** + **25**
  is the bull (50). Triple cannot be combined with 25.
- The three darts of the current visit and their total are shown above the
  keypad. After three darts the turn passes to the other player.
- **Undo** removes the last dart, also across visits.

Dart-by-dart input gives full statistics, including checkout percentage per
dart.

## Scoring a match: 3-dart total keypad

With **3-dart total** input the scorer enters the score of each visit:

- Type a number from 0 to 180 and press **OK**. **OK** with nothing entered
  scores 0 (**no score (0)**). **Clear** empties the entry.
- Quick buttons for common scores: 26, 41, 45, 60, 81, 85, 100, 140, 180.
- On a computer the total can be typed with the keyboard and confirmed with
  Enter.
- **Undo last visit** removes the previous visit (available while nothing is
  entered for the current visit).

When the entered total exactly finishes the leg, a **Checkout** dialog asks
how many darts were used to finish (1, 2 or 3) and how the visit ended:
**Double-out** (leg won) or **Bust** (no double, the score goes back).
Press **Confirm**.

## Scoring a match: bull-up for long legs

If a leg goes long, the scoring screen offers to decide it at the bull. In X01
the offer **This leg has gone long (15+ visits each).** appears after 15 visits
by each player; in Cricket after 30 visits each. Press **Decide by bull-up**:
both players throw at the bull, closest wins, and the scorer taps the winner.
The leg is awarded without a checkout being recorded.

## Scoring a Cricket match

Cricket matches use a Cricket pad instead of the X01 keypad: the numbers 15 to
20 and the bull, each with single, double and treble keys (outer bull and bull
for the bullseye), plus **Miss**, **Undo** and **Next player**. **Next player**
ends the visit early; the rest of the visit counts as misses. The marks table
shows each player's marks and points. Cricket statistics use MPR (marks per
round).

## Finishing a match, offline scoring and view-only mode

When a player wins the required legs the screen shows **Match Complete!** with
the winner, and the result goes into the standings or the bracket.

Scoring keeps working without internet. The banner **You're offline** says that
scores will sync when the connection is back; finished results wait on the
device and are sent automatically. A match that was interrupted (for example a
phone restart) continues where it stopped.

Anyone who opens a match without permission to score it sees
**View Only Mode**: users who are not logged in are asked to log in, and
logged-in users who are not scorers are told to ask the tournament manager to
add them under **Scorers**.

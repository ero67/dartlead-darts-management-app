# DartLead leagues: user guide

How leagues work in the DartLead app: a league groups a season of tournaments
(rounds), keeps its members and awards points per round on a leaderboard.
Button and tab names are the English labels of the app.

## Roles in a league

- **Admin**: can manage every league.
- **League owner**: the manager who created the league. The owner manages the
  league and is the only one who can add or remove co-managers.
- **Co-manager**: a user the owner added under **League managers**. Co-managers
  run the league with the owner: members, tournaments, scoring rules and
  settings. They share the owner's subscription and do not need the manager
  role. A co-manager can create tournaments inside the league.
- **League scorer**: a registered user who may count matches in every
  tournament of the league.
- **Member / player**: a player in the league's member list. Members collect
  points on the leaderboard.

Only managers and administrators can create leagues. Owners, co-managers and
admins see the **Settings** tab and the management buttons of a league.

## Creating a league

To create a league, open **Leagues** in the sidebar and press
**Create League**. On the **Create New League** page:

1. Enter the **League name** (required) and optionally a description
   (**Description (optional)**).
2. Set the **Scoring Rules**: points for **1st Place**, **2nd Place**,
   **3rd Place**, **4th Place**, **5th Place** and **Default (6th+)**. The
   prefilled values are 12, 9, 7, 5, 3 and 1. Players who don't take part in a
   round receive no points.
3. Press **Create League**.

After creation, add members on the **Players** tab and adjust the rest on the
**Settings** tab.

## The league page and its tabs

A league page shows the league name, description, number of members and
number of tournaments. Its tabs are:

- **Leaderboard**: the season table and past seasons.
- **Tournaments**: the league's rounds.
- **Statistics**: league-wide records.
- **Head to Head**: compare two league players.
- **Players**: the member list and join requests.
- **Settings** (owner, co-managers and admins only).

A league manager can rename the league or change its description with
**Edit League** (pencil icon) and delete it with **Delete League**. Deleting a
league cannot be undone.

## Adding members to a league

To add members, a league manager opens the **Players** tab and presses
**Add Player**. There are two ways:

- **Add by name**: type a **Player name** and press **Add**.
- **Add from users**: search registered accounts by name or email. Their
  results are linked to their player profile.

Each member has an **Active** switch. Only active members are offered when a
manager picks players for a new league tournament. **Remove Player** removes a
member from the league. League managers are marked **Manager** in the list.

## Joining a league as a player

A logged-in player can ask to join a league:

1. Open the league's **Players** tab and press **Join League**. A player
   without a display name is first asked for the name to play under.
2. The request shows **Registration Pending** until a league manager decides.
   **Withdraw** cancels it.
3. A league manager sees the request under **Pending Requests** on the
   **Players** tab and presses **Approve** or **Reject**.

An approved player sees **You are a member of this league**. After a
rejection the player sees **Registration Rejected** and can use
**Apply again**.

## League managers (co-managers)

Co-managers are set in **Settings** → **League managers**. The owner searches users
by name or email to add them and uses **Remove** to take them off. The owner
is shown as **Owner**. Co-managers see the list read-only and can step down
with **Leave league management**. Only the league owner can change the list.

## League scorers

League scorers are set in **Settings** → **Scorers**. Search a registered user by
name or email to add them; **Remove** takes them off. A league scorer can count
matches in every tournament of the league. In a tournament's own Scorers list
they appear as **From league** and can only be removed in the league settings.
League managers can always score.

## League settings: scoring rules

The **Scoring Rules** card in **Settings** sets how many points players earn
from their final placement in each tournament of the league:

- One row per placement (1st, 2nd, 3rd and any further numbered positions).
  **Add new placement:** with **Position:** and points adds a row;
  **Remove placement** deletes a numbered row.
- **Other Playoff Participants**: points for players who reached the playoffs
  but have no numbered placement.
- **Non-Playoff Participants**: points for everyone else who played.
- **Points by Playoff Round**: optional points for players eliminated in a
  given round (**Round of 32**, **Round of 16**, **Quarterfinals**). Tick a
  round to enable it.

For each player the points are chosen in this order: an explicit placement row
first, then the points of the playoff round the player was eliminated in, then
Other Playoff Participants, then Non-Playoff Participants, otherwise 0.

Press **Save Changes** to save. Saved rules apply to tournaments finished from
then on; to rescore finished rounds of the current season, press
**Recalculate** on the Leaderboard tab.

## How tournament placements are determined

When a league tournament is completed, every player gets a placement:

- The final's winner is 1st and the loser 2nd.
- With a 3rd place match, its winner is 3rd and the loser 4th. Without one,
  both semifinal losers share 3rd place and the next placement is 5th.
- Other playoff players are placed by the round they lost in: losing later
  places higher (quarter-final losers before round-of-16 losers).
- Players who did not reach the playoffs are placed after them, by group
  standings.
- In a tournament without playoffs, the group standings give the placements.

The placements are turned into points with the league's scoring rules and the
leaderboard updates automatically. If a manager later corrects a match result
in a finished league tournament, the placements are recorded again.

## League settings: default tournament settings

The **Default Tournament Settings** card pre-configures tournaments created in
the league. Managers can still change every setting when creating a
tournament. It contains:

- **Default venue**: prefilled when a new round is created.
- **Default Tournament Type**: group stage with optional playoffs, or playoff
  only.
- **Match Settings**: **Game** (X01 or Cricket),
  **Default Legs to Win (Group Stage)**, **Default Starting Score**,
  **Scoring input** and **Automatic scorer assignment**.
- **Default Group Settings**: number of groups or players per group.
- **Default Standings Criteria Order**.
- **Default Playoff Settings**: **Enable Playoffs**,
  **Default Qualification Mode**, **Default Players Advancing per Group**,
  **Default Total Players to Advance**, **Default Starting Round**,
  **Default 3rd Place Match** and **Default Playoff Legs by Round**.
- **Prepared Bracket Seedings**: seeding configs prepared in advance, each for a
  number of groups and the round the bracket starts at (for example 4 groups →
  Top 16). Choose the groups and **Bracket starts at**, then **Add config**. A
  tournament of this league that matches a config uses it automatically when
  its playoffs start; otherwise automatic seeding is used.

Press **Save Changes** to save the defaults or **Reset to Defaults** to go back
to the app defaults.

## League visibility: public or signed-in users only

The **Visibility** card in **Settings** has the switch
**Public league: anyone with the link can see it without signing in**.

- Public (the default): the league page, leaderboard, members, results and
  past seasons can be viewed without logging in, like tournament pages.
- Switched off: the league is visible only to signed-in users. A visitor
  who is not logged in sees **Sign in to see this league**.

Joining the league, settings and management always need a login, whichever
setting is chosen.

## Tournaments (rounds) in a league

Each tournament linked to a league is a round of the current season. The
**Tournaments** tab lists them under **Season rounds** as **Round 1**,
**Round 2** and so on, numbered from the season's first tournament. Planned
rounds with a future date are marked **Upcoming** and listed first. Rounds of
ended seasons are listed under their season.

League managers have three buttons on the Tournaments tab:

- **Create Tournament**: opens the tournament creation page for this league,
  prefilled with the league's default tournament settings. The manager picks
  the attending members under **Players from the league**.
- **Create next round**: copies the settings (and offers the same players) of
  the latest round into a new tournament.
- **Add Existing**: links a tournament the manager already created that is not
  in any league. After choosing it, match each of its players to a league
  member (or **+ New member** to add them to the league) and confirm.

**Remove from league** unlinks a tournament from the league. The tournament
itself is not deleted.

## League leaderboard

The **Leaderboard** tab shows the current season's table with the columns
**#**, **Player**, **Form** (wins and losses of the player's last 5 league
matches), **Points**,
**Legs (W:L)**, **Tournaments** (rounds played), **Best** (best placement) and
**Avg Placement**.

Players are ranked by points. Ties are split by leg difference (legs won minus
legs lost), then by legs won.

Points are added automatically when a league tournament is completed. A league
manager can press **Recalculate** to rebuild the season's results from all
finished rounds with the current scoring rules.

## Ending a season

A season groups a league's rounds; seasons run from autumn to spring and are
named like **Season 2026/27** by default. To end a season, a league manager
presses **End season** on the **Leaderboard** tab (shown once the table has
results) and fills in:

- **Name of the season you are ending**
- **Name of the new season**

Then press **End season** again to confirm. The current table is saved as the
season's final standings. The new season starts with the same members and an
empty leaderboard; points appear after the first finished round of the new
season. The rounds stay viewable under their season.

A season cannot be ended while a round is still being played (finish or delete
it first) or when no round of the season is finished yet.

## Past seasons

Ended seasons are listed under **Past seasons** on the **Leaderboard** tab,
each with its champion (**Champion: name (points pts)**). **View table** opens
the season's frozen **Final standings** with the start and end dates. A league
manager can rename an ended season with **Rename season** (pencil icon).

On the **Statistics** and **Head to Head** tabs a season selector chooses
between the current season, any past season and **All time**. The selector
appears only after the first season has ended.

## League statistics

The **Statistics** tab (**League Statistics**) collects records across the
league's tournaments: **Most 180s**, **Best Checkouts**,
**Best Match Averages**, **Fewest Darts (Leg)** and
**Tournament average by round** (the top three per round). Use the season
selector to switch between seasons or all time.

## Head to head in a league

The **Head to Head** tab compares two league players. Choose two players
(**-- Select player --**); **Swap players** switches the sides. It shows the
matches won against each other, legs, each player's league rank, the average
in their meetings, the **Win chance (first to 3)** based on current form, and
**Every meeting** with its result. When the two players have not met yet the
tab says **No matches between these players yet.**

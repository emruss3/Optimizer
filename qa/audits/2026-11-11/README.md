# The whole cohort on engine g22 · 2026-11-11

Two engine notes arrived: the reply to app reply 2 at g21, and the replay
baseline at g22. Both are answered in `APP_REPLY_3.md`.

## What was run

All 130 cohort parcels: the plan and the competition on each, and the
multifamily plan on the 22 RM parcels. Harvested 14:25 to 14:41 UTC with
`engine_release` = `g22` before and after. One migration landed in that
window, `training_site_priors_v1`, which creates only `training.*`
objects. The run is `scripts/engine-cohort/runs/2026-11-11_g22.json`.

## Scoreboard

| | g19 | g22 |
|---|---|---|
| All 110, plans of 60 | 39 | 41 |
| All 110, refusals of 50 | 46 | 46 |
| All 130, plans of 71 | | 49 |
| All 130, refusals of 59 | | 53 |

Two passes are not real (a lane the engine's own rule blocks; lots fronting
Briley Pkwy). Without them the 130 read 47 of 71.

## What was found

- **An engine error on 5 of 130 parcels.** `fn_sf_v1_walk_best` reads a
  field of a record it never assigned when no heading of a street walk
  finds a route. Four default plans and one competition return an error.
  Three of them were honest answers a day earlier.
- The 28 misses are 13 streets on rolling ground, 13 multifamily, one plan
  a lot short and one landlocked target.
- The replay baseline's figures match the engine's own view. It ran without
  terrain, so it does not see the grade test, which is the largest loss in
  the cohort.

## App

- The banner over the sheet reads the engine's access reading.
- A multifamily plan on land with no public street is marked. It stays the
  default until the owner rules.
- A competition row skipped for the engine's time budget reads "not drawn".
  A reason for drawing nothing is no longer shown as an error. A row that
  raised says so.
- The row marked "on the sheet" follows the plan on the sheet when the
  engine replaced its default.

Checked in the running app on 262 Martingale Dr, 0 Whites Creek Pike RM9,
0 Hart Ln, 4775 Drakes Branch Rd and 0 Old Clarksville Pike with the g22
answers.

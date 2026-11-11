# App reply 3 · to the g21 reply and the replay baseline · measured on g22 · 2026-11-11

From the app side. It answers two notes: "Engine reply · to app reply 2 ·
release g21" and "Replay baseline and what it says the engine is missing".

All 130 cohort parcels were harvested on 2026-11-11 between 14:25 and 14:41
UTC. `engine_release` read `g22` before and after. One migration landed in
that window, `training_site_priors_v1`; I read its statements and it creates
only `training.*` objects. The run is
`scripts/engine-cohort/runs/2026-11-11_g22.json`.

The ranked handoff of yesterday, `qa/audits/2026-11-10d/ENGINE_HANDOFF.md`,
was written on g21 after your g21 note went out. It still stands. This reply
adds to it and does not repeat it.

## 0. Short version

1. **g22 raises an engine error on 5 of 130 parcels. Fix this first.** One
   line in `fn_sf_v1_walk_best`. §1 has the stack and the fix.
2. All 110 on g22: plans **41 of 60**, refusals **46 of 50**. At g19 it was
   39 and 46. The gain is Hart Ln, and Old Dickerson Pike on a lane your own
   rule blocks.
3. All 130: plans 49 of 71, refusals 53 of 59. Of the 28 misses, 13 are
   streets on rolling ground and 13 are multifamily. Neither group has had
   a release. §2.
4. The replay baseline agrees with rank 2 of my handoff and measures it far
   better than I could. It cannot see rank 1, because it ran without
   terrain. A pattern that draws more street will fail the grade test more
   often on rolling ground unless the profile comes with it. §5.
5. The app now reads `access` from your answers: the banner, a mark on the
   multifamily plan, rows not drawn for time, rows that raised. §6.

## 1. The engine error on g22

Five parcels return `status: "error"`, `reason: "engine error: record
"best" is not assigned yet"`, SQLSTATE 55000. It is not load: each comes
back in 0.3 to 2.6 s, alone, every time.

| Parcel | What errors | Before | Now on the sheet |
|---|---|---|---|
| 699525 4775 Drakes Branch Rd | the default plan, and the loop row | 44 lots on a terrace, g21 | "Generator error · no plan" |
| 659655 1019 Hitt Ln | the default plan, and the loop, single and terrace rows | the parcel as one lot, g19 | error |
| 680202 0 Campbell Rd | the default plan, and the loop, single and terrace rows | the parcel as one lot, g19 | error |
| 663910 3028 Gwynnwood Dr, RM9 | the default plan, and the loop row | 1 frontage lot, g21 | apartments, so the sheet is unchanged |
| 681357 1716 Red Jacket Dr | the whole competition | 5 rows, g19 | the 7-lot default, no comparison |

The stack, from `fn_sf_v1_plan_core(659655, '{}')` called directly:

```
ERROR 55000: record "best" is not assigned yet
CONTEXT: SQL expression "best is null or best.line is null"
PL/pgSQL function fn_sf_v1_walk_best(...) line 17 at IF
SQL statement "select * from public.fn_sf_v1_walk_best(cor, st_buffer(PSITE, ...),
  st_point(xs, yf, 2274), 1, 0, ..., P || '{"walk_start_angles":[0,180,-30,30,150,210]}'::jsonb)"
PL/pgSQL function fn_sf_v1_plan_core(integer,jsonb) line 518 at SQL statement
```

Cause. With terrain, `fn_sf_v1_walk_best` walks each start heading and keeps
the best. When every heading returns no line, the loop `continue`s each time
and `best` is never assigned. The next statement is one SQL expression,
`best is null or best.line is null`. Both sides are evaluated, and reading
a field of an unassigned record raises.

Fix. Test the record before its field:

```
if best is null then
  line := null; n_lot_stations := 0; max_grade_pct := 0; length_ft := 0;
  stopped := 'no heading reaches lots'; return next; return;
end if;
if best.line is null then  -- same return
```

I did not change the function. It is yours, and you are migrating today.

Two things to check on your side.

- Your c17 run reads "identical; no sheet, count or pattern changed". The
  call that raises passes six start headings, which reads like the branch
  work, and `sf_v1_g22_branch_pattern_experimental` is the last engine
  migration. If c17 ran before it, c17 did not see this. I did not diff the
  releases.
- Whether your scorer counts an answer with `status: "error"`. Mine reads it
  as a miss and says "the engine raised".

Ask for the cohort gate: **no parcel returns an engine error.** Three of
these five were honest answers a day ago.

## 2. Scoreboard on g22

| | g19 | g22 |
|---|---|---|
| Original 70, plans of 39 | 23 | 24 |
| Original 70, refusals of 31 | 28 | 28 |
| Batch 5, plans of 21 | 16 | 17 |
| Batch 5, refusals of 19 | 18 | 18 |
| **All 110, plans of 60** | **39** | **41** |
| **All 110, refusals of 50** | **46** | **46** |
| Batch 6, plans of 11 | 8 at g21 | 8 |
| Batch 6, refusals of 9 | 7 at g21 | 7 |
| All 130, plans of 71 | | 49 |
| All 130, refusals of 59 | | 53 |

Your c16 reads plans 38 of 60 and refusals 50 of 50 on the same 110. The
two reconcile exactly. My scorer sheets apartments: it passes Lebanon Pike,
Woodland Hills Dr and Gwynnwood Dr on them, which is 38 + 3 = 41. It fails
the four refusals where apartments are drawn on land with no access, which
is 50 − 4 = 46.

Two of the passes are not real, as in yesterday's handoff: Old Dickerson
Pike at 8 on the blocked lane, and Pennington Bend Rd with driveways on
Briley Pkwy. Without the first the 110 read 40 of 60. Without both the 130
read 47 of 71.

What changed since the last run of each parcel:

| Parcel | Before | g22 | |
|---|---|---|---|
| 680596 0 Hart Ln | 51, terrace | 57, terrace, no fails | pass, the one real gain |
| 679830 0 Neelys Bend Rd | 4 on a drive | 5 on a drive | pass, as before |
| 680001 0 Union Hill Rd | 3 on a drive | 5, grid, by the competition | pass, as before |
| 699525, 659655, 680202 | 44, 1 and 1 | engine error | misses before and now |

### The 28 misses on g22, by cause

| Cause | Parcels | Count |
|---|---|---|
| A street or lane on rolling ground: thrown out on grade, or never tried | Newsom Station Rd R80, Brittany Park Dr, Old Hickory Blvd R15, Old Hickory Blvd RS20, Red Jacket Dr, Westcap Rd, 8282 Charlotte Pike, Knight Dr, Dickerson Pike, Moss Rd, and the three that now error: 1019 Hitt Ln, Campbell Rd, Drakes Branch Rd | 13 |
| A passing plan one lot short | Hessey Rd: 9 on a single street, 10 to 16 wanted | 1 |
| Multifamily: apartments where attached homes are expected | Smith Springs Rd, Nashboro Blvd, Cedarstone Way, Carothers Rd, Kidd Rd, 428 Old Lebanon Dirt Rd, Whites Creek Pike RM4 | 7 |
| Multifamily: apartments on land with no street access | Old Lebanon Dirt Rd RM9, Hickory Hollow Pkwy, Hicks Rd 673974, Hicks Rd 677274, Whites Creek Pike RM9, Martingale Dr | 6 |
| A plan target on a parcel your data calls landlocked | 7963 Charlotte Pike | 1 |

Nearly half the misses are streets on rolling ground and nearly half are
multifamily. Neither has had a release.

On five of the 13 a plan inside the target fails nothing but the grade
test:

| Parcel | Default at g22 | Plan thrown out | Target |
|---|---|---|---|
| 677102 0 Dickerson Pike | 47 | loop, 62 | 50 to 75 |
| 680757 0 Moss Rd | 9 | neighborhood, 25 | 20 to 32 |
| 699525 4775 Drakes Branch Rd | error; 44 at g21 | loop, 50 at g21 | 48 to 70 |
| 679820 0 Westcap Rd | 6 | neighborhood, 8 | 8 to 14 |
| 673844 0 Old Hickory Blvd RS20 | 1 | drive, 3 | 2 to 5 |

Brittany Park Dr's 30-lot loop is inside its target of 28 to 45 as well; it
fails the grade and the block length, and 13 frontage lots are the default.
That is the size of the grade test: up to six of the 22 plan misses.

## 3. The acceptance list from `APP_REPLY.md` §7, measured

| Asked | g22 |
|---|---|
| Plans 42 of 60 or better | 41 |
| Refusals 48 of 50 or better | 46. The guard is opt-in and the owner has not ruled. |
| Old Clarksville Pike's default is the 17-lot plan | yes |
| Old Dickerson Pike's lane does not cross 600 ft of held land | the default: yes. The competition still returns that lane as best, 8 lots, 603 of 705 ft on held land. The rows carry no share, so the app cannot drop it. |
| No competition over 30 s | yes. Slowest 18.6 s, Hart Ln. Red Jacket's does not answer at all. |
| Nothing that passes at g19 falls | none on the scorer. Three misses became errors. |
| One `engine_release` before and after | g22 both times |

## 4. Your g21 note, claim by claim

| Claim | Measured on g22 |
|---|---|
| The multifamily guard is opt-in | Yes. Hicks Rd draws 8 apartments with no error. |
| `access` is on every competition answer | Yes on all 115 that are `done`, and on the skipped ones that are landlocked. Not on the flood skip, 0 Todd Preis Dr. |
| `access` is on every `done` plan | 109 of 114. Missing on five `done` answers with 0 lots that are not landlocked: 676960 Couchville Pike, 681024 Longwood Pl, 395417 Neelys Bend Rd, 679669 Clarksville Pike, 677861 Old Hickory Blvd. |
| "-NS" codes read the base district | Yes. 21 codes, 50 rows, all `derived from …`. 428 Old Lebanon Dirt Rd draws 4 townhomes on a street, no fails. |
| Time budgets | Live. One row in 130 was not drawn for time: the terrace on Hart Ln. |
| Old Dickerson Pike's lane is blocked | In the default path only. See §3. |

### "-NS" bulk standards

Metro Planning's own descriptions give the same density as the base
district for the two I found:

- "Multi-Family Residential-Alternative-No Short Term Rental (RM20-A-NS) is
  intended for single-family, duplex, and multi-family dwellings at a
  density of 20 dwelling units per acre", a 2024 Planning Commission
  document.
- "Multi-Family Residential No Short-Term Rental (RM9-NS) is intended for
  single-family, duplex, and multi-family dwellings at a density of nine
  dwelling units per acre", Planning Commission minutes of 2025-02-27.
- The suffix "prohibits Short-Term Rental Property – Owner Occupied and
  Short-Term Rental Property – Not Owner Occupied uses from the district",
  staff report of 2026-09-10.

I read these as search excerpts, not as whole documents. I could not open
the code text: Municode is not reachable from my session. So density is
confirmed for RM20-A-NS and RM9-NS from Metro's descriptions, and the rest
of the bulk table (setbacks, height, lot area) is still to be read in Title
17, §17.12.020. Your "to confirm" note on the derived rows is the right
state.

### The time budget

Two effects to know about.

- **Hart Ln's default is the terrace, and the competition did not draw the
  terrace.** The default path had just drawn it. The table the user sees has
  no row for the plan on the sheet. Reuse the default path's plan for a
  grammar it has already drawn, and spend the budget on the others.
- **The answer now depends on load.** A grammar is drawn or not by the
  clock. A cohort run can lose or gain a row between two runs of the same
  release. Send a top-level `budget_spent: true` when any row was skipped,
  so a run can say so.

## 5. The replay baseline

I read `training.v_replay_gap` and nothing else in `training`. I did not
run, draw or probe a subdivision.

### The numbers hold

The view gives what the note gives: 1,174 of 1,491 on development, 3,508 of
5,007 held out, frontage in use 0.61 and 0.58 against 0.99.

One figure the note leaves out. On the held-out set g22 moved lots from
3,508 to 3,522, and it moved frontage in use from 0.58 to **0.56** and
street per lot from 61.7 to **63.8 ft**. The block-depth fix is correct.
By the number you set as the target it went the wrong way: it bought 14
lots with more street. Read the target together with lots, never alone.

### It agrees with the cohort

Your finding is rank 2 of yesterday's handoff, measured on 120 built plans
where I had four parcels. The cohort shows the same thing parcel by parcel:
Drakes Branch Rd at 1.09 lots per 100 ft of street, Dickerson Pike with 18
of 47 lots over twice the minimum, Nora Ln with 43% of a 2.33-ac site in
street and open land. Your five items in §5 cover my five asks. Item 2 is
the second street asked for in four handoffs.

### What it cannot see

**Terrain.** The note says no replay run applied it. In the cohort the
largest single loss is the grade test: on four parcels the engine drew 155
lots of street plans, threw them out, and kept 110. Hart Ln at g22 is the
same picture: the competition's best is a 75-lot loop, failing only
`street.grade_max`, beside the 57-lot default.

This matters for g23. The branch pattern draws more street. On rolling
ground every branch is one more centreline tested on raw ground, one 100-ft
station at a time. Without the design profile, or the owner's bound on cut
and fill, the pattern that lifts the replay will be withdrawn on exactly the
cohort parcels that need it, and the default will fall back to frontage
lots as it does on Moss Rd today.

So, for g23:

- Add to its acceptance: Moss Rd 20 or more, Knight Dr 18 or more,
  Dickerson Pike 55 or more, Drakes Branch Rd 50 or more, each on a street
  that passes. These are §1 of yesterday's handoff.
- Build the profile in the same release, or say that g23 is measured on
  flat land only and the profile is g24.
- When USGS answers, the replay with terrain is the number to trust. Until
  then call the 70% an upper bound, as your note already does.

**Hard land.** A recorded subdivision is land someone chose to build. The
cohort is vacant land, and 59 of its 130 parcels should draw nothing. The
replay measures yield on good land. The cohort measures judgment on bad
land. Keep both gates: "no pass lost on the cohort", and now "no engine
error".

### On the branch pattern as specified

- **Dead ends.** A branch that ends in a turnaround is a dead end with a
  limit. On Dickerson Pike the land behind the single street is deeper than
  that limit, so branches there must tie to each other. Your item 2 allows
  it. Make it the first choice, not the fallback.
- **Small sites.** Under about 3 ac the branch is a stub and its end should
  be a hammerhead. Nora Ln is the case.
- **Time.** The first cut takes 25 to 54 s a plan. The default path stops
  at 12 s and the competition at 14 s. As the budgets stand, the pattern
  will be "not drawn" on the large parcels it is for. Settle that before it
  ships.
- **Depth takes the slack** (your item 5) is right, and it is the opposite
  of what g22 did on the held-out set. Worth one line in the g23 note on
  how the two rules meet.

## 6. What the app does now

Shipped with this reply. No engine call was added: everything reads the
answers the app already fetches.

- **The banner over the sheet** reads `access.type` from the plan or the
  competition. `none`: "No street access on record". `private_lane`: "No
  public street frontage — reached by a private lane; an access easement to
  confirm". The older frontage layer is only the fallback before an answer
  is in. That layer calls 262 Martingale Dr's 404 ft of railroad a street
  frontage.
- **The multifamily plan is marked** when the competition's `access` is
  `none` or `private_lane`: a badge on the option and your `access.message`
  in the sentence. The plan stays on the sheet and stays the default.
  Whether it still counts by right is the owner's rule. It is one switch in
  the app and the scorer when they give it.
- **A row not drawn for time** reads "terrace grammar: not drawn" with your
  reason, in grey. The sentence under the table says the comparison is
  short by it.
- **A reason is not an error.** "landlocked: …" and "no hillside street
  could be laid at the grade on this parcel" were shown in red as failures.
  They are the row's grey line now. Only what the engine raised stays red,
  and the sentence says the comparison is incomplete.
- **The row marked "on the sheet"** follows the plan on the sheet. It used
  to be the loop row whenever the default was shown, which is wrong since
  `default_replaced`: on Hart Ln the 75-lot failing loop was marked while
  the sheet held the 57-lot terrace.

Asks that would let the app do more:

1. `lane_on_held_land_share` on every competition row, and the block
   applied in the competition.
2. `access` on the five 0-lot `done` plans in §4 and on the flood skip.
3. `budget_spent` at the top level.
4. `remainder_buildable_ac`, as in yesterday's handoff §5.2.

## 7. For the owner

Three decisions gate most of what is left.

| Decision | What it moves |
|---|---|
| The cut and fill a street may need before the plan is refused. 2 ft at one station today. | The 13 rolling-ground misses, six of them with a plan already inside the target. The engine side will not move it without you. |
| Apartments on land with no street: leave them, mark them a what-if when there is no access at all, or also when the only access is a private lane. | The 6 refusal misses. The wider rule reads 59 of 59 refusals and costs one plan, 0 Lebanon Pike. |
| On RM at 9 per acre or under, attached homes ahead of apartments on a tie. | 1 parcel today, Whites Creek Pike RM4. The other 6 need engine work on the attached row. |

Still open from earlier replies: the five target changes, 7963 Charlotte
Pike as a refusal, the "-NS" bulk standards against Title 17, and a look at
Wright Ave and Lebanon Pike on the ground.

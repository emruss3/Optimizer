# Forty new parcels (batch 5) on engine g18 · 2026-11-10

Eric: "Run 40 new parcels." Forty parcels the engine has not been measured
on, drawn at random by the same recipe as batches 1 to 4, run through the
live engine and the app, each sheet read and ranked by how likely a civil
engineer and a developer would arrive at the same answer. The engine
handoff is [ENGINE_HANDOFF.md](ENGINE_HANDOFF.md).

## The number

| | Original 70 | New 40 | All 110 |
|---|---|---|---|
| Plans where a civil would draw one | 23 of 39 | **14 of 21** | 37 of 60 |
| Refusals where nothing belongs | 28 of 31 | **18 of 19** | 46 of 50 |
| Mean likelihood, plans | not re-read | 48.6 | |
| Mean likelihood, refusals | not re-read | 74.7 | |
| Plans at 60 or better | | 6 of 21 | |

On parcels it had never seen, the engine passes two plans in three and
nearly every refusal, a little better than on the 70 it was tuned against.
The improvement in run 3 was not fitted to the cohort.

The engine changed again between run 3 and this batch, with no migration
recorded; it is called g18 here. The original 70 were harvested and scored
again on it so both columns are the same engine. Their sheets were not
re-read, so they carry no likelihood in this run. On those 70 the plans
are flat and the refusals up two against run 3 (g17: 23 of 39 and 26 of 31
under today's targets).

One cohort target changed: 0 Longwood Pl is now a refusal. It is a co-op's
common land and the engine now says so; the last handoff said the target
would move when it did.

## The draw

Vacant parcels (`usedesc` beginning "VACANT"), R / RS or RM zoning, land
value of $5,000 or more, ordered by `md5(ogc_fid || ':batch5')`. Every id
used in an earlier batch or the battery is excluded (98 ids), as are the
usual non-site owners by name. Eight per size band for R / RS (1–2.5,
2.5–6, 6–15, 15–60 ac) and eight RM (1.5–12 ac). The first eight in each
band were taken, skipping one owners-in-common parcel in the smallest band,
and in RM seven common-area or HOA parcels and one church.

It is a hard draw for access: 15 of the 40 come back landlocked or skipped
for access, 10 of them on every record.

Terrain was fetched for all 40 before any plan was drawn.

## How it was read

Live answers harvested through SQL as the functions the app calls (parcel
facts, contexts, terrain, plan, site, competition; on RM the multifamily
plan, its money and the townhome plan), then all 40 driven through the app
on a local build against those answers. Each sheet was read as a plan. The
likelihood is one reader's judgment on the scale of the earlier batches.
The sandbox cannot reach the deployed app.

## The ranking

### Plans (21): something should be drawn

| # | Parcel | Target | On the sheet | Cohort | Likelihood | Read |
|---|---|---|---|---|---|---|
| 1 | 2327 Granny Wright Ln · RS80 · 4.86 ac (666864) | 2 lots, no public street | 2 estate lots (1 flag) | pass | **85** | An 82,400-SF front lot and a 3-ac flag lot with its pole on the north line. Right. |
| 2 | 0 Pawnee Trl · RS15 · 1.95 ac (675289) | 4–5 lots | 5 frontage lots | pass | **80** | Five equal 17,053-SF lots along the curve. Exactly what gets platted. |
| 3 | 0 Gun Club Rd · RS40 · 2.0 ac (671253) | 2 lots, no public street | 2 estate lots | pass | **75** | Two 43,570-SF lots, each 100 ft wide. Right. |
| 4 | 0 River Road Pike · R80 · 26.23 ac (678315) | 2–4 lots, no public street | 3 estate lots | pass | **65** | Two 2-ac lots and a 22-ac lot, all three houses at the road. The engine joined a lot whose house sat across the hillside to its neighbour, which is the right call. |
| 5 | 290 Forrest Valley Cir · R15 · 6.33 ac (566991) | 8–12 lots | 10 lots on a shared drive | pass | **65** | Ten lots either side of a 751-ft lane to a turnaround. The only way in is a lane and this is a sound one. |
| 6 | 0 Whites Creek Pike · R10 · 10.04 ac (677449) | 17–26 lots | 17 lots on one street | pass | **60** | A clean spine with lots both sides, entering across 175 ft of wetland buffer. The north two acres are unused; a second short court adds four to six. |
| 7 | 0 Smith Springs Rd · RS10 · 3.19 ac (676299) | 7–10 lots | 8 lots on a shared drive | pass | **55** | Eight lots round a private lane and turnaround (the default was 7 on a public street with three connections). A public court is likelier at eight small lots; three green remnants. |
| 8 | 3600 Abbott Martin Rd · R20 · 3.03 ac (612443) | 4–6 lots | 4 estate lots (2 flag) | pass | **55** | Two front lots and two 45,000-SF flag lots whose rear halves sit empty. Buildable, and one or two lots light for land at this price. |
| 9 | 5215 Blue Hole Rd · RM15 · 3.79 ac (309819) | 40–57 homes | 56 apartments | pass | **55** | Three buildings, a clubhouse and a pool court on the west two-thirds; 135 stalls drawn against 73 in the summary. The 44 townhomes pass every test and are one tap away. |
| 10 | 2855 Old Hickory Blvd · RS20 · 13.55 ac (679942) | 1–5 lots, no public street | 1 lot, the parcel | pass | **50** | One house on the knoll with a 1,091-ft driveway through the held hillside. Defensible; a developer would test a lane for three to five. |
| 11 | 0 Dickerson Pike · RS7.5 · 19.82 ac (677102) | 50–75 lots | 45 lots on one street | miss | **45** | One 1,798-ft spine and a spur; 39% of the site unassigned. The 62-lot loop fails grade and is replaced. Passing, and 15 lots short of what the land holds. |
| 12 | 0 Lebanon Pike · RM20 · 11.42 ac (679218) | 150–228 homes | 228 apartments | pass | **45** | Six buildings packed into the north third; the bays hold 551 stalls where the summary says 113. The by-right side calls this parcel landlocked: its 1,329 ft on Lebanon Pike is typed "open edge". |
| 13 | 0 Old Clarksville Pike · RS40 · 29.06 ac (679197) | 16–24 lots | 17 lots (neighborhood) | pass | **45** | Seventeen lots on two streets that converge to a sliver, 17% right-of-way, two interior lots of 1.4 and 2.1 ac. A single spine or a loop takes 19-22 with less street. |
| 14 | 0 Currey Rd · RS10 · 1.72 ac (675439) | 3–5 lots, no public street | 2 frontage lots | miss | **40** | A 10,618-SF front lot and a 62,655-SF remainder the engine itself calls a holding answer. A drive down one side serves four or five. |
| 15 | 0 Woodland Hills Dr · RM6 · 2.1 ac (678903) | 8–12 homes | 10 apartments | pass | **40** | One small building and 18 stalls on a 15% slope. The by-right side says the street touch is 16 ft; the frontage record says 108 ft. |
| 16 | 0 Hunters Ln · R20 · 5.42 ac (678549) | 6–9 lots, no public street | 4 estate lots (2 flag) | miss | **35** | Two front lots and two 2.2-ac flag lots. The engine says 3.45 ac is "a holding answer"; the lane that would lot it returns nothing. |
| 17 | 0 Kidd Rd · RM9 · 5.38 ac (672188) | 30–48 homes, attached | 41 apartments | miss | **35** | One bar at the east end and a parking lot 600 ft away. The townhome run places 48 and fails three tests. The by-right side says landlocked; the frontage record says 1,590 ft. |
| 18 | 3028 Gwynnwood Dr · RM9 · 2.07 ac (663910) | 4–10 homes | 10 apartments | pass | **35** | Ten apartments on the triangle at the east end of a 1,400-ft sliver. The by-right side holds the whole parcel as one 70,257-SF lot. |
| 19 | 2825 Knight Dr · RS7.5 · 7.0 ac (664765) | 20–30 lots | 17 lots on a loop (fails grade) | miss | **30** | A ring road with two island lots and three leftover greens; 13.6% over 500 ft; 22% of the site in right-of-way. Not withdrawn, not passing. |
| 20 | 1055 Old Dickerson Pike · R20 · 19.13 ac (332543) | 8–16 lots | 15 lots on a single-loaded street (fails 2 tests) | miss | **20** | One 1,431-ft street with lots on one side only, 45% of the site unassigned, 536 ft in the buffer; fails dead end and block length, and its 24% station is not tested at all. A passing 7-lot lane sits unused in the competition. |
| 21 | 428 Old Lebanon Dirt Rd · RM2-NS · 4.88 ac (664926) | 6–9 homes, attached | 9 apartments, 235 stalls | miss | **5** | Nine apartments and a 235-stall parking field: 26 stalls a unit. RM2-NS has no standards row, so the by-right and townhome sides are skipped and only this is offered. |

### Refusals (19): nothing new belongs

| # | Parcel | Target | On the sheet | Cohort | Likelihood | Read |
|---|---|---|---|---|---|---|
| 1 | 0 Robinson Rd · R10 · 31.37 ac (680782) | nothing new | skipped: floodplain | pass | **90** | Right. |
| 2 | 0 Brick Church Pike · RS80 · 17.49 ac (677633) | nothing new | 0 lots, landlocked | pass | **85** | Right. |
| 3 | 0 Clarksville Pike · RS40 · 5.52 ac (679669) | nothing new | 0 lots | pass | **85** | Right, with the reason. |
| 4 | 0 Dry Fork Rd · RS15 · 3.01 ac (677554) | nothing new | 1 lot, the parcel | pass | **85** | One house out of the flood area. |
| 5 | 0 Mansker Dr · R20 · 9.72 ac (680044) | nothing new | 1 lot, the parcel | pass | **85** | One house on the 0.6 ac out of the flood area. |
| 6 | 1418 Campbell Rd · RS80 · 21.33 ac (680449) | nothing new | 0 lots, landlocked | pass | **85** | Right. |
| 7 | 9147 Old Charlotte Pike · R80 · 1.99 ac (663221) | nothing new | 1 lot, the parcel | pass | **85** | One house on the lot of record. |
| 8 | 0 Hitt Ln · R20 · 26.08 ac (678961) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 9 | 0 Hydes Ferry Rd · RS15 · 1.16 ac (680272) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 10 | 0 Larkin Springs Rd · RS10 · 3.14 ac (679300) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 11 | 0 Massman Dr · RS10 · 1.05 ac (674703) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 12 | 0 Whites Creek Pike · RS20 · 9.73 ac (678224) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 13 | 2716 Jones Ave · RS10 · 1.01 ac (474699) | nothing new | 1 lot, the parcel | pass | **80** | One house with a 182-ft driveway; the strip is too narrow to split. |
| 14 | 331 Old Hickory Blvd · RS20 · 2.96 ac (677861) | nothing new | 0 lots | pass | **75** | Right. One house on the half acre is the most anyone gets. |
| 15 | 0 Old Hickory Blvd · RM4 · 2.0 ac (672657) | nothing new | nothing drawn | pass | **70** | Nothing drawn. The stated reason ("multi family is not permitted as-of-right") is wrong for RM4; the land is landlocked and too narrow. |
| 16 | 3630 Trail Hollow Ln · RS20 · 9.68 ac (406289) | nothing new | 0 lots, landlocked | pass | **70** | Right not to subdivide; one house by the lane is what the address implies. |
| 17 | 0 Trail Hollow Ln · RS20 · 10.34 ac (678361) | nothing new | 0 lots, landlocked | pass | **65** | Right not to subdivide. The frontage record counts 605 ft of that edge as frontage; the plan says no mapped street. One of them is wrong. |
| 18 | 803 B Woodland Way · R15 · 2.46 ac (669278) | nothing new | 0 lots, "landlocked" | pass | **55** | Right to draw no subdivision. The reason is off: the parcel touches Woodland Way for 19 ft and carries a "B" address, so one house by the existing access is the answer, not "no edge touches a mapped street". |
| 19 | 0 Hicks Rd · RM4 · 2.12 ac (677274) | nothing new | 8 apartments | miss | **5** | The by-right side refuses; the multifamily run draws 8 units and 64-85 stalls. |

## The sheets

What a civil would draw:

| | |
|---|---|
| ![675289](675289.png) 0 Pawnee Trl: five equal frontage lots | ![666864](666864.png) 2327 Granny Wright Ln: a front lot and a flag lot on RS80 |
| ![671253](671253.png) 0 Gun Club Rd: two one-acre lots | ![566991](566991.png) 290 Forrest Valley Cir: ten lots on a lane behind a 36-ft frontage |
| ![677449](677449.png) 0 Whites Creek Pike: 17 lots on one street | ![678315](678315.png) 0 River Road Pike: three houses at the road, the mountain in one lot |

In range, with yield or layout left on the table:

| | |
|---|---|
| ![612443](612443.png) 3600 Abbott Martin Rd: flag lots with their rear halves empty | ![676299](676299.png) 0 Smith Springs Rd: eight lots round a private turnaround |
| ![679197](679197.png) 0 Old Clarksville Pike: two streets that meet in a sliver | ![679942](679942.png) 2855 Old Hickory Blvd: one house on a 4.6-ac knoll |

The misses:

| | |
|---|---|
| ![675439](675439.png) 0 Currey Rd: a 62,655-SF remainder on a strip that takes a lane | ![678549](678549.png) 0 Hunters Ln: two 2.2-ac flag lots, 3.45 ac "a holding answer" |
| ![677102](677102.png) 0 Dickerson Pike: 45 lots, 39% of the site unassigned | ![664765](664765.png) 2825 Knight Dr: a ring road that fails grade |
| ![332543](332543.png) 1055 Old Dickerson Pike: a single-loaded street failing two tests | |

Multifamily:

| | |
|---|---|
| ![309819](309819.png) 5215 Blue Hole Rd: 56 apartments; 44 townhomes pass every test | ![679218](679218.png) 0 Lebanon Pike: 228 apartments on a parcel the by-right side calls landlocked |
| ![672188](672188.png) 0 Kidd Rd: one bar and a parking lot 600 ft away | ![664926](664926.png) 428 Old Lebanon Dirt Rd: nine apartments, 235 stalls |
| ![677274](677274.png) 0 Hicks Rd: eight apartments on landlocked hillside | |

## What this batch says

- **Access decides a third of random vacant land**, and the records
  disagree on five parcels: two RM parcels on public roads are called
  landlocked by the by-right side while the frontage record gives them
  over 1,400 ft.
- **Small parcels are right.** Frontage lots, estate lots, one house on a
  flood or hillside lot. All three plan sheets at 75 or better are parcels
  under 5 ac.
- **Deep narrow strips are not** (Currey Rd, Hunters Ln). The engine says
  itself that the back land is "a holding answer".
- **Tracts of 7 to 30 ac pass the count more often than they read well.**
  One spine and nothing behind it, or a failing street left on the sheet.
- **Multifamily is unchanged** and is now 10 of the 27 misses.

## What changed in the repository

- `scripts/engine-cohort/cohort.json`: the 40 added as batch 5 with their
  targets (110 parcels); 0 Longwood Pl moved to a refusal.
- `scripts/engine-cohort/score.mjs`: on RM land, a by-right side skipped
  for a reason other than the flood hazard area leaves the apartments on
  the sheet, as the app does. The g16 and g17 runs score the same.
- `scripts/engine-cohort/runs/2026-11-10_g18.json`: all 110.
- No app code changed in this run.

## Files

- `ENGINE_HANDOFF.md`: the handoff for the engine side.
- `ranking.json`: the 40 with target, sheet, likelihood, read, frontage.

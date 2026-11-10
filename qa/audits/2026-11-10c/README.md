# Forty new parcels (batch 5) · engines g18 and g19 · 2026-11-10

Eric: "Run 40 new parcels." Forty parcels the engine had not been measured
on, drawn at random by the recipe of batches 1 to 4, run through the live
engine and the app, each sheet read and ranked by how likely a civil
engineer and a developer would arrive at the same answer.

The engine moved twice while this was done. The 40 were first harvested and
read on g18. The engine side's g18 note then arrived, and by the time it
was checked g19 had shipped (21:30 UTC), already acting on this batch's
handoff. Everything was harvested again on g19 and the sixteen sheets that
changed were driven and read again. Both are reported.

- [ENGINE_HANDOFF.md](ENGINE_HANDOFF.md): the batch-5 handoff, written on g18.
- [APP_REPLY.md](APP_REPLY.md): the reply to the engine's g18 note, the read
  of g19, and the asks that stand now. **Start there.**

## The number

| | g18 | g19 |
|---|---|---|
| Plans, the 40 new parcels | 14 of 21 | **16 of 21** |
| Refusals, the 40 new parcels | 18 of 19 | 18 of 19 |
| Plans, the original 70 | 23 of 39 | 23 of 39 |
| Refusals, the original 70 | 28 of 31 | 28 of 31 |
| Plans, all 110 | 37 of 60 | **39 of 60** |
| Refusals, all 110 | 46 of 50 | 46 of 50 |
| Mean likelihood, plans, new 40 | 48.6 | **51.9** |
| Mean likelihood, refusals, new 40 | 74.7 | 76.1 |
| Plans at 60 or better, new 40 | 6 of 21 | 8 of 21 |

On parcels it had never seen, the engine passed two plans in three at g18
and three in four at g19, and nearly every refusal: better than on the 70
it was tuned against. The improvement in run 3 was not fitted to the
cohort. The original 70 were scored on both engines and not re-read, so
they carry no likelihood here.

One cohort target changed: 0 Longwood Pl is a refusal. It is a co-op's
common land and the engine now says so; the run-3 handoff said the target
would move when it did.

## The draw

Vacant parcels (`usedesc` beginning "VACANT"), R / RS or RM zoning, land
value of $5,000 or more, ordered by `md5(ogc_fid || ':batch5')`. Every id
used in an earlier batch or the battery is excluded (98 ids), as are the
usual non-site owners by name. Eight per size band for R / RS (1–2.5,
2.5–6, 6–15, 15–60 ac) and eight RM (1.5–12 ac). The first eight in each
band were taken, skipping one owners-in-common parcel in the smallest band,
and in RM seven common-area or HOA parcels and one church.

It is a hard draw for access: at g18, 15 of the 40 came back landlocked or
skipped for access, 10 of them on every record.

Terrain was fetched for all 40 before any plan was drawn.

## How it was read

Live answers harvested through SQL as the functions the app calls, then
driven through the app on a local build against those answers. Each sheet
was read as a plan. The likelihood is one reader's judgment on the scale of
the earlier batches. The sandbox cannot reach the deployed app.

## The ranking (g19)

A likelihood shown as "a → **b**" changed between g18 and g19.

### Plans (21): something should be drawn

| # | Parcel | Target | On the sheet (g19) | Cohort | Likelihood | Read |
|---|---|---|---|---|---|---|
| 1 | 2327 Granny Wright Ln · RS80 · 4.86 ac (666864) | 2 lots, no public street | 2 estate lots (1 flag) | pass | **85** | An 82,400-SF front lot and a 3-ac flag lot with its pole on the north line. Right. |
| 2 | 0 Pawnee Trl · RS15 · 1.95 ac (675289) | 4–5 lots | 5 frontage lots | pass | **80** | Five equal 17,053-SF lots along the curve. Exactly what gets platted. |
| 3 | 0 Gun Club Rd · RS40 · 2.0 ac (671253) | 2 lots, no public street | 2 estate lots | pass | **75** | Two 43,570-SF lots, each 100 ft wide. Right. |
| 4 | 0 Hunters Ln · R20 · 5.42 ac (678549) | 6–9 lots, no public street | 9 lots on a one-sided lane | **pass (was miss)** | 35 → **70** | g19: nine 110 × 185 lots facing a 1,203-ft lane down the west line (was 4 with 3.45 ac held). Exactly the plan; over the engine's 750-ft flag. |
| 5 | 0 Currey Rd · RS10 · 1.72 ac (675439) | 3–5 lots, no public street | 4 lots on a one-sided lane | **pass (was miss)** | 40 → **65** | g19: four 100 × 100 lots facing a 507-ft lane along the north line (was 2 lots and a 62,655-SF remainder). The civil answer; the turnaround is large for four houses. |
| 6 | 0 River Road Pike · R80 · 26.23 ac (678315) | 2–4 lots, no public street | 3 estate lots | pass | **65** | Two 2-ac lots and a 22-ac lot, all three houses at the road. The engine joined a lot whose house sat across the hillside to its neighbour, which is the right call. |
| 7 | 290 Forrest Valley Cir · R15 · 6.33 ac (566991) | 8–12 lots | 10 lots on a shared drive | pass | **65** | Ten lots either side of a 751-ft lane to a turnaround. The only way in is a lane and this is a sound one. |
| 8 | 0 Whites Creek Pike · R10 · 10.04 ac (677449) | 17–26 lots | 17 lots on one street | pass | **60** | A clean spine with lots both sides, entering across 175 ft of wetland buffer. The north two acres are unused; a second short court adds four to six. |
| 9 | 0 Smith Springs Rd · RS10 · 3.19 ac (676299) | 7–10 lots | 8 lots on a shared drive | pass | **55** | Eight lots round a private lane and turnaround (the default was 7 on a public street with three connections). A public court is likelier at eight small lots; three green remnants. |
| 10 | 3600 Abbott Martin Rd · R20 · 3.03 ac (612443) | 4–6 lots | 4 estate lots (2 flag) | pass | **55** | Two front lots and two 45,000-SF flag lots whose rear halves sit empty. Buildable, and one or two lots light for land at this price. |
| 11 | 5215 Blue Hole Rd · RM15 · 3.79 ac (309819) | 40–57 homes | 56 apartments | pass | **55** | Three buildings, a clubhouse and a pool court on the west two-thirds; 135 stalls drawn against 73 in the summary. The 44 townhomes pass every test and are one tap away. |
| 12 | 2855 Old Hickory Blvd · RS20 · 13.55 ac (679942) | 1–5 lots, no public street | 1 lot, the parcel | pass | **50** | One house on the knoll with a 1,091-ft driveway through the held hillside. Defensible; a developer would test a lane for three to five. |
| 13 | 0 Dickerson Pike · RS7.5 · 19.82 ac (677102) | 50–75 lots | 45 lots on one street | miss | **45** | One 1,798-ft spine and a spur; 39% of the site unassigned. The 62-lot loop fails grade and is replaced. Passing, and 15 lots short of what the land holds. |
| 14 | 0 Lebanon Pike · RM20 · 11.42 ac (679218) | 150–228 homes | 228 apartments | pass | **45** | g19: the by-right side now gives one house by a private lane; the edge on Lebanon Pike is still not typed as a street. Six buildings in the north third; 551 stalls drawn against 113 in the summary. |
| 15 | 0 Old Clarksville Pike · RS40 · 29.06 ac (679197) | 16–24 lots | 17 lots (neighborhood) | pass | **45** | g19: the default is now a 7-lot lane where the 17-lot neighborhood row passes; the sheet still shows the 17. Two streets that converge to a sliver, 17% right-of-way. |
| 16 | 0 Woodland Hills Dr · RM6 · 2.1 ac (678903) | 8–12 homes | 10 apartments | pass | **40** | g19: the by-right side now gives one house ("touches Woodland Hills Dr for 31 ft"). One small building and 18 stalls on a 15% slope. |
| 17 | 0 Kidd Rd · RM9 · 5.38 ac (672188) | 30–48 homes, attached | 41 apartments | miss | **35** | g19: the frontage is recognised and the by-right side draws 24 lots (26 in the neighborhood row). The sheet is still one apartment bar with its parking 600 ft away; townhomes are the product. |
| 18 | 3028 Gwynnwood Dr · RM9 · 2.07 ac (663910) | 4–10 homes | 10 apartments | pass | **35** | Ten apartments on the triangle at the east end of a 1,400-ft sliver. The by-right side holds the whole parcel as one 70,257-SF lot. |
| 19 | 1055 Old Dickerson Pike · R20 · 19.13 ac (332543) | 8–16 lots | 7 lots on a shared drive | miss | 20 → **30** | g19: the failing 15-lot street is replaced. Three frontage lots, and a 705-ft lane with 603 ft on held land to four lots in a pocket of the hillside hold. Passes; a civil stops at the three. |
| 20 | 2825 Knight Dr · RS7.5 · 7.0 ac (664765) | 20–30 lots | 17 lots on a loop (fails grade) | miss | **30** | A ring road with two island lots and three leftover greens; 13.6% over 500 ft; 22% of the site in right-of-way. Not withdrawn, not passing. |
| 21 | 428 Old Lebanon Dirt Rd · RM2-NS · 4.88 ac (664926) | 6–9 homes, attached | 9 apartments, 235 stalls | miss | **5** | Nine apartments and a 235-stall parking field: 26 stalls a unit. RM2-NS has no standards row, so the by-right and townhome sides are skipped and only this is offered. |

### Refusals (19): nothing new belongs

| # | Parcel | Target | On the sheet (g19) | Cohort | Likelihood | Read |
|---|---|---|---|---|---|---|
| 1 | 0 Robinson Rd · R10 · 31.37 ac (680782) | nothing new | skipped: floodplain | pass | **90** | Right. |
| 2 | 0 Brick Church Pike · RS80 · 17.49 ac (677633) | nothing new | 0 lots, landlocked | pass | **85** | Right. |
| 3 | 0 Clarksville Pike · RS40 · 5.52 ac (679669) | nothing new | 0 lots | pass | **85** | Right, with the reason. |
| 4 | 0 Dry Fork Rd · RS15 · 3.01 ac (677554) | nothing new | 1 lot, the parcel | pass | **85** | One house out of the flood area. |
| 5 | 0 Mansker Dr · R20 · 9.72 ac (680044) | nothing new | 1 lot, the parcel | pass | **85** | One house on the 0.6 ac out of the flood area. |
| 6 | 1418 Campbell Rd · RS80 · 21.33 ac (680449) | nothing new | 1 lot, the parcel | pass | **85** | g19: one house by the existing access; 19.5 ac of hillside not planned. Right. |
| 7 | 9147 Old Charlotte Pike · R80 · 1.99 ac (663221) | nothing new | 1 lot, the parcel | pass | **85** | One house on the lot of record. |
| 8 | 0 Hitt Ln · R20 · 26.08 ac (678961) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 9 | 0 Hydes Ferry Rd · RS15 · 1.16 ac (680272) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 10 | 0 Larkin Springs Rd · RS10 · 3.14 ac (679300) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 11 | 0 Massman Dr · RS10 · 1.05 ac (674703) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 12 | 0 Whites Creek Pike · RS20 · 9.73 ac (678224) | nothing new | 0 lots, landlocked | pass | **80** | Right. |
| 13 | 2716 Jones Ave · RS10 · 1.01 ac (474699) | nothing new | 1 lot, the parcel | pass | **80** | One house with a 182-ft driveway; the strip is too narrow to split. |
| 14 | 331 Old Hickory Blvd · RS20 · 2.96 ac (677861) | nothing new | 0 lots | pass | **75** | Right. One house on the half acre is the most anyone gets. |
| 15 | 3630 Trail Hollow Ln · RS20 · 9.68 ac (406289) | nothing new | 1 lot, the parcel | pass | 70 → **75** | g19: one house by Trail Hollow Ln, a private lane. Right. |
| 16 | 0 Old Hickory Blvd · RM4 · 2.0 ac (672657) | nothing new | nothing drawn | pass | **70** | Nothing drawn. The stated reason ("multi family is not permitted as-of-right") is wrong for RM4; the land is landlocked and too narrow. |
| 17 | 0 Trail Hollow Ln · RS20 · 10.34 ac (678361) | nothing new | 1 lot, the parcel | pass | 65 → **70** | g19: one house by the private lane; 9.9 ac not planned. Right. |
| 18 | 803 B Woodland Way · R15 · 2.46 ac (669278) | nothing new | 1 lot, the parcel | pass | 55 → **70** | g19: one house by the existing access ("touches Woodland Way for 22 ft: room for a driveway, not for a street"). Right, with the right reason. |
| 19 | 0 Hicks Rd · RM4 · 2.12 ac (677274) | nothing new | 8 apartments | miss | **5** | g19: the by-right side gives one house by the existing access; the multifamily run still draws 8 units and 64-85 stalls. |

## The sheets

What a civil would draw:

| | |
|---|---|
| ![675289](675289.png) 0 Pawnee Trl: five equal frontage lots | ![666864](666864.png) 2327 Granny Wright Ln: a front lot and a flag lot on RS80 |
| ![671253](671253.png) 0 Gun Club Rd: two one-acre lots | ![566991](566991.png) 290 Forrest Valley Cir: ten lots on a lane behind a 36-ft frontage |
| ![677449](677449.png) 0 Whites Creek Pike: 17 lots on one street | ![678315](678315.png) 0 River Road Pike: three houses at the road, the mountain in one lot |

Fixed between g18 and g19 (g18 left, g19 right):

| | |
|---|---|
| ![675439](675439.png) 0 Currey Rd, g18: a 62,655-SF remainder | ![675439 g19](675439_g19.png) g19: four lots on a one-sided lane |
| ![678549](678549.png) 0 Hunters Ln, g18: two 2.2-ac flag lots | ![678549 g19](678549_g19.png) g19: nine lots on a one-sided lane |
| ![332543](332543.png) 1055 Old Dickerson Pike, g18: a single-loaded street failing two tests | ![332543 g19](332543_g19.png) g19: three frontage lots, and four at the end of a lane 86% on held land |

In range, with yield or layout left on the table:

| | |
|---|---|
| ![612443](612443.png) 3600 Abbott Martin Rd: flag lots with their rear halves empty | ![676299](676299.png) 0 Smith Springs Rd: eight lots round a private turnaround |
| ![679197](679197.png) 0 Old Clarksville Pike: two streets that meet in a sliver | ![679942](679942.png) 2855 Old Hickory Blvd: one house on a 4.6-ac knoll |

Still missing:

| | |
|---|---|
| ![677102](677102.png) 0 Dickerson Pike: 45 lots, 39% of the site unassigned | ![664765](664765.png) 2825 Knight Dr: a ring road that fails grade |

Multifamily (unchanged by either release):

| | |
|---|---|
| ![309819](309819.png) 5215 Blue Hole Rd: 56 apartments; 44 townhomes pass every test | ![679218](679218.png) 0 Lebanon Pike: 228 apartments on a parcel the by-right side gives one house |
| ![672188](672188.png) 0 Kidd Rd: one bar and a parking lot 600 ft away | ![664926](664926.png) 428 Old Lebanon Dirt Rd: nine apartments, 235 stalls |
| ![677274](677274.png) 0 Hicks Rd: eight apartments on landlocked hillside | |

The app after this run:

| | |
|---|---|
| ![678964](678964_holding_answer.png) 0 Brittany Park Dr: "11.7 ac inside 7 oversized lots is not planned", on a plan the overlap gate had been rejecting whole | ![669278](669278_g19.png) 803 B Woodland Way: one house by the existing access |

## What this batch says

- **Access decides a third of random vacant land.** At g18 the records
  disagreed on five parcels; g19 types the access, gives one house where a
  driveway or a private lane reaches the parcel, and recognises Kidd Rd's
  frontage. 0 Lebanon Pike is still an open question.
- **Small parcels are right.** Frontage lots, estate lots, one house on a
  flood or hillside lot.
- **Deep narrow strips are fixed at g19.** The one-sided lane is the plan a
  civil draws on Currey Rd and Hunters Ln.
- **Tracts of 7 to 30 ac pass the count more often than they read well.**
  One spine and nothing behind it, or a lane across held land.
- **Multifamily is unchanged** and is 10 of the 25 misses at g19.

## What changed in the app

Found while answering the engine's g18 note. All covered by tests.

- **A figure is not a failed check.** g18 sends `access.lane_on_held_land`
  with `pass: false` and keeps it out of `fails`. With an empty fail list
  the app counted every `pass: false` row, so a clean plan read "1 of 16
  checks fail". The engine's list is the list whenever it is sent.
- **The holding answer is on the sheet.** `remainder_ac` from an acre up:
  a line in the panel and the header chip "All 15 checks pass · 11.7 ac
  not planned" in amber.
- **The overlap gate no longer discards whole plans for nothing.** It had
  rejected 0 Hart Ln's 51 lots (a library failure on near-duplicate points,
  read as a 2 m² overlap) and 0 Brittany Park Dr's 13 (two driveways
  sharing 7 m²). It now re-measures after cleaning the rings, and doubled
  driveways are drawn as one apron. Every default and best plan in the
  g16, g17 and g18 answers passes.
- Lane and easement widths come from the engine when it sends them.
- The held-out percentage can no longer read over 100% where holds overlap.

## What changed in the repository

- `scripts/engine-cohort/cohort.json`: the 40 added as batch 5 with their
  targets (110 parcels); 0 Longwood Pl moved to a refusal.
- `scripts/engine-cohort/score.mjs`: on RM land, a by-right side skipped
  for a reason other than the flood hazard area leaves the apartments on
  the sheet, as the app does; competition rows' `drive_ft` is read.
- `scripts/engine-cohort/runs/2026-11-10_g18.json` and `_g19.json`: all 110.

## For the owner

- Five cohort targets look too high once the terrain is measured (Hitt Ln,
  8282 Charlotte Pike, Newsom Station, Campbell Rd, Old Hickory Blvd R15).
  The proposal and its effect on the number are in APP_REPLY.md §4. Not
  applied.
- Still open: the Metro limits on a shared private drive, the lane grade,
  whether the district minimum is gross lot area, 7963 Charlotte Pike.

## Files

- `APP_REPLY.md`, `ENGINE_HANDOFF.md`.
- `ranking.json`: the 40 with target, sheet, likelihood at g18 and g19, read.

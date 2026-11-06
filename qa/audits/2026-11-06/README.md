# Twenty lots, ranked by how likely a civil engineer or developer lands on the same layout — 2026-11-06

Eric: "Run 20 more lots, give detailed feedback on each one, rank them based on
the likelihood that a civil engineer or developer would land on that layout."

## The draw

- **16 by-right lots:** vacant R / RS parcels of 1–60 ac, four per size band
  (1–2.5, 2.5–6, 6–15, 15–60 ac), by a fixed hash. The 40 lots already used and
  the non-sites are excluded.
- **4 RM lots** (1.5–8 ac), to exercise the new layout choice (multifamily
  against neighborhood).

The draw turned up two non-sites the filter missed: townhome associations
written "Owners Assoc." and "Assn." (skipped). One by-right pick is owned by a
conservation nonprofit (0 Larkin Springs Rd); I kept it and note it below.

**An outage shaped the run.** The USGS elevation service (3DEP) answered
502 / 504 for most of the session. Without terrain the engine:
- fails `storm.low_point` ("no topo for this parcel");
- skips the street-grade test;
- waits out each USGS timeout, so plans took 20–40 s and some competitions ran
  past the database's limit.

I retried the elevation fetch until every lot that needs terrain had it, then
re-ran those plans. **All 20 are graded with terrain** (0 Larkin Springs Rd is
a floodplain skip that doesn't need it). The first-call timings are inflated
by the outage, so the timings below are warm.

## The ranking

"Likelihood" means: a competent civil engineer or developer, given the same
parcel, lands on substantially the same answer. That means the same product,
a yield within about 20%, and the same street concept. It scores the answer
the app puts on the sheet by default. Where the right answer is "no new lots"
or "one house", an app that says so scores high.

| # | Lot | What the app shows by default | Likelihood | Why |
|---|---|---|---|---|
| 1 | 6211 Brownlee Dr (RS40, 1.2 ac) | No new lots; offers the one house | **90%** | 53,600 SF can't make two 40,000-SF lots. Exactly right. |
| 2 | 3730 Homeland Dr (RS40, 1.6 ac) | No new lots; offers the one house | **85%** | A 28%-slope strip, 181 ft of fall: one house, at most. |
| 3 | 5014 Buena Vista Pike (RS15, 1.1 ac) | Skipped: floodplain | **85%** | In the floodway; even the fill scenario finds nothing. Right. |
| 4 | 0 Larkin Springs Rd (RS10, 23 ac) | Skipped: floodplain | **80%** | Conservation land in the floodplain. Right answer, but it shouldn't be in the pool. |
| 5 | **6247 Mt View Rd (RS10, 6.9 ac)** | **15 lots on a T street**, all tests pass | **70%** | The one real subdivision a civil could have drawn (below). |
| 6 | 0 Gulch St (RS7.5, 2.4 ac) | Skipped: floodplain | **70%** | Entirely in the SFHA. The fill scenario gives 8 lots on 12,124 cy of fill that cannot be balanced on site. |
| 7 | 415 Eagle Rdg (R15, 2.9 ac) | 1 frontage lot; "1 test fail" | **65%** | One house on a 21% hillside is right. The "fail" is 2.45 ac of unbuildable slope counted as "unassigned". |
| 8 | 0 Hickory Bend Dr (RS10, 5.3 ac) | Skipped: floodplain (Zone A, no BFE) | **60%** | Right by right: a flood study (LOMR) comes first. The fill scenario's 9 lots are the "after". |
| 9 | 0 Swiss Ave (RM15, 4.1 ac) | 36 townhomes on a street (the neighborhood) | **55%** | A plausible product on an 18% slope. It got here only because the 60-unit apartment plan was rejected over a 14-SF overlap. |
| 10 | 0 Stewarts Ferry Pike (RS15, 3.3 ac) | 4 lots on a 433-ft public street | **50%** | The yield is right (the arithmetic says 5). A public street with a stub, for 4 lots, is heavier than most would build. |
| 11 | 1430 Neelys Bend Rd (RS80, 8.4 ac) | No new lots (7.2 ac in the flood hold) | **50%** | Defensible by right. But under the fill scenario 7.7 ac is buildable and it still draws 0: the estate-lot gap. |
| 12 | 0 Poplar Creek Rd (RS15, 2.5 ac) | 4 lots on a 414-ft through street | **40%** | Passes every test (9.6% street grade), but a through public street across a 16% slope for 4 lots is unlikely; a private drive is likelier. |
| 13 | 0 Hart Ln (R10, 35 ac) | 89 lots on a loop with 2 cross streets | **40%** | A conventional pattern, drawn as if flat: the streets reach 25.4%, with 2,600 ft over the 10% limit. A civil would follow the contours for maybe 60–75 lots. |
| 14 | 0 Old Lebanon Dirt Rd (RM9, 4.9 ac) | 38 apartments in one 3-story S-form bar | **35%** | A sensible garden-apartment count, but the lot is landlocked ("access via easement assumed"). Access decides this one. |
| 15 | 0 Campbell Rd (RS80, 17.8 ac) | No new lots; the competition's 4 lots fail | **20%** | 17.8 ac of 27% slope. A developer tries 2–4 estate lots on a shared drive. The app says 0; its alternative needs 3,859 ft of street for 4 lots. |
| 16 | 0 Smith Springs Rd (RM6, 7.0 ac) | 42 apartments in one 3-story bar, 113 stalls | **20%** | The density allows 42, but on RM6 the product is townhomes or small lots. One 3-story bar at 2.7 stalls per unit on 7 ac is not what a developer builds. |
| 17 | 0 Westcap Rd (R15, 10.6 ac) | 13 lots on a T street | **20%** | A T street straight up a 20% slope (28.8% grade, 700 ft over the limit). A hillside civil follows the contours and loses lots. |
| 18 | 0 Union Hill Rd (RS40, 7.6 ac) | 3 lots on a 699-ft public cul-de-sac | **15%** | 700 ft of public street with a full bulb, crossing a wetland buffer, for 3 rural lots. The engine's own neighborhood row does it on 384 ft with no fails. |
| 19 | 0 Hickory Hollow Pkwy (RM20, 1.7 ac) | "Refused: fits a house" above a drawn 4-story, 9-unit building | **5%** | A 54-ft-wide landlocked strip. The page refuses apartments and draws them anyway, at a −28% margin. |
| 20 | 0 Dry Fork Rd (RS40, 31 ac) | 16 lots on a loop | **5%** | Mountain land: 37% average slope, 305 ft of fall. The loop needs 63% street grades, and 7.6 ac is left unassigned. |

**The headline.** Ten of the twenty answers are "no new lots", "one house" or
"skipped", and nine of those ten are right. The app is good at saying no.

Of the ten lots where it drew an actual layout, **one** (6247 Mt View Rd) is
one a civil engineer would plausibly land on as drawn. Three more have
roughly the right yield with a heavier street than a pro would build
(Stewarts Ferry, Poplar Creek, Swiss Ave). The other six fail on one of:
- terrain (Hart Ln, Westcap, Dry Fork);
- the estate grammar (Union Hill);
- access (Old Lebanon, Hickory Hollow);
- product fit (Smith Springs).

The same three failure modes have now appeared in four batches running: the
engine ignores terrain in its street layout, estate districts lack a flag-lot
or shared-drive grammar, and nothing checks for access.

## Lot by lot

### 1 · 6211 Brownlee Dr (424990) — RS40, 1.23 ac, appraised $2.49 M
- Flat (3.3%), no flood. **0 new lots by right**: a 40,000-SF lot is 140 × 290 ft
  and there is room for one. The panel offers "Draw the one house it carries".
- Right answer, clearly put.
- The appraisal ($2.49 M on "vacant residential land") suggests a house may
  already stand there. Worth a data check.
- *Fixed in the app:* the empty sheet's legend listed "Studio · 550 SF …"
  beside nothing; an empty sheet now keys no dwellings.

### 2 · 3730 Homeland Dr (667183) — RS40, 1.64 ac
- A narrow strip: 28% average slope (62% max), 181 ft of fall. 0 new lots, and
  the steep-ground banner leads the panel.
- The one-house offer is right. A civil would add that even one house here is
  a hillside-grading job.
- The first elevation fetch for this lot failed (502). Its first plan ran
  without terrain; the answer was the same.

### 3 · 5014 Buena Vista Pike (661271) — RS15, 1.1 ac
- "Skipped — floodplain leaves no buildable piece." The fill scenario (hold out
  only the floodway) still finds nothing, because the lot is in the floodway.
- Right. The sheet shows no flood layer: the engine returns no hold geometry
  for a skipped parcel, so the reason is in words only.

### 4 · 0 Larkin Springs Rd (680721) — RS10, 23 ac, Cumberland River Compact
- Skipped (floodplain). The owner is a river-conservation nonprofit, so this
  is almost certainly protected land.
- Right answer, wrong candidate: conservation owners (compact, conservancy,
  land trust) belong with associations, co-ops and public owners in the
  non-site filter.

### 5 · 6247 Mt View Rd (666092) — RS10, 6.9 ac — the best layout of the twenty
- **15 lots @ 70 × 145 ft on a T street**: 1,076 ft of street, 3 connections,
  0 dead ends, a pond at the low point, 17% right-of-way, 2.17 du/ac.
- Every test passes. The street grade passes at 11.6% for 100 ft, inside the
  engine's allowance. The 62% net-to-gross arithmetic says 18.
- **What a civil would change:**
  - Some pads sit skewed to their lot lines.
  - Two "estate" lots absorb the leftover corners.
  - The crossbar of the T sits close to the boundary.
  - They would also work the 9% slope with the grading the engine doesn't do
    yet.
- The yield, the street concept and the stormwater are all believable.

### 6 · 0 Gulch St (680528) — RS7.5, 2.45 ac
- Entirely in the SFHA: skipped by right.
- **Fill scenario: 8 frontage lots**, but 12,124 cy of fill (median pad fill
  9 ft, 3 lots over 10 ft). The compensating cut would average 131 ft deep
  across the open floodplain, so the cut/fill balance "does not close on site".
- The skip is right. The fill scenario honestly says it doesn't work. A
  developer would walk away.

### 7 · 415 Eagle Rdg (692658) — R15, 2.86 ac
- A wooded hillside behind the houses on Eagle Ridge: 21% slope, 132 ft of
  fall. **1 frontage lot, no new street.**
- The answer (one house) is what a civil gives. But the KPI chip reads "1 test
  fail", because 2.45 ac of slope too steep to reach counts as "unassigned".
- On a one-lot hillside answer that "fail" is noise. Unassigned land on a
  steep parcel should read as natural or held land, not a failed test.

### 8 · 0 Hickory Bend Dr (672526) — RS10, 5.3 ac, flat
- Skipped: floodplain, Zone A with **no BFE within 6,000 ft**. The panel offers
  the one house and the fill scenario.
- **Fill scenario: 9 lots on a T street**, but with no BFE the earthwork can't
  be priced.
- A civil says: a flood study (LOMR) comes first, and then 15+ RS10 lots may
  be possible on 5 flat acres. The skip is right; the 9 is the engine's
  floor, not the land's.

### 9 · 0 Swiss Ave (679911) — RM15, 4.06 ac, 18% slope
- The **apartment plan is rejected**: one of its amenity buildings overlaps the
  drive by 1.3 m² (14 SF), just over the 1 m² gate. The app re-solves with
  another seed, but this generator (`mf_max_gsf_v1`) ignores the seed and
  returns the same plan, so the re-solve can't help.
- With apartments failed, the **neighborhood (36 townhomes on a street) takes
  the sheet**: 892 ft of street, 2 alleys, every required test passing,
  guest parking 10 of 9.
- Townhomes stepping down an 18% slope are a believable product here. The
  townhomes' street passes the grade where the grid's and neighborhood's fail.
- But the layout won by an overlap of 14 SF. Had the apartments drawn, they
  (60 units) would have been the default.

### 10 · 0 Stewarts Ferry Pike (679617) — RS15, 3.3 ac
- **4 lots (2 standard, 2 estate) on a 433-ft public street** with a stub to
  the neighbour. 108 ft of street per lot against a 128-ft limit, flat
  (4.8%), every test passes. The arithmetic says 5.
- A civil would likely serve 4–5 lots off a short private drive or a
  cul-de-sac without the stub. The two estate lots soak up the triangle's
  tail.
- The first plan ran without terrain and "failed" the storm test. With
  terrain it passes.

### 11 · 1430 Neelys Bend Rd (395417) — RS80, 8.4 ac
- 7.16 ac in the flood hold, 1.8 ac buildable: **0 lots** (an 80,000-SF lot
  doesn't fit).
- **Under the fill scenario 7.74 ac is buildable and it still draws 0**:
  "no lot of 80000 sf (270 × 300 ft) fits on the frontage or beside a new
  street". A civil would get 2–3 RS80 lots with fill, or 1–2 off a shared
  drive.
- The estate-lot gap again: RS80 needs a flag-lot / shared-drive grammar.

### 12 · 0 Poplar Creek Rd (677645) — RS15, 2.5 ac, 16% slope
- **4 lots on a 414-ft single street** running through the site, with a pond
  at the low point (one lot gave way to it). The street grade passes at 9.6%,
  every test passes.
- The first call took 21.4 s, waiting on USGS. Warm, it's under a second.
- On a 16% hillside a civil would serve 3–4 lots from a short private drive
  at the top, not a public street through the slope to a stub on the south
  line.

### 13 · 0 Hart Ln (680596) — R10, 35.4 ac, owned by an LLC
- **89 lots @ 70 × 145 on a loop with 2 cross streets**: 5,488 ft of street,
  a pond at the low point, 2.5 du/ac. Without terrain it drew 90 and passed
  everything.
- With terrain: 17% average slope, 208 ft of fall, **street grade 25.4%** with
  2,600 ft over the limit. The competition: every pattern fails the grade.
- The pattern is a textbook suburban subdivision, which is why it reads
  well. A civil would bend it to the contours, give up the steep rim as open
  space and land at maybe 60–75 lots.

### 14 · 0 Old Lebanon Dirt Rd (679195) — RM9, 4.94 ac, landlocked
- **Apartments by default: 38 units** in one 3-story S-form bar, 68 / 66
  stalls, 100% of the 68,200-GSF envelope.
- The neighborhood's best is 10 grid lots ("the street is not paying for
  itself"). The townhome engine drew 28 homes, but they fail two dead-end
  tests.
- The yield and product are reasonable for RM9 (44 allowed), but **no street
  touches the lot**. The sheet says "access via easement assumed", and a
  developer can't assume that.

### 15 · 0 Campbell Rd (680202) — RS80, 17.8 ac, 27% slope
- **0 lots by right.** The competition's grid and neighborhood each draw
  4 lots on **3,859 ft of street** (965 ft per lot), failing dead end, block
  length and grade. The engine's verdict is shown in red.
- A developer with 17.8 ac of steep RS80 land tries 2–4 estate lots on a
  long private drive, or sells it as one estate. "0 new lots" undersells it;
  the 3,859-ft alternative is not a layout anyone would draw.
- The competition took 41 s because of USGS waits. Warm, it would be a few
  seconds.

### 16 · 0 Smith Springs Rd (670533) — RM6, 7.05 ac
- **Apartments by default: 42 units** in one 3-story bar with 113 stalls
  (2.7 per unit, against 73 required). That is 54% of the GSF envelope, but
  the density cap of 42 binds.
- The neighborhood's best is 26 grid lots, buildable as drawn. The townhome
  engine places 62 townhomes, which is over the cap of 42, and they fail
  `alley.street_to_street`.
- On RM6 land (6 du/ac) the market product is townhomes, duplexes or a cottage
  court at the cap. One 3-story apartment bar ringed by 113 stalls on 7 acres
  is not what a developer builds.
- **This lot exposed a bug in the layout choice, fixed below.** Before the fix
  the app read 0 apartments and put the 26 lots on the sheet.

### 17 · 0 Westcap Rd (679820) — R15, 10.5 ac, 20% slope
- **13 lots on a T street** (1,601 ft) with a cul-de-sac, a pond and a held
  wetland buffer. The street grade is 28.8%, with 700 ft over the limit.
- The competition's grid (14 lots) also fails the grade.
- Without terrain the plan never finished: it ran past 58 s waiting on USGS.
  With terrain it takes 0.9 s.
- A civil would run the street across the slope, not up it, and lose a few
  lots.

### 18 · 0 Union Hill Rd (680001) — RS40, 7.6 ac
- **3 lots on a 699-ft public cul-de-sac with a full bulb**, crossing 76 ft of
  wetland buffer at its entry. The cost test fails: 233 ft of street per lot
  against 210.
- **The engine's own competition has better plans:**
  - the neighborhood grammar draws the same 3 lots on 384 ft, with no fails;
  - the grid draws them on 320 ft.

  The app only puts the competition's best on the sheet when the default
  draws nothing, so the worse plan stays.
- A civil would never build 700 ft of public street through a wetland buffer
  for 3 rural lots. They'd use a shared drive or flag lots.

### 19 · 0 Hickory Hollow Pkwy (678148) — RM20, 1.71 ac, landlocked
- The page contradicts itself:
  - a yellow card: **"Refused: 54.0 ft max width < 67.3 ft required — envelope
    fits a house"**;
  - under it, a **drawn 4-story, 9-unit building** at 32% of the envelope, with
    a −28% margin.
- The neighborhood ties at 9: "frontage lots, no new street" on a lot with no
  frontage. The townhome engine's 17 homes fail two required tests.
- Nothing here is developable as drawn without access. A developer sells to
  the neighbour.

### 20 · 0 Dry Fork Rd (679540) — RS40, 31.2 ac
- Mountain land: **36.9% average slope, 76% max, 305 ft of fall.**
- **16 lots on a loop** whose streets need **63% grades** (2,400 ft over the
  limit), with 7.6 ac left unassigned and an 88-ft wetland-buffer crossing.
  The competition (17 lots) fails the same way.
- No one builds this. Realistically: 0–4 estate lots on a contour road, after
  a geotechnical study.

## Fixed in the app with this batch

1. **The layout choice could lose a drawn apartment plan.** The max-GSF
   generator (`mf_max_gsf_v1`) draws native structures like the seed but
   reports `gfa_sqft`, `units_est` and `stalls_required`. The seed mapper read
   only `gsf` and `units`, so the plan had no metrics:
   - no units, GSF or stalls on the KPI strip;
   - a headline missing its figures;
   - the layout panel reading "Multifamily —" and treating the plan as
     undrawn.

   On 0 Smith Springs Rd that put 26 lots on the sheet over 42 apartments.
   The mapper now reads both naming schemes. Separately, a multifamily plan
   that draws without a count is never treated as failed.
2. **The building label disagreed with the headline** ("37 units" on the bar
   under "42 apartments"). With no unit mix, the plan's own count is now
   shared across the buildings by GSF.
3. **The legend on an empty sheet** listed apartment unit types. It now keys
   no dwellings.

Swiss Ave's rejection (the 1.3 m² amenity / drive overlap) is the engine's
geometry. The app's re-solve can't help with a generator that ignores the
seed; logged below.

## Engine-side, in order of how often they decide the answer

1. **Terrain in the layout.** Streets ignore the ground: Dry Fork 63%,
   Westcap 28.8%, Hart Ln 25.4%. Four of twenty layouts are unbuildable as
   drawn for this reason alone.
2. **The estate grammar.** RS40 / RS80 parcels get 0 lots (Campbell Rd, Neelys
   Bend under fill) or 700 ft of public street for 3 lots (Union Hill). Flag
   lots and shared private drives are missing.
3. **Access.** Plans are drawn on landlocked RM lots (Old Lebanon Dirt Rd's
   apartments, Hickory Hollow's apartments and its "frontage lots"). On
   Hickory Hollow the refusal and the drawn plan contradict each other.
4. **A better plan stays in the drawer.** Union Hill's default is worse
   (699 ft, a cost fail) than its own neighborhood plan (384 ft, no fails) for
   the same 3 lots. Prefer the competition's best when it has the same lots
   and fewer fails or less street, not only when the default draws nothing.
5. **RM product fit.** On RM6, a single apartment bar over-parked at
   2.7 stalls per unit (Smith Springs). The townhome engine's alleys don't
   reach the street there.
6. **The max-GSF generator** ignores the seed, so the app's re-solve after a
   rejection returns the same plan (Swiss Ave).
7. **Skipped parcels** return no flood-hold geometry, so the sheet can't show
   why.
8. **USGS outages** make plans wait 20–40 s and grade them without terrain.
   Fail faster, or say "terrain unavailable" instead of failing the storm
   test.
9. **The pool:** add conservation owners (compact, conservancy, land trust)
   and "Assoc." / "Assn." associations to the non-site filter.

## Pictures

- `twenty_pages.png`: all twenty as the app shows them, ranked.
- `666092_mt_view_rd_best.png`: the best layout of the twenty.
- `680001_union_hill_cul_de_sac.png`: 700 ft of public street for 3 lots,
  through a wetland buffer.
- `679540_dry_fork_63pct.png`: a loop at 63% grade.
- `670533_smith_springs_fixed.png`: the apartments the layout choice used to
  lose.
- `679911_swiss_ave_townhomes.png`: the townhomes that took the sheet when the
  apartments failed the overlap check.
- `680596_hart_ln_terrain.png`: the 89-lot loop on 17% slopes.

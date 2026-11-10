# Engine handoff · cohort re-run on g16 · 2026-11-10

For the engine-side Claude working in Supabase project `okxrvetbzpoazrybhcqj`.
Written from the app side (emruss3/Optimizer). Everything below was measured
on the live engine at migration `20261109155542 sf_v1_civil_cohort` (g16),
which landed six minutes after the g15 baseline was taken. The crash in §2.1
was re-confirmed live on 2026-11-10 before this was written.

## 0. The short version

| | g15 (11-09) | g16 (11-10) | |
|---|---|---|---|
| Plans where a civil would draw one | 18 of 40 | **19 of 40** | +1 |
| Refusals where nothing belongs | 25 of 30 | **26 of 30** | +1 |
| Mean likelihood, plans judged in both runs (0–100) | 46.9 | 46.7 | flat |
| Mean likelihood, refusals judged in both runs | 67.4 | 65.6 | −1.8 (Dry Fork Rd) |
| Mean likelihood, all 40 plans / all 30 refusals | | **43.6 / 68.8** | first full read |
| Plans at 60 or better | | **11 of 40** | |

(51 of the 70 parcels carried a likelihood from the batch they were drawn
in; the other 19 were read for the first time in this run.)

g16 fixed two parcels, moved ten more without changing their verdict, broke
none by the scorer, and introduced one crash and one contract regression.
The count that has to move, plans, moved by one. The reason is unchanged
from the g15 handoff: **14 of the 21 plan misses are the land behind the
first tier**, and g16 did not touch that. §4 is that one ask, with what a
civil draws on each of the 14.

Do in this order:

1. Fix the division by zero on 668277 (§2.1). It is the only raised error in
   70 parcels and it replaces an answer with nothing.
2. Restore `best_requested` in `fn_sf_v1_candidates` (§2.2). It is null on
   all 70; the app's auto-best rule silently stopped until it was worked
   round on the app side.
3. The one ask: a shared private drive (or lane) into the land behind the
   frontage tier, as a first-class default answer (§4).
4. Stop the default from choosing a failing public street where the same
   competition holds a passing no-street answer (§3.2: Newsom Station,
   Homeland, Walker Ln).
5. Everything in §5–§7 after that, in the order given there.

## 1. How this was measured

- Cohort: `scripts/engine-cohort/cohort.json`, 70 parcels drawn at random in
  four audit batches (60 R/RS, 10 RM). 40 carry a `plan` target (a lot range,
  the product, whether a new public street belongs), 30 a `refuse` target.
- Harvest: for each parcel, `fn_sf_v1_plan_app`, `fn_sf_v1_candidates_app`,
  `fn_sf_v1_site_app`, topo, and on RM the multifamily and townhome runs,
  through SQL as the functions the app calls.
- Score: `scripts/engine-cohort/score.mjs`. The answer scored is what the app
  sheets by default: the by-right plan, replaced by the competition's best
  only when the best is buildable and draws at least as many lots. A plan
  passes when its lots are in range, it has no code fails, the product
  matches and it lays no public street where none belongs.
- Visual read: each of the 40 plan parcels and the changed refusals driven
  through the app (local build against the harvested live answers), the
  sheet screenshotted, and read as a plan: lot shapes, where the street
  goes, what it crosses, what is left over. The likelihood is one reader's
  judgment of "would a civil engineer and the best developer in town arrive
  at this answer", on the same scale as batches 1–4. Parcels whose answer
  did not change keep their earlier figure so only real changes move.
- Files: `scripts/engine-cohort/runs/2026-11-10_g16.json` (scoreboard, one
  row per parcel), `qa/audits/2026-11-10/README.md` (the ranked table of all
  70 and the sheets), `qa/audits/2026-11-10/ranking.json`.

## 2. Contract regressions (fix first)

### 2.1 `fn_sf_v1_plan` raises division by zero on 668277

```sql
select public.fn_sf_v1_plan_app(668277, '{}'::jsonb);
-- ERROR 22012: division by zero
-- PL/pgSQL function fn_sf_v1_strip(geometry,integer,double precision,double precision,
--   double precision,geometry,geometry,geometry,double precision,double precision,
--   double precision,double precision,jsonb) line 84 at IF
-- PL/pgSQL function fn_sf_v1_plan(integer,jsonb) line 845 at FOR over SELECT rows
```

8192 Charlotte Pike, R40, 31.63 ac, a creek-bottom strip under hillside.
g15 returned 2 lots on a 1,414-ft street (failing four tests).
`fn_sf_v1_candidates_app(668277, '{}')` still returns (grid 6 failing,
neighborhood 5 failing, loop 0, single 0, terrace failed, shared drive 6
failing), so the raise is on the default path only. Likely a zero-length or
zero-width strip reaching the `IF` at line 84 as a divisor (frontage length,
strip depth or module width). Guard the divisor and let the strip return no
lots. Please also wrap the per-strip loop at `fn_sf_v1_plan` line 845 so one
bad strip cannot take the whole plan: the contract is `status: 'error'` with
a `reason`, never a raise.

The app now shows this as "The by-right generator failed on this parcel:
division by zero. This is an engine error, not a finding about the land."
and substitutes nothing. Before this release it fell through to the legacy
generator.

### 2.2 `best_requested` is null on every competition

`fn_sf_v1_candidates` returns the key with a null value on all 70 parcels;
g15 filled it. The app's auto-best rule and the scorer both keyed on it, so
the sheet silently reverted to the default everywhere (0 Hills Ln fell from
the 17-lot grid to the 14-lot default with no message). The app now derives
it: the `done` row whose `pattern` and `lots` equal `best_pattern` and
`best_lots`, preferring `requested: 'loop'` when the default drew the same
thing. That is ambiguous whenever two grammars draw the same pattern and
count (0 Hessey Rd: `loop` and `single` both return "single street, 8"), so
please restore the field. Acceptance: non-null whenever `best_lots > 0`.

### 2.3 Failed rows

A grammar that cannot draw now returns `{status: 'failed', lots: 0, pattern:
null, error: '…', requested: 'terrace'}` with no `fails` and no `notes`
(12 of the 17 terrace rows in the cohort). That is fine and the app reads
it, but two things: the message for terrace reads "no hillside street could
be laid at the grade: frontage lots, no new street" on parcels where the
default is not frontage lots (0 Hessey Rd draws a cul-de-sac), and
`status: 'failed'` now means "this grammar does not apply here", not "the
function broke". If a raise inside one grammar is also caught into
`status: 'failed'`, give it a different status so the two can be told
apart.

## 3. What g16 changed, parcel by parcel

### 3.1 Fixed (2)

| Parcel | g15 | g16 | Read |
|---|---|---|---|
| 660683 · 605 Harpeth Ln · RS40 · 5.18 ac | 1 lot on a 744-ft public street at 17.7% | the parcel as one lot, house off the holds, 622-ft driveway | Right. 25 → 70. |
| 673175 · 0 Old Hickory Blvd · R40 · 3.21 ac | 2 lots on a street, `access.landlocked` failing | 0 lots, landlocked, with the reason | Right. 55 → 80. |

### 3.2 Changed, verdict the same (10)

| Parcel | g15 | g16 | Read |
|---|---|---|---|
| 679820 · 0 Westcap Rd · R15 · 10.6 ac | 8 lots on a T street at 27.2% | 6 frontage lots, no street, no fails | Better (25 → 55). Still a miss: target 8–14. Two of the six lots are double-size and the 357-ft bench behind them is unused. |
| 679830 · 0 Neelys Bend Rd · RS40 · 18.91 ac | 3 lots on 1,864 ft of public street | default "the parcel as one lot" with a 1,418-ft driveway; best = 2 lots on a 1,892-ft shared drive (sheeted) | Better in kind, worse in count. The bench at the end of the panhandle takes 3–4 at RS40. Target 3–10. |
| 676829 · 0 Walker Ln · RS20 · 5.5 ac | 2 lots, 890-ft street, passes code | 3 lots, 955-ft street, 3 connections, **fails grade** (11.6% over 200 ft) | Worse. The competition's "best" is now the parcel as one lot. A 500-ft cul-de-sac takes 5–7 here. |
| 675128 · 0 Newsom Station Rd · R80 · 27.25 ac | default = 4 estate lots, passes | default = 4 lots on a 744-ft street at **30.3%** over 300 ft, 540 ft of it in wetland buffer; best = the same 4 estate lots (sheeted by the app's same-lots rule) | The default regressed: it now prefers a failing street over the passing estate lots at the same count. |
| 673844 · 0 Old Hickory Blvd · RS20 · 5.27 ac | 4 lots on a 337-ft street, passes (16.7% over 100 ft) | default = the parcel as one lot (356-ft driveway); best = grid, 3 lots (sheeted) | Count still in range. The grid's lots reach across the flood hold and two house footprints nearly touch. 60 → 40. |
| 674961 · 0 Homeland Dr · RS40 · 9.02 ac | default 3 lots on 963 ft; best = 5 lots on a **shared drive** (sheeted) | default = best = 5 lots on a **1,378-ft public street**, 3 connections, 16.9% station, 155 ft in wetland buffer | Passes the scorer, reads worse. Five estate lots do not carry 1,378 ft of public street; the g15 shared drive was the developer's answer. The shared-drive row still draws 5; it is no longer chosen. |
| 666092 · 6247 Mt View Rd · RS10 · 6.9 ac | 15 lots on a T street, 3 connections, no fails | 16 lots on one 647-ft street, 1 connection, `open.unassigned` (20.9% open), 13.3% station | One more lot for a worse plan: the T is gone, the north half is unassigned wedges. 70 → 55. |
| 679617 · 0 Stewarts Ferry Pike · RS15 · 3.3 ac | 5 lots | 4 lots on a cul-de-sac, the fourth a 47,871-SF tail | Flat. |
| 667638 · 1014 Antioch Pike · R8 · 2.8 ac | 7 lots | 8 lots on a cul-de-sac | Slightly better. |
| 659921 · 54 Park Crescent Cir · R15 · 1.52 ac | 0, "no lot fits" | the parcel as one lot, house and a 31-ft driveway | Better. |

### 3.3 New in g16 and how it read

- **"The parcel as one lot" with a driveway length.** Right on Harpeth Ln,
  Park Crescent, Brownlee, Old Clarksville. Wrong as a default on land that
  holds more: 1019 Hitt Ln (21.6 ac, a 3,716-ft driveway to one house),
  0 Campbell Rd (17.8 ac, 1,211 ft), 0 Old Hickory Blvd R15 (5.5 ac),
  0 Neelys Bend (18.9 ac). On these it is the engine saying "no street
  fits" and stopping. See §4.
- **Terrace grammar.** Offered on 17 parcels, draws on 5, passes on 1.
  0 Hart Ln: 50 lots, steepest station 9.2%, no code fails, where the loop
  draws 76 at 23.4%. This is the first hillside plan in the cohort that
  holds grade and it is the right direction. Read as a plan it is about
  50% likely: roughly 11 of 35 ac are left unused and there are slivers
  ("street islands") between the arms and the main street. The others
  fail: Brittany Park 25 lots, Red Jacket 56, Westcap 6, Homeland 4.
- **Street walk notes** ("the street walk could not hold 10% on this
  ground: its steepest station runs 16.2%"). Useful and honest. But see
  §5.1: the plan still passes `street.grade_max` at that station.
- **`houses` / `houses_placed`.** Working; the sheets carry catalogue
  plans. Defects in §7.

## 4. The one ask: the land behind the first tier (14 of 21 plan misses)

Same ask as the g15 handoff; g16 added the right vocabulary ("shared
private drive", "the parcel as one lot", driveway lengths) but the default
still stops at the frontage tier or lays a public street that the land
cannot pay for. What a civil and a developer draw on these parcels is a
**private lane or shared drive on the bench, serving 2–10 estate lots,
with the hillside inside the lots and the pads off it.** The engine already
has every piece: the hold, the bench (pads are placed on it), the driveway
router (it reports 622 ft to 3,716 ft), and a shared-drive grammar. What
is missing is using them together as the default when a public street
fails or is not worth its length.

Proposed rule, in the default path (`requested: 'loop'`):

1. If the street plan fails a code test, or returns fewer than one lot per
   250 ft of new public street, or the answer is "the parcel as one lot" on
   more than about three times the district minimum of land off the holds:
   try the lane.
2. The lane: route from the frontage along the lowest-grade walk to the
   largest buildable bench (the walk already exists), private standard
   (a shared access easement; a steeper grade than a public street is
   used for private drives; state the figure the engine holds it to), lot the bench at
   the district minimum with every lot touching the lane, hillside allowed
   inside lot area, pads off it.
3. Cap by the fire code, not the public-street tests: turnaround past
   150 ft, and say when the count would need a second way in.
4. Report it as its own pattern with `street_ft: 0`, `drive_ft`, and the
   tests it was held to, so the app does not have to infer.

The 14, with what is there now and what the target is:

| Parcel | g16 on the sheet | Civil / developer answer |
|---|---|---|
| 659655 · 1019 Hitt Ln · R20 · 21.61 ac | 1 lot, 3,716-ft driveway (grid draws 16 failing) | 12–25: the 10-ac western block is under 25% and takes a street or a lane |
| 380818 · 3345 Pugh Rd · RS80 · 28.14 ac · 3.4% mean slope | 3 lots on a 743-ft public street, 74% open | 3–10 on a lane; the land is flat, the street just stops |
| 692464 · 7695 Old Charlotte Pike · R80 · 45.9 ac | 8 lots on a 3,184-ft public street; fails dead end, block, grade (16.5%) | the same 6–10 lots on the same bench as a private drive: the layout is right, the standard is wrong |
| 679830 · 0 Neelys Bend Rd · RS40 · 18.91 ac | 2 lots on a 1,892-ft shared drive | 3–4 on that drive (target 3–10) |
| 680202 · 0 Campbell Rd · RS80 · 17.8 ac | 1 lot, 1,211-ft driveway | 2–4 on a shared drive |
| 675128 · 0 Newsom Station Rd · R80 · 27.25 ac | 4 equal 6.8-ac estate lots stacked up a 28% ridge, no drive to three of them | 5–10 off one lane; lots sized to the bench, not quartered |
| 659670 · 8282 Charlotte Pike · R40 · 11.87 ac | 2 front lots + a 10-ac flag lot, house at the end of a 1,900-ft pole through held hillside | 5–6: a lane up the strip to the 4-ac bench |
| 668277 · 8192 Charlotte Pike · R40 · 31.63 ac | engine error (§2.1) | 3–6 on a lane along the creek, or 0 with the reason |
| 679273 · 0 Old Hickory Blvd · R15 · 5.51 ac | 1 lot, 323-ft driveway | 3–9 claimed by the target; 68% is over 25%, so 2–3 on a drive is the honest ceiling. The target may be optimistic: say so if the engine's terrain agrees |
| 679226 · 0 Hessey Rd · RS10 · 5.8 ac | 8 lots on a 465-ft cul-de-sac (holds 9.2% now); lot 1 is an 80,327-SF remainder round the wetland | 10–12: lot the remainder again from the bulb or a second short court |
| 679820 · 0 Westcap Rd · R15 · 10.6 ac | 6 frontage lots, two double-size | 8–14: split the double lots and use the bench behind |
| 676829 · 0 Walker Ln · RS20 · 5.5 ac | 3 lots on a 955-ft street with three connections, fails grade | 5–7 on a 500-ft cul-de-sac |
| 673567 · 0 Clovernook Dr · RS10 · 1.17 ac | a 10,000-SF lot and a 34,138-SF remainder | 3: three frontage lots, or two and a flag |
| 667802 · 7963 Charlotte Pike · R40 · 16.95 ac | 0, landlocked | see §5.2: on 11-04 the engine drew 12 frontage lots here |

Two sub-rules fall out of the table and are cheap on their own:

- **Lot the remainder.** When one lot is more than about 2.5 times the
  district minimum and has frontage on the existing or new street, lot it
  again (Hessey lot 1, Clovernook's 34,138 SF, Westcap's two doubles,
  Stewarts Ferry's 47,871-SF tail, Nashboro Blvd's 43,657-SF lot 2). The
  note "1 lots added by lotting oversized lots again from their street
  frontage" shows the pass exists; it is not reaching these.
- **Do not quarter the parcel.** Newsom Station's four equal 6.8-ac lots
  are an arithmetic split, not a plan. Estate lots should be sized to the
  buildable bench each one holds, with a drive drawn to every pad.

## 5. Tests and data that disagree with themselves

### 5.1 `street.grade_max` passes over the limit

The test passes when `ft_over_limit ≤ 100`, whatever the peak:

| Parcel | Steepest station | ft over | Test |
|---|---|---|---|
| 674961 Homeland Dr | 16.9% | 100 | pass |
| 666092 Mt View Rd | 13.3% | 100 | pass |
| 673844 Old Hickory RS20 (g15) | 16.7% | 100 | pass |
| 676829 Walker Ln | 11.6% | 200 | fail |

A 100-ft tolerance for a station a point or two over is reasonable (the
profile gets graded). A 16.9% station is not a tolerance, it is a cut the
plan depends on. Ask: bound the peak as well (for example pass only when
the peak is ≤ 12% and the length over is ≤ 100 ft), and emit a quality
flag between 10% and the bound so the sheet can say "needs grading at one
station". Say in the test row which standard the 10% is taken from.

### 5.2 Landlocked: the plan and `fn_parcel_frontage` disagree

| Parcel | sf_v1 plan | `fn_parcel_frontage` | Note |
|---|---|---|---|
| 676422 · 0 Cedarstone Way · RM9 | landlocked | has frontage | the multifamily run draws 30 units |
| 692658 · 415 Eagle Rdg · R15 | 0 lots, "landlocked" | has frontage | right count, wrong reason; one house on a hillside is the answer |
| 667802 · 7963 Charlotte Pike · R40 | landlocked | landlocked | on 2026-11-04 the engine drew 12 frontage lots here; either the street layer changed or the 11-04 answer was wrong. Please say which, and I will correct the cohort target if the parcel truly has no frontage |

One source of truth for "touches a mapped street" across sf_v1, the
frontage function and the multifamily run.

### 5.3 Dry Fork Rd regressed at g15 and is still wrong

679540 · 0 Dry Fork Rd · RS40 · 31.0 ac, 36% mean slope, 25.0 of 31 ac
held as hillside. g13 refused it with the reason. g15 and g16 draw 4 lots
on a 2,653-ft loop at **59.5%** over 2,200 ft with 2,348 ft of street in
wetland buffer. It fails three tests and is still returned as the plan, so
the sheet shows a loop up a mountain. A plan whose steepest station is
several times the limit over most of its length should be withdrawn in
favour of the zero (or one lot with a driveway) and the reason. 70 → 5.
This is the single largest likelihood loss in the cohort.

More generally: when the default fails `street.grade_max` by a wide margin
(say peak over 20% or more than 500 ft over), and no candidate passes,
return the best passing answer, even if that is one lot, and keep the
failing plan as a candidate row. Affected: Dry Fork (59.5%), Brittany Park
(26.4% over 1,800 ft), Red Jacket (25.8% over 2,700 ft), Hart Ln (23.4%
over 2,400 ft, where the terrace row passes).

## 6. Hillside streets (3 misses) and the terrace grammar

| Parcel | Default | Terrace row | Target |
|---|---|---|---|
| 680596 · 0 Hart Ln · R10 · 35.0 ac | 76 lots, loop, 23.4% over 2,400 ft | **50 lots, 9.2%, passes** | 55–80 |
| 678964 · 0 Brittany Park Dr · RS20 · 29.0 ac | 29 lots, loop, 26.4% over 1,800 ft, block length | 25 lots, fails | 28–45 |
| 681357 · 1716 Red Jacket Dr · R10 · 38.68 ac | 76 lots, two loops, 25.8% over 2,700 ft, 22.6% right-of-way | 56 lots, fails | 70–110 |

- Hart Ln is five lots short of passing the cohort with the terrace plan.
  The unused 11 ac and the slivers between arms are where they are: a
  second terrace street on the upper bench, and arms that end in lots
  instead of leaving "street island" remnants.
- On Brittany Park and Red Jacket the terrace still crosses the held
  hillside. The grammar should refuse to cross a hold over 25% and stop
  the arm short.
- The app's rule keeps the default on the sheet whenever it draws strictly
  more lots, so Hart Ln still shows the failing 76-lot loop with the
  terrace plan one click away. That is a decision for Eric on the app side
  (noted in the audit README); the engine can make it moot by returning
  the passing plan as the default (§5.3).

## 7. What the sheets showed (visual defects, in order of how often)

1. **A public street and a bulb for two to four lots.** 4525 Cato Rd (2
   lots, 250 ft, through the wetland buffer), 3905 Lunn Dr (3 lots, 365 ft,
   23.6% of a 2-ac site in right-of-way), 0 Union Hill Rd (4 RS40 lots on
   a 644-ft L from a 46-ft frontage), 0 Poplar Creek Rd (4), 3345 Pugh Rd
   (3). These pass the scorer where a street is allowed, and no developer
   builds them. Flag lots or a shared drive is the answer below about five
   lots; the lane rule in §4 covers it.
2. **House footprints touching or overlapping** across a shared lot line:
   3905 Lunn Dr, 0 Clovernook Dr, 0 Old Hickory Blvd RS20. The catalogue
   placement should hold the side setback against the neighbour's plan,
   not only its own lot.
3. **Remainder lots** several times the district minimum beside
   minimum-size neighbours (§4, "lot the remainder").
4. **Flag lot with a pole through held hillside**: 8282 Charlotte Pike,
   1,900 ft. Hold the pole to the same hold the pads respect, or call it a
   driveway and report its grade.
5. **Unassigned wedges** where a single street replaced a T (Mt View Rd,
   20.9% open).
6. **Stubs and connections on tiny plans**: Walker Ln and Homeland have
   three connections for three and five lots. A stub to adjoining land is
   right on a 30-lot plan, not on these.

## 8. Multifamily (4 plan misses, 3 refusal misses)

Unchanged from g15; none of it was in g16's scope. In priority order:

1. **Holds are not honored.** The by-right side refuses and the
   multifamily run draws: 679195 · 0 Old Lebanon Dirt Rd (landlocked, 38
   units, an L bar and 68 stalls), 673974 · 0 Hicks Rd (landlocked, 28%
   slope, 14 units), 678148 · 0 Hickory Hollow Pkwy (a 54-ft landlocked
   strip, 9 units, the bar drawn across neighbours' buildings),
   675099 · 0 Todd Preis Dr (94 units on 9.9 ac of flood hazard area; only
   the app holds it out as a what-if). One site-hold function, called by
   both generators, returning the same refusal.
2. **The stall summary does not match the bays** on every `mf_max_gsf_v1`
   plan (the `seed_v2` plans agree):

   | Parcel | `metrics.stalls` | stalls in drawn bays | units |
   |---|---|---|---|
   | 679911 Swiss Ave | 34 | 183 | 60 |
   | 673509 Carothers Rd | 63 | 206 | 42 |
   | 675099 Todd Preis Dr | 49 | 428 | 94 |
   | 670533 Smith Springs Rd | 113 | 106 | 42 |
   | 670783 Nashboro Blvd | 101 | 99 | 9 |
   | 676422 Cedarstone Way | 112 | 110 | 30 |

   The app counts the bays and marks parking "needs verification" when the
   two differ, so no sheet claims compliance on these.
3. **Over-parking.** 99 stalls for 9 units, 110 for 30, 106 for 42: the
   max-GSF search is filling the site with parking after the unit cap
   binds. Stop at the required ratio plus a stated margin.
4. **Product.** On RM4–RM9 the answer is attached homes at the density cap
   (Smith Springs, Carothers, Cedarstone, Nashboro RM6), not one apartment
   bar. `fn_sf_v1_candidates` already carries `attached_permitted` and
   `homes_allowed_by_density`; the townhome row should win when the cap is
   under about 12 units an acre.
5. **Geometry.** 679911 Swiss Ave: a building overlaps a drive by 1 m², the
   app's geometry gate rejects the plan and sheets the 36 townhomes
   instead. Snap or shrink.
6. **Time.** RM compiles took 2–17 s in this run; R/RS plans a median of
   0.43 s with a 6.1-s worst case (Hart Ln).

## 9. What the app does on its side now (so the engine does not have to)

Shipped with this run (PR from `claude/eager-bell-SSYei`):

- Derives the best plan's grammar when `best_requested` is null (§2.2).
- Shows a raised engine error as an engine error, with nothing substituted
  (§2.1). Only SQLSTATE classes raised inside the function count; a
  timeout or a network miss still takes the existing retry path.
- Reads `lots_wkt` by member: a flag lot arrives as
  `MULTIPOLYGON(body, pole)` inside the `GEOMETRYCOLLECTION`, and members
  align with `lot_kinds`, `lot_areas_sf` and `houses`. The pole is drawn
  and named "Access strip · lot N". Please keep that shape: one member per
  lot, body first or largest.
- Names the terrace grammar ("a hillside street with arms") in the panel.
- Counts stalls from the drawn bays and never reads the engine's summary
  as a verdict (§8.2).
- Refuses to call a multifamily plan a result on a flood-held parcel
  (what-if only).

Contract the app depends on, unchanged: `status` ∈ done / skipped / error
with a `reason`; `lots`, `pattern`, `fails[]`, `notes[]`, `street_ft`,
`connections`, `grade_max_pct`, `ft_over_limit`, `open_pct`; `lots_wkt`,
`roads_wkt`, `pads_wkt`, `houses[]`; candidates rows with `requested`,
`pattern`, `lots`, `status`, `fails`; `best`, `best_pattern`, `best_lots`,
`best_buildable`, `best_requested`, `verdict`.

## 10. Acceptance for the next engine release

Run `node scripts/engine-cohort/score.mjs --store <store> --engine g17
--baseline runs/2026-11-10_g16.json` (or `run.mjs` live).

- No raised errors on the 70.
- `best_requested` non-null wherever `best_lots > 0`.
- Plans: **22 of 40 or better**, with at least three of the 14 parcels in
  §4 moving to pass. The lane rule is aimed at six of them (Pugh, Old
  Charlotte Pike, Neelys Bend, Campbell, 8192 Charlotte, 8282 Charlotte);
  the remainder rule at three more (Hessey, Clovernook, Westcap).
- Refusals: 26 of 30 or better; Dry Fork Rd back to a refusal makes 27.
- No parcel that passes at g16 falls to a miss. The ones to watch, because
  they pass on a thin margin: Homeland Dr, Mt View Rd, Old Hickory RS20,
  Lunn Dr, Cato Rd.
- One release, one ask: please do §2 and §4 before anything in §5–§8, and
  say in the migration note which cohort parcels the change was aimed at,
  so the next run can be read against intent.

## 11. Open questions back to the app side / owner

- 667802 · 7963 Charlotte Pike: frontage or not (§5.2). The cohort target
  changes to a refusal if not.
- 679273 · 0 Old Hickory Blvd R15: is 3–9 a fair target with 68% of the
  parcel over 25%? If the engine's terrain says the bench holds two pads,
  the target should be 2–3 on a drive.
- Hart Ln: sheet the passing 50-lot terrace over the failing 76-lot loop?
  The app rule today keeps the plan with more lots. Owner's call.
- The prefetch cron is still unscheduled, by the owner's choice.

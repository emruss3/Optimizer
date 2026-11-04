# A third ten, by right — 2026-11-04

Eric: "Run 10 more and provide feedback again."

The method is the same as `qa/audits/2026-11-04b`: two parcels per size band
from the vacant R / RS parcels of 1–60 ac, by a fixed hash, excluding the 30
already used and the non-sites (association, owners-in-common or public
owners, appraised under $5,000). The parcel table no longer fits in the
database's memory (a full scan reads 127k blocks from disk, 9–22 s), so the
draw ranks by the hash first and measures areas only for the top 600. That
gives the same pick.

The updated handoff arrived during the run, and the engine had changed under
it:
- a `cost.street_ft_per_lot` test;
- a ranking that counts **code** fails only (dead end, access, block, grade,
  flood, pond, driveways), then lots, then less street;
- `verdict` and `best_buildable` on the competition.

The app now reads all of it (below).

| | parcel | district · mapped ac | owner | by right (default) | competition best · verdict | first calls |
|---|---|---|---|---|---|---|
| 1 | 6438 Old Clarksville Pike (667565) | RS40 · 1.40 | private | **1 lot**, frontage, no fails | the same · buildable as drawn | plan **6.4 s** |
| 2 | 3905 Lunn Dr (680860) | RS15 · 2.11 | private | **0 lots** | neighborhood **2** · buildable as drawn | competition 2.8 s |
| 3 | 0 Longwood Pl (681024) | R20 · 4.41 (8.30 inside the outer ring) | **a housing cooperative** | **9 lots**, all tests pass | grid 10 · buildable as drawn | plan 6.0 s, compile **10.2 s** |
| 4 | 0 Old Hickory Blvd (679273) | R15 · 5.51 | private | **0 lots** | grid 8 · fails the street grade | competition 5.1 s |
| 5 | 0 Ridgewood Rd (680408) | RS80 · 6.33 | private | **0 lots** | grid 2 · fails the street grade | — |
| 6 | 0 Abbott Martin Rd (681029) | R20 · 10.76 | **a housing cooperative** | **0 lots** | grid 1 · fails the street grade | competition **20.0 s** |
| 7 | 7963 Charlotte Pike (667802) | R40 · 16.95 | private | **12 frontage lots, no street** | the same · buildable as drawn | plan 5.4 s, competition 10.1 s |
| 8 | 1019 Hitt Ln (659655) | R20 · 21.61 | private | **0 lots** | grid 19 · fails dead end, block, grade | competition 16.2 s |
| 9 | 1716 Red Jacket Dr (681357) | R10 · 38.68 (42.7 outer) | a developer LLC | **89 lots** on two loops | grid 98 · fails the street grade | plan **24.5 s** |
| 10 | 3345 Pugh Rd (380818) | RS80 · 28.14 | private | **0 lots** | grid 6 · fails dead end, block | competition 17.5 s |

Pictures: `ten_parcels_pages.png` (all ten as the app shows them now;
structured or best plans where the default draws nothing),
`fixes_before_after.png`, `by_right_panels.png` (five panels at full height),
`681357_red_jacket_lots_on_condos.png`,
`667802_charlotte_pike_frontage_lots_no_street.png`,
`659655_hitt_ln_best_plan.png`.

## The finding that matters most: the engine plans over land the parcel doesn't own

**0 Longwood Pl** is a cooperative's land wrapped around other people's
house lots: one polygon with **five holes holding 31 single-family parcels**
(3.88 ac). The generator plans on the outer boundary. **All 9 of its lots lie
on those holes** (140,072 SF), and 23,568 SF of its new street runs through
them, while every test passes.

**1716 Red Jacket Dr** is worse: **49 holes holding 278 built residential
condos**. 51 of the 89 lots are drawn on top of them (112,696 SF).

This is systemic: **5,941 of the 16,788 vacant R / RS parcels (35%) have
holes** (12,161 in all). *The app now finds the lots that lie in a parcel's
holes and says so in red: "51 of 89 lots lie partly on land that is not this
parcel … This plan cannot be built as drawn."* The engine has to subtract
the holes from its site. The title block also overstated Longwood's area
(8.31 ac, the outer ring); it now subtracts holes too.

## Two more the app now says plainly

- **Charlotte Pike: "frontage lots" with no street.** No street touches the
  parcel: the nearest mapped road is 1,159 ft away, and the app's frontage
  layer shows its "no street frontage" banner. Yet the generator draws 12
  "frontage lots, no new street" along a vacant neighbour's boundary, every
  test passing. The neighbour belongs to the same family. *The panel now
  says: "These are drawn as frontage lots with no new street, but the frontage
  layer finds no street on this parcel: the lots front a property line."*
- **The default answer drew nothing on six of ten parcels; the competition
  drew lots on five of them.** The page led with "0 lots by right — draw the
  one house" while the competition list held up to 19 lots. Under the third
  audit's rule, only a plan the engine calls buildable may be called best.
  So:
  - *where the best is buildable and has two lots or more (Lunn Dr: 2 lots,
    no code fails), it now goes on the sheet unasked, and the panel says it
    is the competition's best and offers the default back;*
  - *where the best fails a code test (Hitt Ln, Old Hickory, Ridgewood, Pugh,
    Abbott Martin), the sheet keeps the default and the engine's verdict
    leads the competition in red: "the best plan fails a code test: not
    buildable as drawn (street.dead_end_max, block.length,
    street.grade_max)".*

## Parcel by parcel

### 1 · 6438 Old Clarksville Pike (667565) — RS40, 1.40 ac, $148,200
- One frontage lot. That is the lot of record redrawn, with on-lot
  stormwater (104 SF needed). The verdict is right; "1 lot" isn't new
  development.
- The first by-right call took 6.4 s on a 1.4-ac parcel (the DEM fetch).

### 2 · 3905 Lunn Dr (680860) — RS15, 2.11 ac, $76,200
- The default answer: "no lot of 15000 sf fits … no new street reaches into
  the site from the frontage".
- The neighborhood grammar draws 2 lots, buildable, on a 247-ft public
  street with **a cul-de-sac bulb at each end**. It passes
  `cost.street_ft_per_lot` at 123 ft against a 128-ft limit. Two lots are a
  flag lot or a shared drive, not a public street with two bulbs; a minimum
  lot count for a new public street would catch it.

### 3 · 0 Longwood Pl (681024) — R20, owned by a housing cooperative
- As above: all 9 lots on 31 other owners' parcels. The plan is otherwise
  tidy (a single street to a cul-de-sac, every test passes), which is what
  makes it dangerous.
- Co-ops are a third non-site owner type the pool filter missed, after
  associations and O.I.C. (Abbott Martin Rd below is another).
- The planner compile took 10.2 s cold.

### 4 · 0 Old Hickory Blvd (679273) — R15, 5.51 ac, $218,200
- 0 lots by default. The grid and the neighborhood draw 8 lots on a long,
  narrow strip (27% slope, 256 ft of fall), and both fail the street grade
  and flag the street cost.
- The verdict "not buildable as drawn" is right. The sheet keeps 0 with the
  steep-ground caveat.

### 5 · 0 Ridgewood Rd (680408) — RS80, 6.33 ac, $43,800
- 0 lots by default. The grid draws 2 RS80 lots, failing the grade.
- An RS80 split into two 3-acre lots is the ordinary answer here, and the
  street the grid builds to reach them is what fails. A flag-lot or
  shared-drive grammar would make it buildable: the estate partition the
  handoff logs as open.

### 6 · 0 Abbott Martin Rd (681029) — R20, 10.76 ac, owned by a housing cooperative
- 0 lots. Every pattern draws 1 lot and fails three tests.
- It is likely co-op common land. Its competition took **20.0 s**, right at
  the app's 20-s limit.

### 7 · 7963 Charlotte Pike (667802) — R40, 16.95 ac, $13,114
- As above: 12 "frontage lots" fronting a property line on a parcel no street
  touches. The ground averages 31% slope with 226 ft of fall.
- **The first call's answer differed from the later one.** It failed
  `storm.low_point` with "no topo for this parcel"; once the DEM was cached,
  the same plan passes everything. A first visit and a second visit get
  different verdicts.
- The sheet repeats a lot label: two lots read "12".

### 8 · 1019 Hitt Ln (659655) — R20, 21.61 ac, $29,067
- 0 lots by default. The grid draws 19 lots in the parcel's western lobe,
  reached by a street down the long eastern strip: 5,671 ft of street and a
  **3,728-ft dead end**.
- It fails the dead end, block length and grade (26% mean slope), and flags
  street cost and unassigned land. Verdict: not buildable as drawn.

### 9 · 1716 Red Jacket Dr (681357) — R10, 38.68 ac, Barnes Crossing LLC
- As above: 51 of 89 lots on 278 built condos.
- The grid's 98 lots would be the best, but they fail the grade.
- **The first by-right call took 24.5 s**, over the 20-s limit, so a first
  visit gets nothing.

### 10 · 3345 Pugh Rd (380818) — RS80, 28.14 ac, $34,738
- 0 lots by default ("28.15 ac buildable"). The grid and neighborhood draw 6
  lots on 5,092–5,411 ft of street with six cul-de-sacs: about 900 ft of
  public street per lot.
- They fail the dead end and block length; the verdict calls them not
  buildable. Six RS80 lots on 28 flat acres (3.4% mean slope) is a normal
  estate subdivision. The grammars just draw it badly.

## Engine-side

1. **Holes** (above): subtract a parcel's interior rings from the site. 35%
   of vacant R / RS parcels have them, and the two here put lots on 309
   existing homes.
2. **"Frontage lots" with no street** (Charlotte Pike): frontage lots must
   front a street edge, not a neighbour.
3. **A public street for two lots** (Lunn Dr: 247 ft, two bulbs) should not
   pass. `cost.street_ft_per_lot` passes it at 123 ft against 128; a minimum
   lot count per new street, or a flag-lot / shared-drive grammar, would
   decide it.
4. **First-call answers that depend on the DEM's arrival** (Charlotte Pike's
   `storm.low_point`).
5. **First calls over the 20-s limit**: Red Jacket's plan (24.5 s), Abbott
   Martin's competition (20.0 s).
6. **Estate districts** keep drawing streets where a split is the answer
   (Ridgewood, Pugh Rd): the open estate grammar.
7. **Owner types** for the pool: housing cooperatives join associations,
   O.I.C. and public owners.

## The handoff's new parts, as built

- **Third audit.** The competition shows the engine's `verdict` verbatim, in
  green or red. Each row separates **code fails** (red) from **quality flags**
  (amber: unassigned land, street cost, yield). The app puts a best plan on
  the sheet unasked only when `best_buildable` is true. The battery asserts
  Bowfield's verdict ("buildable as drawn").
- **Density and product.** Where a district permits attached homes, the
  competition shows `homes_allowed_by_density` and the townhome candidate's
  row: homes, engine, and "drawn by the townhome engine
  (fn_generate_th_site_plan_v3), not on this sheet", because the candidate's
  plan carries metrics only. None of these ten R / RS parcels permits
  attached homes, so the row appears only on RM land.
- **Not switched: RM routing.** The handoff makes the competition the single
  call for RM parcels too. On 2622 W Heiman (RM40, in the test set) the
  competition's best is **32 townhomes** (density allows 129), while the app's
  apartment plan there places **89 units** (158,285 GSF). The competition has
  no apartment candidate, so routing RM through it would cut that parcel from
  89 homes to 32, against the stated objective of the most units. That is the owner's decision, not a client change; it
  is left as it is until decided.

## What this change does in the client

- Lots on a parcel's holes are found and flagged red; mapped acreage
  subtracts holes.
- Frontage lots on a parcel with no street are flagged red.
- The competition's best goes on the sheet when the default draws nothing,
  but only when buildable, with two lots or more, and drawable here; the
  panel says so and offers the default back.
- Verdict verbatim, code fails apart from quality flags, density, the
  townhome row.

Tests: 530 unit tests pass (new: the hole and auto-best helpers, the
panel's three flags, the competition's verdict and townhome row, two
workspace tests for the auto-best rule); fixture battery 10/10 with the
verdict asserted.

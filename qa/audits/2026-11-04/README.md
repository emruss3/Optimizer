# Five more parcels, one by one — 2026-11-04

Eric: "Grab 5 more and provide detailed feedback for each one." While this
was running, the updated handoff arrived (the pattern competition,
`fn_sf_v1_candidates`, and the engine's answers to the last audit), so the
five were driven twice: once as the app stood, once with the competition and
the fixes below wired in.

The five were drawn the same way as the last five: one per size band from
the vacant R / RS parcels of 1–60 ac, by a fixed hash, none opened before.
Server figures are live (Supabase, this morning); the app was driven
headlessly in fixture mode on those responses, as a user would use it: open
the planner, read the panel, try the override, draw the one house, look at
the competition.

| | parcel | district · mapped ac (assessor) | owner | by right | competition: best / structured |
|---|---|---|---|---|---|
| 1 | 1083 B Lakewalk Dr (663022) | RS10 · 1.16 (1.21) | a builder LLC; land appraised at **$200** | **0 lots** | grid **1 lot** on a new 175-ft street / nothing |
| 2 | 930 Morton Mill Rd (664095) | RS20 · 4.47 (**7.71**) | **Metro Government** | **0 lots**: 2.71 ac held for flood, 28.5% mean slope | 0 / 0 |
| 3 | 0 Riverfront Dr (672627) | RS15 · 11.99 (13.8) | **a homeowners' association**, appraised $2,200 | **skipped**: landlocked | not run (skipped) |
| 4 | 3736 Old Clarksville Pike (663238) | RS40 · 24.9 (24) | private | **7 lots**, single street, 15.2 ac unassigned | single street 7 (1 fail) / neighborhood **16** (3 fails) |
| 5 | 0 Sullivan Hollow Rd (680053) | R80 · 48.1 (51) | private, **owns the 120-ac parcel next door** | **5 lots**, T street, 56% street grade | grid **15** / neighborhood 13 — every pattern fails the grade |

Pictures: `five_parcels_before.png` (each page as the app stood),
`five_parcels_after.png` (the same pages with this change),
`by_right_panels_with_competition.png` (the by-right panel at full height,
competition included), `663238_old_clarksville_structured_plan.png` and
`680053_sullivan_hollow_structured_plan.png` (the structured plan put on the
sheet from the competition), `682644_bowfield_structured_plan.png` (the
battery parcel's structured plan: 25 lots, 10 forgone).

## The finding that matters most: half of these "vacant lots" are not sites

Across this round and the last, five of the ten random parcels cannot be
built on by the people the app is for:

| parcel | owner | appraised |
|---|---|---|
| 0 Riverfront Dr | Riverwalk Nashville Homeowners Association | $2,200 for 12 ac |
| 1023 Wellmoor Ct (last round) | Westchase Property Owners Association | $1,500 for 4 ac |
| 0 Harding Pl (last round) | Burton Hills Homeowners Association | $2.1 M |
| 930 Morton Mill Rd | Metro Government | $64,000 |
| 1083 B Lakewalk Dr | a builder LLC — but appraised at $200 for 1.2 ac, the mark of a remnant or common area; the engine also merged a 0.07-ac Lakewalk Owners Association parcel into its site | $200 |

Of the 3,169 parcels in `sf_v1_prefetch_queue` (the vacant R / RS ≥ 1 ac the
engine warms first), **797 are owned by an owners' / homeowners'
association** (owner name match), **192 by a public body**, and **739 are
appraised under $5,000** (451 of those association-owned). So roughly a
quarter to a third of the candidate pool is common open space or public land,
and the app opens each one as a development site, draws streets on some, and
offers to "draw the one house it carries" on the rest.

What would fix it (not in this change, it needs the server): put the owner and
an owner kind (association / public / private) in the parcel record the
planner gets (`get_parcel_by_id` carries no owner today, so the planner
cannot say it), flag association and public land on the panel, and take it
out of the prefetch queue, which spends its 3DEP and FEMA fetches largest
first, and the largest vacant parcels are often an HOA's floodplain. HOA
common land is no longer treated as a vacant neighbour (the engine's answer
to the last audit); it should not be treated as a site either.

## 1 · 1083 B Lakewalk Dr (663022) — RS10, 1.16 ac

**What the app shows.** "0 lots by right — no lot of 10000 sf (70 x 145 ft)
fits on the frontage or beside a new street: 1.23 ac buildable". A wetland
with its 25-ft buffer runs diagonally through the middle. Before this change
the canvas also carried a yellow banner, "Envelope status: fallback (Using
fallback envelope — Supabase envelope unavailable. Default setbacks: 20ft
front, 5ft side, 20ft rear)", and the title block read "CONCEPT LAYOUT PLAN ·
0 lots · by right (by right) network".

**What is true.**
- The parcel touches its street for **53 ft**, less than one 70-ft lot. It is
  a lot of record already, so 0 new lots by right is a fair answer.
- "1.23 ac buildable" is wrong twice. The engine's site is the parcel plus a
  merged 0.07-ac sliver owned by the Lakewalk Owners Association (`0 Ripple
  Cv`), and 0.43 ac of it is the wetland and its buffer. What can be built on
  is about 0.80 ac, part of it not the owner's.
- The land is appraised at $200. Whatever this parcel is (a remnant of the
  subdivision, a common area the builder kept), the county does not value it
  as a building lot, and nothing on the page hints at that.
- The envelope was not unavailable: the context engine sent one, a
  MultiPolygon (the wetland splits the buildable land), and the client threw it
  away because it only read Polygons. Its own fallback failed on the sliver,
  hence the banner. *Fixed.*
- "Draw the one house it carries" drew nothing: the single-family seed
  answered "1 house" with no footprint and no size, although its own
  buildability check says "buildable, 109.8 ft width, 31,016 sqft envelope".
  The only sign was a "Flags 1" counter at the bottom. *Fixed in the panel
  (it now says the seed could not place the house, in place, and stops
  offering the button); the seed itself is the server's to fix.*
- The competition: the grid grammar draws **1 lot with 175 ft of new
  street**, no failed tests, and is ranked best; the neighborhood and loop
  grammars draw nothing. A public street to serve one lot on a parcel that is
  already one lot is not a subdivision. The ranking rule (fewest failed tests,
  then most lots) needs a floor: a plan must create more lots than the parcel
  already is, or carry its street cost.

**Speed (live, first visit).** Planner compile 6.4 s cold; topography 7.1 s.

## 2 · 930 Morton Mill Rd (664095) — RS20, 4.47 ac

**What the app shows.** "0 lots by right — no lot of 20000 sf (100 x 200 ft)
fits … 1.77 ac buildable". Before this change: the same false envelope banner
(a MultiPolygon again), a title block reading "RS20 · 7.70 ac", and nothing on
the sheet or in the panel to say where the other 2.7 acres went.

**What is true.**
- The parcel is **Metro Government land**: a 2,077-ft strip along Morton Mill
  Rd, at most 101 ft deep, most of it a stream's flood hazard area.
- The assessor's 7.71 ac is not the parcel drawn: the mapped polygon is 4.47
  ac. The title block now shows both: "4.48 ac (assessor 7.70 ac)".
- 2.66 ac of it is FEMA flood hazard area. The engine holds 2.71 ac out (the
  SFHA, smoothed) and is left with a 1.77-ac strip on a slope that averages
  **28.5% (max 92%)**, 82 ft of fall. The reason blames the 100 × 200-ft lot.
  Other modules (80 × 250, 200 × 100, 160 × 125, all at 20,000 SF) and the
  fill scenario also give 0, so the module is not what stops this plan. The handoff says the engine now writes a steep-ground note when the
  mean slope passes 15%. It does not on a 0-lot answer: the note list here is
  only "no new street fits with 100 x 200 ft lots".
- The seed's one house (2,346 SF) has **378 SF inside the SFHA**: the seed does
  not respect the flood hold the subdivision generator applies on the same
  parcel.
- Competition: every grammar draws 0. That is worth knowing: the 0 is not an
  artifact of the loop grammar.

*Fixed in the client:* the flood hold is drawn on the sheet ("Flood hazard area ·
held out", hatched blue) on every by-right answer, including a 0-lot one. The
panel says "The flood hold takes 2.71 ac out before the layout; 1.77 ac are
left to plan". On a 0-lot answer over steep ground the engine did not remark
on, the panel states the DEM's slope and says "the engine measures terrain but
does not lay out by it yet, so the lot module may not be what stops this
plan".

**Speed.** Compile 6.3 s cold; topography 6.8 s.

## 3 · 0 Riverfront Dr (672627) — RS15, 11.99 ac

**What the app shows.** "Skipped — landlocked: the longest touch on a street
is 1163 ft (a street run needs 40 ft, a terminus gap 30 ft); no vacant
neighbour to connect through (neighbours by edge length: open_edge 1163 ft,
common 1113 ft, residential 1112 ft)". The frontage layer, meanwhile, shows
1,160 ft of frontage and no landlocked banner. "Draw the one house it
carries" draws a 2,331-SF house on the north-west edge.

**What is true.**
- The parcel is **the Riverwalk Nashville HOA's common land**, appraised at
  $2,200, and 6.30 of its 12 acres are FEMA flood hazard area.
- It is landlocked: Riverfront Dr runs 130–160 ft to the east, behind a row of
  house lots. The 1,163-ft edge the reason calls "the longest touch on a
  street" is an unshared edge of the parcel fabric (open land, no parcel on the
  other side) whose nearest mapped line is 137 ft away. The engine treats an
  open edge longer than 150 ft as no street, correctly, but its message picks
  the longest edge of class street *or* open edge, so it reports a
  1,163-ft "touch on a street" while calling the parcel landlocked. The
  sentence contradicts itself; it should read "no edge touches a mapped street;
  the longest unshared edge is 1,163 ft of open land, 137 ft from the nearest
  road".
- The frontage layer (`fn_parcel_frontage`) counts that same open edge as
  frontage, so the app's two access opinions disagree again, the other way
  round from Chipmunk Ln last round.
- The seed's house sits **entirely inside the SFHA** (all 2,331 SF), on the
  steep bank by that open edge, and its driveway meets no edge at all: it
  stops inside the parcel, 252 ft from the nearest mapped line. The seed
  puts the house at the "frontage", and here the frontage is not a street.
- The tabulation called the house a "Townhome". *Fixed: "Single-family house".*

*Fixed in the client:* the one-house offer on a landlocked parcel now says "No
street touches this parcel: a house here assumes an access easement across a
neighbour, which is not by right." The flood position of the seed's house is
the server's to fix (the seed should honour the same flood hold as the
subdivision and say when the only place left is in the SFHA).

**Speed.** The topography failed on the first fetch (`usgs_3dep_unavailable`,
10.6 s) and loaded on the retry. Nothing on the sheet says why the contours
are missing in between.

## 4 · 3736 Old Clarksville Pike (663238) — RS40, 24.9 ac, flat

**What the app shows.** 7 lots at 140 × 290 ft on a single 988-ft street from
the Pike, clustered in the southern third; the northern **15.2 ac are blank**
("unassigned: buildable land without a street or a lot"); `open.unassigned`
fails, correctly. Two notes: the entry moved 470 ft along the frontage, and
"the street carries past the 750-ft dead-end limit to a stub at the adjoining
land or road beyond it; that connection is the second way out and the plan
depends on it." Lot labels 5 and 7 overlap on the sheet.

**What is true.**
- This is the easiest parcel of the five: flat (2.5% mean slope, 22 ft of fall
  end to end), no flood hazard, a 471-ft street edge on Old Clarksville Pike,
  about 630 ft wide and 1,700–1,800 ft deep. A 62% net-to-gross estimate says
  16 lots; the default answer draws 7.
- The plan's "second way out" is a stub into vacant land owned by someone
  else (5 vacant neighbours, 2,920 ft of shared edge). `access.second_connection`
  passes, counting it, and `street.dead_end_max` passes with value 0. Until the
  neighbour builds, the street is a ~990-ft dead end, over the 750-ft limit. A
  test that passes on an assumption should say so in its row, the way the note
  does.
- The lot-module override (100 × 400 at 40,000 SF) changes nothing: 7 lots,
  14.2 ac unassigned, two estate lots.
- **The competition shows the plan that should be on top.** The grid and the
  neighborhood plans both draw **16 lots** (4,000–4,200 ft of street), but
  each fails three tests (dead end, block length, unassigned), so the
  fewest-fails rule ranks the 7-lot single street best: "lots forgone for
  structure" comes back as **−9**. The panel now says it in words: "The
  structured plan draws 9 lots more (16 against 7) but fails 3 tests to the
  best plan's 1: the engine ranks the fewest failed tests first, then lots."
  A developer looks at the 16-lot plan. The rule should weigh what each
  failure costs: a block 300 ft too long is not the same failure as 15 acres
  left blank.
- The structured plan itself (`663238_old_clarksville_structured_plan.png`):
  the east street runs along the parcel boundary with lots on one side only
  (0.4 lots per 100 ft of street against the engine's own Buffat Mill reference
  of 2.81). A spine up the middle, or a loop, would serve both sides.

**Speed.** The first by-right call took **22.2 s** live (it fetched the DEM),
over the anon role's 20-s statement timeout: from the app that call would be
cancelled, and a cancelled call caches nothing, so the next visit works only
if the separate contour call cached the DEM in the meantime. Later calls
0.5–0.8 s; the competition 2.9 s.

## 5 · 0 Sullivan Hollow Rd (680053) — R80, 48.1 ac, steep

**What the app shows.** 5 lots on a T street in the north-west corner,
labelled "STREET · PUBLIC R.O.W." with stations, by right. The red banner
from the frontage layer says "No street frontage — access via easement
assumed." Street grade 56% against a 10% limit, 1,000 ft of street over;
dead end 881 ft (fails); 31.95 ac unassigned; the steep-ground note (36%
mean slope, 325 ft of fall) is there. The pond sits at the parcel's low point
on the far east edge.

**What is true.**
- No street touches the parcel. The engine found "access" through a vacant
  neighbour: the right-of-way runs **720 ft along the boundary with Fire Tower
  LLC's 21.6-ac vacant parcel**, 267 ft from Fire Tower Rd, plus 100 ft
  against the residential neighbour. A plan whose every connection is someone
  else's land is not by right; it is an access-easement scenario, and should
  be flagged as one, like the fill scenario.
- The owner, Sylvan Meadows LLC, also owns the 120-ac single-family parcel
  next door (3,409 ft of shared edge). The sensible access is across the
  owner's own land, which the engine cannot see because it does not compare
  owners, and because that neighbour has a house on it, so it does not count as
  vacant.
- The pond is **1,111 ft from the street and 811 ft from the nearest lot**, at
  the parcel's low point rather than the development's. `storm.low_point`
  passes. No pipe or swale reaches it across that hillside.
- The panel gives two falls for the same ground: the note says 325 ft, the
  earthwork block 587.4–890.8 ft = 303 ft.
- The lot-module override (150 × 535 at 80,000 SF) gives 6 lots; the grade
  still fails (54%).
- **The competition ranks plans the ground does not allow.** The grid draws
  15 lots on 5,118 ft of street, the neighborhood 13 on 5,071 ft, the T street
  5; all three fail the dead end, the unassigned land and the street grade
  (the neighborhood plan's streets run straight up the hill, 51.5% max, 3,300
  ft over the limit; `680053_sullivan_hollow_structured_plan.png`). "Best" is
  the 15-lot grid. *The panel now leads with "Every pattern's streets fail the
  grade limit here, so none is buildable as drawn; the engine does not lay out
  by slope yet."* On ground like this the engine should not rank by lots at
  all until it steers by grade.

**Speed.** A by-right call took **47.2 s** while it fetched the DEM, more than
twice the anon timeout; once the DEM was cached, 0.4 s; the competition 1.8 s.

## Engine-side, for the generator's owner

1. **Ownership.** Association-owned and public land are a quarter of the
   candidate pool (above). Owner and owner kind belong in the parcel record and
   on the panel; the prefetch queue should skip them.
2. **The fill scenario is labelled `basis: 'by_right'`** (Martingale Dr,
   `{"flood":"floodway"}`: 147 lots, 365,035 cy of fill, an 88-ft compensating
   cut over 2.54 ac). The handoff calls it an override; the client labels it an
   override from the request, but the response should too.
3. **`street.grade_max` passes with up to 100 ft of street over the limit**
   (Bowfield: 12% against 10%, 100 ft over, pass) and the test carries no
   `rule` saying so. The panel now marks such a row "passes over the limit for
   100 ft, within the engine's allowance"; a `rule` string would say whose
   allowance it is.
4. **The landlocked reason contradicts itself** when the longest edge is an
   open edge (Riverfront Dr, above).
5. **The competition's best rule** picks a 1-lot plan with a new street
   (Lakewalk), a 7-lot plan over a 16-lot one (Old Clarksville), and an
   unbuildable 15-lot grid (Sullivan Hollow). It needs a floor on net new
   lots, a weight on what each failure costs, and a grade gate.
6. **Vacant-neighbour access is treated as by right** (Sullivan Hollow,
   Old Clarksville's second way out). It is an assumption and should be one.
7. **The single-family seed** ignores the flood hold (378 SF in the SFHA on
   Morton Mill, the whole house on Riverfront), places the house at an
   "frontage" that may be an open edge, and on Lakewalk returns no footprint
   while its own check says buildable.
8. **`module_by_right: true`** returns the identical 0-lot answer, same module,
   no note, on all four estate / irregular parcels tried (Harding Pl, Chipmunk
   Ln, Lakewalk Dr, Morton Mill Rd). If it found nothing, it should say what it
   tried.
9. **The steep-ground note** is missing on 0-lot answers (Morton Mill, 28.5%),
   which is where it matters most, because the reason there blames the lot.
10. **The pond goes to the parcel's low point** even when the development is
    1,100 ft away from it.
11. **Timing.** First calls of 22 s and 47 s (DEM fetches) exceed the anon
    20-s timeout; the prefetch cron is still not scheduled. One Martingale
    fill-scenario plan is 14 s and 426 KB, so its three-run competition cannot
    finish inside 20 s. The app does not start it under the fill scenario and
    offers "Run it anyway".
12. **The handoff's lot counts are stale**: Bowfield by right is 35 lots with no
    failed test today (the handoff says 24), and Martingale's fill scenario is 147
    lots and 365,035 cy (the handoff: 127 and 565,000).

## What this change does in the client

The handoff items:
- **The pattern competition** (`fn_sf_v1_candidates`, through a new SECURITY
  DEFINER wrapper, `fn_sf_v1_candidates_app`, migration 20261104100000). It runs
  after the by-right plan is on the sheet, never in front of it, cached per
  parcel and option set. The panel lists each pattern by what it **drew** (a
  grammar that fell back says so), with lots, street, lots per 100 ft, open
  share, score, failed tests, "best" and "structured" badges, and the price of
  the structure in a sentence (gives up N lots / draws N more but fails more
  / every pattern fails the grade / nothing fits). "View this plan" puts best,
  structured or any other row on the sheet, still by right; the scorecard
  (nine criteria) opens on request. Under the fill scenario it waits to be
  asked; a timeout says it was the server's 20-s limit.
- `pattern` and `module_by_right` are not overrides; a pattern view is
  labelled by right.
- New layers: the flood hold on every answer, the trail (drawn as a band), the
  green strip, reserve pieces; the new tests render like the others.
- The plan's follow-up calls (no-build land, per-pad fill, the BFE line) run
  together, so the sheet waits for the slowest of them, not their sum.
  Contours were already independent.
- The engine's steep-ground note leads the panel instead of sitting among the
  notes.

From these five:
- The server's MultiPolygon envelope is used (the false "envelope unavailable"
  banner on two of five).
- A 0-lot answer settles as existing conditions, with the wetland and the flood
  hold kept as context. The title block no longer reads "0 lots · by right
  (by right) network".
- A failed house draw says why in the panel; a landlocked parcel's house says
  it assumes an easement.
- The fill scenario is not offered where nothing is held for flood, and the
  earthwork block says "No FEMA flood hazard area on the site".
- A pass over the limit is marked as one.
- The KPI strip on a subdivision reads lots, du/ac, open, and its own tests
  ("3 tests fail", "All tests pass", "No new lots by right"), not "STALLS 0 / 0"
  and "0 issues". It was raised in both earlier rounds.
- The "How to organize this site" card names what the by-right generator drew,
  with the pattern layer's suggestion as a note. Also raised in both earlier
  rounds.
- The title block carries the mapped area, and the assessor's when they differ
  by more than 5%; the network reads "single street · by right".
- The house is tabulated as a single-family house; the yield comparison reads
  "7 lots; a 62% net-to-gross estimate would say 16 (ratio 0.44)".

Still not fixed here: ownership on the page (needs the owner in the parcel
record), the two access opinions (frontage layer and engine), the seed's flood
blindness, overlapping lot labels on dense sheets, and the R40/R80
"Two Family" chip where the use resolver permits single family only.

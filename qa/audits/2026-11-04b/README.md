# Ten more parcels by right — 2026-11-04

Eric: "Run 10 more and provide feedback again."

**How they were drawn.** Two per size band (1–3, 3–6, 6–12, 12–25 and 25–60
ac) from the vacant R / RS parcels, by a fixed hash, none opened before.
The last two rounds found that half the random draws were not sites:
homeowners' associations, Metro, $200 remnants. So this time the pool
excludes association-owned land (including the "O.I.C." owners-in-common
naming, 268 parcels on its own), public land, and land appraised under
$5,000. That leaves **1,679 of the 3,125** vacant R / RS parcels of 1–60 ac:
**46% of the pool is not a plausible site** by ownership or appraisal alone.

Server figures are live (Supabase, this morning, a first visit to each
parcel). The app was driven headlessly in fixture mode on those responses:
open the planner, read the panel, look at the competition, put the
structured plan on the sheet, draw the one house, try the fill scenario.

| | parcel | district · mapped ac | by right | competition: best / structured | first by-right call |
|---|---|---|---|---|---|
| 1 | 0 Temple Rd (677010) | RS40 · 2.78 | **skipped**: "floodplain leaves no buildable piece" (and landlocked) | — | 0.4 s |
| 2 | 0 Couchville Pike (676960) | RS80 · 1.43 | **0 lots**: the parcel is smaller than one RS80 lot | all 0 | 0.2 s |
| 3 | 0 Nashboro Blvd (672524) | R10 · 3.46 | **8 frontage lots**, no new street, all tests pass | grid 8 (with 562 ft of new street) / 6 | 3.2 s |
| 4 | 0 Hessey Rd (679226) | RS10 · 5.80 | **12 lots**, two cul-de-sacs, grade fails | loop 12 / 11 | 2.7 s |
| 5 | 0 Homeland Dr (674961) | RS40 · 9.02 | **5 lots** on 1,228 ft of street, grade fails | loop 5 / 4 | 2.5 s |
| 6 | 6404 Eatons Creek Rd (661661) | R40 · 9.02 | **3 frontage lots**, 2.5 ac unassigned | neighborhood **2** (0 fails) / 2 | 3.0 s |
| 7 | 0 River Landing Way (676430) | R15 · 15.39 | **skipped**: the floodplain. Fill scenario: **10 lots** on 9–19 ft of fill | — | 0.5 s (fill scenario: **21.3 s**) |
| 8 | 0 Neelys Bend Rd (679830) | RS40 · 18.91 | **0 lots** | neighborhood **2 lots on 3,555 ft of street** | 0.5 s (competition 11.4 s) |
| 9 | 0 Newsom Station Rd (675128) | R80 · 27.25 | **7 lots**, all pie lots, 3 fails | grid 6 / 5 | **12.1 s** |
| 10 | 0 Brittany Park Dr (678964) | RS20 · 29.00 | **36 lots** on a loop, 2 fails | grid 37 / 33 | **20.6 s** |

Pictures: `ten_parcels_pages.png` (every page with this change),
`fixes_before_after.png` (Temple Rd blocked, then answered; the loop drawn as
a slab, then as a street), `by_right_panels.png` (five panels at full height),
`676430_river_landing_fill_scenario.png`, `679830_neelys_bend_best_plan.png`,
`672524_nashboro_structured_plan.png`.

## Two defects the app had on every plan of their kind

**Every loop street was drawn as a solid slab.** A loop is one polygon with
the block inside it as a hole. The canvas filled the outer ring only, so on
Brittany Park Dr, and on Bowfield Dr in the battery since the loop first
shipped, the whole inner block sat on grey pavement under its own lots. Two
earlier rounds of pictures show it and nobody caught it. *Fixed: every ring
is drawn, even-odd. The 3D view was always right.*

**A flood parcel never reached the by-right generator.** On Temple Rd and
River Landing Way the planner compile marks the site physically undevelopable
(97.8% and 100% FEMA flood hazard area or wetland buffer), which sets
`generation_allowed: false`. The page then said "Generation blocked —
'single family' is not permitted as-of-right on this parcel. Pick a permitted
use", on RS40 and R15 lots where single family is the only use permitted. The
KPI strip stayed on "Generating plan…". The engine, which judges flood land
itself, was never asked, and the fill scenario, which draws 10 lots on River
Landing Way, could not be reached. *Fixed: a physical-only block on an R / RS
parcel goes to the by-right generator. Elsewhere the block text names the
physical reason ("97.8% of the parcel is FEMA flood hazard area (zone AE) or
wetland buffer; 2,703 SF is left outside it, under the 15,000 SF a building
needs") instead of blaming the use. A flood skip now offers the fill scenario,
and its one-house offer says the house would stand in the floodplain.*

## Parcel by parcel

### 1 · 0 Temple Rd (677010) — RS40, 2.78 ac, private, appraised $159,200

- 97.8% of the parcel is SFHA (zone AE) or wetland buffer; 2,703 SF is left
  outside it. The by-right answer is "floodplain leaves no buildable piece".
- The fill scenario then answers "landlocked: no edge touches a mapped
  street; no vacant neighbour to connect through (residential 1,059 ft, other
  841 ft, vacant 224 ft)". The parcel is landlocked as well as flooded, but the
  by-right reason gives only the first cause it met. A user who reads
  "floodplain" and tries the fill scenario learns about the access only then.
  The reason should give every disqualifier.
- The frontage layer agrees it is landlocked (the red banner). The two
  opinions agree this time.
- Nothing can be built here by right, and the panel now says so. The county
  appraises it at $159,200, which is worth putting in front of a buyer.

### 2 · 0 Couchville Pike (676960) — RS80, 1.43 ac, private, $120,000

- 0 lots, with "no lot of 80000 sf (270 x 300 ft) fits on the frontage or
  beside a new street: 1.43 ac buildable". The parcel is 62,354 SF, smaller
  than one RS80 lot, so no new lot is possible on any layout. *The panel now
  says so: "The parcel (62,354 SF) is smaller than the district's minimum lot
  (80,000 SF): no new lot can be made. As a lot of record it may still carry
  one house."*
- The seed's house (2,400 SF) sits at the narrow southern tip by the road,
  the same placement as Harding Pl two rounds ago. On a lot like this the
  house goes where the lot is wide.
- Competition: all three grammars draw 0, in 0.1 s.

### 3 · 0 Nashboro Blvd (672524) — R10, 3.46 ac, private, $565,200

- This is the best answer of the ten: 8 frontage lots on the existing street,
  no new street, all tests pass, stormwater on the lots (832 SF needed, the
  new `on-lot stormwater` rule).
- The rear lots run deep (lot 4 is a 43,657-SF "estate" lot) and two lot
  labels overlap on the sheet. "100.1% lots" is a rounding artifact shown as
  is.
- **The competition ranks a worse plan best.** The grid draws the same 8 lots
  but with **562 ft of new public street**, and wins on order because lots and
  failed tests tie. The frontage plan builds no street at all. Until the
  engine has a cost objective, a tie should go to the plan with less street.
- The assessor codes it "VACANT COMMERCIAL LAND" on R10 zoning. The app never
  shows the use code; a user should see it when it contradicts the district.

### 4 · 0 Hessey Rd (679226) — RS10, 5.80 ac, private, $659,100

- 12 lots on a "single street". The sheet shows a Y with **two** cul-de-sac
  bulbs (665 ft, 2 dead ends) while the pattern line says "1 cul-de-sac".
- 6 of the 12 are pie lots round the bulbs, and 5 triangular street islands
  (0.5 ac) are left over: the known gap of leftovers between streets. A
  0.86-ac wetland buffer sits on the west.
- The street grade fails at 14.1% (13% mean slope, 62% max); the engine does
  not steer by grade yet.
- Competition: the loop's 12 is best; grid and neighborhood draw 11.

### 5 · 0 Homeland Dr (674961) — RS40, 9.02 ac, private, $253,000

- 5 lots averaging 63,153 SF on **1,228 ft of street** (0.41 lots per 100 ft,
  against the engine's own Buffat Mill reference of 2.81). The longest branch
  runs east through the wetland buffer (190 ft of street in wetland) to reach
  the adjoining land, because the plan needs that stub as its second way out
  (the note says so).
- The grade fails (17.3%); the steep-ground note leads the panel (15% mean
  slope, 125 ft of fall).
- Competition: the loop's 5 is best; the neighborhood draws 4 and the grid 3.

### 6 · 6404 Eatons Creek Rd (661661) — R40, 9.02 ac, trust, $232,900

- 3 frontage lots, no new street. 2.48 ac in the southern tail is unassigned
  (`open.unassigned` fails), and a wetland buffer sits at the north.
- **A note about a street on a plan with no street**: "the street carries
  past the 750-ft dead-end limit to a stub at the adjoining land … the plan
  depends on it". It belongs to a candidate that was not drawn.
- **The competition picks fewer lots.** Best is the neighborhood plan:
  **2 lots on 752 ft of new street, 0 failed tests**. It beats the default's 3
  frontage lots (1 failed test) and the grid's 4 lots (902 ft, 1 failed
  test). The one failure in both is unassigned land, so the rule trades two
  lots and a new street to avoid a test about leftover acreage.

### 7 · 0 River Landing Way (676430) — R15, 15.39 ac, Banksy Farms LLC, $36,519

- 100% of the parcel is SFHA (zone AE) or wetland buffer. By right it is
  skipped ("floodplain leaves no buildable piece"), and until this change the
  app never got that far (above).
- **The fill scenario draws 10 lots** on a T street (6 estate, 4 standard)
  and admits what they cost: 7.72 ac built in the floodplain, **56,277 cy of
  fill**, every pad on **9.4–18.6 ft of fill** (median 17.3 ft, 9 lots over
  10 ft), and a compensating cut of 43.7 ft average over the 0.79 ac of open
  floodplain left, which does not close. The sheet colours every pad red or
  orange and draws the BFE 431 line
  (`676430_river_landing_fill_scenario.png`).
- The engine again labels the fill scenario `basis: 'by_right'`; the app
  labels it an override from the request. The pattern card said "drawn by
  right" over it. *Fixed: "drawn as an override".*
- **The first fill-scenario call took 21.3 s**, over the anon role's 20-s
  statement timeout. In the app a first visit's fill scenario is cancelled;
  once warm it takes 1.1 s.

### 8 · 0 Neelys Bend Rd (679830) — RS40, 18.91 ac mapped (assessor 15.0), private, $23,348

- The flood hold takes 10.8 ac and leaves 8.09. By right the answer is 0 lots,
  with two notes that contradict each other: "the street carries past the
  750-ft dead-end limit to a stub …" and "no new street reaches lots inside
  the site".
- **The competition's best is 2 lots on 3,555 ft of public street**
  (0.06 lots per 100 ft). It fails the dead end, block length and street grade
  (16.6%). The rule puts any plan with lots ahead of every plan without, so
  two long parallel streets for two houses wins
  (`679830_neelys_bend_best_plan.png`). *The panel now says "The only pattern
  that draws lots here fails the street grade, so it is not buildable as
  drawn".*
- That plan's street crosses the SFHA for 20 cy of fill, and the cut test
  reports "avg 53.2 ft deep … does not close on site" over 0 ac of open
  floodplain. That is a division by almost nothing. With no open floodplain
  the test should say the 20 cy has to be balanced off site. *The pad-fill
  legend no longer appears when no lot is in the flood hazard area.*
- The mapped polygon is 18.9 ac against 15.0 on the assessor's record; the
  title block now shows both.
- The competition took 11.4 s live.

### 9 · 0 Newsom Station Rd (675128) — R80, 27.25 ac, private, $55,736

- A hilltop: 29% mean slope, 183 ft of fall. 7 lots, **every one of them a
  pie lot**, round two cul-de-sacs on a T street along the east boundary.
  10.5 ac are unassigned, the grade fails (41.9%), and the dead end fails
  (947 ft).
- Competition: the grid's 6 (2 fails) is best over the default's 7 (3 fails),
  again fewer lots for one fewer failure.
- **The first by-right call took 12.1 s** (the DEM fetch).

### 10 · 0 Brittany Park Dr (678964) — RS20, 29.00 ac, Millwood Housing Partners III LLC, appraised $3,000,000

- 36 lots on a loop with a cross street. `open.unassigned` fails (3.49 ac) and
  the grade fails (27.6%; 20% mean slope, 154 ft of fall). The competition's
  grid draws 37 with one failure.
- The loop was drawn as one solid slab. *Fixed* (`fixes_before_after.png`).
- **The first by-right call took 20.6 s**, over the 20-s anon timeout, so a
  first visit in the app gets no plan.
- **The record says this may not be a by-right single-family site at all.**
  The use code is "VACANT ZONED MULTI FAMILY", the owner is a housing
  partnership, and the appraisal is $3 M, on RS20 base zoning. That reads like
  an approved planned development (an SP or PUD overlay) that the base district
  does not show. The app routes on the base district alone. It should at
  least show the use code and say the parcel may carry an entitlement the
  by-right answer ignores.

## Engine-side, for the generator's owner

1. **Two judges of the same floodplain.** The compile's
   `physical.developable` blocks generation before the engine, which has its
   own flood logic and the fill scenario, is asked. The client now routes
   around it on R / RS parcels. The compile should stop blocking a use that is
   by right; it should report the physical verdict instead.
2. **A skip reason should give every disqualifier** (Temple Rd: floodplain
   *and* landlocked).
3. **The competition's rule** (lots > 0 first, then fewest failed tests, then
   lots) picked: a new street over no street at the same lot count
   (Nashboro); 2 lots and a new street over 3 frontage lots (Eatons Creek); 6
   lots over 7 (Newsom); 2 lots on 3,555 ft of street over nothing (Neelys
   Bend). It needs a street-cost term, a tie-break toward less street, and a
   weight on what each failure costs.
4. **Notes from plans that were not drawn** (Eatons Creek, Neelys Bend: a
   street note on a no-street answer).
5. **The cut test with no open floodplain** (Neelys Bend: 53.2 ft average over
   0 ac for 20 cy).
6. **Counts that disagree with the drawing** (Hessey Rd: two bulbs, "1
   cul-de-sac").
7. **Layouts of only pie lots** (Newsom Station: 7 of 7).
8. **The fill scenario is labelled `by_right`** (River Landing Way, as on
   Martingale).
9. **First calls over the anon 20-s timeout:** Brittany Park's plan (20.6 s),
   River Landing Way's fill scenario (21.3 s). Newsom Station's plan (12.1 s)
   and Neelys Bend's competition (11.4 s) are close. The prefetch cron would
   take the DEM and BFE fetches out of the user's wait.
10. **The use code against the zoning** (Nashboro "commercial" on R10;
    Brittany Park "zoned multi family" on RS20). The entitlement may not be
    the base district.
11. **The candidate pool**: 46% of the vacant R / RS parcels of 1–60 ac are
    association-owned (including O.I.C.), public, or appraised under $5,000.

## What this change does in the client

- Polygons keep their holes on the 2D sheet: loops read as streets round a
  block.
- A physical-only compile block on an R / RS parcel goes to the by-right
  generator. Elsewhere the block names its physical reason instead of "not
  permitted as-of-right — pick another use".
- A flood skip offers the fill scenario as an override; its one-house offer
  says the house would stand in the floodplain.
- A parcel smaller than the district minimum lot says so.
- "The only pattern that draws lots here fails the street grade"; no pad-fill
  legend when only a street is filled.
- The pattern card says "drawn as an override" over an override.

Tests: 522 unit tests (a workspace test for the physical-block route, the
helper, the panel's flood skip, the undersized note, the street-only fill, the
competition wording, the override chip); fixture battery 10/10, with Bowfield's
loop and Martingale's two loops now drawn as streets.

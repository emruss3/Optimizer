# Ten parcels by right — the app as a user sees it, 2026-11-03

Eric: "Run 10 parcels as if you were a user, take screenshots, and provide
candid feedback about making the experience and output better."

The ten are the by-right generator's own test set (the handoff's parcels), so
this run is the first look at `fn_sf_v1_plan` **inside the product**: the
real client driven headlessly (Playwright) in fixture mode on responses
pulled live from the project this afternoon. Every plan shown is the
server's; the client draws, names and grades nothing of its own.

| parcel | district · acres | by right | pattern | du/ac | fails |
|---|---|---|---|---|---|
| 4701 Bowfield Dr (682644) | R8 · 10.7 | 34 lots @ 65 × 125 | loop | 3.17 | open.unassigned, **street.grade_max 26.8%** |
| 0 Morton Mill Rd (681118) | RS20 · 16.7 | 16 lots @ 100 × 200 | loop | 0.96 | open.unassigned, **street.grade_max 76.8%** |
| 0 Spring Branch Dr (679703) | R20 · 12.6 | 14 lots @ 100 × 200 | single street | 1.11 | open.unassigned, **street.grade_max 16.5%** |
| 1420 Pleasant Hill Rd (661361) | R15 · 9.3 | 14 lots @ 85 × 180 | single street | 1.50 | **street.grade_max 30.9%** |
| 0 Old Hickory Blvd (680145) | R15 · 9.8 | 12 lots @ 85 × 180 | T street, cul-de-sac | 1.23 | none (75 ft of street in wetland) |
| 700B James Ave (558909) | R8 · 4.2 | 9 lots @ 65 × 125 | single street | 2.13 | open.unassigned |
| 0 Bell Rd (678879) | RS20 · 6.9 | 6 lots @ 100 × 200 | frontage lots, no new street | 0.87 | none |
| 2400 W Heiman St (550510) | R6 · 11.0 | 18 lots @ 55 × 110 | single street (dead end) | 1.64 | **street.grade_max 29.4%** |
| 2113 Cliff Dr (642043) | R8 · 1.6 | 3 lots @ 65 × 125 | frontage lots, no new street | 1.88 | none |
| 0 Martingale Dr (680719) | R10 · 70.6 | **0 lots** (1.59 ac buildable outside the SFHA) | — | — | — |
| … the fill scenario (override) | | 145 lots @ 70 × 145 | 2 loops | 2.14 | block.length, open.unassigned, **flood.cut_fill_balance** |

Pictures: `ten_parcels_by_right_pages.png` (the page for each parcel),
`ten_parcels_by_right_panels.png` (the by-right panel: headline, numbers,
tests, notes, earthwork, override), `680719_martingale_fill_scenario.png`
(the override: 145 lots, every pad coloured by the fill it needs, the
ground-at-BFE line in blue), and the single pages for Bowfield, W Heiman,
Bell Rd and Martingale by right.

## Two defects the run found and this change fixes

- **2400 W Heiman was rejected by the geometry gate** ("drive overlaps drive,
  18 m²"): the generator's driveways lap into the pavement they meet. The
  mapper now clips driveways to the street as well as to the pads.
- **Fourteen "House N" captions** over Pleasant Hill Rd: every house pad was
  labelled like an apartment building. The lot tag already names the lot;
  pads carry no caption now.

## What a user would push back on — the output

1. **The streets climb cliffs.** Six of ten plans fail `street.grade_max`:
   26.8% on Bowfield, 29.4% on W Heiman, 30.9% on Pleasant Hill, **76.8% on
   Morton Mill**, against a 10% limit. The plans look plausible in plan view
   and are unbuildable in profile; the generator measures the grade after
   laying the street and does not steer by it (a known gap). Until it does,
   a plan whose street exceeds twice the limit should say "not buildable as
   drawn" in the headline, not only in a red row at the bottom of a panel.
2. **Land left on the table.** W Heiman puts lots on 27% of the parcel and
   calls the 5.67 ac north of its short street "amenity: pond and its edge";
   that is the held-out flood land, and the old generator (§12–§13) put 34
   lots along a spine on this very parcel, holding out 22% from the same FEMA
   and NWI tables. Either the by-right hold is right and the old plan was
   wrong, or the hold is too generous. A user who saw 34 lots here last
   month and sees 18 today deserves the reconciliation on the page.
3. **The open-space vocabulary is the engineer's**: "amenity: street island
   / green (too shallow for a lot)", "unassigned: buildable land without a
   street or a lot", "amenity: pond and its edge". The panel now groups the
   pieces by kind with counts and acres; the names themselves should be the
   planner's ("Street island", "Unassigned — buildable, no street").
4. **Two frontage opinions on Bell Rd.** The app's frontage layer (parcel
   fabric) raises "No street frontage — access via easement assumed" while
   the by-right plan draws six "frontage lots, no new street" on Bell Rd.
   One of them is wrong.
5. **The pattern panel contradicts the plan.** "Subdivision on a street grid
   with rear alleys · generator follows this" over Bowfield's loop with no
   alleys; "One house on the lot" over Cliff Dr's three lots; "public ROW
   spine with rear alleys" over W Heiman's single dead-end street.
   `fn_plan_pattern` does not know the by-right generator exists; on an R / RS
   parcel the pattern should be what sf_v1 draws.
6. **The KPI strip is still the apartment strip**: "STALLS 0 / 0", "0 issues"
   on a plan that admits one to three failed tests, and a legend of Studio /
   1 Bed / 2 Bed / 3 Bed on a single-family sheet. The strip should carry
   lots, du/ac, open share and the count of failed tests.
7. **Estate and pie remnants read as waste**: Pleasant Hill's lot 6 is
   50,615 SF beside 18,500-SF neighbours; Spring Branch carries three estate
   lots; Bowfield one. A buyer sees a lot that could have been two.
8. **Wetland crossings are reported, not solved** (75 ft on Old Hickory, 84
   ft on W Heiman, 1,124 ft on Martingale): the street is drawn through and
   the panel says so in red. Known gap; the honest line is there.
9. **`yield.vs_arithmetic` is a formula, not a sentence**: "lots 34 · ratio
   0.94 · arithmetic at 62pct 36". It should read "34 lots; a 62%
   net-to-gross estimate would say 36".

## What a user would push back on — the experience

10. **The route is silent.** Nothing says why this parcel got a by-right
    subdivision and that one apartment massing. One line under the headline
    — "By right: R8 single-family, from the district's standards" — and a
    way to see the alternative (the legacy spine with alleys) would make the
    switch legible instead of surprising.
11. **The override is buried.** On a floodplain parcel the verdict "0 lots by
    right" should offer the fill scenario in the same breath ("see what
    filling to BFE + 4 ft would give — an override"), not three panels down.
12. **Twenty seconds to a two-second answer.** Each page settled in ~20 s
    because the planner-context compile and the massing program run first;
    the by-right plan itself takes 0.2–1.5 s. On an R / RS parcel the
    by-right plan should render first and the apartment-side compile follow.
13. **The default use chip says "Two Family"** on R6 / R8 lots (the highest
    permitted use) over single-family lots — the 2026-09-16 finding, still
    there.
14. **The fill-depth view only has data where the DEM was harvested**: in
    this fixture run Old Hickory and Cliff Dr sit in the SFHA but show "per-
    pad fill unavailable"; live, `fn_sf_v1_pad_fill` computes it. Martingale
    shows the full view: pads from 2.3 to 15.9 ft of fill, most of them over
    8 ft, and the compensating cut that cannot close on site.

## What works

- Every R / RS parcel got its by-right answer, with the lot module, the
  pattern, the land split, the storm pond at the low point and the
  generator's own tests on the page; the fails are red and the notes are
  verbatim. Martingale tells the truth twice: 0 lots by right with the
  reason, and 145 lots under the fill scenario that admits 361,859 cy of
  fill and a 46-ft compensating cut that does not balance.
- The sheet reads like a concept layout: lot numbers with dimensions and
  the server's areas, stations and existing grades on the street, wetlands
  hatched, the title block carrying lots, network, R.O.W. share and the
  held-out share.

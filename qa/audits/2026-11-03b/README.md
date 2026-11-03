# Five more parcels by right, drawn at random — 2026-11-03

Eric: "Pull 5 more and give feedback."

The previous ten were the by-right generator's own test set. These five were
not picked by anyone: the vacant R / RS parcels of 1–60 acres in the parcel
table (3,148 of them) were split into five size bands and one parcel was
taken from each by a fixed hash. None had been opened before, so the server
timings below are a real first visit. The app was then driven headlessly in
fixture mode on responses pulled live, as a user would use it: open the
planner, read the panel, open 3D, try the override.

| band | parcel | district · acres | by right | why | lots at 62% net |
|---|---|---|---|---|---|
| 1–3 ac | 0 Harding Pl (680672) | R40 · 2.9, corner, 77 ft of fall | **0 lots** | "no lot of 40,000 sf (140 × 290 ft) fits on the frontage or beside a new street" | 2 |
| 3–6 ac | 1023 Wellmoor Ct (666459) | RS20 · 4.1, 17% mean slope | **skipped** | "no street edge and no vacant neighbour: landlocked" | 5 |
| 6–12 ac | 7610 Chipmunk Ln (662597) | R80 · 7.0, wetland in the middle | **0 lots** | "no lot of 80,000 sf (270 × 300 ft) fits …" | 2 |
| 12–25 ac | 0 Pennington Bend Rd (672099) | R15 · 13.3, 10.3 ac in the SFHA | **6 frontage lots** on the 3 dry acres | no new street fits | 5 |
| 25–60 ac | 0 River Road Pike (678315) | R80 · 26.2, 287 ft of fall, 33% mean slope | **1 lot**, 23 ac "unassigned" | "no new street fits with 270 × 300 ft lots" | 8 |

Pictures: `five_parcels_pages_before.png` (each page as served, plus the two
overrides), `five_parcels_panels_before.png` (the by-right panel at full
height), `five_parcels_3d.png`, `three_parcels_after_fixes.png` (what this
change does to Harding Pl, Wellmoor Ct and Pennington Bend),
`678315_river_road_pike_1_lot.png`, `672099_pennington_fill_scenario.png`
(the fill scenario: 16 lots, 16,623 cy of fill, a 7.5-ft compensating cut
that does not close).

## What the five say about the output

1. **On parcels nobody chose, the by-right generator drew no subdivision at
   all.** The curated ten all drew loops and streets. Here two are 0 lots,
   one is skipped, and the two big ones get frontage lots only. Pennington
   Bend's six lots on its three dry acres are a credible answer; the rest are
   not what a developer would accept.
2. **The fixed lot module is the cause on the small ones.** R40 is drawn as
   140 × 290 ft and R80 as 270 × 300 ft. On an irregular 2.9-ac R40 lot that
   module fits nowhere, so the answer is 0 — where a 2-lot split or a flag lot
   is the obvious design. The R80 module is nearly square, not an estate lot
   (the handoff's "R80 crude", confirmed on both R80 parcels).
3. **The override does not always use the module you ask for.** 100 × 400 ft
   at 40,000 SF on Harding Pl came back with the reason naming 135 × 300 and
   still 0 lots; 160 × 500 at 80,000 on Chipmunk Ln came back as 270 × 300.
   Only 50 × 120 at 6,000 was honoured (2 lots). The panel now says when this
   happens; the generator should use the module or say why it will not.
4. **Some tests pass on their own failure.** River Road Pike lists 23.01 ac of
   "unassigned: buildable land without a street or a lot" while
   `open.unassigned` passes with 0 ac and the panel reads "Tests · all pass".
   Pennington Bend's `storm.low_point` passes with a 0-SF pond against 624 SF
   needed. A test that passes when the plan says the opposite is worse than
   no test.
5. **Slope is not in the layout.** River Road Pike falls 287 ft (33% mean
   slope, 78% max); the generator calls the 23 ac "buildable" and blames the
   lot module for finding no street. On that site the honest answer is
   probably a few lots off a long private drive, or one.
6. **"Landlocked" is two opinions.** Wellmoor Ct touches the Wellmoor Ct
   turnaround for 6 ft and touches three vacant parcels, yet the reason says
   "no street edge and no vacant neighbour". Chipmunk Ln is the reverse: the
   frontage layer says landlocked (the red banner), the generator writes as
   if it had frontage.
7. **The single-house seed failed on Wellmoor Ct**: it answers "1 house" with
   no footprint and no size (" SF house @ 1 st"), so even the fallback cannot
   draw it.

## Speed and reliability on a first visit (live)

Measured in the database, in the order the app calls things:

| parcel | by-right plan, first call | planner compile, first | topography, first |
|---|---|---|---|
| Harding Pl | 0.3 s | 5.5 s | 15.3 s |
| Wellmoor Ct | 0.3 s | 3.7 s | 8.0 s |
| Chipmunk Ln | 0.1 s | 0.9 s | 11.3 s — failed ("USGS unavailable"), worked on retry |
| Pennington Bend | 8.8 s (7.9 s again; 0.4 s later) | 2.6 s | 15.8 s — failed, worked on retry |
| River Road Pike | 10.3 s | 0.7 s | **41.3 s** |

- The app calls these RPCs as the anon role, which has a **20-second
  statement timeout** in this project, and the postgres log shows statement
  timeouts firing today. River Road Pike's first topography fetch took 41 s,
  so in the app it is very likely cancelled — and a cancelled fetch caches
  nothing, so the next visit pays it again. This could not be tested end to
  end from the sandbox (no route to the REST API).
- Two of five DEM fetches failed on the first try and succeeded on the
  second. The client already retries on the next visit; nothing tells the
  user why the contours are missing.
- The by-right plan waits for the planner compile before it starts, so a
  first visit to Harding Pl shows its answer after ~6 s, Pennington Bend
  after ~11 s.
- **Correction to the previous round**: "twenty seconds to a two-second
  answer" was my harness's fixed waits, not the app. In fixture mode the
  client shows the by-right panel 0.7–1.3 s after the planner opens; the real
  wait is the server's, above.

## What this change fixes in the client

- **A 0-lot answer left an empty sheet on a buildable lot of record**
  (Harding Pl, Chipmunk Ln). The panel now says "No new lots by right — but
  the parcel itself is one lot" and offers to draw the one house it carries
  (the single-family seed: 1,754 SF on Harding Pl, 2,400 SF on Chipmunk Ln).
  The battery asserts the offer on Martingale Dr's 0-lot answer.
- **A skipped answer left the header on "Generating plan…"** and showed lot
  module and fill-scenario controls that cannot fix "landlocked". The page
  now settles like a 0-lot answer and the controls are hidden.
- **A by-right plan that holds the floodplain out was shown as a floodplain
  plan** because the parcel has a BFE: pads coloured by fill and "does not
  close on site" in red for a cut of 0 cy (Pennington Bend). The fill view now
  needs the plan to build in the flood hazard area; the BFE line stays as
  context; no cut row when none is needed.
- The panel says when the generator used a different module from the one
  asked for; "1 lots" reads "1 lot"; a seed with no footprint says so instead
  of a dead click.

## Still wrong on the page, not fixed here

- The KPI strip says "Code compliant" and "STALLS 0 / 0" on empty answers;
  the tabulation calls the single house a "Townhome"; the legend lists
  Studio to 3 Bed on single-family sheets.
- The pattern panel says "Subdivision on a street grid with rear alleys" over
  frontage lots, and "One house on the lot · generator follows this" over an
  empty sheet.
- The design-context chip says "R40 · Two Family" where the use resolver
  permits single family only.
- The house the seed draws on Harding Pl sits at the lot's narrow tip by the
  street, not where a house goes on a three-acre lot.

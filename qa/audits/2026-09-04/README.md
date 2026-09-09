# Civil sheet record — 2026-09-04

(The three 2400 W Heiman sheet renders were re-shot on 2026-09-09 after
`fn_planner_neighbors` began measuring from the parcel boundary — §17 — so
they now carry the neighbouring lots and buildings greyed out around the
plan, as the multifamily sheets always did.)

Companion renders for `docs/OPTIMIZATION_AUDIT_2026-09-02.md` §15 (Eric:
"The output looks rudimentary. This should look like a full civil set with
elevations, etc.").

- `mdha_subdivision_civil_sheet_screen.png` — 2400 W Heiman (550510, R6,
  13.2 ac) at fit on the fixture battery: the v1.2 layout with USGS 3DEP
  existing contours screened over it (1-ft interval, index every 5 ft with
  elevation labels), station ticks along the spine, the R.O.W. label, lot
  numbers, and the title block (top-right) stating the DEM, the elevation
  range and slopes, the hazard layers and the share held out, the crossing,
  "not a survey", the on-screen scale and NOT FOR CONSTRUCTION. 2,789 DEM
  samples, 154 contours, 406.6–444.6 ft, mean slope 5.4%, max 31.8% on the
  stream bank inside the greenway. Station text, spot grades and alley
  labels stay off until the zoom gives them room.
- `mdha_subdivision_civil_sheet_zoom.png` — the same sheet at 1" = 212':
  stations (3+00 … 13+00) with existing grade at every second one
  ("EG 431.8"), "20' ALLEY" on the rear alleys, index contours labelled
  along the line, lot numbers.
- `mdha_subdivision_civil_sheet_lots.png` — at 1" = 145': every lot carries
  its number, frontage × depth and area ("80' × 78' · 6,203 SF").
- `mdha_subdivision_profile_tab.png` — the Profile tab for the same plan:
  existing grade along the spine (1,991 ft), stations, NAVD88 feet, the
  vertical exaggeration stated, +0.7% overall, steepest 24% over 25 ft at
  the stream culvert (the 102-ft crossing), low 413.2 / high 437.4.
- `heiman_2600_mf_civil_sheet_screen.png` — 2600 W Heiman (553450, RM40,
  2.8 ac) with the same layer on a massing plan: 873 samples, 45 contours,
  417.5–440.1 ft, the title block reading CONCEPT SITE PLAN. No street to
  profile, so the Profile tab reports the site's range and slopes instead
  (unit-tested; not shot here).

Fixture mode (the committed `fn_parcel_topo` responses); the live path was
verified on the database directly (first fetch 24.6 s on the 13-ac parcel,
1.5 s on the 2.8-ac one, cached afterwards).

## 2622 W Heiman — a road to the parking (§16)

- `heiman_2622_mf_access_before.png` — the served plan as Eric saw it
  (geometry drawn from the fixture): the E-shaped bar across the whole
  frontage, three rear bays, and the 127-ft drive spine through the front
  bar that stopped inside the building.
- `heiman_2622_mf_access_after_screen.png` — the app after the seed change,
  fixture mode: the 26-ft access lane down the left side from the curb, the
  aisle strip serving the side rows, every bay reached; the floorplate read
  as bars with a corridor in each; the plan-basis row folded to one line so
  the canvas is the page.
- `heiman_2622_mf_access_after_zoom.png` — zoomed: the corridors and cores
  per bar, units a bank deep, the drive at the bay heads.
- `heiman_2600_mf_access_after_screen.png` — 2600 W Heiman on the same
  change: lane on the right, 96.5% capture (was 99.2% with no road).

## 1200 W H Davis — parking laid out aisle-first (§18, 2026-09-09)

Eric: "This is not how parking would actually be laid out for a building
like this. We've now tried to clean up the example 10+ times." Fixture
mode, the aisle-first seed (nine revisions, each judged on plots of the
live geometry before a fixture was touched).

- `hdavis_1200_mf_aisle_first_screen.png` — the page: 57 apartments in one
  5-storey bar, 99 / 99 stalls (100% of the placed need, 77% of the max —
  the seed no longer lays out for the biggest building the lot could hold),
  the drive straight down the flag pole from the easement to a 24-ft loop
  round the bar, two double-loaded aisles south of it.
- `hdavis_1200_mf_aisle_first_zoom.png` — at 1" = 227': the loop, the four
  rows south of the bar striped as rows, the row along the entry drive in
  the pole.
- `hdavis_1200_mf_aisle_first_zoom_south.png` — at 1" = 171': the south end
  — the two aisles stop together where the need is met (the rows are cut
  square at one radius from the entry), the five-stall row beside the end
  aisle labelled "P · 5".
- `heiman_2622_mf_aisle_first_zoom.png` — 2622 W Heiman on the same seed:
  154 / 154 stalls; the entry drive straight in from the curb, a ring on
  three sides of the E-shaped bar, a rear cross-aisle with three
  double-loaded aisles off it (P · 22 / 23 / 23), the 15-stall row along the
  left flank, every row square to the building. Before this the same field
  was rows merged into wedge-shaped pieces (one counted as "9 rows").
- `heiman_2600_mf_aisle_first_zoom.png` — 2600 W Heiman: 126 / 126 stalls
  in three rows (P · 39 / 42 / 45), an L from the curb to the ring, two
  aisles up the strip with rows back to back between them on a 60-ft
  module; capture 96.5% unchanged.

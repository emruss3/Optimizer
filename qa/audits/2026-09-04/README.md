# Civil sheet record — 2026-09-04

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

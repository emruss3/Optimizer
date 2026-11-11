# Drawing workspace · baseline and slice 1 · 2026-11-11

Scope: "Parcel Proforma — Enterprise SitePlanner drawing and workspace
scope", 2026-11-11. This folder holds the baseline of the drawing surfaces on
main at `1a99da9f` and the evidence for each slice that lands after it.

## How the evidence is made

Inputs are the committed fixtures of the visual battery
(`scripts/visual-battery/fixtures/mock_store.json`), served by its mock, with
the dev server on :5199. Nothing here reads the live database.

```
MOCK_STORE=scripts/visual-battery/fixtures/mock_store.json node scripts/visual-battery/mock-supabase.mjs &
npx vite --port 5199 &
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/drawing-scope/capture.cjs OUT_DIR
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/drawing-scope/check-slice.cjs OUT_DIR
```

`capture.cjs` saves the 2D sheet and the 3D view of seven fixtures at
1440×900 and 1920×1080, and the 2D sheet at 1280×800. `CAPTURE_QUERY=?drawing=classic`
captures the original drawing path on any later build.

| Fixture | Parcel | What it stands for |
|---|---|---|
| 682644 | 4701 Bowfield Dr, R8 | subdivision |
| 488278 | 1710 Meharry Blvd, RM20 | multifamily, one building, surface parking |
| 669046 | 1200 W H Davis Dr, RM40 | multifamily, surface parking |
| 469303 | 535 Main St, MUG-A | wrap round a garage and a court |
| 686430 | 4255 Brick Church Pike, R20 | sloped site with flood and hillside holds |
| 672526 | 0 Hickory Bend Dr, RS10 | no generated geometry |
| 408571 | 2405 12th Ave S, CS | commercial: capacity only, no scheme |

## Baseline findings

`baseline/` holds 35 captures. In order of what they cost a reader:

1. **The plan reads every length 24% long.** The canvas draws in EPSG:3857,
   where a metre on the map is 0.81 m on the ground at Nashville. The scale
   bar, the "SCALE 1 in = N ft" line, the measure tool and the dimension
   callouts all read map metres as ground metres. The engine's own frame
   (EPSG:2274, feet) gives the 1710 Meharry Blvd building a long side of
   201.5 ft; the plan's reading of it is 250 ft. The 3D view applies the
   correction, so the plan and the model disagreed with each other.
2. **The selected building's panel is wrong on a generated plan.** On the same
   building it reads "49 × 0 ft · 0 SF GFA": it fits a rectangle to a traced
   footprint. The callouts on the canvas read "49 ft" and "0 ft".
3. **A height is shown nowhere and assumed everywhere.** The 3D view extrudes
   14 ft plus 10 ft a floor for every use and says only "N floors". Nothing
   says the height is an estimate. No plan the engines return carries a
   height.
4. **The views share nothing.** No tag names a building across them. The 3D
   view has no selection and no inspector. A selection in the plan is lost on
   the way to 3D.
5. **The export is a picture of the screen.** The report embeds a PNG of the
   canvas at whatever zoom it was in.
6. **The drawing is the smallest thing on the page.** At 1440×900 the plan
   canvas is 1,008 × 310 px: a quarter of the viewport.
7. **Labels cover the plan and each other.** On 535 Main St the four building
   captions overlap one another and the garage label; the scale bar sits under
   the zoom buttons.

Seen and not part of this slice:

- 1710 Meharry Blvd: the tabulation reads "FAR 0.00" and "Coverage 0%" under
  a 54,244 GSF plan.
- 1710 Meharry Blvd: the plan is four stories and the context panel reads
  "Max height 30 ft". The app does not judge it, because it has no height to
  judge with. It is a question for the engine side.

- 535 Main St: the four bars carry 129 units between them under a 131-unit
  schedule. The app's share of the mix across buildings rounds down twice. The
  scene now says so on the sheet ("The drawn features do not add up to the
  scheme schedule") instead of printing either number as if they agreed. The
  fix belongs in the plan mapper.

## Slice 1 · one scene, three views

One saved multifamily parcel, 488278: the same building id, footprint, story
count and height in the plan, the 3D inspector and the first vector sheet.

What changed:

- `src/features/site-plan/scene/` is the scene contract. `buildDrawingScene`
  takes the accepted scheme's elements and returns identity (parcel, scheme,
  revision hash), features with their own ids and roles, buildings with a tag
  (A, B, C), the frame, and where each value comes from. It is read-only: it
  adds no feature and recounts nothing.
- One frame (`scene/frame.ts`) converts EPSG:3857 to ground feet, once, with
  the ellipsoid's two scale factors. It is checked against the plan itself: a
  footprint's area in the frame must equal the area the engine reports.
- One table (`scene/heights.ts`) turns a story count into a height, by use.
  Every height from it is labelled "Estimated height" and carries the sentence
  "Not a measured or controlling height".
- The plan reads lengths through the frame, tags buildings, and its selected
  building panel reads the scene. The 3D view takes the same selection, lists
  the buildings by tag and shows the inspector.
- "Sheets" opens A-01 Site Plan as a vector sheet at 11 × 17 in or letter,
  with a schedule, legend, north arrow and scale bar. A numeric scale is
  printed only when the frame check passes.
- `?drawing=classic` turns all of it off: the original path is intact.

Where each value comes from:

| Value | Source | Shown as |
|---|---|---|
| Building id | the plan element's id | as is |
| Tag | order of the buildings in the plan | A, B, C |
| Stories | engine | "4 stories" |
| Footprint | engine | "13,561 sf · from the plan" |
| Gross area | footprint × stories | "54,244 sf · footprint × stories" |
| Units | engine | "30 · from the plan" |
| Height | estimated from stories | "Estimated height 44 ft · above grade" |
| Ground elevation, datum | not in the scene | "not in this model" |
| Sheet scale | frame checked against the engine's footprint | "1 in = 50 ft at full size", or graphic scale only |

Evidence in `slice-1/`:

- `after/`: the same 35 captures as the baseline.
- `check/`: screenshots of the plan, the model and the sheet, the sheets as
  SVG and PDF at both sizes, a screen recording (`slice.webm`) and
  `check.json`.

Checks:

| Check | Result |
|---|---|
| `npx vitest run` | 66 files, 687 tests pass (24 new, in `scene/scene.test.ts`) |
| `npm run build` | passes |
| `npm run typecheck` | passes, and checks nothing: the root config only lists references |
| `npx tsc --noEmit -p tsconfig.app.json` | 2,096 errors on main, 2,086 after; no file gained one, the new files have none |
| `scripts/drawing-scope/check-slice.cjs` | 25 of 25 |
| visual battery | `requireScene` added for 488278 |

The frame check on the seven fixtures: verified on the three multifamily
plans (0.01%) and on the subdivision (35 lots, within 0.4%); not checkable on
the single-house plan and the two with nothing drawn, which print a graphic
scale only.

Time to the first 3D frame on the dev server was 8 to 11 s on every fixture,
before and after: it is the first load of the 3D code, not the scene. It has
not been measured on a production build yet.

## Not done yet

- The 3D view is still a massing model, and the sheet is a line drawing.
  Rendered buildings and a deck-ready site plan are the next slice.
- Cameras (Aerial, Top, Street, Fit site), section A–A, scheme comparison and
  sheets A-02 and A-03.
- Label collision handling is on the sheet only; the canvas places building
  tags without it.
- The plan canvas is no larger than it was.

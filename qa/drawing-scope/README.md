# Drawing workspace · baseline and slices 1 to 3 · 2026-11-11 and 12

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

## Slice 2 · renderings and an illustrative site plan

The owner's direction after slice 1: the buildings must look like renderings
of things that would be built, with sidewalks and trees, and the 2D plan must
be something to put in front of a city or an investor.

What changed:

- **Buildings are built from parts** (`ui/architecture.ts`). A house: a
  foundation, sided walls, a gable roof with eaves, fascia and rake boards, a
  porch with posts and a step, a front door, a garage door, trimmed windows
  with shutters, a chimney, planting at the foot of the front wall and a walk
  to the pavement. It turns its front to the nearest drive. A townhome: a
  stoop, a door, a garage, a canopy and a cornice, in its own colour in the
  row. An apartment building: a brick base with shopfront glass, an entry
  with a canopy, stacks of balconies with railings, projecting bays, a
  parapet, planting and equipment on the roof. Every one stands on the plan's
  footprint and rises to the scene's height.
- **The site is drawn** (`scene/landscape.ts`, `ui/massingData.ts`): walks
  and planted strips along the plan's own streets, a walk round each larger
  building, curbs, the block's streets with their own walks and a centre
  line, driveways in concrete, street trees, yard trees and edge planting,
  stall stripes where they can show exactly the reported count, and cars in
  about half the stalls and driveways.
- **The 3D view is a rendering** (`render3d/`, three.js): textured materials
  (lap siding, brick, shingles, concrete, asphalt, turf), glass that reflects
  the sky, a sun that casts soft shadows, light from the sky, ambient
  occlusion, and a film tone curve. Cameras: Aerial, Top, Street, Fit site,
  turn left and right. PNG at twice the screen's resolution. Selection, the
  building tags and the inspector are the same as before. If a device cannot
  draw it, the view falls back to the deck.gl model; `?drawing=classic` is
  the original massing.
- **Sheet A-01 is an illustrative site plan**: a render of the same model
  from straight above, lit from the upper left, with the plan's linework,
  tags, street names and labels over it in vector, key figures, a building
  schedule, a legend and a site data table. Three sizes: a 16:9 slide,
  11 × 17 and letter. Download as PNG at 200 dpi, as SVG, or print. "Drawn"
  switches to the flat drawn plan.

This adds three.js, a second rendering library. The scope said not to add
one; the owner's direction on quality came after it and takes precedence.
The deck.gl view is kept as the fallback and the classic path.

What is the plan's and what is illustration:

| On the picture | Source |
|---|---|
| Footprints, positions, story counts, eave and parapet heights | the plan, through the scene |
| Streets, drives, driveways, parking bays, lots, open space | the plan |
| Stall stripes | drawn only where they show exactly the reported count |
| Roof pitch above the eave, facades, windows, doors, porches, balconies | illustration |
| Walks, curbs, trees, shrubs, cars, shadows, sky | illustration |
| Existing buildings | the public record's footprints and story counts, as white solids |

The view and the sheet both say so on their face.

Checks:

| Check | Result |
|---|---|
| `npx vitest run` | 68 files, 704 tests pass (17 new: architecture, planting, stripes, sheet) |
| `npx tsc --noEmit -p tsconfig.app.json` | 2,086, the same as main after slice 1; the new files have none |
| `scripts/drawing-scope/check-slice.cjs` | 36 of 36 |

Time from the 3D button to the rendering being ready, on the dev server with
software graphics: 4.0 to 6.2 s across the six fixtures with a plan (slice 1
measured 8 to 11 s to the massing view on the same machine). The 3D code is
a lazy chunk of 792 kB, 210 kB gzipped. Not yet measured on a production
build with a graphics card.

Evidence in `slice-2/`: `after/` (the fixtures in 2D and 3D at 1440×900 and
1920×1080), `sheets/` (the rendered sheet for four fixtures), `check/`
(screenshots, sheets as SVG and PDF, a screen recording).

An honest mark, by the author: the renders and the sheet are about 7 out of
10 against "what you would show a city or an investor today". They are
clean, lit and legible. They are not photoreal: materials are simple, the
planting is stylised, and there are no people, lights or site furniture.

## Slice 3 · a rendering sheet and a presentation mode

- **Sheet A-02 Aerial View**: a rendering of the scheme filling the page,
  over a band with the project, the scheme's figures and a plain statement
  of what is illustration. Same three sizes, PNG, SVG and print as A-01.
- **Present**: the rendering fills the window; Escape returns.
- The aerial camera looks from the diagonal the neighbouring buildings block
  least (1710 Meharry Blvd had a neighbour standing in front of the site).
- A light colour grade and vignette after the tone curve; three tree habits.
- **A fault from slice 1 fixed**: Escape in the sheets closed the whole
  workspace under them. It now closes the sheets only. The check asserts it.
- The sheet window paints before its render starts, so the page no longer
  looks frozen for the few seconds a render takes.

Checks: 68 files, 706 tests pass; app type check 2,086, unchanged;
`check-slice.cjs` 42 of 42. Evidence in `slice-3/check/`.

## Slice 4 · buildings in four styles, and a wooded setting

The owner's note on slice 3: the buildings were "bad boxes", the elevations
should be current, and the reader should be able to flip between a few
architectural styles. The model has to stand on its own before any photo pass.

**What a style is.** A style changes how the buildings look and nothing else.
Footprints, positions, story counts and heights are the plan's in every one.
The switch is on the 3D view and on the sheets, and the choice is kept on the
device.

| Style | Houses | Row homes | Apartments |
|---|---|---|---|
| Urban mansard | brick ground story, the top story in a shingled mansard with boxed dormers; a one-story house is a gabled cottage with a brick wainscot | brick, coloured siding, mansard with a dormer, a balcony over the door, window boxes | brick base, two claddings in stretches, balconies, a mansard story with dormers |
| Modern farmhouse | white or dark board and batten, steep gables, metal porch roofs on timber posts | a gable to each home, timber in the peak, metal awnings | gabled bays that rise past the roof line |
| Contemporary | flat roofs, white stucco over charcoal panels, cedar at the entry, wide glass | cedar strip, glass rails, a deck and a stair head on the roof | panels in stretches with raised parapets, glass balconies backed in cedar |
| Craftsman and brick | lap siding, shingled gables, deep eaves, columns on brick piers, a chimney | brick with stone heads and a cornice, a stoop with a rail | brick with steel windows, piers, a stone band and a cornice |

**What a house now is.** A foundation, walls in a real material, a porch cut
into the pad (the house keeps to the pad the plan gave it), a front door with
a sidelight, a garage where a drive comes to the house and none where no
drive does, windows with frames, glazing bars and sills, a roof with eaves,
fascias and valleys, a walk to the street, planting beds. A deep pad turns
its gable to the street; a wide one runs its ridge along it.

**A row home** has two fronts: the end a drive comes to has the garage, the
other has the front door. Its long sides are party walls where a neighbour
stands against them, and walls with windows where it ends the row.

**The setting.** The surroundings are wooded out to the haze: each tree is a
portrait painted from the real tree model's own leaves, carried on crossed
cards, so thousands cost almost nothing. They stand in groves, not on a grid.
An existing house is drawn as a house, an existing larger building with
windows under a parapet. In a subdivision each yard has its own shade of
lawn and a board fence stands on the lot lines behind the house. The fence
is illustration: the plan draws a lot line, not a fence.

**Lighter to draw.**

| Model | Triangles before | Triangles now |
|---|---|---|
| One shrub | 16,944 | 1,662 |
| One tree (ash, medium) | 27,040 | 18,012 |
| One surrounding tree | about 1,200 | 16 |

**Faults found and fixed on the way.**

- After a plan changed while the 3D view was open, the new model was drawn
  with no sun. A rebuilt model now has its sun and its selection set again.
  The check catches it: a change of style may alter only a small part of the
  picture, and the first style must come back as it was.
- A sheet opened before the 3D view could render trees with no leaves. A
  still now waits for the tree pictures to arrive.
- The front walk stopped at the driveway's distance. It runs to the street.

**The photoreal pass** (the Photoreal button and the A-02 toggle) is in this
slice as plumbing: the function, the client, the labels and the tests. The
instruction to the image model now names the style and says to keep the
architecture as drawn. It has not been run against the real image model: the
gateway key in this environment was refused. It is exercised through a
stand-in.

**The lab.** `scripts/drawing-scope/style-lab.html` draws a street of houses,
a row of homes or a pair of apartment buildings through the app's own code,
close enough to judge an elevation, in about ten seconds:
`/scripts/drawing-scope/style-lab.html?style=farmhouse&set=houses`.

**Rating, honestly.** Close up, the buildings are a 7 to 8 against "what
would actually get built": the massing, materials and openings are right for
each style, and they are not boxes. They are still clean computer models:
flat lawns, no people, lights, fences or site furniture, glass with no rooms
behind it, and no weathering. The aerial is a 7. It is not yet the 9 asked
for.

The townhome engine's homes are 20 ft wide at 26 ft centres: detached narrow
homes six feet apart. Each is drawn free on all four sides, the mansard
wrapping round it (`app/app_townhomes_aerial.jpg`).

Checks: 69 files, 762 tests pass; app type check 2,086, unchanged;
`check-slice.cjs` 57 of 57. Evidence in `slice-4/`: `styles/` (each product
in each style), `app/` (the app's own views and sheets), `check/`.

## Not done yet

- Section A–A (sheet A-03) and scheme comparison.
- The edge the app labels as the front is wrong on some parcels (1710 Meharry
  Blvd: the west edge, with streets to the east and south). Planting no
  longer follows it; the setback labels on the 2D canvas still do.
- Label collision handling is on the sheet only; the canvas places building
  tags without it.
- The plan canvas is no larger than it was.
- The photoreal pass has not been run against the real image model.
- Toward a 9: ground materials from photographs, depth behind the glass,
  fences, lights and site furniture, rear porches and decks, more than five
  tree habits, terrain.
- Townhomes are assumed three stories; a house's story count comes from the
  engine's catalogue plan and is one where there is none.

# Render regression baseline, 16 November 2026

The first run of the regression set (`scripts/render-regression`) on main at 51d7244 plus
the runner. All 16 parcels opened in the live 3D view without an error. What the pictures
show is another matter: see the findings. `contact-sheet.jpg` has every parcel's drone and
street shot.

## Results

| Parcel | Class | Plan pattern | Ground | Deepest cut / fill, ft | Model build, ms | Street view |
| --- | --- | --- | --- | --- | --- | --- |
| 1710 Meharry Blvd | apartments, small, gentle | bar_on_frontage_rear_field | graded, 4.4% to 4% | 7.2 / 5.6 | 1028 | found |
| 2600 W Heiman St | apartments, small, flat | court_scheme_perpendicular_bars | graded, 2.3% to 2.3% | 2.2 / 3.3 | 1250 | found |
| 5525 Mt View Rd | apartments, steep (85 ft of relief) | bar_on_frontage_rear_field | graded, 12.8% to 4% | 16.7 / 14 | 884 | none |
| 0 Whites Creek Pike | apartments, mid size, sloped | court_scheme_perpendicular_bars | graded, 8.1% to 4% | 12.3 / 8.3 | 1730 | found |
| 0 Smith Springs Rd | apartments, larger, sloped | court_scheme_perpendicular_bars | graded, 5.5% to 4% | 15.5 / 7.5 | 3966 | found |
| 1200 W H Davis Dr | apartments, no survey | landlocked_axis_bar | flat | n/a | 526 | found |
| 535 Main St | mixed use, urban | wrap_garage_courtyard | graded, 3.1% to 3.1% | 3.8 / 4.7 | 1347 | found |
| 303 E Palestine Ave | single lot, infill, no survey | house_on_lot | flat | n/a | 381 | found |
| 0 Union Hill Rd | subdivision, 3 lots | house_on_lot | graded, 1.8% to 1.8% | 2.3 / 2.7 | 1142 | found |
| 6404 Eatons Creek Rd | subdivision, 3 lots, sloped | subdivision_row_spine | graded, 6% to 4% | 3.2 / 3.4 | 958 | found |
| 0 Hickory Bend Dr | subdivision, 9 lots, flat | subdivision_row_spine | survey | n/a | 934 | none |
| 0 Hills Ln | subdivision, 14 lots | subdivision_row_spine | graded, 5% to 4% | 3.7 / 5.4 | 1427 | found |
| 4701 Bowfield Dr | subdivision, 35 lots, sloped | subdivision_street_grid | graded, 8.1% to 4% | 15.7 / 18.6 | 2496 | found |
| 0 Martingale Dr | subdivision, 147 lots, 70 acres | subdivision_street_grid | survey | n/a | 2272 | none |
| 4255 Brick Church Pike | very steep (28% average) | subdivision_row_spine | graded, 10.8% to 4% | 3.3 / 1.7 | 1073 | found |
| 2400 W Heiman St | large site, 13 acres | subdivision_row_spine | graded, 1.9% to 1.9% | 15.4 / 15.7 | 2180 | none |

Model build times were taken at the full quality tier with timing on, on a 4-core machine
with no graphics card. Range 381 to 3966 ms, median 1250 ms.

## Findings

1. **A subdivision whose plan has lots but no houses renders as an empty field.**
   0 Hickory Bend (9 lots) and 0 Martingale (147 lots, 70 acres) show the parcel as bare
   ground with the existing neighbourhood round it. Nothing says houses are missing.
   The model reports plain surveyed ground there because there is no building to seat.
   See `672526-drone.jpg`, `680719-drone.jpg`.
2. **On a large site the drone view is too far away to read.** Martingale and 2400 W Heiman
   frame the whole parcel and the scheme is a few specks. See `680719-drone.jpg`, `550510-drone.jpg`.
3. **A striped pattern shows across the ground of the large sites.** It was not there before
   the model stood on the survey. Not traced.
4. **One graded surface for a whole site implies far too much earthwork on four parcels:**
   15 to 19 ft of cut or fill at Mt View, Smith Springs, Bowfield and W Heiman. A site that
   size is graded street by street and lot by lot.
5. **The street view is wrong for houses.** It picks one house and stands too close: Bowfield
   is cropped at the eaves, Hills Ln shows a back wall and patio. A subdivision needs a view
   along its street. See `682644-street.jpg`, `680391-street.jpg`.
6. **No street view at all on 4 of 16:** Mt View, Hickory Bend, Martingale, W Heiman.
7. **The model takes over 2 seconds to build on 4 of 16,** and nearly 4 seconds at Smith Springs.
8. **Where it works, it works:** Bowfield's 35 lots from the air read as a neighbourhood on
   real ground (`682644-drone.jpg`), and the very steep Brick Church Pike lot sits properly on
   its slope (`686430-drone.jpg`).

## Not in the set yet

- A townhome scheme. The runner takes the plan the workspace opens with, and none of these opens on townhomes.
- A refused parcel.
- Blender stills. This run is the live view only.

## How to run

```sh
# the app in dev mode on :5199 against the fixture store, then
node scripts/render-regression/run.cjs out/regression            # all 16, about 25 minutes
node scripts/render-regression/run.cjs out/regression 682644     # one parcel, keeping the others' rows
```

# Engine handoff: terrain good enough for cut and fill, any county

From the app session, 2026-11-23. Owner's words: "Let's do all 4. But I want
to be able to scale this outside of Davidson County."

## Outcome

Every plan the engines draw carries a conceptual grading result: cut, fill,
net balance, maximum depths and implied walls, computed from the plan's own
streets, pads and driveways on real ground. It must work for a parcel in any
US county without a per-county data load.

## Where things stand (read from the live database, 2026-11-23)

| Item | State |
|---|---|
| Source | USGS 3DEP 1 m DEM, NAVD88 feet, through `elevation.nationalmap.gov/.../3DEPElevation/ImageServer/getSamples` |
| Fetch | `fn_parcel_topo_fetch(p_ogc_fid, p_spacing_ft default 20)`: one HTTP call per parcel, 12 s timeout, three attempts |
| Cache | `public.parcel_topo` (one raster per parcel; `spacing_ft` 20 or 40): 360 parcels |
| Failures | `public.parcel_topo_fail`: 1,713 rows. I did not break these down by cause or date |
| Reader | `fn_parcel_topo(p_ogc_fid)`: parcel plus 100 ft margin; also answers for `training.virtual_parcel` ids |
| Earthwork | `fn_sf_v1_earthwork` computes floodplain fill and the compensating cut only. Its apron, street rise, pond depth and cut depth are labelled assumptions |
| Grade checks | The subdivision engine already tests `street.grade_max` |
| 3D view | The app flattens the site to a plane capped at 4% (`gradeSite` in `render3d/terrain.ts`) and reports the cut and fill that implies. On 5525 Mt View Rd that is a fitted 12.8% slope shown at 4%, with 17.2 ft of cut and 15.8 ft of fill. No engine designed that grading |

Not checked: which GDAL drivers are enabled, whether out-of-database rasters
are allowed, and which of `http`, `pg_net`, `pg_cron` are installed.

## The four steps

### 1. Reliable terrain, with no county in the design

- Cache terrain by **tile**, not by parcel. A fixed grid in a national
  projection, keyed by tile id and resolution. A parcel reads the tiles it
  touches. Neighbouring parcels and combined sites then share one fetch.
- Fetch a whole tile in one request (the image service's raster export)
  instead of thousands of point samples, if the database can decode it.
  Otherwise keep `getSamples`, batched per tile.
- **Fallback ladder, recorded on every tile:** 3DEP 1 m where it exists,
  then 1/3 arc-second (about 10 m), which covers the whole country. Store the
  source, resolution and fetch date. A plan graded on 10 m ground must say so.
- Fill tiles ahead of need with a background job for parcels people open,
  so the planner rarely waits on USGS. Do not schedule a cron job without the
  owner's say.
- Keep `fn_parcel_topo` as the app's contract. It should read from tiles and
  return the same shape, plus `source` and `resolution_ft`.

Acceptance: a parcel outside Davidson County (the table already holds one in
Priceville, AL, id 9000001) returns terrain with its source named. A second
call for the same parcel makes no HTTP request. The failure table stops
growing for parcels whose tiles are cached.

### 2. Finer sampling where it matters

- Keep 20 ft for the whole parcel.
- Sample at 5 ft along street centre lines, under pads and along driveways.
  With 1 m tiles in the cache this is a raster read, not a new fetch.
- Where only 10 m ground exists, do not pretend to 5 ft detail: interpolate
  and flag it.

### 3. Grade the plan, not the parcel

Compute grading from the plan's own surfaces:

- **Street profiles** held under the maximum grade, with vertical curves
  where grade changes.
- **A pad elevation per lot or building**, set from its street: a stated
  rise above the street at the drive, stepped between neighbours where the
  ground falls.
- **Driveway slopes** from the street to the garage or parking pad, with a
  limit.
- **Tie-in slopes** back to existing ground at 3:1. Where 3:1 does not fit
  inside the lot or the site, record a **wall** with its height and length.
- **Volumes** by differencing the graded surface against existing ground.

Rules that apply:

- Every limit is a parameter in `fn_sf_v1_params()` / `fn_th_v3_params()`
  with its source noted, or comes from the learned context. No hardcoded
  values.
- Keep it behind an option until it is measured.
- Measure before and after on the replay sets and the cohort guard. No pass
  may be lost. USGS outages let replay skip terrain (`no_topo`), which
  flatters the engine: say so in the result.
- Townhomes and apartments need the same treatment as subdivisions. Mt View
  (660125, 85 ft of relief) is the case that exposed this.

### 4. Report it

On every plan, a `grading` object:

```
{ "basis": "conceptual, from USGS 3DEP 1 m lidar, 2026-11-23",
  "source": "3dep_1m" | "3dep_10m", "resolution_ft": 3.3,
  "cut_cy": 0, "fill_cy": 0, "net_cy": 0,
  "max_cut_ft": 0, "max_fill_ft": 0,
  "walls": [ { "height_ft": 0, "length_ft": 0, "wkt": "..." } ],
  "pads": [ { "id": "...", "elev_ft": 0, "cut_ft": 0, "fill_ft": 0 } ],
  "street_profiles": [ { "id": "...", "max_grade_pct": 0, "stations": [ ... ] } ],
  "assumptions": { "tie_in_slope": "3:1", "pad_rise_ft": 0, "drive_max_pct": 0 },
  "not_covered": ["rock", "survey", "trees", "post-flight grading"] }
```

The app session will then: show these numbers in the panel and on the
sheets, drive the 3D view and the A-03 section from the engine's pads and
profiles instead of the 4% plane, and remove the renderer's own cut and fill
figures.

## What this will not give

- It is not a survey. Lidar misses ground under dense trees, recent grading
  and anything built since the flight.
- It says nothing about rock, which drives earthwork cost in Nashville more
  than volume does. That needs soils data or borings.

## Related work already live from the app session (do not undo)

- Combined sites are virtual parcels with negative ids (`parcel_assemblage`,
  `fn_assemble_parcels`, `fn_compile_assemblage_context`, releases
  `g44_assemblage_v1` and `g45_assemblage_v2_rm`). See `docs/ASSEMBLAGE.md`.
  Tile-based terrain should serve them with no special case.
- Every function the browser calls must be tested as the `anon` role before
  a release is recorded. A change of mine broke signed-out calls for about
  15 minutes on 2026-11-17 because it was tested only as the owner.

## Open questions for the owner

1. May the engine session schedule the background tile fill?
2. Is 10 m ground acceptable for a first answer outside lidar coverage, or
   should the planner decline to grade there?

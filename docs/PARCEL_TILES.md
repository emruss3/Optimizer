# Parcel map tiles

Scope: "Parcel Proforma · Scalable parcel map", 2026-11-23. This file is the
control record, the design, the runbook and the gate matrix. It is updated as
gates close. An untested item stays open.

## 1. The control: what production does today

Recorded 2026-11-24 from `main` at `9dab84d`, the live database and the code.

| Item | State |
|---|---|
| Map entry point | One: `App` → `MapPanel` → `Map` → `MapView`. `SelectionOutlineUpdater` targets layers that are never created (dead code) |
| Camera | Opens at zoom 12 on Nashville (`src/lib/mapbox.ts`), max zoom 17 |
| Parcel source | `mvt-parcels` edge function → `parcels_mvt_b64(z,x,y)` RPC. Source `minzoom 14`, `maxzoom 17`, `promoteId: "ogc_fid"` |
| Below zoom 14 | No parcel lines, by design: the edge answers 204 and the RPC returns NULL |
| Tile function | Per request: bbox filter on `wkb_geometry_4326`, `ST_MakeValid`, transform to 3857, geodesic area for `sqft`, `ST_AsMVT`, base64. Any exception returns NULL |
| Edge caching | 200: `max-age=600`. An upstream error or NULL answers 204 cached for 600 s, so a transient failure is cached as an empty tile for ten minutes |
| Layer schema | One layer `parcels`, extent 4096. Properties `zoning`, `sqft`. `ogc_fid` is the feature-header id only |
| Tile consumers | Fill colour by `sqft` or `zoning`; size filter at 5,000 and 20,000 sf; zoning filter; click (by id, else point lookup); project highlight by feature state |
| Data | One county in `public.parcels` (Davidson, geoid 47037). About 267,000 rows. `ll_updated_at` up to 2025-05-29. `ogc_fid` is unique (unique index `tn_davidson_pk`) |

### Findings

1. **Clicks and project highlights do not use the tile id in production.** The
   live tiles carry `ogc_fid` only as the feature-header id. `promoteId:
   "ogc_fid"` tells Mapbox to read the id from a property of that name, which
   the tiles do not have (Mapbox 3.14 `FeatureIndex.getId`). Every feature
   therefore has no id: a click always falls back to `get_parcel_at_point`,
   and `setFeatureState` for project highlights never matches a feature.
   Evidence: decoded tile `17/33930/51412` in
   `scripts/parcel-tiles/__fixtures__/legacy_17_33930_51412.pbf`, and the test
   that asserts it. The legacy path is left unchanged as the control.
2. **`parcels.sqft` is NULL on every row**, so the tile function computes a
   geodesic area for every feature of every tile on every request.
3. **The projected and simplified columns are not usable.** `geom_3857`,
   `wkb_geometry_3857` and `geom_simplified` are NULL on the three rows
   checked by primary key (302032, 594607, 595148), while their indexes are
   full size. A bbox query on `geom_3857` returns no
   rows for central Nashville. The build reprojects from `wkb_geometry_4326`.
4. **Six GiST indexes cover `wkb_geometry_4326`** (`gix_parcels_wkb4326`,
   `idx_parcels_geom`, `idx_parcels_geom_4326`,
   `idx_parcels_wkb_geometry_4326_gist`, `parcels_geom_gix`,
   `parcels_wkb4326_gix`). Each write updates all six. Not changed here: an
   owner decision.
5. **The database was I/O-bound during this work.** On 2026-11-24 around
   00:30 UTC a 0.3% table sample and a 250-parcel bbox export both waited on
   `DataFileRead` past 60 s. At the same time about a dozen other sessions had
   queries running for minutes, and a `create index concurrently` on
   `public.parcels` had run 47 min. Any tile timing taken from this database
   includes that load. Every query of mine that hit the tool limit was
   cancelled.
6. **No neighbouring county is imported.** The scope's Williamson and
   county-line fixtures cannot be run until one is.

### Not yet captured

- Browser timings (map open to first drawn parcel, pan refill, frame times,
  click to drawer). They need a browser run against production; the sandbox
  cannot reach the deployment or `api.mapbox.com`. The tile half runs in CI
  (`parcel-tiles` workflow, `bench`).
- Repeated and concurrent probes against a staging copy. None exists.
- The Regrid licence terms for public, CDN-delivered tiles. Owner item.

## 2. The candidate: tiles built once per data release

```
public.parcels ──fn_parcel_tile_export──▶ parcels.geojsonl ──tippecanoe──▶ tiles/z/x/y.pbf
   (service_role only, paged)              (+ snapshot)        (validated)        │
                                                                                  ▼
 map ──▶ manifest.json ──▶ releases/<release>/{z}/{x}/{y}.pbf   Supabase Storage, public bucket parcel-tiles
```

- **Export** (`supabase/migrations/20261124000000_parcel_tile_export.sql`,
  not applied). `fn_parcel_tile_export(p_after, p_limit)` returns pages of
  newline-delimited GeoJSON in `ogc_fid` order. The geometry is
  `ST_CollectionExtract(ST_MakeValid(wkb_geometry_4326), 3)` at 7 decimals.
  `sqft` is computed the same way the live tiles compute it, so filters and
  colours do not move. `fn_parcel_tile_snapshot()` is read before and after
  the export; if the data changed in between, the export is refused. Both
  functions are executable by `service_role` only.
- **Build** (`scripts/parcel-tiles/build.mjs`). tippecanoe 2.49 from the
  Ubuntu 24.04 packages. One layer `parcels`, zooms 10–17. Every parcel is kept
  from zoom 12 (base zoom); at 10–11 the smallest may be dropped to stay under
  500 KB a tile. Shared borders are simplified once. Fields are `ogc_fid`,
  `zoning` and `sqft` only. `ogc_fid` is both the feature id and a property.
  Tiles are uncompressed. The build fails if any tile does not decode, has
  another layer, lacks the id both ways, carries another field, is over the
  byte limit, or if any zoom is empty.
- **Publish** (`scripts/parcel-tiles/publish.mjs`). It uploads to
  `releases/<release>/`, immutable, with a year's cache. It writes the
  release's own manifest beside its tiles, then reads a sample back through
  the public URL. Only after that does it rewrite `manifest.json` (60 s
  cache). The previous release is never deleted. Rollback is
  `publish.mjs --rollback <release>`, which rewrites `manifest.json` to point
  back. Creating the public bucket needs `--confirm-public`.
- **Map** (`src/lib/parcelTiles.ts`, `src/components/MapView.tsx`). The source
  is `legacy` unless `?parcelTiles=candidate`, the same value saved on the
  device, or `VITE_PARCEL_TILES=candidate` asks for the candidate. The
  candidate reads the manifest (4 s limit), checks it, and adds the source
  with the release's zooms and bounds. If anything is wrong it uses legacy and
  says why. The map container carries `data-parcel-tiles`,
  `data-parcel-tiles-release` and `data-parcel-tiles-fallback`. With the
  candidate active, opening and panning make no parcel SQL or edge request:
  tiles come from storage.

### Evidence so far

| Check | Result |
|---|---|
| Candidate vs live tile, 12 South `17/33930/51412` | Same 67 parcels, same `zoning`, same `sqft`. The candidate also carries `ogc_fid` as a property (test in `scripts/parcel-tiles/lib.test.mjs`) |
| Build on that sample | 20 tiles z10–17; at z10, 63 of 67 parcels kept; validation clean |
| Benchmark harness | Runs end to end against a local release; counts decoded features per response |
| Full Davidson build | Not run: needs the export function applied and the service-role secret |

## 3. Runbook

All jobs are in the `parcel-tiles` workflow (Actions → parcel-tiles → Run
workflow).

| Job | Needs | Does |
|---|---|---|
| `bench` | nothing | Fetches every fixture tile from the live tiles (and a release, given its manifest URL), `samples` times each, interleaved. Artifact `bench.json`: raw samples, p50/p95 per tile and source, statuses, decoded feature counts |
| `build` | migration applied, secret | Export, build, validate. Uploads the manifest and report as an artifact. Publishes nothing |
| `publish` | the same | Build, then publish and make live. `confirm_public: yes` the first time, to create the public bucket |
| `rollback` | secret | Makes the named earlier release live |

The secret is `PARCEL_TILES_SERVICE_ROLE_KEY`, the project's service-role key,
added under repository settings. The workflow reads it only in the build and
rollback jobs and never prints it.

### Adding the next licensed county

1. Import the county into `public.parcels` with its own `geoid`. Check
   `ogc_fid` stays unique across counties and fits a JavaScript number (it is
   an integer column, so it does). Resolve collisions at import, never by
   casting a UUID into `ogc_fid`.
2. Add the county to `markets` in `scripts/parcel-tiles/config.json`.
3. Run `build`, read the report (tiles, bytes and largest tile per zoom), then
   `publish`. A tile that spans two counties holds both, because one release
   is built from one snapshot of the whole table.
4. Add fixtures for the county, and a county-line fixture, to
   `scripts/parcel-tiles/fixtures.json`.

Incremental rebuilds (only the tiles a changed parcel touches) are not built
yet: every release is a full rebuild. Open item, sized once a full build's
time is measured.

## 4. Gates

| Gate | Status | What closes it |
|---|---|---|
| Control frozen | Partial | SHA, SQL, indexes, schema and consumers recorded above. Browser traces and staging probes are open |
| Fixtures verified | Partial | Seven parcels from saved authoritative records. Interior click points, DELUX WeHo, The Lanes, multipart, shared edge and county line are open (`fixtures.json` → `pending`) |
| Geometry audit | Partial | Findings 2–4. A full validity and bounds audit was not run on the saturated database |
| Licence for public tiles | Open | Owner confirms the Regrid agreement allows public, CDN-delivered parcel tiles |
| Full build | Open | Migration applied, secret added, `build` run, report read |
| Tile size and density by zoom | Open | From the full build report |
| Initial view at zoom 12 | Open | Browser run: lines visible, cold p95 ≤ 1.0 s desktop |
| Usable viewport and pan | Open | Browser run, paired with the control |
| Click correctness | Open | Every verified interior point opens its `ogc_fid`; seam, hole, multipart, narrow lots, rapid clicks |
| Filters, colours, highlights | Open | Repeat each at the thresholds in both modes |
| Saved work and downstream | Open | Project open/save, assemblage, drawer to planner to pro forma on the same fixtures |
| Performance isolation | Open | Downstream timings during browsing and during a build |
| Load and integrity | Open | Peak and 3× peak in staging; interrupted refresh; missing object, 429, 5xx |
| Rollback | Open | Demonstrated in preview, including a browser with cached tiles |
| Economics | Open | GB, objects, build and refresh time, egress per session, priced at 10k, 100k and 1M sessions |
| Independent review | Open | Signed against the tested candidate SHA |

## 5. Owner decisions

1. **Licence.** Does the Regrid agreement allow these tiles to be public on a
   CDN? The live edge tiles are already public without a key, but a bucket of
   files is easier to copy in bulk.
2. **Service-role secret.** Add `PARCEL_TILES_SERVICE_ROLE_KEY` so CI can
   export and publish.
3. **The export migration.** Approve applying
   `20261124000000_parcel_tile_export.sql`. It adds two read-only functions,
   service_role only.
4. **Where builds read from.** The scope prefers a replica or snapshot. The
   database was I/O-bound during this work. A full export reads every row
   once; running it at a quiet hour is the minimum. A Supabase branch or read
   replica costs money.
5. **The duplicate indexes** (finding 4) and the **empty projected columns**
   (finding 3): drop, keep or refill.

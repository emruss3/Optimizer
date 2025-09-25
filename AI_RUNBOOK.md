## AI Runbook for Optimizer (Parcel Intelligence Platform)

This is the concise set of rules and context I must load at the start of each session. It captures data sources, functions, flows, and conventions so I can continue work seamlessly when the context window resets.

### 1) Environment and Keys
- Frontend: Vite + React + TypeScript + Tailwind.
- Map: Mapbox GL JS. Map tokens from `src/lib/mapbox.ts`. Tiles use Supabase Edge Function `mvt-parcels`.
- Backend: Supabase (Postgres + PostGIS). RPCs used for parcel details and geometry.
- State: Zustand in `src/store/ui.ts`, project state in `src/store/project.ts`.

### 2) Canonical Identifiers
- Parcels are identified by `ogc_fid` when working with map tiles and geometry. Map vector tiles have `promoteId: 'ogc_fid'`.
- The site planner must prefer `ogc_fid` whenever available to fetch exact geometry.

### 3) Geometry Baseline (Single Source of Truth)
- Map uses Web Mercator (EPSG:3857) via Edge function `mvt-parcels`.
- Site planner must fetch geometry using the same baseline:
  1) RPC `get_parcel_geometry_3857(ogc_fid)` → returns GeoJSON in EPSG:3857 (meters).
  2) Convert meters → feet (× 3.28084), normalize to origin (subtract minX/minY), render in SVG.
  3) Fallbacks:
     - RPC `get_parcel_geometry_for_siteplan(ogc_fid)` (enhanced version).
     - If RPCs unavailable, use `parcel.geometry` (WGS84), convert degrees → feet using local latitude scaling (cosine method), normalize, render.

### 4) Data-fetching Rules (Click → Details)
- Map click handler fast-path: `get_parcel_by_id(ogc_fid)`; fallback: `get_parcel_at_point(lon, lat)`.
- Always return `geometry` in responses used by the drawer / planner (`ST_AsGeoJSON(... )::jsonb AS geometry`).
- Drawer and planner expect lot size fields (`sqft`, `deeded_acres`), owner (`primary_owner`), and zoning data (prefer enhanced Regrid schema if present).

### 5) Zoning & Defaults
- Default color mode on map is zoning. Left nav has selectors.
- Zoning fields include: `zoning`, `zoning_type`, `zoning_subtype`, `max_far`, `max_coverage_pct`, `min_front_setback_ft`, `min_side_setback_ft`, `min_rear_setback_ft`, etc.
- When missing zoning fields, planner and underwriting must degrade gracefully with safe defaults (never crash).

### 6) Site Planner Rendering Contract
- Input: `parcel: SelectedParcel` (must include `ogc_fid`, `sqft`, and ideally `geometry`).
- Geometry pipeline: use 3857 RPC → meters to feet → normalize → SVG path.
- Measurements: compute width/depth/area from normalized feet; show in status bar.
- Elements: draggable building/parking/greenspace. Unique IDs must be timestamp + random to avoid key collisions.
- Show debug indicators: “✓ Actual Parcel Outline (N points)” when real geometry is used; “⚠ Fallback Rectangle” otherwise.

### 7) SQL Functions (current set)
- `get_parcel_by_id(int)` → detailed parcel record (JOIN zoning on `zoning_id`).
- `get_parcel_at_point(lon, lat)` → point-in-polygon lookup.
- `parcels_mvt_b64(z, x, y)` → vector tiles for map overlay.
- `get_parcel_geometry_3857(int)` → canonical single-parcel geometry in EPSG:3857 for site planner.
- Optional: `get_parcel_geometry_for_siteplan(int)` → enhanced variant returning extra metrics.

### 8) Frontend Files to Remember
- `src/components/MapView.tsx` → adds vector source `parcels` from edge function, `promoteId: 'ogc_fid'`.
- `src/components/EnterpriseSitePlanner.tsx` → calls 3857 RPC first; fallbacks as above.
- `src/services/parcelGeometry.ts` → `fetchParcelGeometry3857`, meters→feet, normalization.
- `src/components/FullAnalysisModal.tsx` → passes parcel object to planner; wrap with error boundary.
- `src/store/ui.ts` → UI state (color, selection mode, drawers).

### 9) Error-handling & Fallbacks
- Never crash on missing geometry/zoning. Use fallback strategies.
- Always log concise context (parcel id, geometry type, points count).
- When debug is enabled, show status in-canvas.

### 10) Performance
- Avoid unnecessary re-renders; memoize expensive computations (`useMemo`, `React.memo`).
- For geometry, keep conversions linear and only when parcel changes.

### 11) Coding Conventions
- TypeScript: no `any` in critical paths. Use explicit interfaces (`SelectedParcel`, `RegridZoningData`).
- IDs: use timestamp + random for element keys.
- Functions: early return on invalid data. Keep components < 300 lines if possible and extract helpers.

### 12) How to Verify Geometry End-to-End
1. Confirm `ogc_fid` is present on selected parcel.
2. SQL: `SELECT * FROM get_parcel_geometry_3857(<ogc_fid>)` → expect `geometry_3857` type Polygon/MultiPolygon.
3. In app: planner shows green “Actual Parcel Outline (N points)” and correct width/depth/area.

### 13) Deployment Notes
- If RPCs are not found, run the SQL scripts from `supabase/functions` and `supabase/migrations` in Supabase Studio.
- Ensure `CREATE EXTENSION IF NOT EXISTS postgis;` is run once per database.

### 14) When Context Resets (Checklist)
1. Load this runbook.
2. Confirm `ogc_fid` is wired through click → drawer → planner props.
3. Ensure 3857 RPC exists; otherwise, instruct to run SQL.
4. If geometry is still a rectangle, check logs for which fallback path executed and fix upstream.







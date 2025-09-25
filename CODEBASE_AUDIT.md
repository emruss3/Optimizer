# Codebase Audit (Snapshot)

## Stack
- React + TypeScript + Vite, Tailwind CSS
- Mapbox GL JS for map
- Supabase (Postgres + PostGIS), Edge functions
- Zustand for UI state

## Key App Flows
1) Map renders tiles from edge function `mvt-parcels` → vector `parcels` source with `promoteId: 'ogc_fid'`.
2) Parcel click fast-path `get_parcel_by_id(ogc_fid)`; fallback `get_parcel_at_point(lon, lat)`; drawer opens with parcel.
3) Full Analysis modal → Site Planner renders geometry.

## Geometry Pipeline (target)
- Use the same baseline as map: Web Mercator (EPSG:3857).
- RPC: `get_parcel_geometry_3857(int)` returns GeoJSON in 3857.
- Convert meters to feet (× 3.28084) → normalize → SVG path.
- Fallbacks: enhanced RPC → WGS84 geometry → degrees→feet conversion.

## Important Files
- `src/components/MapView.tsx`: tiles + layers + click handler
- `src/components/EnterpriseSitePlanner.tsx`: geometry loading + SVG planner
- `src/services/parcelGeometry.ts`: geometry fetch + conversion utilities
- `src/components/FullAnalysisModal.tsx`: tabs and planner embedding
- `src/store/ui.ts`: UI state and defaults

## SQL Functions (in repo)
- `supabase/functions/get_parcel_at_point_enhanced.sql`
- `supabase/functions/get_parcel_by_id_enhanced.sql`
- `supabase/functions/get_parcel_geometry_for_siteplan.sql` (enhanced)
- Migration example `20250115_deploy_parcel_geometry_function.sql`
- Minimal baseline to add: `get_parcel_geometry_3857(int)` (created via Studio)

## Known Pitfalls & Fixes
- Duplicate React keys for site planner elements → ensure ID uses timestamp+random.
- React re-creation of map when deps change → keep `onParcelClick` out of init `useEffect`.
- Drawer resize → call `map.resize()` only on actual state change with small timeout.
- Parcel area shown as 0 → ensure `sqft` fallback computed from geometry when null.

## Testing Checklist
1) Click parcel on map; console shows ogc_fid and opens drawer with correct address.
2) Open Full Analysis → Visual tab: green “Actual Parcel Outline (N points)”.
3) Status bar shows width × depth and area ~ `sqft`.
4) Zoning setbacks show if present; no runtime errors.

## Performance Notes
- Memoize geometry transforms; re-run only when `parcel.id` or `ogc_fid` changes.
- Avoid unnecessary re-renders in planner; keep tool state local and cheap.

## Next Priorities
- Consolidate to single planner; remove dead/old planner components.
- Add unit tests for `parcelGeometry` conversions.
- Add Playwright smoke test for Visual tab opening and dimension assertion.





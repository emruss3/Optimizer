# Supabase SQL (Site Planner)

This folder contains the canonical SQL used by the app.

## Views
- **planner_parcels** → stable `MultiPolygon, 3857`; pulls from `parcels.wkb_geometry_4326` (or `wkb_geometry`)
- **planner_zoning** → dynamic `far_max` (uses one of: `effective_far`, `dynamic_far`, `calc_far`, …; else falls back to `max_far`), normalizes height/setbacks
- **planner_join** → `parcels ⟂ zoning` merge for map & panel

## RPCs
- **get_buildable_envelope(p_parcel_id text)** → `geometry(3857)` of buildable area (uses live setbacks; defaults only when missing)
- **score_pad(p_parcel_id text, p_pad_3857 geometry, p_parking_3857 geometry)** → JSON metrics; treats NULL FAR as uncapped
- **get_parcel_detail(p_parcel_id text)** → one-call parcel + envelope + metrics for the UI

## Indexes
- `gix_parcels_wkb4326` on `public.parcels(wkb_geometry_4326)`
- `gix_zoning_geom` on `public.zoning(geom)`

> After changing zoning columns (e.g., renaming your dynamic FAR), update `planner_zoning.sql` or add the name to the autodetect array.

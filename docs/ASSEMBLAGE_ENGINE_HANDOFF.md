# Assemblage: engine handoff (2026-11-16)

The app can now ask for a combined site and open the planner on it. The
database half does not exist yet. This note is the contract the app calls and
what was found on the live database.

## What the app does

`src/lib/assemblage.ts` calls one function and opens the planner on the
parcel id it returns. Everything after that is the ordinary single-parcel
flow: `get_parcel_by_id`, `fn_compile_planner_context`, the generators, topo.

```
fn_assemble_parcels(p_fids integer[]) returns jsonb
```

Success:

```
{ "ogc_fid": 9100001, "address": "1710 Meharry Blvd + 1 more",
  "zoning": "RM20", "acres": 2.2, "member_fids": [488278, 488279] }
```

Refusal (a verdict, not an exception):

```
{ "error": "not_adjacent" | "mixed_zoning" | "too_few" | "too_many" | "not_found",
  "message": "plain sentence for the reader" }
```

The app has its own wording for those five codes and shows `message` for any
other code. Until the function exists the app says the engine cannot combine
parcels yet.

## What the live database shows

- Every planner function reads geometry from `public.parcels` by `ogc_fid`.
  None takes a geometry, except `fn_parcel_edge_classes_geom` and
  `fn_generate_th_site_plan_v2_impl`.
- A combined record already works as a site. Row 9000001 (two county polygons
  modeled as one tract, 60.53 ac) carries only address, zoning, gisacre,
  geom_2274, wkb_geometry_4326 and a few labels. `fn_parcel_frontage` and
  `fn_parcel_buildability` answer on it.
- So the smallest route is a combined row in `parcels` with an id in a
  reserved range, made by `fn_assemble_parcels`.

## What has to be handled in the engine

1. **Members read as neighbours.** `fn_parcel_frontage`,
   `fn_parcel_row_frontage`, `fn_parcel_edge_classes` and
   `fn_planner_neighbors` treat every other row within 2 ft as a neighbour.
   The member parcels sit inside the combined outline, so the combined site
   would lose its street frontage. These need to skip the members.
   `fn_parcel_edge_classes_geom` already has `p_exclude integer[]`.
2. **The combined row reads as a neighbour of everyone else.** Once it is in
   `parcels`, the same functions would count it against the member parcels
   and the parcels around them. Combined rows must be skipped whenever the
   subject is an ordinary parcel.
3. **Sweeps, search and the map.** Combined rows must stay out of cohort
   sweeps, `planner_parcels`, `parcels_mapview` and the app's parcel search
   (`parcels` filtered by address and parcel number).
4. **Same set, same id.** Calling with the same members should return the
   same combined id, so saved plans and "Resume last plan" keep working. A
   members table keyed by the sorted id list would do it.
5. **Rules for a valid set.** The union must be one polygon (members touch,
   allowing the 2 ft fabric tolerance). One zoning district for now; a mixed
   set is refused as `mixed_zoning`. Overlays and flood come from the members.
6. **Topo.** `fn_parcel_topo` reads a per-parcel cache. A combined id needs
   its own fetch, or a read stitched from the members.
7. **Who may create rows.** The function writes to a shared table from the
   browser role, so it needs a cap on member count and on rows per caller.

## Existing functions that should not be used for this

- `get_assemblage_geometry` has two overloads that both match a call with
  only `parcel_ids`, so the browser call cannot resolve.
- `calculate_unified_constraints` returns a buildable area of 80% of the
  site times 1.15, not a measured envelope.
- `optimize_yield_scenarios` and `optimize_assemblage_massing` are not part
  of the deterministic engines.

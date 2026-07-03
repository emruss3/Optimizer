# Claude Code Brief — Wire the Context Engine + Generator into the Optimizer UI

Repo: `emruss3/Optimizer`. Backend: Supabase project `okxrvetbzpoazrybhcqj` (all RPCs live, anon-callable).
Also read `docs/CURSOR_UI_INTEGRATION_BRIEF.md` if present — this brief supersedes its Phase 2 section (the canvas-frame blocker is now RESOLVED).

## ⛔ Hard rules
1. **Do NOT modify `src/utils/coordinateTransform.ts`** or the legacy `processedGeometry` path. It has a known scale bug but is self-consistent; saved plans depend on it. The projection fix is a separate future migration.
2. **Never measure geometry client-side.** All dimensions/areas come from the backend (computed in EPSG:2274 true feet). The client renders and displays; it does not compute.
3. Additive changes only to the canvas — new elements in the existing `elements` array; don't change how existing elements render.

## Task 1 — DesignContext panel (do first)
On parcel select, call:
```ts
const { data: ctx } = await supabase.rpc('fn_resolve_design_context',
  { p_ogc_fid: parcelId, p_typology: 'single_family' });
```
Render a panel with:
- zoning base + subtype, regime badge (`ctx.regime`: horizontal=Civil, vertical=Architectural), parking strategy
- setbacks / FAR / height / density rows. **Every value is `{value, source}` — show an "estimated" badge when `source !== 'zoning'`.** This provenance UI is the product's differentiator; make it visible, not buried.
- `ctx.flags` as warning chips; `ctx.confidence` as a pill (high=green, medium=amber, low=grey, review_required=red)
- Use selector from `ctx.permitted_uses.feasible_uses_as_of_right` (user can only pick legal uses; re-call RPC on change)

## Task 2 — Comps card
```ts
const { data: bf } = await supabase.rpc('fn_local_built_form', { p_ogc_fid: parcelId });
const { data: px } = await supabase.rpc('fn_local_pricing',    { p_ogc_fid: parcelId });
```
Show: footprint distribution (p25/50/75/90), stories, the **underwrite_target** (label: "what's being built nearby now"), $/building-SF and sale-price distribution, `n_comps`, confidence. Calls run ~300-600ms; add a loading state.
⚠️ Until a pending backfill completes, `n_comps` may be low on some parcels — render whatever comes back; do not hardcode expectations.

## Task 3 — Generate Site Plan (the headline feature)
```ts
const { data: plan } = await supabase.rpc('fn_generate_sf_site_plan',
  { p_ogc_fid: parcelId });           // optional: p_target_lot_sqft to override
```
Runs in ~350ms. Response includes **`plan.canvas_frame`** — everything the canvas needs, pre-aligned:
```json
canvas_frame: {
  units: "feet_us_survey",
  origin_2274: [x, y],
  parcel:    <GeoJSON Polygon, local feet, origin (0,0)>,
  buildable: <GeoJSON Polygon, same frame>,
  lots:      [{ lot, area_sqft, geom: <Polygon, same frame> }],
  footprints:[{ lot, footprint_sqft, geom: <Polygon, same frame> }]
}
```
**Render a generated-plan scene from `canvas_frame` ONLY** — parcel outline, buildable envelope, lots, footprints all share one frame and are in TRUE feet. Do not mix with the legacy `processedGeometry` parcel render in the same scene (scales differ). Simplest safe approach: when a generated plan is active, the canvas draws the entire scene from `canvas_frame` (a "generated view" mode); the legacy path remains for existing saved plans.

Map to `Element[]` for the canvas:
- lot → `{ type:'other', name:'Lot N', geometry, properties:{ areaSqFt }, metadata:{ source:'ai-generated' } }`
- footprint → `{ type:'building', name:'Building N', geometry, properties:{ areaSqFt, use:'residential' }, metadata:{ source:'ai-generated' } }`

UI copy next to the plan: show `target_source` ("sized from local comps p75"), `target_lot_sqft`, `target_footprint_sqft`, `context_confidence`, and `flags`. This is the market-grounding line TestFit can't say — surface it.

Also available: `plan.lots` / `plan.footprints` in EPSG:4326 for Mapbox overlay if you want the plan on the map view too.

## Task 4 — housekeeping
- Disable/hide the old "Optimize Massing" button paths that call the legacy massing engine (`generateMassing.ts`) — it has a projection bug and is superseded.
- Test parcels: 667899 (RS5 single lot) · 293030 (RS20 → 2 lots) · 293040 (→ 4 lots) · 554963 (CF; use selector shows multi_family+industrial) · 554959 (AE flood → review_required styling).

## Definition of done
Click parcel → context panel + comps card populate (with provenance badges) → "Generate Plan" → lots + buildings render on canvas aligned with parcel outline, with true square footages, in <1s.

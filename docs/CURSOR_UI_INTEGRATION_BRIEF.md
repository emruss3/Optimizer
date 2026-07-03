# Cursor Brief — Wire Context Engine + Generator into the Site Planner UI

Paste into Cursor. This wires the new backend into the **existing** `EnterpriseSitePlannerShell` / `SitePlanCanvas` UI. **Read the "DO NOT BREAK" section first.**

---

## ⛔ DO NOT BREAK (read first)
1. **Do NOT modify `src/utils/coordinateTransform.ts` or the `processedGeometry` pipeline yet.** The canvas currently renders parcel + envelope + saved elements through this path. It has a known projection scale error, but it is *internally self-consistent* — everything is wrong by the same factor, so it aligns on screen and the editor works. Changing it now will (a) misalign generated elements vs. parcel and (b) break the scale of any **saved** site plans whose coordinates were created in the old space. The projection fix is a **separate future migration** that must also migrate saved-plan coordinates. Not now.
2. **Generated elements must render in the canvas's CURRENT coordinate frame**, not 4326. See "Coordinate handling" below.
3. Additive only: add generated elements to the existing `elements` array. Do not change how existing elements render.

---

## Two phases — Phase 1 is safe to do immediately, Phase 2 waits for backend signal

### PHASE 1 — Context panel + comps cards (READY NOW, zero geometry risk)
These RPCs return JSON only (no geometry to render) and are fully live + callable by `anon`/`authenticated`:

| RPC | Args | Returns |
|---|---|---|
| `fn_resolve_design_context` | `(p_ogc_fid int, p_typology text)` | DesignContext JSON |
| `fn_resolve_permitted_uses` | `(p_ogc_fid int)` | feasible-use set |
| `fn_local_built_form` | `(p_ogc_fid int)` | local comp distribution + underwrite target |
| `fn_local_pricing` | `(p_ogc_fid int)` | $/bldg-SF, $/lot-SF, sale-price distribution |

Call: `const { data } = await supabase.rpc('fn_resolve_design_context', { p_ogc_fid: id, p_typology: 'single_family' })`

**Build:**
- **DesignContext panel** on parcel select: zoning base/subtype, regime badge (Civil/Horizontal vs Architectural/Vertical), setbacks/FAR/height/density rows. **Show an "estimated" badge whenever a value's `source !== 'zoning'`** and a confidence pill (high=green, medium=amber, low=grey, review_required=red). This provenance UI is the product differentiator — make it prominent, not hidden.
- **Use selector** driven by `permitted_uses.feasible_uses_as_of_right` — user can only pick legal uses; switching re-calls the context RPC.
- **Comps card** from `fn_local_built_form` + `fn_local_pricing`: distribution (p25/50/75/90 footprint, stories), the **underwrite_target** (p75–p90) labeled "what's being built nearby now," and pricing ($/SF). Show `n_comps` + confidence.

> ⚠️ `fn_local_built_form` / `fn_local_pricing` currently take ~2s (backend optimization in progress). Fine for dev. Add a loading state. Output shape will NOT change when it's optimized, so your integration won't need rework.

### PHASE 2 — Generated site plan on the canvas (WAIT for backend "generator returns canvas-frame coords" signal)
RPC: `fn_generate_sf_site_plan(p_ogc_fid int, p_target_lot_sqft numeric default null)`
Returns: `{ parcel_ogc_fid, typology, target_lot_sqft, target_footprint_sqft, target_source, context_confidence, lots_generated, lots:[{lot, area_sqft, geom}], footprints:[{lot, footprint_sqft, geom}], flags }`

**Map to existing `Element` type** (`src/engine/types.ts`):
```ts
// lot -> Element
{ id, type: 'other', name: `Lot ${lot}`, geometry: <Polygon>,
  properties: { areaSqFt: area_sqft, color: '#E5E7EB' },
  metadata: { source: 'ai-generated', createdAt, updatedAt } }
// footprint -> Element
{ id, type: 'building', name: `Building ${lot}`, geometry: <Polygon>,
  properties: { areaSqFt: footprint_sqft, use: 'residential', color: '#3B82F6' },
  metadata: { source: 'ai-generated', createdAt, updatedAt } }
```
Push these into the existing `elements` array → the canvas already draws `type:'building'` etc. No new render code.

**Generate flow:** parcel selected → "Generate Plan" button → call RPC → map to `Element[]` → set elements → canvas renders. Show `target_source` ("local_comps_p75") and `context_confidence` in the panel so the user sees the plan is market-grounded — the line TestFit can't say.

#### Coordinate handling (critical)
The generator currently returns `geom` as GeoJSON in **EPSG:4326 (lat/lon degrees)**. The canvas renders in projected local feet. You must convert generated geometry into the **same frame the canvas uses for the parcel/envelope**, so generated lots align with the parcel outline.
- Backend is being updated to optionally return geometry in a canvas-ready projected frame. **Until that ships, do not wire Phase 2** — 4326 coords will collapse to a point.
- When it ships, the generator will return projected coords matching `processedGeometry`'s frame; map straight into `Element.geometry`.

---

## Sequencing
1. Phase 1 now (panel + cards + use selector). Real value, zero risk.
2. Keep "Generate Plan" / "Optimize Massing" disabled until backend confirms canvas-frame coords.
3. Phase 2 when signaled.
4. Projection migration: later, separate, with saved-plan data migration.

## Test parcels
- 667899 (RS5, clean SF) · 293030 (RS20 1ac → 2 lots) · 293040 (→ 4 lots) · 554963 (CF, MF-vs-industrial use) · 554959 (AE flood → review_required)

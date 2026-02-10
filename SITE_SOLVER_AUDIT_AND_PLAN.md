# Site Solver Audit & TestFit-Killer Implementation Plan

## Executive Summary

Your Optimizer has strong foundations — parcel discovery, Supabase spatial backend, underwriting, and a web-based platform (TestFit is Windows-only). But the **site solver is not production-ready**. There are 4 competing solver pipelines, broken imports, stub algorithms, and critical missing features. This document is your roadmap to building a solver that beats TestFit.

---

## PART 1: Current State of Your Solver (Honest Assessment)

### You Have 4 Competing Solver Pipelines

| Pipeline | Location | Status |
|----------|----------|--------|
| **"New" solver** | `src/engine/model.ts` + `buildingGeometry.ts` + `parkingBaySolver.ts` + `feasibility.ts`, orchestrated by `siteEngineWorker.ts` | **Best pipeline. Single-pass, no optimization loop.** |
| **Legacy planner** | `src/engine/planner.ts` + `building.ts` + `parking.ts` + `analysis.ts` | **Functional but crude. Grid-based building placement, per-stall parking.** |
| **Genetic optimizer** | `src/features/site-planner/engine/seedPads.ts` + `mutatePads.ts` + `scorePad.ts` | **Broken. Imports don't resolve. Cannot run.** |
| **Legacy service** | `src/services/sitePlanEngine.ts` | **Explicitly deprecated. Spreadsheet calculator, no real geometry.** |

### What Your Solver CAN Do Today
- Accept a GeoJSON parcel and normalize it
- Place rectangular buildings (user-specified position/rotation/dimensions)
- Clamp buildings inside the buildable envelope
- Solve parking bay packing in remaining space (best algorithm you have)
- Compute FAR, coverage, parking shortfall, overlap, containment violations
- Return renderable Element[] for buildings, bays, aisles
- Run in a Web Worker
- Estimate earthwork cut/fill (with fake DEM only)

### What Your Solver CANNOT Do (vs TestFit)

| Capability | TestFit | Your Optimizer |
|-----------|---------|---------------|
| **Auto-place buildings** (optimization loop) | Yes — tests thousands of variations | No — user must manually place each building |
| **Non-rectangular buildings** (L-shape, U-shape, podium, courtyard-wrap) | Yes — multiple typologies | No — only rectangles despite types being declared |
| **Setback buffer on irregular polygons** | Yes | No — `buffer()` in geometry.ts only works on axis-aligned rectangles |
| **Drive aisle connectivity** | Yes — connected circulation | No — parking bays can be isolated islands |
| **Greenspace generation** | Yes | Only in legacy planner, not in new solver |
| **Real DEM / earthwork** | Yes — real terrain data | No — always uses test sampler with flat 1% slope |
| **3D visualization** | Yes — full 3D terrain | No — 2D map only |
| **Height limit checks** | Yes | No — feasibility.ts doesn't check height |
| **Density (DU/acre) checks** | Yes | No |
| **Structured parking** (garages, podium, underground) | Yes | No — surface lots only |
| **Mixed-use in single plan** | Yes | No — single typology per plan |
| **CAD export** (Revit, SketchUp, AutoCAD) | Yes | No — PDF/Excel only |
| **Road/circulation generation** | Yes | No — completely absent |
| **Multiple building auto-layout** | Yes | No — user must place each one |

### Critical Bugs Found

1. **Broken genetic optimizer** — `seedPads.ts` imports `getBuildableEnvelope` from `scorePad.ts` but that function doesn't exist there. `mutatePads.ts` calls `scorePad()` with wrong parameter shape. The entire seed/mutate pipeline is non-functional.

2. **`geometry.ts` buffer() only works on rectangles** — throws error for polygons with >4 vertices. This means you CANNOT apply setback buffers to real-world irregular parcels through the engine.

3. **Earthwork always fake** — `analysis.ts:estimateEarthwork()` always uses `createTestDEMSampler(100, 0.01)`. No real DEM integration exists anywhere.

4. **`optimizeBuildingPlacement()` is a no-op** — it just sorts buildings by area, does zero actual repositioning.

5. **Parking overlaps buildings** — legacy `parking.ts` doesn't subtract building footprints. Only `parkingBaySolver.ts` does.

6. **Buildings can extend outside parcel** — legacy `building.ts` has no envelope containment check.

7. **Financial metrics are hardcoded** — `analysis.ts` uses $200/sqft sale, $2/sqft rent, $150/sqft construction regardless of market or property type.

8. **Unit count assumes 800 sqft/unit everywhere** — hardcoded in `feasibility.ts`, `building.ts`, and `analysis.ts` with no unit mix support.

---

## PART 2: Supabase Schema — What You Have & What's Missing

### Tables You Have

#### `parcels` (pre-existing, Regrid import)
~50 columns including: `ogc_fid` (PK), `parcelnumb`, `address`, `city`, `owner`, `zoning`, `deeded_acres`, `sqft`, `lat/lon`, `landval`, `parval`, `yearbuilt`, `numstories`, `numunits`, `wkb_geometry_4326`

#### `zoning` (pre-existing + enhanced)
~30 columns including: `zoning_id`, `zoning` (code), `zoning_type`, `zoning_subtype`, `max_far`, `max_height_ft`, `max_coverage_pct`, `max_density_du_per_acre`, `min_front_setback_ft`, `min_side_setback_ft`, `min_rear_setback_ft`, `permitted_land_uses` (jsonb), `min_lot_area_sq_ft`, `min_lot_width_ft`, `max_impervious_coverage_pct`, `min_landscaped_space_pct`, `min_open_space_pct`

#### `roads`
`id`, `osm_id`, `name`, `highway`, `surface`, `lanes`, `oneway`, `maxspeed`, `geom` (LINESTRING 3857)

#### `project_members`
`id`, `project_id`, `user_id`, `email`, `role` (viewer/analyst/manager/admin), `status`, `invited_by`

#### `project_comments`
`id`, `project_id`, `parcel_id`, `user_id`, `user_name`, `message`, `read_by[]`, realtime-enabled

#### `project_assemblages`
`id`, `parcel_ids[]`, `combined_geometry`, `total_acres`, `zoning_mix`, `name`, `is_implicit`

#### `default_costs_by_use`
Referenced but never created in migrations. Columns: `use_type`, `region`, `land_cost_per_acre`, `hard_cost_per_sf`, etc.

### Key RPC Functions
- `get_parcels_in_bbox()` — spatial parcel search with zoning filter
- `get_parcel_at_point()` — click-to-select with full zoning join
- `get_parcel_geometry_3857()` — web mercator geometry with bounds
- `get_parcel_geometry_for_siteplan()` — multi-format geometry + width/depth/perimeter
- `get_parcel_buildable_envelope()` — setback-buffered buildable area
- `score_pad()` — evaluate pad against envelope (FAR, parking, coverage, containment)
- `get_assemblage_geometry()` — ST_Union multiple parcels
- `calculate_unified_constraints()` — most restrictive zoning across parcels
- `optimize_yield_scenarios()` — 3 scenarios (conservative/moderate/aggressive)
- `calc_irr()` — simplified IRR/yield/equity calculation
- `get_default_costs()` — lookup cost defaults by zoning type

### What's Missing From Your Schema for a TestFit-Killer

1. **`site_plans` table** — No persistent storage for generated plans. TestFit lets you save/compare/share plans.
2. **`building_templates` table** — No reusable building typology library (bar, L-shape, U-shape, podium, courtyard-wrap with presets).
3. **`elevation_data` / DEM integration** — No terrain data. TestFit has worldwide topo.
4. **`parking_requirements` table** — Parking ratios are hardcoded. Should be per-zoning-code, per-use-type.
5. **`unit_mix_templates` table** — Unit mixes (studio/1BR/2BR/3BR with sizes and rents) are hardcoded at 800 sqft.
6. **`construction_costs` table** — Regional cost data by construction type (Type I-V, wood-frame, steel, concrete).
7. **`site_plan_versions` table** — No version history or comparison between iterations.

---

## PART 3: Exact Cursor Prompts — Build Order

Use these prompts in Cursor in this exact order. Each builds on the previous. Copy-paste them directly.

---

### PROMPT 1: Fix the Geometry Buffer (CRITICAL BLOCKER)

```
Fix the buffer() function in src/engine/geometry.ts. Currently it only works on
axis-aligned rectangles (throws error for polygons with >4 vertices). This is a
critical blocker — we cannot apply setback buffers to real-world irregular parcels.

Replace the buffer() implementation with one that works on ANY polygon shape. Use
the polygon-clipping library that's already imported, or use Turf.js (already in
package.json as @turf/turf) to compute proper polygon offsets/buffers.

The function signature should stay the same:
  buffer(polygon: Polygon, distance: number): Polygon

Where distance is in the same units as the polygon coordinates (meters for EPSG:3857).
Negative distance = inward buffer (for setbacks). Positive = outward buffer.

Must handle:
- Irregular polygons (5+ vertices)
- Concave polygons
- Very small parcels where buffer might collapse the polygon (return null or empty)
- MultiPolygon results from buffer (take the largest ring)

Update the existing tests in tests/engine/geometry.test.ts to cover irregular polygons.
```

---

### PROMPT 2: Implement Real Building Typologies

```
The engine declares building types MF_BAR_V1, MF_L_SHAPE, MF_PODIUM, and CUSTOM in
src/engine/model.ts but only MF_BAR_V1 (rectangle) is implemented in
src/engine/buildingGeometry.ts.

Implement the missing building typologies:

1. **MF_BAR_V1** (already done) — Simple rectangle
2. **MF_L_SHAPE** — L-shaped building. Add a `wingDepth` and `wingWidth` to BuildingSpec.
   Generate an L-polygon from the anchor point using width, depth, wingWidth, wingDepth,
   and rotation.
3. **MF_PODIUM** — Rectangular podium base (wider) with a tower (narrower) on top.
   The footprint is the podium rectangle. Add `podiumWidth`, `podiumDepth`, `towerWidth`,
   `towerDepth`, `podiumFloors` to BuildingSpec. The footprint polygon is the podium.
   GFA = podium_area * podiumFloors + tower_area * (totalFloors - podiumFloors).
4. **MF_U_SHAPE** — U-shaped courtyard building. Generate from width/depth with a
   courtyard cutout. Add `courtyardWidth`, `courtyardDepth` to BuildingSpec.
5. **MF_COURTYARD_WRAP** — Rectangular ring with central courtyard. Generate from
   outer width/depth minus inner courtyard rectangle.

Update buildBuildingFootprint() to handle each type. Update clampBuildingToEnvelope()
to work with non-rectangular polygons (use polygon centroid for containment checks
instead of just 4 corners).

Update createBuildingSpec() factory in model.ts with sensible defaults for each type.

Add unit tests in a new file tests/engine/buildingGeometry.test.ts for each typology.
```

---

### PROMPT 3: Build the Auto-Layout Optimization Loop

```
This is the most important feature. TestFit's killer feature is that it automatically
generates optimized site layouts. Our solver currently requires the user to manually
place each building — there is no optimization loop.

Create a new file: src/engine/optimizer.ts

Implement a site layout optimizer that:

1. Takes inputs:
   - Buildable envelope polygon (EPSG:3857)
   - Zoning constraints (FAR, height, coverage, setbacks, parking ratio, density)
   - Design parameters (target unit count, building typology preferences, min/max
     building dimensions, parking angle preference)

2. Uses a **simulated annealing** approach (not genetic — simpler and more predictable):
   - Start with a reasonable initial layout (place buildings along the longest edge
     of the envelope, fill remaining space with parking)
   - Each iteration: randomly mutate one parameter (building position, dimensions,
     rotation, add/remove a building, change parking angle)
   - Score the layout using a weighted objective function:
     - Unit count (weight: 0.35) — maximize
     - Parking compliance (weight: 0.20) — meet or exceed ratio
     - FAR utilization (weight: 0.15) — get close to max without exceeding
     - Open space quality (weight: 0.10) — contiguous green space preferred
     - Building-to-building separation (weight: 0.10) — minimum 20ft between buildings
     - Envelope utilization (weight: 0.10) — minimize wasted space
   - Accept improvements always; accept worse solutions with decreasing probability
     (temperature schedule)
   - Run for configurable iterations (default 500, fast mode 100)

3. Returns the best PlanState found, plus the top 3 alternatives with different
   tradeoffs (max units, max open space, balanced).

4. Must run inside the Web Worker (src/workers/siteEngineWorker.ts). Add a new
   message type 'OPTIMIZE' that triggers the optimizer and posts progress updates
   every 50 iterations.

5. Use the existing feasibility.ts for constraint checking and parkingBaySolver.ts
   for parking generation within each iteration.

Wire it into the worker alongside the existing INIT_SITE and UPDATE_BUILDING handlers.
Do NOT touch the existing handlers — add OPTIMIZE as a new message type.
```

---

### PROMPT 4: Add Drive Aisle Connectivity & Circulation

```
The parkingBaySolver.ts generates parking bays but they can be disconnected islands
with no drive aisle connectivity. Real parking lots need connected circulation.

Modify src/engine/parkingBaySolver.ts to:

1. After generating parking bays, compute a circulation spine:
   - Find the access point (closest point on the envelope boundary to the nearest road
     in the roads table, or default to the midpoint of the longest envelope edge)
   - Generate a main drive aisle from the access point that connects all parking bay
     aisles
   - The main aisle should be 24ft wide (two-way) and follow the general orientation
     of the parking bays
   - Each bay's aisle must connect to the main drive aisle or to another bay's aisle

2. Add a connectivity check:
   - Build a graph where nodes are bay aisles and the main drive, edges exist where
     aisles intersect or are within 5ft
   - All bays must be reachable from the access point
   - If any bay is isolated, try to add a connecting aisle segment

3. Add to the ParkingBaySolution:
   - circulationPolygons: Polygon[] (main drive aisle and connector segments)
   - accessPoint: [number, number]
   - isFullyConnected: boolean

4. Subtract the circulation area from the buildable area before computing metrics.

5. Update siteEngineWorker.ts to include circulation polygons in the Element[] output
   with type 'circulation'.
```

---

### PROMPT 5: Implement Proper Setback Edge Classification

```
Currently setbacks are applied as a uniform buffer. Real setbacks differ by edge type
(front/side/rear) and the front edge faces the street.

Create a new file: src/engine/setbacks.ts

Implement:

1. `classifyParcelEdges(parcelGeom: Polygon, roadGeoms: LineString[]): EdgeClassification[]`
   - For each edge of the parcel polygon, find the nearest road within 200ft
   - The edge closest to a road = FRONT
   - The edge opposite the front = REAR
   - All other edges = SIDE
   - If no roads found, use the longest edge as FRONT
   - Return array of { edge: [Point, Point], type: 'front'|'side'|'rear',
     roadName?: string, distanceToRoad: number }

2. `applySetbacks(parcelGeom: Polygon, edges: EdgeClassification[],
   setbacks: {front: number, side: number, rear: number}): Polygon`
   - Apply different inward offsets per edge based on classification
   - Use Turf.js or Clipper.js approach: offset each edge inward by its setback
     distance, then compute the intersection of all half-planes
   - Handle the case where setbacks collapse the polygon (return null)
   - Return the buildable envelope polygon

3. Update get_parcel_buildable_envelope in the Supabase function to use road proximity
   for front-edge detection (it currently just applies a uniform buffer using the
   largest setback value).

4. Wire into siteEngineWorker.ts INIT_SITE handler: fetch nearby roads, classify edges,
   apply per-edge setbacks, use result as the buildable envelope.

Use the existing roads table (query via Supabase RPC) for road geometry.
Add tests in tests/engine/setbacks.test.ts.
```

---

### PROMPT 6: Add Height & Density Compliance + Unit Mix

```
The feasibility checker in src/engine/feasibility.ts only checks FAR, coverage, parking,
overlap, and containment. It's missing critical zoning checks.

Update src/engine/feasibility.ts to add:

1. **Height limit check**: Compare building height (floors * floor-to-floor height,
   default 10ft residential, 14ft commercial ground floor) against max_height_ft from
   zoning. Add violation type 'HEIGHT_EXCEEDED'.

2. **Density check**: Compare total dwelling units against max_density_du_per_acre *
   parcel acres. Add violation type 'DENSITY_EXCEEDED'.

3. **Impervious coverage check**: Compare total impervious area (building footprints +
   parking + circulation) against max_impervious_coverage_pct. Add violation type
   'IMPERVIOUS_EXCEEDED'.

4. **Open space check**: Compare open space percentage against min_open_space_pct.
   Add violation type 'OPEN_SPACE_INSUFFICIENT'.

Update src/engine/model.ts to add a proper unit mix to BuildingSpec:
- unitMix: { type: string, count: number, avgSqft: number, rentPerMonth: number }[]
- Default unit mix based on building GFA:
  - Studio (450sf, 10%), 1BR (650sf, 40%), 2BR (900sf, 35%), 3BR (1200sf, 15%)
- Total units = sum of unit counts
- Remove all hardcoded 800 sqft/unit assumptions across the codebase (search for "800"
  in engine files)

Update FeasibilityInput to accept zoning height, density, impervious, and open space
limits.

Add tests for each new violation type.
```

---

### PROMPT 7: Implement Plan Persistence & Comparison

```
There's no way to save, load, or compare generated site plans. TestFit lets users
save schemes and compare them side-by-side.

1. Create a new Supabase migration file: supabase/migrations/20260210_site_plans.sql

CREATE TABLE public.site_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  parcel_id text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled Plan',
  description text,
  -- Solver inputs
  envelope_geom geometry(Polygon, 3857),
  zoning_constraints jsonb NOT NULL,
  design_parameters jsonb NOT NULL,
  -- Solver outputs
  elements jsonb NOT NULL,          -- Element[] array
  metrics jsonb NOT NULL,           -- PlanMetrics
  violations jsonb DEFAULT '[]',    -- FeasibilityViolation[]
  score numeric,                    -- Overall plan score 0-100
  -- Unit mix & financials
  unit_mix jsonb,                   -- Unit breakdown
  pro_forma jsonb,                  -- Financial summary
  -- Metadata
  is_favorite boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  thumbnail_url text,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_site_plans_project ON site_plans(project_id);
CREATE INDEX idx_site_plans_parcel ON site_plans(parcel_id);

-- Version history
CREATE TABLE public.site_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_plan_id uuid REFERENCES site_plans(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  elements jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

Enable RLS on both tables with full access for authenticated users.

2. Create src/lib/sitePlanStorage.ts with functions:
   - saveSitePlan(plan: PlanState, projectId, parcelId, name): Promise<uuid>
   - loadSitePlan(id: uuid): Promise<PlanState>
   - listSitePlans(projectId, parcelId?): Promise<SitePlanSummary[]>
   - deleteSitePlan(id: uuid): Promise<void>
   - duplicateSitePlan(id: uuid, newName): Promise<uuid>

3. Create a React hook src/hooks/useSitePlans.ts that wraps the storage functions
   with loading/error states and optimistic updates.
```

---

### PROMPT 8: Add Structured Parking Support

```
The solver only handles surface parking. TestFit supports parking garages, podium
parking, and underground parking.

Add structured parking support:

1. Update src/engine/model.ts — add to ParkingSpec:
   - parkingType: 'surface' | 'structured' | 'podium' | 'underground'
   - levels: number (default 1 for surface)
   - levelHeight: number (default 10ft per level)
   - rampType: 'helix' | 'split-level' | 'sloped-floor'

2. Update src/engine/parkingBaySolver.ts:
   - For structured parking: multiply surface stall count by number of levels
   - Footprint = the parking polygon, but stalls = surface_stalls * levels
   - Subtract structured parking footprint from buildable area
   - Add ramp area deduction: ~300 sqft per level for helix, ~500 for split-level

3. For podium parking:
   - The building sits ON TOP of the parking structure
   - The parking footprint = building footprint (or larger)
   - Stalls = (footprint_area / stall_module_area) * podium_levels
   - Building GFA starts above the podium levels

4. For underground parking:
   - Does NOT consume surface area
   - Stalls = (envelope_area * 0.85 / stall_module_area) * underground_levels
   - Add cost premium: $35,000/stall for underground vs $5,000/stall surface vs
     $25,000/stall structured

5. Update feasibility.ts to account for structured parking stalls in the parking
   ratio check.

6. Update the cost calculations to use different per-stall costs by parking type.
```

---

### PROMPT 9: Wire Pro Forma Into the Solver Loop

```
TestFit validates pro formas against actual layouts in real-time. Our financial
calculations are disconnected from the solver.

Create src/engine/proforma.ts:

1. Implement a real-time pro forma calculator that takes PlanState + market assumptions
   and returns:

   Revenue:
   - Gross potential rent (from unit mix * rent/unit * 12)
   - Less vacancy (default 5%)
   - Effective gross income
   - Less operating expenses (default 35% of EGI)
   - Net operating income (NOI)

   Costs:
   - Land cost (from parcel assessed value or user input)
   - Hard costs: building construction ($/sf by type — wood frame $150, steel $200,
     concrete $250), site work ($15/sf), parking (by type from Prompt 8)
   - Soft costs (default 20% of hard costs)
   - Contingency (default 5%)
   - Financing costs (construction loan at 6%, 18-month term)
   - Total development cost

   Returns:
   - Yield on cost (NOI / total cost)
   - Development spread (cap rate - yield on cost)
   - Stabilized value (NOI / cap rate)
   - Profit (stabilized value - total cost)
   - IRR estimate (simplified)
   - Equity multiple
   - Cash-on-cash return
   - Cost per unit
   - Cost per square foot

2. Wire into siteEngineWorker.ts: after every solve, run the pro forma and include
   results in the PLAN_RESULT message.

3. The optimizer (from Prompt 3) should include yield-on-cost as a factor in its
   scoring function (weight: 0.15, taken from open space weight).

4. Replace ALL hardcoded financial constants in analysis.ts with calls to this module.
```

---

### PROMPT 10: Clean Up Dead Code & Consolidate Pipelines

```
The codebase has 4 competing solver pipelines creating confusion and bugs. Consolidate
to ONE pipeline.

1. Delete these files (they are dead/broken/superseded):
   - src/services/sitePlanEngine.ts (explicitly marked LEGACY/DEV-ONLY)
   - src/engine/parking.ts (superseded by parkingBaySolver.ts — per-stall approach
     is too verbose)
   - src/features/site-planner/engine/seedPads.ts (broken imports, non-functional)
   - src/features/site-planner/engine/mutatePads.ts (broken imports, non-functional)

2. Update all imports that reference deleted files to use the new solver pipeline.
   Search for imports from these paths and remove or redirect them.

3. In src/engine/planner.ts (the legacy orchestrator):
   - Keep it as a thin wrapper that delegates to the new solver pipeline
   - Replace the call to building.ts with buildingGeometry.ts
   - Replace the call to parking.ts with parkingBaySolver.ts
   - Remove optimizeBuildingPlacement() (it's a no-op)
   - Remove generateAlternatives() (the optimizer from Prompt 3 replaces this)

4. Remove duplicate geometry utilities:
   - src/engine/geometry.ts has isPointInPolygon AND contains AND pointInPoly —
     keep only one (isPointInPolygon) and update all callers

5. Audit and remove all console.log statements in engine files
   (there are many left from development).
```

---

## PART 4: Build Priority Order

| Priority | Prompt | Why |
|----------|--------|-----|
| **P0** | Prompt 1 (Fix geometry buffer) | Blocker — nothing else works on real parcels without this |
| **P0** | Prompt 10 (Clean up dead code) | Remove confusion before building new features |
| **P1** | Prompt 3 (Auto-layout optimizer) | This IS the product. Without auto-layout, you can't compete with TestFit |
| **P1** | Prompt 5 (Setback edge classification) | Required for accurate buildable envelopes |
| **P1** | Prompt 6 (Height/density/unit mix) | Required for zoning compliance — table stakes |
| **P2** | Prompt 2 (Building typologies) | Users need more than rectangles |
| **P2** | Prompt 4 (Drive aisle connectivity) | Professional-quality parking layouts |
| **P2** | Prompt 9 (Pro forma in solver loop) | TestFit's other killer feature |
| **P3** | Prompt 7 (Plan persistence) | Save/compare plans |
| **P3** | Prompt 8 (Structured parking) | Competitive feature |

---

## PART 5: Your Competitive Advantages Over TestFit

Don't just clone TestFit. Beat them where they're weak:

1. **Web-based** — TestFit is Windows-only C app. You're accessible from any browser.
2. **Parcel discovery** — TestFit has no map-based parcel search. You have Mapbox + nationwide parcel data.
3. **Multi-parcel assemblage** — TestFit is single-site. You already have ST_Union assemblage with unified constraints.
4. **Real-time collaboration** — TestFit has none. You have comments + sharing.
5. **Underwriting depth** — TestFit has basic pro forma. You can go deeper with IRR, cash-on-cash, scenario comparison.
6. **AI zoning explainer** — TestFit has static zoning data. You have AI-powered zoning interpretation.
7. **Price** — TestFit charges $8K/yr for Site Solver. Undercut them.

---

## PART 6: Schema Gaps Summary

### Missing Tables to Create

| Table | Purpose | Priority |
|-------|---------|----------|
| `site_plans` | Persist generated plans | P2 |
| `site_plan_versions` | Version history | P3 |
| `building_templates` | Reusable building type library | P2 |
| `parking_requirements` | Per-zoning parking ratios | P1 |
| `unit_mix_templates` | Unit mix presets by market | P2 |
| `construction_costs` | Regional cost data | P2 |
| `elevation_data` | DEM/terrain (or use external API) | P3 |

### Duplicate/Redundant Functions to Clean Up

| Function | Issue |
|----------|-------|
| `get_parcel_geometry_3857` (text version) | Superseded by int version |
| `get_parcels_in_bbox_filtered` | Superseded by `get_parcels_in_bbox` |
| `create_assemblage_geometry` | Superseded by unified `get_assemblage_geometry` |
| `get_buildable_envelope` (3-param version) | Superseded by 1-param version using planner_zoning |
| `score_pad` (2 versions with different signatures) | Confusing — consolidate to one |

### Schema Issues

- `parcels` table has ~10 duplicate column pairs (e.g., `owner`/`ownername`/`owner_name`, `deeded_acres`/`deededacreage`, `zoning`/`zoning_code`) from Regrid import inconsistencies
- `default_costs_by_use` table is referenced in `get_default_costs()` but never created in migrations
- `planner_zoning` view has `parking_ratio` column that is always NULL
- `project_parcels` has fully open RLS (anon + authenticated can do anything)
- `roads` table has no RLS enabled

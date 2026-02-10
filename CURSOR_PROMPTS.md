# Cursor Prompts: Build a TestFit-Killer Site Solver

## Your Architecture (DO NOT BREAK THIS)

```
SiteWorkspace (src/features/site-plan/SiteWorkspace.tsx) — orchestrator
├── useSitePlanState (state: config, elements, metrics, alternatives)
├── useBuildableEnvelope (Supabase RPC → envelope polygon)
├── workerManager → siteEngineWorker.ts (Web Worker)
│   ├── INIT_SITE → buildingGeometry + parkingBaySolver + feasibility
│   ├── UPDATE_BUILDING → re-solve parking + feasibility
│   └── generate (legacy) → planner.ts
├── EnterpriseSitePlannerShell (interactive canvas editor)
│   ├── Hooks: useViewport, useSelection, useDrag, useRotation, useVertexEditing
│   ├── Hooks: useDrawingTools, useMeasurement, useGrid
│   ├── SitePlanCanvas (HTML5 Canvas rendering)
│   ├── SitePlanToolbar
│   └── StatusBar
├── ParametersPanel (FAR/coverage/parking/typology sliders + SolveTable)
├── GenerateControls ("Generate Plan" + "Generate Alternatives")
└── ResultsPanel (metrics + investment analysis + violations)
```

**Key files:**
- Worker: `src/workers/siteEngineWorker.ts` (the solver entry point)
- Worker manager: `src/workers/workerManager.ts` (message passing)
- Model types: `src/engine/model.ts` (BuildingSpec, ParkingSpec, PlanState)
- Legacy types: `src/engine/types.ts` (Element, PlannerConfig, PlannerOutput)
- Building geometry: `src/engine/buildingGeometry.ts` (footprint + clamping)
- Parking solver: `src/engine/parkingBaySolver.ts` (bay packing)
- Feasibility: `src/engine/feasibility.ts` (violation checking)
- Geometry: `src/engine/geometry.ts` (boolean ops, area, point-in-poly)
- State hook: `src/features/site-plan/state/useSitePlanState.ts`
- Envelope hook: `src/features/site-plan/api/useBuildableEnvelope.ts`
- Canvas: `src/components/site-planner/SitePlanCanvas.tsx`
- Shell: `src/components/EnterpriseSitePlannerShell.tsx`

---

## PROMPT 1: Fix geometry.ts buffer() — CRITICAL BLOCKER

```
The buffer() function in src/engine/geometry.ts only works on axis-aligned rectangles
(it throws an error for polygons with more than 4 vertices). This is a critical blocker —
we cannot apply setback buffers to real-world irregular parcels.

Replace the buffer() implementation with one that works on ANY polygon. We already have
@turf/turf in package.json. Use turf.buffer() for outward buffers and turf's negative
buffer approach for inward buffers (setbacks).

Keep the same function signature:
  buffer(polygon: Polygon, distance: number): Polygon

Where distance is in meters (EPSG:3857 coordinates). Negative = inward (setbacks).

Handle:
- Irregular polygons (5+ vertices)
- Concave polygons
- Small parcels where buffer collapses the polygon (return null or empty)
- MultiPolygon results (use selectLargestRingFromPolygon which already exists in this file)

Note: The coordinates are in EPSG:3857 (meters), not lat/lon. Turf expects WGS84, so
you may need to handle the coordinate system appropriately, or use the polygon-clipping
library (already imported) to do a Minkowski-style offset instead.

Update tests in tests/engine/geometry.test.ts to verify irregular polygon buffering.
```

---

## PROMPT 2: Build the Auto-Layout Optimizer (THE KILLER FEATURE)

```
This is the most important feature we need. TestFit generates optimized layouts
automatically. Our solver (src/workers/siteEngineWorker.ts) currently requires users
to manually place each building — there is no optimization loop.

Create src/engine/optimizer.ts with a simulated annealing optimizer.

INPUTS (from the existing architecture):
- envelope3857: Polygon (from useBuildableEnvelope hook / get_parcel_buildable_envelope RPC)
- zoning: PlannerConfig['zoning'] (from useSitePlanState config)
- designParams: PlannerConfig['designParameters'] (targetFAR, parking, typology, numBuildings)

ALGORITHM:
1. Generate initial layout:
   - Place numBuildings along the longest edge of the envelope, evenly spaced
   - Each building starts as a BuildingSpec (from src/engine/model.ts) with type MF_BAR_V1
   - Use createBuildingSpec() factory from model.ts
   - Run parkingBaySolver (solveParkingBayPacking from src/engine/parkingBaySolver.ts)
     on remaining space
   - Run computeFeasibility (from src/engine/feasibility.ts) for scoring

2. Simulated annealing loop (default 500 iterations):
   Per iteration, randomly pick ONE mutation:
   - Move a building (shift anchor ±5-20m random)
   - Resize a building (adjust width/depth ±2-10m)
   - Rotate a building (±5-30 degrees)
   - Add a building (if under numBuildings target)
   - Remove a building (if over target or improving score)

   After mutation:
   - Clamp all buildings via clampBuildingToEnvelope (src/engine/buildingGeometry.ts)
   - Build footprints via buildBuildingFootprint (src/engine/buildingGeometry.ts)
   - Solve parking via solveParkingBayPacking (src/engine/parkingBaySolver.ts)
   - Score via computeFeasibility (src/engine/feasibility.ts)

   Score function (higher = better):
   - Unit count: weight 0.30 (units = totalGFA / 800sqft for now)
   - Parking compliance: weight 0.20 (1.0 if ratio met, 0.0 if under by 50%+)
   - FAR utilization: weight 0.15 (closer to max = higher, over max = 0)
   - Coverage compliance: weight 0.10 (under max = good, over = penalty)
   - Open space: weight 0.10 (higher open space % = better)
   - No violations bonus: weight 0.15 (1.0 if zero violations, 0.0 if any)

   Accept/reject: always accept improvements; accept worse with probability
   exp((newScore - oldScore) / temperature), temperature decays from 1.0 to 0.01.

3. Return:
   - bestPlan: PlanState (from model.ts)
   - bestElements: Element[] (buildings + parking bays + aisles)
   - bestMetrics: PlannerOutput['metrics']
   - bestViolations: FeasibilityViolation[]
   - top3Alternatives: same shape, from the 3 best unique layouts found during search
   - iterations: number
   - finalScore: number

WIRE INTO THE WORKER:
In src/workers/siteEngineWorker.ts, add a new message type 'OPTIMIZE':

  case 'OPTIMIZE': {
    const result = optimize(envelope, zoning, designParams);
    // Post progress every 50 iterations: { type: 'OPTIMIZE_PROGRESS', iteration, score }
    // Post final: { type: 'OPTIMIZE_RESULT', ...result }
  }

In src/workers/workerManager.ts, add:
  async optimizeSite(envelope, zoning, designParams): Promise<OptimizeResult>

WIRE INTO THE UI:
In src/features/site-plan/SiteWorkspace.tsx:
- When "Generate Plan" is clicked (handleGenerate), call workerManager.optimizeSite()
  instead of workerManager.initSite()
- Feed the bestElements + bestMetrics + bestViolations into setPlanOutput
- Feed the top3Alternatives into the alternatives array so they show in the SolveTable
- Keep the existing "Generate Alternatives" button working via useSitePlanState

DO NOT modify the existing INIT_SITE or UPDATE_BUILDING handlers. The optimizer is
additive — users can still manually adjust after optimization runs.
```

---

## PROMPT 3: Implement Real Building Typologies

```
The ParametersPanel (src/features/site-plan/ui/ParametersPanel.tsx) has a dropdown for
building typologies: bar, L-shape, podium, custom. But only rectangular bar buildings
are actually generated in src/engine/buildingGeometry.ts.

Implement the missing typologies:

1. Update src/engine/model.ts BuildingSpec to add optional shape parameters:
   - wingWidth?: number (for L-shape)
   - wingDepth?: number (for L-shape)
   - courtyardWidth?: number (for U-shape and courtyard-wrap)
   - courtyardDepth?: number (for U-shape and courtyard-wrap)
   - podiumFloors?: number (for podium type)
   Add two new BuildingType values: 'MF_U_SHAPE' and 'MF_COURTYARD_WRAP'

2. Update src/engine/buildingGeometry.ts buildBuildingFootprint():
   - MF_BAR_V1: Keep as-is (rectangle)
   - MF_L_SHAPE: Generate L-polygon. The main bar is width×depth, the wing extends
     from one corner as wingWidth×wingDepth. Apply rotation around anchor.
   - MF_PODIUM: Footprint is the full podium rectangle (width×depth). Track podium
     floors vs tower floors for GFA calculation.
   - MF_U_SHAPE: Main rectangle with a courtyard cutout on one side
   - MF_COURTYARD_WRAP: Rectangle ring (outer width×depth minus inner courtyard)

3. Update clampBuildingToEnvelope() to work with non-rectangular polygons:
   - Use polygon centroid (not just 4 corners) for containment checks
   - Check if ALL vertices of the footprint are inside the envelope

4. Update createBuildingSpec() in model.ts with sensible defaults per type:
   - Bar: 200ft × 60ft
   - L-shape: main 150ft × 60ft, wing 80ft × 60ft
   - Podium: 200ft × 100ft, 2 podium floors
   - U-shape: 200ft × 120ft, courtyard 100ft × 60ft
   - Courtyard-wrap: 200ft × 150ft, courtyard 120ft × 70ft

5. Wire the typology selection from ParametersPanel through to the worker:
   - In useSitePlanState, when buildingTypology changes, map it to a BuildingType:
     'bar' → 'MF_BAR_V1', 'L-shape' → 'MF_L_SHAPE', 'podium' → 'MF_PODIUM'
   - Pass the BuildingType to the worker's INIT_SITE so the initial building uses
     the selected typology

Add tests in tests/engine/buildingGeometry.test.ts for each typology.
```

---

## PROMPT 4: Add Proper Setback Edge Classification

```
Create src/engine/setbacks.ts

Currently setbacks are applied as a uniform buffer (the same distance on all sides).
Real zoning codes have different setbacks for front, side, and rear edges. The front
edge faces the street.

We have a roads table in Supabase with road geometries (LineString 3857).

Implement:

1. classifyParcelEdges(parcelGeom: Polygon, roadGeoms: LineString[]): EdgeClassification[]
   - For each edge of the parcel polygon, compute distance to nearest road
   - Edge closest to a road = FRONT (store the road name)
   - Edge opposite the front = REAR
   - Remaining edges = SIDE
   - If no roads within 200ft, use longest edge as FRONT
   - Return: { edge: [[x1,y1],[x2,y2]], type: 'front'|'side'|'rear',
     roadName?: string, distanceToRoad: number }[]

2. applyVariableSetbacks(parcelGeom: Polygon, edges: EdgeClassification[],
   setbacks: {front: number, side: number, rear: number}): Polygon | null
   - For each edge, offset it inward by the appropriate setback distance
   - Compute the intersection of all inward half-planes to get the buildable envelope
   - This replaces the uniform buffer approach
   - Return null if setbacks collapse the polygon

3. Add a Supabase RPC to fetch nearby roads:
   Create supabase/migrations/20260210_get_roads_near_parcel.sql:

   CREATE OR REPLACE FUNCTION get_roads_near_parcel(p_parcel_id integer, p_buffer_m float DEFAULT 60)
   RETURNS TABLE(id int, name text, highway text, geom geometry)
   AS $$
     SELECT r.id, r.name, r.highway, r.geom
     FROM roads r, parcels p
     WHERE p.ogc_fid = p_parcel_id
     AND ST_DWithin(r.geom, ST_Transform(p.wkb_geometry_4326, 3857), p_buffer_m);
   $$ LANGUAGE sql STABLE;

4. Update useBuildableEnvelope hook to:
   - After fetching the envelope, also fetch nearby roads via the new RPC
   - Run classifyParcelEdges on the client
   - Run applyVariableSetbacks with the zoning-specific setback values
   - Return the improved envelope

5. Display edge classifications in the ResultsPanel:
   - Show "Front: Main St (25ft setback)", "Side: 10ft", "Rear: 20ft"
```

---

## PROMPT 5: Add Height, Density & Unit Mix Compliance

```
The feasibility checker (src/engine/feasibility.ts) only checks: FAR, coverage,
parking shortfall, building overlap, and building containment. It's missing critical
zoning compliance checks.

1. Add to src/engine/feasibility.ts:

   New violation types:
   - 'HEIGHT_EXCEEDED': building height (floors × 10ft residential / 14ft ground floor)
     vs zoning maxHeight
   - 'DENSITY_EXCEEDED': total dwelling units vs max_density_du_per_acre × parcel acres
   - 'IMPERVIOUS_EXCEEDED': total impervious area (buildings + parking) vs
     max_impervious_coverage_pct
   - 'OPEN_SPACE_INSUFFICIENT': open space % vs min_open_space_pct

   Update FeasibilityInput to accept: maxHeightFt, maxDensityDuPerAcre,
   maxImperviousPct, minOpenSpacePct, parcelAcres

2. Add unit mix to src/engine/model.ts BuildingSpec:

   unitMix: Array<{
     type: 'studio' | '1br' | '2br' | '3br';
     count: number;
     avgSqft: number;
     rentPerMonth: number;
   }>

   Add a helper: generateDefaultUnitMix(gfa: number): UnitMix[]
   - Studio: 450sf, 10% of units, $1,500/mo
   - 1BR: 650sf, 40% of units, $1,800/mo
   - 2BR: 900sf, 35% of units, $2,200/mo
   - 3BR: 1,200sf, 15% of units, $2,800/mo
   - Total units = floor(gfa * 0.85 / weightedAvgSqft) where 0.85 is efficiency

3. Remove ALL hardcoded 800 sqft/unit assumptions:
   - src/engine/feasibility.ts line with "/ 800"
   - src/engine/building.ts line with "800"
   - src/engine/analysis.ts line with "800"
   Replace with actual unit mix calculation.

4. Update siteEngineWorker.ts: after computing building footprints, auto-generate
   unit mix for each building based on its GFA, then use the actual unit count for
   parking ratio calculation.

5. Update ResultsPanel to show unit mix breakdown:
   - "Units: 150 total (15 studio, 60 1BR, 52 2BR, 23 3BR)"

6. Update the zoning constraints in useSitePlanState defaultConfig to include:
   maxHeightFt: 65, maxDensityDuPerAcre: 40, maxImperviousPct: 80, minOpenSpacePct: 15

7. Pass these through to the worker and into computeFeasibility.
```

---

## PROMPT 6: Wire Real Pro Forma Into the Solver

```
The ResultsPanel shows investment analysis, but it's calculated with hardcoded
multipliers in SiteWorkspace.tsx (line ~290):
  totalInvestment: metrics.totalBuiltSF * 150
  projectedRevenue: metrics.totalBuiltSF * 2.5 * 12

Replace this with a real pro forma engine.

Create src/engine/proforma.ts:

Input: PlanState + unit mix + market assumptions
Output: ProFormaResult with:

REVENUE:
- grossPotentialRent: sum of (unit.count × unit.rentPerMonth × 12) for all buildings
- vacancyLoss: grossPotentialRent × vacancyRate (default 5%)
- effectiveGrossIncome: grossPotentialRent - vacancyLoss
- operatingExpenses: effectiveGrossIncome × opexRatio (default 35%)
- netOperatingIncome: effectiveGrossIncome - operatingExpenses

COSTS:
- landCost: user input or parcel.parval from the database
- hardCosts:
  - buildingConstruction: totalGFA × costPerSF (wood-frame $165, steel $210, concrete $260)
  - siteWork: siteArea × $15/sf
  - parkingCost: surfaceStalls × $5,000 + structuredStalls × $25,000
  - totalHard: sum of above
- softCosts: totalHard × 0.20
- contingency: (totalHard + softCosts) × 0.05
- financingCosts: (totalHard + softCosts + contingency) × 0.06 × 1.5 (18-month construction)
- totalDevelopmentCost: sum of all costs

RETURNS:
- yieldOnCost: NOI / totalDevelopmentCost
- stabilizedValue: NOI / capRate (default 5.5%)
- profit: stabilizedValue - totalDevelopmentCost
- equityMultiple: stabilizedValue / (totalDevelopmentCost × 0.35) (35% equity)
- cashOnCash: NOI / (totalDevelopmentCost × 0.35)
- costPerUnit: totalDevelopmentCost / totalUnits
- costPerSF: totalDevelopmentCost / totalGFA

Wire into SiteWorkspace.tsx:
- Replace the hardcoded derivedInvestmentAnalysis with a call to the pro forma engine
- Feed unit mix from the solver result
- Update InvestmentAnalysis type in src/types/parcel.ts to match the new fields
- Update ResultsPanel to display the new fields

Wire into the optimizer (Prompt 2):
- Add yieldOnCost as a scoring factor (weight 0.10, taken from open space weight)
```

---

## PROMPT 7: Add Drive Aisle Connectivity

```
parkingBaySolver.ts generates parking bays but they can be disconnected islands.

Update src/engine/parkingBaySolver.ts:

1. After generating bays, compute a circulation spine:
   - Find the access point: midpoint of the longest envelope edge (simplest approach)
   - Generate a main drive aisle (24ft wide, two-way) from the access point through
     the site, following the general angle of the parking bays
   - The main drive aisle polygon should connect to each bay's aisle

2. Add connectivity validation:
   - Check that each bay's aisle is within 5ft of the main drive or another connected aisle
   - If any bay is isolated, add a connector segment

3. Add to ParkingBaySolution:
   - circulationPolygons: Polygon[] (main drive + connectors)
   - accessPoint: [number, number]
   - isFullyConnected: boolean
   - circulationAreaSqM: number

4. Update siteEngineWorker.ts solvePlan():
   - Include circulation polygons as Element[] with type 'circulation' and properties
     { color: '#94A3B8', areaSqFt: ... }
   - Subtract circulation area from open space calculation

5. Update SitePlanCanvas.tsx rendering to draw circulation elements in gray.
```

---

## PROMPT 8: Clean Up Dead Code & Fix Broken Pipelines

```
The codebase has 4 competing solver pipelines. Consolidate to the "new" pipeline
(siteEngineWorker → model.ts + buildingGeometry + parkingBaySolver + feasibility).

1. Mark these files with a deprecation header (don't delete yet, but stop importing):
   - src/services/sitePlanEngine.ts (already marked LEGACY)
   - src/engine/parking.ts (superseded by parkingBaySolver.ts)
   - src/engine/building.ts (superseded by buildingGeometry.ts + model.ts)

2. Fix the broken genetic optimizer or remove it:
   - src/features/site-planner/engine/seedPads.ts imports getBuildableEnvelope from
     scorePad.ts but that function doesn't exist
   - src/features/site-planner/engine/mutatePads.ts calls scorePad() with wrong params
   - If keeping: fix the imports to match scorePad.ts actual exports
   - If removing (recommended — the simulated annealing optimizer from Prompt 2
     replaces this): delete seedPads.ts and mutatePads.ts

3. In src/engine/geometry.ts, remove duplicate point-in-polygon implementations:
   - Keep isPointInPolygon(), remove contains() and pointInPoly()
   - Update all callers

4. In src/engine/planner.ts:
   - Remove the no-op optimizeBuildingPlacement() function
   - Remove generateAlternatives() (replaced by optimizer from Prompt 2)
   - Keep generateSitePlan() as a thin legacy wrapper only used by the 'generate'
     message type in the worker

5. Remove excessive console.log statements from:
   - src/workers/workerManager.ts (30+ console.logs)
   - src/components/EnterpriseSitePlannerShell.tsx (debug logging in every handler)
   - src/features/site-plan/SiteWorkspace.tsx
   Use import.meta.env.DEV guards where logs are kept for debugging.
```

---

## PROMPT 9: Plan Persistence & Side-by-Side Comparison

```
Users need to save, load, and compare generated site plans.

1. Create supabase migration: supabase/migrations/20260210_site_plans.sql

   CREATE TABLE public.site_plans (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id text NOT NULL,
     parcel_id text NOT NULL,
     name text NOT NULL DEFAULT 'Untitled Plan',
     elements jsonb NOT NULL,
     metrics jsonb NOT NULL,
     violations jsonb DEFAULT '[]',
     unit_mix jsonb,
     pro_forma jsonb,
     config jsonb NOT NULL,
     score numeric,
     is_favorite boolean DEFAULT false,
     created_at timestamptz DEFAULT now(),
     updated_at timestamptz DEFAULT now()
   );
   CREATE INDEX idx_site_plans_parcel ON site_plans(parcel_id);

2. Create src/lib/sitePlanStorage.ts:
   - saveSitePlan(plan, projectId, parcelId, name)
   - loadSitePlan(id)
   - listSitePlans(parcelId)
   - deleteSitePlan(id)

3. Create src/hooks/useSitePlans.ts:
   - Wraps storage functions with loading/error states
   - Returns: { plans, save, load, delete, isLoading }

4. Add to ParametersPanel:
   - "Save Plan" button after generation
   - Dropdown of saved plans to load
   - Star/favorite toggle

5. Add to SolveTable:
   - Include saved plans alongside generated alternatives
   - Side-by-side metric comparison columns
```

---

## PROMPT 10: Greenspace Generation in New Solver

```
The legacy planner (src/engine/planner.ts) generates greenspace by computing the
geometric difference between the parcel and buildings/parking. The new solver
(siteEngineWorker.ts) does NOT generate greenspace — openSpacePct is hardcoded to 0.

Fix this in src/workers/siteEngineWorker.ts solvePlan():

1. After generating building footprints and parking bay polygons, compute greenspace:
   - Start with the buildable envelope polygon
   - Subtract all building footprint polygons (using geometry.difference())
   - Subtract all parking bay polygons
   - Subtract all parking aisle polygons
   - Subtract circulation polygons (if added from Prompt 7)
   - The remaining area = greenspace

2. Convert the remaining polygon(s) to Element[] with type 'greenspace':
   - Use geometry.polygons() to extract individual polygons from MultiPolygon
   - Only include polygons larger than 100 sqft (filter out slivers)
   - Set properties: { color: '#22C55E', areaSqFt: computed }

3. Update the metrics calculation:
   - openSpacePct = greenspace area / envelope area × 100
   - Include greenspace in the elements array returned to the UI

4. Update SitePlanCanvas to render greenspace with a semi-transparent green fill.
```

---

## BUILD ORDER (copy these prompts in this order)

| Step | Prompt | Time Est | Why First |
|------|--------|----------|-----------|
| 1 | Prompt 1 (Fix buffer) | 30 min | Blocker for setbacks on real parcels |
| 2 | Prompt 8 (Clean up dead code) | 45 min | Remove confusion before building |
| 3 | **Prompt 2 (Auto-layout optimizer)** | 2-3 hrs | **THE killer feature** |
| 4 | Prompt 5 (Height/density/unit mix) | 1-2 hrs | Core compliance |
| 5 | Prompt 10 (Greenspace) | 30 min | Quick win, fills gap |
| 6 | Prompt 3 (Building typologies) | 1-2 hrs | Beyond rectangles |
| 7 | Prompt 6 (Pro forma) | 1-2 hrs | Financial validation |
| 8 | Prompt 4 (Setback edge classification) | 1-2 hrs | Accurate envelopes |
| 9 | Prompt 7 (Drive aisles) | 1-2 hrs | Professional parking |
| 10 | Prompt 9 (Plan persistence) | 1-2 hrs | Save/compare |

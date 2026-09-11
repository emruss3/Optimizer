# Site Planner: Live vs Legacy Classification

This document categorizes all site planner-related files into three groups based on their usage in the production application.

## Group A: LIVE - Production Files

These files are directly or indirectly used from real user-facing routes/components. **These are the files we should refactor and maintain.**

### Core Components
- `src/components/EnterpriseSitePlannerShell.tsx` - Main site planner component
- `src/components/SitePlanDesigner.tsx` - Site plan configuration panel
- `src/components/site-planner/SitePlanCanvas.tsx` - Canvas rendering
- `src/components/site-planner/SitePlanToolbar.tsx` - Toolbar UI
- `src/components/site-planner/StatusBar.tsx` - Status bar
- `src/components/site-planner/TemplateSelector.tsx` - Template selector

### Hooks
- `src/hooks/useViewport.ts` - Viewport management
- `src/hooks/useSelection.ts` - Element selection
- `src/hooks/useDrag.ts` - Drag operations
- `src/hooks/useDrawingTools.ts` - Drawing tool state
- `src/hooks/useRotation.ts` - Element rotation
- `src/hooks/useVertexEditing.ts` - Vertex editing
- `src/hooks/useMeasurement.ts` - Measurement tool
- `src/hooks/useGrid.ts` - Grid display/snap

### Services
- `src/services/elementService.ts` - Element operations (create, delete, move, rotate, align)
- `src/services/templateService.ts` - Template management
- `src/services/parcelGeometry.ts` - Parcel geometry fetching

### Engine
- `src/engine/types.ts` - Type definitions
- `src/engine/planner.ts` - Site plan generation logic
- `src/engine/geometry.ts` - Geometry operations
- `src/engine/geometry/normalize.ts` - Geometry normalization
- `src/engine/building.ts` - Building generation
- `src/engine/parking.ts` - Parking generation
- `src/engine/analysis.ts` - Metrics calculation
- `src/engine/metrics/parcelMetrics.ts` - Parcel metrics

### Workers
- `src/workers/workerManager.ts` - Worker management
- `src/workers/siteEngineWorker.ts` - Web Worker implementation
- `src/engine/workers/sitegenie/index.ts` - SiteGenie worker entry
- `src/engine/workers/sitegenie/planner.ts` - SiteGenie planner logic

### API
- `src/api/fetchEnvelope.ts` - Buildable envelope fetching
- `src/api/planner.ts` - Planner API

### Utils
- `src/utils/reproject.ts` - Coordinate reprojection (4326 ↔ 3857)
- `src/utils/coordinateTransform.ts` - Coordinate transformation (Web Mercator ↔ Feet)

### Supporting Types
- `src/types/parcel.ts` - Parcel type definitions
- `src/types/zoning.ts` - Zoning type definitions

## Group B: DEV/EXPERIMENTAL - Preserved

These files are accessible from dev menu routes in App.tsx and have been preserved. **Note: None of the legacy planner variants from the original Group B specification existed in the codebase.**

### Dev/Experimental Components (Kept - accessible via App.tsx menu)
- `src/components/ParcelAnalysisDemo.tsx` - Demo component (dev mode only)
- `src/components/WorkflowAudit.tsx` - Audit tool (dev mode only)
- `src/components/WorkflowConnectionTest.tsx` - Connection test (dev mode only)
- `src/components/UnifiedWorkspace.tsx` - Workspace experiment (dev mode only)
- `src/components/ProjectWorkflow.tsx` - Workflow experiment (dev mode only)
- `src/components/SimpleProjectManager.tsx` - Simple manager (dev mode only)
- `src/components/ConnectedProjectWorkflow.tsx` - Connected workflow (dev mode only)
- `src/components/RealUnderwritingWorkflow.tsx` - Underwriting workflow (dev mode only)

## Group C: DELETED - Dead Code Removed (2026-09-11)

These files were confirmed unreferenced and have been deleted:

- ~~`src/components/SetbackOverlay.tsx`~~ - **DELETED** (setback overlay, not imported)
- ~~`src/store/sitePlan.ts`~~ - **DELETED** (site plan store, not imported)
- ~~`src/features/site-planner/hooks/useMouseHandlers.ts`~~ - **DELETED** (legacy hook, not imported)
- ~~`src/features/site-planner/types.ts`~~ - **DELETED** (legacy types, not imported)
- ~~`src/features/site-planner/engine/scorePad.ts`~~ - **DELETED** (dead RPC wrapper, confirmed in bugged-RPC audit)

### Note on Legacy Planner Variants
The following files from the original Group B specification **did not exist** in the codebase:
- `src/components/EnterpriseSitePlanner.tsx` - Not found
- `src/components/EnhancedSitePlanner.tsx` - Not found
- `src/components/ConsolidatedSitePlanner.tsx` - Not found
- `src/components/AIDrivenSitePlanGenerator.tsx` - Not found
- `src/components/adapters/SitePlannerAdapters.tsx` - Not found
- `src/hooks/useEnhancedSitePlanner.ts` - Not found

### Files Identified But Not Deleted
- `src/components/SitePlannerWrapper.tsx` - Not found in codebase
- `src/services/sitePlanEngine.ts` - Not found in codebase

## Summary

- **Group A (LIVE)**: 37 files - **These are the files we refactor**
- **Group B (DEV/EXPERIMENTAL)**: 8 files - **Preserved (accessible via App.tsx menu)**
- **Group C (DELETED)**: 5 files - **Removed (dead code cleanup completed 2026-09-11)**

## Refactoring Strategy

1. **Focus only on Group A files** - These are the production files that users actually interact with
2. **Ignore Group B files** - These are experimental/dev-only and should not be touched
3. **Archive Group C files** - Move to `legacy/` folder with a comment explaining they're unused

## Entry Point Paths to Site Planner

The site planner is reachable through these production paths:

1. **Map → ParcelDrawer → FullAnalysisModal → SitePlanDesigner + EnterpriseSitePlannerShell**
   - User clicks parcel → opens drawer → clicks "Full Analysis" → sees site planner

2. **Map → RightDrawer → ProjectPanel → EnterpriseSitePlannerShell**
   - User has active project → opens right drawer → sees site planner in project panel

3. **Map → UnifiedProjectWorkflow → EnterpriseSitePlannerShell**
   - User opens unified workflow → sees site planner in workflow

All three paths lead to `EnterpriseSitePlannerShell.tsx`, which is the main production site planner component.


---

## Bugged-RPC reference classification (audit 2026-07-21, Ordered Path item 4)

The legacy RPCs `get_buildable_envelope`, `get_parcel_geometry_3857`, and
`score_pad` carry projection-bugged EPSG:3857 math and are BANNED from live
paths (the compiled planner context is the sole envelope/measurement source).
All **9** remaining references were traced and classified — **none is in a
live measurement path**:

| # | Site | RPC | Class | Status |
|---|------|-----|-------|--------|
| 1 | `components/SupabaseIntegrationExample.tsx:77` | get_buildable_envelope | display (code sample string in an unmounted demo) | dead |
| 2 | `services/parcelGeometry.ts:91` | get_parcel_geometry_3857 | service method — zero runtime consumers (SetbackOverlay deleted; own test file) | dead, stamped |
| 3 | `services/parcelAnalysis.ts:116` | get_buildable_envelope | deprecated service, demo-only | dead, stamped |
| 4 | `services/parcelAnalysis.ts:156` | score_pad | deprecated service, demo-only | dead, stamped |
| 5 | `services/parcelAnalysis.ts:263` | get_parcel_geometry_3857 | deprecated service, demo-only | dead, stamped |
| 6 | ~~`features/site-planner/engine/scorePad.ts:29`~~ | score_pad | **DELETED** - module with zero importers | removed 2026-09-11 |
| 7 | `lib/rpc.ts:31` | score_pad | dead export (`sb` client re-export in the same file IS live via `map/ParcelSource.ts` — display only) | dead, stamped |
| 8 | `lib/parcelRpc.ts:23` | get_parcel_geometry_3857 | deprecated wrapper, demo-only | dead, stamped |
| 9 | `lib/parcelRpc.ts:55` | get_buildable_envelope | deprecated wrapper, demo-only | dead, stamped |

Rule reaffirmed: anything that MEASURES (envelope, setbacks, areas) must come
from the compiled planner context / server plan responses (EPSG:2274 truth).
Display-only mounts of these files are tolerated but stamped; new imports of
any stamped file are a review rejection.

## envelope3857 staging decision (audit 2026-07-21, Ordered Path item 4)

**Decided: the brief's `geometry.buildable_envelope` is PRIMARY** in
`useBuildableEnvelope`; the client's variable-setback construction is the
fallback (briefs without an envelope), and edge classification remains for
display (F/R/S labels). Rationale: the brief envelope is computed by the
context engine in EPSG:2274 true feet with directional setbacks off the REAL
frontage; the client construction offsets in Web-Mercator metres, which
under-applies setbacks by ~19% in true feet at Nashville's latitude and uses
a frontage heuristic. `rpcMetrics.envelopeSource` records which path served
each plan (`brief_2274_true` vs `client_variable_setbacks`).

## Standing decisions (2026-07-21, recorded from the coordination session)

**1. Degraded mode blocks massing entirely — DECIDED: YES.**
No compiled context ⇒ no massing, ever: every gate is an unconditional
hard-block behind the Retry screen (the `ALLOW_DEGRADED_DRAFT` bypass was
deleted in PR #74; verified zero references remain). Rationale: warm compiles
cost 11 ms, so a missing context is a real outage, not a latency case — and
rendering on default assumptions is how SF setbacks once shipped under
apartment bars. The single sanctioned exception is the explicit replay of a
PRE-CONTRACT saved candidate: historical data, watermarked as a draft, never
persisted, never auto-selected.

**2. Auth/feedback flow — DECIDED: next client workstream after the battery
gate lands.** Feedback events have been at zero since day one; every plan
generated without them is training data lost. Sequence: (a) stopgap
insert-only RLS policy so anonymous sessions can emit feedback events
(no reads, session-keyed, rate-limited) — the loop starts collecting before
sign-in exists as a habit; (b) the shipped AuthChip (PR #66) becomes a soft
prompt at first plan generation, attaching user identity to feedback and
saved schemes. RLS completion (currently 14/43 tables) remains the gate
before EXTERNAL users — unchanged.

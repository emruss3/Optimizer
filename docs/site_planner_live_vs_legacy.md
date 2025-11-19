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

## Group B: DEV/EXPERIMENTAL - Not in Production

These files are only used in dev-only routes, Storybook stories, or experimental components. **Leave these alone for now.**

### Legacy Planner Components (Adapter-Only)
- `src/components/EnterpriseSitePlanner.tsx` - Legacy planner (only imported by adapters)
- `src/components/EnhancedSitePlanner.tsx` - Legacy planner (only imported by adapters)
- `src/components/ConsolidatedSitePlanner.tsx` - Legacy planner (only imported by adapters)
- `src/components/AIDrivenSitePlanGenerator.tsx` - AI generator (experimental, used in UnifiedProjectWorkflow but not main flow)
- `src/components/adapters/SitePlannerAdapters.tsx` - Adapter layer (experimental)

### Legacy Hooks
- `src/hooks/useEnhancedSitePlanner.ts` - Legacy hook (not imported)

### Legacy Features
- `src/features/site-planner/hooks/useMouseHandlers.ts` - Legacy hook (not imported)
- `src/features/site-planner/types.ts` - Legacy types (not imported)

### Dev/Experimental Components
- `src/components/ParcelAnalysisDemo.tsx` - Demo component (dev mode only)
- `src/components/WorkflowAudit.tsx` - Audit tool (dev mode only)
- `src/components/WorkflowConnectionTest.tsx` - Connection test (dev mode only)
- `src/components/UnifiedWorkspace.tsx` - Workspace experiment (dev mode only)
- `src/components/ProjectWorkflow.tsx` - Workflow experiment (dev mode only)
- `src/components/SimpleProjectManager.tsx` - Simple manager (dev mode only)
- `src/components/ConnectedProjectWorkflow.tsx` - Connected workflow (dev mode only)
- `src/components/RealUnderwritingWorkflow.tsx` - Underwriting workflow (dev mode only)

## Group C: UNREFERENCED - Dead Code

These files are not imported anywhere or only referenced by other Group C files. **These can be moved to legacy/ folder later.**

- `src/components/SitePlannerWrapper.tsx` - Wrapper component (not imported)
- `src/components/SetbackOverlay.tsx` - Setback overlay (not imported)
- `src/store/sitePlan.ts` - Site plan store (not imported)
- `src/services/sitePlanEngine.ts` - Site plan engine (not imported)

## Summary

- **Group A (LIVE)**: 37 files - **These are the files we refactor**
- **Group B (DEV/EXPERIMENTAL)**: 12 files - **Leave these alone**
- **Group C (UNREFERENCED)**: 4 files - **Can be archived later**

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


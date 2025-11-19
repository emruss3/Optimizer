# Site Planner Dependency Map

This document maps all files in the codebase, showing their import relationships and whether they're part of the site planner stack.

## Entry Points

1. **main.tsx** - Application entry point
2. **App.tsx** - Main application component (no routing, conditional rendering)

## Dependency Map

| File | Imported By | Role | IsPlannerRelated | ReachableFromEntry |
|------|-------------|------|------------------|-------------------|
| **Entry Points** |
| `src/main.tsx` | N/A (entry) | Application bootstrap | N | Y |
| `src/App.tsx` | `main.tsx` | Main app component | N | Y |
| **Core Map Components** |
| `src/components/MapPanel.tsx` | `App.tsx` | Map container | N | Y |
| `src/components/Map.tsx` | `MapPanel.tsx` | Map wrapper | N | Y |
| `src/components/MapView.tsx` | `Map.tsx` | Mapbox map implementation | N | Y |
| **Parcel Drawer & Analysis** |
| `src/components/ParcelDrawer.tsx` | `App.tsx` | Parcel details drawer | N | Y |
| `src/components/FullAnalysisModal.tsx` | `ParcelDrawer.tsx` | Full analysis modal | Y | Y |
| `src/components/HBUAnalysisPanel.tsx` | `FullAnalysisModal.tsx` | HBU analysis | N | Y |
| **Site Planner - LIVE (Group A)** |
| `src/components/SitePlanDesigner.tsx` | `FullAnalysisModal.tsx` | Site plan configuration panel | Y | Y |
| `src/components/EnterpriseSitePlannerShell.tsx` | `FullAnalysisModal.tsx`, `ProjectPanel.tsx`, `UnifiedProjectWorkflow.tsx` | Main site planner component | Y | Y |
| `src/components/site-planner/SitePlanCanvas.tsx` | `EnterpriseSitePlannerShell.tsx` | Canvas rendering | Y | Y |
| `src/components/site-planner/SitePlanToolbar.tsx` | `EnterpriseSitePlannerShell.tsx` | Toolbar UI | Y | Y |
| `src/components/site-planner/StatusBar.tsx` | `EnterpriseSitePlannerShell.tsx` | Status bar UI | Y | Y |
| `src/components/site-planner/TemplateSelector.tsx` | `EnterpriseSitePlannerShell.tsx` | Template selection UI | Y | Y |
| **Site Planner Hooks - LIVE** |
| `src/hooks/useViewport.ts` | `EnterpriseSitePlannerShell.tsx` | Viewport management | Y | Y |
| `src/hooks/useSelection.ts` | `EnterpriseSitePlannerShell.tsx` | Element selection | Y | Y |
| `src/hooks/useDrag.ts` | `EnterpriseSitePlannerShell.tsx` | Drag operations | Y | Y |
| `src/hooks/useDrawingTools.ts` | `EnterpriseSitePlannerShell.tsx` | Drawing tool state | Y | Y |
| `src/hooks/useRotation.ts` | `EnterpriseSitePlannerShell.tsx` | Element rotation | Y | Y |
| `src/hooks/useVertexEditing.ts` | `EnterpriseSitePlannerShell.tsx` | Vertex editing | Y | Y |
| `src/hooks/useMeasurement.ts` | `EnterpriseSitePlannerShell.tsx` | Measurement tool | Y | Y |
| `src/hooks/useGrid.ts` | `EnterpriseSitePlannerShell.tsx` | Grid display/snap | Y | Y |
| **Site Planner Services - LIVE** |
| `src/services/elementService.ts` | `EnterpriseSitePlannerShell.tsx`, `SitePlanCanvas.tsx` | Element operations | Y | Y |
| `src/services/templateService.ts` | `EnterpriseSitePlannerShell.tsx`, `TemplateSelector.tsx` | Template management | Y | Y |
| **Site Planner Engine - LIVE** |
| `src/engine/types.ts` | Multiple planner files | Type definitions | Y | Y |
| `src/engine/planner.ts` | `workers/siteEngineWorker.ts` | Site plan generation logic | Y | Y |
| `src/engine/geometry.ts` | `planner.ts`, `SitePlanDesigner.tsx` | Geometry operations | Y | Y |
| `src/engine/geometry/normalize.ts` | `FullAnalysisModal.tsx`, `SitePlanDesigner.tsx` | Geometry normalization | Y | Y |
| `src/engine/building.ts` | `planner.ts` | Building generation | Y | Y |
| `src/engine/parking.ts` | `planner.ts` | Parking generation | Y | Y |
| `src/engine/analysis.ts` | `planner.ts` | Metrics calculation | Y | Y |
| `src/engine/metrics/parcelMetrics.ts` | `SitePlanDesigner.tsx` | Parcel metrics | Y | Y |
| **Site Planner Workers - LIVE** |
| `src/workers/workerManager.ts` | `EnterpriseSitePlannerShell.tsx`, `SitePlanDesigner.tsx` | Worker management | Y | Y |
| `src/workers/siteEngineWorker.ts` | `workerManager.ts` | Web Worker implementation | Y | Y |
| `src/engine/workers/sitegenie/index.ts` | `SitePlanDesigner.tsx` | SiteGenie worker entry | Y | Y |
| `src/engine/workers/sitegenie/planner.ts` | `engine/workers/sitegenie/index.ts` | SiteGenie planner logic | Y | Y |
| **Site Planner API - LIVE** |
| `src/api/fetchEnvelope.ts` | `SitePlanDesigner.tsx` | Envelope fetching | Y | Y |
| `src/api/planner.ts` | Various | Planner API | Y | Y |
| **Site Planner Utils - LIVE** |
| `src/utils/reproject.ts` | `EnterpriseSitePlannerShell.tsx` | Coordinate reprojection | Y | Y |
| `src/utils/coordinateTransform.ts` | `EnterpriseSitePlannerShell.tsx` | Coordinate transformation | Y | Y |
| **Project Components** |
| `src/components/ProjectPanel.tsx` | `RightDrawer.tsx` | Project panel | Y | Y |
| `src/components/UnifiedProjectWorkflow.tsx` | `App.tsx` | Unified workflow | Y | Y |
| **Legacy Site Planner - DEV/EXPERIMENTAL (Group B)** |
| `src/components/EnterpriseSitePlanner.tsx` | `adapters/SitePlannerAdapters.tsx` | Legacy planner (adapter only) | Y | N |
| `src/components/EnhancedSitePlanner.tsx` | `adapters/SitePlannerAdapters.tsx` | Legacy planner (adapter only) | Y | N |
| `src/components/ConsolidatedSitePlanner.tsx` | `adapters/SitePlannerAdapters.tsx` | Legacy planner (adapter only) | Y | N |
| `src/components/AIDrivenSitePlanGenerator.tsx` | `adapters/SitePlannerAdapters.tsx`, `UnifiedProjectWorkflow.tsx` | AI generator (experimental) | Y | N |
| `src/components/adapters/SitePlannerAdapters.tsx` | `UnifiedProjectWorkflow.tsx` | Adapter layer | Y | N |
| `src/hooks/useEnhancedSitePlanner.ts` | Not imported | Legacy hook | Y | N |
| `src/features/site-planner/hooks/useMouseHandlers.ts` | Not imported | Legacy hook | Y | N |
| `src/features/site-planner/types.ts` | Not imported | Legacy types | Y | N |
| **Dev/Experimental Components** |
| `src/components/ParcelAnalysisDemo.tsx` | `App.tsx` (dev mode) | Demo component | N | N |
| `src/components/WorkflowAudit.tsx` | `App.tsx` (dev mode) | Audit tool | N | N |
| `src/components/WorkflowConnectionTest.tsx` | `App.tsx` (dev mode) | Connection test | N | N |
| `src/components/UnifiedWorkspace.tsx` | `App.tsx` (dev mode) | Workspace experiment | N | N |
| `src/components/ProjectWorkflow.tsx` | `App.tsx` (dev mode) | Workflow experiment | N | N |
| `src/components/SimpleProjectManager.tsx` | `App.tsx` (dev mode) | Simple manager | N | N |
| `src/components/ConnectedProjectWorkflow.tsx` | `App.tsx` (dev mode) | Connected workflow | N | N |
| `src/components/RealUnderwritingWorkflow.tsx` | `App.tsx` (dev mode) | Underwriting workflow | N | N |
| **Storybook Files** |
| `src/components/*.stories.tsx` | Storybook only | Storybook stories | N | N |
| **Unreferenced - Group C** |
| `src/components/SitePlannerWrapper.tsx` | Not imported | Wrapper component | Y | N |
| `src/components/SetbackOverlay.tsx` | Not imported | Setback overlay | Y | N |
| `src/services/sitePlanEngine.ts` | Not imported | Site plan engine (unused) | Y | N |
| **Supporting Files** |
| `src/services/parcelGeometry.ts` | `SitePlanDesigner.tsx` | Parcel geometry service | Y | Y |
| `src/lib/supabase.ts` | Multiple | Supabase client | N | Y |
| `src/types/parcel.ts` | Multiple | Parcel types | Y | Y |
| `src/types/project.ts` | Multiple | Project types | N | Y |
| `src/types/zoning.ts` | Multiple | Zoning types | Y | Y |
| `src/store/project.ts` | Multiple | Project store | N | Y |
| `src/store/ui.ts` | Multiple | UI store | N | Y |
| `src/store/sitePlan.ts` | Not imported | Site plan store | Y | N |

## Notes

- **IsPlannerRelated=Y**: Files that are part of the map/site-planner/CAD stack
- **ReachableFromEntry=Y**: Files that can be reached from production entry points (main.tsx → App.tsx)
- **Group A (LIVE)**: Files with IsPlannerRelated=Y AND ReachableFromEntry=Y
- **Group B (DEV/EXPERIMENTAL)**: Files with IsPlannerRelated=Y but only used in dev/experimental components
- **Group C (UNREFERENCED)**: Files with IsPlannerRelated=Y but not imported anywhere


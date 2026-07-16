// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * EnterpriseSitePlannerShell - Modular Site Planner Component
 * 
 * This component orchestrates modular pieces:
 * - Hooks: useViewport, useSelection, useDrag, useDrawingTools
 * - Components: SitePlanCanvas, SitePlanToolbar
 * - Services: ElementService
 * 
 * The shell component coordinates these pieces but doesn't contain
 * the implementation details, making it easier to maintain and extend.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Building, Maximize2 } from 'lucide-react';
import { SelectedParcel } from '../types/parcel';
import type { Element, SiteMetrics, PlannerOutput } from '../engine/types';
import { feature4326To3857 } from '../utils/reproject';
import { normalizeToPolygon } from '../engine/geometry';
import { feetToMeters, metersToFeet } from '../engine/units';

// Modular hooks
import { useViewport } from '../hooks/useViewport';
import { useSelection } from '../hooks/useSelection';
import { useDrag } from '../hooks/useDrag';
import { useDrawingTools } from '../hooks/useDrawingTools';
import { useRotation } from '../hooks/useRotation';
import { useVertexEditing } from '../hooks/useVertexEditing';
import { useMeasurement } from '../hooks/useMeasurement';
import { useGrid } from '../hooks/useGrid';

// Modular components
import { SitePlanCanvas } from './site-planner/SitePlanCanvas';
import { SitePlanToolbar } from './site-planner/SitePlanToolbar';
import { TemplateSelector } from './site-planner/TemplateSelector';
import { StatusBar } from './site-planner/StatusBar';

// Services
import { ElementService } from '../services/elementService';
import { TemplateService } from '../services/templateService';
import { computeSnapDelta } from './site-planner/snapping';

/** Centroid of a ring, excluding the closing vertex. */
function ringCentroid(coords: number[][]): { x: number; y: number } {
  const n =
    coords.length > 1 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1
      : coords.length;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += coords[i][0];
    y += coords[i][1];
  }
  return { x: x / Math.max(1, n), y: y / Math.max(1, n) };
}

interface EnterpriseSitePlannerProps {
  parcel: SelectedParcel;
  planElements?: Element[];
  metrics?: SiteMetrics;
  activePlanId?: string;
  selectedSolve?: PlannerOutput;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number };
  buildableEnvelope?: import('geojson').Polygon;
  /** Road-classified parcel edges (front/side/rear) for the setback overlay */
  edgeClassifications?: import('../engine/setbacks').EdgeClassification[];
  setbacks?: { front?: number; side?: number; rear?: number };
  envelopeStatus?: 'loading' | 'ready' | 'invalid';
  envelopeError?: string | null;
  usingFallbackEnvelope?: boolean;
  onRetryEnvelope?: () => void;
  onBuildingUpdate?: (
    update: {
      id: string;
      anchor: { x: number; y: number };
      rotationRad: number;
      widthFt: number;
      depthFt: number;
      floors?: number;
    },
    options?: { final?: boolean }
  ) => void;
  onAddBuilding?: () => void;
  /**
   * Delete buildings for real (worker-side). Without this, deleting a
   * building is cosmetic — it reappears on the next re-solve.
   */
  onDeleteBuildings?: (ids: string[]) => void;
  /**
   * Duplicate buildings worker-side (paste). Same reasoning as delete: a
   * locally-cloned building would vanish on the next re-solve.
   */
  onCloneBuildings?: (ids: string[]) => void;
  /**
   * The plan is a server/SF-generated system (no local worker session).
   * Local-only edits (paste, align, vertex edit) would be wiped by the next
   * regeneration, so those tools disable with an explanation; deleting is
   * limited to pinned buildings (a real edit → regeneration).
   */
  staticPlan?: boolean;
}

const EnterpriseSitePlanner: React.FC<EnterpriseSitePlannerProps> = ({
  parcel,
  planElements = [],
  metrics,
  activePlanId,
  selectedSolve,
  parkingViz,
  buildableEnvelope,
  edgeClassifications,
  setbacks,
  envelopeStatus,
  envelopeError,
  usingFallbackEnvelope,
  onRetryEnvelope,
  onBuildingUpdate,
  onAddBuilding,
  onDeleteBuildings,
  onCloneBuildings,
  staticPlan = false
}) => {
  // NOTE: Do NOT early-return before the hooks below — React requires hooks to
  // run unconditionally on every render. The `!parcel` guard lives just before
  // the JSX return instead (see below).

  // Use selectedSolve if provided, otherwise use planElements/metrics
  const initialElements = selectedSolve?.elements || planElements;
  const initialMetrics = selectedSolve?.metrics || metrics;

  // State
  const [elements, setElements] = useState<Element[]>(initialElements);
  const [copiedElements, setCopiedElements] = useState<Element[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [hasInitializedView, setHasInitializedView] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [displayMetrics, setDisplayMetrics] = useState<SiteMetrics | null>(initialMetrics || null);
  // Element rotation (degrees) captured at the moment a rotation drag starts,
  // so rotation is applied to the original geometry rather than compounding.
  const rotationStartDegRef = useRef(0);
  // Id of the element the user is actively dragging/rotating. While set,
  // incoming solver results are merged around it — the solver re-packs parking
  // and open space live, but never touches the element in the user's hand.
  const activeManipulationRef = useRef<string | null>(null);
  // Last delta actually applied to the dragged element (incl. magnetic snap),
  // so mouse-up commits exactly what the user saw.
  const lastDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  // Corner-drag resize (buildings): the grabbed corner follows the mouse
  // while the opposite corner stays fixed. Everything is derived in the
  // building's own frame so rotated bars resize along their real axes.
  const resizeRef = useRef<{
    elementId: string;
    fixed: { x: number; y: number };
    fixedIndex: number;
    u: { x: number; y: number }; // unit vector fixed → adjacent (width axis)
    v: { x: number; y: number }; // unit vector fixed → other adjacent (depth axis)
    floors?: number;
  } | null>(null);
  const lastResizeUpdateRef = useRef<{
    id: string;
    anchor: { x: number; y: number };
    rotationRad: number;
    widthFt: number;
    depthFt: number;
    floors?: number;
  } | null>(null);
  const [hoveringResizeCorner, setHoveringResizeCorner] = useState(false);
  
  // Merge solver results in WITHOUT touching the element being manipulated —
  // this is what lets parking re-pack live under a drag with no fighting.
  const mergeIncoming = useCallback((prev: Element[], incoming: Element[]): Element[] => {
    const activeId = activeManipulationRef.current;
    if (!activeId) return incoming;
    const local = prev.find(el => el.id === activeId);
    if (!local) return incoming;
    let replaced = false;
    const merged = incoming.map(el => {
      if (el.id === activeId) {
        replaced = true;
        return local;
      }
      return el;
    });
    // Solver result may not contain the active element yet (e.g. brand-new
    // building) — keep the local one alive rather than dropping it mid-drag.
    return replaced ? merged : [...merged, local];
  }, []);

  // Update elements and metrics when selectedSolve changes
  useEffect(() => {
    if (selectedSolve) {
      setElements(prev => mergeIncoming(prev, selectedSolve.elements));
      setDisplayMetrics(selectedSolve.metrics);
    } else if (planElements.length > 0 || metrics) {
      setElements(prev => mergeIncoming(prev, planElements));
      setDisplayMetrics(metrics || null);
    }
  }, [selectedSolve, planElements, metrics, mergeIncoming]);

  // Modular hooks
  const viewport = useViewport();
  const selection = useSelection();
  const drag = useDrag();
  const drawingTools = useDrawingTools();
  const rotation = useRotation();
  const vertexEditing = useVertexEditing();
  const measurement = useMeasurement();
  const grid = useGrid(10); // 10 foot grid

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Stream updates continuously — no debounce. The workspace coalesces them
  // (latest-wins) and feeds the solver at whatever rate it can actually solve,
  // so parking re-packs live DURING the drag instead of after release.
  const queueBuildingUpdate = useCallback((update: {
    id: string;
    anchor: { x: number; y: number };
    rotationRad: number;
    widthFt: number;
    depthFt: number;
    floors?: number;
  }, options?: { final?: boolean }) => {
    if (!onBuildingUpdate) return;
    onBuildingUpdate(update, options?.final ? { final: true } : undefined);
  }, [onBuildingUpdate]);

  const getElementDimensions = useCallback((element: Element) => {
    const coords = element.geometry.coordinates[0];
    if (coords.length < 3) return { widthFt: 0, depthFt: 0 };
    const [x1, y1] = coords[0];
    const [x2, y2] = coords[1];
    const [x3, y3] = coords[2];
    const edge1 = Math.hypot(x2 - x1, y2 - y1);
    const edge2 = Math.hypot(x3 - x2, y3 - y2);
    return { widthFt: edge1, depthFt: edge2 };
  }, []);

  /** Nearest rectangle corner of a building footprint within tolerance, or null.
   *  Only 4-corner rings resize parametrically (L/U shapes are solver-owned). */
  const findBuildingCorner = useCallback((element: Element, worldX: number, worldY: number, tol: number): number | null => {
    if (element.type !== 'building') return null;
    const coords = element.geometry.coordinates[0];
    if (coords.length !== 5) return null; // 4 corners + closing vertex
    let best: number | null = null;
    let bestDist = tol;
    for (let i = 0; i < 4; i++) {
      const d = Math.hypot(coords[i][0] - worldX, coords[i][1] - worldY);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, []);

  /** Begin a corner resize: the corner opposite the grabbed one stays fixed. */
  const startCornerResize = useCallback((element: Element, cornerIndex: number) => {
    const coords = element.geometry.coordinates[0];
    const fixedIndex = (cornerIndex + 2) % 4;
    const fixed = { x: coords[fixedIndex][0], y: coords[fixedIndex][1] };
    const a = coords[(fixedIndex + 1) % 4];
    const b = coords[(fixedIndex + 3) % 4];
    const uLen = Math.hypot(a[0] - fixed.x, a[1] - fixed.y) || 1;
    const vLen = Math.hypot(b[0] - fixed.x, b[1] - fixed.y) || 1;
    resizeRef.current = {
      elementId: element.id,
      fixed,
      fixedIndex,
      u: { x: (a[0] - fixed.x) / uLen, y: (a[1] - fixed.y) / uLen },
      v: { x: (b[0] - fixed.x) / vLen, y: (b[1] - fixed.y) / vLen },
      floors: (element.properties?.stories as number) || (element.properties?.floors as number),
    };
    lastResizeUpdateRef.current = null;
    activeManipulationRef.current = element.id;
  }, []);

  const getElementRotationRad = useCallback((element: Element) => {
    if (typeof element.properties?.rotation === 'number') {
      return (element.properties.rotation * Math.PI) / 180;
    }
    const coords = element.geometry.coordinates[0];
    if (coords.length < 2) return 0;
    const [x1, y1] = coords[0];
    const [x2, y2] = coords[1];
    return Math.atan2(y2 - y1, x2 - x1);
  }, []);

  const processedGeometry = useMemo(() => {
    if (!parcel?.geometry) return null;
    try {
      const geom = parcel.geometry as import('geojson').Polygon | import('geojson').MultiPolygon;
      const coords =
        geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 =
        Math.abs(coords?.[0]?.[0] ?? 0) > 1000 ||
        Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857
        ? geom
        : (feature4326To3857(geom) as import('geojson').Polygon | import('geojson').MultiPolygon);
      const polygon = normalizeToPolygon(reprojected);
      const ring = polygon.coordinates[0];
      const bounds = ring.reduce(
        (acc, [x, y]) => ({
          minX: Math.min(acc.minX, x),
          minY: Math.min(acc.minY, y),
          maxX: Math.max(acc.maxX, x),
          maxY: Math.max(acc.maxY, y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      );
      return { geometry: polygon, bounds };
    } catch {
      return null;
    }
  }, [parcel?.geometry]);

  // Once the user pans/zooms manually we stop auto-fitting on resize; the
  // Fit button (and the '0' key) re-arm it. Until then the parcel stays
  // centred through modal layout settles, devtools opens, window resizes.
  const userMovedViewRef = useRef(false);

  // Fit viewport to parcel
  const fitViewToParcel = useCallback(() => {
    const canvas = canvasContainerRef.current;
    if (!canvas || !processedGeometry) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    viewport.fitToBounds(processedGeometry.bounds, rect.width, rect.height);
    setHasInitializedView(true);
  }, [processedGeometry, viewport]);

  // Latest fit fn for the ResizeObserver (whose lifetime is the container's)
  const fitViewRef = useRef(fitViewToParcel);
  fitViewRef.current = fitViewToParcel;

  /** User asked for a fit: do it now and resume auto-fit on future resizes. */
  const requestFit = useCallback(() => {
    userMovedViewRef.current = false;
    fitViewToParcel();
  }, [fitViewToParcel]);

  // Initialize viewport when geometry loads
  useEffect(() => {
    if (processedGeometry && !hasInitializedView) {
      const initViewport = () => {
        const canvas = canvasContainerRef.current;
        if (!canvas) {
          setTimeout(initViewport, 50);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          setTimeout(initViewport, 50);
          return;
        }
        fitViewToParcel();
      };
      requestAnimationFrame(() => initViewport());
    }
  }, [processedGeometry, hasInitializedView, fitViewToParcel]);

  // Re-fit whenever the canvas container changes size (modal layout settling,
  // window resize, devtools) — the fit computed at mount is stale the moment
  // the host resizes, which is how the parcel ends up stranded in a corner.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!userMovedViewRef.current) fitViewRef.current();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Screen-centre of the canvas — the anchor for button/keyboard zoom. */
  const canvasCenter = useCallback((): { x: number; y: number } | null => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    return rect ? { x: rect.width / 2, y: rect.height / 2 } : null;
  }, []);

  const zoomInCentered = useCallback(() => {
    userMovedViewRef.current = true;
    const c = canvasCenter();
    if (c) viewport.zoomIn(c.x, c.y); else viewport.zoomIn();
  }, [canvasCenter, viewport]);

  const zoomOutCentered = useCallback(() => {
    userMovedViewRef.current = true;
    const c = canvasCenter();
    if (c) viewport.zoomOut(c.x, c.y); else viewport.zoomOut();
  }, [canvasCenter, viewport]);

  // Handle mouse down
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    // Panning (middle mouse or Alt+drag). Alt is used instead of Ctrl so that
    // Ctrl/Cmd+click remains available for multi-select below.
    if (event.button === 1 || (event.button === 0 && event.altKey)) {
      userMovedViewRef.current = true;
      setIsPanning(true);
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
    const snapped = grid.snapPoint(worldX, worldY);

    // Measurement tool
    if (drawingTools.activeTool === 'measure') {
      if (!measurement.measurementState.isMeasuring) {
        measurement.startMeasurement(snapped.x, snapped.y);
      } else {
        measurement.updateMeasurement(snapped.x, snapped.y);
        measurement.endMeasurement();
        drawingTools.setActiveTool('select');
      }
      return;
    }

    // Drawing tools
    if (drawingTools.activeTool.startsWith('draw-')) {
      // Disable draw-building tool (use Add Building button instead)
      if (drawingTools.activeTool === 'draw-building') {
        drawingTools.setActiveTool('select');
        return;
      }
      const elementType = drawingTools.activeTool.replace('draw-', '') as 'building' | 'parking' | 'greenspace';
      const newElement = drawingTools.createElement(snapped.x, snapped.y, elementType);
      setElements(prev => [...prev, newElement]);
      selection.selectElement(newElement.id);
      drawingTools.setActiveTool('select');
      return;
    }

    // Selection
    if (drawingTools.activeTool === 'select') {
      // Check for rotation handle click first
      if (selection.selectedCount === 1) {
        const selectedId = Array.from(selection.selectedElements)[0];
        const selectedElement = elements.find(el => el.id === selectedId);
        if (selectedElement) {
          const center = ElementService.calculateElementCenter(selectedElement);
          const bounds = ElementService.getElementBounds(selectedElement);
          const handleDistance = 30 / viewport.viewport.zoom; // Rotation handle distance
          const handleX = center.x;
          // Must match the render position in SitePlanCanvas (drawn at bounds.maxY + 30/zoom)
          const handleY = bounds.maxY + handleDistance;

          // Check if clicked on rotation handle
          const distToHandle = Math.sqrt(Math.pow(worldX - handleX, 2) + Math.pow(worldY - handleY, 2));
          if (distToHandle < 15 / viewport.viewport.zoom) {
            const startAngle = ElementService.calculateAngle(center, { x: worldX, y: worldY });
            const originalCoords = selectedElement.geometry.coordinates[0];
            rotationStartDegRef.current = (selectedElement.properties?.rotation as number) || 0;
            activeManipulationRef.current = selectedId;
            rotation.startRotation(selectedId, center.x, center.y, startAngle, originalCoords);
            return;
          }

          // Corner grab on a selected building = parametric resize (width/depth
          // through the solver), NOT local vertex editing — a locally-reshaped
          // building would be wiped by the next re-solve.
          if (selectedElement.type === 'building' && onBuildingUpdate) {
            const corner = findBuildingCorner(selectedElement, worldX, worldY, 12 / viewport.viewport.zoom);
            if (corner != null) {
              startCornerResize(selectedElement, corner);
              return;
            }
          }

          // Check for vertex editing
          if (vertexEditing.isVertexEditing) {
            const nearest = ElementService.findNearestVertex(selectedElement, worldX, worldY, 15 / viewport.viewport.zoom);
            if (nearest) {
              vertexEditing.enableVertexEditing(selectedId, nearest.vertexIndex);
              activeManipulationRef.current = selectedId;
              drag.startDrag(selectedId, worldX, worldY);
              return;
            }
          }
        }
      }

      // Check for vertex near click (for enabling vertex editing).
      // Buildings are excluded: their corners resize parametrically above.
      const clickedElement = ElementService.findElementAtPoint(elements, worldX, worldY);
      if (clickedElement && clickedElement.type !== 'building' && selection.isSelected(clickedElement.id)) {
        const nearest = ElementService.findNearestVertex(clickedElement, worldX, worldY, 15 / viewport.viewport.zoom);
        if (nearest) {
          vertexEditing.enableVertexEditing(clickedElement.id, nearest.vertexIndex);
          activeManipulationRef.current = clickedElement.id;
          drag.startDrag(clickedElement.id, worldX, worldY);
          return;
        }
      }
      
      if (clickedElement) {
        if (event.ctrlKey || event.metaKey) {
          selection.toggleSelection(clickedElement.id);
        } else {
          // Preserve an existing multi-selection when the user grabs one of its
          // members, so the whole group can be dragged together. Otherwise select
          // just the clicked element.
          const draggingGroup = selection.isSelected(clickedElement.id) && selection.selectedCount > 1;
          const idsToDrag = draggingGroup
            ? selection.selectedElements
            : new Set<string>([clickedElement.id]);
          if (!draggingGroup) {
            selection.selectElement(clickedElement.id);
          }
          // Capture original vertices for EVERY element being dragged so that
          // per-frame deltas are applied to originals (no runaway accumulation).
          const originalVertices = elements
            .filter(el => idsToDrag.has(el.id))
            .map(el => ({ id: el.id, coords: el.geometry.coordinates[0] }));
          activeManipulationRef.current = clickedElement.id;
          drag.startDrag(clickedElement.id, worldX, worldY, originalVertices);
        }
      } else {
        if (!event.ctrlKey && !event.metaKey) {
          selection.clearSelection();
          vertexEditing.disableVertexEditing();
        }
        // Empty canvas: left-drag pans — the map convention, and the only
        // discoverable way to move around the site. (Alt+drag and middle
        // mouse still pan from anywhere, including over elements.)
        userMovedViewRef.current = true;
        setIsPanning(true);
        setLastPanPoint({ x: event.clientX, y: event.clientY });
      }
    }
  }, [elements, viewport.viewport, drawingTools, selection, drag, grid, measurement, vertexEditing, rotation, onBuildingUpdate, findBuildingCorner, startCornerResize]);

  // Handle mouse move
  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    // Update hovered element
    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
    const hovered = ElementService.findElementAtPoint(elements, worldX, worldY);
    setHoveredElement(hovered?.id || null);

    // Corner resize in progress: rebuild the rectangle from the fixed corner
    // toward the mouse, stream it through the same pipe as drags.
    const resize = resizeRef.current;
    if (resize) {
      const el = elements.find(e => e.id === resize.elementId);
      if (el) {
        const MIN_M = 3; // never collapse below ~10ft
        const dx = worldX - resize.fixed.x;
        const dy = worldY - resize.fixed.y;
        let w = dx * resize.u.x + dy * resize.u.y;
        let h = dx * resize.v.x + dy * resize.v.y;
        if (grid.gridState.snapToGrid) {
          const g = feetToMeters(grid.gridState.size);
          w = Math.round(w / g) * g;
          h = Math.round(h / g) * g;
        }
        w = Math.max(MIN_M, w);
        h = Math.max(MIN_M, h);

        const { fixed, fixedIndex, u, v } = resize;
        const corners: number[][] = new Array(4);
        corners[fixedIndex] = [fixed.x, fixed.y];
        corners[(fixedIndex + 1) % 4] = [fixed.x + u.x * w, fixed.y + u.y * w];
        corners[(fixedIndex + 2) % 4] = [fixed.x + u.x * w + v.x * h, fixed.y + u.y * w + v.y * h];
        corners[(fixedIndex + 3) % 4] = [fixed.x + v.x * h, fixed.y + v.y * h];
        const ring = [...corners, [...corners[0]]];

        setElements(prev => prev.map(e =>
          e.id === resize.elementId
            ? {
                ...e,
                geometry: { ...e.geometry, coordinates: [ring] },
                metadata: { ...e.metadata, updatedAt: new Date().toISOString() },
              }
            : e
        ));

        // Spec update in the Shell's canonical frame: width along c0→c1,
        // depth along c1→c2, rotation from c0→c1 (matches getElementDimensions).
        const widthM = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
        const depthM = Math.hypot(ring[2][0] - ring[1][0], ring[2][1] - ring[1][1]);
        const rotationRad = Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
        const anchor = ringCentroid(ring);
        const update = {
          id: resize.elementId,
          anchor,
          rotationRad,
          widthFt: widthM, // Shell field names are legacy — meters
          depthFt: depthM,
          floors: resize.floors,
        };
        lastResizeUpdateRef.current = update;
        queueBuildingUpdate(update);
      }
      return;
    }

    // Hover feedback: resize cursor over a selected building's corners
    if (!drag.dragState.isDragging && !rotation.rotationState.isRotating && selection.selectedCount === 1 && onBuildingUpdate) {
      const selectedId = Array.from(selection.selectedElements)[0];
      const sel = elements.find(e => e.id === selectedId);
      const overCorner = sel && sel.type === 'building'
        ? findBuildingCorner(sel, worldX, worldY, 12 / viewport.viewport.zoom) != null
        : false;
      setHoveringResizeCorner(prev => (prev === overCorner ? prev : overCorner));
    } else if (hoveringResizeCorner) {
      setHoveringResizeCorner(false);
    }

    // Panning
    if (isPanning) {
      const deltaX = event.clientX - lastPanPoint.x;
      const deltaY = event.clientY - lastPanPoint.y;
      viewport.pan(deltaX, deltaY);
      setLastPanPoint({ x: event.clientX, y: event.clientY });
      return;
    }

    // Rotation
    if (rotation.rotationState.isRotating && rotation.rotationState.elementId) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      
      const angle = rotation.updateRotation(worldX, worldY, event.shiftKey ? 15 : 0);
      if (angle !== null && rotation.rotationState.startAngle !== undefined) {
        const element = elements.find(el => el.id === rotation.rotationState.elementId);
        const baseCoords = rotation.rotationState.originalCoords;
        if (element && rotation.rotationState.rotationCenter && baseCoords) {
          // Calculate delta from start angle
          let deltaAngle = angle - rotation.rotationState.startAngle;
          // Normalize to -180 to 180 range
          if (deltaAngle > 180) deltaAngle -= 360;
          if (deltaAngle < -180) deltaAngle += 360;

          // Absolute rotation = rotation at drag start + delta since start.
          const newRotation = rotationStartDegRef.current + deltaAngle;

          // Rotate the ORIGINAL geometry (captured at drag start) by the delta,
          // so repeated mouse-moves don't compound onto already-rotated coords.
          const rotatedCoords = baseCoords.map(([x, y]) => {
            const rotated = ElementService.rotatePoint(
              { x, y },
              rotation.rotationState.rotationCenter!,
              deltaAngle
            );
            return [rotated.x, rotated.y];
          });
          
          setElements(prev => prev.map(el => {
            if (el.id === rotation.rotationState.elementId) {
              return {
                ...el,
                geometry: {
                  ...el.geometry,
                  coordinates: [rotatedCoords]
                },
                properties: {
                  ...el.properties,
                  rotation: newRotation
                },
                metadata: {
                  ...el.metadata,
                  updatedAt: new Date().toISOString()
                }
              };
            }
            return el;
          }));

          if (element.type === 'building' && rotation.rotationState.rotationCenter) {
            const { widthFt, depthFt } = getElementDimensions(element);
            queueBuildingUpdate({
              id: element.id,
              anchor: rotation.rotationState.rotationCenter,
              rotationRad: (newRotation * Math.PI) / 180,
              widthFt,
              depthFt,
              floors: element.properties?.stories || element.properties?.floors
            });
          }
        }
      }
      return;
    }

    // Vertex editing
    if (vertexEditing.isVertexEditing && vertexEditing.selectedVertex) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);
      
      setElements(prev => prev.map(element => {
        if (element.id === vertexEditing.selectedVertex?.elementId) {
          return ElementService.updateVertex(
            element,
            vertexEditing.selectedVertex.vertexIndex,
            snapped.x,
            snapped.y
          );
        }
        return element;
      }));
      return;
    }

    // Measurement tool update
    if (drawingTools.activeTool === 'measure' && measurement.measurementState.isMeasuring) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);
      measurement.updateMeasurement(snapped.x, snapped.y);
      return;
    }

    // Dragging
    if (drag.dragState.isDragging && drag.dragState.elementId) {
      const rect = canvas.getBoundingClientRect();
      const worldX = (event.clientX - rect.left - viewport.viewport.panX) / viewport.viewport.zoom;
      const worldY = -(event.clientY - rect.top - viewport.viewport.panY) / viewport.viewport.zoom;
      const snapped = grid.snapPoint(worldX, worldY);

      drag.updateDrag(snapped.x, snapped.y);
      const delta = drag.getDragDelta();
      if (delta) {
        const draggedElement = elements.find(el => el.id === drag.dragState.elementId);
        // ORIGINAL (drag-start) coords are the base for both the visual move
        // and the solver anchor. Deriving the anchor from the already-moved
        // element + total delta double-counted the displacement (~2x drift).
        const origCoords = drag.dragState.originalVertices?.find(
          v => v.id === drag.dragState.elementId
        )?.coords;

        let dx = delta.deltaX;
        let dy = delta.deltaY;
        // Magnetic setback snap (buildings only; hold Alt to bypass)
        if (
          draggedElement?.type === 'building' &&
          origCoords &&
          buildableEnvelope?.coordinates?.[0] &&
          !event.altKey
        ) {
          const moved = origCoords.map(([x, y]) => [x + dx, y + dy]);
          const snapHit = computeSnapDelta(
            moved,
            buildableEnvelope.coordinates[0],
            12 / viewport.viewport.zoom
          );
          if (snapHit) {
            dx += snapHit.dx;
            dy += snapHit.dy;
          }
        }
        lastDragDeltaRef.current = { dx, dy };

        if (draggedElement?.type === 'building' && onBuildingUpdate && origCoords) {
          const baseCenter = ringCentroid(origCoords);
          const { widthFt, depthFt } = getElementDimensions(draggedElement);
          setElements(prev => ElementService.moveElements(
            prev,
            selection.selectedElements,
            dx,
            dy,
            drag.dragState.originalVertices
          ));
          queueBuildingUpdate({
            id: draggedElement.id,
            anchor: { x: baseCenter.x + dx, y: baseCenter.y + dy },
            rotationRad: getElementRotationRad(draggedElement),
            widthFt,
            depthFt,
            floors: draggedElement.properties?.stories || draggedElement.properties?.floors
          });
          return;
        }

        setElements(prev => ElementService.moveElements(
          prev,
          selection.selectedElements,
          dx,
          dy,
          drag.dragState.originalVertices
        ));
      }
    }
  }, [isPanning, lastPanPoint, viewport.viewport.zoom, viewport.viewport.panX, viewport.viewport.panY, viewport.pan, drag.dragState, drag.updateDrag, drag.getDragDelta, selection.selectedElements, selection.selectedCount, elements, measurement.measurementState, measurement.updateMeasurement, grid.snapPoint, grid.gridState.snapToGrid, grid.gridState.size, drawingTools.activeTool, vertexEditing.isVertexEditing, vertexEditing.selectedVertex, getElementDimensions, getElementRotationRad, onBuildingUpdate, queueBuildingUpdate, buildableEnvelope, rotation.rotationState, findBuildingCorner, hoveringResizeCorner]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    // Commit a corner resize: the last streamed geometry becomes authoritative.
    if (resizeRef.current) {
      const finalUpdate = lastResizeUpdateRef.current;
      if (finalUpdate) {
        queueBuildingUpdate(finalUpdate, { final: true });
      }
      resizeRef.current = null;
      lastResizeUpdateRef.current = null;
      activeManipulationRef.current = null;
      return;
    }

    if (drag.dragState.isDragging && drag.dragState.elementId) {
      const draggedElement = elements.find(el => el.id === drag.dragState.elementId);
      const origCoords = drag.dragState.originalVertices?.find(
        v => v.id === drag.dragState.elementId
      )?.coords;
      // Use the last APPLIED delta (includes any magnetic snap) so the final
      // authoritative position matches what the user saw during the drag.
      const applied = lastDragDeltaRef.current;
      if (applied && draggedElement?.type === 'building' && onBuildingUpdate && origCoords) {
        const baseCenter = ringCentroid(origCoords);
        const { widthFt, depthFt } = getElementDimensions(draggedElement);
        queueBuildingUpdate({
          id: draggedElement.id,
          anchor: { x: baseCenter.x + applied.dx, y: baseCenter.y + applied.dy },
          rotationRad: getElementRotationRad(draggedElement),
          widthFt,
          depthFt,
          floors: draggedElement.properties?.stories || draggedElement.properties?.floors
        }, { final: true });
      }
      lastDragDeltaRef.current = null;
    }

    setIsPanning(false);
    drag.endDrag();
    rotation.endRotation();
    // Release the element back to the solver — the final update above becomes
    // the authoritative geometry once the worker round-trips.
    activeManipulationRef.current = null;
  }, [drag, elements, getElementDimensions, getElementRotationRad, onBuildingUpdate, queueBuildingUpdate, rotation]);

  // Handle wheel zoom. Below the xl breakpoint the planner panels stack and
  // the outer workspace must remain vertically scrollable; plain wheel input
  // scrolls that workspace, while Ctrl/Cmd+wheel and the zoom buttons still
  // zoom the plan. In the desktop three-column layout, wheel zoom remains the
  // direct map-style interaction.
  const handleWheel = useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    const stackedLayout = window.innerWidth < 1280;
    if (stackedLayout && !event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const canvas = canvasContainerRef.current;
    if (!canvas) return;

    userMovedViewRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Exponential scaling reads the device: mouse wheels send big deltas
    // (~100/notch), trackpad pans small ones, pinch (ctrlKey) smaller still —
    // a fixed step feels jumpy on one and sluggish on another.
    const sensitivity = event.ctrlKey ? 0.01 : 0.002;
    const zoomFactor = Math.exp(-event.deltaY * sensitivity);
    const newZoom = Math.max(0.1, Math.min(10, viewport.viewport.zoom * zoomFactor));
    viewport.zoomTo(newZoom, mouseX, mouseY);
  }, [viewport]);

  // Selected building (single selection) — drives the floating inspector.
  const selectedBuilding = useMemo(() => {
    if (selection.selectedCount !== 1) return null;
    const id = Array.from(selection.selectedElements)[0];
    const el = elements.find(e => e.id === id);
    return el && el.type === 'building' ? el : null;
  }, [selection.selectedCount, selection.selectedElements, elements]);

  /** Manual floors change: same authoritative pipe as drag/resize. */
  const handleFloorsChange = useCallback((delta: number) => {
    if (!selectedBuilding || !onBuildingUpdate) return;
    const current = Math.max(
      1,
      Math.round(
        (selectedBuilding.properties?.stories as number) ||
        (selectedBuilding.properties?.floors as number) || 1
      )
    );
    const next = Math.min(30, Math.max(1, current + delta));
    if (next === current) return;
    const coords = selectedBuilding.geometry.coordinates[0];
    const { widthFt, depthFt } = getElementDimensions(selectedBuilding);
    queueBuildingUpdate({
      id: selectedBuilding.id,
      anchor: ringCentroid(coords),
      rotationRad: getElementRotationRad(selectedBuilding),
      widthFt,
      depthFt,
      floors: next,
    }, { final: true });
    // Optimistic floors so the label/inspector tick immediately while the
    // solver round-trips.
    setElements(prev => prev.map(el =>
      el.id === selectedBuilding.id
        ? { ...el, properties: { ...el.properties, floors: next, stories: next } }
        : el
    ));
  }, [selectedBuilding, onBuildingUpdate, getElementDimensions, getElementRotationRad, queueBuildingUpdate]);

  // Alignment tools
  const handleAlign = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selection.selectedCount < 2) return;
    setElements(prev => ElementService.alignElements(prev, selection.selectedElements, alignment));
  }, [selection]);

  // Template application
  const handleApplyTemplate = useCallback((templateId: string) => {
    if (!processedGeometry) return;
    
    // Place template at center of parcel
    const centerX = (processedGeometry.bounds.minX + processedGeometry.bounds.maxX) / 2;
    const centerY = (processedGeometry.bounds.minY + processedGeometry.bounds.maxY) / 2;
    
    const newElements = TemplateService.applyTemplate(templateId, centerX, centerY);
    setElements(prev => [...prev, ...newElements]);
    selection.selectAll(newElements.map(el => el.id));
    setShowTemplates(false);
  }, [selection.selectAll, processedGeometry]);

  // Element operations
  const handleDelete = useCallback(() => {
    // Buildings must be deleted worker-side or they reappear on the next
    // re-solve; everything else (user-drawn annotations) is local state.
    const buildingIds = elements
      .filter(el => selection.selectedElements.has(el.id) && el.type === 'building')
      .map(el => el.id);
    if (buildingIds.length > 0 && onDeleteBuildings) {
      onDeleteBuildings(buildingIds);
    }
    setElements(prev => ElementService.deleteElements(prev, selection.selectedElements));
    selection.clearSelection();
    vertexEditing.disableVertexEditing();
  }, [elements, selection.selectedElements, selection.clearSelection, vertexEditing.disableVertexEditing, onDeleteBuildings]);

  const handleCopy = useCallback(() => {
    const toCopy = elements.filter(el => selection.selectedElements.has(el.id));
    setCopiedElements(toCopy);
  }, [elements, selection.selectedElements, selection.selectAll]);

  const handlePaste = useCallback(() => {
    if (copiedElements.length === 0) return;
    // Buildings clone worker-side (a locally-pasted building would vanish on
    // the next re-solve); everything else is a local annotation copy.
    const buildingIds = copiedElements
      .filter(el => el.type === 'building')
      .map(el => el.id);
    if (buildingIds.length > 0 && onCloneBuildings) {
      onCloneBuildings(buildingIds);
    }
    const localIds = copiedElements
      .filter(el => el.type !== 'building' || !onCloneBuildings)
      .map(el => el.id);
    if (localIds.length === 0) return;
    const newElements = ElementService.copyElements(elements, new Set(localIds));
    setElements(prev => [...prev, ...newElements]);
    selection.selectAll(newElements.map(el => el.id));
  }, [copiedElements, elements, selection.selectAll, onCloneBuildings]);

  // Update elements from props (merge-preserving, same as the primary sync)
  useEffect(() => {
    if (planElements.length > 0) {
      setElements(prev => mergeIncoming(prev, planElements));
    }
  }, [planElements, mergeIncoming]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.selectedCount > 0) {
        e.preventDefault();
        handleDelete();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection.selectedCount > 0) {
        e.preventDefault();
        handleCopy();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedElements.length > 0) {
        e.preventDefault();
        handlePaste();
      }

      if (e.key === '0') {
        e.preventDefault();
        requestFit();
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomInCentered();
      }

      if (e.key === '-') {
        e.preventDefault();
        zoomOutCentered();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection.selectedCount, copiedElements.length, handleDelete, handleCopy, handlePaste, requestFit, zoomInCentered, zoomOutCentered]);

  // Guard placed AFTER all hooks so hook order stays stable across renders.
  if (!parcel) {
    return (
      <div className="flex flex-col h-full bg-gray-50 min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Parcel Selected</h2>
          <p className="text-gray-600">Please select a parcel to use the site planner</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-[400px]">
      {/* Envelope Status Banner */}
      {((envelopeStatus && envelopeStatus !== 'ready') || usingFallbackEnvelope) && (
        <div className={`px-4 py-2 border-b ${
          usingFallbackEnvelope
            ? 'bg-yellow-50 border-yellow-200'
            : envelopeStatus === 'ready'
            ? 'bg-green-50 border-green-200'
            : envelopeStatus === 'loading'
            ? 'bg-blue-50 border-blue-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">
                Envelope status: <span className={
                  usingFallbackEnvelope ? 'text-yellow-700' :
                  envelopeStatus === 'ready' ? 'text-green-700' :
                  envelopeStatus === 'loading' ? 'text-blue-700' :
                  'text-yellow-700'
                }>{usingFallbackEnvelope ? 'fallback' : envelopeStatus}</span>
              </span>
              {usingFallbackEnvelope && (
                <span className="text-sm text-yellow-700">
                  (Using fallback envelope - Supabase envelope unavailable. Default setbacks: 20ft front, 5ft side, 20ft rear)
                </span>
              )}
              {envelopeStatus === 'invalid' && envelopeError && !usingFallbackEnvelope && (
                <span className="text-sm text-red-700">
                  {envelopeError}
                  {envelopeError.includes('returned null') && (
                    <span className="ml-2 text-xs">
                      Check: supabase/sql/get_parcel_buildable_envelope.sql and AUDIT_BACKEND_STATUS.sql
                    </span>
                  )}
                </span>
              )}
            </div>
            {envelopeStatus === 'invalid' && !usingFallbackEnvelope && onRetryEnvelope && (
              <button
                onClick={onRetryEnvelope}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold">Site Planner</h2>
        </div>
        
        <div className="flex items-center space-x-2">
          {onAddBuilding && (
            <button
              onClick={onAddBuilding}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Building className="w-4 h-4" />
              <span>Add Building</span>
            </button>
          )}
          {/* Templates disabled until solver-backed */}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Modular Toolbar */}
        <SitePlanToolbar
          activeTool={drawingTools.activeTool}
          onToolChange={drawingTools.setActiveTool}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          onFitToParcel={requestFit}
          onZoomIn={zoomInCentered}
          onZoomOut={zoomOutCentered}
          onAlign={handleAlign}
          onToggleVertexEdit={() => {
            if (vertexEditing.isVertexEditing) {
              vertexEditing.disableVertexEditing();
            } else if (selection.selectedCount === 1) {
              // Enable vertex editing mode
              vertexEditing.enableVertexEditing(Array.from(selection.selectedElements)[0], 0);
            }
          }}
          onToggleGrid={grid.toggleGrid}
          onToggleSnapToGrid={grid.toggleSnapToGrid}
          canCopy={selection.selectedCount > 0 && !staticPlan}
          canPaste={copiedElements.length > 0 && !staticPlan}
          canDelete={
            selection.selectedCount > 0 &&
            (!staticPlan ||
              elements
                .filter(el => selection.selectedElements.has(el.id) && el.type === 'building')
                .every(el => el.properties?.pinned))
          }
          canAlign={selection.selectedCount >= 2 && !staticPlan}
          canVertexEdit={!staticPlan && (vertexEditing.isVertexEditing || selection.selectedCount === 1)}
          isVertexEditing={vertexEditing.isVertexEditing}
          gridEnabled={grid.gridState.enabled}
          snapToGridEnabled={grid.gridState.snapToGrid}
        />

        {/* Modular Canvas */}
        <div ref={canvasContainerRef} className="flex-1 relative min-h-0 bg-gray-100">
          {showTemplates && (
            <TemplateSelector
              onSelectTemplate={handleApplyTemplate}
              onClose={() => setShowTemplates(false)}
            />
          )}
          {/* Selected-building inspector: read the bar, change floors by hand.
              Width/depth change by corner-drag; floors have no gesture, so
              they get buttons. */}
          {selectedBuilding && onBuildingUpdate && (() => {
            const { widthFt: wM, depthFt: dM } = getElementDimensions(selectedBuilding);
            const floors = Math.max(
              1,
              Math.round(
                (selectedBuilding.properties?.stories as number) ||
                (selectedBuilding.properties?.floors as number) || 1
              )
            );
            const wFt = Math.round(metersToFeet(wM));
            const dFt = Math.round(metersToFeet(dM));
            const areaSqFt = (selectedBuilding.properties?.areaSqFt as number) || Math.round(wFt * dFt);
            return (
              <div className="absolute top-3 left-3 z-10 bg-white rounded-lg shadow-md border border-gray-200 px-3 py-2 text-sm flex items-center gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">
                    {selectedBuilding.name || selectedBuilding.id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {wFt} × {dFt} ft · {Math.round(areaSqFt * floors).toLocaleString()} SF GFA
                  </div>
                </div>
                <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
                  <span className="text-xs text-gray-500">Floors</span>
                  <button
                    onClick={() => handleFloorsChange(-1)}
                    disabled={floors <= 1}
                    className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove a floor"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold text-gray-900">{floors}</span>
                  <button
                    onClick={() => handleFloorsChange(1)}
                    className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                    aria-label="Add a floor"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })()}
          {/* On-canvas zoom cluster — always visible, works on any input
              device, and (unlike wheel semantics) needs no discovery. */}
          <div className="absolute bottom-4 right-4 z-10 flex flex-col rounded-lg shadow-md border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={zoomInCentered}
              className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-50 text-lg font-semibold"
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              onClick={zoomOutCentered}
              className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-50 border-t border-gray-100 text-lg font-semibold"
              title="Zoom out (−)"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={requestFit}
              className="w-9 h-9 flex items-center justify-center text-gray-700 hover:bg-gray-50 border-t border-gray-100"
              title="Fit to parcel (0)"
              aria-label="Fit to parcel"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
          <SitePlanCanvas
            elements={elements}
            selectedElements={selection.selectedElements}
            viewport={viewport.viewport}
            processedGeometry={processedGeometry}
            buildableEnvelope={buildableEnvelope}
            edgeClassifications={edgeClassifications}
            setbacks={setbacks}
            isVertexEditing={vertexEditing.isVertexEditing}
            selectedVertex={vertexEditing.selectedVertex}
            measurementState={measurement.measurementState}
            gridState={grid.gridState}
            hoveredElement={hoveredElement}
            showLabels={true}
            parkingViz={parkingViz}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            cursor={
              isPanning
                ? 'grabbing'
                : drawingTools.activeTool === 'measure'
                  ? 'crosshair'
                  : hoveringResizeCorner
                    ? 'nwse-resize'
                    : hoveredElement
                      ? 'move'
                      : 'grab'
            }
          />
          
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        metrics={displayMetrics}
        activeTool={drawingTools.activeTool}
        selectedCount={selection.selectedCount}
        elementCount={elements.length}
        zoomLevel={viewport.viewport.zoom}
        gridEnabled={grid.gridState.enabled}
        snapToGridEnabled={grid.gridState.snapToGrid}
        measurementDistance={measurement.getDistance()}
      />
    </div>
  );
};

export default EnterpriseSitePlanner;

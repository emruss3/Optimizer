// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * SitePlanCanvas: Orchestrator for layered site plan rendering
 * 
 * This component is now a thin orchestrator that:
 * 1. Sets up the canvas context and viewport transform
 * 2. Delegates rendering to specialized layer modules
 * 3. Handles interaction events (clicks, drags, hover)
 * 
 * Rendering layers (in draw order):
 * - BaseLayer: parcel boundary, buildable envelope, grid, neighbors, landscape
 * - ElementLayer: buildings, parking, greenspace, lots (z-ordered)
 * - AnnotationLayer: dimensions, setbacks, topo, civil annotations, handles
 * - Parcel boundary (top stroke)
 * - OverlayLayer: north arrow, legend, scale bar, title block, watermark (screen-space)
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { Element } from '../../engine/types';
import type { ViewportState } from '../../hooks/useViewport';
import { feetToMeters } from '../../engine/units';
import type { EdgeClassification } from '../../engine/setbacks';
import type { ParcelTopoView } from '../../features/site-plan/api/parcelTopo';
import type { SheetAnnotation, SheetTitleBlock } from '../../features/site-plan/api/sheetAnnotations';
import { ElementService } from '../../services/elementService';
import { renderBaseLayer, renderParcelBoundary } from './layers/BaseLayer';
import { renderElementLayer } from './layers/ElementLayer';
import { renderAnnotationLayer } from './layers/AnnotationLayer';
import { renderOverlayLayer } from './layers/OverlayLayer';

const NO_ANNOTATIONS: SheetAnnotation[] = [];

interface SitePlanCanvasProps {
  elements: Element[];
  selectedElements: Set<string>;
  viewport: ViewportState;
  processedGeometry: { geometry: any; bounds: { minX: number; minY: number; maxX: number; maxY: number } } | null;
  buildableEnvelope?: import('geojson').Polygon;
  edgeClassifications?: EdgeClassification[];
  /** WO-1c: landlocked parcels have no street to cut a curb into — the
   *  apron/throat rendering is suppressed instead of drawing fiction. */
  suppressCurbCut?: boolean;
  setbacks?: { front?: number; side?: number; rear?: number };
  isVertexEditing?: boolean;
  selectedVertex?: { elementId: string; vertexIndex: number } | null;
  measurementState?: { isMeasuring: boolean; startPoint: { x: number; y: number } | null; endPoint: { x: number; y: number } | null };
  gridState?: { enabled: boolean; snapToGrid: boolean; size: number };
  hoveredElement?: string | null;
  showLabels?: boolean;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number; aisleWidthFt?: number };
  onElementClick?: (element: Element | null, event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  /** CSS cursor reflecting the current interaction (grab/grabbing/move/…) */
  cursor?: string;
  /** Degraded-mode honesty: plan built on default assumptions (context
   *  unavailable) — watermarked so it can never look authoritative. */
  draftMode?: boolean;
  /** Neighborhood context (canvas-frame 3857): grey parcels, existing
   *  building outlines, street edges — the plan reads in its block. */
  neighbors?: import('../../features/site-plan/api/neighbors').PlannerNeighbors | null;
  /** Existing topography (USGS 3DEP): contours in the canvas frame, drawn
   *  over the plan like a civil sheet's existing-conditions layer. */
  topo?: ParcelTopoView | null;
  /** Civil-sheet callouts: stations, spot grades, R.O.W. / alley / radius. */
  annotations?: SheetAnnotation[];
  /** Title block (screen-space, top-left). */
  sheet?: SheetTitleBlock | null;
}

export const SitePlanCanvas: React.FC<SitePlanCanvasProps> = ({
  elements,
  selectedElements,
  viewport,
  processedGeometry,
  buildableEnvelope,
  edgeClassifications,
  suppressCurbCut,
  setbacks,
  isVertexEditing = false,
  selectedVertex = null,
  measurementState,
  gridState,
  hoveredElement = null,
  showLabels = true,
  parkingViz,
  onElementClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  cursor,
  draftMode = false,
  neighbors = null,
  topo = null,
  annotations = NO_ANNOTATIONS,
  sheet = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Add a non-passive wheel listener so the parent can prevent page scrolling
  // when it intentionally handles the gesture as canvas zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onWheel) return;

    const wheelHandler = (event: WheelEvent) => {
      // Create synthetic React event for compatibility
      const syntheticEvent = {
        ...event,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
        nativeEvent: event,
        currentTarget: canvas,
        target: canvas,
        clientX: event.clientX,
        clientY: event.clientY,
        deltaY: event.deltaY,
        deltaX: event.deltaX,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      } as React.WheelEvent<HTMLCanvasElement>;
      onWheel(syntheticEvent);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [onWheel]);

  // Render function - orchestrates all layers
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('⚠️ [SitePlanCanvas] Canvas ref is null');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('⚠️ [SitePlanCanvas] Could not get 2D context');
      return;
    }

    // Draw in CSS pixels while retaining a sharp high-DPI backing store.
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Apply view transformations for world-space rendering
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, -viewport.zoom);

    // === WORLD-SPACE LAYERS ===
    
    // Layer 1: Base (grid, envelope, neighbors, landscape)
    renderBaseLayer({
      ctx,
      zoom: viewport.zoom,
      geometry: processedGeometry?.geometry,
      buildableEnvelope,
      gridState: gridState?.enabled ? { enabled: true, size: feetToMeters(gridState.size) } : undefined,
      bounds: processedGeometry?.bounds,
      neighbors,
      edgeClassifications,
      elements,
      suppressCurbCut,
    });

    // Layer 2: Elements (buildings, parking, greenspace, lots)
    renderElementLayer({
      ctx,
      zoom: viewport.zoom,
      elements,
      selectedElements,
      hoveredElement,
      showLabels,
      parkingViz,
    });

    // Layer 3: Parcel boundary (dashed line, on top of elements)
    if (processedGeometry) {
      renderParcelBoundary(ctx, processedGeometry.geometry, viewport.zoom);
    }

    // Layer 4: Annotations (dimensions, setbacks, topo, handles)
    renderAnnotationLayer({
      ctx,
      zoom: viewport.zoom,
      elements,
      selectedElements,
      edgeClassifications,
      setbacks,
      topo,
      annotations,
      isVertexEditing,
      selectedVertex,
      measurementState,
    });

    ctx.restore();

    // === SCREEN-SPACE LAYERS ===
    
    // Layer 5: Overlay (north arrow, legend, scale bar, title block)
    renderOverlayLayer({
      ctx,
      zoom: viewport.zoom,
      cssWidth: canvas.width / dpr,
      cssHeight: canvas.height / dpr,
      elements,
      topo,
      sheet,
      draftMode,
    });
  }, [
    elements,
    selectedElements,
    viewport.zoom,
    viewport.panX,
    viewport.panY,
    processedGeometry,
    buildableEnvelope,
    isVertexEditing,
    selectedVertex,
    measurementState,
    gridState,
    hoveredElement,
    showLabels,
    draftMode,
    neighbors,
    topo,
    annotations,
    sheet,
    edgeClassifications,
    setbacks,
    parkingViz,
    suppressCurbCut,
  ]);

  // Handle mouse move for hover detection
  const handleMouseMoveInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (onMouseMove) onMouseMove(event);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.panX) / viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.panY) / viewport.zoom;

    const hovered = ElementService.findElementAtPoint(elements, worldX, worldY);
    // Note: We can't set hoveredElement here directly, it needs to be passed as prop
    // This is just for the callback
  }, [elements, viewport, onMouseMove]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onElementClick) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = (event.clientX - rect.left - viewport.panX) / viewport.zoom;
    const worldY = -(event.clientY - rect.top - viewport.panY) / viewport.zoom;

    const clickedElement = ElementService.findElementAtPoint(elements, worldX, worldY);
    onElementClick(clickedElement || null, event);
  }, [elements, viewport, onElementClick]);

  // Render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  // Keep the backing store synchronized with every CSS layout change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      render();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      data-export="site-plan"
      className="w-full h-full absolute inset-0"
      style={{ cursor: cursor ?? 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={handleClick}
    />
  );
};

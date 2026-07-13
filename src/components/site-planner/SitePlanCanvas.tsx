// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useRef, useEffect, useCallback } from 'react';
import type { Element } from '../../engine/types';
import type { ViewportState } from '../../hooks/useViewport';
import { ElementService } from '../../services/elementService';
import { feetToMeters, metersToFeet } from '../../engine/units';
import { computeUnitTicks, corridorLine, edgeDimensions, pickScaleBarFt } from './planRendering';
import { computeFloorplate, UNIT_COLORS } from './unitLayout';
import type { EdgeClassification } from '../../engine/setbacks';

interface SitePlanCanvasProps {
  elements: Element[];
  selectedElements: Set<string>;
  viewport: ViewportState;
  processedGeometry: { geometry: any; bounds: { minX: number; minY: number; maxX: number; maxY: number } } | null;
  buildableEnvelope?: import('geojson').Polygon;
  edgeClassifications?: EdgeClassification[];
  setbacks?: { front?: number; side?: number; rear?: number };
  isVertexEditing?: boolean;
  selectedVertex?: { elementId: string; vertexIndex: number } | null;
  measurementState?: { isMeasuring: boolean; startPoint: { x: number; y: number } | null; endPoint: { x: number; y: number } | null };
  gridState?: { enabled: boolean; snapToGrid: boolean; size: number };
  hoveredElement?: string | null;
  showLabels?: boolean;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number };
  onElementClick?: (element: Element | null, event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  /** CSS cursor reflecting the current interaction (grab/grabbing/move/…) */
  cursor?: string;
}

export const SitePlanCanvas: React.FC<SitePlanCanvasProps> = ({
  elements,
  selectedElements,
  viewport,
  processedGeometry,
  buildableEnvelope,
  edgeClassifications,
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
  cursor
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Add non-passive wheel event listener to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onWheel) return;

    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
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
        deltaMode: event.deltaMode
      } as React.WheelEvent<HTMLCanvasElement>;
      onWheel(syntheticEvent);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [onWheel]);

  // Get element color, opacity, and stroke based on type
  const getElementStyle = useCallback((element: Element): { color: string; opacity: number; stroke: boolean; strokeColor?: string } => {
    switch (element.type) {
      case 'greenspace':
        return { color: '#BBF7D0', opacity: 0.5, stroke: false };
      case 'parking-aisle':
        return { color: '#C7D2DE', opacity: 0.65, stroke: false };
      case 'circulation':
        return { color: '#B8C4D0', opacity: 0.85, stroke: false };
      case 'parking':
      case 'parking-bay':
        // Must read as pavement against the white envelope — the old
        // near-white 0.5-alpha fill was invisible ("parking is not rendered")
        return { color: '#D3DCE7', opacity: 0.9, stroke: true, strokeColor: '#9AA8B8' };
      case 'building':
        return { color: '#BFDBFE', opacity: 0.95, stroke: true };
      case 'other':
        // Generated LOTS use type 'other' (brief Phase 2): parcel-line style,
        // rendered below everything so they never paint over buildings.
        return { color: '#F8FAFC', opacity: 0.85, stroke: true, strokeColor: '#94A3B8' };
      default:
        return { color: '#6B7280', opacity: 0.3, stroke: false };
    }
  }, []);

  // Render parcel boundary (dashed stroke, no fill)
  const renderParcelBoundary = useCallback((ctx: CanvasRenderingContext2D, geometry: any, zoom: number) => {
    let coords: number[][];
    if (geometry.type === 'Polygon') {
      coords = geometry.coordinates[0] as number[][];
    } else if (geometry.type === 'MultiPolygon') {
      coords = (geometry.coordinates as number[][][])[0][0];
    } else {
      return;
    }
    if (!coords || coords.length === 0) return;

    ctx.save();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2 / zoom;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([10 / zoom, 5 / zoom]);

    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }, []);

  // Render buildable envelope (subtle fill + dashed border)
  const renderBuildableEnvelope = useCallback((ctx: CanvasRenderingContext2D, envelope: import('geojson').Polygon, zoom: number) => {
    const coords = envelope.coordinates[0];
    if (!coords || coords.length === 0) return;

    ctx.save();

    // Very subtle fill
    ctx.fillStyle = '#DBEAFE';
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();

    // Subtle dashed border
    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([8 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }, []);

  // Render rotation handle
  const renderRotationHandle = useCallback((ctx: CanvasRenderingContext2D, centerX: number, centerY: number, handleX: number, handleY: number, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = '#3B82F6';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2 / zoom;
    
    // Line from center to handle
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();
    
    // Handle circle
    ctx.beginPath();
    ctx.arc(handleX, handleY, 6 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }, []);

  // Render grid
  const renderGrid = useCallback((ctx: CanvasRenderingContext2D, bounds: { minX: number; minY: number; maxX: number; maxY: number }, gridSize: number, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.5;

    const startX = Math.floor(bounds.minX / gridSize) * gridSize;
    const startY = Math.floor(bounds.minY / gridSize) * gridSize;
    const endX = Math.ceil(bounds.maxX / gridSize) * gridSize;
    const endY = Math.ceil(bounds.maxY / gridSize) * gridSize;

    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  // Render measurement line
  const renderMeasurement = useCallback((ctx: CanvasRenderingContext2D, startPoint: { x: number; y: number } | null, endPoint: { x: number; y: number } | null, zoom: number) => {
    if (!startPoint || !endPoint) return;

    ctx.save();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();

    // Draw endpoints
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(endPoint.x, endPoint.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();

    // Draw distance label (Y-flipped so text is right-side up).
    // World coords are EPSG:3857 metres → convert to feet for display.
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = metersToFeet(Math.sqrt(dx * dx + dy * dy));
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;

    ctx.save();
    ctx.translate(midX, midY);
    ctx.scale(1, -1);

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([]);
    ctx.font = `${12 / zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = `${distance.toFixed(1)} ft`;
    const metrics = ctx.measureText(text);
    const padding = 4 / zoom;
    const textWidth = metrics.width;
    const textHeight = 16 / zoom;

    ctx.fillRect(-textWidth / 2 - padding, -textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    ctx.strokeRect(-textWidth / 2 - padding, -textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    ctx.restore();
  }, []);

  // Render vertex handles
  const renderVertexHandles = useCallback((ctx: CanvasRenderingContext2D, element: Element, isSelected: boolean, isVertexEditing: boolean, selectedVertex: { elementId: string; vertexIndex: number } | null, zoom: number) => {
    if (!isSelected) return;
    
    ctx.save();
    const coords = element.geometry.coordinates[0];
    
    coords.forEach(([x, y], index) => {
      const isSelectedVertex = isVertexEditing && selectedVertex?.elementId === element.id && selectedVertex.vertexIndex === index;
      
      ctx.fillStyle = isSelectedVertex ? '#EF4444' : '#3B82F6';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1 / zoom;
      
      ctx.beginPath();
      ctx.arc(x, y, 5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    
    ctx.restore();
  }, []);

  // Render stall dividers inside a parking bay, angled per the solver's layout.
  const renderParkingStripes = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    if (element.type !== 'parking' && element.type !== 'parking-bay') return;
    if (!parkingViz) return;
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) return;

    ctx.save();

    // Clip to the bay polygon in WORLD space first — clipping after rotating
    // would rotate the clip region away from where the bay is actually drawn.
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.clip();

    // Then rotate the stripe direction around the bay centre.
    const bounds = ElementService.getElementBounds(element);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((parkingViz.angleDeg * Math.PI) / 180);

    // World units are metres; the stall width arrives in feet.
    const stallWidth = feetToMeters(parkingViz.stallWidthFt);
    if (stallWidth <= 0) {
      ctx.restore();
      return;
    }

    // Span the bay's diagonal so rotated stripes always cover the clip region.
    const halfDiag = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.8;

    for (let x = -halfDiag + stallWidth; x < halfDiag; x += stallWidth) {
      ctx.beginPath();
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
      ctx.stroke();
    }

    ctx.restore();
  }, [parkingViz]);

  // Render element labels — building-only, clean style
  const renderElementLabel = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    if (element.type !== 'building') return; // Only label buildings

    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) return;

    // Find center + extent of polygon
    let cx = 0, cy = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const n = coords.length - 1; // exclude closing vertex
    for (let i = 0; i < n; i++) {
      cx += coords[i][0];
      cy += coords[i][1];
      minX = Math.min(minX, coords[i][0]);
      minY = Math.min(minY, coords[i][1]);
      maxX = Math.max(maxX, coords[i][0]);
      maxY = Math.max(maxY, coords[i][1]);
    }
    cx /= n;
    cy /= n;

    // Declutter by ON-SCREEN size: a label larger than its building buries
    // the plan (small SF footprints, zoomed-out views). Tiny → no label;
    // modest → name-only badge; roomy → full two-line tag.
    const screenW = (maxX - minX) * zoom;
    const screenH = (maxY - minY) * zoom;
    if (Math.min(screenW, screenH) < 18 || Math.max(screenW, screenH) < 40) return;
    const roomForDetail = screenW >= 90 && screenH >= 42;

    const fontSize = Math.max(10, 14 / zoom);

    ctx.save();
    // Flip Y for text (canvas Y is inverted)
    ctx.translate(cx, cy);
    ctx.scale(1, -1);

    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const name = element.name?.replace('Building ', '') || element.id;
    const area = element.properties?.areaSqFt as number | undefined;
    const floors = Math.max(
      1,
      Math.floor(
        ((element.properties?.floors as number) || (element.properties?.stories as number) || 1)
      )
    );
    // Floors + total GFA reads like a TestFit tag; footprint SF alone undersells it
    const areaText = !roomForDetail
      ? ''
      : area
        ? `${floors} fl · ${Math.round(area * floors).toLocaleString()} SF`
        : `${floors} fl`;

    // Background pill
    const textWidth = Math.max(ctx.measureText(name).width, areaText ? ctx.measureText(areaText).width : 0);
    const padding = 4 / zoom;
    const bgWidth = textWidth + padding * 4;
    const bgHeight = (areaText ? fontSize * 2.4 : fontSize * 1.4) + padding * 2;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    const r = 3 / zoom;
    ctx.roundRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, r);
    ctx.fill();

    // Text
    ctx.fillStyle = '#1E293B';
    ctx.fillText(name, 0, areaText ? -fontSize * 0.5 : 0);
    if (areaText) {
      ctx.font = `400 ${fontSize * 0.85}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#64748B';
      ctx.fillText(areaText, 0, fontSize * 0.5);
    }

    ctx.restore();
  }, []);

  // Render individual element
  const renderElement = useCallback((ctx: CanvasRenderingContext2D, element: Element, isSelected: boolean, isHovered: boolean, zoom: number) => {    const style = getElementStyle(element);
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) return;

    ctx.save();

    // Fill
    ctx.fillStyle = style.color;
    ctx.globalAlpha = isHovered ? Math.min(style.opacity + 0.2, 1) : style.opacity;
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.fill();

    // Stroke — ONLY for stroked styles and selected elements
    if (style.stroke || isSelected) {
      ctx.strokeStyle = isSelected ? '#F59E0B' : (style.strokeColor ?? '#1E40AF');
      ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
      ctx.globalAlpha = 1;
      ctx.stroke();
    }

    ctx.restore();
  }, [getElementStyle]);

  // Building interior detail. With a unit mix present this draws the REAL
  // floorplate — typed unit modules along the corridor with egress cores,
  // TestFit-style — re-sliced live as the building moves/resizes. Without a
  // mix it falls back to generic unit ticks.
  const renderBuildingDetail = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 4) return;

    const UNIT_SPACING_M = feetToMeters(26); // ~typical unit module along the corridor
    // Skip when detail would be sub-3px noise
    if (UNIT_SPACING_M * zoom < 3) return;

    const mix = element.properties?.unitMix as
      | Array<{ type: string; count: number; avgSqft: number }>
      | undefined;
    if (mix && mix.length > 0) {
      const plate = computeFloorplate(
        coords,
        mix,
        Math.max(1, Math.floor((element.properties?.floors as number) || 1))
      );
      if (plate.units.length > 0) {
        ctx.save();
        // Clip to the footprint so nothing bleeds outside irregular shapes
        ctx.beginPath();
        ctx.moveTo(coords[0][0], coords[0][1]);
        for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
        ctx.closePath();
        ctx.clip();

        for (const u of plate.units) {
          ctx.fillStyle = UNIT_COLORS[u.type] ?? '#E2E8F0';
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(u.ring[0][0], u.ring[0][1]);
          for (let i = 1; i < u.ring.length; i++) ctx.lineTo(u.ring[i][0], u.ring[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Egress cores: dark hatch
        for (const core of plate.cores) {
          ctx.fillStyle = '#94A3B8';
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.moveTo(core.ring[0][0], core.ring[0][1]);
          for (let i = 1; i < core.ring.length; i++) ctx.lineTo(core.ring[i][0], core.ring[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(core.ring[0][0], core.ring[0][1]);
          ctx.lineTo(core.ring[2][0], core.ring[2][1]);
          ctx.moveTo(core.ring[1][0], core.ring[1][1]);
          ctx.lineTo(core.ring[3][0], core.ring[3][1]);
          ctx.stroke();
        }

        // Unit-type tags once units are ≥ ~14px wide on screen
        if (feetToMeters(20) * zoom >= 14) {
          const fontSize = 9 / zoom;
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const u of plate.units) {
            ctx.save();
            ctx.translate(u.center[0], u.center[1]);
            ctx.scale(1, -1);
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#1E293B';
            ctx.fillText(u.label, 0, 0);
            ctx.restore();
          }
        }

        // Corridor centreline over the plate
        const corridor = corridorLine(coords);
        if (corridor) {
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
          ctx.lineWidth = 1.5 / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(corridor[0][0], corridor[0][1]);
          ctx.lineTo(corridor[1][0], corridor[1][1]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        return;
      }
    }

    ctx.save();
    // Clip to the footprint so ticks never bleed outside
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = 'rgba(30, 64, 175, 0.30)';
    ctx.lineWidth = 1 / zoom;
    for (const [[x1, y1], [x2, y2]] of computeUnitTicks(coords, UNIT_SPACING_M)) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const corridor = corridorLine(coords);
    if (corridor) {
      ctx.strokeStyle = 'rgba(30, 64, 175, 0.55)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.beginPath();
      ctx.moveTo(corridor[0][0], corridor[0][1]);
      ctx.lineTo(corridor[1][0], corridor[1][1]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }, []);

  // Small in-plan zone label ("Drive", "Open space") so grey/green areas are
  // identified on the sheet itself, not only in the legend.
  const renderZoneLabel = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number, text: string) => {
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 4) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let cx = 0, cy = 0;
    const n = coords.length - 1;
    for (let i = 0; i < n; i++) {
      const [x, y] = coords[i];
      cx += x; cy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    cx /= n; cy /= n;
    // Only when the zone is big enough on screen to deserve a name
    if (Math.max(maxX - minX, maxY - minY) * zoom < 80) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1);
    ctx.font = `500 ${11 / zoom}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#475569';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }, []);

  // Per-bay stall count (the engine computes these; show them like TestFit does)
  const renderBayCount = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    const stalls = element.properties?.parkingSpaces as number | undefined;
    if (!stalls || stalls <= 0) return;
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 4) return;

    let cx = 0, cy = 0;
    const n = coords.length - 1;
    for (let i = 0; i < n; i++) {
      cx += coords[i][0];
      cy += coords[i][1];
    }
    cx /= n;
    cy /= n;

    const fontSize = 11 / zoom;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1); // flip so text is upright
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = `${stalls}`;
    const w = ctx.measureText(text).width + 8 / zoom;
    const h = fontSize * 1.5;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 2 / zoom);
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }, []);

  // Dimension callouts (width × depth in ft) for the selected building
  const renderDimensions = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 4) return;

    const OFFSET_M = 12 / zoom + 2; // stay clear of the footprint at any zoom
    const dims = edgeDimensions(coords, OFFSET_M);
    const fontSize = 12 / zoom;

    ctx.save();
    ctx.strokeStyle = '#64748B';
    ctx.fillStyle = '#334155';
    ctx.lineWidth = 1 / zoom;

    for (const d of dims) {
      const [[x1, y1], [x2, y2]] = d.line;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // end ticks
      const ex = x2 - x1, ey = y2 - y1;
      const len = Math.hypot(ex, ey) || 1;
      const tx = (-ey / len) * (4 / zoom);
      const ty = (ex / len) * (4 / zoom);
      for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.moveTo(px - tx, py - ty);
        ctx.lineTo(px + tx, py + ty);
        ctx.stroke();
      }
      // label
      ctx.save();
      ctx.translate(d.labelAt[0], d.labelAt[1]);
      ctx.scale(1, -1);
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = `${Math.round(metersToFeet(d.lengthM))} ft`;
      const w = ctx.measureText(text).width + 8 / zoom;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-w / 2, -fontSize * 0.8, w, fontSize * 1.6);
      ctx.fillStyle = '#334155';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, []);

  // Road-classified setback edges: front (blue) / rear (amber) / side (gray),
  // labeled with the setback distance — the zoning read TestFit charges for.
  const renderEdgeSetbacks = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    if (!edgeClassifications || edgeClassifications.length === 0) return;
    const EDGE_COLORS: Record<string, string> = {
      front: '#2563EB',
      rear: '#D97706',
      side: '#64748B',
    };
    const fontSize = 10 / zoom;

    ctx.save();
    for (const edge of edgeClassifications) {
      const [[x1, y1], [x2, y2]] = edge.edge;
      ctx.strokeStyle = EDGE_COLORS[edge.type] ?? '#64748B';
      ctx.lineWidth = 3 / zoom;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const setbackFt =
        edge.type === 'front' ? setbacks?.front :
        edge.type === 'rear' ? setbacks?.rear :
        setbacks?.side;
      if (setbackFt == null) continue;

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      ctx.save();
      ctx.translate(midX, midY);
      ctx.scale(1, -1);
      ctx.globalAlpha = 1;
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = `${edge.type[0].toUpperCase()} ${setbackFt}′`;
      const w = ctx.measureText(text).width + 6 / zoom;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-w / 2, -fontSize * 0.8, w, fontSize * 1.6);
      ctx.fillStyle = EDGE_COLORS[edge.type] ?? '#64748B';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }, [edgeClassifications, setbacks]);

  // Screen-space legend (bottom-left) — names every color on the sheet so
  // open space and drive aisles aren't "unidentified green areas / grey lines".
  const renderLegend = useCallback((ctx: CanvasRenderingContext2D, cssH: number, hasLots: boolean) => {
    const entries: Array<[string, string]> = [
      ['Studio', UNIT_COLORS['studio']],
      ['1 BR', UNIT_COLORS['1br']],
      ['2 BR', UNIT_COLORS['2br']],
      ['3 BR', UNIT_COLORS['3br']],
      ['Core / stairs', '#94A3B8'],
      ['Parking', '#E2E8F0'],
      ['Drive / aisle', '#CBD5E1'],
      ['Open space', '#BBF7D0'],
    ];
    if (hasLots) entries.push(['Lot line', '#F8FAFC']);

    const pad = 8;
    const rowH = 16;
    const boxW = 120;
    const boxH = entries.length * rowH + pad * 2 - 4;
    const x = 12;
    const y = cssH - boxH - 12;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    entries.forEach(([label, color], i) => {
      const rowY = y + pad + i * rowH + rowH / 2 - 2;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#94A3B8';
      ctx.beginPath();
      ctx.roundRect(x + pad, rowY - 5, 10, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.fillText(label, x + pad + 16, rowY);
    });
    ctx.restore();
  }, []);

  // Screen-space scale bar (drawn after the world transform is popped)
  const renderScaleBar = useCallback((ctx: CanvasRenderingContext2D, zoom: number, cssW: number, cssH: number) => {
    const { ft, px } = pickScaleBarFt(zoom);
    const x2 = cssW - 20;
    const x1 = x2 - px;
    const y = cssH - 18;

    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.moveTo(x1, y - 4);
    ctx.lineTo(x1, y + 4);
    ctx.moveTo(x2, y - 4);
    ctx.lineTo(x2, y + 4);
    ctx.stroke();
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${ft} ft`, (x1 + x2) / 2, y - 4);
    ctx.restore();
  }, []);

  // Render function
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

    // Clear canvas
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply view transformations
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, -viewport.zoom);

    // Render grid. gridState.size is in feet; world space is metres → convert.
    if (gridState?.enabled && processedGeometry) {
      renderGrid(ctx, processedGeometry.bounds, feetToMeters(gridState.size), viewport.zoom);
    }

    // Render buildable envelope (subtle background)
    if (buildableEnvelope) {
      renderBuildableEnvelope(ctx, buildableEnvelope, viewport.zoom);
    }

    // Sort elements by z-order: greenspace → parking/aisles → circulation → buildings
    const zOrder: Record<string, number> = {
      'other': -1, // generated lots sit under everything
      'greenspace': 0,
      'parking-aisle': 1,
      'circulation': 2,
      'parking': 3,
      'parking-bay': 3,
      'building': 4,
    };
    const sortedElements = [...elements].sort(
      (a, b) => (zOrder[a.type] ?? 5) - (zOrder[b.type] ?? 5)
    );

    // Render elements in z-order
    sortedElements.forEach((element) => {
      const isSelected = selectedElements.has(element.id);
      const isHovered = hoveredElement === element.id;
      renderElement(ctx, element, isSelected, isHovered, viewport.zoom);

      // Unit ticks + corridor line make buildings read as apartments
      if (element.type === 'building') {
        renderBuildingDetail(ctx, element, viewport.zoom);
      }

      // Stall dividers + per-bay counts on parking (from the solver)
      if (element.type === 'parking' || element.type === 'parking-bay') {
        renderParkingStripes(ctx, element, viewport.zoom);
        renderBayCount(ctx, element, viewport.zoom);
      }

      // Name the zones on the sheet: drives and larger open spaces
      if (element.type === 'circulation' && element.name === 'Main Drive') {
        renderZoneLabel(ctx, element, viewport.zoom, 'Drive');
      }
      if (element.type === 'greenspace' && ((element.properties?.areaSqFt as number) ?? 0) > 4000) {
        renderZoneLabel(ctx, element, viewport.zoom, 'Open space');
      }

      // Dimension callouts (width × depth) on the selected building
      if (isSelected && element.type === 'building') {
        renderDimensions(ctx, element, viewport.zoom);
      }

      // Render vertex handles if selected
      if (isSelected) {
        renderVertexHandles(ctx, element, isSelected, isVertexEditing, selectedVertex, viewport.zoom);
      }

      // Render rotation handle if single element selected
      if (isSelected && selectedElements.size === 1) {
        const center = ElementService.calculateElementCenter(element);
        const bounds = ElementService.getElementBounds(element);
        const handleDistance = 30 / viewport.zoom;
        const handleX = center.x;
        const handleY = bounds.maxY + handleDistance;
        renderRotationHandle(ctx, center.x, center.y, handleX, handleY, viewport.zoom);
      }
    });

    // Render parcel boundary (dashed line, on top of everything)
    if (processedGeometry) {
      renderParcelBoundary(ctx, processedGeometry.geometry, viewport.zoom);
    }

    // Color-coded front/side/rear edges with setback labels
    renderEdgeSetbacks(ctx, viewport.zoom);

    // Render building labels on top of everything
    if (showLabels) {
      sortedElements.forEach((element) => {
        if (element.type === 'building') {
          renderElementLabel(ctx, element, viewport.zoom);
        }
      });
    }

    // Render measurement line
    if (measurementState?.isMeasuring && measurementState.startPoint && measurementState.endPoint) {
      renderMeasurement(ctx, measurementState.startPoint, measurementState.endPoint, viewport.zoom);
    }

    ctx.restore();

    // Screen-space chrome (after the world transform is popped)
    const dpr = window.devicePixelRatio || 1;
    renderScaleBar(ctx, viewport.zoom, canvas.width / dpr, canvas.height / dpr);
    renderLegend(ctx, canvas.height / dpr, elements.some(e => e.type === 'other'));
  }, [elements, selectedElements, viewport.zoom, viewport.panX, viewport.panY, processedGeometry, buildableEnvelope, isVertexEditing, selectedVertex, measurementState, gridState, hoveredElement, showLabels, renderParcelBoundary, renderBuildableEnvelope, renderEdgeSetbacks, renderElement, renderBuildingDetail, renderBayCount, renderDimensions, renderScaleBar, renderLegend, renderZoneLabel, renderParkingStripes, renderVertexHandles, renderRotationHandle, renderGrid, renderMeasurement, renderElementLabel]);

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

  // Initialize canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 800;
      const height = rect.height || 600;
      
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  // Also trigger render on mount and when canvas size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const observer = new ResizeObserver(() => {
      render();
    });
    
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full absolute inset-0"
      style={{ cursor: cursor ?? 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={handleClick}
      style={{ display: 'block' }}
    />
  );
};


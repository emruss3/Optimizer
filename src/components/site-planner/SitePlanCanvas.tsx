// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useRef, useEffect, useCallback } from 'react';
import type { Element } from '../../engine/types';
import type { ViewportState } from '../../hooks/useViewport';
import { ElementService } from '../../services/elementService';
import { feetToMeters, metersToFeet } from '../../engine/units';
import { computeUnitTicks, corridorLine, edgeDimensions, pickScaleBarFt, longestEdgeAngle, sortByZOrder, setbackLabelIndices, pointsAlongSegment, computeCurbCut, townhomeSlices } from './planRendering';
import { computeFloorplate, UNIT_COLORS } from './unitLayout';
import type { EdgeClassification } from '../../engine/setbacks';
import type { ParcelTopoView } from '../../features/site-plan/api/parcelTopo';
import type { SheetAnnotation, SheetTitleBlock } from '../../features/site-plan/api/sheetAnnotations';

const NO_ANNOTATIONS: SheetAnnotation[] = [];

/** Fold an angle (radians) into (-π/2, π/2] so text along it reads upright. */
function uprightAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI / 2) r -= Math.PI;
  else if (r < -Math.PI / 2) r += Math.PI;
  return r;
}

function polylineLength(line: number[][]): number {
  let L = 0;
  for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return L;
}

/** Point and direction at distance `s` along a polyline (world units). */
function alongPolyline(line: number[][], s: number): { x: number; y: number; angle: number } {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len <= 0) continue;
    if (s <= acc + len || i === line.length - 1) {
      const t = Math.min(1, Math.max(0, (s - acc) / len));
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: Math.atan2(by - ay, bx - ax) };
    }
    acc += len;
  }
  return { x: line[0][0], y: line[0][1], angle: 0 };
}

/** Greedy word wrap for the current ctx.font. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(probe).width > maxW) {
      out.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Screen-sized text anchored in the world frame (which is y-up), rotated
 * along `angle` and kept upright. A halo (stroke) keeps it legible over line
 * work; a pill (box) lifts it off pavement. Centred on the anchor; `dy` in
 * world units moves it off the line (negative = up on screen).
 */
function drawSheetText(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  x: number,
  y: number,
  angle: number,
  text: string,
  o: { fontPx: number; weight: number; fill: string; halo?: string; pill?: string; dy?: number; baseline?: CanvasTextBaseline },
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.rotate(-uprightAngle(angle));
  const size = o.fontPx / zoom;
  ctx.font = `${o.weight} ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  const dy = o.dy ?? 0;
  if (o.pill) {
    const w = ctx.measureText(text).width + 8 / zoom;
    const h = size * 1.5;
    ctx.fillStyle = o.pill;
    ctx.beginPath();
    ctx.roundRect(-w / 2, dy - h / 2, w, h, 2 / zoom);
    ctx.fill();
  }
  if (o.halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = o.halo;
    ctx.strokeText(text, 0, dy);
  }
  ctx.fillStyle = o.fill;
  ctx.fillText(text, 0, dy);
  ctx.restore();
}

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

  // Get element color, opacity, and stroke based on type
  const getElementStyle = useCallback((element: Element): { color: string; opacity: number; stroke: boolean; strokeColor?: string } => {
    // Styled honesty (order-4): elements may OPT IN to explicit styling
    // (seed zones' subtle ground tints). Type defaults stay authoritative
    // for everything else — no existing element changes appearance.
    const po = element.properties as { styleOverride?: boolean; color?: string; opacity?: number; strokeColor?: string } | undefined;
    if (po?.styleOverride && po.color) {
      return {
        color: po.color,
        opacity: po.opacity ?? 0.5,
        stroke: true,
        strokeColor: po.strokeColor ?? '#B6C2CE',
      };
    }
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

  // Square corner handles on selected buildings — the grab points for
  // parametric resize (width/depth through the solver).
  const renderResizeHandles = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length !== 5) return; // rectangles only

    ctx.save();
    const size = 8 / zoom;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1.5 / zoom;
    for (let i = 0; i < 4; i++) {
      const [x, y] = coords[i];
      ctx.beginPath();
      ctx.rect(x - size / 2, y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
    }
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

  // Draw INDIVIDUAL stall dividers, the professional-plan look. Every parking
  // band (server court or worker bay) is one stall row deep by construction,
  // so perpendicular ticks along the band's LONG AXIS are the stalls — not
  // decorative hatching across the whole polygon.
  const renderParkingStripes = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    if (element.type !== 'parking' && element.type !== 'parking-bay') return;
    // Townhome garage aprons are private driveways, not a striped surface
    // lot — striping them was part of the "small multifamily" misread.
    if (element.properties?.apron) return;
    if (!parkingViz) return;
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 3) return;

    const stallWidth = feetToMeters(parkingViz.stallWidthFt);
    if (stallWidth <= 0) return;

    // Band frame: long axis from the polygon's longest edge
    const angle = longestEdgeAngle(coords);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const bounds = ElementService.getElementBounds(element);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // Local bbox in the band frame
    let lminX = Infinity, lmaxX = -Infinity, lminY = Infinity, lmaxY = -Infinity;
    for (const [px, py] of coords) {
      const dx = px - centerX;
      const dy = py - centerY;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      if (lx < lminX) lminX = lx;
      if (lx > lmaxX) lmaxX = lx;
      if (ly < lminY) lminY = ly;
      if (ly > lmaxY) lmaxY = ly;
    }

    // Declutter: skip when a stall would be under ~5px on screen
    if (stallWidth * zoom < 5) return;

    ctx.save();

    // Clip to the band polygon in WORLD space (before rotating the frame)
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i][0], coords[i][1]);
    }
    ctx.closePath();
    ctx.clip();

    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    // Stall dividers: dark-on-pavement like a striped lot
    ctx.strokeStyle = '#8494A6';
    ctx.lineWidth = Math.max(0.75 / zoom, 0.3);
    ctx.globalAlpha = 0.9;

    // Row bands across the band's DEPTH. Shallow bands (legacy courts,
    // worker bays) are one stall row by construction and stripe full-depth.
    // seed_v2 emits deep FIELDS (~60 ft: 18' row + 24' aisle + 18' row) —
    // full-depth dividers there drew 9×60 ft "stalls" (Eric, 2026-08-04:
    // "these aren't the size of parking spaces"). Deep bands now lay out as
    // real modules: stall row / clear aisle / facing row, back-to-back
    // repeating; any leftover reads as apron, never as a monster stall.
    const stallDepth = feetToMeters(parkingViz.stallDepthFt);
    const aisleW = feetToMeters(parkingViz.aisleWidthFt ?? 24);
    const depth = lmaxY - lminY;
    const rowBands: Array<[number, number]> = [];
    if (depth <= stallDepth * 1.6 || stallDepth <= 0) {
      rowBands.push([lminY, lmaxY]);
    } else {
      let y = lminY;
      while (y + stallDepth <= lmaxY + 1e-6) {
        rowBands.push([y, y + stallDepth]);
        if (y + stallDepth + aisleW + stallDepth <= lmaxY + 1e-6) {
          rowBands.push([y + stallDepth + aisleW, y + stallDepth + aisleW + stallDepth]);
          y += stallDepth + aisleW + stallDepth; // next module is back-to-back
        } else {
          break;
        }
      }
    }

    const startX = Math.ceil(lminX / stallWidth) * stallWidth;
    for (const [y0, y1] of rowBands) {
      // Row edges make the aisle read as clear pavement between rows
      ctx.beginPath();
      ctx.moveTo(lminX, y0);
      ctx.lineTo(lmaxX, y0);
      ctx.moveTo(lminX, y1);
      ctx.lineTo(lmaxX, y1);
      ctx.stroke();
      for (let x = startX; x < lmaxX; x += stallWidth) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
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

    // Fixed SCREEN size at any zoom (world-anchored, screen-sized labels —
    // standard CAD behavior). The old Math.max(10, …) floor was in WORLD
    // units, so badges grew with zoom past ~140%.
    const fontSize = 14 / zoom;

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

    // TOWNHOME ROWS are not apartment floorplates: each unit is a full-depth
    // party-wall slice with its own entrance — no corridor, no studio/1BR
    // program (the West Heiman reference: rows of ~19 ft plans fronting
    // lanes). Render N equal slices with party walls and door ticks.
    const th = element.properties?.th as
      | { units: number; unitWFt?: number | null }
      | undefined;
    if (th && th.units >= 1) {
      const slices = townhomeSlices(coords, th.units);
      if (slices.length === 0) return;
      const floors = Math.max(1, Math.floor((element.properties?.floors as number) || 1));
      const areaSqFt = (element.properties?.areaSqFt as number) || 0;
      const unitSf = areaSqFt > 0 ? (areaSqFt / th.units) * floors : 0;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
      ctx.closePath();
      ctx.clip();
      slices.forEach((slice, i) => {
        // Alternating sage tones so each dwelling reads individually
        ctx.fillStyle = i % 2 === 0 ? (UNIT_COLORS['townhome'] ?? '#A7D8B9') : '#BCE3C9';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(slice.ring[0][0], slice.ring[0][1]);
        for (let k = 1; k < slice.ring.length; k++) ctx.lineTo(slice.ring[k][0], slice.ring[k][1]);
        ctx.closePath();
        ctx.fill();
        // Party walls: bolder than apartment unit lines — they are real walls
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
        // Door ticks on both long edges (entry one side, garage the other)
        ctx.strokeStyle = 'rgba(30,41,59,0.55)';
        ctx.lineWidth = 1.2 / zoom;
        for (const e of slice.edges) {
          ctx.beginPath();
          ctx.moveTo(e.mid[0], e.mid[1]);
          ctx.lineTo(e.mid[0] + e.inward[0] * 1.4, e.mid[1] + e.inward[1] * 1.4);
          ctx.stroke();
        }
      });
      // Per-unit SF tag when a unit is wide enough on screen
      if (unitSf > 0 && feetToMeters(th.unitWFt ?? 19) * zoom >= 16) {
        const fontSize = 8 / zoom;
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = '#166534';
        ctx.globalAlpha = 0.95;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const slice of slices) {
          const cx = slice.ring.slice(0, 4).reduce((s, p) => s + p[0], 0) / 4;
          const cy = slice.ring.slice(0, 4).reduce((s, p) => s + p[1], 0) / 4;
          ctx.fillText(`${Math.round(unitSf).toLocaleString()} SF`, cx, cy);
        }
      }
      ctx.restore();
      return;
    }

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

        // A floor plate, not a barcode (Eric, 2026-09-03: "the colored
        // building doesn't make any sense from an actual multifamily
        // layout"): units are a pale tint of their type, the demising walls
        // are the dark lines, and the corridor between the two banks is a
        // clear strip — the double-loaded plan a civil would recognise.
        for (const u of plate.units) {
          ctx.fillStyle = UNIT_COLORS[u.type] ?? '#E2E8F0';
          ctx.globalAlpha = 0.38;
          ctx.beginPath();
          ctx.moveTo(u.ring[0][0], u.ring[0][1]);
          for (let i = 1; i < u.ring.length; i++) ctx.lineTo(u.ring[i][0], u.ring[i][1]);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(51,65,85,0.7)';
          ctx.lineWidth = 0.9 / zoom;
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

        // Unit-type tags ("Studio", "1 Bed", …) — full names are wider than
        // the old letter codes, so each tag draws only when it fits inside
        // its own unit on screen.
        if (feetToMeters(20) * zoom >= 14) {
          const fontSize = 9 / zoom;
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const u of plate.units) {
            // Screen-space bbox of the unit (text is axis-aligned)
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const [x, y] of u.ring) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
            // measureText is in world units here (font size is world-scaled)
            if (ctx.measureText(u.label).width > (maxX - minX) * 0.9) continue;
            if (fontSize * 1.2 > (maxY - minY)) continue;
            ctx.save();
            ctx.translate(u.center[0], u.center[1]);
            ctx.scale(1, -1);
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#1E293B';
            ctx.fillText(u.label, 0, 0);
            ctx.restore();
          }
        }

        // The corridor: a clear strip between the two unit banks (world width,
        // ~5.5 ft) with the centreline dashed over it.
        const corridor = corridorLine(coords);
        if (corridor) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.moveTo(corridor[0][0], corridor[0][1]);
          ctx.lineTo(corridor[1][0], corridor[1][1]);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
          ctx.lineWidth = 1.2 / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
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

  // Held-out land is called out on the sheet itself, not only in the legend
  // (Eric, 2026-09-04: "You're showing wetlands and floodplains in white.
  // Shouldn't they be called out?"): a diagonal hatch — the map convention for
  // a floodplain — and a label naming the zone, on every greenway piece big
  // enough to carry one.
  const renderGreenwayCallout = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    const p = element.properties as
      | { kind?: string; hazardKind?: string; zone?: string; subtype?: string; bufferFt?: number }
      | undefined;
    if (!p || p.kind !== 'greenway') return;
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

    // Hatch, clipped to the piece: 45°, ~8 px apart on screen
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.5)';
    ctx.lineWidth = 0.8 / zoom;
    const h = maxY - minY;
    const step = Math.max(8 / zoom, 2);
    for (let d = minX - h; d < maxX + h; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, minY);
      ctx.lineTo(d + h, maxY);
      ctx.stroke();
    }
    ctx.restore();

    // Label when the piece is big enough on screen to carry it
    if (Math.min(maxX - minX, maxY - minY) * zoom < 36 || Math.max(maxX - minX, maxY - minY) * zoom < 90) return;
    const label = p.hazardKind === 'wetland'
      ? `Wetland${p.subtype ? ` (${String(p.subtype).toLowerCase()})` : ''} · ${p.bufferFt ?? 25}-ft buffer`
      : p.hazardKind === 'floodway'
        ? `Floodway${p.zone ? ` (${p.zone})` : ''}`
        : `${p.zone ? `${p.zone} ` : ''}floodplain`;
    const fontSize = 11 / zoom;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1);
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 8 / zoom;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -fontSize * 0.75, w, fontSize * 1.5, 2 / zoom);
    ctx.fill();
    ctx.fillStyle = '#0F766E';
    ctx.fillText(label, 0, 0);
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

    // Screen-space room inside the bay (text is axis-aligned)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const [x, y] = coords[i];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const roomPx = (maxX - minX) * zoom;
    if (roomPx < 34 || (maxY - minY) * zoom < 14) return;

    const fontSize = 11 / zoom;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1); // flip so text is upright
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Say what the number is: a bare "25" on a grey rectangle read as a
    // building bay (Eric, 2026-09-03: "building w/ 25, 25, 25, 18"). A bay
    // too narrow for the word gets the parking glyph instead ("P · 25").
    const full = `${stalls} stall${stalls === 1 ? '' : 's'}`;
    const text = ctx.measureText(full).width * zoom + 10 <= roomPx ? full : `P · ${stalls}`;
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
    // Label discipline: one label per (type, bearing) group — jagged sides
    // classify as many short edges and printed the same "S 5′" repeatedly.
    const labeled = setbackLabelIndices(edgeClassifications);

    ctx.save();
    for (let ei = 0; ei < edgeClassifications.length; ei++) {
      const edge = edgeClassifications[ei];
      const [[x1, y1], [x2, y2]] = edge.edge;
      ctx.strokeStyle = EDGE_COLORS[edge.type] ?? '#64748B';
      ctx.lineWidth = 3 / zoom;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (!labeled.has(ei)) continue;
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

  // Neighborhood context: neighbor parcels in grey, existing building
  // footprints as light outlines, street segments as wide casings — drawn
  // UNDER the plan so the scheme reads in its block. Display only.
  const renderNeighbors = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    if (!neighbors) return;
    ctx.save();
    // Street casings first (widest, lightest). HONESTY GATE: the roads
    // dataset is a sparse OSM stub and the RPC's radius filter leaks —
    // segments from blocks away must not paint a street where none is
    // known. Only draw a road that actually approaches this parcel
    // (within ~120 m of its bounds); absent data renders as absence.
    const pb = processedGeometry?.bounds;
    const nearParcel = (coords: number[][]): boolean => {
      if (!pb) return true;
      return coords.some(([x, y]) =>
        x > pb.minX - 120 && x < pb.maxX + 120 && y > pb.minY - 120 && y < pb.maxY + 120
      );
    };
    for (const road of neighbors.roads) {
      const coords = road.line.coordinates;
      if (!coords || coords.length < 2) continue;
      if (!nearParcel(coords)) continue;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.lineWidth = 12; // metres — reads as a street body
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Neighbor parcels
    for (const p of neighbors.parcels) {
      const ring = p.coordinates?.[0];
      if (!ring || ring.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
    // Existing buildings (light mass with a fine outline)
    for (const b of neighbors.buildings) {
      const ring = b.polygon.coordinates?.[0];
      if (!ring || ring.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
    ctx.restore();
  }, [neighbors, processedGeometry]);

  // Perimeter landscape strip + street trees along the classified front
  // edge(s), plus a curb-cut apron where the drive meets the street — the
  // cheap polygons that make a plan read as designed instead of diagrammed.
  // Purely decorative rendering: nothing here measures or changes the design.
  const renderLandscape = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    const parcelRing: number[][] | undefined = processedGeometry?.geometry?.coordinates?.[0];
    if (!parcelRing || parcelRing.length < 4) return;

    // Planting strip: stroke the boundary wide, clipped to the parcel, so a
    // soft green band hugs the inside of the property line.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(parcelRing[0][0], parcelRing[0][1]);
    for (let i = 1; i < parcelRing.length; i++) ctx.lineTo(parcelRing[i][0], parcelRing[i][1]);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.20)';
    ctx.lineWidth = 7; // metres; half falls inside the clip → ~3.5 m strip
    ctx.stroke();
    ctx.restore();

    // Street trees along front edges, skipping the drive corridor.
    const fronts = (edgeClassifications ?? []).filter(e => e.type === 'front');
    if (fronts.length) {
      const drives = elements.filter(e => e.type === 'circulation');
      const nearDrive = (x: number, y: number): boolean =>
        drives.some(d => {
          const ring = d.geometry?.coordinates?.[0];
          if (!ring) return false;
          return ring.some(([dx, dy]: number[]) => Math.hypot(dx - x, dy - y) < 8);
        });
      for (const f of fronts) {
        for (const [tx, ty] of pointsAlongSegment(f.edge, 10, 4)) {
          if (nearDrive(tx, ty)) continue;
          ctx.save();
          ctx.translate(tx, ty);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
          ctx.beginPath();
          ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(22, 163, 74, 0.55)';
          ctx.beginPath();
          ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Curb cut: white apron + throat dashes where the main drive meets the
    // parcel line, so the drive stops dead-ending visually. Heuristic edge
    // until true frontage (G0) lands.
    const mainDrive = suppressCurbCut
      ? undefined
      : elements.find(e => e.type === 'circulation' && e.name === 'Main Drive')
        ?? elements.find(e => e.type === 'circulation');
    const driveRing = mainDrive?.geometry?.coordinates?.[0];
    if (driveRing) {
      const cut = computeCurbCut(driveRing as number[][], parcelRing);
      if (cut) {
        ctx.save();
        ctx.translate(cut.at[0], cut.at[1]);
        ctx.rotate(cut.edgeAngle);
        // Apron: flared trapezoid across the boundary
        ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
        ctx.beginPath();
        ctx.moveTo(-7, -1.2);
        ctx.lineTo(7, -1.2);
        ctx.lineTo(4.5, 3.6);
        ctx.lineTo(-4.5, 3.6);
        ctx.closePath();
        ctx.fill();
        // Curb line broken at the cut
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.stroke();
        // Throat dashes (entry read)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([1.4, 1.2]);
        ctx.beginPath();
        ctx.moveTo(0, -0.8);
        ctx.lineTo(0, 3.2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }, [processedGeometry, edgeClassifications, elements, suppressCurbCut]);

  // Screen-space north arrow (top-right). World +Y is projected north — the
  // canvas flips Y, so "up" on screen is north and the glyph is static.
  const renderNorthArrow = useCallback((ctx: CanvasRenderingContext2D, cssW: number) => {
    const x = cssW - 30;
    const y = 34;
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x, y - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x - 4.5, y - 3);
    ctx.lineTo(x + 4.5, y - 3);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', x, y + 13);
    ctx.restore();
  }, []);

  // Degraded-mode watermark: tiled diagonal "DRAFT" so default-assumption
  // plans can never pass as authoritative.
  const renderDraftWatermark = useCallback((ctx: CanvasRenderingContext2D, cssW: number, cssH: number) => {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#B45309';
    ctx.font = '700 26px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ty = cssH * 0.28; ty < cssH; ty += cssH * 0.44) {
      for (let tx = cssW * 0.3; tx < cssW; tx += cssW * 0.5) {
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(-Math.PI / 10);
        ctx.fillText('DRAFT — default assumptions', 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }, []);

  // Screen-space legend (bottom-left) — names every color on the sheet so
  // open space and drive aisles aren't "unidentified green areas / grey lines".
  const renderLegend = useCallback((ctx: CanvasRenderingContext2D, cssH: number, hasLots: boolean) => {
    // Townhome plans key their party-wall dwellings, not an apartment mix —
    // showing "Studio · 550 SF" beside townhome rows was the giveaway that
    // the product was being drawn as small multifamily.
    const thEl = elements.find(e => (e.properties as Record<string, unknown> | undefined)?.th);
    const thW = (thEl?.properties as { th?: { unitWFt?: number | null } } | undefined)?.th?.unitWFt;
    const unitRows: Array<[string, string]> = thEl
      ? [[`Townhome${thW ? ` · ${Math.round(thW)} ft wide` : ''}`, UNIT_COLORS['townhome']]]
      : [
          ['Studio · 550 SF', UNIT_COLORS['studio']],
          ['1 Bed · 700 SF', UNIT_COLORS['1br']],
          ['2 Bed · 1,100 SF', UNIT_COLORS['2br']],
          ['3 Bed · 1,600 SF', UNIT_COLORS['3br']],
        ];
    // A subdivision is streets, alleys, lots and courts — the apartment mix
    // and parking vocabulary would misdescribe it (audit §7b: "the legend
    // has no vocabulary for ROW, alley, courtyard"). Colors match the
    // subdivision mapper's style overrides.
    const isSubdivision = elements.some(e => e.id.startsWith('subdiv-'));
    const entries: Array<[string, string]> = isSubdivision
      ? [
          ['Street (public ROW)', '#A9B4C0'],
          ['Alley', '#D5DCE4'],
          ['Lot', '#F8FAFC'],
          ['Greenway (floodplain / wetland)', '#99F6E4'],
          ['Court', '#BBF7D0'],
          ['Amenity', '#86EFAC'],
          ['Unassigned land', '#F1F5F9'],
          ['Front setback', '#2563EB'],
          ['Rear setback', '#D97706'],
          ['Side setback', '#64748B'],
        ]
      : [
          ...unitRows,
          ['Core / stairs', '#94A3B8'],
          ['Parking', '#E2E8F0'],
          ['Drive / aisle', '#CBD5E1'],
          ['Open space', '#BBF7D0'],
          ['Amenity / pool', '#F59E0B'],
          // Setback edge key — colors must match renderEdgeSetbacks exactly
          ['Front setback', '#2563EB'],
          ['Rear setback', '#D97706'],
          ['Side setback', '#64748B'],
        ];
    if (hasLots && !isSubdivision) entries.push(['Lot line', '#F8FAFC']);
    // Existing contours are line work, keyed as a line (the 'contour' colour
    // token draws a sample stroke instead of a swatch).
    if (topo && topo.contours.length > 0) entries.push(['Existing contour · 1 ft (index 5 ft)', 'contour']);

    const pad = 8;
    const rowH = 16;
    ctx.save();
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    let labelW = 0;
    for (const [label] of entries) labelW = Math.max(labelW, ctx.measureText(label).width);
    const boxW = Math.max(isSubdivision ? 196 : 132, Math.ceil(labelW) + pad * 2 + 16);
    const boxH = entries.length * rowH + pad * 2 - 4;
    const x = 12;
    const y = cssH - boxH - 12;

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    entries.forEach(([label, color], i) => {
      const rowY = y + pad + i * rowH + rowH / 2 - 2;
      if (color === 'contour') {
        ctx.strokeStyle = 'rgba(120, 72, 32, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + pad, rowY + 3);
        ctx.quadraticCurveTo(x + pad + 5, rowY - 6, x + pad + 10, rowY - 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x + pad, rowY - 5, 10, 10, 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#475569';
      ctx.fillText(label, x + pad + 16, rowY);
    });
    ctx.restore();
  }, [elements, topo]);

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

  // Existing topography (USGS 3DEP 1-m DEM): 1-ft contours screened over the
  // plan the way a civil sheet carries existing conditions — minor lines thin
  // and light, index (5-ft) lines heavier and labelled along the line. Minor
  // contours drop out when they would crowd closer than ~4 px on screen (a
  // hillside at fit zoom); index labels need ~24 px between index lines.
  const renderTopo = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    if (!topo || topo.contours.length === 0) return;
    const slope = Math.max(0.5, topo.meanSlopePct ?? 5);
    // screen px between 1-ft contours at the mean slope (run per ft of rise = 100/slope ft)
    const minorPx = zoom * (100 / slope) * 0.3048;
    const drawMinor = minorPx >= 4;
    const labelIndex = minorPx * 5 >= 24;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of topo.contours) {
      if (!c.index && !drawMinor) continue;
      ctx.strokeStyle = c.index ? 'rgba(120, 72, 32, 0.55)' : 'rgba(120, 72, 32, 0.28)';
      ctx.lineWidth = (c.index ? 1.1 : 0.6) / zoom;
      ctx.beginPath();
      for (const line of c.lines) {
        if (line.length < 2) continue;
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0], line[i][1]);
      }
      ctx.stroke();
    }
    if (labelIndex) {
      for (const c of topo.contours) {
        if (!c.index) continue;
        // label the longest piece at its midpoint, along the line
        let best: number[][] | null = null;
        let bestLen = 0;
        for (const line of c.lines) {
          const L = polylineLength(line);
          if (L > bestLen) { bestLen = L; best = line; }
        }
        if (!best || bestLen * zoom < 70) continue;
        const at = alongPolyline(best, bestLen / 2);
        drawSheetText(ctx, zoom, at.x, at.y, at.angle, String(Math.round(c.elevationFt)), {
          fontPx: 9.5, weight: 600, fill: 'rgba(120, 72, 32, 0.95)', halo: 'rgba(249, 250, 251, 0.95)',
        });
      }
    }
    ctx.restore();
  }, [topo]);

  // Civil-sheet callouts: station ticks along each through-street with the
  // station above the line and the existing grade below it, the R.O.W. name
  // between ticks, alley widths, the cul-de-sac radius. World-anchored,
  // screen-sized, each with its own zoom floor so nothing piles up at fit.
  const renderAnnotations = useCallback((ctx: CanvasRenderingContext2D, zoom: number) => {
    if (annotations.length === 0) return;
    ctx.save();
    for (const a of annotations) {
      if (a.minZoom != null && zoom < a.minZoom) continue;
      const angle = a.angle ?? 0;
      if (a.kind === 'station') {
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const h = 5 / zoom;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(a.x - nx * h, a.y - ny * h);
        ctx.lineTo(a.x + nx * h, a.y + ny * h);
        ctx.stroke();
        if (zoom >= (a.labelMinZoom ?? 0)) {
          drawSheetText(ctx, zoom, a.x, a.y, angle, a.text, {
            fontPx: 9, weight: 500, fill: '#334155', halo: 'rgba(255,255,255,0.9)', dy: -7 / zoom, baseline: 'bottom',
          });
        }
      } else if (a.kind === 'spot') {
        drawSheetText(ctx, zoom, a.x, a.y, angle, a.text, {
          fontPx: 9, weight: 500, fill: '#7C2D12', halo: 'rgba(255,255,255,0.9)', dy: 7 / zoom, baseline: 'top',
        });
      } else if (a.kind === 'label') {
        drawSheetText(ctx, zoom, a.x, a.y, angle, a.text, { fontPx: 9.5, weight: 700, fill: '#1F2937', pill: 'rgba(255,255,255,0.85)' });
      } else {
        drawSheetText(ctx, zoom, a.x, a.y, 0, a.text, { fontPx: 9.5, weight: 600, fill: '#1F2937', pill: 'rgba(255,255,255,0.85)' });
      }
    }
    ctx.restore();
  }, [annotations]);

  // Lot numbers at the centroid of every generated lot, with the frontage ×
  // depth and area once the lot is roomy on screen — the plat's vocabulary.
  const renderLotTag = useCallback((ctx: CanvasRenderingContext2D, element: Element, zoom: number) => {
    if (element.type !== 'other' || !/^Lot \d+$/.test(element.name ?? '')) return;
    const coords = element.geometry?.coordinates?.[0];
    if (!coords || coords.length < 4) return;
    let cx = 0, cy = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
    const screenW = (maxX - minX) * zoom;
    const screenH = (maxY - minY) * zoom;
    if (Math.min(screenW, screenH) < 14 || Math.max(screenW, screenH) < 26) return;
    const roomy = Math.min(screenW, screenH) >= 44 && Math.max(screenW, screenH) >= 78;
    const num = (element.name ?? '').replace('Lot ', '');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${11 / zoom}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#334155';
    ctx.fillText(num, 0, roomy ? -6 / zoom : 0);
    if (roomy) {
      const p = element.properties as { widthFt?: number; depthFt?: number; areaSqFt?: number } | undefined;
      const dims = typeof p?.widthFt === 'number' && typeof p?.depthFt === 'number'
        ? `${Math.round(p.widthFt)}' × ${Math.round(p.depthFt)}'`
        : '';
      const area = typeof p?.areaSqFt === 'number' && p.areaSqFt > 0 ? `${Math.round(p.areaSqFt).toLocaleString()} SF` : '';
      ctx.font = `500 ${8.5 / zoom}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#64748B';
      if (dims) ctx.fillText(dims, 0, 5 / zoom);
      if (area) ctx.fillText(area, 0, 15 / zoom);
    }
    ctx.restore();
  }, []);

  // Screen-space title block (top-right, beside the north arrow, clear of
  // the building inspector at top-left): the project, the sheet title, the
  // basis of every line on it, the on-screen scale and the date — and the
  // line every concept sheet carries: NOT FOR CONSTRUCTION.
  const renderTitleBlock = useCallback((ctx: CanvasRenderingContext2D, zoom: number, cssW: number) => {
    if (!sheet) return;
    const pad = 10;
    const y = 12;
    const maxW = Math.min(320, Math.max(200, cssW * 0.3));
    const rows: Array<{ text: string; font: string; color: string; h: number; gap: number }> = [];
    ctx.save();
    const add = (text: string, size: number, weight: number, color: string, gap = 0) => {
      const font = `${weight} ${size}px Inter, system-ui, sans-serif`;
      ctx.font = font;
      wrapText(ctx, text, maxW).forEach((t, i) => rows.push({ text: t, font, color, h: Math.round(size * 1.3), gap: i === 0 ? gap : 0 }));
    };
    // 1 in on screen = 96 px = 96/zoom m
    const scaleFt = Math.round((96 / zoom) * 3.28084);
    add(sheet.project, 12, 700, '#0F172A');
    add(sheet.title, 10, 700, '#1E3A8A', 2);
    if (sheet.subtitle) add(sheet.subtitle, 10, 500, '#475569', 1);
    sheet.notes.forEach((note, i) => add(note, 8.5, 400, '#64748B', i === 0 ? 5 : 1));
    add(`SCALE 1" = ${scaleFt}' on screen · ${sheet.date}`, 9, 500, '#475569', 5);
    add('CONCEPT — NOT FOR CONSTRUCTION', 9.5, 700, '#B45309', 2);
    let boxW = 0;
    for (const r of rows) {
      ctx.font = r.font;
      boxW = Math.max(boxW, ctx.measureText(r.text).width);
    }
    boxW = Math.ceil(boxW) + pad * 2;
    const boxH = rows.reduce((s, r) => s + r.h + r.gap, 0) + pad * 2 - 2;
    // right-aligned, leaving the north arrow its 50 px
    const x = Math.max(12, cssW - 52 - boxW);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let cy = y + pad;
    for (const r of rows) {
      cy += r.gap;
      ctx.font = r.font;
      ctx.fillStyle = r.color;
      ctx.fillText(r.text, x + pad, cy);
      cy += r.h;
    }
    ctx.restore();
  }, [sheet]);

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

    // Draw in CSS pixels while retaining a sharp high-DPI backing store.
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#F9FAFB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

    // Neighborhood first (bottom of the stack), then landscape, then the plan
    renderNeighbors(ctx, viewport.zoom);
    // Perimeter planting + street trees sit under the plan elements
    renderLandscape(ctx, viewport.zoom);

    // The z-order CONTRACT (PLAN_Z_ORDER in planRendering.ts): every path —
    // server plan, worker fallback, degraded defaults — renders through this
    // same sorted pipeline.
    const sortedElements = sortByZOrder(elements);

    // Render elements in z-order
    sortedElements.forEach((element) => {
      const isSelected = selectedElements.has(element.id);
      const isHovered = hoveredElement === element.id;
      renderElement(ctx, element, isSelected, isHovered, viewport.zoom);

      // Unit ticks + corridor line make buildings read as apartments
      if (element.type === 'building') {
        renderBuildingDetail(ctx, element, viewport.zoom);
      }

      // Stall dividers on parking (from the solver); the per-bay counts draw
      // in a pass of their own after every element, so a building drawn
      // later never covers a label.
      if (element.type === 'parking' || element.type === 'parking-bay') {
        renderParkingStripes(ctx, element, viewport.zoom);
      }

      // Name the drive on the sheet. Open-space areas are identified by the
      // legend only — floating mid-canvas labels read as clutter next to
      // TestFit's sheets.
      if (element.type === 'circulation' && element.name === 'Main Drive') {
        renderZoneLabel(ctx, element, viewport.zoom, 'Drive');
      }

      // Dimension callouts (width × depth) on the selected building
      if (isSelected && element.type === 'building') {
        renderDimensions(ctx, element, viewport.zoom);
      }

      // Selected buildings get square resize handles; other shapes keep
      // round vertex-editing handles.
      if (isSelected && element.type === 'building') {
        renderResizeHandles(ctx, element, viewport.zoom);
      } else if (isSelected) {
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

    // Existing contours over the plan, under every callout (a civil sheet
    // screens existing conditions across the whole drawing).
    renderTopo(ctx, viewport.zoom);

    // Per-bay stall counts over every element (a bay's label must never sit
    // under the building drawn after it); the held-out greenway is hatched and
    // named in the same pass so a lot or a street drawn later never hides it.
    for (const element of sortedElements) {
      if (element.type === 'parking' || element.type === 'parking-bay') {
        renderBayCount(ctx, element, viewport.zoom);
      }
      if (element.type === 'greenspace') {
        renderGreenwayCallout(ctx, element, viewport.zoom);
      }
    }

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

    // Lot numbers (dimensions when roomy), then the sheet callouts —
    // stations, grades, R.O.W. — on top of everything but the measure line.
    for (const element of sortedElements) {
      renderLotTag(ctx, element, viewport.zoom);
    }
    renderAnnotations(ctx, viewport.zoom);

    // Render measurement line
    if (measurementState?.isMeasuring && measurementState.startPoint && measurementState.endPoint) {
      renderMeasurement(ctx, measurementState.startPoint, measurementState.endPoint, viewport.zoom);
    }

    ctx.restore();

    // Screen-space chrome (after the world transform is popped)
    renderScaleBar(ctx, viewport.zoom, canvas.width / dpr, canvas.height / dpr);
    renderLegend(ctx, canvas.height / dpr, elements.some(e => e.type === 'other'));
    renderNorthArrow(ctx, canvas.width / dpr);
    renderTitleBlock(ctx, viewport.zoom, canvas.width / dpr);
    if (draftMode) {
      renderDraftWatermark(ctx, canvas.width / dpr, canvas.height / dpr);
    }
  }, [elements, selectedElements, viewport.zoom, viewport.panX, viewport.panY, processedGeometry, buildableEnvelope, isVertexEditing, selectedVertex, measurementState, gridState, hoveredElement, showLabels, draftMode, renderParcelBoundary, renderBuildableEnvelope, renderEdgeSetbacks, renderElement, renderBuildingDetail, renderBayCount, renderGreenwayCallout, renderDimensions, renderScaleBar, renderLegend, renderNorthArrow, renderDraftWatermark, renderNeighbors, renderLandscape, renderZoneLabel, renderParkingStripes, renderVertexHandles, renderResizeHandles, renderRotationHandle, renderGrid, renderMeasurement, renderElementLabel, renderTopo, renderAnnotations, renderLotTag, renderTitleBlock]);

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

  // Keep the backing store synchronized with every CSS layout change, not
  // only window resizes. The planner changes height when its responsive
  // columns stack, and fitting against the new container while drawing into
  // the old canvas size clips long parcels.
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


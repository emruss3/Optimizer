// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * AnnotationLayer: Annotations and measurements rendering layer
 * 
 * Renders measurement and annotation overlays on the site plan:
 * - Dimension callouts (width × depth) for selected buildings
 * - Edge setback classifications (front/side/rear with distances)
 * - Topographic contours with elevation labels
 * - Civil sheet annotations (stations, spot grades, R.O.W., etc.)
 * - Vertex editing handles
 * - Rotation handles
 * - Measurement tool overlays
 * 
 * These annotations are drawn over the base layers and elements.
 */

import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import type { ParcelTopoView } from '../../../features/site-plan/api/parcelTopo';
import type { SheetAnnotation } from '../../../features/site-plan/api/sheetAnnotations';
import { ElementService } from '../../../services/elementService';
import { metersToFeet } from '../../../engine/units';
import { edgeDimensions, setbackLabelIndices } from '../planRendering';
import { LINE_WEIGHT, LINE_STYLE, applyLineStyle } from '../rendering/lineWeights';

interface AnnotationLayerProps {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  elements: Element[];
  selectedElements: Set<string>;
  edgeClassifications?: EdgeClassification[];
  setbacks?: { front?: number; side?: number; rear?: number };
  topo?: ParcelTopoView | null;
  annotations?: SheetAnnotation[];
  isVertexEditing?: boolean;
  selectedVertex?: { elementId: string; vertexIndex: number } | null;
  measurementState?: { isMeasuring: boolean; startPoint: { x: number; y: number } | null; endPoint: { x: number; y: number } | null };
}

export function renderAnnotationLayer({
  ctx,
  zoom,
  elements,
  selectedElements,
  edgeClassifications,
  setbacks,
  topo,
  annotations = [],
  isVertexEditing = false,
  selectedVertex = null,
  measurementState,
}: AnnotationLayerProps): void {
  // Render topographic contours
  if (topo) {
    renderTopo(ctx, zoom, topo);
  }

  // Dimension callouts and handles for selected buildings
  elements.forEach((element) => {
    const isSelected = selectedElements.has(element.id);
    
    if (isSelected && element.type === 'building') {
      renderDimensions(ctx, element, zoom);
      renderResizeHandles(ctx, element, zoom);
    } else if (isSelected && element.type !== 'building') {
      renderVertexHandles(ctx, element, isSelected, isVertexEditing, selectedVertex, zoom);
    }

    // Render rotation handle if single element selected
    if (isSelected && selectedElements.size === 1) {
      const center = ElementService.calculateElementCenter(element);
      const bounds = ElementService.getElementBounds(element);
      const handleDistance = 30 / zoom;
      const handleX = center.x;
      const handleY = bounds.maxY + handleDistance;
      renderRotationHandle(ctx, center.x, center.y, handleX, handleY, zoom);
    }
  });

  // Color-coded front/side/rear edges with setback labels
  if (edgeClassifications && setbacks) {
    renderEdgeSetbacks(ctx, zoom, edgeClassifications, setbacks);
  }

  // Civil sheet annotations
  if (annotations.length > 0) {
    renderAnnotations(ctx, zoom, annotations);
  }

  // Render measurement line
  if (measurementState?.isMeasuring && measurementState.startPoint && measurementState.endPoint) {
    renderMeasurement(ctx, measurementState.startPoint, measurementState.endPoint, zoom);
  }
}

// Dimension callouts (width × depth in ft) for buildings
function renderDimensions(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
  const coords = element.geometry?.coordinates?.[0];
  if (!coords || coords.length < 4) return;

  const OFFSET_M = 12 / zoom + 2;
  const dims = edgeDimensions(coords, OFFSET_M);
  const fontSize = 12 / zoom;

  ctx.save();
  ctx.strokeStyle = '#64748B';
  ctx.fillStyle = '#334155';
  applyLineStyle(ctx, LINE_WEIGHT.DIMENSION, zoom);

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
}

// Edge setback rendering
function renderEdgeSetbacks(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  edgeClassifications: EdgeClassification[],
  setbacks: { front?: number; side?: number; rear?: number }
): void {
  if (!edgeClassifications || edgeClassifications.length === 0) return;
  const EDGE_COLORS: Record<string, string> = {
    front: '#2563EB',
    rear: '#D97706',
    side: '#64748B',
  };
  const fontSize = 10 / zoom;
  const labeled = setbackLabelIndices(edgeClassifications);

  ctx.save();
  for (let ei = 0; ei < edgeClassifications.length; ei++) {
    const edge = edgeClassifications[ei];
    const [[x1, y1], [x2, y2]] = edge.edge;
    ctx.strokeStyle = EDGE_COLORS[edge.type] ?? '#64748B';
    applyLineStyle(ctx, LINE_WEIGHT.SETBACK, zoom);
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
}

// Topographic contours
function renderTopo(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  topo: ParcelTopoView
): void {
  if (!topo || topo.contours.length === 0) return;
  const slope = Math.max(0.5, topo.meanSlopePct ?? 5);
  const minorPx = zoom * (100 / slope) * 0.3048;
  const drawMinor = minorPx >= 4;
  const labelIndex = minorPx * 5 >= 24;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of topo.contours) {
    if (!c.index && !drawMinor) continue;
    ctx.strokeStyle = c.index ? 'rgba(120, 72, 32, 0.55)' : 'rgba(120, 72, 32, 0.28)';
    applyLineStyle(ctx, c.index ? LINE_WEIGHT.DIMENSION : LINE_WEIGHT.DETAIL, zoom);
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
}

function polylineLength(line: number[][]): number {
  let L = 0;
  for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return L;
}

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

function uprightAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI / 2) r -= Math.PI;
  else if (r < -Math.PI / 2) r += Math.PI;
  return r;
}

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

// Civil sheet annotations
function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  annotations: SheetAnnotation[]
): void {
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
      applyLineStyle(ctx, LINE_WEIGHT.DIMENSION, zoom);
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
}

// Vertex editing handles
function renderVertexHandles(
  ctx: CanvasRenderingContext2D,
  element: Element,
  isSelected: boolean,
  isVertexEditing: boolean,
  selectedVertex: { elementId: string; vertexIndex: number } | null,
  zoom: number
): void {
  if (!isSelected) return;
  
  ctx.save();
  const coords = element.geometry.coordinates[0];
  
  coords.forEach(([x, y], index) => {
    const isSelectedVertex = isVertexEditing && selectedVertex?.elementId === element.id && selectedVertex.vertexIndex === index;
    
    ctx.fillStyle = isSelectedVertex ? '#EF4444' : '#3B82F6';
    ctx.strokeStyle = '#FFFFFF';
    applyLineStyle(ctx, LINE_WEIGHT.HANDLE, zoom);
    
    ctx.beginPath();
    ctx.arc(x, y, 5 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  
  ctx.restore();
}

// Resize handles for buildings
function renderResizeHandles(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
  const coords = element.geometry?.coordinates?.[0];
  if (!coords || coords.length !== 5) return; // rectangles only

  ctx.save();
  const size = 8 / zoom;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#3B82F6';
  applyLineStyle(ctx, LINE_WEIGHT.HANDLE, zoom);
  for (let i = 0; i < 4; i++) {
    const [x, y] = coords[i];
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Rotation handle
function renderRotationHandle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  handleX: number,
  handleY: number,
  zoom: number
): void {
  ctx.save();
  ctx.strokeStyle = '#3B82F6';
  ctx.fillStyle = '#FFFFFF';
  applyLineStyle(ctx, LINE_WEIGHT.HANDLE, zoom);
  
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
}

// Measurement line
function renderMeasurement(
  ctx: CanvasRenderingContext2D,
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  zoom: number
): void {
  if (!startPoint || !endPoint) return;

  ctx.save();
  ctx.strokeStyle = '#EF4444';
  applyLineStyle(ctx, LINE_WEIGHT.DIMENSION, zoom, LINE_STYLE.DIM_LEADER);

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

  // Draw distance label
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
  applyLineStyle(ctx, LINE_WEIGHT.DIMENSION, zoom);
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
}

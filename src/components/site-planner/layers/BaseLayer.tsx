// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * BaseLayer: Foundation rendering layer
 * 
 * Renders the base geometric elements that establish the site plan's structure:
 * - Parcel boundary (dashed stroke)
 * - Buildable envelope (subtle fill + dashed border)
 * - Grid (when enabled)
 * - Neighborhood context (neighbor parcels, buildings, streets)
 * - Landscape elements (perimeter strip, street trees, curb cut)
 * 
 * These elements are drawn first and provide the spatial context for all other layers.
 */

import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import { pointsAlongSegment, computeCurbCut } from '../planRendering';
import { feetToMeters } from '../../../engine/units';
import { LINE_WEIGHT, LINE_STYLE, applyLineStyle } from '../rendering/lineWeights';

interface BaseLayerProps {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  geometry: any;
  buildableEnvelope?: import('geojson').Polygon;
  gridState?: { enabled: boolean; size: number }; // size in meters
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  neighbors?: import('../../../features/site-plan/api/neighbors').PlannerNeighbors | null;
  edgeClassifications?: EdgeClassification[];
  elements: Element[];
  suppressCurbCut?: boolean;
}

export function renderBaseLayer({
  ctx,
  zoom,
  geometry,
  buildableEnvelope,
  gridState,
  bounds,
  neighbors,
  edgeClassifications,
  elements,
  suppressCurbCut,
}: BaseLayerProps): void {
  // Render grid
  if (gridState?.enabled && bounds) {
    renderGrid(ctx, bounds, gridState.size, zoom);
  }

  // Render buildable envelope (subtle background)
  if (buildableEnvelope) {
    renderBuildableEnvelope(ctx, buildableEnvelope, zoom);
  }

  // Neighborhood context (bottom of the stack)
  if (neighbors) {
    renderNeighbors(ctx, zoom, neighbors, bounds);
  }

  // Perimeter planting + street trees sit under the plan elements
  renderLandscape(ctx, zoom, geometry, edgeClassifications, elements, suppressCurbCut);
}

// Render parcel boundary (dashed stroke, no fill)
export function renderParcelBoundary(
  ctx: CanvasRenderingContext2D,
  geometry: any,
  zoom: number
): void {
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
  applyLineStyle(ctx, LINE_WEIGHT.PROPERTY, zoom, LINE_STYLE.PROPERTY);
  ctx.globalAlpha = 0.8;

  ctx.beginPath();
  ctx.moveTo(coords[0][0], coords[0][1]);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i][0], coords[i][1]);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// Render buildable envelope (subtle fill + dashed border)
function renderBuildableEnvelope(
  ctx: CanvasRenderingContext2D,
  envelope: import('geojson').Polygon,
  zoom: number
): void {
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
  ctx.globalAlpha = 0.5;
  applyLineStyle(ctx, LINE_WEIGHT.DIMENSION, zoom, LINE_STYLE.DASHED);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// Render grid
function renderGrid(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  gridSize: number,
  zoom: number
): void {
  ctx.save();
  ctx.strokeStyle = '#E5E7EB';
  applyLineStyle(ctx, LINE_WEIGHT.GRID, zoom);
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
}

// Render neighborhood context
function renderNeighbors(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  neighbors: import('../../../features/site-plan/api/neighbors').PlannerNeighbors,
  bounds?: { minX: number; minY: number; maxX: number; maxY: number }
): void {
  ctx.save();
  // Street casings first (widest, lightest). HONESTY GATE: the roads
  // dataset is a sparse OSM stub and the RPC's radius filter leaks —
  // segments from blocks away must not paint a street where none is
  // known. Only draw a road that actually approaches this parcel
  // (within ~120 m of its bounds); absent data renders as absence.
  const nearParcel = (coords: number[][]): boolean => {
    if (!bounds) return true;
    return coords.some(([x, y]) =>
      x > bounds.minX - 120 && x < bounds.maxX + 120 && y > bounds.minY - 120 && y < bounds.maxY + 120
    );
  };
  for (const road of neighbors.roads) {
    const coords = road.line.coordinates;
    if (!coords || coords.length < 2) continue;
    if (!nearParcel(coords)) continue;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.lineWidth = LINE_WEIGHT.CONTEXT_STREET; // metres — reads as a street body
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
    applyLineStyle(ctx, LINE_WEIGHT.CONTEXT_PARCEL, zoom);
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
    applyLineStyle(ctx, LINE_WEIGHT.CONTEXT_PARCEL, zoom);
    ctx.stroke();
  }
  ctx.restore();
}

// Perimeter landscape strip + street trees
function renderLandscape(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  geometry: any,
  edgeClassifications?: EdgeClassification[],
  elements?: Element[],
  suppressCurbCut?: boolean
): void {
  const parcelRing: number[][] | undefined = geometry?.coordinates?.[0];
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
  if (fronts.length && elements) {
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
  if (!suppressCurbCut && elements) {
    const mainDrive = 
      elements.find(e => e.type === 'circulation' && e.name === 'Main Drive')
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
        applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom);
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
  }
}

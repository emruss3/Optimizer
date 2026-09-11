// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * ElementLayer: Site plan elements rendering layer
 * 
 * Renders the primary site plan elements in z-order:
 * - Buildings with interior detail (unit layouts, floorplates)
 * - Parking areas with stall striping
 * - Greenspace zones
 * - Lots with tags
 * - Zone labels and callouts
 * 
 * Elements are sorted by z-order before rendering to ensure proper layering.
 */

import type { Element } from '../../../engine/types';
import { ElementService } from '../../../services/elementService';
import { feetToMeters, metersToFeet } from '../../../engine/units';
import { 
  computeUnitTicks, 
  longestEdgeAngle,
  townhomeSlices,
  sortByZOrder,
  corridorLine
} from '../planRendering';
import { computeFloorplate, UNIT_COLORS } from '../unitLayout';
import { LINE_WEIGHT, LINE_STYLE, applyLineStyle } from '../rendering/lineWeights';

interface ElementLayerProps {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  elements: Element[];
  selectedElements: Set<string>;
  hoveredElement: string | null;
  showLabels: boolean;
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number; aisleWidthFt?: number };
}

export function renderElementLayer({
  ctx,
  zoom,
  elements,
  selectedElements,
  hoveredElement,
  showLabels,
  parkingViz,
}: ElementLayerProps): void {
  // The z-order CONTRACT: every rendering path uses the same sorted pipeline
  const sortedElements = sortByZOrder(elements);

  // Render elements in z-order
  sortedElements.forEach((element) => {
    const isSelected = selectedElements.has(element.id);
    const isHovered = hoveredElement === element.id;
    renderElement(ctx, element, isSelected, isHovered, zoom);

    // Unit ticks + corridor line make buildings read as apartments
    if (element.type === 'building') {
      renderBuildingDetail(ctx, element, zoom);
    }

    // Stall dividers on parking (from the solver); the per-bay counts draw
    // in a pass of their own after every element, so a building drawn
    // later never covers a label.
    if (element.type === 'parking' || element.type === 'parking-bay') {
      renderParkingStripes(ctx, element, zoom, parkingViz);
    }

    // Name the drive on the sheet. Open-space areas are identified by the
    // legend only — floating mid-canvas labels read as clutter next to
    // TestFit's sheets.
    if (element.type === 'circulation' && element.name === 'Main Drive') {
      renderZoneLabel(ctx, element, zoom, 'Drive');
    }
  });

  // Per-bay stall counts over every element (a bay's label must never sit
  // under the building drawn after it); the held-out greenway is hatched and
  // named in the same pass so a lot or a street drawn later never hides it.
  for (const element of sortedElements) {
    if (element.type === 'parking' || element.type === 'parking-bay') {
      renderBayCount(ctx, element, zoom);
    }
    if (element.type === 'greenspace') {
      renderGreenwayCallout(ctx, element, zoom);
    }
  }

  // Render building labels on top of everything
  if (showLabels) {
    sortedElements.forEach((element) => {
      if (element.type === 'building') {
        renderElementLabel(ctx, element, zoom);
      }
    });
  }

  // Lot numbers (dimensions when roomy)
  for (const element of sortedElements) {
    renderLotTag(ctx, element, zoom);
  }
}

// Get element color, opacity, and stroke based on type
function getElementStyle(element: Element): { 
  color: string; 
  opacity: number; 
  stroke: boolean; 
  strokeColor?: string 
} {
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
}

// Render individual element
function renderElement(
  ctx: CanvasRenderingContext2D,
  element: Element,
  isSelected: boolean,
  isHovered: boolean,
  zoom: number
): void {
  const style = getElementStyle(element);
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
    // Buildings and lots get heavier strokes than other elements
    const weight = element.type === 'building' || element.type === 'other' 
      ? LINE_WEIGHT.BUILDING 
      : LINE_WEIGHT.DETAIL;
    applyLineStyle(ctx, isSelected ? weight * 1.5 : weight, zoom);
    ctx.globalAlpha = 1;
    ctx.stroke();
  }

  ctx.restore();
}

// Building interior detail
function renderBuildingDetail(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
  const coords = element.geometry?.coordinates?.[0];
  if (!coords || coords.length < 4) return;

  const UNIT_SPACING_M = feetToMeters(26); // ~typical unit module along the corridor
  // Skip when detail would be sub-3px noise
  if (UNIT_SPACING_M * zoom < 3) return;

  // TOWNHOME ROWS are not apartment floorplates
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
      // Party walls
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = LINE_WEIGHT.BUILDING / zoom;
      ctx.stroke();
      // Door ticks on both long edges
      ctx.strokeStyle = 'rgba(30,41,59,0.55)';
      ctx.lineWidth = LINE_WEIGHT.DETAIL / zoom;
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

      // Units with pale tint and demising walls
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
        applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom);
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
        applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom);
        ctx.beginPath();
        ctx.moveTo(core.ring[0][0], core.ring[0][1]);
        ctx.lineTo(core.ring[2][0], core.ring[2][1]);
        ctx.moveTo(core.ring[1][0], core.ring[1][1]);
        ctx.lineTo(core.ring[3][0], core.ring[3][1]);
        ctx.stroke();
      }

      // Unit-type tags
      if (feetToMeters(20) * zoom >= 14) {
        const fontSize = 9 / zoom;
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const u of plate.units) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const [x, y] of u.ring) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
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

      // Corridors
      for (const [a, b] of plate.corridors) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
        applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom, LINE_STYLE.DIM_LEADER);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }
  }

  // Fallback: generic unit ticks
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(coords[0][0], coords[0][1]);
  for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = 'rgba(30, 64, 175, 0.30)';
  applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom);
  for (const [[x1, y1], [x2, y2]] of computeUnitTicks(coords, UNIT_SPACING_M)) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const corridor = corridorLine(coords);
  if (corridor) {
    ctx.strokeStyle = 'rgba(30, 64, 175, 0.55)';
    applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom, LINE_STYLE.DIM_LEADER);
    ctx.beginPath();
    ctx.moveTo(corridor[0][0], corridor[0][1]);
    ctx.lineTo(corridor[1][0], corridor[1][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// Draw parking stall dividers
function renderParkingStripes(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number,
  parkingViz?: { angleDeg: number; stallWidthFt: number; stallDepthFt: number; aisleWidthFt?: number }
): void {
  if (element.type !== 'parking' && element.type !== 'parking-bay') return;
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

  // Clip to the band polygon
  ctx.beginPath();
  ctx.moveTo(coords[0][0], coords[0][1]);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i][0], coords[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  ctx.translate(centerX, centerY);
  ctx.rotate(angle);

  // Stall dividers
  ctx.strokeStyle = '#8494A6';
  ctx.lineWidth = Math.max(LINE_WEIGHT.DETAIL / zoom, 0.3);
  ctx.globalAlpha = 0.9;

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
        y += stallDepth + aisleW + stallDepth;
      } else if (y + 2 * stallDepth <= lmaxY + 1e-6) {
        rowBands.push([y + stallDepth, y + 2 * stallDepth]);
        y += 2 * stallDepth;
      } else {
        break;
      }
    }
  }

  const startX = Math.ceil(lminX / stallWidth) * stallWidth;
  for (const [y0, y1] of rowBands) {
    // Row edges
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
}

// Render element labels (building-only)
function renderElementLabel(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
  if (element.type !== 'building') return;

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

  // Declutter by ON-SCREEN size
  const screenW = (maxX - minX) * zoom;
  const screenH = (maxY - minY) * zoom;
  if (Math.min(screenW, screenH) < 18 || Math.max(screenW, screenH) < 40) return;
  const roomForDetail = screenW >= 90 && screenH >= 42;

  const fontSize = 14 / zoom;

  ctx.save();
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
}

// Zone label
function renderZoneLabel(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number,
  text: string
): void {
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
  // Only when the zone is big enough on screen
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
}

// Greenway callout
function renderGreenwayCallout(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
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

  // Hatch, clipped to the piece
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(coords[0][0], coords[0][1]);
  for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i][0], coords[i][1]);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = 'rgba(13, 148, 136, 0.5)';
  applyLineStyle(ctx, LINE_WEIGHT.DETAIL, zoom);
  const h = maxY - minY;
  const step = Math.max(8 / zoom, 2);
  for (let d = minX - h; d < maxX + h; d += step) {
    ctx.beginPath();
    ctx.moveTo(d, minY);
    ctx.lineTo(d + h, maxY);
    ctx.stroke();
  }
  ctx.restore();

  // Label when the piece is big enough
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
}

// Per-bay stall count
function renderBayCount(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
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

  // Screen-space room inside the bay
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
  ctx.scale(1, -1);
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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
}

// Lot tag
function renderLotTag(
  ctx: CanvasRenderingContext2D,
  element: Element,
  zoom: number
): void {
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
}

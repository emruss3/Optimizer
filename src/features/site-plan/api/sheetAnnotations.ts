/**
 * Civil-sheet annotations (2026-09-04): what a layout sheet writes on the
 * plan beyond the geometry — stations along each through-street, existing
 * grade at the stations, the right-of-way and alley widths, the cul-de-sac
 * radius. Built from the plan's own elements and the parcel topography; the
 * canvas draws them world-anchored with screen-sized text.
 */
import type { Position } from 'geojson';
import type { Element } from '../../../engine/types';
import { TopoGrid, line2274To3857, point2274To3857, stationLabel } from './parcelTopo';

export interface SheetAnnotation {
  kind: 'station' | 'spot' | 'label' | 'radius';
  /** canvas frame (EPSG:3857 metres) */
  x: number;
  y: number;
  text: string;
  /** text / tick direction in the canvas frame (radians, y up) */
  angle?: number;
  /** draw only when the viewport zoom (px per metre) is at least this */
  minZoom?: number;
  /** stations: the tick draws from minZoom, its text only from this zoom
   *  (100 ft is ~30 px at zoom 1 — the room a station label needs) */
  labelMinZoom?: number;
}

const STATION_FT = 100;
const SPOT_FT = 200;

function polylineLengthFt(coords: Position[]): number {
  let L = 0;
  for (let i = 1; i < coords.length; i++) L += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  return L;
}

/** Point and unit direction at a station along an EPSG:2274 polyline. */
function alongLine(coords: Position[], s: number): { p: Position; dir: Position } | null {
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= 0) continue;
    if (s <= acc + len + 1e-6 || i === coords.length - 1) {
      const t = Math.min(1, Math.max(0, (s - acc) / len));
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
    acc += len;
  }
  return null;
}

function longestEdgeAngle(ring: number[][]): number {
  let best = 0, bestLen = -1;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i][0] - ring[i - 1][0], dy = ring[i][1] - ring[i - 1][1];
    const len = dx * dx + dy * dy;
    if (len > bestLen) { bestLen = len; best = Math.atan2(dy, dx); }
  }
  return best;
}

function centroid(ring: number[][]): Position {
  let cx = 0, cy = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
  return [cx / n, cy / n];
}

/** Angle of a 2274 direction seen in the canvas frame (the grids differ by a
 *  small convergence, so measure it on the projected points). */
function canvasAngle(p2274: Position, dir: Position): number {
  const a = point2274To3857(p2274);
  const b = point2274To3857([p2274[0] + dir[0] * 10, p2274[1] + dir[1] * 10]);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

export function buildSheetAnnotations(elements: Element[], grid: TopoGrid | null): SheetAnnotation[] {
  const out: SheetAnnotation[] = [];
  let alleyLabels = 0;
  for (const el of elements) {
    const p = el.properties as Record<string, unknown> | undefined;
    if (!p) continue;
    if (el.type === 'circulation' && p.kind === 'through' && Array.isArray(p.centerline2274)) {
      const cl = p.centerline2274 as Position[];
      const L = polylineLengthFt(cl);
      if (L < 50) continue;
      // stations every 100 ft and the end; existing grade every 200 ft and at both ends
      const stations: number[] = [];
      for (let s = 0; s < L - 1; s += STATION_FT) stations.push(s);
      stations.push(L);
      for (const s of stations) {
        const at = alongLine(cl, s);
        if (!at) continue;
        const [x, y] = point2274To3857(at.p);
        const angle = canvasAngle(at.p, at.dir);
        out.push({ kind: 'station', x, y, text: stationLabel(s), angle, minZoom: 0.5, labelMinZoom: 1.0 });
        const wantSpot = s === 0 || s === L || Math.round(s) % SPOT_FT === 0;
        if (grid && wantSpot) {
          const z = grid.elevationAt(at.p[0], at.p[1]);
          if (z != null) out.push({ kind: 'spot', x, y, text: `EG ${z.toFixed(1)}`, angle, minZoom: 1.2 });
        }
      }
      // the right-of-way label along the street, near its middle but between
      // two station ticks (50 ft off the station grid) so it hides neither
      const midS = Math.min(Math.max(50, Math.round((L / 2 - 50) / STATION_FT) * STATION_FT + 50), L - 50);
      const mid = alongLine(cl, midS);
      if (mid) {
        const [x, y] = point2274To3857(mid.p);
        const width = typeof p.widthFt === 'number' ? `${Math.round(p.widthFt)}' PUBLIC R.O.W.` : 'PUBLIC R.O.W.';
        out.push({ kind: 'label', x, y, text: `${String(el.name ?? 'STREET').toUpperCase()} · ${width}`, angle: canvasAngle(mid.p, mid.dir), minZoom: 0.3 });
      }
    } else if (el.type === 'circulation' && p.kind === 'cul_de_sac') {
      const ring = el.geometry?.coordinates?.[0];
      if (!ring || ring.length < 4) continue;
      const [x, y] = centroid(ring);
      out.push({ kind: 'radius', x, y, text: "R = 50'", minZoom: 1.0 });
    } else if (el.type === 'circulation' && p.kind === 'alley' && alleyLabels < 4) {
      const ring = el.geometry?.coordinates?.[0];
      const area = typeof p.areaSqFt === 'number' ? p.areaSqFt : 0;
      if (!ring || ring.length < 4 || area < 6000) continue;
      const [x, y] = centroid(ring);
      const width = typeof p.widthFt === 'number' ? `${Math.round(p.widthFt)}' ` : '';
      out.push({ kind: 'label', x, y, text: `${width}ALLEY`, angle: longestEdgeAngle(ring), minZoom: 1.2 });
      alleyLabels += 1;
    }
  }
  return out;
}

/** The centreline of a through-street in the canvas frame, for drawing. */
export function streetCenterline3857(el: Element): Position[] | null {
  const cl = (el.properties as Record<string, unknown> | undefined)?.centerline2274;
  if (!Array.isArray(cl) || cl.length < 2) return null;
  try { return line2274To3857(cl as Position[]); } catch { return null; }
}

/**
 * The title block: what a sheet says about itself in its corner — the
 * project, the sheet title, the basis of every line on it (which DEM, which
 * hazard layers, what is concept geometry), the date. The canvas adds the
 * on-screen scale and the "not for construction" line.
 */
export interface SheetTitleBlock {
  project: string;
  title: string;
  subtitle: string | null;
  notes: string[];
  /** ISO date (YYYY-MM-DD) */
  date: string;
}

export interface SheetTitleBlockInput {
  address?: string | null;
  parcelId?: string | number | null;
  zoning?: string | null;
  acres?: number | null;
  /** the subdivision the server drew, when the plan is one */
  subdivision?: {
    lots: number;
    network: string;
    pctRow: number | null;
    pctHazard: number | null;
    hazardCoverage: string | null;
    crossingFt: number | null;
  } | null;
  /** a massing plan is on the canvas (buildings / parking) */
  hasPlan: boolean;
  topo?: {
    source: string;
    spacingFt: number;
    zMinFt: number | null;
    zMaxFt: number | null;
    meanSlopePct: number | null;
    maxSlopePct: number | null;
  } | null;
  date?: Date;
}

const fmt1 = (v: number | null | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '?');

export function buildSheetTitleBlock(input: SheetTitleBlockInput): SheetTitleBlock {
  const { subdivision, topo } = input;
  const project = (input.address && input.address.trim()) || (input.parcelId != null ? `Parcel ${input.parcelId}` : 'Parcel');
  const title = subdivision ? 'CONCEPT LAYOUT PLAN' : input.hasPlan ? 'CONCEPT SITE PLAN' : 'EXISTING CONDITIONS';
  const sub: string[] = [];
  if (input.zoning) sub.push(String(input.zoning));
  if (typeof input.acres === 'number' && input.acres > 0) sub.push(`${input.acres >= 10 ? input.acres.toFixed(1) : input.acres.toFixed(2)} ac`);
  if (subdivision) {
    sub.push(`${subdivision.lots} lots`);
    sub.push(`${subdivision.network} network`);
    if (typeof subdivision.pctRow === 'number') sub.push(`${subdivision.pctRow}% R.O.W.`);
  }
  // Terse: the block sits on the canvas, so each note is one short line; the
  // long form lives in the Profile tab and the audit.
  const notes: string[] = [];
  if (topo) {
    const src = topo.source.replace(/\s*\(.*$/, '');
    notes.push(`Contours: ${src} · 1-ft interval (index 5 ft) · NAVD88 · ${topo.spacingFt}-ft grid`);
    const parts: string[] = [];
    if (topo.zMinFt != null && topo.zMaxFt != null) parts.push(`Elev ${fmt1(topo.zMinFt)}–${fmt1(topo.zMaxFt)} ft`);
    if (topo.meanSlopePct != null) parts.push(`mean slope ${fmt1(topo.meanSlopePct)}%${topo.maxSlopePct != null ? ` (max ${fmt1(topo.maxSlopePct)}%)` : ''}`);
    if (parts.length) notes.push(parts.join(' · '));
  } else {
    notes.push('Contours: not available (USGS 3DEP not reached for this parcel)');
  }
  if (subdivision) {
    if (subdivision.hazardCoverage === 'ingested') {
      const held = typeof subdivision.pctHazard === 'number' ? ` · ${subdivision.pctHazard}% held out` : '';
      notes.push(`Greenway: FEMA NFHL SFHA + USFWS NWI (25-ft buffer)${held}`);
    } else {
      notes.push('Hazard tiles not ingested here — parcel-level FEMA fraction only');
    }
    if (typeof subdivision.crossingFt === 'number' && subdivision.crossingFt > 0) {
      notes.push(`${subdivision.crossingFt}-ft crossing of held-out land: culvert / bridge to price`);
    }
    notes.push('Concept geometry from the parcel record — not a survey · existing grade only, no design profile');
  } else if (input.hasPlan) {
    notes.push('Concept massing from the parcel record — not a survey · existing grade only, no design profile');
  }
  const d = input.date ?? new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { project, title, subtitle: sub.length ? sub.join(' · ') : null, notes, date };
}

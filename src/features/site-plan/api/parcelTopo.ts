/**
 * Parcel topography (fn_parcel_topo, 2026-09-04). USGS 3DEP 1-m elevations,
 * sampled by the database on a 20-ft grid over the parcel and a 100-ft
 * margin (EPSG:2274, NAVD88 feet) and cached as a raster; served as 1-ft
 * contours (index every 5 ft), the sample grid, and slope statistics.
 *
 * Eric, 2026-09-04: "This should look like a full civil set with elevations,
 * etc." Everything here is display and profiling; every elevation is the
 * DEM's own value, never estimated.
 */
import type { LineString, MultiLineString, Position } from 'geojson';
import { supabase } from '../../../lib/supabase';
import { feature4326To3857 } from '../../../utils/reproject';
import { geom2274To4326 } from '../../../utils/tnStatePlane';

export interface TopoContour {
  elevation_ft: number;
  /** every 5 ft — drawn heavier and labelled */
  index: boolean;
  geom_2274: LineString | MultiLineString | { type: string; coordinates: unknown };
}

export interface TopoGridSpec {
  /** EPSG:2274 feet; x = origin_x + col·spacing, y = origin_y − row·spacing */
  origin_x: number;
  origin_y: number;
  cols: number;
  rows: number;
  spacing_ft: number;
}

export interface ParcelTopo {
  parcel_ogc_fid: number;
  source?: string;
  datum?: string;
  units?: string;
  fetched_at?: string;
  spacing_ft: number;
  n_samples?: number;
  grid: TopoGridSpec;
  z_min_ft?: number | null;
  z_max_ft?: number | null;
  mean_slope_pct?: number | null;
  max_slope_pct?: number | null;
  contour_interval_ft?: number;
  index_interval_ft?: number;
  contours: TopoContour[];
  /** [col, row, elevation_ft] for every sampled cell */
  samples: Array<[number, number, number]>;
  error?: string;
}

/** A contour in the canvas frame (EPSG:3857 metres): one or more polylines. */
export interface CanvasContour {
  elevationFt: number;
  index: boolean;
  lines: number[][][];
}

export interface ParcelTopoView {
  topo: ParcelTopo;
  contours: CanvasContour[];
  zMinFt: number | null;
  zMaxFt: number | null;
  meanSlopePct: number | null;
  maxSlopePct: number | null;
  source: string;
}

const cache = new Map<number, Promise<ParcelTopo | null>>();

/** Fail-soft: null when the service, the DEM, or the RPC is unavailable. The
 *  first call for a parcel makes the database fetch the DEM (tens of seconds);
 *  later calls read the cache. */
export function fetchParcelTopo(ogcFid: number): Promise<ParcelTopo | null> {
  const hit = cache.get(ogcFid);
  if (hit) return hit;
  const p = (async (): Promise<ParcelTopo | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc('fn_parcel_topo', { p_ogc_fid: ogcFid });
      if (error) {
        console.warn('[parcelTopo] RPC failed:', error.message ?? error);
        return null;
      }
      const t = data as ParcelTopo | null;
      if (!t || t.error || !t.grid || !Array.isArray(t.samples) || !Array.isArray(t.contours)) {
        if (t?.error) console.info('[parcelTopo] unavailable:', t.error);
        return null;
      }
      return t;
    } catch (err) {
      console.warn('[parcelTopo] RPC threw:', err);
      return null;
    }
  })();
  cache.set(ogcFid, p);
  p.then(v => { if (!v) cache.delete(ogcFid); }).catch(() => cache.delete(ogcFid));
  return p;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** EPSG:2274 point → canvas frame (EPSG:3857 metres). */
export function point2274To3857(p: Position): Position {
  const g = feature4326To3857(geom2274To4326({ type: 'Point', coordinates: p }) as never) as { coordinates: Position };
  return g.coordinates;
}

/** EPSG:2274 polyline → canvas frame. */
export function line2274To3857(coords: Position[]): Position[] {
  const g = feature4326To3857(geom2274To4326({ type: 'LineString', coordinates: coords }) as never) as { coordinates: Position[] };
  return g.coordinates;
}

/** The contours in the canvas frame — LineString and MultiLineString pieces only. */
export function contoursToCanvas(topo: ParcelTopo): CanvasContour[] {
  const out: CanvasContour[] = [];
  for (const c of topo.contours ?? []) {
    const g = c.geom_2274 as { type?: string; coordinates?: unknown } | null;
    if (!g || !g.type) continue;
    const parts: Position[][] =
      g.type === 'LineString' ? [g.coordinates as Position[]]
      : g.type === 'MultiLineString' ? (g.coordinates as Position[][])
      : [];
    const lines: number[][][] = [];
    for (const part of parts) {
      if (!Array.isArray(part) || part.length < 2) continue;
      try { lines.push(line2274To3857(part)); } catch { /* one bad piece never sinks the layer */ }
    }
    if (lines.length === 0) continue;
    out.push({ elevationFt: c.elevation_ft, index: !!c.index, lines });
  }
  return out;
}

export function topoView(topo: ParcelTopo): ParcelTopoView {
  return {
    topo,
    contours: contoursToCanvas(topo),
    zMinFt: num(topo.z_min_ft),
    zMaxFt: num(topo.z_max_ft),
    meanSlopePct: num(topo.mean_slope_pct),
    maxSlopePct: num(topo.max_slope_pct),
    source: topo.source ?? 'USGS 3DEP 1 m DEM',
  };
}

/**
 * The sample grid as a lookup, with bilinear interpolation for profiles and
 * spot grades. Cells outside the sampled margin are absent; a point with no
 * sampled corner around it reads null rather than a made-up number.
 */
export class TopoGrid {
  private readonly z = new Map<number, number>();
  readonly spec: TopoGridSpec;

  constructor(readonly topo: ParcelTopo) {
    this.spec = topo.grid;
    for (const s of topo.samples ?? []) {
      if (!Array.isArray(s) || s.length < 3) continue;
      const [c, r, v] = s;
      if (typeof c === 'number' && typeof r === 'number' && typeof v === 'number' && Number.isFinite(v)) {
        this.z.set(r * this.spec.cols + c, v);
      }
    }
  }

  get size(): number { return this.z.size; }

  at(col: number, row: number): number | undefined {
    if (col < 0 || row < 0 || col >= this.spec.cols || row >= this.spec.rows) return undefined;
    return this.z.get(row * this.spec.cols + col);
  }

  /** Elevation (ft) at an EPSG:2274 point: bilinear on the four cells around it,
   *  the nearest sampled corner when a cell is missing, null when none is. */
  elevationAt(x: number, y: number): number | null {
    const { origin_x, origin_y, spacing_ft: s } = this.spec;
    const fc = (x - origin_x) / s;
    const fr = (origin_y - y) / s;
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    const tx = fc - c0;
    const ty = fr - r0;
    const z00 = this.at(c0, r0), z10 = this.at(c0 + 1, r0), z01 = this.at(c0, r0 + 1), z11 = this.at(c0 + 1, r0 + 1);
    if (z00 != null && z10 != null && z01 != null && z11 != null) {
      const top = z00 * (1 - tx) + z10 * tx;
      const bottom = z01 * (1 - tx) + z11 * tx;
      return Math.round((top * (1 - ty) + bottom * ty) * 10) / 10;
    }
    const corners: Array<[number | undefined, number]> = [
      [z00, tx * tx + ty * ty], [z10, (1 - tx) * (1 - tx) + ty * ty],
      [z01, tx * tx + (1 - ty) * (1 - ty)], [z11, (1 - tx) * (1 - tx) + (1 - ty) * (1 - ty)],
    ];
    let best: number | null = null;
    let bestD = Infinity;
    for (const [v, d] of corners) {
      if (v != null && d < bestD) { best = v; bestD = d; }
    }
    return best == null ? null : Math.round(best * 10) / 10;
  }
}

export interface ProfilePoint {
  stationFt: number;
  /** EPSG:2274 */
  x: number;
  y: number;
  zFt: number;
}

/** Existing grade along an EPSG:2274 polyline, a sample every `stepFt` and at the end. */
export function profileAlong(grid: TopoGrid, coords: Position[], stepFt = 25): ProfilePoint[] {
  if (!coords || coords.length < 2) return [];
  const segs: Array<{ a: Position; b: Position; len: number; start: number }> = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= 0) continue;
    segs.push({ a, b, len, start: total });
    total += len;
  }
  if (total <= 0) return [];
  const stations: number[] = [];
  for (let s = 0; s < total; s += stepFt) stations.push(s);
  stations.push(total);
  const out: ProfilePoint[] = [];
  let si = 0;
  for (const s of stations) {
    while (si < segs.length - 1 && s > segs[si].start + segs[si].len) si++;
    const seg = segs[si];
    const t = seg.len > 0 ? Math.min(1, Math.max(0, (s - seg.start) / seg.len)) : 0;
    const x = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
    const y = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
    const z = grid.elevationAt(x, y);
    if (z == null) continue;
    out.push({ stationFt: Math.round(s * 10) / 10, x, y, zFt: z });
  }
  return out;
}

/** 1250 → "12+50", the civil station format. */
export function stationLabel(ft: number): string {
  const whole = Math.floor(ft / 100);
  const rem = Math.round(ft - whole * 100);
  if (rem === 100) return `${whole + 1}+00`;
  return `${whole}+${String(rem).padStart(2, '0')}`;
}

// The real ground under the model: the parcel's sampled elevations (USGS 3DEP,
// a 20 ft grid over the parcel and a 100 ft margin, NAVD88 feet) as a surface
// the model's flat parts are laid over and its buildings are seated on.
//
// Inside the sampled grid the height is the samples' own, interpolated. A cell
// the survey left out takes its nearest sampled neighbour. Past the grid there
// is no data: the edge height is held and eased to one level over a short
// distance, and that is said in the job file. Nothing here is a design grade.
import * as THREE from 'three';
import type { ParcelTopo } from '../api/parcelTopo';
import type { MassingData } from '../ui/massingData';
import { convexHull } from '../ui/renderModel';
import { FT } from './shots';

/** How far past the sampled grid the ground eases to one level, metres. */
export const EASE_M = 60;

export interface Terrain {
  /** Ground height at a point of the model, metres above the model's zero. */
  heightAt(x: number, y: number): number;
  /** How far a point lies outside the sampled grid, metres; 0 inside. */
  outside(x: number, y: number): number;
  /** The elevation of the model's zero, NAVD88 feet. */
  zeroFt: number;
  /** Elevation at a point, NAVD88 feet. */
  elevationFt(x: number, y: number): number;
  source: string;
  samples: number;
  /** Lowest and highest sampled elevation, feet. */
  rangeFt: [number, number];
}

/**
 * `toModel` takes a point of the survey's own frame (EPSG:2274 feet) to the
 * model's east and north, metres. Over a site the two frames differ by a turn,
 * a shift and a scale, so three corners of the grid fix the way back.
 */
export function makeTerrain(topo: ParcelTopo, toModel: (p: [number, number]) => [number, number]): Terrain | null {
  const { cols, rows, origin_x, origin_y, spacing_ft: s } = topo.grid;
  if (!(cols > 1 && rows > 1 && s > 0) || !topo.samples?.length) return null;
  const z = new Float64Array(cols * rows).fill(NaN);
  let lo = Infinity, hi = -Infinity, n = 0, sum = 0;
  for (const smp of topo.samples) {
    const [c, r, v] = smp;
    if (!(c >= 0 && r >= 0 && c < cols && r < rows) || !Number.isFinite(v)) continue;
    z[r * cols + c] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; n++;
  }
  if (n < 4) return null;
  // a cell the survey left out takes its nearest sampled neighbour, ring by ring
  let frontier: number[] = [];
  for (let i = 0; i < z.length; i++) if (!Number.isNaN(z[i]!)) frontier.push(i);
  const filled = new Uint8Array(z.length);
  frontier.forEach(i => { filled[i] = 1; });
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const c = i % cols, r = (i - c) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (filled[j]) continue;
        filled[j] = 1; z[j] = z[i]!; next.push(j);
      }
    }
    frontier = next;
  }
  const level = sum / n;

  // model point to grid column and row: the inverse of the map fixed by three corners
  const o = toModel([origin_x, origin_y]);
  const ex = toModel([origin_x + s * (cols - 1), origin_y]);
  const ey = toModel([origin_x, origin_y - s * (rows - 1)]);
  const ax = (ex[0] - o[0]) / (cols - 1), ay = (ex[1] - o[1]) / (cols - 1);   // one column, in model metres
  const bx = (ey[0] - o[0]) / (rows - 1), by = (ey[1] - o[1]) / (rows - 1);   // one row
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-9) return null;
  const cell = Math.hypot(ax, ay);
  const grid = (x: number, y: number): [number, number] => {
    const dx = x - o[0], dy = y - o[1];
    return [(dx * by - dy * bx) / det, (dy * ax - dx * ay) / det];
  };
  const outside = (x: number, y: number): number => {
    const [c, r] = grid(x, y);
    const oc = c < 0 ? -c : c > cols - 1 ? c - (cols - 1) : 0;
    const or = r < 0 ? -r : r > rows - 1 ? r - (rows - 1) : 0;
    return Math.hypot(oc, or) * cell;
  };
  const raw = (x: number, y: number): number => {
    const [gc, gr] = grid(x, y);
    const c = Math.min(cols - 1, Math.max(0, gc)), r = Math.min(rows - 1, Math.max(0, gr));
    const c0 = Math.min(cols - 2, Math.floor(c)), r0 = Math.min(rows - 2, Math.floor(r));
    const tx = c - c0, ty = r - r0;
    const at = (cc: number, rr: number) => z[rr * cols + cc]!;
    const held = (at(c0, r0) * (1 - tx) + at(c0 + 1, r0) * tx) * (1 - ty) + (at(c0, r0 + 1) * (1 - tx) + at(c0 + 1, r0 + 1) * tx) * ty;
    const d = outside(x, y);
    if (d <= 0) return held;
    const t = Math.min(1, d / EASE_M), k = t * t * (3 - 2 * t);
    return held * (1 - k) + level * k;
  };
  const zeroFt = Math.round(raw(0, 0) * 10) / 10;
  return {
    heightAt: (x, y) => (raw(x, y) - zeroFt) * FT,
    elevationFt: (x, y) => raw(x, y),
    outside,
    zeroFt,
    source: topo.source ?? 'sampled elevations',
    samples: n,
    rangeFt: [lo, hi],
  };
}

/** Raise a whole piece by one amount: a building, a car. */
export function lift(g: THREE.BufferGeometry, dz: number): THREE.BufferGeometry {
  const out = g.clone();
  out.translate(0, 0, dz);
  return out;
}

/** The side of one square of the shared ground lattice, metres. */
export const LATTICE_M = 3;

/**
 * The ground as every laid piece sees it: flat triangles on one fixed lattice,
 * two to a square, their corners on the surveyed surface. Because all pieces
 * share these triangles, a road laid an inch above a lawn stays an inch above
 * it everywhere, however the two were cut.
 */
export function latticeHeight(terrain: Terrain, x: number, y: number, d = LATTICE_M, cache?: Map<number, number>): number {
  const i = Math.floor(x / d), j = Math.floor(y / d);
  const u = x / d - i, v = y / d - j;
  const node = (a: number, b: number): number => {
    if (!cache) return terrain.heightAt(a * d, b * d);
    const key = a * 2_000_003 + b;
    let h = cache.get(key);
    if (h === undefined) { h = terrain.heightAt(a * d, b * d); cache.set(key, h); }
    return h;
  };
  if (u + v <= 1) { const h00 = node(i, j); return h00 + u * (node(i + 1, j) - h00) + v * (node(i, j + 1) - h00); }
  const h11 = node(i + 1, j + 1);
  return h11 + (1 - u) * (node(i, j + 1) - h11) + (1 - v) * (node(i + 1, j) - h11);
}

/**
 * Lay a piece over the ground: every point rises by the ground under it. Faces
 * are first cut along the lattice's lines, so each cut face lies on one flat
 * triangle of the ground. Past the easing distance the ground is level and
 * nothing is cut.
 */
export function drape(g: THREE.BufferGeometry, terrain: Terrain, d = LATTICE_M): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const names = Object.keys(src.attributes);
  const sizes = names.map(nm => (src.getAttribute(nm) as THREE.BufferAttribute).itemSize);
  const pos = src.getAttribute('position');
  const pOff = names.slice(0, names.indexOf('position')).reduce((a, _n, k) => a + sizes[k]!, 0);
  const row = (i: number): number[] => {
    const out: number[] = [];
    names.forEach((nm, k) => {
      const a = src.getAttribute(nm) as THREE.BufferAttribute;
      for (let c = 0; c < sizes[k]!; c++) out.push(a.getComponent(i, c));
    });
    return out;
  };
  const X = (r: number[]) => r[pOff]!, Y = (r: number[]) => r[pOff + 1]!;
  const reach = EASE_M + d * 2;
  const near = (t: number[][]): boolean => {
    const xs = t.map(X), ys = t.map(Y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return terrain.outside((x0 + x1) / 2, (y0 + y1) / 2) < Math.hypot(x1 - x0, y1 - y0) / 2 + reach;
  };
  // cut a convex face by every line f = k * d it crosses
  const slice = (polys: number[][][], f: (r: number[]) => number): number[][][] => {
    const out: number[][][] = [];
    for (const poly of polys) {
      const vals = poly.map(f);
      const lo = Math.floor(Math.min(...vals) / d + 1e-9), hi = Math.ceil(Math.max(...vals) / d - 1e-9);
      let cur = poly;
      for (let k = lo + 1; k < hi && cur.length >= 3; k++) {
        const c = k * d, below: number[][] = [], above: number[][] = [];
        for (let i = 0; i < cur.length; i++) {
          const a = cur[i]!, b = cur[(i + 1) % cur.length]!;
          const fa = f(a) - c, fb = f(b) - c;
          if (fa <= 0) below.push(a);
          if (fa >= 0) above.push(a);
          if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
            const t = fa / (fa - fb);
            const m = a.map((v, q) => v + (b[q]! - v) * t);
            below.push(m); above.push(m);
          }
        }
        if (below.length >= 3) out.push(below);
        cur = above;
      }
      if (cur.length >= 3) out.push(cur);
    }
    return out;
  };
  const done: number[][] = [];
  // a very large face (the ground is two triangles a few miles across) is halved until its pieces are
  // either small or wholly out in the level far field; only the near pieces are cut along the lattice
  const len = (p0: number[], p1: number[]) => Math.hypot(X(p0) - X(p1), Y(p0) - Y(p1), p0[pOff + 2]! - p1[pOff + 2]!);
  const stack: number[][][] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) stack.push([row(i), row(i + 1), row(i + 2)]);
  while (stack.length) {
    const tri = stack.pop()!;
    if (!near(tri)) { done.push(...tri); continue; }
    const e = [len(tri[0]!, tri[1]!), len(tri[1]!, tri[2]!), len(tri[2]!, tri[0]!)];
    const longest = e[0]! >= e[1]! && e[0]! >= e[2]! ? 0 : e[1]! >= e[2]! ? 1 : 2;
    if (e[longest]! > d * 6) {
      const p0 = tri[longest]!, p1 = tri[(longest + 1) % 3]!, p2 = tri[(longest + 2) % 3]!;
      const m = p0.map((v, q) => (v + p1[q]!) / 2);
      stack.push([p0, m, p2], [m, p1, p2]);
      continue;
    }
    for (const poly of slice(slice(slice([tri], X), Y), r => X(r) + Y(r))) {
      for (let k = 1; k + 1 < poly.length; k++) done.push(poly[0]!, poly[k]!, poly[k + 1]!);
    }
  }

  const out = new THREE.BufferGeometry();
  let off = 0;
  names.forEach((nm, k) => {
    const a = src.getAttribute(nm) as THREE.BufferAttribute;
    const size = sizes[k]!;
    const Ctor = a.array.constructor as new (n: number) => THREE.TypedArray;
    const attr = new THREE.BufferAttribute(new Ctor(done.length * size), size, a.normalized);
    for (let i = 0; i < done.length; i++) for (let c = 0; c < size; c++) attr.setComponent(i, c, done[i]![off + c]!);
    out.setAttribute(nm, attr);
    off += size;
  });
  const p = out.getAttribute('position'), nrm = out.getAttribute('normal');
  const nodes = new Map<number, number>();
  const h = 0.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) + latticeHeight(terrain, x, y, d, nodes));
    // a face that lay flat now leans with the ground; walls and kerb faces keep their own
    if (nrm && nrm.getZ(i) > 0.9) {
      const gx = (terrain.heightAt(x + h, y) - terrain.heightAt(x - h, y)) / (2 * h);
      const gy = (terrain.heightAt(x, y + h) - terrain.heightAt(x, y - h)) / (2 * h);
      const l = Math.hypot(gx, gy, 1);
      nrm.setXYZ(i, -gx / l, -gy / l, 1 / l);
    }
  }
  src.dispose();
  return out;
}

/** How far round the graded work the ground is eased back to the existing ground, metres. */
export const GRADE_RUN_M = 12;
/** How far round a building the graded surface is eased to its level pad, metres. */
export const PAD_RUN_M = 5;
/** The steepest the graded paved area may be. */
export const GRADE_MAX = 0.04;

export interface Grade {
  /** The ground the scene stands on: the survey, graded where the work is. */
  terrain: Terrain;
  /** Each building's level pad, metres above the model's zero. */
  pads: Map<string, number>;
  /** The same, for a reader: elevations in feet, and the cut and fill at each pad. */
  padList: Array<{ building: string; pad_elevation_ft: number; lowest_ground_ft: number; highest_ground_ft: number; deepest_cut_ft: number; deepest_fill_ft: number }>;
  grading: { rule: string; existing_slope_pct: number; graded_slope_pct: number; deepest_cut_ft: number; deepest_fill_ft: number } | null;
}

/** Shared grading inputs for the section, interactive model and render export. */
export function gradeMassingSite(data: MassingData): Grade | null {
  if (!data.terrain) return null;
  const footprints = new Map<string, Array<[number, number]>>();
  for (const slab of data.slabs) {
    if (slab.part === 'detail') continue;
    const points = footprints.get(slab.id) ?? [];
    for (const p of slab.polygon[0] ?? []) points.push([p[0] ?? 0, p[1] ?? 0]);
    footprints.set(slab.id, points);
  }
  const buildings = [...footprints]
    .map(([id, points]) => ({ id: String(id), ring: convexHull(points) }))
    .filter(b => b.ring.length >= 3);
  const paved = data.polygons
    .filter(q => !q.building && ['drive', 'parking-aisle', 'circulation', 'parking', 'parking-bay', 'driveway'].includes(q.kind ?? ''))
    .map(q => (q.polygon[0] ?? []).map(v => [v[0] ?? 0, v[1] ?? 0] as [number, number]))
    .filter(r => r.length >= 3);
  return gradeSite(data.terrain, buildings, paved, data.structures ?? []);
}

/** Whether a point lies inside a ring. */
export function within(x: number, y: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** How far a point is outside a ring, metres; 0 inside it. */
export function awayFrom(x: number, y: number, ring: Array<[number, number]>): number {
  if (within(x, y, ring)) return 0;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!, b = ring[i]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)));
  }
  return best;
}

/**
 * What a developer does with the ground, assumed for a picture and not a
 * grading plan: the paved area and the buildings stand on one even surface
 * fitted to the existing ground, no steeper than GRADE_MAX; each building's pad
 * is level on it; and the graded ground is eased back to the existing ground
 * over a short run round the work.
 */
export function gradeSite(survey: Terrain, buildings: Array<{ id: string; ring: Array<[number, number]> }>, paved: Array<Array<[number, number]>>, structures: string[][] = []): Grade {
  const el = (v: number) => Math.round((survey.zeroFt + v / FT) * 10) / 10;
  const tenth = (v: number) => Math.round((v / FT) * 10) / 10;
  const under = buildings.map(b => {
    const xs = b.ring.map(q => q[0]), ys = b.ring.map(q => q[1]);
    const hs: number[] = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2) if (within(x, y, b.ring)) hs.push(survey.heightAt(x, y));
    if (!hs.length) hs.push(survey.heightAt(xs.reduce((a, v) => a + v, 0) / xs.length, ys.reduce((a, v) => a + v, 0) / ys.length));
    return { low: Math.min(...hs), high: Math.max(...hs) };
  });
  const work = [...paved, ...buildings.map(b => b.ring)].filter(r => r.length >= 3);
  const pads = new Map<string, number>();
  if (!work.length) return { terrain: survey, pads, padList: [], grading: null };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of work) for (const q of r) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const pts: Array<[number, number, number]> = [];
  for (let x = x0; x <= x1; x += 2) for (let y = y0; y <= y1; y += 2) if (work.some(r => within(x, y, r))) pts.push([x, y, survey.heightAt(x, y)]);
  if (pts.length < 3) return { terrain: survey, pads, padList: [], grading: null };
  const n = pts.length;
  const mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n, mz = pts.reduce((a, q) => a + q[2], 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const q of pts) { const dx = q[0] - mx, dy = q[1] - my, dz = q[2] - mz; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz; }
  const det = sxx * syy - sxy * sxy;
  let a = Math.abs(det) > 1e-6 ? (sxz * syy - syz * sxy) / det : 0, b = Math.abs(det) > 1e-6 ? (syz * sxx - sxz * sxy) / det : 0;
  const natural = Math.hypot(a, b);
  if (natural > GRADE_MAX) { a *= GRADE_MAX / natural; b *= GRADE_MAX / natural; }
  const plane = (x: number, y: number) => mz + a * (x - mx) + b * (y - my);
  let cut = 0, fill = 0;
  for (const q of pts) { const dz = q[2] - plane(q[0], q[1]); cut = Math.max(cut, dz); fill = Math.max(fill, -dz); }
  const level = buildings.map(bd => plane(bd.ring.reduce((t, q) => t + q[0], 0) / bd.ring.length, bd.ring.reduce((t, q) => t + q[1], 0) / bd.ring.length));
  // The parts of one structure stand on one floor level: the bars of a wrap and the garage they
  // stand round. Each group takes the level of the fitted surface at its middle, so one building
  // does not step with the ground from bar to bar.
  for (const ids of structures) {
    const list = buildings.map((bd, i) => (ids.includes(bd.id) ? i : -1)).filter(i => i >= 0);
    if (list.length < 2) continue;
    const all = list.flatMap(i => buildings[i]!.ring);
    const shared = plane(all.reduce((t, q) => t + q[0], 0) / all.length, all.reduce((t, q) => t + q[1], 0) / all.length);
    for (const i of list) level[i] = shared;
  }
  buildings.forEach((bd, i) => pads.set(bd.id, level[i]!));
  const padList = buildings.map((bd, i) => ({
    building: bd.id, pad_elevation_ft: el(level[i]!), lowest_ground_ft: el(under[i]!.low), highest_ground_ft: el(under[i]!.high),
    deepest_cut_ft: tenth(Math.max(0, under[i]!.high - level[i]!)), deepest_fill_ft: tenth(Math.max(0, level[i]! - under[i]!.low)),
  }));
  const bx0 = x0 - GRADE_RUN_M, bx1 = x1 + GRADE_RUN_M, by0 = y0 - GRADE_RUN_M, by1 = y1 + GRADE_RUN_M;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const boxes = work.map(r => [Math.min(...r.map(q => q[0])), Math.max(...r.map(q => q[0])), Math.min(...r.map(q => q[1])), Math.max(...r.map(q => q[1]))] as const);
  const shaped = (x: number, y: number): number => {
    let h = survey.heightAt(x, y);
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return h;
    let d = GRADE_RUN_M;
    for (let i = 0; i < work.length && d > 0; i++) {
      const bb = boxes[i]!;
      if (x < bb[0] - d || x > bb[1] + d || y < bb[2] - d || y > bb[3] + d) continue;
      d = Math.min(d, awayFrom(x, y, work[i]!));
    }
    if (d < GRADE_RUN_M) { const k = ease(d / GRADE_RUN_M); h = plane(x, y) * (1 - k) + h * k; }
    buildings.forEach((bd, i) => {
      const db = awayFrom(x, y, bd.ring);
      if (db < PAD_RUN_M) { const k = ease(db / PAD_RUN_M); h = level[i]! * (1 - k) + h * k; }
    });
    return h;
  };
  const memo = new Map<number, number>();
  const terrain: Terrain = {
    ...survey,
    heightAt: (x, y) => {
      const key = Math.round(x * 100) * 4_000_037 + Math.round(y * 100);
      let h = memo.get(key);
      if (h === undefined) { h = shaped(x, y); if (memo.size < 3_000_000) memo.set(key, h); }
      return h;
    },
    elevationFt: (x, y) => survey.zeroFt + shaped(x, y) / FT,
  };
  return {
    terrain, pads, padList,
    grading: {
      rule: `Assumed for the picture, not a grading plan: the paved area and the buildings stand on one even surface fitted to the existing ground, no steeper than ${Math.round(GRADE_MAX * 100)}%; each building's pad is level on it; the graded ground meets the existing ground over ${Math.round(GRADE_RUN_M / FT)} ft round the work.`,
      existing_slope_pct: Math.round(natural * 1000) / 10,
      graded_slope_pct: Math.round(Math.hypot(a, b) * 1000) / 10,
      deepest_cut_ft: tenth(cut), deepest_fill_ft: tenth(fill),
    },
  };
}

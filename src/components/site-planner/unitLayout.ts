/**
 * Unit-level floorplate layout — the TestFit look.
 *
 * Slices a building footprint into a representative GROUND-FLOOR plate:
 * typed unit modules along a double-loaded corridor, with egress cores at the
 * bar ends. The building's unit mix sets the TYPE PROPORTIONS and each type's
 * fixed area (Studio 550 / 1 Bed 700 / 2 Bed 1,100 / 3 Bed 1,600 SF by
 * default); the actual unit count re-derives from the current footprint, so
 * moving/resizing a building re-fills the plate live — grow the bar and more
 * units appear, shrink it and the excess drop off. Pure world-space geometry;
 * the canvas just fills polygons.
 *
 * 2026-09-04 (Eric, 2622 W Heiman: "the internal space in the building
 * doesn't have corridors, room sizes are wrong"): the plate used to be sliced
 * across the bounding box of the WHOLE footprint, so an E-shaped bar became
 * one 324 × 220 ft box with units 107 ft deep and a few feet wide and a
 * corridor through the courtyards. The footprint is now read as the BARS it
 * is made of (a strip sweep in the oriented frame, merged where the span
 * holds, along whichever axis reads it in fewer bars), and every bar gets its
 * own double-loaded corridor, cores at its free ends, and units that are as
 * deep as the bar's bank — the plan a civil would recognise.
 */
import { longestEdgeAngle } from './planRendering';

export interface UnitPoly {
  /** Closed ring, world metres */
  ring: number[][];
  /** 'studio' | '1br' | '2br' | '3br' (matches the engine mix) */
  type: string;
  /** Unit-type tag drawn on the plate: Studio / 1 Bed / 2 Bed / 3 Bed */
  label: string;
  /** Label anchor (unit centre) */
  center: [number, number];
}

export interface Floorplate {
  units: UnitPoly[];
  cores: Array<{ ring: number[][]; center: [number, number] }>;
  /** one corridor centreline per double-loaded bar, world metres */
  corridors: Array<[number[], number[]]>;
  /** the bars the footprint was read as (closed world rings) */
  bars: number[][][];
}

export const UNIT_COLORS: Record<string, string> = {
  studio: '#C4B5FD', // violet
  '1br': '#86EFAC', // green
  '2br': '#93C5FD', // blue
  '3br': '#5EEAD4', // teal
  townhome: '#A7D8B9', // sage — party-wall dwellings, distinct from flat types
};

const UNIT_LABELS: Record<string, string> = {
  studio: 'Studio',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
};

const SQFT_PER_SQM = 10.7639;
const CORRIDOR_M = 1.7; // ~5.5 ft double-loaded corridor
const CORE_M = 3.0; // egress core width at each bar end
const MIN_UNIT_W = 3.0;
const MIN_BANK_D = 4.0; // a bank shallower than this is not a dwelling
/** vertices closer than this share an axis line */
const SNAP = 0.5;
/** strip spans within this of each other (both ends) belong to one bar —
 *  bar ends clipped to a parcel line drift by a few feet per strip */
const MERGE = 2.0;
/** a bar must carry two cores and a unit, and a bank */
const MIN_BAR_LONG = CORE_M * 2 + MIN_UNIT_W;
const MIN_BAR_SHORT = MIN_BANK_D;

interface Mix {
  type: string;
  count: number;
  avgSqft: number;
}

/** axis-aligned rectangle in the oriented (local) frame */
interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function levels(vals: number[]): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (out.length === 0 || v - out[out.length - 1] > SNAP) out.push(v);
  return out;
}

/** Interior x-intervals of a closed ring on the line y = yy (even-odd rule). */
function spansAt(pts: number[][], yy: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if ((y0 <= yy) === (y1 <= yy)) continue; // half-open: no crossing
    xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
  }
  xs.sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > SNAP) out.push([xs[i], xs[i + 1]]);
  }
  return out;
}

/**
 * Strip sweep along y: the polygon is cut at every vertex level, each strip's
 * interior spans become rectangles, and a rectangle continues into the next
 * strip when its span holds (within MERGE, keeping the inner span so a
 * slanted end never widens a bar).
 */
function stripDecompose(pts: number[][]): Rect[] {
  const ys = levels(pts.map(p => p[1]));
  let open: Rect[] = [];
  const done: Rect[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    const spans = spansAt(pts, (y1 + y2) / 2);
    const next: Rect[] = [];
    const used = new Set<Rect>();
    for (const [x1, x2] of spans) {
      const prev = open.find(r => !used.has(r) && Math.abs(r.x1 - x1) <= MERGE && Math.abs(r.x2 - x2) <= MERGE);
      if (prev) {
        used.add(prev);
        prev.x1 = Math.max(prev.x1, x1);
        prev.x2 = Math.min(prev.x2, x2);
        prev.y2 = y2;
        next.push(prev);
      } else {
        next.push({ x1, y1, x2, y2 });
      }
    }
    for (const r of open) if (!used.has(r)) done.push(r);
    open = next;
  }
  done.push(...open);
  return done.filter(r => r.x2 - r.x1 > SNAP && r.y2 - r.y1 > SNAP);
}

function ringArea(pts: number[][]): number {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1];
  return Math.abs(a) / 2;
}

const isBar = (r: Rect): boolean => {
  const w = r.x2 - r.x1;
  const d = r.y2 - r.y1;
  return Math.max(w, d) >= MIN_BAR_LONG && Math.min(w, d) >= MIN_BAR_SHORT;
};

/**
 * Read a footprint (oriented frame) as bars: sweep along y and along x, keep
 * whichever reading needs fewer bars (an E-shape is one spine and three arms
 * along x, five overlapping pieces along y); a reading that covers under 60%
 * of the footprint, or none at all, falls back to the bounding box — the old
 * behaviour, for genuinely angled shapes.
 */
export function decomposeBars(local: number[][]): Rect[] {
  const area = ringArea(local);
  const h = stripDecompose(local);
  const v = stripDecompose(local.map(([x, y]) => [y, x])).map(r => ({ x1: r.y1, y1: r.x1, x2: r.y2, y2: r.x2 }));
  const cover = (rs: Rect[]) => rs.reduce((s, r) => s + (r.x2 - r.x1) * (r.y2 - r.y1), 0);
  const candidates = [h, v]
    .map(rs => ({ bars: rs.filter(isBar), all: rs }))
    .filter(c => c.bars.length > 0 && cover(c.all) >= 0.6 * area);
  if (candidates.length === 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of local) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return [{ x1: minX, y1: minY, x2: maxX, y2: maxY }];
  }
  candidates.sort((a, b) => {
    if (a.bars.length !== b.bars.length) return a.bars.length - b.bars.length;
    const minA = Math.min(...a.bars.map(r => (r.x2 - r.x1) * (r.y2 - r.y1)));
    const minB = Math.min(...b.bars.map(r => (r.x2 - r.x1) * (r.y2 - r.y1)));
    return minB - minA;
  });
  return candidates[0].bars;
}

/**
 * Compute the floorplate for one building.
 * @param coords footprint outer ring (world metres, closed)
 * @param unitMix building unit mix — sets type proportions and per-type areas;
 *   the drawn count re-derives from the current footprint (dynamic re-fill)
 * @param floors floor count (per-floor proportions = total / floors)
 */
export function computeFloorplate(
  coords: number[][],
  unitMix: Mix[] | undefined,
  floors: number
): Floorplate {
  const empty: Floorplate = { units: [], cores: [], corridors: [], bars: [] };
  if (!coords || coords.length < 4 || !unitMix || unitMix.length === 0) return empty;

  const f = Math.max(1, Math.floor(floors || 1));

  // Oriented frame: x along the longest edge, y across it.
  const angle = longestEdgeAngle(coords);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = coords.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
  const toWorld = (lx: number, ly: number): number[] => [lx * cos - ly * sin, lx * sin + ly * cos];

  const rects = decomposeBars(local);
  const inside = (r: Rect, x: number, y: number) => x > r.x1 - 0.1 && x < r.x2 + 0.1 && y > r.y1 - 0.1 && y < r.y2 + 0.1;

  // The mix defines type PROPORTIONS + per-type areas; the plate re-derives
  // the actual count from its current geometry, so a moved/resized building
  // dynamically gains or loses units instead of freezing the original count.
  const perFloor: Mix[] = unitMix
    .map(m => ({ ...m, count: Math.max(1, Math.round(m.count / f)) }))
    .filter(m => m.avgSqft > 0 && m.count > 0);
  const queue: Mix[] = [];
  const remaining = perFloor.map(m => ({ ...m }));
  while (remaining.some(m => m.count > 0)) {
    for (const m of remaining) {
      if (m.count > 0) {
        queue.push(m);
        m.count--;
      }
    }
  }

  const units: UnitPoly[] = [];
  const cores: Floorplate['cores'] = [];
  const corridors: Floorplate['corridors'] = [];
  const bars: number[][][] = [];
  const MAX_UNITS = 400;
  let qi = 0; // the proportion sequence runs on across bars

  for (const r of rects) {
    const w = r.x2 - r.x1;
    const d = r.y2 - r.y1;
    if (Math.max(w, d) < MIN_BAR_LONG || Math.min(w, d) < MIN_BAR_SHORT) continue;
    // Bar frame: u along the bar's own long axis, v across its depth.
    const alongX = w >= d;
    const u1 = alongX ? r.x1 : r.y1;
    const u2 = alongX ? r.x2 : r.y2;
    const v1 = alongX ? r.y1 : r.x1;
    const v2 = alongX ? r.y2 : r.x2;
    const toLocal = (u: number, v: number): [number, number] => (alongX ? [u, v] : [v, u]);
    const rect = (ua: number, va: number, ub: number, vb: number): number[][] => {
      const ring = [toWorld(...toLocal(ua, va)), toWorld(...toLocal(ub, va)), toWorld(...toLocal(ub, vb)), toWorld(...toLocal(ua, vb))];
      ring.push([ring[0][0], ring[0][1]]);
      return ring;
    };
    const centerOf = (ua: number, va: number, ub: number, vb: number): [number, number] => {
      const c = toWorld(...toLocal((ua + ub) / 2, (va + vb) / 2));
      return [c[0], c[1]];
    };
    bars.push(rect(u1, v1, u2, v2));

    // A bar end that meets another bar is a junction — the corridor runs on,
    // no core there.
    const vm = (v1 + v2) / 2;
    const abutsStart = rects.some(o => o !== r && inside(o, ...toLocal(u1 - 0.6, vm)));
    const abutsEnd = rects.some(o => o !== r && inside(o, ...toLocal(u2 + 0.6, vm)));
    let usable1 = u1;
    let usable2 = u2;
    if (!abutsStart) {
      cores.push({ ring: rect(u1, v1, u1 + CORE_M, v2), center: centerOf(u1, v1, u1 + CORE_M, v2) });
      usable1 = u1 + CORE_M;
    }
    if (!abutsEnd) {
      cores.push({ ring: rect(u2 - CORE_M, v1, u2, v2), center: centerOf(u2 - CORE_M, v1, u2, v2) });
      usable2 = u2 - CORE_M;
    }
    if (usable2 - usable1 < MIN_UNIT_W || queue.length === 0) continue;

    // Banks: double-loaded when deep enough, otherwise one full-depth bank.
    const doubleLoaded = v2 - v1 >= 2 * MIN_BANK_D + CORRIDOR_M;
    const banks: Array<{ v1: number; v2: number }> = doubleLoaded
      ? [
          { v1: vm + CORRIDOR_M / 2, v2 },
          { v1, v2: vm - CORRIDOR_M / 2 },
        ]
      : [{ v1, v2 }];
    if (doubleLoaded) {
      corridors.push([toWorld(...toLocal(u1, vm)), toWorld(...toLocal(u2, vm))]);
    }

    // Fill banks, least-filled first, cycling the proportion sequence until
    // the bar length is exhausted; `misses` counts consecutive types that fit
    // nowhere — a full cycle of misses means even the narrowest is out of room.
    const cursors = banks.map(() => usable1);
    const widthIn = (m: Mix, bank: { v1: number; v2: number }) =>
      Math.max(MIN_UNIT_W, m.avgSqft / SQFT_PER_SQM / (bank.v2 - bank.v1));
    const place = (m: Mix, bankIdx: number, uw: number) => {
      const bank = banks[bankIdx];
      units.push({
        ring: rect(cursors[bankIdx], bank.v1, cursors[bankIdx] + uw, bank.v2),
        type: m.type,
        label: UNIT_LABELS[m.type] ?? '?',
        center: centerOf(cursors[bankIdx], bank.v1, cursors[bankIdx] + uw, bank.v2),
      });
      cursors[bankIdx] += uw;
    };
    let misses = 0;
    while (units.length < MAX_UNITS && misses < queue.length) {
      const m = queue[qi % queue.length];
      qi++;
      const bankIdx = cursors.indexOf(Math.min(...cursors));
      const uw = widthIn(m, banks[bankIdx]);
      if (cursors[bankIdx] + uw <= usable2 + 0.25) {
        place(m, bankIdx, uw);
        misses = 0;
        continue;
      }
      if (banks.length > 1) {
        const other = 1 - bankIdx;
        const ow = widthIn(m, banks[other]);
        if (cursors[other] + ow <= usable2 + 0.25) {
          place(m, other, ow);
          misses = 0;
          continue;
        }
      }
      misses++;
    }
  }

  return { units, cores, corridors, bars };
}

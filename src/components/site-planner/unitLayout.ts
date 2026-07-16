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
}

export const UNIT_COLORS: Record<string, string> = {
  studio: '#C4B5FD', // violet
  '1br': '#86EFAC', // green
  '2br': '#93C5FD', // blue
  '3br': '#5EEAD4', // teal
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

interface Mix {
  type: string;
  count: number;
  avgSqft: number;
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
  const empty: Floorplate = { units: [], cores: [] };
  if (!coords || coords.length < 4 || !unitMix || unitMix.length === 0) return empty;

  const f = Math.max(1, Math.floor(floors || 1));

  // Oriented frame: x along the long axis, y across the depth.
  const angle = longestEdgeAngle(coords);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    const rx = x * cos + y * sin;
    const ry = -x * sin + y * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const W = maxX - minX;
  const D = maxY - minY;
  if (W < CORE_M * 2 + MIN_UNIT_W || D < 4) return empty;

  const toWorld = (lx: number, ly: number): number[] => [
    lx * cos - ly * sin,
    lx * sin + ly * cos,
  ];
  const rect = (x1: number, y1: number, x2: number, y2: number): number[][] => {
    const ring = [
      toWorld(x1, y1),
      toWorld(x2, y1),
      toWorld(x2, y2),
      toWorld(x1, y2),
    ];
    ring.push([ring[0][0], ring[0][1]]);
    return ring;
  };
  const centerOf = (x1: number, y1: number, x2: number, y2: number): [number, number] => {
    const c = toWorld((x1 + x2) / 2, (y1 + y2) / 2);
    return [c[0], c[1]];
  };

  // Banks: double-loaded when deep enough, otherwise one full-depth bank.
  const midY = (minY + maxY) / 2;
  const doubleLoaded = D >= 2 * 4 + CORRIDOR_M; // two ≥4m banks + corridor
  const banks: Array<{ y1: number; y2: number }> = doubleLoaded
    ? [
        { y1: midY + CORRIDOR_M / 2, y2: maxY },
        { y1: minY, y2: midY - CORRIDOR_M / 2 },
      ]
    : [{ y1: minY, y2: maxY }];

  // Cores at both bar ends (full depth)
  const cores = [
    { ring: rect(minX, minY, minX + CORE_M, maxY), center: centerOf(minX, minY, minX + CORE_M, maxY) },
    { ring: rect(maxX - CORE_M, minY, maxX, maxY), center: centerOf(maxX - CORE_M, minY, maxX, maxY) },
  ];
  const usableX1 = minX + CORE_M;
  const usableX2 = maxX - CORE_M;

  // The mix defines type PROPORTIONS + per-type areas; the plate re-derives
  // the actual count from its current geometry, so a moved/resized building
  // dynamically gains or loses units instead of freezing the original count.
  const perFloor: Mix[] = unitMix
    .map(m => ({ ...m, count: Math.max(1, Math.round(m.count / f)) }))
    .filter(m => m.avgSqft > 0 && m.count > 0);
  if (perFloor.length === 0) return { units: [], cores };

  // One round-robin period in mix proportions (mixed sequence, TestFit-style)
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

  // Fill banks, least-filled first, cycling the proportion sequence until the
  // bar length is exhausted (cap is a safety net, not a design limit).
  const cursors = banks.map(() => usableX1);
  const units: UnitPoly[] = [];
  const MAX_UNITS = 400;
  const widthIn = (m: Mix, bank: { y1: number; y2: number }) =>
    Math.max(MIN_UNIT_W, (m.avgSqft / SQFT_PER_SQM) / (bank.y2 - bank.y1));
  const place = (m: Mix, bankIdx: number, w: number) => {
    const bank = banks[bankIdx];
    units.push({
      ring: rect(cursors[bankIdx], bank.y1, cursors[bankIdx] + w, bank.y2),
      type: m.type,
      label: UNIT_LABELS[m.type] ?? '?',
      center: centerOf(cursors[bankIdx], bank.y1, cursors[bankIdx] + w, bank.y2),
    });
    cursors[bankIdx] += w;
  };

  // `misses` counts consecutive types that fit nowhere — a full cycle of
  // misses means even the narrowest type is out of room.
  let misses = 0;
  for (let qi = 0; units.length < MAX_UNITS && misses < queue.length; qi++) {
    const m = queue[qi % queue.length];
    const bankIdx = cursors.indexOf(Math.min(...cursors));
    const w = widthIn(m, banks[bankIdx]);
    if (cursors[bankIdx] + w <= usableX2 + 0.25) {
      place(m, bankIdx, w);
      misses = 0;
      continue;
    }
    // Least-filled bank is full for this type; try the other bank.
    const other = 1 - bankIdx;
    if (banks.length > 1) {
      const ow = widthIn(m, banks[other]);
      if (cursors[other] + ow <= usableX2 + 0.25) {
        place(m, other, ow);
        misses = 0;
        continue;
      }
    }
    misses++;
  }

  return { units, cores };
}

/**
 * Unit-level floorplate layout — the TestFit look.
 *
 * Slices a building footprint into a representative GROUND-FLOOR plate:
 * typed unit modules along a double-loaded corridor, with egress cores at the
 * bar ends. Driven by the building's engine-computed unit mix (never invents
 * counts) and its oriented geometry, so moving/resizing a building re-slices
 * its units live. Pure world-space geometry; the canvas just fills polygons.
 */
import { longestEdgeAngle } from './planRendering';

export interface UnitPoly {
  /** Closed ring, world metres */
  ring: number[][];
  /** 'studio' | '1br' | '2br' | '3br' (matches the engine mix) */
  type: string;
  /** TestFit-style tag: S / A / B / C */
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
  studio: 'S',
  '1br': 'A',
  '2br': 'B',
  '3br': 'C',
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
 * @param unitMix building TOTAL unit mix (all floors)
 * @param floors floor count (per-floor mix = total / floors)
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

  // Per-floor unit counts (largest-remainder so the total is consistent)
  const perFloor: Mix[] = unitMix
    .map(m => ({ ...m, count: Math.round(m.count / f) }))
    .filter(m => m.count > 0 && m.avgSqft > 0);
  if (perFloor.length === 0) return { units: [], cores };

  // Round-robin the types (mixed sequence, TestFit-style)
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

  // Fill banks, least-filled first, until the bar length is exhausted
  const cursors = banks.map(() => usableX1);
  const units: UnitPoly[] = [];
  for (const m of queue) {
    const bankIdx = cursors.indexOf(Math.min(...cursors));
    const bank = banks[bankIdx];
    const bankDepth = bank.y2 - bank.y1;
    const w = Math.max(MIN_UNIT_W, (m.avgSqft / SQFT_PER_SQM) / bankDepth);
    if (cursors[bankIdx] + w > usableX2 + 0.25) {
      // This bank is full; try the other one once, else stop.
      const other = 1 - bankIdx;
      if (
        banks.length > 1 &&
        cursors[other] + Math.max(MIN_UNIT_W, (m.avgSqft / SQFT_PER_SQM) / (banks[other].y2 - banks[other].y1)) <= usableX2 + 0.25
      ) {
        const ob = banks[other];
        const ow = Math.max(MIN_UNIT_W, (m.avgSqft / SQFT_PER_SQM) / (ob.y2 - ob.y1));
        units.push({
          ring: rect(cursors[other], ob.y1, cursors[other] + ow, ob.y2),
          type: m.type,
          label: UNIT_LABELS[m.type] ?? '?',
          center: centerOf(cursors[other], ob.y1, cursors[other] + ow, ob.y2),
        });
        cursors[other] += ow;
        continue;
      }
      break;
    }
    units.push({
      ring: rect(cursors[bankIdx], bank.y1, cursors[bankIdx] + w, bank.y2),
      type: m.type,
      label: UNIT_LABELS[m.type] ?? '?',
      center: centerOf(cursors[bankIdx], bank.y1, cursors[bankIdx] + w, bank.y2),
    });
    cursors[bankIdx] += w;
  }

  return { units, cores };
}

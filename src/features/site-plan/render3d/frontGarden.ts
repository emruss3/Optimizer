import { pointInPolygon } from '../scene/frame';
import type { ApproachAnchor } from './streetDetails';

type Spot = [number, number, number];
type Line = { path: number[][]; widthM: number };

function nearEdge(x: number, y: number, path: number[][], limit: number, closed: boolean): boolean {
  for (let i = closed ? 0 : 1; i < path.length; i++) {
    const a = path[(i + path.length - 1) % path.length]!, b = path[i]!;
    const ax = a[0]!, ay = a[1]!, dx = b[0]! - ax, dy = b[1]! - ay;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) || 1)));
    if (Math.hypot(x - ax - dx * t, y - ay - dy * t) <= limit) return true;
  }
  return false;
}

/** Small, illustrative entry plantings. Never add any if the plan does not show
 * both the authored entry and usable ground in its own lot. */
export function frontGarden(anchors: ApproachAnchor[], authored: ReadonlySet<string>, lots: number[][][],
  occupied: number[][][][], lines: Line[]): Spot[] {
  const spots: Spot[] = [];
  const occupiedBounds = occupied.flatMap(rings => {
    const outer = rings[0];
    if (!outer?.length) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x = 0, y = 0] of outer) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return [{ rings, minX, minY, maxX, maxY }];
  });
  for (const a of anchors) {
    if (a.kind !== 'walk' || !a.facing || !authored.has(a.building)) continue;
    const lot = lots.find(ring => pointInPolygon(a.threshold[0], a.threshold[1], [ring]));
    if (!lot) continue;
    const [nx, ny] = a.facing;
    for (const [out, side, r] of [[0.78, -1.38, 0.32], [1.08, 1.48, 0.29], [0.80, -2.34, 0.23], [0.93, 2.42, 0.22]] as const) {
      const x = a.threshold[0] + nx * out - ny * side, y = a.threshold[1] + ny * out + nx * side;
      const clearance = r * 2 + 0.14;
      if (!pointInPolygon(x, y, [lot]) || nearEdge(x, y, lot, clearance, true)) continue;
      if (occupiedBounds.some(({ rings, minX, minY, maxX, maxY }) =>
        x >= minX - clearance && x <= maxX + clearance && y >= minY - clearance && y <= maxY + clearance &&
        (pointInPolygon(x, y, rings) || rings.some(ring => nearEdge(x, y, ring, clearance, true))))) continue;
      if (lines.some(line => nearEdge(x, y, line.path, clearance + line.widthM / 2, false))) continue;
      if (spots.some(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) < clearance + sr * 2)) continue;
      spots.push([x, y, r]);
    }
  }
  return spots;
}

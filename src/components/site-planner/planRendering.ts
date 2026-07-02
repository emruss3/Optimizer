/**
 * Pure geometry helpers for site-plan rendering (unit ticks, corridor lines,
 * dimension callouts). Kept free of canvas so they can be unit tested — the
 * canvas layer just strokes what these return.
 *
 * All coordinates are world-space metres (EPSG:3857 planar).
 */

export type Pt = [number, number];
export type Segment = [Pt, Pt];

/** Angle (radians) of the longest edge of a ring — the building's long axis. */
export function longestEdgeAngle(coords: number[][]): number {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    const len = dx * dx + dy * dy;
    if (len > bestLen) {
      bestLen = len;
      best = Math.atan2(dy, dx);
    }
  }
  return best;
}

function rotatePt([x, y]: Pt, cos: number, sin: number): Pt {
  return [x * cos - y * sin, x * sin + y * cos];
}

function orientedBounds(coords: number[][], angle: number) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    const [rx, ry] = rotatePt([x, y], cos, sin);
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Unit-division ticks: lines across the SHORT dimension of the (oriented)
 * footprint, spaced `spacingM` along the LONG axis — the classic "units along
 * a double-loaded bar" read. The canvas clips them to the footprint polygon.
 */
export function computeUnitTicks(coords: number[][], spacingM: number): Segment[] {
  if (coords.length < 4 || spacingM <= 0) return [];
  const angle = longestEdgeAngle(coords);
  const { minX, minY, maxX, maxY } = orientedBounds(coords, angle);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const ticks: Segment[] = [];
  for (let x = minX + spacingM; x < maxX - 1e-9; x += spacingM) {
    ticks.push([
      rotatePt([x, minY], cos, sin),
      rotatePt([x, maxY], cos, sin),
    ]);
  }
  return ticks;
}

/** Dashed centreline along the long axis — reads as the corridor. */
export function corridorLine(coords: number[][]): Segment | null {
  if (coords.length < 4) return null;
  const angle = longestEdgeAngle(coords);
  const { minX, minY, maxX, maxY } = orientedBounds(coords, angle);
  const midY = (minY + maxY) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [rotatePt([minX, midY], cos, sin), rotatePt([maxX, midY], cos, sin)];
}

export interface DimensionCallout {
  /** Dimension line endpoints, offset outward from the edge */
  line: Segment;
  /** Label anchor (midpoint of the offset line) */
  labelAt: Pt;
  /** Edge length in metres */
  lengthM: number;
}

/**
 * Dimension callouts for the first two edges of a ring (width × depth for a
 * rectangular footprint), offset `offsetM` outward — away from the centroid.
 */
export function edgeDimensions(coords: number[][], offsetM: number): DimensionCallout[] {
  if (coords.length < 4) return [];
  const n = coords.length - 1; // exclude closing vertex
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += coords[i][0];
    cy += coords[i][1];
  }
  cx /= n;
  cy /= n;

  const out: DimensionCallout[] = [];
  for (let i = 0; i < Math.min(2, n); i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // Unit normal, flipped to point away from the centroid
    let nx = ey / len;
    let ny = -ex / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const oa: Pt = [a[0] + nx * offsetM, a[1] + ny * offsetM];
    const ob: Pt = [b[0] + nx * offsetM, b[1] + ny * offsetM];
    out.push({
      line: [oa, ob],
      labelAt: [(oa[0] + ob[0]) / 2, (oa[1] + ob[1]) / 2],
      lengthM: len,
    });
  }
  return out;
}

/** Pick a "nice" scale-bar length in feet for the current px-per-metre. */
export function pickScaleBarFt(pxPerMeter: number, maxPx = 140): { ft: number; px: number } {
  const CANDIDATES_FT = [10, 20, 50, 100, 200, 400, 800];
  const M_PER_FT = 0.3048;
  let chosen = CANDIDATES_FT[0];
  for (const ft of CANDIDATES_FT) {
    if (ft * M_PER_FT * pxPerMeter <= maxPx) chosen = ft;
  }
  return { ft: chosen, px: chosen * M_PER_FT * pxPerMeter };
}

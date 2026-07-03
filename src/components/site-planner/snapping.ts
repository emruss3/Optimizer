/**
 * Magnetic snapping for building drags: when any footprint vertex comes
 * within `tol` of a buildable-envelope edge, return the small translation
 * that lands it flush on that edge — the "buildings click onto setback
 * lines" feel. Pure geometry (world metres) so it's unit-testable.
 */

export interface SnapDelta {
  dx: number;
  dy: number;
}

/** Perpendicular vector from point p to segment ab (to the closest point). */
function toSegment(p: number[], a: number[], b: number[]): { dx: number; dy: number; dist: number } {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  let t = 0;
  if (lenSq > 1e-12) {
    t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = cx - p[0];
  const dy = cy - p[1];
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

/**
 * Find the snap translation (if any) that pulls the footprint's closest
 * vertex flush onto the nearest envelope edge, when within tolerance.
 * Returns null when nothing is within `tol` — the drag proceeds unsnapped.
 */
export function computeSnapDelta(
  footprintCoords: number[][],
  envelopeRing: number[][],
  tol: number
): SnapDelta | null {
  if (!footprintCoords?.length || !envelopeRing || envelopeRing.length < 4 || tol <= 0) {
    return null;
  }

  let best: { dx: number; dy: number; dist: number } | null = null;
  // Exclude the closing vertex of the footprint if present
  const n =
    footprintCoords.length > 1 &&
    footprintCoords[0][0] === footprintCoords[footprintCoords.length - 1][0] &&
    footprintCoords[0][1] === footprintCoords[footprintCoords.length - 1][1]
      ? footprintCoords.length - 1
      : footprintCoords.length;

  for (let i = 0; i < n; i++) {
    const v = footprintCoords[i];
    for (let j = 0; j < envelopeRing.length - 1; j++) {
      const hit = toSegment(v, envelopeRing[j], envelopeRing[j + 1]);
      // Ignore exact-on-edge (dist ~0) — nothing to pull
      if (hit.dist > 1e-9 && hit.dist <= tol && (!best || hit.dist < best.dist)) {
        best = hit;
      }
    }
  }

  return best ? { dx: best.dx, dy: best.dy } : null;
}

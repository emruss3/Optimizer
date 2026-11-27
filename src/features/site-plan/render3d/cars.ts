// Illustration only. Units are metres, with x along the car, y across it and z up.
export interface CarSpot {
  /** Centre of the car on the ground. */
  x: number;
  y: number;
  /** Height of the pavement it stands on. */
  z: number;
  /** Direction the nose points, radians from +x. */
  heading: number;
  length: number;
  width: number;
  color: readonly number[];
  /** Local rise per metre along and across the footprint. */
  pitch?: number;
  roll?: number;
  /** Picks the shape: stable for a given car. */
  seed: number;
}

/** Where a car stands, from the footprint the plan data gives it: a four-cornered box at the pavement. */
export function carSpot(ring: number[][], color: readonly number[], seed: number): CarSpot | null {
  const q = ring.slice(0, 4);
  if (q.length < 4) return null;
  const [a, b, c] = q as [number[], number[], number[]];
  const ab = Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0)), bc = Math.hypot((c[0] ?? 0) - (b[0] ?? 0), (c[1] ?? 0) - (b[1] ?? 0));
  if (ab < 0.5 || bc < 0.5) return null;
  const along = ab >= bc ? [(b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0)] : [(c[0] ?? 0) - (b[0] ?? 0), (c[1] ?? 0) - (b[1] ?? 0)];
  // nose in or nose out: either is a parked car
  const flip = seed % 2 ? Math.PI : 0;
  return {
    x: q.reduce((s, p) => s + (p[0] ?? 0), 0) / 4,
    y: q.reduce((s, p) => s + (p[1] ?? 0), 0) / 4,
    z: a[2] ?? 0.3,
    heading: Math.atan2(along[1] ?? 0, along[0] ?? 1) + flip,
    length: Math.max(ab, bc),
    width: Math.min(ab, bc),
    color,
    seed,
  };
}

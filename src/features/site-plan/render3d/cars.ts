// Parked cars for the rendering: a rounded body, a glazed cabin under a painted
// roof, four wheels and lights, in two shapes (a sedan and a taller wagon).
// Illustration only: the plan gives a stall, not a car. Units are metres, with
// x along the car, y across it and z up.
import * as THREE from 'three';

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
  /** Picks the shape: stable for a given car. */
  seed: number;
}

export interface CarPart { key: 'paint|solid' | 'glass|solid' | 'plain|solid'; geometry: THREE.BufferGeometry; color: readonly number[] }

const L0 = 4.5, W0 = 1.82;
const GLASS = [34, 42, 52, 255], TYRE = [24, 24, 26, 255], LAMP = [244, 240, 226, 255], TAIL = [150, 26, 26, 255];

/** A side profile, extruded across the car and rounded at its edges. */
function slab(profile: Array<[number, number]>, width: number, round: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  profile.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.02, width - round * 2), bevelEnabled: round > 0, bevelThickness: round, bevelSize: round * 0.7, bevelSegments: 2, curveSegments: 4 });
  // the profile's x stays, its y becomes height, and the extrusion runs across the car
  g.rotateX(Math.PI / 2);
  g.translate(0, width / 2 - round, 0);
  return g;
}

interface Template { parts: CarPart[] }
const templates: Template[] = [];

function build(tall: boolean): Template {
  const h = L0 / 2;
  const belt = tall ? 0.92 : 0.82, roof = tall ? 1.62 : 1.4;
  const parts: CarPart[] = [];
  // the body, sill to belt line, nose a little lower than the tail
  parts.push({ key: 'paint|solid', color: [], geometry: slab([
    [-h + 0.06, 0.26], [-h, 0.46], [-h + 0.02, belt - 0.04], [-h + 0.14, belt],
    [h - 0.95, belt], [h - 0.18, belt - 0.16], [h, belt - 0.34], [h - 0.02, 0.4], [h - 0.1, 0.26],
  ], W0, 0.09) });
  // the cabin: glass all round
  const rearBase = tall ? -h + 0.12 : -h + 0.72, rearTop = tall ? -h + 0.3 : -h + 1.22;
  const frontTop = tall ? 0.42 : 0.3, frontBase = tall ? 1.02 : 0.98;
  parts.push({ key: 'glass|solid', color: GLASS, geometry: slab([[rearBase, belt - 0.02], [rearTop, roof - 0.03], [frontTop, roof - 0.03], [frontBase, belt - 0.02]], W0 * 0.86, 0.07) });
  // the roof and the pillars that carry it
  parts.push({ key: 'paint|solid', color: [], geometry: slab([[rearTop - 0.04, roof - 0.05], [rearTop + 0.02, roof + 0.02], [frontTop - 0.02, roof + 0.02], [frontTop + 0.05, roof - 0.05]], W0 * 0.84, 0.03) });
  for (const [x0, x1] of [[rearBase, rearTop], [frontBase, frontTop]] as Array<[number, number]>) {
    for (const side of [-1, 1]) {
      const post = slab([[x0 - 0.05, belt - 0.02], [x1 - 0.04, roof - 0.02], [x1 + 0.04, roof - 0.02], [x0 + 0.05, belt - 0.02]], 0.07, 0);
      post.translate(0, side * (W0 * 0.43 - 0.03), 0);
      parts.push({ key: 'paint|solid', color: [], geometry: post });
    }
  }
  const mid = (rearTop + frontTop) / 2 - (tall ? 0.1 : 0);
  for (const side of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.09, 0.05, roof - belt);
    post.translate(mid, side * (W0 * 0.43 - 0.01), (roof + belt) / 2 - 0.02);
    parts.push({ key: 'paint|solid', color: [], geometry: post });
  }
  // wheels
  for (const x of [-h + 0.82, h - 0.86]) for (const side of [-1, 1]) {
    const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14);
    tyre.translate(x, side * (W0 / 2 - 0.1), 0.33);
    parts.push({ key: 'plain|solid', color: TYRE, geometry: tyre });
    const hub = new THREE.CylinderGeometry(0.19, 0.19, 0.25, 10);
    hub.translate(x, side * (W0 / 2 - 0.1), 0.33);
    parts.push({ key: 'plain|solid', color: [176, 178, 182, 255], geometry: hub });
  }
  // lights
  for (const side of [-1, 1]) {
    const head = new THREE.BoxGeometry(0.08, 0.36, 0.11);
    head.translate(h - 0.07, side * (W0 / 2 - 0.34), belt - 0.3);
    parts.push({ key: 'plain|solid', color: LAMP, geometry: head });
    const tail = new THREE.BoxGeometry(0.06, 0.34, 0.12);
    tail.translate(-h + 0.02, side * (W0 / 2 - 0.32), belt - 0.16);
    parts.push({ key: 'plain|solid', color: TAIL, geometry: tail });
  }
  return { parts };
}

/** The parts of one car, in place. The caller owns the geometries. */
export function carParts(spot: CarSpot): CarPart[] {
  const tall = spot.seed % 5 >= 3;
  const t = (templates[tall ? 1 : 0] ??= build(tall));
  const m = new THREE.Matrix4()
    .makeTranslation(spot.x, spot.y, spot.z)
    .multiply(new THREE.Matrix4().makeRotationZ(spot.heading))
    .multiply(new THREE.Matrix4().makeScale(Math.min(1.1, Math.max(0.9, spot.length / L0)), Math.min(1.08, Math.max(0.92, spot.width / W0)), 1));
  return t.parts.map(p => ({ key: p.key, color: p.color.length ? p.color : spot.color, geometry: p.geometry.clone().applyMatrix4(m) }));
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
    z: Math.max(0, (a[2] ?? 0.3) - 0.13),
    heading: Math.atan2(along[1] ?? 0, along[0] ?? 1) + flip,
    length: Math.max(ab, bc),
    width: Math.min(ab, bc),
    color,
    seed,
  };
}

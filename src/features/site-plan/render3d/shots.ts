// Where a camera stands for the two pictures a scheme is shown by. Pure
// geometry on the model's ground plan: x east, y north, metres. Nothing here
// is displayed as a figure.
import { pointInPolygon } from '../scene/frame';

export interface Subject {
  /** The building this outline belongs to. */
  id?: string; points: Array<[number, number]>; height: number
  /** The top of the rendered roof and its equipment, metres above the pad. */
  roofHeight?: number;
  /** The level the building stands on, metres above the model's zero: 0 on flat ground. */
  base?: number;
}

export interface Shot {
  /** Where the camera is: ground position and height above the ground. */
  position: [number, number, number];
  /** What it looks at. */
  target: [number, number, number];
  /** Vertical angle of view of the picture, degrees. */
  fovDeg: number;
  /** Lens shift: the frame is this many times taller than the picture, and the picture is its top part.
   *  The camera stays level, so walls stay upright, and the horizon sits low in the picture. */
  lift: number;
  /** Why this place: what the reader of a stored shot needs to regenerate or question it. */
  basis: string;
}

/** The model is built in metres; everything said or stored for a reader is in feet. */
export const FT = 0.3048;
const EYE = 5.5 * FT;     // a person on the sidewalk
const STREET_FOV = 38;    // close to a 32 mm lens on a 16:9 frame
const LIFT = 1.32;        // the horizon about two thirds of the way down the picture

const centre = (pts: Array<[number, number]>): [number, number] => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

/** Does the sight line cross a wall or a fence between the eye and the subject? */
function crosses(a: [number, number], b: [number, number], ring: number[][]): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (let i = 0; i < ring.length; i++) {
    const [x = 0, y = 0] = ring[i]!;
    const [endX = 0, endY = 0] = ring[(i + 1) % ring.length]!;
    const ex = endX - x, ey = endY - y;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-8) continue;
    const ax = x - a[0], ay = y - a[1];
    const t = (ax * ey - ay * ex) / det;
    const u = (ax * dy - ay * dx) / det;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) return true;
  }
  return false;
}

function nearestRoad(p: [number, number], roads: number[][][]): number {
  let best = Infinity;
  for (const path of roads) for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!, b = path[i + 1]!;
    const ax = a[0] ?? 0, ay = a[1] ?? 0, dx = (b[0] ?? 0) - ax, dy = (b[1] ?? 0) - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)));
  }
  return best;
}

/**
 * Street arrival at eye level. Try the largest building first, then buildings
 * closer to the street if the main building is hidden inside the development.
 */
export function streetShot(subjects: Subject[], obstacles: number[][][], roads: number[][][], aspect = 16 / 9, trees: Array<[number, number, number]> = [], groundAt: (x: number, y: number) => number = () => 0): Shot | null {
  const ordered = subjects.filter(s => s.points.length >= 3).map(subject => ({
    subject, size: extent(subject.points), road: nearestRoad(centre(subject.points), roads),
  })).sort((a, b) => b.size - a.size);
  const [main, ...rest] = ordered;
  if (!main) return null;
  rest.sort((a, b) => a.road === b.road ? b.size - a.size : a.road - b.road);
  for (const { subject } of [main, ...rest.slice(0, 7)]) {
    const blockers = [...obstacles, ...subjects.filter(s => s !== subject).map(s => s.points)];
    const shot = frameStreetSubject(subject, blockers, roads, aspect, trees, groundAt);
    if (shot) return shot;
  }
  return null;
}

function frameStreetSubject(
  main: Subject, blockers: number[][][], roads: number[][][], aspect: number,
  trees: Array<[number, number, number]>, groundAt: (x: number, y: number) => number,
): Shot | null {
  const [cx, cy] = centre(main.points);
  const reach = Math.max(6, ...main.points.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
  // the long side of the building: an oblique view stands off its corner
  let long = 0, best = 0;
  for (let i = 0; i < main.points.length; i++) {
    const a = main.points[i]!, b = main.points[(i + 1) % main.points.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) { best = len; long = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const tanV = Math.tan((STREET_FOV * Math.PI) / 360), tanH = tanV * aspect;
  const halfH = Math.atan(tanH);
  const full = (reach * 1.15) / Math.sin(halfH);
  const own = main.points;
  const sights: Array<[number, number]> = [[cx, cy], ...main.points.filter((_, i) => i % Math.max(1, Math.floor(main.points.length / 6)) === 0)];
  let pick: { p: [number, number]; eye: number; lift: number; score: number; why: string } | null = null;
  const base = main.base ?? 0, roof = base + (main.roofHeight ?? main.height);
  const sideMargin = 0.9;
  // Leave room for the viewport controls above the roof, as well as the foreground.
  const verticalMargin = 0.78;
  for (const k of [1.3, 1.1, 0.95, 0.8, 1.6, 2.0]) {
    for (let step = 0; step < 36; step++) {
      const az = (step / 36) * Math.PI * 2;
      const p: [number, number] = [cx + Math.cos(az) * full * k, cy + Math.sin(az) * full * k];
      const vx = cx - p[0], vy = cy - p[1], vd = Math.hypot(vx, vy);
      const eye = groundAt(p[0], p[1]) + EYE;
      let bottom = Infinity, top = -Infinity;
      // Test the level camera's projection at each actual roof and pad corner.
      // The depth is measured along the camera axis.
      const fitsFrame = main.points.every(c => {
        const dx = c[0] - p[0], dy = c[1] - p[1];
        const depth = (vx * dx + vy * dy) / vd;
        const side = Math.abs(vx * dy - vy * dx) / vd;
        if (depth <= 0 || side > sideMargin * depth * tanH) return false;
        bottom = Math.min(bottom, (base - eye) / (depth * tanV));
        top = Math.max(top, (roof - eye) / (depth * tanV));
        return true;
      });
      if (!fitsFrame) continue;
      const minShift = Math.max(0, top - verticalMargin), maxShift = Math.min(0.8, bottom + verticalMargin);
      if (minShift > maxShift) continue;
      if (pointInPolygon(p[0], p[1], [own as never])) continue;
      // Keep the eye outside the tree crowns and clear the entire frontage of buildings.
      if (trees.some(([x, y, r]) => Math.hypot(x - p[0], y - p[1]) < r * 1.25)) continue;
      if (blockers.some(r => pointInPolygon(p[0], p[1], [r as never]) || sights.some(s => crosses(p, s, r)))) continue;
      const lift = 1 + Math.max(minShift, Math.min(LIFT - 1, maxShift));
      const road = roads.length ? nearestRoad(p, roads) : 0;
      // 0 square on to a face, 1 at 45 degrees off it
      const off = Math.abs(Math.sin(2 * (az - long)));
      // trees between the eye and the building: each crown a sight line passes through counts against the place
      const inTheWay = trees.filter(([tx, ty, tr]) => Math.hypot(tx - p[0], ty - p[1]) < vd && sights.some(sg => {
        const dx = sg[0] - p[0], dy = sg[1] - p[1], len2 = dx * dx + dy * dy || 1;
        const t = ((tx - p[0]) * dx + (ty - p[1]) * dy) / len2;
        return t > 0 && t < 0.97 && Math.hypot(tx - (p[0] + dx * t), ty - (p[1] + dy * t)) < tr * 1.1;
      })).length;
      // a person stands beside the street, not on its centre line: about a sidewalk's distance off it
      const beside = roads.length ? Math.abs(road - 23 * FT) : 0;
      const score = -beside / Math.max(10, reach) + off * 0.6 - k * 0.25 - inTheWay * 0.45;
      if (!pick || score > pick.score) pick = { p, eye, lift, score, why: `${roads.length ? `${Math.round(road / FT)} ft from the nearest street line` : 'no street lines in the record'}; ${inTheWay} tree${inTheWay === 1 ? '' : 's'} in the line of sight` };
    }
  }
  if (!pick) return null;
  return {
    position: [pick.p[0], pick.p[1], pick.eye],
    // level with the eye: walls stay upright, and the lens shift brings the roof into the picture
    target: [cx, cy, pick.eye],
    fovDeg: STREET_FOV,
    lift: pick.lift,
    basis: `Street arrival at eye level (${(EYE / FT).toFixed(1)} ft), clear line of sight; ${pick.why}`,
  };
}

function extent(pts: Array<[number, number]>): number {
  const [x, y] = centre(pts);
  return Math.max(0, ...pts.map(p => Math.hypot(p[0] - x, p[1] - y)));
}

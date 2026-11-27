// Where a camera stands for the two pictures a scheme is shown by. Pure
// geometry on the model's ground plan: x east, y north, metres. Nothing here
// is displayed as a figure.
import { pointInPolygon } from '../scene/frame';
import type { ApproachAnchor } from './streetDetails';

export interface Subject {
  /** The building this outline belongs to. */
  id?: string; points: Array<[number, number]>; height: number
  /** The top of the rendered roof and its equipment, metres above the pad. */
  roofHeight?: number;
  /** The level the building stands on, metres above the model's zero: 0 on flat ground. */
  base?: number;
  /** For a fitted detached house, the elevation served by its driveway and front walk. */
  facing?: [number, number];
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

export type ForegroundObstacle = [x: number, y: number, radius: number];

/** The model is built in metres; everything said or stored for a reader is in feet. */
export const FT = 0.3048;
const EYE = 5.5 * FT;     // a person on the sidewalk
const STREET_FOV = 38;    // close to a 32 mm lens on a 16:9 frame
const LIFT = 1.32;        // the horizon about two thirds of the way down the picture
export const AERIAL_FOV = 30;
export const DEFAULT_RENDER_SUN = { key: 'jun21', hour: 9 } as const;

/** Camera geometry shared by the browser, printed aerial and the exported job. */
export function aerialShot(focus: { x: number; y: number; radius: number }, azimuth: number, aspect: number, base: number, down = 28): Shot {
  const distance = (focus.radius * 1.2) / Math.sin((AERIAL_FOV * Math.PI) / 360 * Math.min(1, aspect));
  const el = down * Math.PI / 180, az = azimuth * Math.PI / 180;
  const horizontal = distance * Math.cos(el), z = base + focus.radius * 0.06;
  return {
    position: [focus.x + horizontal * Math.sin(az), focus.y - horizontal * Math.cos(az), z + distance * Math.sin(el)],
    target: [focus.x, focus.y, z], fovDeg: AERIAL_FOV, lift: 1,
    basis: `Three-quarter aerial, ${down} degrees down`,
  };
}

export function prominentSubject(subjects: Subject[]): Subject | undefined {
  return [...subjects].filter(s => s.points.length >= 3).sort((a, b) => extent(b.points) - extent(a.points))[0];
}

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

function nearCanopy(a: [number, number], b: [number, number], tree: [number, number, number], widen: number): boolean {
  const [x, y, radius] = tree, dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(0.96, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) < radius * widen;
}

/** Leave room between the lens and the first visible planting or parked vehicle. */
function foregroundBlocks(
  eye: [number, number], target: [number, number], aspect: number, fov: number,
  foreground: readonly ForegroundObstacle[],
): boolean {
  const dx = target[0] - eye[0], dy = target[1] - eye[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const spread = aspect * Math.tan(fov * Math.PI / 360);
  const near = Math.min(5, length * 0.5);
  return foreground.some(([x, y, radius]) => {
    const ox = x - eye[0], oy = y - eye[1];
    const depth = ox * ux + oy * uy;
    if (Math.hypot(ox, oy) < radius + 0.55) return true;
    return depth > 0 && depth - radius < near && Math.abs(ox * uy - oy * ux) < depth * spread + radius;
  });
}

function terrainBlocks(a: [number, number], eye: number, b: [number, number], target: number, groundAt: (x: number, y: number) => number): boolean {
  const samples = Math.min(60, Math.max(6, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (groundAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) > eye + (target - eye) * t - 0.06) return true;
  }
  return false;
}

/** An eye-level view along a modelled entrance walk, clear to its landing. */
export function approachShot(
  approaches: ApproachAnchor[], subjects: Subject[], obstacles: number[][][],
  trees: Array<[number, number, number]>, groundAt: (x: number, y: number) => number,
  foreground: readonly ForegroundObstacle[] = [], aspect = 16 / 9,
  /** 'walk': the front entry, at the door; 'apron': the vehicle approach, at the garage (handoff 11-27) */
  kind: 'walk' | 'apron' = 'walk',
  garagePavementAt?: (x: number, y: number) => boolean,
): Shot | null {
  const main = prominentSubject(subjects);
  const ranked = approaches.filter(a => a.kind === kind).sort((a, b) =>
    Number(b.building === main?.id) - Number(a.building === main?.id));
  const blockers = [...obstacles, ...subjects.map(s => s.points)];
  let fallback: Shot | null = null;
  for (const a of ranked) {
    const [x, y, z] = a.threshold;
    const dx = a.connection[0] - x, dy = a.connection[1] - y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.18) continue;
    const tx = dx / distance, ty = dy / distance;
    // An authored garage's anchor may only describe its threshold ramp. Find room for an
    // eye-level shot along the connected, drawn driveway or alley without lengthening that ramp.
    let reaches = [Math.min(10, distance + 2.2), Math.min(8, distance + 0.8), Math.max(2.5, distance)];
    const shortApron = distance < 1.2;
    if (shortApron) {
      if (kind !== 'apron' || !garagePavementAt) continue;
      let pavedReach = distance;
      for (let step = distance + 0.1; step <= 10; step += 0.2) {
        if (!garagePavementAt(x + tx * step, y + ty * step)) break;
        pavedReach = step;
      }
      reaches = [pavedReach, pavedReach * 0.8, pavedReach * 0.6].filter(reach => reach >= 2.5);
    }
    for (const reach of reaches) for (const offset of [1.2, -1.2, 0]) {
      const point: [number, number] = [x + tx * reach - ty * offset, y + ty * reach + tx * offset];
      if (shortApron && !garagePavementAt?.(...point)) continue;
      if (blockers.some(r => pointInPolygon(point[0], point[1], [r]) || crosses(point, [x, y], r))) continue;
      if (trees.some(tree => nearCanopy(point, [x, y], tree, 1.55))) continue;
      const eye = groundAt(...point) + EYE, targetHeight = z + 0.95;
      if (terrainBlocks(point, eye, [x, y], targetHeight, groundAt)) continue;
      const shot: Shot = {
        position: [...point, eye], target: [x - tx * 0.65, y - ty * 0.65, targetHeight],
        fovDeg: 46, lift: 1, basis: kind === 'apron' ? `Eye level on the drive at the garage of ${a.building}` : `Eye level at the entrance walk of ${a.building}`,
      };
      if (!foregroundBlocks(point, [x, y], aspect, 46, foreground)) return shot;
      fallback ??= shot;
    }
  }
  return fallback;
}

/**
 * Street arrival at eye level. Try the largest building first, then buildings
 * closer to the street if the main building is hidden inside the development.
 */
export function streetShot(
  subjects: Subject[], obstacles: number[][][], roads: number[][][], aspect = 16 / 9,
  trees: Array<[number, number, number]> = [], groundAt: (x: number, y: number) => number = () => 0,
  foreground: readonly ForegroundObstacle[] = [], preferredHouse?: string,
): Shot | null {
  const ordered = subjects.filter(s => s.points.length >= 3 && (!preferredHouse || s.id === preferredHouse)).map(subject => ({
    subject, size: extent(subject.points), road: nearestRoad(centre(subject.points), roads),
  })).sort((a, b) => b.size - a.size);
  if (ordered.length && ordered.every(x => x.subject.facing)) {
    const median = ordered[Math.floor(ordered.length / 2)]!.size;
    const priority = (x: typeof ordered[number]) => (Number.isFinite(x.road) ? x.road * 0.18 : 0) + Math.abs(x.size - median);
    ordered.sort((a, b) => priority(a) - priority(b));
  }
  const [main, ...rest] = ordered;
  if (!main) return null;
  rest.sort((a, b) => a.road === b.road ? b.size - a.size : a.road - b.road);
  for (const { subject } of [main, ...rest.slice(0, 7)]) {
    const blockers = [...obstacles, ...subjects.filter(s => s !== subject).map(s => s.points)];
    const shot = frameStreetSubject(subject, blockers, roads, aspect, trees, groundAt, foreground);
    if (shot) return shot;
  }
  return null;
}

function frameStreetSubject(
  main: Subject, blockers: number[][][], roads: number[][][], aspect: number,
  trees: Array<[number, number, number]>, groundAt: (x: number, y: number) => number,
  foreground: readonly ForegroundObstacle[],
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
      const frontage = main.facing ? (-vx * main.facing[0] - vy * main.facing[1]) / vd : 0;
      if (main.facing && frontage < 0.32) continue;
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
      if (trees.some(([x, y, r]) => Math.hypot(x - p[0], y - p[1]) < r * 1.65)) continue;
      if (trees.some(tree => nearCanopy(p, [cx, cy], tree, 1.5))) continue;
      if (blockers.some(r => pointInPolygon(p[0], p[1], [r as never]) || sights.some(s => crosses(p, s, r)))) continue;
      if (terrainBlocks(p, eye, [cx, cy], base + 1.6, groundAt)) continue;
      const lift = 1 + Math.max(minShift, Math.min(LIFT - 1, maxShift));
      const road = roads.length ? nearestRoad(p, roads) : 0;
      // 0 square on to a face, 1 at 45 degrees off it
      const off = Math.abs(Math.sin(2 * (az - long)));
      // trees between the eye and the building: each crown a sight line passes through counts against the place
      const inTheWay = trees.filter(tree => sights.some(s => nearCanopy(p, s, tree, 1.35))).length;
      // a person stands beside the street, not on its centre line: about a sidewalk's distance off it
      const beside = roads.length ? Math.abs(road - 23 * FT) : 0;
      const crowded = foregroundBlocks(p, [cx, cy], aspect, STREET_FOV, foreground);
      const score = -beside / Math.max(10, reach) + off * 0.6 - k * 0.25 - inTheWay * 1.25 + frontage * 0.75 - (crowded ? 4 : 0);
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

/**
 * Why no eye-level view was found, in words a reviewer can act on (PR 221 audit: "street failure
 * should have actual camera and reason"). Read from the same inputs the camera searches use.
 */
export function shotUnavailableReason(
  shot: 'street' | 'approach' | 'garage',
  subjects: Subject[], roads: number[][][], approaches: ApproachAnchor[],
): string {
  if (!subjects.some(s => s.points.length >= 3)) return 'no building is drawn to frame';
  if (shot === 'garage') {
    if (!approaches.some(a => a.kind === 'apron')) return 'no drive is drawn to a garage on this plan, so there is no garage approach to stand on';
    return 'every point along the drive has its view of the garage blocked (buildings, trees or ground)';
  }
  if (shot === 'approach') {
    if (!approaches.some(a => a.kind === 'walk')) return 'no entrance walk is drawn, so there is no entrance to stand at';
    return 'every point along the entrance walks has its view of the door blocked (buildings, trees or ground)';
  }
  if (!roads.length) return 'no street is mapped beside the buildings, so there is no street to stand on';
  return 'every eye-level position on the street side with the whole building in frame is blocked (neighbouring buildings, trees or ground), or the building faces away from the mapped street';
}

/**
 * What a camera standing at `eye` (ground position) sees of a building past the tree crowns: the
 * crowns its sight lines to the building's centre and corners pass through, and the share of
 * those lines that pass clear. Used when the camera is kept and the scene changes under it
 * (Review → Rendering stands trees up), so the view's stated basis is this scene's, not the
 * last one's (handoff 11-27).
 */
export function sightReport(eye: [number, number], subject: Subject, trees: Array<[number, number, number]>): { trees: number; clearShare: number } {
  const [cx, cy] = centre(subject.points);
  const sights: Array<[number, number]> = [[cx, cy], ...subject.points];
  const crossing = new Set<number>();
  let clear = 0;
  for (const s of sights) {
    let blocked = false;
    trees.forEach((tree, i) => { if (nearCanopy(eye, s, tree, 1)) { crossing.add(i); blocked = true; } });
    if (!blocked) clear++;
  }
  return { trees: crossing.size, clearShare: sights.length ? clear / sights.length : 1 };
}

/** The subject a camera is aimed at: the one whose outline holds the target, else the nearest. */
export function aimedSubject(target: [number, number], subjects: Subject[]): Subject | undefined {
  let best: Subject | undefined, bestD = Infinity;
  for (const s of subjects) {
    if (s.points.length < 3) continue;
    if (pointInPolygon(target[0], target[1], [s.points as never])) return s;
    const [x, y] = centre(s.points);
    const d = Math.hypot(x - target[0], y - target[1]);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

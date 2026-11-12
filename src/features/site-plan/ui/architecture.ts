// Buildings drawn as buildings. A house gets a foundation, sided walls, a gable
// roof with eaves, a porch with posts, a front door, a garage door, trimmed
// windows and a chimney. A townhome gets a stoop, a door, a garage, a cornice
// and its own colour in the row. An apartment building gets a brick base with
// an entry and a canopy, stacks of balconies, projecting bays, trimmed
// windows, a parapet and equipment on the roof.
//
// All of it stands on the plan's own footprint and rises to the scene's story
// levels (scene/heights): the eave or the parapet is at the height the
// inspector states. Everything else here is illustration. The plan carries a
// footprint and a story count, not a design, and the view says so.
import { METERS_PER_FOOT } from '../../../engine/units';
import type { BuildingUse, SceneHeight } from '../scene/heights';
import type { RenderSlab, RenderWindow, RGBA, Surface } from './renderModel';

type V2 = [number, number];

export interface Architecture {
  /** Extruded parts: walls, foundations, porches, balconies, bays, chimneys. */
  slabs: RenderSlab[];
  /** Glass. */
  glass: RenderWindow[];
  /** Flat parts with no shine: roof planes, doors, trim, railings. */
  flats: RenderWindow[];
  /** Foundation planting: x, y and radius, metres. */
  shrubs: Array<[number, number, number]>;
}

const TRIM: RGBA = [247, 245, 240, 255];
const GLASS: RGBA = [66, 88, 110, 255];
const CONCRETE: RGBA = [176, 172, 164, 255];
const METAL: RGBA = [58, 62, 68, 255];

const HOUSE_SIDING: RGBA[] = [
  [226, 220, 204, 255], [158, 176, 152, 255], [128, 152, 176, 255], [204, 180, 140, 255],
  [176, 172, 164, 255], [104, 124, 138, 255], [214, 200, 170, 255], [160, 138, 116, 255],
  [92, 104, 96, 255], [188, 150, 128, 255],
];
const HOUSE_ROOF: RGBA[] = [[104, 102, 102, 255], [122, 108, 98, 255], [96, 104, 114, 255], [130, 122, 114, 255]];
const DOORS: RGBA[] = [[146, 52, 44, 255], [38, 68, 96, 255], [48, 84, 62, 255], [44, 44, 48, 255], [196, 148, 60, 255]];
const TOWN_SIDING: RGBA[] = [[162, 96, 78, 255], [228, 222, 210, 255], [92, 100, 110, 255], [198, 178, 150, 255], [140, 150, 142, 255]];
const BRICK: RGBA = [148, 84, 64, 255];
const APT_BODY: RGBA[] = [[214, 206, 192, 255], [198, 202, 202, 255]];
const APT_ACCENT: RGBA[] = [[62, 70, 80, 255], [146, 100, 62, 255], [86, 104, 96, 255]];

/** A stable number from an id, so a building keeps its colours between draws. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T,>(list: T[], n: number): T => list[n % list.length] as T;

// What each colour of the kit is made of. A renderer that draws materials
// asks here; a shade of a colour is the same material.
const PORCH: RGBA = [196, 192, 184, 255];
const SLAB: RGBA = [206, 202, 194, 255];
const AMENITY_WALL: RGBA = [214, 198, 166, 255];
const MADE_OF = new Map<string, Surface>();
const made = (list: RGBA[], s: Surface) => list.forEach(c => MADE_OF.set(c.join(), s));
made(HOUSE_SIDING, 'siding');
made(TOWN_SIDING, 'siding');
made(HOUSE_ROOF, 'shingle');
made([BRICK], 'brick');
made([...APT_BODY, ...APT_ACCENT, AMENITY_WALL], 'plaster');
made([CONCRETE, PORCH, SLAB], 'concrete');
export const surfaceOf = (c: RGBA): Surface => MADE_OF.get(c.join()) ?? 'plain';
const shade = (c: RGBA, k: number): RGBA => {
  const out: RGBA = [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), c[3]];
  MADE_OF.set(out.join(), surfaceOf(c));
  return out;
};

interface Wall {
  a: V2;
  /** Unit vector along the wall. */
  t: V2;
  /** Unit vector out of the building. */
  n: V2;
  len: number;
}

const signedArea = (ring: number[][]): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    if (p && q) a += (p[0] ?? 0) * (q[1] ?? 0) - (q[0] ?? 0) * (p[1] ?? 0);
  }
  return a / 2;
};

/** The walls of a footprint, courts included, each with its outward normal. */
export function wallsOf(rings: number[][][]): Wall[] {
  const out: Wall[] = [];
  rings.forEach((ring, ri) => {
    // out of the building is out of its outer ring and into a court
    const side = (ri === 0 ? 1 : -1) * (signedArea(ring) > 0 ? 1 : -1);
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i], q = ring[i + 1];
      if (!p || !q) continue;
      const a: V2 = [p[0] ?? 0, p[1] ?? 0];
      const dx = (q[0] ?? 0) - a[0], dy = (q[1] ?? 0) - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.3) continue;
      const t: V2 = [dx / len, dy / len];
      out.push({ a, t, n: [t[1] * side, -t[0] * side], len });
    }
  });
  return out;
}

/** A point on a wall: `s` metres along it, `d` metres out from it. */
const on = (w: Wall, s: number, d = 0): V2 => [w.a[0] + w.t[0] * s + w.n[0] * d, w.a[1] + w.t[1] * s + w.n[1] * d];

class Kit {
  slabs: RenderSlab[] = [];
  glass: RenderWindow[] = [];
  flats: RenderWindow[] = [];
  shrubs: Array<[number, number, number]> = [];
  constructor(private id: string, private label: string) {}

  /** A vertical panel on a wall. */
  panel(w: Wall, s0: number, s1: number, z0: number, z1: number, d: number, color: RGBA, shiny = false): void {
    const p0 = on(w, s0, d), p1 = on(w, s1, d);
    (shiny ? this.glass : this.flats).push({ id: this.id, polygon: [[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], color });
  }
  /** A box standing against or proud of a wall. */
  box(w: Wall, s0: number, s1: number, d0: number, d1: number, z0: number, h: number, color: RGBA): void {
    const c = [on(w, s0, d0), on(w, s1, d0), on(w, s1, d1), on(w, s0, d1), on(w, s0, d0)];
    this.prism(c, z0, h, color, 'detail');
  }
  prism(ring: V2[], z0: number, h: number, color: RGBA, part: RenderSlab['part']): void {
    if (h <= 0) return;
    this.slabs.push({ id: this.id, building: true, polygon: [ring.map(p => [p[0], p[1], z0])], elevation: h, color, part, label: this.label });
  }
  /** A whole footprint, courts kept, from z0 up by h. */
  mass(rings: number[][][], z0: number, h: number, color: RGBA, part: RenderSlab['part']): void {
    if (h <= 0) return;
    this.slabs.push({ id: this.id, building: true, polygon: rings.map(r => r.map(p => [p[0] ?? 0, p[1] ?? 0, z0])), elevation: h, color, part, label: this.label });
  }
  flat(points: number[][], color: RGBA): void {
    this.flats.push({ id: this.id, polygon: points, color });
  }
  /** A window: a trim board and a pane just proud of it. */
  window(w: Wall, s: number, width: number, z0: number, z1: number, d = 0, trim: RGBA = TRIM): void {
    this.panel(w, s - width / 2 - 0.09, s + width / 2 + 0.09, z0 - 0.09, z1 + 0.09, d + 0.04, trim);
    this.panel(w, s - width / 2, s + width / 2, z0, z1, d + 0.075, GLASS, true);
  }
  /** A row of shrubs at the foot of a wall, from s0 to s1. */
  hedge(w: Wall, s0: number, s1: number, d: number, every: number, seed: number): void {
    let k = 0;
    for (let s = s0 + every / 2; s < s1; s += every, k++) {
      const p = on(w, s, d);
      this.shrubs.push([p[0], p[1], 0.42 + (((seed >>> (k % 24)) & 3) * 0.06)]);
    }
  }
  done(): Architecture {
    return { slabs: this.slabs, glass: this.glass, flats: this.flats, shrubs: this.shrubs };
  }
}

/** The wall that faces the nearest pavement, or the longest. */
function frontWall(walls: Wall[], pavement: V2[]): number {
  return frontOf(walls, pavement).index;
}

/** The front wall and how far the pavement is from it (null when none is near). */
function frontOf(walls: Wall[], pavement: V2[]): { index: number; dist: number | null } {
  let best = -1, bestD = Infinity;
  walls.forEach((w, i) => {
    if (w.len < 3) return;
    const m = on(w, w.len / 2);
    for (const p of pavement) {
      const vx = p[0] - m[0], vy = p[1] - m[1];
      if (vx * w.n[0] + vy * w.n[1] <= 0.5) continue;
      const d = Math.hypot(vx, vy);
      if (d < bestD) { bestD = d; best = i; }
    }
  });
  if (best >= 0 && bestD < 60) return { index: best, dist: bestD };
  let longest = 0;
  walls.forEach((w, i) => { if (w.len > (walls[longest]?.len ?? 0)) longest = i; });
  return { index: longest, dist: null };
}

const levelsM = (h: SceneHeight) => h.levelsFt.map(f => f * METERS_PER_FOOT);

/** A detached house on a four-cornered pad. */
function house(kit: Kit, id: string, rings: number[][][], height: SceneHeight, pavement: V2[]): boolean {
  const walls = wallsOf(rings);
  if (rings.length !== 1 || walls.length !== 4) return false;
  const [w0, w1, w2, w3] = walls as [Wall, Wall, Wall, Wall];
  if (Math.abs(w0.len - w2.len) > 0.6 || Math.abs(w1.len - w3.len) > 0.6) return false;
  const h = hashId(id);
  const siding = pick(HOUSE_SIDING, h), roofC = pick(HOUSE_ROOF, h >>> 5), door = pick(DOORS, h >>> 9);
  const levels = levelsM(height);
  const eave = levels[levels.length - 1] ?? 3;
  const FOUND = 0.45;
  kit.mass(rings, 0, FOUND, CONCRETE, 'base');
  kit.mass(rings, FOUND, eave - FOUND, siding, 'body');

  // the roof: a gable along the long axis, eaves 0.45 m past the walls
  const longIsW0 = w0.len >= w1.len;
  const L = longIsW0 ? w0 : w1;                 // a long wall
  const S = longIsW0 ? w1 : w2;                 // the short wall that follows it
  const span = S.len, run = L.len;
  const rise = Math.min(3.4, span * 0.27);
  const O = 0.45;
  // local frame on the long wall: s along it, d out of it (negative is into the house)
  const R = (s: number, d: number, z: number): number[] => { const p = on(L, s, d); return [p[0], p[1], z]; };
  const drop = (O * rise) / (span / 2);
  kit.flat([R(-O, O, eave - drop), R(run + O, O, eave - drop), R(run + O, -span / 2, eave + rise), R(-O, -span / 2, eave + rise)], roofC);
  kit.flat([R(-O, -span - O, eave - drop), R(run + O, -span - O, eave - drop), R(run + O, -span / 2, eave + rise), R(-O, -span / 2, eave + rise)], shade(roofC, 0.9));
  // the gable ends, in the siding
  kit.flat([R(0, 0, eave), R(0, -span, eave), R(0, -span / 2, eave + rise)], shade(siding, 0.97));
  kit.flat([R(run, 0, eave), R(run, -span, eave), R(run, -span / 2, eave + rise)], shade(siding, 0.97));
  // a chimney through the ridge
  const cs = run * (0.28 + ((h >>> 13) % 3) * 0.2);
  kit.prism([[...on(L, cs, -span / 2 - 0.35)] as V2, [...on(L, cs + 0.75, -span / 2 - 0.35)] as V2, [...on(L, cs + 0.75, -span / 2 + 0.35)] as V2, [...on(L, cs, -span / 2 + 0.35)] as V2, [...on(L, cs, -span / 2 - 0.35)] as V2], eave, rise + 0.8, BRICK, 'detail');

  // fascia along the eaves and rake boards up the gables: the roof has an edge
  const zE = eave - drop;
  for (const d of [O, -span - O]) kit.flat([R(-O, d, zE - 0.2), R(run + O, d, zE - 0.2), R(run + O, d, zE + 0.02), R(-O, d, zE + 0.02)], TRIM);
  for (const sEnd of [-O, run + O]) {
    kit.flat([R(sEnd, O, zE - 0.2), R(sEnd, O, zE), R(sEnd, -span / 2, eave + rise), R(sEnd, -span / 2, eave + rise - 0.2)], TRIM);
    kit.flat([R(sEnd, -span - O, zE - 0.2), R(sEnd, -span - O, zE), R(sEnd, -span / 2, eave + rise), R(sEnd, -span / 2, eave + rise - 0.2)], TRIM);
  }

  const { index: fi, dist: toPavement } = frontOf(walls, pavement);
  walls.forEach((w, i) => {
    const front = i === fi;
    levels.forEach((top, story) => {
      const z0 = story === 0 ? FOUND : levels[story - 1] ?? FOUND;
      const sill = z0 + 0.85, head = Math.min(top - 0.35, sill + 1.35);
      if (head - sill < 0.7) return;
      if (front && story === 0) return;       // the front's ground story is laid out below
      const n = Math.max(1, Math.floor((w.len - 1.2) / 3.2));
      for (let k = 0; k < n; k++) kit.window(w, ((k + 0.5) * w.len) / n, 1.05, sill, head);
    });
    if (!front) return;
    // the front: a garage where there is room, a porch, a door and windows
    const first = levels[0] ?? eave;
    const garage = w.len >= 9.5;
    const flip = (h >>> 17) % 2 === 1;
    const S_ = (s: number) => (flip ? w.len - s : s);
    const zone = garage ? w.len - 6.1 : w.len;        // the part of the front that is not garage
    if (garage) {
      const g0 = S_(w.len - 5.6), g1 = S_(w.len - 0.7);
      kit.panel(w, Math.min(g0, g1) - 0.1, Math.max(g0, g1) + 0.1, FOUND - 0.25, FOUND + 2.3, 0.04, TRIM);
      kit.panel(w, Math.min(g0, g1), Math.max(g0, g1), FOUND - 0.25, FOUND + 2.2, 0.075, [226, 224, 218, 255]);
      for (let r = 1; r < 4; r++) kit.panel(w, Math.min(g0, g1), Math.max(g0, g1), FOUND - 0.25 + r * 0.6, FOUND - 0.25 + r * 0.6 + 0.03, 0.09, [188, 186, 180, 255]);
    }
    const pc = zone / 2, pw = Math.min(4.4, zone - 1.2);
    if (pw < 1.8) return;
    const a0 = Math.min(S_(pc - pw / 2), S_(pc + pw / 2)), a1 = Math.max(S_(pc - pw / 2), S_(pc + pw / 2));
    const mid = (a0 + a1) / 2;
    kit.box(w, a0, a1, 0, 1.9, 0, FOUND, PORCH);                 // porch floor
    kit.box(w, mid - 0.75, mid + 0.75, 1.9, 2.25, 0, FOUND / 2, PORCH); // step
    const roofZ = Math.min(first - 0.25, FOUND + 2.55);
    for (const s of [a0 + 0.12, a1 - 0.26]) kit.box(w, s, s + 0.14, 1.7, 1.84, FOUND, roofZ - FOUND, TRIM); // posts
    kit.box(w, a0 - 0.3, a1 + 0.3, 0, 2.2, roofZ, 0.2, roofC);                   // porch roof
    kit.panel(w, mid - 0.56, mid + 0.56, FOUND, FOUND + 2.2, 0.04, TRIM);
    kit.panel(w, mid - 0.46, mid + 0.46, FOUND, FOUND + 2.1, 0.075, door);
    // planting at the foot of the front wall, either side of the porch
    const z0 = flip ? w.len - zone : 0, z1 = flip ? w.len : zone;
    if (a0 - z0 > 1.0) kit.hedge(w, z0 + 0.3, a0 - 0.3, 0.6, 1.2, h);
    if (z1 - a1 > 1.0) kit.hedge(w, a1 + 0.3, z1 - 0.3, 0.6, 1.2, h >>> 3);
    for (const s of [a0 - 1.1, a1 + 1.1]) {
      if (s < 0.9 || s > zone - 0.9 && !flip || (flip && s < w.len - zone + 0.9) || s > w.len - 0.9) continue;
      kit.window(w, s, 1.2, FOUND + 0.8, FOUND + 2.1);
      // shutters, in the colour of the front door
      for (const side of [-1, 1]) kit.panel(w, s + side * 0.74 - 0.14, s + side * 0.74 + 0.14, FOUND + 0.78, FOUND + 2.12, 0.05, shade(door, 0.9));
    }
    // a walk from the porch step to the pavement
    if (toPavement != null && toPavement > 3.2) kit.box(w, mid - 0.55, mid + 0.55, 2.25, Math.min(toPavement + 0.4, 16), 0, 0.2, PORCH);
  });
  return true;
}

/** One home of a townhome row. */
function townhome(kit: Kit, id: string, rings: number[][][], height: SceneHeight, pavement: V2[]): boolean {
  const walls = wallsOf(rings);
  if (rings.length !== 1 || walls.length !== 4) return false;
  const h = hashId(id);
  const siding = pick(TOWN_SIDING, h), door = pick(DOORS, h >>> 7);
  const levels = levelsM(height);
  const top = levels[levels.length - 1] ?? 9;
  const first = levels[0] ?? 3;
  kit.mass(rings, 0, 0.3, CONCRETE, 'base');
  kit.mass(rings, 0.3, top - 0.3, siding, 'body');
  kit.mass(rings, top, 0.45, shade(siding, 0.78), 'parapet');
  // the narrow ends are the front and the back; the long sides are party walls
  const shortest = Math.min(...walls.map(w => w.len));
  const ends = walls.map((w, i) => ({ w, i })).filter(x => x.w.len <= shortest + 0.6);
  const fi = frontWall(ends.map(x => x.w), pavement);
  ends.forEach(({ w }, k) => {
    const front = k === fi;
    kit.box(w, -0.05, w.len + 0.05, 0, 0.22, top + 0.1, 0.3, TRIM);               // cornice
    levels.forEach((lv, story) => {
      const z0 = story === 0 ? 0.3 : levels[story - 1] ?? 0.3;
      if (front && story === 0) return;
      const sill = z0 + 0.8, head = Math.min(lv - 0.4, sill + 1.5);
      if (head - sill < 0.7) return;
      const n = w.len >= 5 ? 2 : 1;
      for (let j = 0; j < n; j++) kit.window(w, ((j + 0.5) * w.len) / n, 1.05, sill, head);
    });
    if (!front) return;
    const garage = w.len >= 5.4;
    const doorS = garage ? 0.95 : w.len / 2;
    if (garage) {
      kit.panel(w, 1.9, w.len - 0.4, 0.05, 2.35, 0.04, TRIM);
      kit.panel(w, 2.0, w.len - 0.5, 0.05, 2.25, 0.075, [214, 212, 206, 255]);
    }
    kit.box(w, doorS - 0.7, doorS + 0.7, 0, 0.9, 0, 0.3, PORCH);   // stoop
    kit.panel(w, doorS - 0.55, doorS + 0.55, 0.3, 2.5, 0.04, TRIM);
    kit.panel(w, doorS - 0.45, doorS + 0.45, 0.3, 2.4, 0.075, door);
    kit.box(w, doorS - 0.8, doorS + 0.8, 0, 0.8, Math.min(first - 0.3, 2.7), 0.12, METAL); // canopy
  });
  return true;
}

function inside(x: number, y: number, ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0, yi = ring[i]?.[1] ?? 0, xj = ring[j]?.[0] ?? 0, yj = ring[j]?.[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** An apartment building, or any larger building, on any footprint. */
function apartments(kit: Kit, id: string, rings: number[][][], use: BuildingUse, height: SceneHeight, pavement: V2[], bayScale: number): void {
  const h = hashId(id);
  const body = pick(APT_BODY, h), accent = pick(APT_ACCENT, h >>> 6);
  const levels = levelsM(height);
  const top = levels[levels.length - 1] ?? 4;
  const first = levels[0] ?? top;
  const amenity = use === 'amenity';
  kit.mass(rings, 0, first, amenity ? AMENITY_WALL : BRICK, 'base');
  if (top > first) kit.mass(rings, first, top - first, body, 'body');
  kit.mass(rings, top, 0.9, shade(body, 0.86), 'parapet');
  const walls = wallsOf(rings);
  const entry = frontWall(walls, pavement);
  const BAY = 3.7 * bayScale;
  walls.forEach((w, wi) => {
    if (w.len < 2.6) return;
    const n = Math.max(1, Math.floor((w.len - 0.8) / BAY));
    const step = w.len / n;
    const entryBay = wi === entry ? Math.floor(n / 2) : -1;
    if (!amenity && bayScale <= 1.6 && w.len > 6) {
      // planting at the foot of the wall, open at the entry
      if (entryBay < 0) kit.hedge(w, 0.8, w.len - 0.8, 0.75, 2.1, h + wi);
      else {
        const e = (entryBay + 0.5) * step;
        kit.hedge(w, 0.8, e - 2.4, 0.75, 2.1, h + wi);
        kit.hedge(w, e + 2.4, w.len - 0.8, 0.75, 2.1, h + wi + 7);
      }
    }
    for (let b = 0; b < n; b++) {
      const s = (b + 0.5) * step;
      // the rhythm of the wall: plain, balconies, plain, a projecting bay
      const kind = n < 4 || b === 0 || b === n - 1 || bayScale > 1.6 ? 0 : (b + wi) % 4;
      // ground story: an entry with a canopy, or shopfront glass in the brick
      if (b === entryBay && !amenity) {
        kit.panel(w, s - 1.25, s + 1.25, 0.05, Math.min(first - 0.6, 2.9), 0.04, METAL);
        kit.panel(w, s - 1.1, s + 1.1, 0.05, Math.min(first - 0.75, 2.75), 0.075, GLASS, true);
        kit.box(w, s - 1.9, s + 1.9, 0, 1.7, Math.min(first - 0.45, 3.05), 0.16, METAL);
      } else {
        const ww = Math.min(step - 0.8, 2.5);
        if (ww > 0.6) kit.window(w, s, ww, 0.5, Math.min(first - 0.7, 3.0), 0, METAL);
      }
      if (kind === 3 && levels.length > 1) {
        // a projecting bay from the second story to the parapet
        kit.box(w, s - Math.min(1.5, step / 2 - 0.2), s + Math.min(1.5, step / 2 - 0.2), 0, 0.6, first, top - first + 0.45, accent);
      }
      for (let st = 1; st < levels.length; st++) {
        const z0 = levels[st - 1] ?? first, z1 = levels[st] ?? top;
        if (kind === 1) {
          // a balcony: slab, railing on three sides, a glazed door
          const hw = Math.min(1.55, step / 2 - 0.25);
          kit.box(w, s - hw, s + hw, 0, 1.45, z0 - 0.16, 0.16, SLAB);
          kit.panel(w, s - hw, s + hw, z0, z0 + 1.05, 1.43, METAL);
          const l0 = on(w, s - hw, 0), l1 = on(w, s - hw, 1.43), r0 = on(w, s + hw, 0), r1 = on(w, s + hw, 1.43);
          kit.flat([[l0[0], l0[1], z0], [l1[0], l1[1], z0], [l1[0], l1[1], z0 + 1.05], [l0[0], l0[1], z0 + 1.05]], METAL);
          kit.flat([[r0[0], r0[1], z0], [r1[0], r1[1], z0], [r1[0], r1[1], z0 + 1.05], [r0[0], r0[1], z0 + 1.05]], METAL);
          kit.window(w, s, Math.min(1.9, hw * 1.5), z0 + 0.08, Math.min(z1 - 0.45, z0 + 2.35));
        } else if (kind === 3) {
          kit.window(w, s, Math.min(2.2, step - 1.3), z0 + 0.75, Math.min(z1 - 0.45, z0 + 2.4), 0.6, TRIM);
        } else {
          const ww = Math.min(1.75, step - 0.9);
          if (ww > 0.5) kit.window(w, s, ww, z0 + 0.9, Math.min(z1 - 0.45, z0 + 2.4));
        }
      }
    }
  });
  if (amenity || bayScale > 1.6) return;
  // on the roof: equipment set in from the longest wall, and a stair
  const outer = rings[0] ?? [];
  let long: Wall | null = null;
  for (const w of walls) if (!long || w.len > long.len) long = w;
  if (!long || long.len < 14) return;
  const roof = top + 0.9;
  for (const f of [0.22, 0.5, 0.78]) {
    const c = on(long, long.len * f, -6);
    if (!inside(c[0], c[1], outer) || rings.slice(1).some(r => inside(c[0], c[1], r))) continue;
    kit.box(long, long.len * f - 1.3, long.len * f + 1.3, -6.9, -5.1, roof - 0.9, 0.9 + 1.2, [198, 198, 194, 255]);
  }
  const sc = on(long, 3.2, -5);
  if (inside(sc[0], sc[1], outer) && !rings.slice(1).some(r => inside(sc[0], sc[1], r))) kit.box(long, 1.6, 4.8, -6.6, -3.4, roof - 0.9, 0.9 + 2.3, shade(body, 0.92));
}

/**
 * The parts of one building. `pavement` is the drives, parking and streets
 * near it, in the same local metres: a house turns its front to them.
 */
export function buildArchitecture(
  id: string, label: string, rings: number[][][], use: BuildingUse, height: SceneHeight, pavement: V2[] = [], bayScale = 1,
): Architecture {
  const kit = new Kit(id, label);
  if (use === 'house' && house(kit, id, rings, height, pavement)) return kit.done();
  if (use === 'townhome' && townhome(kit, id, rings, height, pavement)) return kit.done();
  const plain = new Kit(id, label);
  apartments(plain, id, rings, use === 'house' || use === 'townhome' ? 'other' : use, height, pavement, bayScale);
  return plain.done();
}

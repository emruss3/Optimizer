import polygonClipping from 'polygon-clipping';
import type { SceneHeight } from '../../scene/heights';
import { Frame, Kit, frontOf, insetRing, on, ringWalls, tone, type V2, type Wall } from './kit';
import { FOUND, levelsM, PORCH, spec, WALK, wallWindows } from './house';
import { housePalette, type ArchStyle } from './styles';

export interface HouseAccess {
  driveways: V2[][];
  /**
   * Attached garage: `true` draws one where a drive meets the wall; `false`
   * never does. With a `designId`, `null` (unknown) also never invents one —
   * unknown stays unknown. Without a design id (legacy sf_v1 / TH pads),
   * `null` keeps the pre-catalogue rule: draw when a drive meets the wall.
   * Parking pads are independent of the entry.
   */
  garage: boolean | null;
  catalogued: boolean;
  /** Durable design id when a product record was chosen (`abhp:1754-00010`). */
  designId?: string | null;
  assetVersion?: string | null;
  /** Preferred porch / front wall length in metres (porch face of the design). */
  porchFaceLenM?: number | null;
  /** Entry centre along the front wall, metres from the wall start. */
  entryAlongM?: number | null;
  parking?: 'attached-garage' | 'detached-garage' | 'pad' | 'street' | 'alley' | 'none' | 'unknown' | null;
}

interface DriveMeeting {
  wall: Wall;
  s: number;
  width: number;
  gap: number;
}

/** Find the actual span of a driveway at an exterior wall. The lane and neighbouring drives never supply a garage opening. */
export function drivewayMeeting(walls: Wall[], drives: V2[][]): DriveMeeting | null {
  let best: DriveMeeting | null = null;
  for (const wall of walls) {
    if (wall.len < 3) continue;
    for (const ring of drives) {
      const bank: Array<[number, number]> = [];
      const local = (p: V2): V2 => {
        const x = p[0] - wall.a[0], y = p[1] - wall.a[1];
        return [x * wall.t[0] + y * wall.t[1], x * wall.n[0] + y * wall.n[1]];
      };
      for (let i = 1; i < ring.length; i++) {
        const a = local(ring[i - 1]!), b = local(ring[i]!);
        if (a[1] >= -0.18 && a[1] <= 1.6) bank.push(a);
        if (b[1] >= -0.18 && b[1] <= 1.6) bank.push(b);
        for (const depth of [-0.18, 1.6]) {
          if ((a[1] - depth) * (b[1] - depth) < 0) bank.push([a[0] + (b[0] - a[0]) * (depth - a[1]) / (b[1] - a[1]), depth]);
        }
      }
      if (!bank.length) continue;
      const lo = Math.max(0.22, Math.min(...bank.map(p => p[0]))), hi = Math.min(wall.len - 0.22, Math.max(...bank.map(p => p[0])));
      const width = hi - lo, gap = Math.max(0, Math.min(...bank.map(p => p[1])));
      if (width < 2.5 || (best && width - 2 * gap <= best.width - 2 * best.gap)) continue;
      best = { wall, s: (lo + hi) / 2, width, gap };
    }
  }
  return best;
}

/** The outer roof follows the house outline. All walls and rooms below keep the catalogue footprint. */
function pitchedRoof(k: Kit, walls: Wall[], front: Wall, top: number, palette: ReturnType<typeof housePalette>, style: ArchStyle) {
  const frame = new Frame(front);
  const local = (p: V2): V2 => {
    const x = p[0] - front.a[0], y = p[1] - front.a[1];
    return [x * front.t[0] + y * front.t[1], -x * front.n[0] - y * front.n[1]];
  };
  const shape = insetRing(walls, -(style === 'heritage' ? 0.46 : 0.3)).map(local);
  const min = [Math.min(...shape.map(p => p[0])), Math.min(...shape.map(p => p[1]))];
  const max = [Math.max(...shape.map(p => p[0])), Math.max(...shape.map(p => p[1]))];
  const across = max[0]! - min[0]! < (max[1]! - min[1]!) * 0.68 ? 0 : 1;
  const ridge = (min[across]! + max[across]!) / 2;
  const slope = style === 'farmhouse' ? 0.63 : style === 'heritage' ? 0.45 : style === 'modern' ? 0.27 : 0.48;
  const z = (p: V2) => top + slope * Math.max(0, Math.min(p[across] - min[across]!, max[across]! - p[across]));
  const point = (p: V2, h = z(p)): number[] => [...frame.p(...p), h];
  const roof: polygonClipping.Polygon = [[...shape, shape[0]!]];
  for (const side of [-1, 1]) {
    const lo = [...min], hi = [...max];
    if (side === -1) hi[across] = ridge;
    else lo[across] = ridge;
    const [a, b] = lo as V2, [c, d] = hi as V2;
    const faces = polygonClipping.intersection(roof, [[[a, b], [c, b], [c, d], [a, d], [a, b]]]);
    for (const poly of faces) k.flat(poly[0]!.slice(0, -1).map(p => point(p)), side === -1 ? palette.roof : tone(palette.roof, 0.93));
  }
  const split = (a: V2, b: V2): V2[] => {
    if ((a[across] - ridge) * (b[across] - ridge) >= 0) return [a, b];
    const t = (ridge - a[across]) / (b[across] - a[across]);
    return [a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], b];
  };
  const edge = (a: V2, b: V2, base: (p: V2) => number, m: ReturnType<typeof housePalette>['roof']) => {
    const points = split(a, b);
    for (let i = 1; i < points.length; i++) {
      const c = points[i - 1]!, d = points[i]!;
      k.flat([point(c, base(c)), point(d, base(d)), point(d), point(c)], m);
    }
  };
  shape.forEach((p, i) => edge(p, shape[(i + 1) % shape.length]!, p => z(p) - 0.18, palette.fascia));
  walls.forEach(w => edge(local(w.a), local(on(w, w.len)), () => top - 0.02, palette.gable));
}

/**
 * Prefer a wall whose length matches the design’s porch face. When several
 * walls sit within ~18% of that length (e.g. both 40-ft sides of a 40×34 ranch),
 * pick the same wall `frontOf` / the drive meeting would — not the first length
 * match in ring order (which can be the backyard face).
 */
export function pickFrontWall(
  walls: Wall[],
  pavement: V2[],
  access?: HouseAccess,
  meetingWall?: Wall | null,
): Wall {
  const preferred = meetingWall ?? walls[frontOf(walls, pavement).index]!;
  const porchLen = access?.porchFaceLenM;
  if (porchLen == null || porchLen <= 0) return preferred;

  const tol = porchLen * 0.18;
  const candidates = walls.filter(w => w.len >= 2.5 && Math.abs(w.len - porchLen) <= tol);
  if (!candidates.length) return preferred;

  if (meetingWall && candidates.includes(meetingWall)) return meetingWall;
  const facing = walls[frontOf(walls, pavement).index]!;
  if (candidates.includes(facing)) return facing;
  // Length band only — break remaining ties with pavement proximity among candidates.
  return candidates[frontOf(candidates, pavement).index]!;
}

export function fittedHouse(k: Kit, rings: number[][][], height: SceneHeight, pavement: V2[], style: ArchStyle, access?: HouseAccess): boolean {
  const outer = rings[0], walls = outer ? ringWalls(outer) : [];
  if (!outer || walls.length < 3) return false;
  const meeting = drivewayMeeting(walls, access?.driveways ?? []);
  const front = pickFrontWall(walls, pavement, access, meeting?.wall ?? null);
  const levels = levelsM(height), top = levels[levels.length - 1] ?? 3.2;
  // Catalogued designs: only explicit true grows a garage (unknown stays unknown).
  // Legacy pads without a designId keep the pre-catalogue rule (null ⇒ draw on meeting).
  const parkingBlocksGarage = access?.parking === 'pad' || access?.parking === 'none'
    || access?.parking === 'street' || access?.parking === 'alley' || access?.parking === 'detached-garage';
  const designKnown = Boolean(access?.designId);
  const wantsGarage = designKnown
    ? access?.garage === true && !parkingBlocksGarage
    : access?.garage !== false && !parkingBlocksGarage;
  const garage = meeting && wantsGarage && meeting.wall === front ? meeting : null;
  const palette = housePalette(style, k.seed);
  const skirt = style === 'urban-brick' ? palette.body : palette.found;
  k.mass(rings, 0, FOUND, skirt, 'base');
  k.mass(rings, FOUND, top - FOUND, palette.body, 'body');
  pitchedRoof(k, walls, front, top, palette, style);

  // The access side carries the entrance and, only where the design explicitly has one, an attached garage.
  // Parking pads are independent of the entry (no-garage cottage).
  const clear = garage ? garage.width / 2 + 0.74 : 0;
  const fromDesign = access?.entryAlongM != null && access.entryAlongM > 0.5 && access.entryAlongM < front.len - 0.5
    ? access.entryAlongM
    : null;
  const preferred = fromDesign ?? front.len * (meeting && meeting.wall === front ? (meeting.s < front.len / 2 ? 0.69 : 0.31) : (k.seed % 2 === 0 ? 0.35 : 0.65));
  const door = garage
    ? (garage.s > front.len / 2 ? Math.max(0.91, (garage.s - clear) / 2) : Math.min(front.len - 0.91, (garage.s + clear + front.len) / 2))
    : Math.max(0.91, Math.min(front.len - 0.91, preferred));
  const garageWidth = garage ? (garage.width >= 5.28 ? 4.9 : Math.min(2.74, garage.width - 0.15)) : 0;
  const opening = garage ? [garage.s - garageWidth / 2 - 0.36, garage.s + garageWidth / 2 + 0.36] as [number, number] : null;
  if (garage && opening) {
    k.garage(front, garage.s - garageWidth / 2, garage.s + garageWidth / 2, 0.05, 2.12, { frame: palette.trim, leaf: palette.garage, lites: true });
    k.approach(front, garage.s, 0.01, garage.gap + 1.06, garageWidth + 0.16, 0.05, 'apron', WALK, 0.3);
    k.lamp(front, opening[0], 2.24);
  }
  const halfPorch = Math.min(1.49, door - 0.1, front.len - door - 0.1, opening ? Math.max(0.83, Math.abs(door - garage!.s) - garageWidth / 2 - 0.3) : 1.49);
  const porchDepth = 1.53;
  k.door(front, door, 0.93, FOUND + 0.035, 2.05, { frame: palette.frame, leaf: palette.door, lite: true, sidelight: halfPorch > 1.12 ? 0.3 : 0 });
  k.box(front, door - halfPorch, door + halfPorch, 0, porchDepth, 0, FOUND, PORCH);
  k.box(front, door - 0.65, door + 0.65, porchDepth, porchDepth + 0.27, 0, FOUND / 2, PORCH);
  const porchTop = Math.min((levels[0] ?? top) - 0.2, 2.67);
  const porch = new Frame(front);
  if (style !== 'modern' && halfPorch >= 1.09) {
    k.gable(porch, door - halfPorch, door + halfPorch, -porchDepth, 0.05, porchTop, 0.44, 'd',
      { over: 0.19, roof: palette.roof2, fascia: palette.fascia, wall: palette.gable, ends: [true, false] });
  } else {
    k.shed(porch, door - halfPorch - 0.18, door + halfPorch + 0.18, -porchDepth - 0.1, -0.012, porchTop - 0.22, porchTop + 0.11, palette.roof2, palette.fascia);
  }
  for (const s of [door - halfPorch + 0.19, door + halfPorch - 0.19]) {
    k.post(front, s, porchDepth - 0.2, FOUND, 0.55, 0.31, palette.found);
    k.post(front, s, porchDepth - 0.2, FOUND + 0.55, porchTop - FOUND - 0.69, 0.15, palette.post);
  }
  k.lamp(front, door + 0.67, 2.02);

  if (meeting) {
    const laneSide = meeting.s + (door > meeting.s ? 1 : -1) * Math.max(0, meeting.width / 2 - 0.19);
    k.approachBetween(on(front, door, porchDepth + 0.26), on(front, laneSide, Math.max(2.35, meeting.gap + 0.9)),
      1.12, FOUND / 2, 'walk', WALK, 0.31, front.n);
  }

  for (const wall of walls) {
    if (wall === front) {
      for (const fraction of [0.22, 0.49, 0.77]) {
        const s = front.len * fraction;
        if (s < 0.93 || s > front.len - 0.93 || Math.abs(s - door) < halfPorch + 0.38 || (opening && s > opening[0]! - 0.56 && s < opening[1]! + 0.56)) continue;
        k.windows(front, s, front.len >= 8 && fraction !== 0.49 ? 2 : 1, 0.78, 0.9, 2.26,
          { ...spec(palette), casing: palette.trim, sill: palette.trim });
      }
      if (levels.length > 1) wallWindows(k, front, levels.slice(1), palette, { base: levels[0] ?? FOUND });
    } else {
      wallWindows(k, wall, levels, palette, { every: 3.4 });
      if (wall.len > 5) k.downspout(wall, 0.18, FOUND, top - 0.06, palette.trim);
    }
  }
  return true;
}

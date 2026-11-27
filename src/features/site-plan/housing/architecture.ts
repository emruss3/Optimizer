import { METERS_PER_FOOT as FT } from '../../../engine/units';
import { Frame, Kit, inRing, CONCRETE, mat, tone, type Mat, type Wall, type V2 } from '../ui/architecture/kit';
import { drawWindowRoom, type WindowRoom } from '../ui/architecture/windowRooms';
import type { Surface } from '../ui/renderModel';
import { type HomeDesign, type Point, type Rect, type Face, type Finish } from './originalDesigns';
import { floorBase, normal, pointOn, wallsFor, type WallRun } from './drawings';

export const canonicalFront: Wall = { a: [0, 0], t: [1, 0], n: [0, -1], len: 1 };
const surface: Record<Finish, Surface> = {
  lap: 'siding',
  brick: 'brick',
  board: 'batten',
  limewash: 'brick',
  stone: 'concrete',
  cedar: 'wood',
};
function color(hex: string, material: Surface = 'plain'): Mat {
  const n = parseInt(hex.slice(1), 16);
  return mat(n >> 16, (n >> 8) & 255, n & 255, material);
}
const ROOF = mat(79, 76, 71, 'shingle'),
  METAL = mat(80, 83, 79, 'metal'),
  FRAME = mat(52, 58, 54, 'metalwork');
const inside = (p: Point, r: Rect) => p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];
function face(frame: Frame, w: WallRun): Wall {
  const p = pointOn(w, w.lo),
    q = pointOn(w, w.hi),
    a = frame.p(p[0] * FT, p[1] * FT),
    b = frame.p(q[0] * FT, q[1] * FT);
  const len = (w.hi - w.lo) * FT;
  const [nx, ny] = normal[w.face],
    outer: V2 = [nx * frame.w.t[0] - ny * frame.w.n[0], nx * frame.w.t[1] - ny * frame.w.n[1]];
  return { a, len, t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n: outer };
}
export function drawHome(kit: Kit, home: HomeDesign, front: Wall = canonicalFront, exposedEnds: Face[] = []) {
  const f = new Frame(front),
    [body, trimColor, accentColor] = home.palette;
  const trim = color(trimColor),
    accent = color(accentColor, 'wood');
  const wallMat = (finish: Finish) =>
    finish === 'brick'
      ? color(home.attached ? body : '#976f59', 'brick')
      : finish === 'cedar'
        ? mat(151, 118, 83, 'wood')
        : finish === 'stone'
          ? mat(175, 162, 141, 'concrete')
          : color(body, surface[finish]);
  const streetFinish = home.frontFinishStudy;
  const streetFascia = streetFinish === 'recessed-balcony' ? FRAME : streetFinish === 'quiet-trim' ? tone(trim, 0.76) : trim;
  const ring = ([x, y, w, d]: Rect) => f.ring(x * FT, (x + w) * FT, y * FT, (y + d) * FT);
  let roomViews = 0;
  const dressed = new Set<string>();
  for (let floor = 0; floor < home.levels.length; floor++) {
    const base = floorBase(home, floor) * FT,
      top = base + home.heights[floor]! * FT;
    for (const room of home.levels[floor]!.rooms) {
      const garage = room.name === 'Garage',
        z = garage ? 0.1 : base;
      const [x, y, w, d] = room.rect;
      const wing = home.rearLoadPrecedent && floor > 0
        ? home.volumes.find(v => floor >= v.first && floor < v.first + v.count && inside([x + w / 2, y + d / 2], v.rect))
        : undefined;
      // A thin rim behind the façade. The old coplanar trim at the slab edge fought the cladding
      // below it, leaving white flashes between stories. An exposed cantilever keeps its own finish.
      const inset = wing ? Math.min(0.03 / FT, w / 4, d / 4) : 0;
      kit.prism(
        ring([x + inset, y + inset, w - 2 * inset, d - 2 * inset]),
        floor === 0 ? 0 : z - 0.11,
        floor === 0 ? z : 0.11,
        floor === 0 ? mat(150, 139, 124, 'concrete') : wing ? wallMat(wing.finish) : trim,
        'base',
      );
    }
    const deck = home.balconyScreen?.level === floor
      ? home.levels[floor]!.rooms.find(r => r.name === 'Covered balcony') : undefined;
    for (const w of wallsFor(home, floor, exposedEnds).filter(e =>
      deck ? (e.other === deck.name || (e.room === deck.name ? !!e.other : !e.other)) : !e.other,
    )) {
      const wall = face(f, w),
        mid = pointOn(w, (w.lo + w.hi) / 2);
      const n = normal[w.face],
        inner: Point = [mid[0] - n[0] * 0.01, mid[1] - n[1] * 0.01];
      const wing = home.volumes.find(
        (v) => floor >= v.first && floor < v.first + v.count && inside(inner, v.rect),
      );
      const streetFace = w.face === 'front' && !w.other && !!streetFinish;
      const material = wallMat(streetFace && floor > 0 && streetFinish === 'recessed-balcony' ? 'board' : wing?.finish ?? 'lap'),
        z = w.room === 'Garage' ? 0.1 : base;
      const bodySegment = (a: number, b: number, bottom: number, end: number) =>
        kit.box(wall, (a - w.lo) * FT, (b - w.lo) * FT, -0.15, 0, bottom, end - bottom, material, 'body');
      let low = w.lo;
      for (const c of w.cuts.slice().sort((a, b) => a.at - b.at)) {
        const a = c.at - c.width / 2,
          b = c.at + c.width / 2,
          s = (c.at - w.lo) * FT,
          width = c.width * FT,
          sill = z + c.sill * FT,
          head = z + c.head * FT;
        bodySegment(low, a, z, top);
        bodySegment(a, b, z, sill);
        bodySegment(a, b, head, top);
        low = b;
        if (c.kind === 'window') {
          const room = home.levels[floor]!.rooms.find(r => r.name === w.room);
          const kind = /^bedroom \d+$/i.test(w.room) ? 'bedroom' : /living room|family room|great room|sitting|study/i.test(w.room) ? 'living' : null;
          const depth = room ? (w.face === 'front' || w.face === 'back' ? room.rect[3] : room.rect[2]) * FT : 0;
          const key = `${floor}|${w.room}`;
          const view: WindowRoom | null = !kit.lite && kind && (w.face === 'front' || w.face === 'back') &&
            width >= 0.74 && head - sill >= 0.42 && depth >= 1.06 && roomViews < 5 && !dressed.has(key)
            ? {
                left: Math.max(s - width / 2 - 0.58, ((room?.rect[0] ?? w.lo) - w.lo) * FT + 0.025),
                right: Math.min(s + width / 2 + 0.58, ((room ? room.rect[0] + room.rect[2] : w.hi) - w.lo) * FT - 0.025),
                depth: Math.min(depth - 0.18, 1.95), floor: z, ceiling: top, kind,
              }
            : null;
          if (view) { drawWindowRoom(kit, wall, view); dressed.add(key); roomViews++; }
          // The supplied streetscape is readable in shade because these
          // profiles make real highlights. Keep all metal and sill blocks
          // outside the existing glazing aperture, not painted on the pane.
          if (streetFace && !kit.lite && floor > 0 && head - sill > 0.42) {
            const left = Math.max(0, s - width / 2 - 0.09);
            const right = Math.min(wall.len, s + width / 2 + 0.09);
            const casing = streetFinish === 'contrasting-trim' ? trim : tone(trim, 0.82);
            kit.box(wall, left, right, 0.02, 0.23, sill - 0.105, 0.086, casing);
            kit.box(wall, left, right, 0.025, 0.185, head + 0.028, 0.024, streetFascia);
          }
          kit.window(wall, s, width, sill, head, {
            frame: FRAME,
            sill: trim,
            grid: c.width >= 4 ? [2, 2] : [1, 2],
            glazed: true,
            interiorDepth: 0.31,
            roomBehindGlass: !!view,
          });
        } else if (c.kind === 'garage') {
          kit.garage(wall, s - width / 2, s + width / 2, z, head - z, {
            frame: trim,
            leaf: tone(accent, 0.85),
            lites: home.garageDoor !== 'solid-sectional',
            rows: 4,
          }, home.garageDoor === 'solid-sectional' ? -0.065 : 0);
          kit.lamp(wall, s + width / 2 + 0.22, head - 0.3);
        } else if (c.kind === 'garden' && deck && (w.room === deck.name || w.other === deck.name)) {
          const side = w.room === deck.name ? { ...wall, n: [-wall.n[0], -wall.n[1]] as V2 } : wall;
          kit.window(side, s, width, z + 0.025, head, { frame: FRAME, grid: [2, 1], glazed: true });
        } else {
          kit.door(wall, s, width, z, head - z, { frame: trim, leaf: accent, lite: true });
          if (c.kind === 'entry') kit.lamp(wall, s + width / 2 + 0.18, head - 0.22);
        }
      }
      bodySegment(low, w.hi, z, top);
    }
    if (streetFinish && floor > 0) {
      const current = home.volumes.find(v => v.first === floor);
      const below = home.volumes.find(v => v.first + v.count === floor);
      if (current && below) {
        const [x, y, width, depth] = current.rect;
        const start = Math.max(x, below.rect[0]), end = Math.min(x + width, below.rect[0] + below.rect[2]);
        const back = Math.min(y + depth, below.rect[1]);
        if (end > start + 0.3 && back > y + 0.3) {
          // Offset from the slab's underside to avoid coplanar flicker, and
          // stop at the modeled supporting wall.
          const under = base - 0.113;
          const [a, b, c, d] = f.ring(start * FT, end * FT, y * FT, back * FT);
          kit.flat([a, d, c, b].map(p => [p![0], p![1], under]), tone(streetFascia, 0.85));
        }
      }
    }
    if (deck && home.balconyScreen) {
      const [x, y, w, d] = deck.rect.map(c => c * FT) as Rect;
      const edges = f.faces(x, x + w, y, y + d);
      const front = edges.front;
      const { width, openingAt, openingWidth } = home.balconyScreen;
      const screen = width * FT, a = (openingAt - openingWidth / 2) * FT, b = (openingAt + openingWidth / 2) * FT;
      const sill = base + 2.8 * FT, head = base + 6.9 * FT, batten = wallMat('board');
      kit.box(front, 0, screen, -0.12, 0, base, sill - base, batten);
      kit.box(front, 0, screen, -0.12, 0, head, top - head, batten);
      kit.box(front, 0, a, -0.12, 0, sill, head - sill, batten);
      kit.box(front, b, screen, -0.12, 0, sill, head - sill, batten);
      kit.box(front, a, b, -0.13, 0.04, sill, 0.05, trim);
      kit.box(front, a, b, -0.13, 0.04, head - 0.05, 0.05, trim);
      kit.rail(front, screen + 0.04, front.len - 0.06, -0.14, base, 'bars', FRAME);
      for (const edge of [edges.left, edges.right]) {
        kit.rail(edge, 0.09, edge.len - 0.09, -0.14, base, 'bars', FRAME);
        kit.post(edge, edge.len / 2, -0.13, base, top - base, 0.15, trim);
      }
      kit.post(front, front.len - 0.12, -0.1, base, top - base, 0.19, trim);
      kit.gable(f, x, x + screen, y - 0.12, y + 0.9, top, 4 / 12, 'd',
        { over: [0.08, 0.09], roof: ROOF, fascia: streetFinish ? streetFascia : trim, wall: batten, ends: [true, false] });
    }
  }
  for (const wing of home.volumes) {
    const [x, y, w, d] = wing.rect,
      end = wing.first + wing.count,
      z = floorBase(home, end) * FT;
    if (
      home.volumes.some(
        (other) => other.first === end && inside([x, y], other.rect) && inside([x + w, y + d], other.rect),
      )
    )
      continue;
    const material = wallMat(wing.finish);
    if (wing.ridge === 'flat') {
      kit.prism(ring(wing.rect), z, 0.065, mat(100, 99, 93, 'membrane'), 'detail');
      for (const edge of Object.values(f.faces(x * FT, (x + w) * FT, y * FT, (y + d) * FT))) {
        kit.box(edge, 0, edge.len, -0.2, 0, z, 0.29, material, 'parapet');
        kit.box(edge, 0, edge.len, -0.22, 0.035, z + 0.29, 0.045, trim);
      }
      continue;
    }
    if (wing.ridge === 'shed') {
      kit.shed(f, x * FT, (x + w) * FT, y * FT, (y + d) * FT, z, z + (d * FT * wing.pitch) / 12, METAL, trim);
      continue;
    }
    kit.gable(
      f,
      x * FT,
      (x + w) * FT,
      y * FT,
      (y + d) * FT,
      z,
      wing.pitch / 12,
      wing.ridge === 'depth' ? 'd' : 's',
      { over: 0.33, roof: ROOF, wall: material, fascia: streetFinish ? streetFascia : trim,
        ...(home.balconyScreen?.level === end - 1 ? { ends: [false, true] } : {}) },
    );
    const faces = f.faces(x * FT, (x + w) * FT, y * FT, (y + d) * FT);
    const gutterWall = wing.ridge === 'depth' ? faces.left : faces.front;
    if (!home.attached) kit.downspout(gutterWall, 0.24, 0.12, z - 0.15, trim);
  }
  if (home.roofBulkhead) {
    const base = floorBase(home, home.levels.length) * FT, rise = home.roofBulkhead.heightFt * FT;
    kit.prism(ring(home.roofBulkhead.rect), base, rise, wallMat('lap'), 'body');
    kit.prism(ring(home.roofBulkhead.rect), base + rise, 0.08, METAL, 'detail');
  }
  for (const porch of home.porches) {
    const [x, y, w, d] = porch.rect,
      z = floorBase(home, porch.level ?? 0) * FT,
      top = z + 8.25 * FT;
    kit.prism(ring(porch.rect), 0, z, CONCRETE, 'detail');
    const rear = y >= home.volumes[0]!.rect[1] + home.volumes[0]!.rect[3];
    const edge = rear ? y + d : y,
      wallY = rear ? y : y + d;
    const eave = top - 0.16,
      ridge = top + 0.24;
    kit.shed(
      f,
      (x - 0.6) * FT,
      (x + w + 0.6) * FT,
      (Math.min(edge, wallY) - 0.4) * FT,
      (Math.max(edge, wallY) + 0.4) * FT,
      rear ? ridge : eave,
      rear ? eave : ridge,
      porch.finish === 'metal' ? METAL : ROOF,
      trim,
    );
    const support = f.faces(x * FT, (x + w) * FT, y * FT, (y + d) * FT)[rear ? 'back' : 'front'];
    const posts = Math.max(2, Math.ceil((w - 1) / 10) + 1);
    for (let i = 0; i < posts; i++) {
      const s = (0.52 + ((w - 1.04) * i) / (posts - 1)) * FT;
      kit.post(support, s, -0.16, z, 0.43, 0.23, trim);
      kit.post(support, s, -0.16, z + 0.43, eave - z - 0.43, 0.15, trim);
    }
    kit.box(support, 0, w * FT, -0.26, -0.06, eave - 0.25, 0.24, trim);
  }
  // Exact threshold anchors also drive the street/entry cameras and grade the first step to the walk.
  for (const w of wallsFor(home, 0))
    for (const c of w.cuts) {
      if (c.kind !== 'entry' && c.kind !== 'garage') continue;
      const frontage = face(f, w),
        at = (c.at - w.lo) * FT;
      const p = home.porches.find(
        (v) =>
          w.face === 'front' &&
          c.at >= v.rect[0] &&
          c.at <= v.rect[0] + v.rect[2] &&
          w.fixed === v.rect[1] + v.rect[3],
      );
      const offset = c.kind === 'entry' && p ? p.rect[3] * FT : 0;
      kit.approach(
        frontage,
        at,
        offset,
        offset + (c.kind === 'entry' ? 0.73 : 0.28),
        c.kind === 'entry' ? 1.07 : c.width * FT,
        c.kind === 'entry' ? 0.3 : 0.1,
        c.kind === 'entry' ? 'walk' : 'apron',
        CONCRETE,
      );
    }
  return kit.done();
}

/** An authored house is located by its fixed origin and a second point on its positive x axis. */
export function placedArchitecture(
  h: HomeDesign,
  id: string,
  label: string,
  origin: number[],
  axisPoint: number[],
  lite: boolean,
  neighbours: number[][][],
) {
  const dx = axisPoint[0]! - origin[0]!,
    dy = axisPoint[1]! - origin[1]!,
    length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.01) return null;
  const front: Wall = {
    a: [origin[0]!, origin[1]!],
    t: [dx / length, dy / length],
    n: [dy / length, -dx / length],
    len: 1,
  };
  const kit = new Kit(id, label);
  kit.lite = lite;
  const ends: Face[] = [];
  if (h.attached) {
    const [x, y, w, d] = h.volumes[0]!.rect,
      f = new Frame(front);
    for (const side of ['left', 'right'] as const) {
      const sample = f.p((side === 'left' ? x - 1 : x + w + 1) * FT, (y + d / 2) * FT);
      if (!neighbours.some((r) => inRing(sample[0], sample[1], r))) ends.push(side);
    }
  }
  return drawHome(kit, h, front, ends);
}

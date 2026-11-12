// Row homes: one home of a townhome row, in each style. The two narrow ends
// are its fronts. The end a drive comes to has the garage; the other has the
// front door. The long sides are party walls where a neighbour stands against
// them, and walls with windows where the home ends the row.
import type { SceneHeight } from '../../scene/heights';
import { BLACK, Frame, Kit, as, frontOf, mat, pick, tone, wallsOf, type Mat, type V2, type Wall, type WindowSpec } from './kit';
import { CEDAR, MEMBRANE, housePalette, type ArchStyle, type HousePalette } from './styles';
import { FLAT_ROOF, PORCH, WALK, levelsM, reachOf, spec, wallWindows } from './house';

const SLAB = 0.25;
const BRICKS: Mat[] = [mat(150, 86, 68, 'brick'), mat(124, 84, 70, 'brick'), mat(172, 110, 86, 'brick'), mat(190, 174, 154, 'brick'), mat(106, 80, 72, 'brick')];

interface Row {
  k: Kit;
  /** Set on the front-door end: s across the home, d back toward the garage end. */
  f: Frame;
  W: number;
  D: number;
  lv: number[];
  p: HousePalette;
  /** A drive comes to the far end. */
  drive: boolean;
  /** A neighbour stands against the left side, the right side. */
  party: [boolean, boolean];
  /** How far straight out from a point on the door end the pavement is, or null. */
  reach: (s: number) => number | null;
}

/** The door end's ground story: a door to one side with a window beside it, a stoop and a walk. Returns where the door stands. */
function entry(r: Row, o: { leaf: Mat; frame: Mat; win: WindowSpec; sidelight?: number; transom?: boolean; d?: number }): number {
  const { k, f, W } = r;
  const doorS = W >= 5 ? 1.2 : W / 2, d = o.d ?? 0;
  const toPavement = r.reach(doorS);
  k.door(f.w, doorS, 0.95, SLAB + 0.05, 2.1, { frame: o.frame, leaf: o.leaf, lite: true, sidelight: o.sidelight ?? 0, transom: o.transom ?? true }, d);
  k.lamp(f.w, doorS + 0.75, SLAB + 2.0, d);
  if (W >= 5) k.windows(f.w, (doorS + 1.0 + W - 0.55) / 2, W >= 5.6 ? 2 : 1, 0.85, SLAB + 0.8, SLAB + 2.15, o.win, d);
  k.box(f.w, doorS - 0.8, doorS + 0.8, 0, 1.0, 0, SLAB, PORCH);
  k.box(f.w, doorS - 0.8, doorS + 0.8, 1.0, 1.32, 0, SLAB * 0.5, PORCH);
  if (toPavement != null && toPavement > 2.6) k.box(f.w, doorS - 0.55, doorS + 0.55, 1.32, Math.min(toPavement + 0.3, 12), 0, 0.2, WALK);
  if (W >= 5) k.bed(f.w, doorS + 1.0, W - 0.2, 0.12, 0.95);
  return doorS;
}

/** The far end's ground story: a garage door where a drive comes to it, a glazed door to a patio where none does. */
function rear(r: Row, back: Wall, o: { frame: Mat; trim: Mat; leaf: Mat; lites: boolean }): void {
  const { k, W, drive } = r;
  if (drive) {
    const gw = W >= 6 ? 4.9 : Math.min(2.75, W - 1.1);
    k.garage(back, W / 2 - gw / 2, W / 2 + gw / 2, 0.04, 2.15, { frame: o.trim, leaf: o.leaf, lites: o.lites });
  } else {
    k.window(back, W / 2, Math.min(1.8, W - 1.4), SLAB + 0.05, SLAB + 2.15, { frame: o.frame, grid: [2, 1] });
    k.box(back, 0.3, W - 0.3, 0.02, 2.4, 0, 0.2, PORCH);
  }
}

/** Two columns of windows on an end wall, on the stories from `from` to `to`. */
function columns(r: Row, w: Wall, from: number, to: number, win: WindowSpec, d = 0): void {
  const { k, W, lv } = r;
  const wide = W >= 6.6;
  for (let st = from; st < to; st++) {
    const zf = lv[st - 1] ?? SLAB, top = lv[st] ?? zf + 3;
    for (const s of W >= 4.8 ? [W * 0.28, W * 0.72] : [W / 2]) k.windows(w, s, wide ? 2 : 1, wide ? 0.8 : 1.0, zf + 0.75, Math.min(top - 0.3, zf + 2.4), win, d);
  }
}

/** The mansard row home: brick at the ground, coloured siding above, the top story in the mansard with a boxed dormer. */
function mansard(r: Row): void {
  const { k, f, W, D, lv, p, party } = r;
  const n = lv.length, zT = lv[n - 1] ?? 9, z1 = lv[0] ?? 3, zM = n >= 2 ? lv[n - 2] ?? z1 : zT;
  const ring = f.ring(0, W, 0, D), faces = f.faces(0, W, 0, D), inset = 0.8;
  const [pl, pr] = party;
  k.prism(ring, 0, SLAB, p.found, 'base');
  k.prism(ring, SLAB, z1 - SLAB, p.base, 'body');
  if (zM > z1 + 0.01) k.prism(ring, z1, zM - z1, p.body, 'body');
  const win = spec(p), boxed = spec(p, true);
  if (n === 1) k.parapet([ring], zT, 0.4, { wall: p.base, coping: p.trim, roof: FLAT_ROOF });
  else k.mansard(f, 0, W, 0, D, zM, zT, inset, { shingle: p.roof, cap: FLAT_ROOF, eave: p.trim, sides: [true, !pr, true, !pl], wall: p.body });
  const ends: Wall[] = [f.w, faces.back];
  // a band where the brick stops
  if (zM > z1 + 0.01) for (const w of ends) k.box(w, 0, W, 0, 0.05, z1 - 0.1, 0.2, p.trim);

  const doorS = entry(r, { leaf: p.door, frame: p.frame, win: boxed });
  rear(r, faces.back, { frame: p.frame, trim: p.trim, leaf: p.garage, lites: p.garageLites });
  // the second floor: a balcony over the door with glazed doors onto it
  if (n >= 3) {
    const zf = z1, top = lv[1] ?? zM;
    k.balcony(f.w, 0.35, W - 0.35, 1.15, zf + 0.04, { slab: p.trim, rail: p.railKind, railMat: p.rail });
    k.window(f.w, doorS + 0.1, 1.5, zf + 0.1, Math.min(top - 0.3, zf + 2.3), { frame: p.frame, grid: [2, 3] });
    if (W >= 5) k.windows(f.w, (doorS + 1.0 + W - 0.55) / 2, W >= 5.6 ? 2 : 1, 0.85, zf + 0.9, Math.min(top - 0.3, zf + 2.3), win);
    columns(r, f.w, 2, n - 1, win);
  }
  columns(r, faces.back, 1, n - 1, boxed);
  if (n >= 2) {
    const dw = Math.min(W - 2 * inset - 0.5, 3.1), panes = dw >= 2.5 ? 2 : 1;
    for (const w of ends) k.dormer(w, W / 2, dw, zM, zT, inset, { wall: as(p.body, 'batten'), lid: p.trim, panes, spec: win });
  }
  // where the home ends the row its side has windows, and dormers in the mansard
  ([[faces.left, pl], [faces.right, pr]] as Array<[Wall, boolean]>).forEach(([w, attached]) => {
    if (attached) return;
    const at = wallWindows(k, w, lv.slice(0, Math.max(1, n - 1)), p, { every: 4.4, base: SLAB, from: 1.6, to: w.len - 1.6 });
    if (n >= 2) for (const s of at) k.dormer(w, s, 1.45, zM, zT, inset, { wall: as(p.body, 'batten'), lid: p.trim, panes: 1, spec: win });
  });
}

/** The farmhouse row home: board and batten under a gable that faces the street, metal awnings over the doors. */
function gabled(r: Row): void {
  const { k, f, W, D, lv, p, party } = r;
  const n = lv.length, zT = lv[n - 1] ?? 9, z1 = lv[0] ?? 3;
  const ring = f.ring(0, W, 0, D), faces = f.faces(0, W, 0, D);
  const [pl, pr] = party;
  k.prism(ring, 0, SLAB, p.found, 'base');
  k.prism(ring, SLAB, zT - SLAB, p.body, 'body');
  const pitch = Math.min(0.83, 2.9 / (W / 2));
  const rise = k.gable(f, 0, W, 0, D, zT, pitch, 'd', { over: [pl && pr ? 0 : 0.3, 0.3], roof: p.roof, wall: p.body, fascia: p.fascia });
  const win = spec(p), ends: Wall[] = [f.w, faces.back];
  entry(r, { leaf: p.door, frame: p.frame, win, sidelight: W >= 6 ? 0.3 : 0 });
  rear(r, faces.back, { frame: p.frame, trim: p.trim, leaf: p.garage, lites: p.garageLites });
  for (const w of ends) {
    // a metal awning over the ground story, on timber brackets
    if (n >= 2) {
      const fr = new Frame(w);
      k.shed(fr, 0.12, W - 0.12, -0.95, 0, z1 - 0.2, z1 + 0.16, p.roof2, p.fascia);
      for (const s of [0.35, W - 0.35]) { k.box(w, s - 0.05, s + 0.05, 0, 0.8, z1 - 0.42, 0.1, p.post); k.box(w, s - 0.05, s + 0.05, 0, 0.1, z1 - 1.05, 0.65, p.post); }
    }
    columns(r, w, 1, n, win);
    // the peak of the gable faced in timber, a small window in it
    if (rise >= 1.6) {
      k.flat([[...new Frame(w).p(W / 2 - rise * 0.5 / pitch, -0.03), zT + rise * 0.5], [...new Frame(w).p(W / 2 + rise * 0.5 / pitch, -0.03), zT + rise * 0.5], [...new Frame(w).p(W / 2, -0.03), zT + rise]], p.gable === p.body ? CEDAR : p.gable);
      k.window(w, W / 2, 0.6, zT + 0.25, zT + 0.25 + Math.min(0.85, rise * 0.5 - 0.3), { frame: p.frame, grid: [1, 1] });
    }
  }
  ([[faces.left, pl], [faces.right, pr]] as Array<[Wall, boolean]>).forEach(([w, attached]) => {
    if (!attached) wallWindows(k, w, lv, p, { every: 4.4, base: SLAB, from: 1.6, to: w.len - 1.6 });
  });
}

/** The contemporary row home: a dark ground story, pale floors above, timber by the door, a deck on the roof. */
function modern(r: Row): void {
  const { k, f, W, D, lv, p, party } = r;
  const n = lv.length, zT = lv[n - 1] ?? 9, z1 = lv[0] ?? 3;
  const ring = f.ring(0, W, 0, D), faces = f.faces(0, W, 0, D);
  const [pl, pr] = party, dark = p.fascia;
  k.prism(ring, 0, SLAB, p.found, 'base');
  k.prism(ring, SLAB, z1 - SLAB, n === 1 ? p.body : p.base, 'body');
  if (n >= 2) k.prism(ring, z1, zT - z1, p.body, 'body');
  k.parapet([ring], zT, 0.42, { wall: p.body, coping: dark, roof: MEMBRANE });
  const plain: WindowSpec = { frame: p.frame }, split: WindowSpec = { frame: p.frame, grid: [3, 1] };
  const doorS = entry(r, { leaf: mat(40, 42, 46), frame: p.frame, win: { frame: p.frame, grid: [2, 1] }, sidelight: 0.3, transom: false });
  k.box(f.w, doorS - 0.85, doorS + 1.15, 0, 0.95, SLAB + 2.5, 0.07, dark);
  rear(r, faces.back, { frame: p.frame, trim: dark, leaf: p.garage, lites: false });
  // above: a strip of timber over the door with a slot of glass, and one wide window to a floor beside it
  const strip = Math.min(1.5, W * 0.28);
  if (n >= 2) k.box(f.w, doorS - strip / 2, doorS + strip / 2, 0, 0.06, z1, zT - z1, CEDAR);
  for (let st = 1; st < n; st++) {
    const zf = lv[st - 1] ?? z1, head = Math.min((lv[st] ?? zT) - 0.3, zf + 2.35);
    k.window(f.w, doorS, 0.6, zf + 0.9, head, plain, 0.06);
    const a = doorS + strip / 2 + 0.45, b = W - 0.55;
    if (b - a >= 1.2) {
      const top = st === n - 1 && n >= 3;
      k.window(f.w, (a + b) / 2, b - a, zf + (top ? 0.12 : 0.75), head, split);
      // glass across the foot of a window that comes down to the floor
      if (top) k.rail(f.w, a - 0.1, b + 0.1, 0.12, zf + 0.1, 'glass', BLACK, 1.0);
    }
    for (const s of W >= 4.8 ? [W * 0.28, W * 0.72] : [W / 2]) k.window(faces.back, s, Math.min(1.7, W * 0.3), zf + 0.9, head, { frame: p.frame, grid: [2, 1] });
  }
  // the roof: a timber deck at the door end behind glass, and the stair up to it
  if (n >= 2 && D >= 9 && W >= 4.6) {
    const z = zT + 0.05, mid = D * 0.5;
    k.prism(f.ring(0.34, W - 0.34, 0.34, mid), z, 0.07, CEDAR);
    k.rail(f.w, 0.2, W - 0.2, -0.14, zT + 0.48, 'glass', BLACK, 0.62);
    const head = f.faces(0.34, W - 0.34, mid, D - 1.0);
    k.prism(f.ring(0.34, W - 0.34, mid, D - 1.0), zT, 2.45, p.base, 'detail');
    k.prism(f.ring(0.2, W - 0.2, mid - 1.0, D - 0.86), zT + 2.45, 0.12, dark);
    k.window(head.front, head.front.len / 2, Math.min(2.2, head.front.len - 0.8), zT + 0.14, zT + 2.15, { frame: p.frame, grid: [2, 1] });
  }
  ([[faces.left, pl], [faces.right, pr]] as Array<[Wall, boolean]>).forEach(([w, attached]) => {
    if (attached) return;
    const count = Math.max(1, Math.round((w.len - 3) / 4.6));
    lv.forEach((top, st) => {
      const zf = st === 0 ? SLAB : lv[st - 1] ?? SLAB;
      for (let i = 0; i < count; i++) k.window(w, 1.5 + ((w.len - 3) * (i + 0.5)) / count, 1.4, zf + 1.0, Math.min(top - 0.3, zf + 2.3), { frame: p.frame, grid: [2, 1] });
    });
  });
}

/** The brick row home: a brick front under a cornice, tall windows with stone heads and sills, a stoop with a rail. */
function brick(r: Row): void {
  const { k, f, W, D, lv, p, party } = r;
  const n = lv.length, zT = lv[n - 1] ?? 9;
  const ring = f.ring(0, W, 0, D), faces = f.faces(0, W, 0, D);
  const [pl, pr] = party;
  const wall = pick(BRICKS, k.seed >>> 6), stone = mat(226, 218, 202, 'concrete');
  k.prism(ring, 0, SLAB + 0.35, stone, 'base');
  k.prism(ring, SLAB + 0.35, zT - SLAB - 0.35, wall, 'body');
  k.parapet([ring], zT, 0.5, { wall, coping: stone, roof: FLAT_ROOF });
  const win: WindowSpec = { frame: BLACK, grid: [1, 2], casing: null, sill: stone };
  const ends: Wall[] = [f.w, faces.back];
  const doorS = entry(r, { leaf: p.door, frame: p.trim, win });
  for (const side of [-0.78, 0.78]) {
    const post: Wall = { a: [f.w.a[0] + f.w.t[0] * (doorS + side), f.w.a[1] + f.w.t[1] * (doorS + side)], t: f.w.n, n: f.w.t, len: 1 };
    k.rail(post, 0.05, 1.0, 0, SLAB, 'bars', BLACK, 0.9);
  }
  rear(r, faces.back, { frame: BLACK, trim: stone, leaf: mat(44, 50, 48), lites: true });
  for (const w of ends) {
    columns(r, w, 1, n, win);
    // stone heads over the windows, and the cornice
    for (let st = 1; st < n; st++) {
      const zf = lv[st - 1] ?? SLAB, head = Math.min((lv[st] ?? zT) - 0.3, zf + 2.3);
      for (const s of W >= 4.8 ? [W * 0.28, W * 0.72] : [W / 2]) k.box(w, s - (W >= 6.6 ? 0.95 : 0.6), s + (W >= 6.6 ? 0.95 : 0.6), 0, 0.05, head, 0.2, stone);
    }
    k.box(w, 0, W, 0, 0.14, zT - 0.05, 0.2, tone(stone, 0.92));
    k.box(w, -0.02, W + 0.02, 0, 0.32, zT + 0.15, 0.3, stone);
  }
  ([[faces.left, pl], [faces.right, pr]] as Array<[Wall, boolean]>).forEach(([w, attached]) => {
    if (attached) return;
    const count = Math.max(1, Math.round((w.len - 3) / 4.4));
    lv.forEach((top, st) => {
      const zf = st === 0 ? SLAB + 0.35 : lv[st - 1] ?? SLAB;
      for (let i = 0; i < count; i++) k.window(w, 1.5 + ((w.len - 3) * (i + 0.5)) / count, 0.9, zf + 0.9, Math.min(top - 0.3, zf + 2.3), win);
    });
  });
}

/**
 * One home of a row. `attached` says whether a neighbour stands against a wall.
 * False when the footprint is not a rectangle a home can be built on.
 */
export function rowHome(k: Kit, rings: number[][][], height: SceneHeight, pavement: V2[], style: ArchStyle, attached: (w: Wall) => boolean): boolean {
  const walls = wallsOf(rings);
  if (rings.length !== 1 || walls.length !== 4) return false;
  const [w0, w1, w2, w3] = walls as [Wall, Wall, Wall, Wall];
  const square = walls.every((w, i) => { const nx = walls[(i + 1) % 4] as Wall; return Math.abs(w.t[0] * nx.t[0] + w.t[1] * nx.t[1]) < 0.05; });
  if (!square || Math.abs(w0.len - w2.len) > 0.4 || Math.abs(w1.len - w3.len) > 0.4) return false;
  // the garage end is the narrow end the pavement comes nearest to; the door end is the other
  const shortest = Math.min(...walls.map(w => w.len));
  const cand = [0, 1, 2, 3].filter(i => (walls[i] as Wall).len <= shortest + 0.6);
  const near = frontOf(cand.map(i => walls[i] as Wall), pavement);
  const gi = cand[near.index] ?? 0, ei = (gi + 2) % 4;
  const front = walls[ei] as Wall;
  const W = front.len, D = (walls[(ei + 1) % 4] as Wall).len;
  if (W < 3.6 || D < 6) return false;
  const f = new Frame(front), faces = f.faces(0, W, 0, D);
  const row: Row = {
    k, f, W, D, lv: levelsM(height), p: housePalette(style, k.seed),
    drive: near.dist != null && near.dist < 16,
    party: [attached(faces.left), attached(faces.right)],
    reach: s => reachOf(front, pavement, s),
  };
  if (style === 'modern') modern(row);
  else if (style === 'farmhouse') gabled(row);
  else if (style === 'heritage') brick(row);
  else mansard(row);
  return true;
}

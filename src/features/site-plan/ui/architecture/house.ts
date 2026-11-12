// Detached houses. Each style builds its own kind of house on the plan's pad:
// gabled (the modern farmhouse, the craftsman, and the one-story cottage of the
// mansard style), mansard, and flat-roofed.
//
// A pad is a rectangle. The house keeps to it: the walls stand on its lines or
// inside them (a porch is cut into the pad, not added to it), and they rise to
// the scene's story levels. Roofs, porches, doors and windows are illustration.
import { METERS_PER_FOOT } from '../../../../engine/units';
import type { SceneHeight } from '../../scene/heights';
import { BLACK, Frame, Kit, frontOf, mat, mirror, wallsOf, type V2, type Wall, type WindowSpec } from './kit';
import { CEDAR, MEMBRANE, housePalette, type ArchStyle, type HousePalette } from './styles';

export const levelsM = (h: SceneHeight): number[] => h.levelsFt.map(f => f * METERS_PER_FOOT);
/** How much foundation shows under the walls of a house. */
export const FOUND = 0.32;
export const PORCH = mat(206, 202, 194, 'concrete');
export const WALK = mat(212, 208, 198, 'concrete');
export const FLAT_ROOF = mat(104, 106, 110);
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const spec = (p: HousePalette, planter = false): WindowSpec => ({ frame: p.frame, grid: p.grid, casing: p.casing, sill: p.sill, planter: planter && p.planters });

/** Where a drive comes to a wall: the stretch of the wall the pavement touches. */
export function apronOn(w: Wall, pavement: V2[]): [number, number] | null {
  let lo = Infinity, hi = -Infinity, n = 0;
  for (const p of pavement) {
    const vx = p[0] - w.a[0], vy = p[1] - w.a[1];
    const s = vx * w.t[0] + vy * w.t[1], d = vx * w.n[0] + vy * w.n[1];
    if (d < -0.4 || d > 1.5 || s < -0.6 || s > w.len + 0.6) continue;
    lo = Math.min(lo, s); hi = Math.max(hi, s); n++;
  }
  if (n < 2 || hi - lo < 1.5) return null;
  return [Math.max(0, lo), Math.min(w.len, hi)];
}

interface Lot {
  k: Kit;
  /** Set on the front wall: s along it from the end the garage is at, d back into the house. */
  f: Frame;
  W: number;
  D: number;
  /** Top of each story, metres. */
  lv: number[];
  p: HousePalette;
  style: ArchStyle;
  /** Garage doors' worth of drive at the front; none where no drive comes to the house. */
  garage: 0 | 1 | 2;
  /** How far straight out from a point on the front the street is, or null: where a walk from the door ends. */
  reach: (s: number) => number | null;
}

/** Windows along a wall, story by story. Returns where along the wall they stand. */
export function wallWindows(k: Kit, w: Wall, lv: number[], p: HousePalette, o: { from?: number; to?: number; skipGround?: [number, number] | null; every?: number; base?: number } = {}): number[] {
  const a = o.from ?? 0.9, b = o.to ?? w.len - 0.9, len = b - a;
  if (len < 1.2) return [];
  const count = Math.max(1, Math.round(len / (o.every ?? 3.6)));
  const at = Array.from({ length: count }, (_, i) => a + (len * (i + 0.5)) / count);
  lv.forEach((top, st) => {
    const zf = st === 0 ? o.base ?? FOUND : lv[st - 1] ?? FOUND;
    const sill = zf + (st === 0 ? 0.85 : 0.95), head = Math.min(top - 0.3, zf + (st === 0 ? 2.1 : 2.25));
    if (head - sill < 0.7) return;
    for (const s of at) {
      if (st === 0 && o.skipGround && s > o.skipGround[0] && s < o.skipGround[1]) continue;
      k.window(w, s, 0.82, sill, head, spec(p));
    }
  });
  return at;
}

/** The back of a house: a glazed door to a patio, and windows. Returns where the windows stand. */
export function backWall(k: Kit, back: Wall, lv: number[], p: HousePalette): number[] {
  const c = clamp(back.len * 0.32, 1.6, back.len - 1.6);
  k.window(back, c, 1.8, FOUND + 0.05, FOUND + 2.1, { frame: p.frame, grid: [2, 1] });
  k.box(back, c - 2.1, c + 2.1, 0.02, 2.7, 0, 0.2, PORCH);
  return wallWindows(k, back, lv, p, { skipGround: [c - 1.5, c + 1.5] });
}

/**
 * How far straight out from a point on a wall the pavement is: the nearest of
 * it within a few metres to either side, leaving out a stretch of the wall
 * (the drive that comes to the garage, which a walk does not lead to).
 */
export function reachOf(w: Wall, pavement: V2[], s: number, except: [number, number] | null = null): number | null {
  let best = Infinity;
  for (const p of pavement) {
    const vx = p[0] - w.a[0], vy = p[1] - w.a[1];
    const ps = vx * w.t[0] + vy * w.t[1], d = vx * w.n[0] + vy * w.n[1];
    if (d < 0.6 || Math.abs(ps - s) > 4.5) continue;
    if (except && ps > except[0] - 0.4 && ps < except[1] + 0.4) continue;
    if (d < best) best = d;
  }
  return best < 40 ? best : null;
}

/** A step at a door and a walk from it to the pavement. */
export function approach(k: Kit, w: Wall, s: number, toPavement: number | null, from = 0.06): void {
  k.box(w, s - 0.85, s + 0.85, from, from + 0.36, 0, FOUND * 0.55, PORCH);
  if (toPavement != null && toPavement > 2.4) k.box(w, s - 0.6, s + 0.6, from + 0.36, Math.min(toPavement + 0.3, 14), 0, 0.2, WALK);
}

/**
 * A gabled house. One end of the front stands forward as a block, a garage
 * where a drive comes to the house and a room where none does, and the rest of
 * the front is a porch cut into the pad. A wide pad has its ridge along the
 * street and the block's gable running back into the roof; a deep one turns
 * its gable to the street, with the block under a lower gable of its own.
 */
function gabled({ k, f, W, D, lv, p, style, garage: wanted, reach }: Lot): void {
  const n = lv.length, zT = lv[n - 1] ?? 3, z1 = lv[0] ?? zT;
  const wide = W >= D * 1.1;
  const O = style === 'heritage' ? 0.6 : 0.3;
  const P = clamp(D * 0.16, 1.5, 2.1);
  let wb = wanted === 2 ? 6.0 : wanted === 1 ? 3.9 : clamp(W * 0.38, 3.2, 4.6);
  wb = Math.min(wb, W - 2.7, wide ? D - P - 0.8 : W);
  const block = wb >= 2.6;
  const garage: 0 | 1 | 2 = !block || wb < 3.3 || !wanted ? 0 : wanted === 2 && wb < 5.6 ? 1 : wanted;
  const s0 = block ? wb : 0;                              // where the porch starts
  const upper = n >= 2;
  const under = wide && !upper;                           // the porch is under the main roof
  const d0 = under ? 0 : P;                               // where the main roof starts
  const span = wide ? D - d0 : W;
  const pitch = Math.min(style === 'farmhouse' ? 0.83 : style === 'heritage' ? 0.5 : 0.62, (upper ? 4.2 : 3.4) / (span / 2));
  const fw = f.w;

  // walls: a foundation, then the house, with the palette's base where it has one
  const zm = p.base === p.body ? 0 : upper ? z1 : FOUND + 0.95;
  const wall = (ring: V2[], zA: number, zB: number): void => {
    if (zm > zA + 0.01 && zm < zB - 0.01) { k.prism(ring, zA, zm - zA, p.base, 'body'); k.prism(ring, zm, zB - zm, p.body, 'body'); }
    else k.prism(ring, zA, zB - zA, zm >= zB - 0.01 ? p.base : p.body, 'body');
  };
  k.prism(f.ring(0, W, 0, D), 0, FOUND, p.found, 'base');
  const L: V2[] = block ? [f.p(0, 0), f.p(wb, 0), f.p(wb, P), f.p(W, P), f.p(W, D), f.p(0, D)] : f.ring(0, W, P, D);
  // a wide house's block rises with it; a deep one's is one story under its own roof
  const zb = wide ? zT : upper ? z1 - 0.2 : zT - 0.3;
  if (wide || !block) wall(L, FOUND, zT);
  else { wall(L, FOUND, zb); wall(f.ring(0, W, P, D), zb, zT); }

  // roofs
  const main = f.faces(0, W, P, D);
  const rise = k.gable(f, 0, W, d0, D, zT, pitch, wide ? 's' : 'd', { over: O, roof: p.roof, wall: style === 'heritage' ? p.gable : p.body, fascia: p.fascia });
  let blockRise = 0;
  if (block) {
    if (wide) blockRise = k.crossGable(f, 0, wb, 0, zT, pitch, O, d0, { roof: p.roof, wall: p.gable, fascia: p.fascia });
    else {
      const pb = upper ? Math.min(pitch, (z1 + 0.8 - zb) / (wb / 2)) : pitch;
      blockRise = k.gable(f, 0, wb, 0, P, zb, pb, 'd', { over: [O * 0.8, O], roof: p.roof, wall: p.gable, fascia: p.fascia, ends: [true, false] });
    }
  }
  // a deep house carries a gable on the side wall away from its block, and a wide one a gable at the back
  if (!wide && D - P >= 8.5) {
    const wc = Math.min(W * 0.5, (D - P) * 0.42), c = main.right.len * 0.56;
    k.crossGable(new Frame(main.right), c - wc / 2, c + wc / 2, 0, zT, pitch, O, 0, { roof: p.roof, wall: style === 'heritage' ? p.gable : p.body, fascia: p.fascia });
  } else if (wide && W >= 11) {
    const wc = Math.min((D - d0) * 0.6, W * 0.36), c = W * 0.36;
    k.crossGable(new Frame(main.back), c - wc / 2, c + wc / 2, 0, zT, pitch, O, 0, { roof: p.roof, wall: style === 'heritage' ? p.gable : p.body, fascia: p.fascia });
  }

  // the porch: a floor, posts and a beam at the front line, and where it is not under the main roof a low roof of its own
  const zh = upper ? z1 + 0.45 : zT - 0.12, zl = zh - (upper ? 0.2 : 0.11) * (P + 0.3);
  const sEnd = upper ? W + 0.25 : wide ? W : W - 0.12;
  const beamTop = under ? zT - 0.02 : zl - 0.05;
  if (!under) k.shed(f, block ? wb + O + 0.02 : -0.25, sEnd, -0.3, P, zl, zh, p.roof2, p.fascia);
  k.box(fw, s0, Math.min(W, sEnd), -0.2, -0.04, beamTop - 0.2, 0.2, p.fascia);
  k.prism(f.ring(s0, W, -0.06, P), FOUND, 0.05, PORCH);
  if (under) k.prism(f.ring(s0, W, 0, P), zT - 0.07, 0.05, p.trim);
  const Lp = W - s0, bays = Math.max(1, Math.ceil(Lp / 2.9)), bay = Lp / bays, postTop = beamTop - 0.2;
  for (let i = block ? 1 : 0; i <= bays; i++) {
    const s = s0 + bay * i + (i === bays ? -0.2 : i === 0 ? 0.2 : 0);
    if (style === 'heritage') {
      k.post(fw, s, -0.16, FOUND + 0.05, 0.85, 0.46, p.found);
      k.post(fw, s, -0.16, FOUND + 0.9, 0.07, 0.54, p.trim);
      k.post(fw, s, -0.16, FOUND + 0.97, postTop - FOUND - 0.97, 0.26, p.post);
    } else {
      k.post(fw, s, -0.13, FOUND + 0.05, postTop - FOUND - 0.05, 0.16, p.post);
    }
  }

  // the front, a porch bay at a time: the door in the first, windows in the rest
  const sd = s0 + bay / 2;
  const side = bay >= 2.5 ? 0.34 : 0;
  k.door(main.front, sd - side / 2, 0.95, FOUND + 0.05, 2.05, { frame: p.frame, leaf: p.door, lite: true, sidelight: side, transom: upper });
  const panesOf = (i: number) => (i === 0 ? 1 : bay >= 3.3 ? 3 : bay >= 2.3 ? 2 : 1);
  for (let i = 1; i < bays; i++) k.windows(main.front, s0 + bay * (i + 0.5), panesOf(i), 0.82, FOUND + 0.7, FOUND + 2.1, spec(p, true));
  for (let st = 1; st < n; st++) {
    const zf = lv[st - 1] ?? z1, sill = zf + 0.95, head = Math.min(zf + 2.25, (lv[st] ?? zT) - 0.3);
    for (let i = 0; i < bays; i++) k.windows(main.front, s0 + bay * (i + 0.5), panesOf(i), 0.82, sill, head, spec(p));
    if (block) k.windows(wide ? fw : main.front, wb / 2, 2, 0.82, sill, head, spec(p));
  }
  // the block: a garage door under an awning, or a room's windows; a small window in its gable
  if (block) {
    if (garage) {
      const gw = garage === 2 ? 4.9 : Math.min(2.75, wb - 0.9);
      k.garage(fw, wb / 2 - gw / 2, wb / 2 + gw / 2, 0.04, 2.15, { frame: p.trim, leaf: p.garage, lites: p.garageLites });
      if (style !== 'heritage') {
        k.box(fw, wb / 2 - gw / 2 - 0.25, wb / 2 + gw / 2 + 0.25, 0, 0.6, 2.42, 0.07, p.roof2);
        for (const s of [wb / 2 - gw / 2 - 0.12, wb / 2 + gw / 2 + 0.12]) k.box(fw, s - 0.05, s + 0.05, 0, 0.5, 2.3, 0.12, p.post);
      }
    } else {
      k.windows(fw, wb / 2, wb >= 4 ? 3 : 2, 0.82, FOUND + 0.7, FOUND + 2.1, spec(p, true));
      k.bed(fw, 0.2, wb - 0.2, 0.12, 1.0);
    }
    const zg = wide ? zT : zb;
    if (blockRise >= 1.5) k.window(fw, wb / 2, 0.62, zg + 0.3, zg + 0.3 + Math.min(0.9, blockRise - 0.85), { frame: p.frame, grid: [1, 1], casing: p.casing });
  }
  // a pair of small windows high in a gable that faces the street
  if (!wide && rise >= 2.6) k.windows(main.front, W / 2, 2, 0.6, zT + rise * 0.42, zT + rise * 0.42 + 0.85, { frame: p.frame, grid: [1, 1], casing: p.casing });

  // sides and back
  if (wide) {
    const left = f.faces(0, W, 0, D).left;
    wallWindows(k, left, lv, p, { skipGround: garage ? [left.len - 6.4, left.len + 1] : null });
  } else {
    wallWindows(k, main.left, lv, p, { skipGround: garage ? [main.left.len - 6.4 + P, main.left.len + 1] : null });
  }
  wallWindows(k, main.right, lv, p);
  backWall(k, main.back, lv, p);
  // a brick chimney on the far side wall
  if (style === 'heritage') {
    const c = wide ? main.right.len / 2 : main.right.len * 0.3;
    const top = wide ? zT + rise + 0.7 : zT + pitch * 0.6 + 1.0;
    k.box(main.right, c - 0.55, c + 0.55, -0.6, 0.03, FOUND, top - FOUND, p.found);
    k.box(main.right, c - 0.62, c + 0.62, -0.67, 0.1, top, 0.1, p.trim);
  }

  approach(k, fw, sd, reach(sd));
  k.bed(fw, s0 + 0.25, sd - 1.05, 0.12, 1.0);
  k.bed(fw, sd + 1.05, W - 0.15, 0.12, 1.0);
}

/**
 * A mansard house: a brick ground story, siding above where there are three
 * stories or more, and the top story in a shingled mansard with boxed dormers.
 */
function mansard({ k, f, W, D, lv, p, garage, reach }: Lot): void {
  const n = lv.length, zT = lv[n - 1] ?? 6, z1 = lv[0] ?? 3, zM = lv[n - 2] ?? z1;
  const inset = 0.85, fw = f.w;
  const ring = f.ring(0, W, 0, D);
  k.prism(ring, 0, FOUND, p.found, 'base');
  k.prism(ring, FOUND, z1 - FOUND, p.base, 'body');
  if (zM > z1 + 0.01) {
    k.prism(ring, z1, zM - z1, p.body, 'body');
    k.prism(f.ring(-0.05, W + 0.05, -0.05, D + 0.05), z1 - 0.09, 0.18, p.trim);
  }
  k.mansard(f, 0, W, 0, D, zM, zT, inset, { shingle: p.roof, cap: FLAT_ROOF, eave: p.trim });

  // the front in columns: a garage where a drive comes, a door, and windows; the floors above line up on them
  const cols: Array<{ s: number; kind: 'garage' | 'door' | 'window'; panes: number; width: number }> = [];
  if (garage) {
    const gw = garage === 2 ? 4.9 : 2.7;
    cols.push({ s: 0.7 + gw / 2, kind: 'garage', panes: 2, width: gw });
    const rest = W - (1.4 + gw);
    if (rest >= 1.6) cols.push({ s: 1.4 + gw + Math.min(0.95, rest / 2), kind: 'door', panes: 1, width: 0.95 });
    if (rest >= 4.2) cols.push({ s: 1.4 + gw + 1.9 + (rest - 1.9) / 2, kind: 'window', panes: rest >= 5.4 ? 2 : 1, width: 0 });
  } else {
    // kept in from the corners, so a dormer over an end column clears the hip of the mansard
    const count = W >= 11 ? 5 : W >= 6.4 ? 3 : 2, bay = (W - 1.8) / count, mid = count === 2 ? 0 : (count - 1) / 2;
    for (let i = 0; i < count; i++) cols.push({ s: 0.9 + bay * (i + 0.5), kind: i === mid ? 'door' : 'window', panes: bay >= 2.5 ? 2 : 1, width: 0.95 });
  }
  let doorAt = W / 2;
  for (const c of cols) {
    if (c.kind === 'garage') k.garage(fw, c.s - c.width / 2, c.s + c.width / 2, 0.04, 2.15, { frame: p.trim, leaf: p.garage, lites: p.garageLites });
    else if (c.kind === 'door') {
      doorAt = c.s;
      k.door(fw, c.s, 0.95, FOUND + 0.05, 2.1, { frame: p.frame, leaf: p.door, lite: true, transom: true });
      // a balcony over the door on a taller house, a flat canopy on a two-story one
      if (n >= 3) k.balcony(fw, c.s - 1.35, c.s + 1.35, 1.15, z1 + 0.04, { slab: p.trim, rail: p.railKind, railMat: p.rail });
      else k.box(fw, c.s - 0.95, c.s + 0.95, 0, 0.85, FOUND + 2.72, 0.08, p.roof2);
    } else k.windows(fw, c.s, c.panes, 0.82, FOUND + 0.7, FOUND + 2.1, spec(p, true));
    for (let st = 1; st < n - 1; st++) {
      const zf = lv[st - 1] ?? z1, head = Math.min(zf + 2.25, (lv[st] ?? zT) - 0.3);
      if (c.kind === 'door' && st === 1) k.window(fw, c.s, 1.5, zf + 0.1, head, { frame: p.frame, grid: [2, 3] });
      else k.windows(fw, c.s, c.kind === 'garage' ? 2 : c.panes, 0.82, zf + 0.95, head, spec(p, st === 1));
    }
    const panes = c.kind === 'garage' ? 2 : c.kind === 'door' ? 1 : c.panes;
    k.dormer(fw, c.s, panes === 1 ? 1.45 : 2.3, zM, zT, inset, { wall: p.body, lid: p.trim, panes, spec: spec(p) });
  }

  // sides and back: windows up to the mansard, a dormer over each line of them
  const faces = f.faces(0, W, 0, D), below = lv.slice(0, n - 1);
  for (const w of [faces.left, faces.right]) {
    const at = wallWindows(k, w, below, p, { skipGround: garage && w === faces.left ? [w.len - 6.4, w.len + 1] : null });
    for (const s of at) k.dormer(w, s, 1.45, zM, zT, inset, { wall: p.body, lid: p.trim, panes: 1, spec: spec(p) });
  }
  for (const s of backWall(k, faces.back, below, p)) k.dormer(faces.back, s, 1.45, zM, zT, inset, { wall: p.body, lid: p.trim, panes: 1, spec: spec(p) });

  k.box(fw, doorAt - 0.95, doorAt + 0.95, 0, 0.95, 0, FOUND, PORCH);
  approach(k, fw, doorAt, reach(doorAt), 0.95);
  const edges = cols.filter(c => c.kind !== 'window').flatMap(c => [c.s - c.width / 2 - 0.5, c.s + c.width / 2 + 0.5]).sort((a, b) => a - b);
  let from = 0.2;
  for (let i = 0; i < edges.length; i += 2) { k.bed(fw, from, (edges[i] ?? W) - 0.1, 0.12, 1.0); from = (edges[i + 1] ?? W) + 0.1; }
  k.bed(fw, from, W - 0.2, 0.12, 1.0);
}

/**
 * A flat-roofed house. One story: a dark block and a white one under roofs
 * that sail past the walls, the entry between them faced in cedar. Two and
 * more: a dark ground story with the entry cut into it, and white floors above
 * that carry over it, behind a parapet.
 */
function modern({ k, f, W, D, lv, p, garage: wanted, reach }: Lot): void {
  const n = lv.length, zT = lv[n - 1] ?? 3, z1 = lv[0] ?? zT, fw = f.w;
  const P = clamp(D * 0.14, 1.4, 1.9);
  let wb = wanted === 2 ? 6.0 : wanted === 1 ? 3.9 : clamp(W * 0.42, 3.4, 5.2);
  wb = Math.min(wb, W - 2.8);
  const block = wb >= 2.6;
  const garage: 0 | 1 | 2 = !block || wb < 3.3 || !wanted ? 0 : wanted === 2 && wb < 5.6 ? 1 : wanted;
  const s0 = block ? wb : 0, Lp = W - s0;
  const dark = p.fascia, big: WindowSpec = { frame: p.frame, grid: [2, 1] }, one: WindowSpec = { frame: p.frame };
  const main = f.faces(s0, W, P, D);
  k.prism(f.ring(0, W, 0, D), 0, FOUND, p.found, 'base');
  const sd = s0 + 0.95;
  const glass = (w: Wall, a: number, b: number, zA: number, zB: number): void => {
    const width = b - a;
    if (width < 0.9) return;
    const count = Math.max(1, Math.round(width / 1.25));
    k.windows(w, (a + b) / 2, count, (width - (count - 1) * 0.06) / count, zA, zB, one, 0, 0.06);
  };

  if (n === 1) {
    const zB = zT - 0.32;
    if (block) k.prism(f.ring(0, wb, 0, D), FOUND, zB - FOUND, p.base, 'body');
    k.prism(f.ring(s0, W, P, D), FOUND, zT - FOUND, p.body, 'body');
    // the roofs: a deep dark edge, a pale top
    const slab = (a: number, b: number, c: number, d: number, z: number): void => {
      k.prism(f.ring(a, b, c, d), z, 0.26, dark);
      k.prism(f.ring(a + 0.12, b - 0.12, c + 0.12, d - 0.12), z + 0.26, 0.03, MEMBRANE);
    };
    if (block) slab(-0.35, wb + 0.12, -0.45, D + 0.35, zB);
    slab(s0 - (block ? 0.3 : 0.5), W + 0.5, -0.4, D + 0.5, zT);
    // the entry wall in cedar, a dark door, glass from the floor to the head
    k.box(main.front, 0, Math.min(Lp, 2.3), 0, 0.05, FOUND, zT - FOUND, CEDAR);
    k.door(main.front, 0.95, 1.0, FOUND + 0.05, 2.2, { frame: p.frame, leaf: mat(40, 42, 46), sidelight: 0.4 }, 0.05);
    glass(main.front, 2.6, Lp - 0.5, FOUND + 0.2, zT - 0.45);
    k.post(fw, W - 0.2, -0.14, FOUND + 0.05, zT - FOUND - 0.05, 0.1, BLACK);
    if (block) {
      const front = f.faces(0, wb, 0, D).front;
      if (garage) {
        const gw = garage === 2 ? 4.9 : Math.min(2.75, wb - 0.9);
        k.garage(front, wb / 2 - gw / 2, wb / 2 + gw / 2, 0.04, 2.2, { frame: dark, leaf: p.garage, lites: false, rows: 5 });
      } else {
        k.window(front, wb / 2, Math.min(2.6, wb - 1.2), zB - 1.25, zB - 0.45, { frame: p.frame, grid: [3, 1] });
        k.bed(front, 0.2, wb - 0.2, 0.12, 1.0);
      }
    }
  } else {
    // the ground story, the entry cut into it
    const L: V2[] = block ? [f.p(0, 0), f.p(wb, 0), f.p(wb, P), f.p(W, P), f.p(W, D), f.p(0, D)] : f.ring(0, W, P, D);
    k.prism(L, FOUND, z1 - FOUND, p.base, 'body');
    const ring = f.ring(0, W, 0, D);
    k.prism(ring, z1, zT - z1, p.body, 'body');
    k.parapet([ring], zT, 0.42, { wall: p.body, coping: dark, roof: MEMBRANE });
    k.prism(f.ring(s0, W, -0.04, P), FOUND, 0.05, PORCH);
    k.box(main.front, 0, Math.min(Lp, 2.3), 0, 0.05, FOUND, z1 - FOUND, CEDAR);
    k.door(main.front, 0.95, 1.0, FOUND + 0.05, 2.2, { frame: p.frame, leaf: mat(40, 42, 46), sidelight: 0.4 }, 0.05);
    glass(main.front, 2.6, Lp - 0.5, FOUND + 0.2, z1 - 0.5);
    k.post(fw, W - 0.2, -0.14, FOUND + 0.05, z1 - FOUND - 0.05, 0.1, BLACK);
    if (block) {
      if (garage) {
        const gw = garage === 2 ? 4.9 : Math.min(2.75, wb - 0.9);
        k.garage(fw, wb / 2 - gw / 2, wb / 2 + gw / 2, 0.04, 2.2, { frame: dark, leaf: p.garage, lites: false, rows: 5 });
      } else {
        k.window(fw, wb / 2, Math.min(2.6, wb - 1.2), z1 - 1.45, z1 - 0.55, { frame: p.frame, grid: [3, 1] });
        k.bed(fw, 0.2, wb - 0.2, 0.12, 1.0);
      }
      // the floors over the block are faced in cedar
      k.box(fw, 0, wb, 0, 0.06, z1, zT - z1, CEDAR);
    }
    for (let st = 1; st < n; st++) {
      const zf = lv[st - 1] ?? z1, top = lv[st] ?? zT;
      if (block) k.window(fw, wb / 2, Math.min(2.8, wb - 1.0), zf + 1.1, Math.min(top - 0.35, zf + 2.2), { frame: p.frame, grid: [3, 1] }, 0.06);
      glass(fw, s0 + 0.5, W - 0.5, zf + 0.45, Math.min(top - 0.35, zf + 2.35));
    }
  }

  // sides and back
  const full = f.faces(0, W, 0, D), rec = f.faces(0, W, P, D);
  const side = (w: Wall, skipGround: [number, number] | null): void => {
    const count = Math.max(1, Math.round((w.len - 1.8) / 4.2));
    lv.forEach((top, st) => {
      const zf = st === 0 ? FOUND : lv[st - 1] ?? FOUND;
      for (let i = 0; i < count; i++) {
        const s = 0.9 + ((w.len - 1.8) * (i + 0.5)) / count;
        if (st === 0 && skipGround && s > skipGround[0] && s < skipGround[1]) continue;
        k.window(w, s, 1.5, zf + 1.0, Math.min(top - 0.35, zf + 2.25), big);
      }
    });
  };
  if (block) side(full.left, garage ? [D - 6.4, D + 1] : null);
  else if (n === 1) side(rec.left, null);
  else side(full.left, [D - P - 0.6, D + 1]);
  if (n === 1) side(rec.right, null);
  else side(full.right, [-1, P + 0.6]);
  const c = clamp(W * 0.32, 1.9, W - 1.9);
  k.window(full.back, c, 2.6, FOUND + 0.05, FOUND + 2.2, { frame: p.frame, grid: [3, 1] });
  k.box(full.back, c - 2.4, c + 2.4, 0.02, 3.0, 0, 0.2, PORCH);
  for (let st = 1; st < n; st++) {
    const zf = lv[st - 1] ?? z1;
    for (const s of [W * 0.28, W * 0.72]) k.window(full.back, s, 1.6, zf + 1.0, Math.min((lv[st] ?? zT) - 0.35, zf + 2.25), big);
  }
  if (n === 1 && W - c > 3.4) k.window(full.back, c + (W - c) / 2 + 0.7, 1.6, FOUND + 0.95, zT - 0.45, big);

  approach(k, fw, sd, reach(sd));
  k.bed(fw, sd + 1.2, W - 0.15, 0.12, 1.0);
}

/** A detached house on a four-cornered pad. False when the pad is not a rectangle a house can be built on. */
export function house(k: Kit, rings: number[][][], height: SceneHeight, pavement: V2[], style: ArchStyle, palette?: HousePalette): boolean {
  const walls = wallsOf(rings);
  if (rings.length !== 1 || walls.length !== 4) return false;
  const [w0, w1, w2, w3] = walls as [Wall, Wall, Wall, Wall];
  const square = walls.every((w, i) => { const nx = walls[(i + 1) % 4] as Wall; return Math.abs(w.t[0] * nx.t[0] + w.t[1] * nx.t[1]) < 0.05; });
  if (!square || Math.abs(w0.len - w2.len) > 0.4 || Math.abs(w1.len - w3.len) > 0.4) return false;
  const { index } = frontOf(walls, pavement);
  let front = walls[index] as Wall;
  const W = front.len, D = (walls[(index + 1) % 4] as Wall).len;
  if (W < 4.6 || D < 5.5) return false;
  // the garage stands where the drive arrives; with no drive there is none, and the house is turned by its own id
  const apron = apronOn(front, pavement);
  const garage: 0 | 1 | 2 = !apron ? 0 : apron[1] - apron[0] >= 4.6 && W >= 9.5 ? 2 : 1;
  const flip = apron ? (apron[0] + apron[1]) / 2 > W / 2 : (k.seed >>> 17) % 2 === 1;
  if (flip) front = mirror(front);
  const drive: [number, number] | null = !apron ? null : flip ? [W - apron[1], W - apron[0]] : apron;
  const facing = front;
  const lot: Lot = { k, f: new Frame(front), W, D, lv: levelsM(height), p: palette ?? housePalette(style, k.seed), style, garage, reach: s => reachOf(facing, pavement, s, drive) };
  if (style === 'modern') modern(lot);
  else if (style === 'mansard' && lot.lv.length >= 2) mansard(lot);
  else gabled(lot);
  return true;
}

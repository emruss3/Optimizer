// The parts a building is put together from: walls and volumes, windows with
// frames that stand proud of the wall, doors, garage doors, balconies and
// railings, posts, and roofs (gable, shed, mansard, parapet). Every part is
// placed on a wall of the plan's own footprint, so a building can only stand
// where the plan put it.
import type { RenderSlab, RenderWindow, RGBA, Surface } from '../renderModel';

export type V2 = [number, number];

/** A colour and what it is made of. */
export interface Mat {
  color: RGBA;
  surface: Surface;
}
export const mat = (r: number, g: number, b: number, surface: Surface = 'plain'): Mat => ({ color: [r, g, b, 255], surface });
const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
/** The same material, lighter or darker. */
export const tone = (m: Mat, k: number): Mat => ({ color: [ch(m.color[0] * k), ch(m.color[1] * k), ch(m.color[2] * k), 255], surface: m.surface });
/** The same colour in another material. */
export const as = (m: Mat, surface: Surface): Mat => ({ color: m.color, surface });

export const GLASS: RGBA = [30, 42, 56, 255];
export const CONCRETE = mat(182, 178, 170, 'concrete');
export const BLACK = mat(34, 35, 38);
export const WHITE = mat(244, 242, 236);

/** A stable number from an id, so a building keeps its look between draws. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const pick = <T,>(list: readonly T[], n: number): T => list[((n % list.length) + list.length) % list.length] as T;

export interface Wall {
  a: V2;
  /** Unit vector along the wall. */
  t: V2;
  /** Unit vector out of the building. */
  n: V2;
  len: number;
}

export const signedArea = (ring: number[][]): number => {
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
export const on = (w: Wall, s: number, d = 0): V2 => [w.a[0] + w.t[0] * s + w.n[0] * d, w.a[1] + w.t[1] * s + w.n[1] * d];

/**
 * A building's own coordinates, set on its front wall: `s` along the front
 * from its left end, `d` back into the building, `z` up.
 */
export class Frame {
  constructor(readonly w: Wall) {}
  p(s: number, d: number): V2 { return on(this.w, s, -d); }
  p3(s: number, d: number, z: number): number[] { const q = this.p(s, d); return [q[0], q[1], z]; }
  ring(s0: number, s1: number, d0: number, d1: number): V2[] { return [this.p(s0, d0), this.p(s1, d0), this.p(s1, d1), this.p(s0, d1)]; }
  /** The four outward faces of the box [s0, s1] by [d0, d1], as walls. */
  faces(s0: number, s1: number, d0: number, d1: number): { front: Wall; right: Wall; back: Wall; left: Wall } {
    const t = this.w.t, n = this.w.n;
    const neg = (v: V2): V2 => [-v[0], -v[1]];
    return {
      front: { a: this.p(s0, d0), t, n, len: s1 - s0 },
      right: { a: this.p(s1, d0), t: neg(n), n: t, len: d1 - d0 },
      back: { a: this.p(s1, d1), t: neg(t), n: neg(n), len: s1 - s0 },
      left: { a: this.p(s0, d1), t: n, n: neg(t), len: d1 - d0 },
    };
  }
}

export interface WindowSpec {
  frame: Mat;
  /** Panes across and up: [2, 3] is a six-light sash. */
  grid?: [number, number] | undefined;
  /** A wide flat casing round the frame, for a traditional window. */
  casing?: Mat | null | undefined;
  sill?: Mat | null | undefined;
  /** A planter under the sill, in flower. */
  planter?: boolean | undefined;
}

export interface Architecture {
  /** Extruded parts: walls, foundations, frames, porches, balconies, posts. */
  slabs: RenderSlab[];
  /** Glass. */
  glass: RenderWindow[];
  /** Flat parts: roof planes, door leaves, cladding, railings. */
  flats: RenderWindow[];
  /** Planting at the foot of the walls: x, y and radius, metres. */
  shrubs: Array<[number, number, number]>;
}

const FLOWERS: Mat[] = [mat(196, 52, 60), mat(214, 92, 120), mat(236, 190, 70), mat(240, 240, 236)];
const PLANTER = mat(52, 50, 48);
const MULCH = mat(98, 76, 58);
const LAMP_DARK = mat(36, 36, 40);
const LAMP_GLOW = mat(255, 232, 176);

export class Kit {
  slabs: RenderSlab[] = [];
  glass: RenderWindow[] = [];
  flats: RenderWindow[] = [];
  shrubs: Array<[number, number, number]> = [];
  readonly seed: number;
  /** Draw openings plainly: for a model so large that every bar of every window would weigh it down. */
  lite = false;
  constructor(readonly id: string, readonly label: string) { this.seed = hashId(id); }

  /** A solid on a footprint ring, from z0 up by h. */
  prism(ring: V2[], z0: number, h: number, m: Mat, part: RenderSlab['part'] = 'detail'): void {
    if (h <= 0.001 || ring.length < 3) return;
    this.slabs.push({ id: this.id, building: true, polygon: [ring.map(p => [p[0], p[1], z0])], elevation: h, color: m.color, surface: m.surface, part, label: this.label });
  }
  /** A whole footprint, courts kept, from z0 up by h. */
  mass(rings: number[][][], z0: number, h: number, m: Mat, part: RenderSlab['part']): void {
    if (h <= 0.001) return;
    this.slabs.push({ id: this.id, building: true, polygon: rings.map(r => r.map(p => [p[0] ?? 0, p[1] ?? 0, z0])), elevation: h, color: m.color, surface: m.surface, part, label: this.label });
  }
  /** A box against a wall: from s0 to s1 along it, d0 to d1 out of it (negative is into it). */
  box(w: Wall, s0: number, s1: number, d0: number, d1: number, z0: number, h: number, m: Mat, part: RenderSlab['part'] = 'detail'): void {
    const lo = Math.min(d0, d1), hi = Math.max(d0, d1);
    if (s1 - s0 < 0.01 || hi - lo < 0.004) return;
    this.prism([on(w, s0, lo), on(w, s1, lo), on(w, s1, hi), on(w, s0, hi)], z0, h, m, part);
  }
  /** A flat upright panel on a wall, d out from it. */
  panel(w: Wall, s0: number, s1: number, z0: number, z1: number, d: number, m: Mat): void {
    if (s1 - s0 < 0.005 || z1 - z0 < 0.005) return;
    const p0 = on(w, s0, d), p1 = on(w, s1, d);
    this.flats.push({ id: this.id, polygon: [[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], color: m.color, surface: m.surface });
  }
  /** A pane of glass on a wall. */
  pane(w: Wall, s0: number, s1: number, z0: number, z1: number, d: number): void {
    if (s1 - s0 < 0.02 || z1 - z0 < 0.02) return;
    const p0 = on(w, s0, d), p1 = on(w, s1, d);
    // most rooms are dark behind the glass; a few have their blinds down
    const h = hashId(`${Math.round(p0[0] * 10)},${Math.round(p0[1] * 10)},${Math.round(z0 * 10)}`) % 100;
    const color: RGBA = h < 10 ? [156, 158, 150, 255] : h < 22 ? [70, 84, 96, 255] : h < 60 ? GLASS : [20, 30, 42, 255];
    this.glass.push({ id: this.id, polygon: [[p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]], color });
  }
  /** Any flat polygon in space. */
  flat(points: number[][], m: Mat): void {
    this.flats.push({ id: this.id, polygon: points, color: m.color, surface: m.surface });
  }
  post(w: Wall, s: number, d: number, z0: number, h: number, size: number, m: Mat): void {
    this.box(w, s - size / 2, s + size / 2, d - size / 2, d + size / 2, z0, h, m);
  }

  /**
   * A window: a frame of four bars standing proud of the wall, the glass set
   * back inside it, glazing bars, and where asked a casing, a sill and a
   * planter. `d` is how far the wall face is from the wall line.
   */
  window(w: Wall, s: number, width: number, z0: number, z1: number, o: WindowSpec, d = 0): void {
    const a = s - width / 2, b = s + width / 2;
    if (width < 0.3 || z1 - z0 < 0.3) return;
    if (this.lite) {
      this.panel(w, a - 0.05, b + 0.05, z0 - 0.05, z1 + 0.05, d + 0.02, o.frame);
      this.pane(w, a, b, z0, z1, d + 0.04);
      return;
    }
    const f = 0.055, p = 0.075;
    if (o.casing) this.panel(w, a - 0.11, b + 0.11, z0 - 0.1, z1 + 0.13, d + 0.015, o.casing);
    this.box(w, a, b, d, d + p, z1 - f, f, o.frame);
    this.box(w, a, b, d, d + p, z0, f, o.frame);
    this.box(w, a, a + f, d, d + p, z0 + f, z1 - z0 - 2 * f, o.frame);
    this.box(w, b - f, b, d, d + p, z0 + f, z1 - z0 - 2 * f, o.frame);
    this.pane(w, a + f, b - f, z0 + f, z1 - f, d + 0.02);
    const [cols, rows] = o.grid ?? [1, 1];
    for (let c = 1; c < cols; c++) { const x = a + (width * c) / cols; this.panel(w, x - 0.017, x + 0.017, z0 + f, z1 - f, d + 0.045, o.frame); }
    for (let r = 1; r < rows; r++) { const z = z0 + ((z1 - z0) * r) / rows; this.panel(w, a + f, b - f, z - 0.017, z + 0.017, d + 0.045, o.frame); }
    if (o.sill) this.box(w, a - 0.08, b + 0.08, d, d + 0.12, z0 - 0.06, 0.06, o.sill);
    if (o.planter) {
      this.box(w, a + 0.04, b - 0.04, d, d + 0.26, z0 - 0.32, 0.22, PLANTER);
      this.box(w, a + 0.07, b - 0.07, d + 0.03, d + 0.23, z0 - 0.1, 0.13, pick(FLOWERS, this.seed >>> 3));
    }
  }

  /** A door: frame, leaf, and where asked a light in the leaf, a sidelight and a transom. */
  door(w: Wall, s: number, width: number, z0: number, h: number, o: { frame: Mat; leaf: Mat; lite?: boolean; sidelight?: number; transom?: boolean }, d = 0): void {
    const side = o.sidelight ?? 0, a = s - width / 2, b = s + width / 2;
    const top = z0 + h + (o.transom ? 0.42 : 0), f = 0.06, p = 0.08;
    this.box(w, a - f, b + side + f, d, d + p, top, f, o.frame);
    this.box(w, a - f, a, d, d + p, z0, top - z0, o.frame);
    this.box(w, b + side, b + side + f, d, d + p, z0, top - z0, o.frame);
    this.panel(w, a, b, z0, z0 + h, d + 0.03, o.leaf);
    if (o.lite) this.pane(w, a + width * 0.2, b - width * 0.2, z0 + h * 0.55, z0 + h - 0.18, d + 0.04);
    if (side > 0) {
      this.box(w, b, b + 0.05, d, d + p, z0, h, o.frame);
      this.pane(w, b + 0.05, b + side, z0 + 0.12, z0 + h, d + 0.02);
    }
    if (o.transom) {
      this.box(w, a - f, b + side + f, d, d + p, z0 + h, 0.05, o.frame);
      this.pane(w, a, b + side, z0 + h + 0.05, top, d + 0.02);
    }
  }

  /** A garage door: frame, a sectional leaf, and where asked a row of lights. */
  garage(w: Wall, s0: number, s1: number, z0: number, h: number, o: { frame: Mat; leaf: Mat; lites?: boolean; rows?: number }, d = 0): void {
    const f = 0.08, p = 0.08;
    this.box(w, s0 - f, s1 + f, d, d + p, z0 + h, f, o.frame);
    this.box(w, s0 - f, s0, d, d + p, z0, h, o.frame);
    this.box(w, s1, s1 + f, d, d + p, z0, h, o.frame);
    this.panel(w, s0, s1, z0, z0 + h, d + 0.025, o.leaf);
    const rows = o.rows ?? 4;
    for (let r = 1; r < rows; r++) this.panel(w, s0, s1, z0 + (h * r) / rows - 0.012, z0 + (h * r) / rows + 0.012, d + 0.035, tone(o.leaf, 0.72));
    if (o.lites) {
      const n = Math.max(2, Math.round((s1 - s0) / 0.75)), each = (s1 - s0) / n, zt = z0 + (h * (rows - 1)) / rows;
      for (let i = 0; i < n; i++) this.pane(w, s0 + each * i + 0.08, s0 + each * (i + 1) - 0.08, zt + 0.08, z0 + h - 0.08, d + 0.04);
    }
  }

  /** A balustrade along a wall line: thin bars, or glass, under a top rail. */
  rail(w: Wall, s0: number, s1: number, d: number, z: number, kind: 'bars' | 'glass', m: Mat, h = 1.05): void {
    if (s1 - s0 < 0.1) return;
    const p0 = on(w, s0, d), p1 = on(w, s1, d);
    this.flats.push({ id: this.id, polygon: [[p0[0], p0[1], z + 0.06], [p1[0], p1[1], z + 0.06], [p1[0], p1[1], z + h - 0.03], [p0[0], p0[1], z + h - 0.03]], color: m.color, surface: kind === 'bars' ? 'railing' : 'glassrail' });
    this.box(w, s0, s1, d - 0.025, d + 0.025, z + h - 0.04, 0.045, m);
    if (kind === 'bars') this.box(w, s0, s1, d - 0.02, d + 0.02, z + 0.05, 0.03, m);
  }

  /** A balcony: a slab out from the wall and a balustrade on its three open sides. */
  balcony(w: Wall, s0: number, s1: number, depth: number, z: number, o: { slab: Mat; rail: 'bars' | 'glass'; railMat: Mat }): void {
    this.box(w, s0, s1, 0, depth, z - 0.18, 0.18, o.slab);
    this.rail(w, s0 + 0.03, s1 - 0.03, depth - 0.04, z, o.rail, o.railMat);
    const neg = (v: V2): V2 => [-v[0], -v[1]];
    this.rail({ a: on(w, s0 + 0.04, 0), t: w.n, n: neg(w.t), len: depth }, 0, depth - 0.04, 0, z, o.rail, o.railMat);
    this.rail({ a: on(w, s1 - 0.04, 0), t: w.n, n: w.t, len: depth }, 0, depth - 0.04, 0, z, o.rail, o.railMat);
  }

  /** A wall light: a dark bracket and a warm lamp under it. */
  lamp(w: Wall, s: number, z: number, d = 0): void {
    if (this.lite) return;
    this.box(w, s - 0.07, s + 0.07, d, d + 0.16, z, 0.05, LAMP_DARK);
    this.box(w, s - 0.05, s + 0.05, d + 0.04, d + 0.14, z - 0.2, 0.2, LAMP_GLOW);
  }

  /** A downspout from the eave to the ground, with a gutter's outlet at its head. */
  downspout(w: Wall, s: number, z0: number, z1: number, m: Mat, d = 0): void {
    if (this.lite || z1 - z0 < 1) return;
    this.box(w, s - 0.04, s + 0.04, d, d + 0.08, z0, z1 - z0, m);
    this.box(w, s - 0.07, s + 0.07, d, d + 0.12, z1 - 0.12, 0.12, m);
  }

  /** A mailbox on a post, at the roadside. */
  mailbox(w: Wall, s: number, d: number): void {
    if (this.lite) return;
    this.box(w, s - 0.05, s + 0.05, d - 0.05, d + 0.05, 0.15, 1.0, LAMP_DARK);
    this.box(w, s - 0.11, s + 0.11, d - 0.24, d + 0.24, 1.15, 0.24, LAMP_DARK);
  }

  /** A row of shrubs at the foot of a wall, from s0 to s1. */
  hedge(w: Wall, s0: number, s1: number, d: number, every: number): void {
    let k = 0;
    for (let s = s0 + every / 2; s < s1; s += every, k++) {
      const p = on(w, s, d);
      this.shrubs.push([p[0], p[1], 0.42 + (((this.seed >>> (k % 24)) & 3) * 0.06)]);
    }
  }

  /**
   * A gable roof over the box [s0, s1] by [d0, d1], eaves at zE. With the ridge
   * along `s` the gable ends face left and right; along `d` they face front
   * and back. `over` is how far the roof sails past the walls: one figure, or
   * one for the eaves and one for the gable ends (none on a party wall).
   * Returns the height of the ridge above the eaves.
   */
  gable(f: Frame, s0: number, s1: number, d0: number, d1: number, zE: number, pitch: number, ridge: 's' | 'd',
    o: { over: number | [number, number]; roof: Mat; wall?: Mat | null; fascia: Mat; ends?: [boolean, boolean] }): number {
    const [OE, OR] = typeof o.over === 'number' ? [o.over, o.over] : o.over;
    const drop = pitch * OE, F = 0.2;
    const ends = o.ends ?? [true, true];
    if (ridge === 's') {
      const dm = (d0 + d1) / 2, rise = (pitch * (d1 - d0)) / 2, zR = zE + rise, zL = zE - drop;
      this.flat([f.p3(s0 - OR, d0 - OE, zL), f.p3(s1 + OR, d0 - OE, zL), f.p3(s1 + OR, dm, zR), f.p3(s0 - OR, dm, zR)], o.roof);
      this.flat([f.p3(s1 + OR, d1 + OE, zL), f.p3(s0 - OR, d1 + OE, zL), f.p3(s0 - OR, dm, zR), f.p3(s1 + OR, dm, zR)], tone(o.roof, 0.93));
      if (OE > 0) for (const d of [d0 - OE, d1 + OE]) this.flat([f.p3(s0 - OR, d, zL - F), f.p3(s1 + OR, d, zL - F), f.p3(s1 + OR, d, zL + 0.02), f.p3(s0 - OR, d, zL + 0.02)], o.fascia);
      [s0, s1].forEach((s, i) => {
        const so = i === 0 ? s - OR : s + OR;
        if (OR > 0 && ends[i]) {
          this.flat([f.p3(so, d0 - OE, zL - F), f.p3(so, d0 - OE, zL), f.p3(so, dm, zR), f.p3(so, dm, zR - F)], o.fascia);
          this.flat([f.p3(so, d1 + OE, zL - F), f.p3(so, d1 + OE, zL), f.p3(so, dm, zR), f.p3(so, dm, zR - F)], o.fascia);
        }
        if (o.wall && ends[i]) this.flat([f.p3(s, d0, zE), f.p3(s, d1, zE), f.p3(s, dm, zR)], o.wall);
      });
      return rise;
    }
    const sm = (s0 + s1) / 2, rise = (pitch * (s1 - s0)) / 2, zR = zE + rise, zL = zE - drop;
    this.flat([f.p3(s0 - OE, d1 + OR, zL), f.p3(s0 - OE, d0 - OR, zL), f.p3(sm, d0 - OR, zR), f.p3(sm, d1 + OR, zR)], o.roof);
    this.flat([f.p3(s1 + OE, d0 - OR, zL), f.p3(s1 + OE, d1 + OR, zL), f.p3(sm, d1 + OR, zR), f.p3(sm, d0 - OR, zR)], tone(o.roof, 0.93));
    if (OE > 0) for (const s of [s0 - OE, s1 + OE]) this.flat([f.p3(s, d0 - OR, zL - F), f.p3(s, d1 + OR, zL - F), f.p3(s, d1 + OR, zL + 0.02), f.p3(s, d0 - OR, zL + 0.02)], o.fascia);
    [d0, d1].forEach((d, i) => {
      const dd = i === 0 ? d - OR : d + OR;
      if (OR > 0 && ends[i]) {
        this.flat([f.p3(s0 - OE, dd, zL - F), f.p3(s0 - OE, dd, zL), f.p3(sm, dd, zR), f.p3(sm, dd, zR - F)], o.fascia);
        this.flat([f.p3(s1 + OE, dd, zL - F), f.p3(s1 + OE, dd, zL), f.p3(sm, dd, zR), f.p3(sm, dd, zR - F)], o.fascia);
      }
      if (o.wall && ends[i]) this.flat([f.p3(s0, d, zE), f.p3(s1, d, zE), f.p3(sm, d, zR)], o.wall);
    });
    return rise;
  }

  /**
   * A gable that runs back into a larger roof: over [a, b] along the frame's
   * wall, its own gable end standing at depth `dFront`, its eaves at zE. The
   * larger roof's slope leaves zE at depth `dMain` and climbs at the same
   * pitch, so the two meet in valleys. With dMain equal to dFront the gable
   * stands flush in the slope (a wall gable); with dMain further back it roofs
   * a wing that stands forward of the main wall.
   */
  crossGable(f: Frame, a: number, b: number, dFront: number, zE: number, pitch: number, over: number, dMain: number,
    o: { roof: Mat; wall?: Mat | null; fascia: Mat }): number {
    const m = (a + b) / 2, h = (b - a) / 2, O = over, F = 0.2;
    const zL = zE - pitch * O, zR = zE + pitch * h;
    const flush = dMain - dFront < 0.02;
    const left = [f.p3(m, dMain + h, zR), f.p3(m, dFront - O, zR), f.p3(a - O, dFront - O, zL)];
    const right = [f.p3(m, dFront - O, zR), f.p3(m, dMain + h, zR), f.p3(b + O, dMain - O, zL)];
    if (!flush) { left.push(f.p3(a - O, dMain - O, zL)); right.push(f.p3(b + O, dFront - O, zL)); }
    this.flat(left, o.roof);
    this.flat(right, tone(o.roof, 0.93));
    this.flat([f.p3(a - O, dFront - O, zL - F), f.p3(a - O, dFront - O, zL), f.p3(m, dFront - O, zR), f.p3(m, dFront - O, zR - F)], o.fascia);
    this.flat([f.p3(b + O, dFront - O, zL - F), f.p3(b + O, dFront - O, zL), f.p3(m, dFront - O, zR), f.p3(m, dFront - O, zR - F)], o.fascia);
    if (!flush) for (const s of [a - O, b + O]) this.flat([f.p3(s, dFront - O, zL - F), f.p3(s, dMain - O, zL - F), f.p3(s, dMain - O, zL + 0.02), f.p3(s, dFront - O, zL + 0.02)], o.fascia);
    if (o.wall) this.flat([f.p3(a, dFront, zE), f.p3(b, dFront, zE), f.p3(m, dFront, zR)], o.wall);
    return pitch * h;
  }

  /** A single slope from a low outer edge (dLow) up to a wall (dHigh), with its edge boards. */
  shed(f: Frame, s0: number, s1: number, dLow: number, dHigh: number, zLow: number, zHigh: number, roof: Mat, fascia: Mat): void {
    this.flat([f.p3(s0, dLow, zLow), f.p3(s1, dLow, zLow), f.p3(s1, dHigh, zHigh), f.p3(s0, dHigh, zHigh)], roof);
    this.flat([f.p3(s0, dLow, zLow - 0.16), f.p3(s1, dLow, zLow - 0.16), f.p3(s1, dLow, zLow + 0.02), f.p3(s0, dLow, zLow + 0.02)], fascia);
    for (const s of [s0, s1]) this.flat([f.p3(s, dLow, zLow - 0.16), f.p3(s, dLow, zLow), f.p3(s, dHigh, zHigh), f.p3(s, dHigh, zHigh - 0.16)], fascia);
  }

  /**
   * A mansard over the box [s0, s1] by [d0, d1]: steep shingled slopes from z0
   * up to z1, drawn in by `inset`, under a flat cap, with a small eave at the foot.
   * `sides` says which of front, right, back, left are sloped; a side that is
   * not (a party wall, on a row home) rises straight in `wall`. The top of the
   * cap is z1.
   */
  mansard(f: Frame, s0: number, s1: number, d0: number, d1: number, z0: number, z1: number, inset: number,
    o: { shingle: Mat; cap: Mat; eave: Mat; sides?: [boolean, boolean, boolean, boolean]; wall?: Mat | null }): void {
    const [fr, ri, ba, le] = o.sides ?? [true, true, true, true];
    const a0 = le ? s0 + inset : s0, a1 = ri ? s1 - inset : s1, b0 = fr ? d0 + inset : d0, b1 = ba ? d1 - inset : d1;
    const zc = z1 - 0.14;
    if (fr) this.flat([f.p3(s0, d0, z0), f.p3(s1, d0, z0), f.p3(a1, b0, zc), f.p3(a0, b0, zc)], o.shingle);
    if (ri) this.flat([f.p3(s1, d0, z0), f.p3(s1, d1, z0), f.p3(a1, b1, zc), f.p3(a1, b0, zc)], tone(o.shingle, 0.94));
    if (ba) this.flat([f.p3(s1, d1, z0), f.p3(s0, d1, z0), f.p3(a0, b1, zc), f.p3(a1, b1, zc)], tone(o.shingle, 0.9));
    if (le) this.flat([f.p3(s0, d1, z0), f.p3(s0, d0, z0), f.p3(a0, b0, zc), f.p3(a0, b1, zc)], tone(o.shingle, 0.94));
    if (o.wall) {
      if (!le) this.flat([f.p3(s0, d1, z0), f.p3(s0, d0, z0), f.p3(s0, b0, zc), f.p3(s0, b1, zc)], o.wall);
      if (!ri) this.flat([f.p3(s1, d0, z0), f.p3(s1, d1, z0), f.p3(s1, b1, zc), f.p3(s1, b0, zc)], o.wall);
      if (!fr) this.flat([f.p3(s0, d0, z0), f.p3(s1, d0, z0), f.p3(a1, d0, zc), f.p3(a0, d0, zc)], o.wall);
      if (!ba) this.flat([f.p3(s1, d1, z0), f.p3(s0, d1, z0), f.p3(a0, d1, zc), f.p3(a1, d1, zc)], o.wall);
    }
    const lip = 0.07;
    this.prism(f.ring(a0 - (le ? lip : 0), a1 + (ri ? lip : 0), b0 - (fr ? lip : 0), b1 + (ba ? lip : 0)), zc, 0.14, o.cap, 'parapet');
    // the eave the slopes spring from
    this.prism(f.ring(s0 - (le ? 0.14 : 0), s1 + (ri ? 0.14 : 0), d0 - (fr ? 0.14 : 0), d1 + (ba ? 0.14 : 0)), z0 - 0.1, 0.1, o.eave);
  }

  /**
   * A boxed dormer in a mansard: a box standing in the slope on the wall line,
   * from just above the eave to just under the cap, with a flat lid, and its
   * windows.
   */
  dormer(w: Wall, s: number, width: number, z0: number, z1: number, inset: number, o: { wall: Mat; lid: Mat; panes: number; spec: WindowSpec }): void {
    const a = s - width / 2, b = s + width / 2, zb = z0 + 0.12, zt = z1 - 0.3;
    this.box(w, a, b, -inset - 0.05, 0.04, zb, zt - zb, o.wall);
    this.box(w, a - 0.1, b + 0.1, -inset - 0.05, 0.16, zt, 0.1, o.lid);
    const each = Math.min(0.9, (width - 0.5 - (o.panes - 1) * 0.1) / o.panes);
    this.windows(w, s, o.panes, each, zb + 0.5, zt - 0.28, o.spec, 0.04);
  }

  /** A parapet round a flat roof: a low wall on the edge of the footprint, a coping on it, and the roof inside it. */
  parapet(rings: number[][][], z: number, h: number, o: { wall: Mat; coping: Mat; roof: Mat; thick?: number }): void {
    const outer = rings[0];
    if (!outer || h <= 0) return;
    const t = o.thick ?? 0.28;
    const at = (r: number[][], zz: number): number[][] => r.map(p => [p[0] ?? 0, p[1] ?? 0, zz]);
    const push = (polygon: number[][][], hh: number, m: Mat, part: RenderSlab['part']): void => {
      this.slabs.push({ id: this.id, building: true, polygon, elevation: hh, color: m.color, surface: m.surface, part, label: this.label });
    };
    const ow = ringWalls(outer), inner = insetRing(ow, t);
    const courts = rings.slice(1).map(c => ({ ring: c, walls: ringWalls(c, true) }));
    push([at(outer, z), at(inner, z)], h, o.wall, 'parapet');
    push([at(insetRing(ow, -0.05), z + h), at(insetRing(ow, t + 0.05), z + h)], 0.06, o.coping, 'detail');
    for (const c of courts) {
      push([at(insetRing(c.walls, t), z), at(c.ring, z)], h, o.wall, 'parapet');
      push([at(insetRing(c.walls, t + 0.05), z + h), at(insetRing(c.walls, -0.05), z + h)], 0.06, o.coping, 'detail');
    }
    push([at(inner, z), ...courts.map(c => at(insetRing(c.walls, t), z))], 0.05, o.roof, 'detail');
  }

  /** Windows side by side as one group, the group centred on s. */
  windows(w: Wall, s: number, count: number, each: number, z0: number, z1: number, o: WindowSpec, d = 0, gap = 0.1): void {
    const total = count * each + (count - 1) * gap;
    for (let i = 0; i < count; i++) this.window(w, s - total / 2 + each / 2 + i * (each + gap), each, z0, z1, o, d);
  }

  /** A planting bed at the foot of a wall, with a row of shrubs in it. */
  bed(w: Wall, s0: number, s1: number, d0: number, d1: number): void {
    if (s1 - s0 < 0.8) return;
    this.box(w, s0, s1, d0, d1, 0, 0.21, MULCH);
    this.hedge(w, s0 + 0.15, s1 - 0.15, (d0 + d1) / 2, 1.15);
  }

  done(): Architecture {
    return { slabs: this.slabs, glass: this.glass, flats: this.flats, shrubs: this.shrubs };
  }
}

/** The wall that faces the nearest pavement and how far that is, or the longest wall. */
export function frontOf(walls: Wall[], pavement: V2[]): { index: number; dist: number | null } {
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

export function inRing(x: number, y: number, ring: number[][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0, yi = ring[i]?.[1] ?? 0, xj = ring[j]?.[0] ?? 0, yj = ring[j]?.[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The walls of one ring in order, facing out of the solid (`court` for a ring that is a court in it). */
export function ringWalls(ring: number[][], court = false): Wall[] {
  const a = ring[0], b = ring[ring.length - 1];
  const closed = a && b && Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0)) > 1e-6 ? [...ring, a] : ring;
  return wallsOf(court ? [[], closed] : [closed]);
}

/**
 * A ring drawn in from its walls by `dist` (out from a court), corners mitred.
 * `walls` are one ring's, in order.
 */
export function insetRing(walls: Wall[], dist: number): V2[] {
  const out: V2[] = [];
  const n = walls.length;
  for (let i = 0; i < n; i++) {
    const prev = walls[(i + n - 1) % n], next = walls[i];
    if (!prev || !next) continue;
    const dot = prev.n[0] * next.n[0] + prev.n[1] * next.n[1];
    const k = dist / Math.max(0.25, 1 + dot);
    out.push([next.a[0] - (prev.n[0] + next.n[0]) * k, next.a[1] - (prev.n[1] + next.n[1]) * k]);
  }
  return out;
}

/** The same wall read from its other end, facing the same way. */
export const mirror = (w: Wall): Wall => ({ a: on(w, w.len), t: [-w.t[0], -w.t[1]], n: w.n, len: w.len });

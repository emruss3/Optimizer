// Apartment buildings, and any other building that is not a house or a row
// home, on any footprint, courts kept. The walls are set out in bays. Bays
// are gathered in stretches of alternating cladding, the way current
// apartment buildings are broken up; a stretch carries balconies, and each
// style finishes the top its own way: a mansard story with dormers, gabled
// bays, raised parapets, or a cornice.
import type { BuildingUse, SceneHeight } from '../../scene/heights';
import { BLACK, Frame, Kit, frontOf, inRing, insetRing, mat, on, ringWalls, tone, wallsOf, type V2, type Wall, type WindowSpec } from './kit';
import { MEMBRANE, blockPalette, housePalette, type ArchStyle, type BlockPalette } from './styles';
import { FLAT_ROOF, levelsM } from './house';

const UNIT = mat(196, 198, 196);

/** A clubhouse on a four-cornered pad: one tall story of glass under a roof of the style. */
function pavilion(k: Kit, rings: number[][][], top: number, p: BlockPalette, style: ArchStyle, pavement: V2[]): boolean {
  const walls = wallsOf(rings);
  if (rings.length !== 1 || walls.length !== 4) return false;
  const square = walls.every((w, i) => { const nx = walls[(i + 1) % 4] as Wall; return Math.abs(w.t[0] * nx.t[0] + w.t[1] * nx.t[1]) < 0.05; });
  if (!square || walls.some(w => w.len > 34 || w.len < 5)) return false;
  let li = 0;
  walls.forEach((w, i) => { if (w.len > (walls[li] as Wall).len + 0.01) li = i; });
  const long = walls[li] as Wall, W = long.len, D = (walls[(li + 1) % 4] as Wall).len;
  const f = new Frame(long), ring = f.ring(0, W, 0, D);
  k.prism(ring, 0, 0.5, p.base, 'base');
  k.prism(ring, 0.5, top - 0.5, p.body, 'body');
  if (style === 'modern') {
    k.prism(f.ring(-0.9, W + 0.9, -0.9, D + 0.9), top, 0.3, p.cap);
    k.prism(f.ring(-0.75, W + 0.75, -0.75, D + 0.75), top + 0.3, 0.03, MEMBRANE);
  } else {
    const roof = style === 'heritage' ? mat(88, 78, 70, 'shingle') : p.crown;
    const pitch = Math.min(0.5, 3.2 / (D / 2));
    k.gable(f, 0, W, 0, D, top, pitch, 's', { over: 0.7, roof, wall: p.accent.surface === 'concrete' ? p.body : p.accent, fascia: p.trim });
  }
  const entry = frontOf(walls, pavement).index;
  const glass: WindowSpec = { frame: p.frame, grid: [2, 1] };
  walls.forEach((w, i) => {
    const count = Math.max(1, Math.floor((w.len - 1) / 3.2)), step = w.len / count;
    for (let b = 0; b < count; b++) {
      const s = (b + 0.5) * step;
      if (i === entry && b === Math.floor(count / 2)) {
        k.door(w, s - 0.5, 1.0, 0.08, 2.3, { frame: p.frame, leaf: p.frame, lite: true, sidelight: 1.0, transom: true });
        k.box(w, s - 1.8, s + 1.8, 0, 1.5, 3.0, 0.12, p.cap);
      } else k.window(w, s, Math.min(step - 0.8, 2.4), 0.6, Math.min(top - 0.6, 3.3), glass);
    }
    if (w.len > 6) k.bed(w, 0.6, w.len - 0.6, 0.15, 1.1);
  });
  return true;
}

/**
 * An existing house whose footprint is not a plain rectangle: its walls on the
 * footprint the record gives, with windows, under a roof stepped in from the
 * eaves the way a hipped roof falls. Seen from the air, among trees.
 */
export function cottage(k: Kit, rings: number[][][], height: SceneHeight): void {
  const lv = levelsM(height), top = lv[lv.length - 1] ?? 3;
  const outer = rings[0] ?? [];
  const p = housePalette('heritage', k.seed);
  k.lite = true;
  k.mass([outer], 0, top, p.body, 'body');
  const loop = ringWalls(outer);
  // how far in the roof can step before it closes: about the half-width of the narrowest wing
  let area = 0, around = 0;
  loop.forEach(w => { const e = on(w, w.len); area += w.a[0] * e[1] - e[0] * w.a[1]; around += w.len; });
  const reach = Math.min(4.5, (Math.abs(area) / Math.max(1, around)) * 0.9);
  const steps = 7, rise = reach * 0.55;
  for (let i = 0; i < steps; i++) {
    const ring = insetRing(loop, -0.35 + (reach * i) / steps);
    k.slabs.push({ id: k.id, building: true, polygon: [ring.map(q => [q[0], q[1], top + (rise * i) / steps])], elevation: rise / steps + (i === 0 ? 0.12 : 0), color: p.roof.color, surface: p.roof.surface, part: 'detail', label: k.label });
  }
  const win: WindowSpec = { frame: p.frame };
  for (const w of loop) {
    if (w.len < 3) continue;
    const count = Math.max(1, Math.round((w.len - 1.6) / 3.6));
    lv.forEach((z1, st) => {
      const z0 = st === 0 ? 0.3 : lv[st - 1] ?? 0.3;
      for (let i = 0; i < count; i++) k.window(w, 0.8 + ((w.len - 1.6) * (i + 0.5)) / count, 0.9, z0 + 0.8, Math.min(z1 - 0.35, z0 + 2.1), win);
    });
  }
}

/** An apartment building, or any larger building. */
export function block(k: Kit, rings: number[][][], use: BuildingUse, height: SceneHeight, pavement: V2[], style: ArchStyle, bayScale: number): void {
  const p = blockPalette(style, k.seed);
  const lv = levelsM(height), n = lv.length, top = lv[n - 1] ?? 4, first = lv[0] ?? top;
  if (use === 'amenity' && pavilion(k, rings, top, p, style, pavement)) return;
  const lite = bayScale > 1.6;
  k.lite = lite;
  const outer = rings[0] ?? [];
  const walls = wallsOf(rings);
  const entry = frontOf(walls, pavement).index;
  // the mansard style gives its top story to the mansard, where the building has the height for one
  const crowned = style === 'mansard' && n >= 3;
  const zB = crowned ? lv[n - 2] ?? top : top;
  const PARAPET = 0.9, inset = 0.85;
  k.mass(rings, 0, first, n === 1 ? p.body : p.base, 'base');
  if (zB > first) k.mass(rings, first, zB - first, p.body, 'body');

  // the top
  const loops = rings.map((r, i) => ringWalls(r, i > 0));
  if (crowned) {
    const zc = top - 0.14;
    const tops = loops.map(loop => insetRing(loop, inset));
    loops.forEach((loop, li) => {
      const ring = tops[li] ?? [];
      loop.forEach((w, i) => {
        const a = ring[i], b = ring[(i + 1) % ring.length], e = on(w, w.len);
        if (!a || !b) return;
        k.flat([[w.a[0], w.a[1], zB], [e[0], e[1], zB], [b[0], b[1], zc], [a[0], a[1], zc]], tone(p.crown, 1 - (i % 3) * 0.04));
        k.box(w, -0.1, w.len + 0.1, 0, 0.14, zB - 0.1, 0.1, p.trim);
      });
    });
    k.slabs.push({ id: k.id, building: true, polygon: tops.map(r => r.map(q => [q[0], q[1], zc])), elevation: 0.14, color: FLAT_ROOF.color, surface: FLAT_ROOF.surface, part: 'parapet', label: k.label });
  } else {
    k.parapet(rings, top, PARAPET, { wall: p.body, coping: p.cap, roof: MEMBRANE });
  }

  const win: WindowSpec = { frame: p.frame, grid: lite ? undefined : p.grid };
  const door: WindowSpec = { frame: p.frame, grid: lite ? undefined : [2, 1] };
  const BAY = (style === 'heritage' ? 4.0 : 3.6) * bayScale;
  walls.forEach((w, wi) => {
    if (w.len < 2.6) return;
    const nb = Math.max(1, Math.floor((w.len - 0.6) / BAY)), step = w.len / nb;
    const entryBay = wi === entry ? Math.floor(nb / 2) : -1;
    const mods = Math.max(1, Math.round(nb / p.module)), per = nb / mods;
    const modOf = (b: number) => Math.min(mods - 1, Math.floor(b / per));
    // the second cladding on alternate stretches, standing a little proud, and what each style puts on top of one
    for (let m = 0; m < mods; m++) {
      if (mods < 2 || (m + wi) % 2 === 0 || n < 2) continue;
      const s0 = Math.round(m * per) * step, s1 = Math.round((m + 1) * per) * step;
      const a = Math.max(0.02, s0), b = Math.min(w.len - 0.02, s1);
      if (crowned) k.box(w, a, b, 0, 0.09, first, zB - first, p.body2);
      else if (style === 'farmhouse' && !lite && b - a <= 16) {
        // a gabled bay: the stretch rises past the roof line under a gable of its own
        k.box(w, a, b, 0, 0.09, first, top - first + PARAPET, p.body2);
        const fr = new Frame(w), depth = Math.min(5, (b - a) * 0.6);
        const zE = top + PARAPET, pitch = Math.min(0.7, 2.6 / ((b - a) / 2));
        k.box(w, a, b, -depth, 0, top, PARAPET, p.body2);
        const rise = k.gable(fr, a, b, -0.09, depth, zE, pitch, 'd', { over: [0.2, 0.3], roof: p.crown, wall: p.body2, fascia: p.trim });
        if (rise > 1.5) k.window(w, (a + b) / 2, 0.7, zE + 0.3, zE + 0.3 + Math.min(0.9, rise - 0.9), { frame: p.frame }, 0.09);
      } else {
        const lift = style === 'modern' ? 0.55 : style === 'heritage' ? 0 : 0.35;
        k.box(w, a, b, 0, 0.09, first, top - first + PARAPET + lift, p.body2);
        if (lift) k.box(w, a - 0.04, b + 0.04, -0.3, 0.13, top + PARAPET + lift, 0.06, p.cap);
      }
    }
    if (style === 'heritage' && !lite) {
      // piers between the stretches, a stone band over the ground story, and a cornice
      for (let m = 0; m <= mods; m++) { const s = Math.min(w.len - 0.3, Math.max(0.3, Math.round(m * per) * step)); k.box(w, s - 0.3, s + 0.3, 0, 0.14, 0, top + PARAPET - 0.1, tone(p.body, 0.94)); }
      k.box(w, 0, w.len, 0, 0.18, first - 0.15, 0.3, p.accent);
      k.box(w, -0.05, w.len + 0.05, 0, 0.42, top + PARAPET - 0.2, 0.32, p.cap);
      k.box(w, 0, w.len, 0, 0.2, top + PARAPET - 0.55, 0.3, tone(p.cap, 0.92));
    }
    if (!lite && use !== 'amenity' && w.len > 6) {
      if (entryBay < 0) k.bed(w, 0.8, w.len - 0.8, 0.2, 1.3);
      else { const e = (entryBay + 0.5) * step; k.bed(w, 0.8, e - 2.6, 0.2, 1.3); k.bed(w, e + 2.6, w.len - 0.8, 0.2, 1.3); }
    }
    for (let b = 0; b < nb; b++) {
      const s = (b + 0.5) * step, m = modOf(b);
      const alt = mods >= 2 && (m + wi) % 2 === 1 && n >= 2;
      const proud = alt ? 0.09 : 0;
      // which bay of its stretch this is: the middle ones carry the balconies
      const inMod = b - Math.round(m * per), size = Math.round((m + 1) * per) - Math.round(m * per);
      const middle = size >= 3 ? inMod > 0 && inMod < size - 1 : size === 2 ? inMod === 0 : false;
      const balcony = !lite && alt && middle && use !== 'amenity';
      // the ground story: the entrance under a canopy, and tall windows
      const gTop = Math.min(first - 0.75, 3.15);
      if (b === entryBay && use !== 'amenity') {
        k.door(w, s - 0.55, 1.1, 0.06, 2.35, { frame: p.frame, leaf: p.frame, lite: true, sidelight: 1.1, transom: true });
        k.box(w, s - 2.3, s + 2.3, 0, 1.9, Math.min(first - 0.55, 3.2), 0.14, p.cap);
        for (const q of [s - 2.1, s + 2.1]) k.post(w, q, 1.75, 0, Math.min(first - 0.55, 3.2), 0.12, BLACK);
      } else if (use === 'amenity' || use === 'other') {
        k.window(w, s, Math.min(step - 0.7, 2.8), 0.5, gTop, { frame: p.frame, grid: lite ? undefined : [3, 1] });
      } else {
        const each = Math.min(1.0, (step - 1.3) / 2);
        if (each > 0.45) k.windows(w, s, 2, each, 0.85, gTop, win);
      }
      for (let st = 1; st < n; st++) {
        const z0 = lv[st - 1] ?? first, z1 = lv[st] ?? top, head = Math.min(z1 - 0.35, z0 + 2.3);
        const crown = crowned && st === n - 1;
        if (crown) {
          // the top story is in the mansard: a dormer to a bay, clear of the corners
          const dw = Math.min(step - 0.9, 2.5);
          if (s - dw / 2 > inset + 0.5 && s + dw / 2 < w.len - inset - 0.5 && dw > 1.2) {
            if (lite) k.box(w, s - dw / 2, s + dw / 2, -inset - 0.05, 0.04, z0 + 0.12, z1 - z0 - 0.42, p.accent);
            else k.dormer(w, s, dw, z0, z1, inset, { wall: p.accent, lid: p.trim, panes: dw >= 2.2 ? 2 : 1, spec: win });
          }
        } else if (balcony) {
          const hw = Math.min(1.7, step / 2 - 0.25);
          // timber behind a balcony, in the contemporary style
          if (style === 'modern') k.box(w, s - hw, s + hw, 0, proud + 0.04, z0, z1 - z0, p.accent);
          k.balcony(w, s - hw, s + hw, 1.5, z0 + 0.03, { slab: p.slab, rail: p.railKind, railMat: p.rail });
          const back = style === 'modern' ? proud + 0.04 : proud;
          k.window(w, s - hw * 0.28, Math.min(1.7, hw * 1.05), z0 + 0.1, head, door, back);
          if (hw > 1.4) k.window(w, s + hw * 0.62, 0.7, z0 + 0.9, head, win, back);
        } else if (style === 'heritage') {
          k.window(w, s, Math.min(step - 1.5, 2.3), z0 + 0.75, head, win, proud);
        } else {
          const each = Math.min(0.95, (step - 1.4) / 2);
          if (each > 0.45) k.windows(w, s, 2, each, z0 + 0.9, head, win, proud);
        }
      }
    }
  });
  if (use === 'amenity' || lite) return;
  // on the roof: equipment set in from the longest wall, and the head of a stair
  let long: Wall | null = null;
  for (const w of walls) if (!long || w.len > long.len) long = w;
  if (!long || long.len < 14) return;
  const free = (c: V2) => inRing(c[0], c[1], outer) && !rings.slice(1).some(r => inRing(c[0], c[1], r));
  for (const t of [0.22, 0.5, 0.78]) {
    if (!free(on(long, long.len * t, -6.4)) || !free(on(long, long.len * t, -4.6))) continue;
    k.box(long, long.len * t - 1.3, long.len * t + 1.3, -6.9, -5.1, top, 1.25, UNIT);
    k.box(long, long.len * t - 1.0, long.len * t + 1.0, -6.6, -5.4, top + 1.25, 0.05, tone(UNIT, 0.6));
  }
  if (free(on(long, 3.2, -5)) && free(on(long, 1.8, -6.4))) k.box(long, 1.6, 4.8, -6.6, -3.4, top, 2.9, tone(p.body, 0.92));
}



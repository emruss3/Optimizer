import type { SceneHeight } from '../../scene/heights';
import { levelsM, reachOf } from './house';
import { frontOf, inRing, insetRing, mat, on, ringWalls, tone, type Kit, type Mat, type V2, type Wall } from './kit';
import { blockPalette, MEMBRANE, type BlockPalette } from './styles';

const WALL_DEPTH = 0.24;
const FRAME_SETBACK = -0.16;
const FOOTING = 0.16;
const COPING = 0.06;

/** Infill apartment elevations. The shell follows the plan rings, including courtyards. */
export function infillBlock(
  k: Kit, rings: number[][][], height: SceneHeight, access: V2[], frontage: V2[], masonry: boolean, bayScale: number,
): boolean {
  const outer = rings[0];
  const loops = rings.map((ring, i) => ringWalls(ring, i > 0));
  const streetWalls = loops[0];
  const levels = levelsM(height);
  const top = levels[levels.length - 1] ?? 0;
  if (!outer || !streetWalls || streetWalls.length < 3 || top < 2.6 || levels.some((z, i) => z - (levels[i - 1] ?? 0) < 2.35)) return false;
  const p = blockPalette(masonry ? 'urban-brick' : 'infill', k.seed);
  const onStreet = frontage.length ? frontOf(streetWalls, frontage) : null;
  const entry = onStreet?.dist != null ? onStreet.index : frontOf(streetWalls, access).index;
  const parapet = 0.62;
  const roof = top - parapet - COPING;
  k.lite = bayScale > 1.6;
  k.mass(rings, -0.6, FOOTING + 0.6, p.base, 'base');
  k.parapet(rings, roof, parapet, {
    wall: p.body, coping: p.cap, roof: masonry ? mat(160, 157, 151, 'membrane') : MEMBRANE, thick: WALL_DEPTH,
  });
  if (k.lite) {
    const first = Math.min(levels[0] ?? roof, roof);
    k.mass(rings, FOOTING, first - FOOTING, p.base, 'body');
    k.mass(rings, first, roof - first, p.body, 'body');
  }

  loops.forEach((walls, ri) => {
    const inner = insetRing(walls, WALL_DEPTH);
    walls.forEach((w, wi) => {
      const start = inner[wi]!, end = inner[(wi + 1) % inner.length]!;
      const inside = (s: number): V2 => [start[0] + (end[0] - start[0]) * s / w.len, start[1] + (end[1] - start[1]) * s / w.len];
      const section = (a: number, b: number, z0: number, z1: number, finish: Mat) => {
        if (b - a <= 0.005 || z1 - z0 <= 0.005) return;
        k.prism([on(w, a), on(w, b), inside(b), inside(a)], z0, z1 - z0, finish, 'body');
      };
      const count = Math.max(1, Math.round(w.len / ((masonry ? 3.25 : 3.65) * bayScale)));
      const step = w.len / count;
      const entryBay = ri === 0 && wi === entry && step >= 2.75 ? Math.floor(count / 2) : -1;
      for (let bay = 0; bay < count; bay++) {
        const a = bay * step, b = a + step, s = (a + b) / 2;
        const accent = count >= 4 && bay > 0 && bay < count - 1 && (Math.floor((bay - 1) / 2) + wi) % 3 === 0;
        const balconies = ri === 0 && accent && (bay + wi) % 2 === 1;
        for (const [story, level] of levels.entries()) {
          const base = levels[story - 1] ?? FOOTING;
          const head = Math.min(level, roof);
          const finish = story === 0 ? p.base : accent ? p.body2 : p.body;
          if (k.shut?.(w, s, base + 0.8) === 'garage') {
            // a parking level under the homes: an open concrete bay, no windows and no lobby
            if (!k.lite) section(a, b, base, head, p.base);
            k.garageBay(w, a, b, base, head);
            continue;
          }
          const lobby = story === 0 && bay === entryBay && head - base >= 2.55 && !k.shut?.(w, s, base);
          const balcony = story > 0 && balconies && head - base >= 1.95;
          const bottom = base + (lobby ? 0.01 : balcony ? 0.07 : story === 0 ? 0.78 : 0.71);
          const openingTop = Math.min(head - 0.3, base + (lobby ? 3.22 : story === 0 ? 2.91 : 2.55));
          const width = Math.min(step - (lobby ? 0.4 : 0.88), lobby ? 3.56 : balcony ? 1.85 : masonry ? 1.28 : 2.42);
          // a wall that faces another wall close by, or stands against one, stays whole: no opening is cut in it
          const hasWindow = width >= 0.68 && openingTop - bottom >= 0.55 && k.shut?.(w, s, bottom) !== 'blank';
          if (k.lite) {
            if (hasWindow) k.window(w, s, width, bottom, openingTop, { frame: p.frame });
            continue;
          }
          if (!hasWindow) {
            section(a, b, base, head, finish);
            continue;
          }
          const first = s - width / 2, last = s + width / 2;
          section(a, first, base, head, finish);
          section(last, b, base, head, finish);
          section(first, last, base, bottom, finish);
          section(first, last, openingTop, head, finish);
          if (lobby) {
            const lobbyCorners = [on(w, first, -2.1), on(w, last, -2.1)];
            const fits = lobbyCorners.every(([x, y]) => inRing(x, y, outer) && !rings.slice(1).some(r => inRing(x, y, r)));
            storefront(k, w, first, last, bottom, openingTop, p, fits ? 1.85 : 0.32, reachOf(w, access, s));
          } else {
            const rear = on(w, s, -0.95);
            const depth = inRing(rear[0], rear[1], outer) && !rings.slice(1).some(r => inRing(rear[0], rear[1], r)) ? 0.57 : 0.13;
            const paired = !masonry && !balcony && width >= 1.9;
            const pier = 0.18;
            const paneWidth = paired ? (width - pier) / 2 : width;
            if (paired) section(s - pier / 2, s + pier / 2, bottom, openingTop, finish);
            const window = {
              frame: p.frame, grid: balcony ? [2, 1] as [number, number] : story > 0 ? [1, 2] as [number, number] : undefined,
              sill: !balcony && finish.surface === 'brick' ? p.trim : null,
              glazed: true, interiorDepth: depth,
            };
            const offset = (paneWidth + pier) / 2;
            for (const center of paired ? [s - offset, s + offset] : [s]) {
              k.window(w, center, paneWidth, bottom, openingTop, window, FRAME_SETBACK);
            }
            if (!balcony && finish.surface === 'brick') k.box(w, first - 0.05, last + 0.05, -0.09, 0.075, bottom - 0.075, 0.07, p.trim);
            if (balcony) {
              const half = Math.min(step / 2 - 0.25, 1.42);
              k.balcony(w, s - half, s + half, masonry ? 1.16 : 1.45, base + 0.055, { slab: p.slab, rail: 'bars', railMat: p.rail });
            }
          }
        }
      }
      if (k.lite) return;
      if (!masonry && levels.length > 1) {
        const z = levels[0]!;
        k.box(w, 0, w.len, -0.03, 0.04, z - 0.075, 0.09, p.trim);
      }
      if (ri === 0 && w.len >= 6) {
        if (entryBay < 0) k.bed(w, 0.55, w.len - 0.55, 0.1, 1.02);
        else {
          const center = (entryBay + 0.5) * step, clear = Math.min(step / 2, 2.15);
          k.bed(w, 0.55, center - clear, 0.1, 1.02);
          k.bed(w, center + clear, w.len - 0.55, 0.1, 1.02);
        }
      }
    });
  });

  if (k.lite) return true;
  const long = streetWalls.reduce((a, b) => a.len >= b.len ? a : b);
  if (long.len >= 12) {
    const steel = mat(145, 143, 137);
    for (const share of [0.28, 0.6, 0.79]) {
      const s = long.len * share;
      const fits = [-4.8, -3.2].every(d => [-1.1, 1.1].every(ds => {
        const [x, y] = on(long, s + ds, d);
        return inRing(x, y, outer) && !rings.slice(1).some(r => inRing(x, y, r));
      }));
      if (!fits) continue;
      k.box(long, s - 1.1, s + 1.1, -4.8, -3.2, roof + 0.05, 0.47, steel);
      k.box(long, s - 1.14, s + 1.14, -4.84, -3.16, roof + 0.52, 0.04, tone(steel, 0.79));
    }
  }
  return true;
}

function storefront(k: Kit, w: Wall, a: number, b: number, z0: number, z1: number, p: BlockPalette, depth: number, walkTo: number | null): void {
  const s = (a + b) / 2, f = 0.055;
  const frame = FRAME_SETBACK;
  const transom = Math.min(z0 + 2.15, z1 - 0.26);
  const warm = mat(161, 139, 112);
  k.recess(w, a, b, z0, z1, frame - 0.02, -depth, warm, p.slab);
  const door = Math.min(0.89, (b - a) * 0.29);
  const posts = [a, s - door, s, s + door, b];
  for (const x of posts) k.box(w, x - f / 2, x + f / 2, frame, frame + 0.08, z0, z1 - z0, p.frame);
  for (const z of [z0, transom, z1 - f]) k.box(w, a, b, frame, frame + 0.08, z, f, p.frame);
  posts.slice(1).forEach((x, i) => {
    const left = posts[i]! + f / 2, right = x - f / 2;
    k.pane(w, left, right, z0 + f, transom, frame + 0.045, true);
    k.pane(w, left, right, transom + f, z1 - f, frame + 0.045, true);
  });
  for (const offset of [-0.14, 0.14]) k.post(w, s + offset, frame + 0.11, z0 + 0.88, 0.46, 0.027, mat(189, 181, 166));
  if (depth >= 1) {
    k.box(w, a + 0.18, Math.min(b - 0.15, a + 1.25), -depth, -depth + 0.4, z0 + 0.28, 0.13, p.accent);
    k.box(w, s - 0.37, s + 0.37, -depth + 0.05, -depth + 0.29, z1 - 0.11, 0.07, mat(218, 193, 150));
  }
  k.box(w, a - 0.1, b + 0.1, 0, 0.69, 0.02, z0 - 0.02, p.slab);
  const pavedApproach = walkTo != null && walkTo > 1.9 && walkTo <= 14;
  k.approach(w, s, 0.69, pavedApproach ? walkTo : 1.93, Math.min(1.85, b - a), z0, 'walk', p.slab, pavedApproach ? 0.305 : 0.211);
  // Flush stone threshold, door hardware, and a metal fascia return at the canopy.
  k.box(w, a, b, -0.16, 0.08, z0 - 0.025, 0.025, p.slab);
  k.box(w, a - 0.24, b + 0.24, 1.385, 1.445, z1 + 0.039, 0.24, p.cap);
  k.box(w, a - 0.24, b + 0.24, -0.04, 1.44, z1 + 0.08, 0.21, p.cap);
  k.box(w, a - 0.17, b + 0.17, -0.02, 1.36, z1 + 0.055, 0.035, p.accent);
  for (const offset of [-0.22, 0.22]) k.lamp(w, s + offset * (b - a), z1 + 0.01, 0.08);
}

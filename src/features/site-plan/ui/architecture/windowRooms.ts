import polygonClipping from 'polygon-clipping';
import { mat, on, type Kit, type Wall } from './kit';

type RoomKind = 'living' | 'bedroom' | 'lobby';
export interface WindowRoom {
  left: number;
  right: number;
  /** The back wall lies inside the actual plan, d metres behind the façade. */
  depth: number;
  floor: number;
  ceiling: number;
  kind: RoomKind;
}

const WALL = mat(187, 177, 160, 'plaster');
const CEILING = mat(224, 222, 211, 'plaster');
const OAK = mat(151, 111, 77, 'wood');
const WALL_PANEL = mat(137, 99, 70, 'wood');
const FABRIC = mat(161, 150, 133);
const LINEN = mat(213, 197, 170);
const LIGHT = mat(250, 218, 171, 'interior-light');

/** An entire rectangular room-view pocket must fit. Corner tests alone can
 * miss a lateral courtyard, a narrow notch or a concave setback. */
export function roomViewFits(wall: Wall, pocket: Pick<WindowRoom, 'left' | 'right' | 'depth'>, rings: number[][][]): boolean {
  if (!rings.length || pocket.right - pocket.left < 0.55 || pocket.depth < 0.7) return false;
  const { left, right, depth } = pocket;
  const outline = [on(wall, left, -0.19), on(wall, right, -0.19), on(wall, right, -depth), on(wall, left, -depth)];
  try {
    const footprint = rings.map(r => r.map(([x = 0, y = 0]): [number, number] => [x, y]));
    return polygonClipping.difference([outline], footprint).length === 0;
  } catch {
    return false;
  }
}

/** Model only what glazing can see. No new window, room, entrance or program
 * is implied by these presentation surfaces and furnishings. */
export function drawWindowRoom(k: Kit, w: Wall, room: WindowRoom): void {
  const { left: a, right: b, depth, floor, ceiling, kind } = room;
  const span = b - a, center = (a + b) / 2;
  const back = -depth, front = -0.19;
  const z0 = floor + 0.013, z1 = ceiling - 0.06;
  if (k.lite || span < 0.55 || depth < 0.7 || z1 - z0 < 1.8) return;
  const point = (s: number, d: number, z: number) => [...on(w, s, d), z];
  const horizontal = (z: number, material: typeof WALL) =>
    k.flat([point(a, front, z), point(b, front, z), point(b, back, z), point(a, back, z)], material);
  horizontal(z0, kind === 'lobby' ? mat(158, 150, 133, 'concrete') : OAK);
  horizontal(z1, CEILING);
  k.panel(w, a, b, z0, z1, back, WALL);
  for (const edge of [a, b])
    k.flat([point(edge, front, z0), point(edge, back, z0), point(edge, back, z1), point(edge, front, z1)], WALL);
  // Timber and upholstery make a real depth cue when the camera moves.
  if (kind === 'lobby') {
    k.panel(w, a + span * 0.17, b - span * 0.16, z0 + 0.05, z1 - 0.08, back + 0.025, WALL_PANEL);
    for (let i = 1; i <= 7; i++) {
      const s = a + span * (0.18 + i * 0.082);
      k.box(w, s - 0.016, s + 0.016, back + 0.03, back + 0.073, z0 + 0.05, z1 - z0 - 0.15, OAK);
    }
    // Recess the seating toward the side wall. The door's center line remains empty.
    const lo = a + 0.13, hi = Math.min(center - 0.36, lo + 1.10);
    k.box(w, lo, hi, back + 0.095, back + 0.49, z0 + 0.34, 0.13, FABRIC);
    k.box(w, lo, hi, back + 0.085, back + 0.17, z0 + 0.47, 0.31, LINEN);
    for (const s of [lo + 0.045, hi - 0.045])
      k.box(w, s - 0.018, s + 0.018, back + 0.20, back + 0.43, z0, 0.34, WALL_PANEL);
  } else if (kind === 'living') {
    k.box(w, a + 0.09, b - 0.09, back + 0.09, back + 0.47, z0 + 0.18, 0.24, FABRIC);
    k.box(w, a + 0.12, b - 0.12, back + 0.08, back + 0.22, z0 + 0.42, 0.42, LINEN);
    const art = Math.min(0.34, span * 0.29);
    k.panel(w, center - art, center + art, z0 + 1.11, z0 + 1.56, back + 0.025, WALL_PANEL);
    k.panel(w, center - art + 0.025, center + art - 0.025, z0 + 1.135, z0 + 1.535, back + 0.035, LINEN);
  } else {
    // Side curtains, not an opaque colored rectangle over the whole pane.
    for (const [l, r] of [[a + 0.018, a + span * 0.17], [b - span * 0.17, b - 0.018]] as const)
      k.box(w, l, r, front - 0.125, front - 0.07, z0 + 0.04, z1 - z0 - 0.09, LINEN);
  }
  // A small recessed fixture, not a glowing wall. Cycles and WebGL share it.
  const lampW = Math.min(0.42, span * 0.36) / 2, at = back + (depth + front) * 0.47;
  k.box(w, center - lampW, center + lampW, at - 0.06, at + 0.06, z1 - 0.026, 0.018, LIGHT);
}

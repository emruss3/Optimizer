// Buildings drawn as buildings, in a style the reader chooses. A house gets a
// foundation, walls in real materials, a roof with eaves, a porch, a front
// door, a garage where a drive comes to it, and windows with frames. A row
// home gets two fronts and party walls. An apartment building gets a base with
// an entrance, stretches of cladding, balconies and a finished top.
//
// All of it stands on the plan's own footprint and rises to the scene's story
// levels (scene/heights): the eave, the parapet's foot or the top of a mansard
// is at the height the inspector states. Everything else here is illustration.
// The plan carries a footprint and a story count, not a design, and the view
// says so. A style changes the look and nothing else.
import type { BuildingUse, SceneHeight } from '../../scene/heights';
import { fittedHouse, type HouseAccess } from './fittedHouse';
import type { RGBA, Surface } from '../renderModel';
import { Kit, inRing, on, type Architecture, type V2, type Wall } from './kit';
import { DEFAULT_STYLE, type ArchStyle } from './styles';
import { house } from './house';
import { rowHome } from './town';
import { block, cottage } from './block';
import { infillBlock } from './infillBlock';

export { hashId, wallsOf } from './kit';
export type { Architecture } from './kit';
export { ARCH_STYLES, DEFAULT_STYLE, isArchStyle } from './styles';
export type { ArchStyle } from './styles';

/** What a part is made of, for a renderer that reads materials. */
export const surfaceOf = (part: { surface?: Surface; color?: RGBA }): Surface => part.surface ?? 'plain';

/**
 * The parts of one building. `pavement` is the drives, parking and streets
 * near it, in the same local metres: a house turns its front to them, and
 * puts its garage where a drive arrives. `neighbours` are the footprints of
 * the other buildings: a row home has a party wall where one stands against it.
 */
export function buildArchitecture(
  id: string, label: string, rings: number[][][], use: BuildingUse, height: SceneHeight,
  pavement: V2[] = [], bayScale = 1, style: ArchStyle = DEFAULT_STYLE, neighbours: number[][][] = [], frontage: V2[] = [], houseAccess?: HouseAccess,
  /** The parking structure this building stands round or over: its footprint, and how high its deck is. */
  garage?: { ring: number[][]; deckM: number; over: boolean } | null,
): Architecture {
  const kit = new Kit(id, label);
  kit.lite = bayScale > 1.6;
  if (use === 'house') {
    const exterior = houseAccess && (houseAccess.catalogued || houseAccess.driveways.length > 0 || houseAccess.garage === false)
      ? fittedHouse(kit, rings, height, pavement, style, houseAccess)
      : house(kit, rings, height, pavement, style) || fittedHouse(kit, rings, height, pavement, style);
    if (exterior) return kit.done();
  }
  if (use === 'townhome') {
    const attached = (w: Wall): boolean => {
      const [x, y] = on(w, w.len / 2, 0.6);
      return neighbours.some(r => inRing(x, y, r));
    };
    if (rowHome(kit, rings, height, pavement, style, attached)) return kit.done();
  }
  const plain = new Kit(id, label);
  // houses and row homes keep their own rules: a mews row faces its neighbour across a lane on purpose
  if (use === 'apartments' || use === 'amenity' || use === 'other') plain.shut = shutFor(neighbours, garage ?? null);
  // an existing house the record draws with more corners than four
  if (use === 'existing') { cottage(plain, rings, height); return plain.done(); }
  if (use === 'apartments' && (style === 'infill' || style === 'urban-brick')) {
    if (infillBlock(plain, rings, height, pavement, frontage, style === 'urban-brick', bayScale)) return plain.done();
  }
  block(plain, rings, use === 'house' || use === 'townhome' ? 'other' : use, height, pavement, style, bayScale);
  return plain.done();
}

/** No window looks at a wall closer than this, metres (about 30 ft). */
const FACING_M = 9;
/** No window within this of an inside corner, where two wings would look into each other, metres. */
const CORNER_M = 4;

/**
 * Where an apartment building keeps a wall closed. A wall that stands against another building,
 * or looks straight at one a few feet off, carries no windows; nor does the stretch beside an
 * inside corner, where the windows of two wings would look into each other. Below the deck of a
 * parking structure, a wall against the garage is closed and a wall of the garage is an open bay.
 */
export function shutFor(neighbours: number[][][], garage: { ring: number[][]; deckM: number; over: boolean } | null): (w: Wall, s: number, z: number) => 'blank' | 'garage' | null {
  const hit = (q: V2) => neighbours.some(r => inRing(q[0], q[1], r));
  return (w, s, z) => {
    for (const d of [0.6, 3, 6, FACING_M]) if (hit(on(w, s, d))) return 'blank';
    if (hit(on(w, s - CORNER_M, 2)) || hit(on(w, s + CORNER_M, 2))) return 'blank';
    if (garage && z < garage.deckM - 0.5) {
      const q = on(w, s, 0.6);
      if (inRing(q[0], q[1], garage.ring)) return 'blank';
      if (garage.over) return 'garage';
    }
    return null;
  };
}

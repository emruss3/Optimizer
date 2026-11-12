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
import type { RGBA, Surface } from '../renderModel';
import { Kit, inRing, on, type Architecture, type V2, type Wall } from './kit';
import { DEFAULT_STYLE, type ArchStyle } from './styles';
import { house } from './house';
import { rowHome } from './town';
import { block, cottage } from './block';

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
  pavement: V2[] = [], bayScale = 1, style: ArchStyle = DEFAULT_STYLE, neighbours: number[][][] = [],
): Architecture {
  const kit = new Kit(id, label);
  kit.lite = bayScale > 1.6;
  if (use === 'house' && house(kit, rings, height, pavement, style)) return kit.done();
  if (use === 'townhome') {
    const attached = (w: Wall): boolean => {
      const [x, y] = on(w, w.len / 2, 0.6);
      return neighbours.some(r => inRing(x, y, r));
    };
    if (rowHome(kit, rings, height, pavement, style, attached)) return kit.done();
  }
  const plain = new Kit(id, label);
  // an existing house the record draws with more corners than four
  if (use === 'existing') { cottage(plain, rings, height); return plain.done(); }
  block(plain, rings, use === 'house' || use === 'townhome' ? 'other' : use, height, pavement, style, bayScale);
  return plain.done();
}

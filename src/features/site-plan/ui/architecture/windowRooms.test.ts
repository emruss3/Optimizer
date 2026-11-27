import { describe, expect, it } from 'vitest';
import { buildArchitecture } from '.';
import { Kit, type Wall } from './kit';
import { drawWindowRoom, roomViewFits } from './windowRooms';
import { placedArchitecture } from '../../housing/architecture';
import { WEST_HEIMAN_DESIGNS } from '../../housing/westHeimanDesigns';
import { buildingHeight } from '../../scene/heights';

const wall: Wall = { a: [0, 0], t: [1, 0], n: [0, -1], len: 12 };
const pocket = { left: 3, right: 7, depth: 2.8 };
const shell = [[0, 0], [12, 0], [12, 17], [0, 17], [0, 0]];

describe('street-level room geometry', () => {
  it('rejects a pocket that crosses a small courtyard even when its four corners are valid', () => {
    const court = [[4, 1], [6, 1], [6, 2], [4, 2], [4, 1]];
    expect(roomViewFits(wall, pocket, [shell])).toBe(true);
    expect(roomViewFits(wall, pocket, [shell, court])).toBe(false);
    expect(roomViewFits(wall, { ...pocket, depth: 22 }, [shell])).toBe(false);
  });

  it('keeps everything inside the façade with no extra building or fixture in the low-detail model', () => {
    const kit = new Kit('lobby', 'Lobby detail');
    drawWindowRoom(kit, wall, { ...pocket, floor: 0.16, ceiling: 2.9, kind: 'lobby' });
    expect(kit.glass).toHaveLength(0);
    expect(kit.slabs.some(s => s.surface === 'interior-light')).toBe(true);
    for (const x of [...kit.flats.flatMap(f => f.polygon), ...kit.slabs.flatMap(s => s.polygon.flat())]) {
      expect(x[0]).toBeGreaterThanOrEqual(3);
      expect(x[0]).toBeLessThanOrEqual(7);
      expect(x[1]).toBeGreaterThanOrEqual(0.19);
      expect(x[1]).toBeLessThanOrEqual(2.8);
    }
    const lite = new Kit('lite', 'Lite');
    lite.lite = true;
    drawWindowRoom(lite, wall, { ...pocket, floor: 0.16, ceiling: 2.9, kind: 'lobby' });
    expect(lite.slabs.length + lite.flats.length).toBe(0);
  });

  it.each(WEST_HEIMAN_DESIGNS)('uses existing residential openings and keeps home and approach extents for $name', home => {
    const full = placedArchitecture(home, 'authored', 'Authored', [0, 0], [1, 0], false, [])!;
    const lite = placedArchitecture(home, 'authored', 'Authored', [0, 0], [1, 0], true, [])!;
    expect(full.slabs.some(s => s.surface === 'interior-light')).toBe(true);
    expect(lite.slabs.some(s => s.surface === 'interior-light')).toBe(false);
    expect(full.slabs.filter(s => s.approach)).toEqual(lite.slabs.filter(s => s.approach));
    expect(full.slabs.filter(s => s.part !== 'detail')).toEqual(lite.slabs.filter(s => s.part !== 'detail'));
  });

  it('does not dress a garage level as a lobby', () => {
    const depth = 2.3;
    const result = buildArchitecture('wrap', 'Wrap', [shell], 'apartments', buildingHeight('apartments', 4),
      [[6, -9]], 1, 'infill', [], [[6, -9]], undefined, { ring: shell, deckM: depth, over: true });
    expect(result.slabs.some(s => s.surface === 'interior-light')).toBe(false);
  });
});

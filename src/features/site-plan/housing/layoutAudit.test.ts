import { expect, it } from 'vitest';
import { HOME_DESIGNS } from './originalDesigns';
import { wallsFor } from './drawings';

it.each(HOME_DESIGNS)('keeps $name room zones separate and reachable from the entrance or stair', home => {
  for (const [level, floor] of home.levels.entries()) {
    const adjacent = new Map(floor.rooms.map(r => [r.name, new Set<string>()]));
    for (const wall of wallsFor(home, level)) if (wall.other && wall.cuts.length) {
      adjacent.get(wall.room)?.add(wall.other);
      adjacent.get(wall.other)?.add(wall.room);
    }
    const reached = new Set([level === 0 ? home.doors.find(d => d.kind === 'entry')!.room : 'Stair hall']);
    for (const room of reached) for (const next of adjacent.get(room) ?? []) reached.add(next);
    for (const [i, a] of floor.rooms.entries()) {
      // The Garden Infill carriage house is intentionally detached.
      if (!(home.id === 'tn-garden-infill-v1' && a.name === 'Garage')) expect(reached.has(a.name), a.name).toBe(true);
      const [x, y, w, d] = a.rect;
      for (const b of floor.rooms.slice(i + 1)) {
        const [u, v, q, r] = b.rect;
        const width = Math.min(x + w, u + q) - Math.max(x, u);
        const depth = Math.min(y + d, v + r) - Math.max(y, v);
        expect(width > 0.001 && depth > 0.001, a.name + ' / ' + b.name).toBe(false);
      }
    }
  }
});

it('enters the Motor Court primary suite directly, without walking through its dressing room', () => {
  const home = HOME_DESIGNS.find(h => h.id === 'tn-motor-court-v1')!;
  const doors = wallsFor(home, 0).filter(w => w.cuts.some(c => c.kind === 'door'));
  const connects = (a: string, b: string) => doors.some(w => [w.room, w.other].includes(a) && [w.room, w.other].includes(b));
  expect(connects('Stair hall', 'Primary bedroom')).toBe(true);
  expect(connects('Gallery', 'Dressing')).toBe(false);
});

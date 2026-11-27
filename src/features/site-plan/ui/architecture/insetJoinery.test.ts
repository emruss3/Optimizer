import { expect, it } from 'vitest';
import { Kit, mat, type Wall } from './kit';

const wall: Wall = { a: [0, 0], t: [1, 0], n: [0, -1], len: 5 };
const spec = { frame: mat(55, 52, 50), sill: mat(203, 198, 189), grid: [2, 2] as [number, number], glazed: true, insetJoinery: true };

it('keeps glazing within the source opening and behind the facade with visible outboard joinery', () => {
  const k = new Kit('one', 'House');
  k.window(wall, 2.5, 1.5, 1.0, 2.3, spec);
  const { slabs, flats, glass } = k.done();
  expect(glass).toHaveLength(1);
  expect(glass[0]).toMatchObject({ clear: true, id: 'one' });
  for (const [x, y, z] of glass[0]!.polygon) {
    expect(x).toBeGreaterThan(1.75);
    expect(x).toBeLessThan(3.25);
    expect(y).toBeCloseTo(0.096);
    expect(z).toBeGreaterThan(1.0);
    expect(z).toBeLessThan(2.3);
  }
  expect(slabs.some(s => s.polygon[0]!.some(p => p[1]! < -0.09))).toBe(true);
  expect(flats.some(s => s.polygon.every(p => p[1]! > 0.15))).toBe(true);
});

it('keeps the simple geometry path for constrained scenes', () => {
  const k = new Kit('one', 'House');
  k.lite = true;
  k.window(wall, 2.5, 1.5, 1.0, 2.3, spec);
  const { slabs, glass } = k.done();
  expect(glass).toHaveLength(1);
  expect(slabs).toHaveLength(0);
});

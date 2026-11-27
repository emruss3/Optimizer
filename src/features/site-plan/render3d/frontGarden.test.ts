import { expect, it } from 'vitest';
import { frontGarden } from './frontGarden';
import type { ApproachAnchor } from './streetDetails';

const ring = (x: number, y: number, w: number, h: number) => [[x, y], [x+w, y], [x+w, y+h], [x, y+h], [x, y]];
const lot = ring(0, 0, 8, 13);
const entry: ApproachAnchor = { id: '1', building: 'B', kind: 'walk', threshold: [4, 4, 0.3], connection: [4, 1, 0], facing: [0, -1] };
const homes = new Set(['B']);
const home = ring(1, 4, 6, 8);
it('puts low plants on clear ground on both sides of a known entry', () => {
  const planted = frontGarden([entry], homes, [lot], [[home]], [{ path: [[4, 0], [4, 4]], widthM: 1.1 }]);
  expect(planted).toHaveLength(2);
  expect(planted.some(([x]) => x < 4) && planted.some(([x]) => x > 4)).toBe(true);
  expect(planted.every(([x, y, r]) => Math.abs(x - 4) > 0.55 + r * 2 && y < 4 - r * 2)).toBe(true);
});
it('omits plantings on a driveway or hazard, outside its lot, and for unassigned pads and garage entries', () => {
  expect(frontGarden([entry], homes, [lot], [[ring(0, 0, 8, 4)]], [])).toEqual([]);
  expect(frontGarden([entry], homes, [ring(3, 0, 2, 13)], [[home]], [])).toEqual([]);
  expect(frontGarden([entry], new Set(), [lot], [[home]], [])).toEqual([]);
  expect(frontGarden([{ ...entry, kind: 'apron' }], homes, [lot], [[home]], [])).toEqual([]);
});

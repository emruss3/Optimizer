import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import { imperviousAreaSf, imperviousNowPct } from './impervious';
import { createGroundFrame } from '../scene/frame';
import { builtSummary } from '../ui/BuiltHeadline';

const O: [number, number] = [-9655000, 4318000];
const f = createGroundFrame(O[0], O[1]);
const sq = (id: string, type: Element['type'], x: number, y: number, w: number, d: number, props: Record<string, unknown> = {}): Element => ({
  id, type, name: id, properties: props, metadata: {} as never,
  geometry: { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + d], [x, y + d], [x, y]].map(p => f.fromFeet(p as [number, number]))] },
}) as unknown as Element;

describe('impervious area read off the plan (audit 9379472 F1)', () => {
  it('unions roof and paving once: an overlapping walk is not counted twice', () => {
    const house = sq('sfv1-pad-1', 'building', 0, 0, 40, 30, { house: true });
    const walk = sq('w', 'circulation', 30, 0, 20, 10, { kind: 'walk' }); // 10×10 of it under the house
    expect(Math.round(imperviousAreaSf([house]))).toBe(1200);
    expect(Math.round(imperviousAreaSf([house, walk]))).toBe(1200 + 100);
    // lawn does not count
    expect(Math.round(imperviousAreaSf([house, sq('g', 'greenspace', 100, 100, 50, 50)]))).toBe(1200);
  });

  it('moves the solver figure by the change since the solve, on the solver basis', () => {
    expect(imperviousNowPct({ solverPct: 30.6, siteSf: 65000, baseSf: 19890, nowSf: 20570 })).toBe(31.6);
    expect(imperviousNowPct({ solverPct: null, siteSf: 65000, baseSf: 1, nowSf: 2 })).toBeNull();
  });

  it('the headline never calls detached houses apartments, whatever a house is named', () => {
    const houses = [sq('sfv1-pad-1', 'building', 0, 0, 40, 30, { house: true }), { ...sq('sfv1-pad-3', 'building', 60, 0, 30, 30, { house: true }), name: 'Court Cottage · concept' } as Element];
    expect(builtSummary({ totalUnits: 5 } as never, houses)).toBeNull();
  });
});

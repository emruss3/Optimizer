import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { amenityHost, AMENITY_GROUND_FLOOR_SHARE } from './generateMfPlan';

const sq = (x: number, y: number, w: number, h: number): Polygon => ({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] });
const bld = (g: Polygon, use = 'residential'): Element => ({ id: use, type: 'building', name: use, geometry: g, properties: { use } } as unknown as Element);

describe('amenityHost (4900 Centennial Blvd, 2026-11-27: clubhouse drawn as a second building on a residential footprint)', () => {
  it('a clubhouse inside a residential building belongs to that building', () => {
    const host = amenityHost(sq(10, 10, 20, 20), [bld(sq(100, 100, 50, 50)), bld(sq(0, 0, 60, 40))]);
    expect(host?.index).toBe(1);
    expect(host!.share).toBeCloseTo(1, 5);
    expect(host!.share).toBeGreaterThanOrEqual(AMENITY_GROUND_FLOOR_SHARE);
  });
  it('a standalone clubhouse (garden campus) has no host', () => {
    const host = amenityHost(sq(200, 200, 30, 30), [bld(sq(0, 0, 60, 40))]);
    expect(host?.share ?? 0).toBeLessThan(AMENITY_GROUND_FLOOR_SHARE);
  });
  it('only residential buildings can host', () => {
    expect(amenityHost(sq(10, 10, 20, 20), [bld(sq(0, 0, 60, 40), 'amenity')])).toBeNull();
  });
});

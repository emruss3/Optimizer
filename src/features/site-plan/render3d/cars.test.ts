import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { carParts, carSpot } from './cars';

// a stall-sized footprint, 4.4 m long and 1.8 m wide, running along +y
const ring = [[10, 20, 0.3], [11.8, 20, 0.3], [11.8, 24.4, 0.3], [10, 24.4, 0.3], [10, 20, 0.3]];

describe('cars', () => {
  it('stands a car on its footprint, along its long side, on the pavement', () => {
    const spot = carSpot(ring, [200, 30, 30, 255], 4)!;
    expect(spot.x).toBeCloseTo(10.9);
    expect(spot.y).toBeCloseTo(22.2);
    expect(spot.length).toBeCloseTo(4.4);
    expect(spot.width).toBeCloseTo(1.8);
    // along y, either way round
    expect(Math.abs(Math.sin(spot.heading))).toBeCloseTo(1);
    expect(spot.z).toBeCloseTo(0.17);
  });

  it('is a shaped car, not a box: a body, glass, wheels and lights, inside its stall', () => {
    const parts = carParts(carSpot(ring, [200, 30, 30, 255], 4)!);
    expect(parts.filter(p => p.key === 'glass|solid').length).toBe(1);
    expect(parts.filter(p => p.key === 'paint|solid').length).toBeGreaterThanOrEqual(3);
    // four tyres and four hubs, two headlamps and two tail lamps
    expect(parts.filter(p => p.key === 'plain|solid').length).toBe(12);
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
    expect(box.min.x).toBeGreaterThan(9.9);
    expect(box.max.x).toBeLessThan(11.9);
    expect(box.min.y).toBeGreaterThan(19.8);
    expect(box.max.y).toBeLessThan(24.6);
    // a car's height, with its wheels on the pavement
    expect(box.max.z - box.min.z).toBeGreaterThan(1.3);
    expect(box.max.z - box.min.z).toBeLessThan(1.8);
    expect(box.min.z).toBeCloseTo(0.17, 1);
    // the body carries the car's colour; the glass does not
    expect(parts.find(p => p.key === 'paint|solid')!.color).toEqual([200, 30, 30, 255]);
  });

  it('has no car for a footprint that is not one', () => {
    expect(carSpot([[0, 0], [1, 0]], [0, 0, 0, 255], 1)).toBeNull();
  });
});

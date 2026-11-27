import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { carSpot } from './cars';
import { vehicleFits, vehicleTransform } from './vehicles';

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
    expect(spot.z).toBeCloseTo(0.3);
  });

  it('preserves native scale and refuses to squeeze an SUV into an undersized stall', () => {
    const spot = carSpot(ring, [200, 30, 30, 255], 4)!;
    expect(vehicleFits(spot, { length: 4.2, width: 1.75 })).toBe(true);
    expect(vehicleFits(spot, { length: 4.6, width: 1.91 })).toBe(false);
    const matrix = vehicleTransform({ ...spot, pitch: 0.05, roll: 0.02 });
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    expect(scale.toArray().map(x => Math.round(x * 100))).toEqual([100, 100, 100]);
    expect(new THREE.Vector3(2, 0, 0).applyMatrix4(matrix).z).toBeCloseTo(0.4, 2);
    expect(new THREE.Vector3(0, 1, 0).applyMatrix4(matrix).z).toBeCloseTo(0.32, 2);
  });

  it('has no car for a footprint that is not one', () => {
    expect(carSpot([[0, 0], [1, 0]], [0, 0, 0, 255], 1)).toBeNull();
  });
});

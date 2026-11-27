import { describe, expect, it } from 'vitest';
import type { CarSpot } from './cars';
import { foregroundVehicles, seatVehicle, vehicleWheelPoints } from './vehiclePlacement';

const spot: CarSpot = { x: 1, y: 3, z: 0, heading: 0, length: 4.8, width: 1.8, color: [80, 80, 80, 255], seed: 7 };

describe('presentation vehicle seating', () => {
  it('uses all four wheel heights and the rendered pavement elevation', () => {
    const surface = (x: number, y: number) => 3 + 0.04 * x - 0.03 * y;
    const fitted = seatVehicle(spot, surface);
    expect(fitted.z).toBeCloseTo(surface(spot.x, spot.y));
    expect(fitted.pitch).toBeCloseTo(0.04);
    expect(fitted.roll).toBeCloseTo(-0.03);
    expect(fitted.heading).toBe(spot.heading);
  });

  it('follows the actual bay orientation on a diagonal or a reversed stall', () => {
    const car = { ...spot, heading: Math.PI / 2 };
    const [fl, fr, bl, br] = vehicleWheelPoints(car);
    expect(fl?.[0]).toBeLessThan(fr?.[0] ?? 0);
    expect(fl?.[1]).toBeGreaterThan(bl?.[1] ?? 0);
    expect(br?.[0]).toBeGreaterThan(bl?.[0] ?? 0);
    expect(seatVehicle(car, (_x, y) => 0.08 * y).pitch).toBeCloseTo(0.08);
  });

  it('caps the decorative population stably without editing the source stalls', () => {
    const far = { ...spot, x: 100 };
    const near = { ...spot, x: 0, y: 0 };
    const tied = { ...near, seed: 2 };
    const source = [far, near, tied];
    expect(foregroundVehicles(source, 0, 0, 2)).toEqual([tied, near]);
    expect(source).toEqual([far, near, tied]);
  });
});

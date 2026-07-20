import { describe, it, expect } from 'vitest';
import { sunPosition } from './sunPosition';

// Nashville's latitude — the assertions are physics, not fixtures: solar
// noon altitude = 90 − |lat − declination|, a closed-form truth.
const NASH_LAT = 36.16;

describe('sunPosition — the sun-study light source', () => {
  it('summer solstice noon: high sun, due south', () => {
    const p = sunPosition(172, 12, NASH_LAT);
    // 90 - (36.16 - 23.45) ≈ 77.3°
    expect(p.altitudeDeg).toBeGreaterThan(75);
    expect(p.altitudeDeg).toBeLessThan(79);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(2);
  });

  it('winter solstice noon: low sun, due south', () => {
    const p = sunPosition(355, 12, NASH_LAT);
    // 90 - (36.16 + 23.45) ≈ 30.4°
    expect(p.altitudeDeg).toBeGreaterThan(28);
    expect(p.altitudeDeg).toBeLessThan(33);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(2);
  });

  it('morning sun rises in the east, afternoon sets in the west', () => {
    const am = sunPosition(80, 8, NASH_LAT);
    const pm = sunPosition(80, 16, NASH_LAT);
    expect(am.azimuthDeg).toBeGreaterThan(0);
    expect(am.azimuthDeg).toBeLessThan(180); // east of the meridian
    expect(pm.azimuthDeg).toBeGreaterThan(180); // west of the meridian
    expect(pm.azimuthDeg).toBeLessThan(360);
    // Morning light points WEST-ward through the scene (negative east comp
    // of the sun→scene direction is positive... the sun is east, so the
    // direction TOWARD the scene has a negative X? sun east → sunX > 0 →
    // direction X < 0: light travels westward.)
    expect(am.direction[0]).toBeLessThan(0);
    expect(pm.direction[0]).toBeGreaterThan(0);
  });

  it('direction is a unit vector pointing downward when the sun is up', () => {
    const p = sunPosition(172, 10, NASH_LAT);
    const len = Math.hypot(...p.direction);
    expect(Math.abs(len - 1)).toBeLessThan(1e-9);
    expect(p.direction[2]).toBeLessThan(0); // sun above → light points down
  });

  it('night is honest: negative altitude, no daylight pretense', () => {
    const p = sunPosition(355, 2, NASH_LAT);
    expect(p.altitudeDeg).toBeLessThan(0);
  });
});

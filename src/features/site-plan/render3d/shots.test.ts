import { describe, it, expect } from 'vitest';
import { streetShot } from './shots';

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// a 60 by 18 m building, a street running east to west 30 m south of it
const building = { points: rect(-30, -9, 60, 18), height: 13 };
const street = [[[-200, -40], [200, -40]]];

describe('streetShot', () => {
  it('stands at eye level on the street side, outside every building', () => {
    const shot = streetShot([building], [], street)!;
    expect(shot.position[2]).toBeCloseTo(5.5 * 0.3048);
    // what is said about the shot is in feet
    expect(shot.basis).toMatch(/5\.5 ft/);
    expect(shot.basis).not.toMatch(/\d m\b/);
    expect(shot.position[1]).toBeLessThan(-9);          // south of the building: the street side
    expect(shot.target[0]).toBeCloseTo(0);
    expect(shot.target[1]).toBeCloseTo(0);
    expect(shot.basis).toMatch(/eye level/);
  });

  it('keeps the whole building in the frame, near corner and roof included', () => {
    const shot = streetShot([building], [], street)!;
    const [px, py] = shot.position, vx = -px, vy = -py;
    const halfH = Math.atan(Math.tan((shot.fovDeg * Math.PI) / 360) * (16 / 9));
    for (const c of building.points) {
      const dx = c[0] - px, dy = c[1] - py;
      const side = Math.abs(Math.atan2(vx * dy - vy * dx, vx * dx + vy * dy));
      expect(side).toBeLessThan(halfH);
    }
  });

  it.each([16 / 9, 3.3])('fits graded pads and roof detail in a %f aspect viewport', aspect => {
    const subject = { ...building, base: 7, roofHeight: 18 };
    const shot = streetShot([subject], [], street, aspect, [], () => -2)!;
    expect(shot.position[2]).toBeCloseTo(-2 + 5.5 * 0.3048);
    expect(shot.target[2]).toBe(shot.position[2]);
    const [px, py, pz] = shot.position;
    const distance = Math.hypot(px, py);
    const tanV = Math.tan((shot.fovDeg * Math.PI) / 360);
    for (const [x, y] of subject.points) {
      const depth = (-px * (x - px) - py * (y - py)) / distance;
      for (const height of [subject.base, subject.base + subject.roofHeight]) {
        const projected = (height - pz) / (depth * tanV) - (shot.lift - 1);
        expect(Math.abs(projected)).toBeLessThanOrEqual(0.900001);
      }
    }
  });

  it('looks at the building at an angle, not square on', () => {
    const shot = streetShot([building], [], street)!;
    const az = Math.atan2(shot.position[1], shot.position[0]);
    // not within 10 degrees of straight south
    expect(Math.abs(az + Math.PI / 2)).toBeGreaterThan((10 * Math.PI) / 180);
  });

  it('will not look over or through a neighbour', () => {
    // a wall of neighbours along the whole street side
    const wall = [rect(-150, -30, 300, 12)];
    const shot = streetShot([building], wall, street)!;
    // the camera is on the building's side of the wall, or round the end of it: never behind it
    const behind = shot.position[1] < -30 && Math.abs(shot.position[0]) < 150;
    expect(behind).toBe(false);
  });

  it('has no shot when the building is walled in on every side', () => {
    const ring = [rect(-200, -200, 400, 185), rect(-200, 15, 400, 185), rect(-200, -15, 165, 30), rect(35, -15, 165, 30)];
    expect(streetShot([building], ring, street)).toBeNull();
  });

  it('moves off a place where a tree stands between the eye and the building', () => {
    const open = streetShot([building], [], street)!;
    // a big tree halfway between that place and the building
    const tree: [number, number, number] = [open.position[0] / 2, open.position[1] / 2, 6];
    const moved = streetShot([building], [], street, 16 / 9, [tree])!;
    expect(Math.hypot(moved.position[0] - open.position[0], moved.position[1] - open.position[1])).toBeGreaterThan(1);
    expect(moved.basis).toMatch(/0 trees in the line of sight/);
  });

  it('has no shot without a building', () => {
    expect(streetShot([], [], street)).toBeNull();
  });
});

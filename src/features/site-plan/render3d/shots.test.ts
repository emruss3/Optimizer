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

  it('also clears a thin fence in front of the building', () => {
    const fence = [[[-150, -30], [150, -30]]];
    const shot = streetShot([building], fence, street)!;
    expect(shot.position[1] < -30 && Math.abs(shot.position[0]) < 150).toBe(false);
  });

  it('has no shot when the building is walled in on every side', () => {
    const ring = [rect(-200, -200, 400, 185), rect(-200, 15, 400, 185), rect(-200, -15, 165, 30), rect(35, -15, 165, 30)];
    expect(streetShot([building], ring, street)).toBeNull();
  });

  it('frames another home when the main building has no clear approach', () => {
    const ring = [rect(-200, -200, 400, 185), rect(-200, 15, 400, 185), rect(-200, -15, 165, 30), rect(35, -15, 165, 30)];
    const home = { points: rect(240, -50, 12, 18), height: 9 };
    const s = streetShot([building, home], ring, [[[220, -60], [300, -60]]]);
    expect(s?.target.slice(0, 2)).toEqual([246, -41]);
    expect(s?.position[2]).toBeCloseTo(5.5 * 0.3048);
  });

  it('moves off a place where a tree stands between the eye and the building', () => {
    const open = streetShot([building], [], street)!;
    // a big tree halfway between that place and the building
    const tree: [number, number, number] = [open.position[0] / 2, open.position[1] / 2, 6];
    const moved = streetShot([building], [], street, 16 / 9, [tree])!;
    expect(Math.hypot(moved.position[0] - open.position[0], moved.position[1] - open.position[1])).toBeGreaterThan(1);
    expect(moved.basis).toMatch(/0 trees in the line of sight/);
  });

  it('keeps the camera outside a crown at the original view point', () => {
    const [x, y] = streetShot([building], [], street)!.position;
    const moved = streetShot([building], [], street, 16 / 9, [[x, y, 5]])!;
    expect(Math.hypot(moved.position[0] - x, moved.position[1] - y)).toBeGreaterThanOrEqual(6.25);
  });

  it('changes the viewpoint when a foreground object fills the side of the frame', () => {
    const open = streetShot([building], [], street)!;
    const [x, y] = open.position;
    const distance = Math.hypot(x, y);
    // 2 m ahead and 1.5 m to one side of the sight line.
    const obstacle: [number, number, number] = [
      x - (2 * x + 1.5 * y) / distance,
      y - (2 * y - 1.5 * x) / distance,
      1,
    ];
    const moved = streetShot([building], [], street, 16 / 9, [], () => 0, [obstacle]);
    expect(moved).not.toBeNull();
    expect(moved!.position).not.toEqual(open.position);
  });

  it('has no shot without a building', () => {
    expect(streetShot([], [], street)).toBeNull();
  });
});

describe('a kept camera restates what it sees (handoff 11-27)', () => {
  const house = { id: 'h1', points: [[0, 0], [10, 0], [10, 8], [0, 8]] as Array<[number, number]>, height: 6 };
  it('counts the crowns its sight lines cross and the share that pass clear', async () => {
    const { sightReport, aimedSubject } = await import('./shots');
    expect(sightReport([5, -20], house, [])).toEqual({ trees: 0, clearShare: 1 });
    // one large crown straight between the eye and the house
    const blocked = sightReport([5, -20], house, [[5, -8, 4]]);
    expect(blocked.trees).toBe(1);
    expect(blocked.clearShare).toBeLessThan(0.5);
    expect(aimedSubject([5, 4], [house])?.id).toBe('h1');
  });

  it('frames a short garage ramp from its connected drawn pavement, but not across a gap', async () => {
    const { approachShot } = await import('./shots');
    const apron = {
      id: 'ramp', building: 'h1', kind: 'apron' as const,
      threshold: [5, 0, 0.1] as [number, number, number],
      connection: [5, -0.28, 0.3] as [number, number, number],
    };
    const camera = (inPavement: (x: number, y: number) => boolean) =>
      approachShot([apron], [house], [], [], () => 0, [], 16 / 9, 'apron', inPavement);
    const driveway = (x: number, y: number) => x >= 4 && x <= 6 && y <= -0.28 && y >= -4;
    expect(camera(driveway)?.position).toEqual([5, expect.closeTo(-3.98), expect.closeTo(1.6764)]);
    expect(camera((x, y) => driveway(x, y) && (y > -1 || y < -1.6))).toBeNull();
  });

  it('names the garage camera\'s limitation instead of counting an aerial as success', async () => {
    const { shotUnavailableReason } = await import('./shots');
    expect(shotUnavailableReason('garage', [house], [], [])).toContain('no drive is drawn to a garage');
  });
});

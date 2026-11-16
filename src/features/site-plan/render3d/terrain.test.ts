import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeTerrain, drape, latticeHeight, EASE_M } from './terrain';
import { FT } from './shots';
import type { ParcelTopo } from '../api/parcelTopo';

// a 5 by 4 grid, 20 ft apart, rising 1 ft a column to the east; one cell left out
const topo = (): ParcelTopo => {
  const samples: Array<[number, number, number]> = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (!(c === 2 && r === 1)) samples.push([c, r, 500 + c]);
  return { parcel_ogc_fid: 1, spacing_ft: 20, grid: { origin_x: 1000, origin_y: 2000, cols: 5, rows: 4, spacing_ft: 20 }, contours: [], samples };
};
// the survey frame in feet to a model in metres, with the model's zero at the grid's first corner
const toModel = (p: [number, number]): [number, number] => [(p[0] - 1000) * FT, (p[1] - 2000) * FT];

describe('makeTerrain', () => {
  const t = makeTerrain(topo(), toModel)!;

  it('reads the samples where they are and between them', () => {
    expect(t.zeroFt).toBe(500);
    expect(t.elevationFt(20 * FT, -20 * FT)).toBeCloseTo(501, 5);
    expect(t.elevationFt(30 * FT, -20 * FT)).toBeCloseTo(501.5, 5);
    expect(t.heightAt(40 * FT, 0)).toBeCloseTo(2 * FT, 6);
  });

  it('north in the survey is north in the model: rows run south', () => {
    // every row holds the same heights here, so only the column matters
    expect(t.elevationFt(60 * FT, -60 * FT)).toBeCloseTo(503, 5);
  });

  it('fills a cell the survey left out from its neighbour, never from nothing', () => {
    const v = t.elevationFt(40 * FT, -20 * FT);
    expect(v).toBeGreaterThanOrEqual(501);
    expect(v).toBeLessThanOrEqual(503);
  });

  it('holds the edge past the grid and eases to one level', () => {
    expect(t.outside(40 * FT, -20 * FT)).toBe(0);
    const justOut = t.elevationFt(80 * FT + 1, -20 * FT);
    expect(justOut).toBeCloseTo(504, 0);
    const far = t.elevationFt(80 * FT + EASE_M + 50, -20 * FT);
    const farther = t.elevationFt(80 * FT + EASE_M + 500, 900);
    expect(far).toBeCloseTo(farther, 9);
    expect(far).toBeGreaterThan(500);
    expect(far).toBeLessThan(504);
  });

  it('is null without a usable grid', () => {
    expect(makeTerrain({ ...topo(), samples: [] }, toModel)).toBeNull();
  });
});

describe('drape', () => {
  const t = makeTerrain(topo(), toModel)!;
  const sheet = (x0: number, y0: number, x1: number, y1: number, z: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 0, 1]).flat(), 3));
    return g;
  };

  it('lays a wide flat piece on the ground, keeping its own height above it', () => {
    const out = drape(sheet(0, -18, 24, 0, 0.13), t, 3);
    const p = out.getAttribute('position');
    expect(p.count).toBeGreaterThan(6);
    for (let i = 0; i < p.count; i++) {
      expect(p.getZ(i)).toBeCloseTo(0.13 + latticeHeight(t, p.getX(i), p.getY(i), 3), 5);
      // and the lattice stays close to the surveyed surface
      expect(Math.abs(latticeHeight(t, p.getX(i), p.getY(i), 3) - t.heightAt(p.getX(i), p.getY(i)))).toBeLessThan(0.03);
    }
  });

  it('keeps two pieces of different shape the same distance apart everywhere', () => {
    // a lawn and a road ribbon across it, cut quite differently
    const road = drape(sheet(3.7, -17, 9.1, -1, 0.13), t, 3);
    const p = road.getAttribute('position');
    // every face of the road lies on one flat triangle of the shared ground: its three corners and
    // its middle are all exactly 0.13 above that ground, so nothing under it can show through
    for (let i = 0; i < p.count; i += 3) {
      const mx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, my = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const mz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      expect(mz - latticeHeight(t, mx, my, 3)).toBeCloseTo(0.13, 5);
    }
  });

  it('covers the same ground after cutting', () => {
    const out = drape(sheet(0, -18, 24, 0, 0), t, 3);
    const p = out.getAttribute('position');
    let area = 0;
    for (let i = 0; i < p.count; i += 3) area += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getY(i + 2) - p.getY(i)) - (p.getX(i + 2) - p.getX(i)) * (p.getY(i + 1) - p.getY(i))) / 2;
    expect(area).toBeCloseTo(24 * 18, 2);
  });

  it('leans a flat face with the slope', () => {
    const out = drape(sheet(6, -12, 12, -6, 0), t, 3);
    const n = out.getAttribute('normal');
    // ground rises to the east, so the face tips to the west
    expect(n.getX(0)).toBeLessThan(0);
    expect(n.getZ(0)).toBeGreaterThan(0.9);
  });

  it('leaves a piece in the level far field whole', () => {
    const out = drape(sheet(5000, 5000, 9000, 9000, 0), t, 5);
    expect(out.getAttribute('position').count).toBe(6);
  });
});

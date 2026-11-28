import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { dissolveFlat, browserCamera, cameraFromLiveView, projectPx, withLiveViewCamera, type JobCamera, type RenderJob } from './exportJob';

const sheet = (x0: number, y0: number, x1: number, y1: number, z: number) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 0, 1]).flat(), 3));
  g.setAttribute('color', new THREE.Uint8BufferAttribute(Array.from({ length: 6 }, () => [10, 20, 30, 255]).flat(), 4, true));
  return g;
};
const area = (g: THREE.BufferGeometry) => {
  const p = g.getAttribute('position');
  let a = 0;
  for (let i = 0; i < p.count; i += 3) a += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getY(i + 2) - p.getY(i)) - (p.getX(i + 2) - p.getX(i)) * (p.getY(i + 1) - p.getY(i))) / 2;
  return a;
};

describe('dissolveFlat', () => {
  it('joins two overlapping pieces at one height into the ground they cover, once', () => {
    const out = dissolveFlat([sheet(0, 0, 10, 4, 0.13), sheet(6, 0, 16, 4, 0.13)]);
    expect(out).toHaveLength(1);
    expect(area(out[0]!)).toBeCloseTo(64, 4);          // 16 by 4, not 40 + 40
    const p = out[0]!.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getZ(i)).toBeCloseTo(0.13, 6);
    // it faces up and keeps the pieces' colour, so it merges with its neighbours
    const n = out[0]!.getAttribute('normal'), c = out[0]!.getAttribute('color');
    expect(n.getZ(0)).toBe(1);
    expect([c.getX(0), c.getY(0), c.getZ(0)].map(v => Math.round(v * 255))).toEqual([10, 20, 30]);
    expect(c.normalized).toBe(true);
  });

  it('keeps pieces at different heights apart', () => {
    const out = dissolveFlat([sheet(0, 0, 10, 4, 0.05), sheet(0, 0, 10, 4, 0.09)]);
    expect(out).toHaveLength(2);
    expect(out.map(g => g.getAttribute('position').getZ(0)).sort()).toEqual([expect.closeTo(0.05, 6), expect.closeTo(0.09, 6)]);
  });

  it('leaves a solid alone', () => {
    const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const out = dissolveFlat([box]);
    expect(out).toHaveLength(1);
    expect(out[0]!.getAttribute('position').count).toBe(box.getAttribute('position').count);
  });
});

describe('job cameras', () => {
  const base: JobCamera = {
    id: 'street', basis: '', position_ft: [0, -100, 5.5], target_ft: [0, 0, 5.5],
    focal_length_mm: 30, sensor_width_mm: 36, shift_y: 0, clip_ft: [1, 5000], aspect: 16 / 9, resolution: [3840, 2160],
  };

  it('puts the point it looks at in the middle of the picture', () => {
    const [x, y] = projectPx(browserCamera(base), [0, 0, 5.5]);
    expect(x).toBeCloseTo(960, 1);
    expect(y).toBeCloseTo(540, 1);
  });

  it('reads focal length on a 36 mm wide sensor', () => {
    // 100 ft away, a point 60 ft east sits at 60/100 * 30/18 of the half width
    const [x] = projectPx(browserCamera(base), [60, 0, 5.5]);
    expect(x).toBeCloseTo(960 + 960 * (60 / 100) * (30 / 18), 0);
  });

  it('a lens shift moves the picture up and keeps verticals upright', () => {
    const cam = browserCamera({ ...base, shift_y: 0.09 });
    const [, level] = projectPx(cam, [0, 0, 5.5]);
    // the horizon drops by the shift, a fraction of the picture's width
    expect(level).toBeCloseTo(540 + 0.09 * 1920, 0);
    const [x0] = projectPx(cam, [40, 0, 0]);
    const [x1] = projectPx(cam, [40, 0, 50]);
    expect(Math.abs(x1 - x0)).toBeLessThan(0.01);
  });

  it('east is to the right when looking north', () => {
    const [x] = projectPx(browserCamera(base), [10, 0, 5.5]);
    expect(x).toBeGreaterThan(960);
  });
});

describe('live comparison camera', () => {
  const target = new THREE.Vector3(6, 1.5, -4);
  const points: [number, number, number][] = [[0, 0, 0], [24, -5, 13], [-12, 32, 28]];

  it.each([[1280, 720, 1], [913, 694, 1.32], [768, 920, 1.25]])(
    'matches the live browser projection at %i x %i with lift %f',
    (width, height, lift) => {
      const source = new THREE.PerspectiveCamera(48, width / height, 0.13, 1800);
      if (lift > 1) source.setViewOffset(width, height * lift, 0, 0, width, height);
      source.position.set(30, 12, 50);
      source.lookAt(target);
      source.updateMatrixWorld(true);
      const live = cameraFromLiveView(source, target, width, height);
      const restored = browserCamera(live, width, height);
      expect(live.resolution).toEqual([width, height]);
      expect(restored.near).toBeCloseTo(source.near);
      expect(restored.far).toBeCloseTo(source.far);
      for (const point of points) expect(projectPx(restored, point, width, height)).toEqual(projectPx(source, point, width, height));

      const existing = { ...live, id: 'street' as const };
      const job = { cameras: [existing], anchors: [{ id: 'roof', position_ft: points[1]!, expected_px: { street: [300, 200] as [number, number] } }] };
      const result = withLiveViewCamera(job as RenderJob, live);
      expect(result.cameras).toEqual([existing, live]);
      expect(result.anchors[0]?.expected_px).toEqual({ street: [300, 200], 'live-view': projectPx(source, points[1]!, width, height) });
      expect(job.cameras).toEqual([existing]);
      expect(job.anchors[0]?.expected_px).toEqual({ street: [300, 200] });
    },
  );

  it('rejects a horizontal camera crop', () => {
    const source = new THREE.PerspectiveCamera();
    source.position.set(20, 12, 50);
    source.setViewOffset(1600, 700, 10, 0, 1200, 700);
    expect(() => cameraFromLiveView(source, target, 1200, 700)).toThrow('crop');
  });
});

import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { buildBuildingFootprint, clampBuildingToEnvelope } from '../../src/engine/buildingGeometry';
import { createBuildingSpec } from '../../src/engine/model';
import type { BuildingSpec, BuildingType } from '../../src/engine/model';
import { areaM2 } from '../../src/engine/geometry';

const FT_TO_M = 0.3048;

// Helper: create a large envelope (200m × 200m)
function bigEnvelope(): Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
      [0, 0]
    ]]
  };
}

function makeSpec(type: BuildingType, anchor = { x: 100, y: 100 }): BuildingSpec {
  return createBuildingSpec('test-1', anchor, undefined, undefined, undefined, type);
}

describe('buildBuildingFootprint', () => {
  it('MF_BAR_V1: should produce a 4-corner rectangle', () => {
    const spec = makeSpec('MF_BAR_V1');
    const fp = buildBuildingFootprint(spec);

    expect(fp.type).toBe('Polygon');
    expect(fp.coordinates[0]).toHaveLength(5); // 4 corners + closing
    const a = areaM2(fp);
    expect(a).toBeGreaterThan(0);
    // Bar default: 200ft × 60ft ≈ 60.96m × 18.288m ≈ 1114.84 m²
    expect(a).toBeCloseTo(200 * FT_TO_M * 60 * FT_TO_M, -1);
  });

  it('MF_L_SHAPE: should produce a 6-vertex L polygon', () => {
    const spec = makeSpec('MF_L_SHAPE');
    const fp = buildBuildingFootprint(spec);

    expect(fp.type).toBe('Polygon');
    // L-shape: 6 vertices + closing = 7
    expect(fp.coordinates[0]).toHaveLength(7);
    const a = areaM2(fp);
    // L-shape area = main (150ft × 60ft) + wing (80ft × 60ft)
    const mainArea = 150 * FT_TO_M * 60 * FT_TO_M;
    const wingArea = 80 * FT_TO_M * 60 * FT_TO_M;
    // The actual area depends on wing overlap with main; it should be larger than main alone
    expect(a).toBeGreaterThan(mainArea * 0.8);
  });

  it('MF_PODIUM: should produce a 4-corner rectangle (same as bar)', () => {
    const spec = makeSpec('MF_PODIUM');
    const fp = buildBuildingFootprint(spec);

    expect(fp.type).toBe('Polygon');
    expect(fp.coordinates[0]).toHaveLength(5);
    const a = areaM2(fp);
    // Podium default: 200ft × 100ft
    expect(a).toBeCloseTo(200 * FT_TO_M * 100 * FT_TO_M, -1);
  });

  it('MF_U_SHAPE: should produce an 8-vertex U polygon', () => {
    const spec = makeSpec('MF_U_SHAPE');
    const fp = buildBuildingFootprint(spec);

    expect(fp.type).toBe('Polygon');
    // U-shape: 8 vertices + closing = 9
    expect(fp.coordinates[0]).toHaveLength(9);
    const a = areaM2(fp);
    // Should be outer rect minus courtyard notch
    const outerArea = 200 * FT_TO_M * 120 * FT_TO_M;
    const courtyardArea = 100 * FT_TO_M * 60 * FT_TO_M;
    expect(a).toBeCloseTo(outerArea - courtyardArea, -1);
  });

  it('MF_COURTYARD_WRAP: should produce a polygon with a hole', () => {
    const spec = makeSpec('MF_COURTYARD_WRAP');
    const fp = buildBuildingFootprint(spec);

    expect(fp.type).toBe('Polygon');
    // Should have outer ring + inner ring (hole)
    expect(fp.coordinates).toHaveLength(2);
    // Outer ring: 4 corners + closing = 5
    expect(fp.coordinates[0]).toHaveLength(5);
    // Inner ring (hole): 4 corners + closing = 5
    expect(fp.coordinates[1]).toHaveLength(5);
  });

  it('should respect rotation for all types', () => {
    const types: BuildingType[] = ['MF_BAR_V1', 'MF_L_SHAPE', 'MF_U_SHAPE', 'MF_COURTYARD_WRAP'];
    for (const type of types) {
      const spec0 = makeSpec(type);
      const specR = { ...makeSpec(type), rotationRad: Math.PI / 4 };

      const fp0 = buildBuildingFootprint(spec0);
      const fpR = buildBuildingFootprint(specR);

      // Areas should be essentially the same
      expect(areaM2(fpR)).toBeCloseTo(areaM2(fp0), 0);

      // But the coordinates should differ
      const c0 = fp0.coordinates[0][0];
      const cR = fpR.coordinates[0][0];
      const dist = Math.sqrt((c0[0] - cR[0]) ** 2 + (c0[1] - cR[1]) ** 2);
      expect(dist).toBeGreaterThan(0.01);
    }
  });
});

describe('clampBuildingToEnvelope', () => {
  it('should keep building that is already inside envelope', () => {
    const envelope = bigEnvelope();
    const spec = createBuildingSpec('b1', { x: 100, y: 100 }, 20, 10, 3, 'MF_BAR_V1');
    const clamped = clampBuildingToEnvelope(spec, envelope, []);
    expect(clamped.anchor.x).toBe(spec.anchor.x);
    expect(clamped.anchor.y).toBe(spec.anchor.y);
  });

  it('should move building that is outside envelope', () => {
    const envelope = bigEnvelope();
    // Place building far outside
    const spec = createBuildingSpec('b1', { x: 500, y: 500 }, 20, 10, 3, 'MF_BAR_V1');
    const clamped = clampBuildingToEnvelope(spec, envelope, []);
    // Should have moved toward envelope center
    expect(clamped.anchor.x).not.toBe(500);
    expect(clamped.anchor.y).not.toBe(500);
  });

  it('should work with L-shape buildings inside envelope', () => {
    const envelope = bigEnvelope();
    const spec = makeSpec('MF_L_SHAPE');
    const clamped = clampBuildingToEnvelope(spec, envelope, []);
    expect(clamped.anchor).toBeDefined();
  });

  it('should work with U-shape buildings inside envelope', () => {
    const envelope = bigEnvelope();
    const spec = makeSpec('MF_U_SHAPE');
    const clamped = clampBuildingToEnvelope(spec, envelope, []);
    expect(clamped.anchor).toBeDefined();
  });
});

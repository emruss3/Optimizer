import { describe, it, expect, vi } from 'vitest';
import { sfPlanToElements, isDetachedSfPlanElement, isSfPlanElement } from './generateSfPlan';

vi.mock('../../../lib/supabase', () => ({ supabase: null }));

describe('generated-plan predicates', () => {
  it('replace-on-regenerate includes thv3; detached schedule product does not', () => {
    expect(isSfPlanElement({ id: 'thv3-home-1' })).toBe(true);
    expect(isDetachedSfPlanElement({ id: 'thv3-home-1' })).toBe(false);
    expect(isDetachedSfPlanElement({ id: 'sfv1-lot-1' })).toBe(true);
    expect(isSfPlanElement({ id: 'sfv1-lot-1' })).toBe(true);
    expect(isDetachedSfPlanElement({ id: 'gen-lot-1' })).toBe(true);
    expect(isDetachedSfPlanElement({ id: 'mfgen-1' })).toBe(false);
  });
});

// A small lot near Nashville in 4326 (lon/lat degrees)
const lotGeom4326 = {
  type: 'Polygon',
  coordinates: [[
    [-86.78, 36.16],
    [-86.7795, 36.16],
    [-86.7795, 36.1605],
    [-86.78, 36.1605],
    [-86.78, 36.16],
  ]],
};

describe('sfPlanToElements', () => {
  it('converts 4326 geometry into the canvas frame (EPSG:3857 metres)', () => {
    const { elements } = sfPlanToElements({
      lots: [{ lot: 1, area_sqft: 6000, geom: lotGeom4326 }],
      footprints: [{ lot: 1, footprint_sqft: 1800, geom: JSON.stringify(lotGeom4326) }],
      lots_generated: 1,
    });
    expect(elements).toHaveLength(2);
    const [lot, bldg] = elements;
    // 3857 metres near Nashville: x ≈ -9.66e6, y ≈ 4.32e6 — degrees would be ~-86/36
    const [x, y] = lot.geometry.coordinates[0][0];
    expect(Math.abs(x)).toBeGreaterThan(1_000_000);
    expect(Math.abs(y)).toBeGreaterThan(1_000_000);
    expect(lot.type).toBe('other');
    expect(lot.name).toBe('Lot 1');
    expect(bldg.type).toBe('building');
    expect(bldg.properties.areaSqFt).toBe(1800);
    // Stringified geom is tolerated
    expect(bldg.geometry.type).toBe('Polygon');
  });

  it('skips unparseable geometry instead of crashing', () => {
    const { elements, summary } = sfPlanToElements({
      lots: [
        { lot: 1, geom: 'not-json{' },
        { lot: 2, geom: { type: 'Point', coordinates: [0, 0] } },
        { lot: 3, geom: lotGeom4326 },
      ],
      lots_generated: 3,
    });
    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('Lot 3');
    expect(summary.lots).toBe(3);
  });

  it('carries target/provenance/flags into the summary', () => {
    const { summary } = sfPlanToElements({
      lots: [],
      target_lot_sqft: 6000,
      target_footprint_sqft: 1800,
      target_source: 'local_comps_p75',
      context_confidence: 'high',
      flags: ['flood_zone_ae'],
    });
    expect(summary.targetSource).toBe('local_comps_p75');
    expect(summary.targetFootprintSqft).toBe(1800);
    expect(summary.flags).toEqual(['flood_zone_ae']);
  });

  it('prefers canvas_frame areas (backend EPSG:2274 truth) over the 4326 list', () => {
    const { elements } = sfPlanToElements({
      lots: [{ lot: 1, area_sqft: 5990, geom: lotGeom4326 }],
      canvas_frame: { units: 'feet_us_survey', lots: [{ lot: 1, area_sqft: 6000 }] },
    });
    expect(elements[0].properties.areaSqFt).toBe(6000);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { sfPlanToElements } from './generateSfPlan';

vi.mock('../../../lib/supabase', () => ({ supabase: null }));

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

  it('carries target/provenance into the summary', () => {
    const { summary } = sfPlanToElements({
      lots: [],
      target_lot_sqft: 6000,
      target_source: 'local_comps_p75',
      context_confidence: 'high',
    });
    expect(summary.targetSource).toBe('local_comps_p75');
    expect(summary.confidence).toBe('high');
  });
});

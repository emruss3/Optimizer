import { describe, it, expect } from 'vitest';
import { seedToElements } from './seedToElements';
import type { SeedPlan } from '../features/site-plan/api/seedPlan';

// A native-structures v2 seed (EPSG:2274 feet, Nashville frame): the mapper
// must emit ONE building from structures[] and never enter the union path.
const v2seed: SeedPlan = {
  parcel_ogc_fid: 1,
  composition: 'single_L_frontage_plus_wing',
  stories: 4,
  construction_type: { type: 'V-A' },
  structures: [{
    structure_id: 1,
    is_single_polygon: true,
    footprint_sqft: 31429,
    envelope_retention_pct: 96.6,
    geom_2274: {
      type: 'Polygon',
      coordinates: [[
        [1727050, 669885], [1727117, 669895], [1727137, 669695],
        [1727323, 669723], [1727333, 669656], [1727081, 669618],
        [1727050, 669885],
      ]],
    },
  }],
  fire_lanes: [{
    geom_2274: { type: 'Polygon', coordinates: [[[1727340, 669600], [1727360, 669600], [1727360, 669700], [1727340, 669700], [1727340, 669600]]] },
  }],
  parking_seed: { bays: [], stalls_target: 140, stalls_achieved_est: 113 },
};

describe('seedToElements (structures[] native path)', () => {
  it('emits one building per structure with engine footprint + retention, plus fire lanes', () => {
    const { elements, inFamily } = seedToElements(v2seed);
    const buildings = elements.filter(e => e.type === 'building');
    expect(buildings).toHaveLength(1);
    expect(buildings[0].id).toBe('seed-structure-1');
    const props = buildings[0].properties as { areaSqFt?: number; seedRetention?: { structure?: number } };
    expect(props.areaSqFt).toBe(31429); // engine feet, never re-measured
    expect(props.seedRetention?.structure).toBe(96.6);
    // 96.6 ≥ 90 → no in-family note
    expect(inFamily).toBeNull();
    const lanes = elements.filter(e => e.id.startsWith('seed-firelane'));
    expect(lanes).toHaveLength(1);
    expect(lanes[0].type).toBe('circulation');
  });

  it('flags in-family when a structure retains <90%', () => {
    const clipped: SeedPlan = {
      ...v2seed,
      structures: [{ ...v2seed.structures![0], envelope_retention_pct: 84.2 }],
    };
    const { inFamily } = seedToElements(clipped);
    expect(inFamily).toContain('structure 1');
    expect(inFamily).toContain('15.8');
  });
});

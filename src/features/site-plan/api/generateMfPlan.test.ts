import { describe, it, expect } from 'vitest';
import { mfPlanToElements, isMfPlanElement, type MfPlanResponse } from './generateMfPlan';

// Live-shaped fixture (structure verified against fn_generate_mf_site_plan on
// parcel 669046; coordinates simplified). Areas are EPSG:2274 backend truth.
const square = (lon: number, lat: number, d = 0.0005) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});

const RESP: MfPlanResponse = {
  parcel_ogc_fid: 669046,
  typology: 'multifamily',
  seed: 1,
  plan_basis: '2 garden bars · 3 floors · entry drive from primary frontage · 52 stalls surface (1.5/unit target)',
  persisted: true,
  buildings: [
    { i: 1, footprint_sqft: 16250, floors: 3, geom: square(-86.81, 36.14) },
    { i: 2, footprint_sqft: 7768, floors: 3, geom: JSON.stringify(square(-86.809, 36.14)) },
  ],
  parking: [
    { stalls: 40, geom: square(-86.811, 36.141) },
    { stalls: 12, geom: square(-86.8105, 36.141) },
  ],
  drives: [{ geom: square(-86.8112, 36.1405) }],
  greens: [{ area_sqft: 4200, geom: square(-86.8095, 36.1408) }],
  amenity: [{ name: 'Clubhouse + Pool', area_sqft: 5800, geom: square(-86.8118, 36.1402) }],
  metrics: {
    bars: 2, floors: 3, footprint_sqft: 24018, gfa_sqft: 72054,
    units_est: 75, stalls: 52, stalls_required: 113,
    parking_ratio_provided: 0.69, coverage_pct: 23.3, far: 0.7,
    parcel_sqft: 103101, open_space_pct: 62.1,
  },
  flags: ['front_setback_estimated', 'parking_below_ratio', 'entry_from_longest_frontage_heuristic'],
};

describe('mfPlanToElements', () => {
  it('maps the full site system with backend-true areas and worker-matching types', () => {
    const { elements, metrics, basis, flags } = mfPlanToElements(RESP);

    const byType = (t: string) => elements.filter(e => e.type === t);
    // 2 bars + 1 amenity render as buildings; parking/drives/greens keep the
    // exact vocabulary the client engine uses (legend/labels/styles all work)
    expect(byType('building')).toHaveLength(3);
    expect(byType('parking')).toHaveLength(2);
    expect(byType('circulation')).toHaveLength(1);
    expect(byType('greenspace')).toHaveLength(1);

    const b1 = elements.find(e => e.id === 'mfgen-bldg-1')!;
    expect(b1.properties?.areaSqFt).toBe(16250); // EPSG:2274 truth, not re-measured
    expect(b1.properties?.floors).toBe(3);
    expect(Array.isArray(b1.properties?.unitMix)).toBe(true); // unit floorplates render

    // Stringified GeoJSON tolerated (PostgREST sometimes stringifies)
    expect(elements.find(e => e.id === 'mfgen-bldg-2')).toBeTruthy();

    const amenity = elements.find(e => e.id === 'mfgen-amenity-1')!;
    expect(amenity.name).toBe('Clubhouse + Pool');
    expect(amenity.properties?.floors).toBe(1);
    expect(amenity.properties?.unitMix).toBeUndefined();

    expect(elements.find(e => e.id === 'mfgen-park-1')!.name).toContain('40 stalls');
    expect(elements.find(e => e.id === 'mfgen-drive-1')!.name).toBe('Main Drive');

    // Planner metrics for the KPI strip + pro forma
    expect(metrics).toMatchObject({
      totalBuiltSF: 72054,
      achievedFAR: 0.7,
      siteCoveragePct: 23.3,
      totalUnits: 75,
      stallsProvided: 52,
      stallsRequired: 113,
    });

    expect(basis).toContain('2 garden bars');
    expect(flags).toContain('parking_below_ratio');
  });

  it('identifies server-plan elements for replace-on-regenerate', () => {
    const { elements } = mfPlanToElements(RESP);
    expect(elements.every(isMfPlanElement)).toBe(true);
    expect(isMfPlanElement({ id: 'building-1' })).toBe(false);
    expect(isMfPlanElement({ id: 'gen-lot-1' })).toBe(false);
  });

  it('degenerate/empty responses map to zero elements and null metrics', () => {
    const { elements, metrics } = mfPlanToElements({ generation: 'envelope too shallow for a building bar' });
    expect(elements).toHaveLength(0);
    expect(metrics).toBeNull();
    // garbage geometry is skipped, not thrown
    const r = mfPlanToElements({ buildings: [{ i: 1, geom: 'not-json' }], metrics: { gfa_sqft: 100 } });
    expect(r.elements).toHaveLength(0);
  });
});

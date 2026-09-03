import { describe, it, expect } from 'vitest';
import {
  subdivisionToElements, subdivisionSummaryLine, isSubdivisionElement, polygons2274To3857,
  type SubdivisionResponse,
} from './generateSubdivision';
import { isSfPlanElement } from './generateSfPlan';

// EPSG:2274 feet near 2400 W Heiman St (the MDHA strip). Small, axis-aligned
// shapes — the mapper converts them, it never measures them.
const X = 1726085;
const Y = 672436;
const rect = (x0: number, y0: number, w: number, h: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[X + x0, Y + y0], [X + x0 + w, Y + y0], [X + x0 + w, Y + y0 + h], [X + x0, Y + y0 + h], [X + x0, Y + y0]]],
});

const RESP: SubdivisionResponse = {
  parcel_ogc_fid: 550510,
  generator_version: 'subdivision_v1',
  pattern: 'subdivision_row_spine',
  network: 'spine',
  access: { mode: 'both', basis: 'assumed_both_ends_no_street_read_on_any_edge' },
  streets: [
    { name: 'Street A', kind: 'through', width_ft: 55, length_ft: 300, geom_2274: rect(0, 100, 300, 55) },
    // a cross connector emitted minus the through-street: two pieces
    {
      name: 'Cross 1', kind: 'cross', width_ft: 55, length_ft: 200,
      geom_2274: {
        type: 'MultiPolygon',
        coordinates: [rect(120, 0, 55, 100).coordinates, rect(120, 155, 55, 100).coordinates],
      },
    },
  ],
  alleys: [{ geom_2274: rect(0, 230, 300, 20), area_sqft: 6000 }],
  lots: [
    { lot: 1, street: 'A', face: 1, geom_2274: rect(0, 155, 80, 75), area_sqft: 6000, width_ft: 80, depth_ft: 75, buildable_depth_ft: 35, fronts: 'Street A', garage: 'rear_alley' },
    { lot: 2, street: 'A', face: 1, geom_2274: rect(80, 155, 80, 75), area_sqft: 6000, width_ft: 80, depth_ft: 75, buildable_depth_ft: 35, fronts: 'Street A', garage: 'rear_alley' },
    { lot: 3, street: 'A', face: 1, geom_2274: null, area_sqft: 6000 }, // undrawable: skipped, never invented
  ],
  courts: [{ geom_2274: rect(160, 155, 80, 75), area_sqft: 6000 }],
  amenity: { geom_2274: rect(240, 155, 60, 75), area_sqft: 4500, at: 'greenway' },
  hazards: [
    { kind: 'floodplain', zone: 'AE', subtype: null, geom_2274: rect(0, 260, 300, 40), area_sqft: 12000 },
    { kind: 'wetland', zone: 'R4SBC', subtype: 'Riverine', buffer_ft: 25, geom_2274: rect(0, 300, 300, 20), area_sqft: 6000 },
  ],
  reserves: [{ geom_2274: rect(0, 250, 300, 10), area_sqft: 3000 }],
  metrics: {
    lots: 2, lot_width_ft: 80, lot_depth_ft: 75, buildable_depth_ft: 35, streets: 2, courts: 1,
    pct_land_in_row: 22.3, pct_land_in_lots: 56.3, pct_land_residual: 1.6, gross_density_du_ac: 3.95,
    floodplain_100yr_pct: 15, parcel_sqft: 572831, court_area_sqft: 6000, amenity_sqft: 4500, residual_sqft: 3000,
    hazard_sqft: 18000, floodplain_sqft: 12000, wetland_sqft: 6000, pct_land_hazard: 3.1, hazard_layer_coverage: 'ingested',
  },
  plan_basis: '52 lots @ 80×75 ft on 1 55-ft through-street · generator subdivision_v1',
  flags: ['floodplain_not_carved_no_geometry_layer', 42, 'access_assumed_both_ends_stubs_to_neighbours'],
};

describe('subdivisionToElements (neighbourhood generator → canvas)', () => {
  it('draws streets, alleys, lots, courts, amenity and reserves under the subdiv- prefix', () => {
    const { elements, summary } = subdivisionToElements(RESP);
    const byType = (t: string) => elements.filter(e => e.type === t);
    // through street + two pieces of the cross connector + the alley = 4 circulation elements
    expect(byType('circulation').map(e => e.id)).toEqual(['subdiv-street-1', 'subdiv-street-2', 'subdiv-street-2-2', 'subdiv-alley-1']);
    expect(byType('other').map(e => e.name)).toEqual(['Lot 1', 'Lot 2']);
    // held-out hazards read as greenway with their zone; residual land is "Unassigned", never an amenity
    expect(byType('greenspace').map(e => e.name)).toEqual(['Court', 'Amenity', 'Floodplain (AE)', 'Wetland (R4SBC)', 'Unassigned']);
    const flood = elements.find(e => e.id === 'subdiv-hazard-1')!;
    expect(flood.properties.kind).toBe('greenway');
    expect(flood.properties.hazardKind).toBe('floodplain');
    expect(elements.find(e => e.id === 'subdiv-hazard-2')!.properties.bufferFt).toBe(25);
    expect(elements.find(e => e.id === 'subdiv-reserve-1')!.properties.color).toBe('#F1F5F9');
    expect(elements.every(isSubdivisionElement)).toBe(true);
    // the replace-on-regenerate class covers the subdivision family too
    expect(elements.every(isSfPlanElement)).toBe(true);
    // areas travel verbatim from the server
    const lot1 = elements.find(e => e.id === 'subdiv-lot-1')!;
    expect(lot1.properties.areaSqFt).toBe(6000);
    expect(lot1.properties.buildableDepthFt).toBe(35);
    expect(lot1.properties.garage).toBe('rear_alley');
    // streets carry the ROW styling opt-in; alleys are lighter pavement
    expect(elements.find(e => e.id === 'subdiv-street-1')!.properties.styleOverride).toBe(true);
    expect(elements.find(e => e.id === 'subdiv-alley-1')!.properties.kind).toBe('alley');
    expect(summary.lots).toBe(2);
    expect(summary.network).toBe('spine');
    expect(summary.flags).toEqual(['floodplain_not_carved_no_geometry_layer', 'access_assumed_both_ends_stubs_to_neighbours']);
    expect(summary.accessMode).toBe('both');
    // open land = courts + amenity + held-out greenway over the parcel, from server areas
    expect(summary.pctOpen).toBe(Math.round(((6000 + 4500 + 18000) / 572831) * 1000) / 10);
    expect(summary.pctHazard).toBe(3.1);
    expect(summary.hazardCoverage).toBe('ingested');
    expect(summary.floodplainHeldOutPct).toBe(Math.round((12000 / 572831) * 1000) / 10);
    expect(summary.wetlandHeldOutPct).toBe(Math.round((6000 / 572831) * 1000) / 10);
  });

  it('converts EPSG:2274 to the canvas frame (EPSG:3857 metres) — polygons keep their ring', () => {
    const poly = polygons2274To3857(rect(0, 0, 100, 100))[0];
    if (!poly) throw new Error('expected one polygon');
    expect(poly.type).toBe('Polygon');
    expect(poly.coordinates[0]).toHaveLength(5);
    // Nashville in web-mercator metres: x ≈ -9.66e6, y ≈ 4.32e6
    const [x, y] = poly.coordinates[0][0];
    expect(x).toBeLessThan(-9_600_000);
    expect(x).toBeGreaterThan(-9_700_000);
    expect(y).toBeGreaterThan(4_300_000);
    expect(y).toBeLessThan(4_350_000);
    expect(polygons2274To3857(null)).toEqual([]);
    expect(polygons2274To3857('not json')).toEqual([]);
  });

  it('writes a one-line summary the strip can show', () => {
    const { summary } = subdivisionToElements(RESP);
    const line = subdivisionSummaryLine(summary);
    expect(line).toContain('2 lots @ 80×75 ft on a ROW spine (2 streets, 1 court, rear alleys)');
    expect(line).toContain('22.3% ROW / 56.3% lots');
    expect(line).toContain('buildable depth 35 ft');
    // with the hazard layers ingested the line states what was held out, never the old warning
    expect(line).toContain('3.1% held out as greenway (floodplain 2.1%, wetland 1%)');
    expect(line).not.toContain('not carved');
  });

  it('warns honestly when the hazard layers do not cover the parcel yet', () => {
    const { summary } = subdivisionToElements({
      ...RESP, hazards: [],
      metrics: { ...RESP.metrics, hazard_sqft: 0, floodplain_sqft: 0, wetland_sqft: 0, pct_land_hazard: 0, hazard_layer_coverage: 'not_ingested' },
    });
    expect(summary.hazardCoverage).toBe('not_ingested');
    expect(subdivisionSummaryLine(summary)).toContain('⚠ 15% floodplain not carved (layer not ingested here)');
  });

  it('tolerates an empty or refused payload without inventing anything', () => {
    const { elements, summary } = subdivisionToElements({ error: 'parcel_too_narrow_for_a_street_and_a_lot', metrics: { lots: 0 } });
    expect(elements).toEqual([]);
    expect(summary.lots).toBe(0);
    expect(summary.network).toBe('spine');
  });
});

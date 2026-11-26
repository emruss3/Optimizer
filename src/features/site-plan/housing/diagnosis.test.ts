import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../lib/supabase', () => ({ supabase: null }));
import { thV3ToElements, type ThV3Response } from '../api/thV3Plan';
import { HOME_DESIGNS } from './originalDesigns';
import { homeDesignsDiagnosis } from './diagnosis';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { stockEligibility } from './eligibility';
import { buildableStockPlans } from './catalogue';

const box = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const X = -86.8, Y = 36.15, W = 0.0000678, D = 0.00011;
// a row of 20 × 40 ft townhome pads on an alley (330 Athens Way drew 79 of them)
const PLAN = {
  generator_version: 'th_v3', parcel_ogc_fid: 701867, mode: 'aor', typology: 'alley_loaded_townhome', pattern: 'mews',
  site_acres: 2, held_acres: 0, zoning: 'RM20', rules: { attached_permitted: true },
  buildings: Array.from({ length: 6 }, (_, i) => ({ geom: box(X + i * W, Y, X + (i + 1) * W, Y + D), kind: 'courtyard', w_ft: 20, d_ft: 40 })),
  streets: [], right_of_way: box(X - 0.0002, Y - 0.0002, X + 0.0006, Y - 0.00012),
  alleys: [{ geom: box(X, Y - 0.0001, X + 6 * W, Y - 0.00002), kind: 'alley' }],
  greens: [], amenity: null, stormwater: null, parking: { guest_pockets: [], guest_stalls: 0, guest_target: 0 },
  held_out: null, metrics: { homes: 6, unit_w_ft: 20, unit_d_ft: 40 }, tests: [], fails: [], notes: [],
} as unknown as ThV3Response;

describe('why no home design fits (masterplan audit 2026-11-26)', () => {
  it('townhome pads: names the form, the size and why each kind of design is out', () => {
    const { elements } = thV3ToElements(PLAN);
    const d = homeDesignsDiagnosis({ elements, concepts: HOME_DESIGNS, stockRows: [], stockAllowed: false });
    expect(d.summary).toMatch(/^6 attached townhome pads, about 20 × 40 ft$/);
    expect(d.lines.some(l => /^\d+ of 6 lots: /.test(l))).toBe(true);
    expect(d.lines.at(-1)).toMatch(/stock plans are detached houses; the 6 attached pads cannot take one/);
  });

  it('detached lots that take no stock plan say which lots and why', () => {
    const els = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const rows = stockEligibility(buildableStockPlans(), els).map(r => ({ ...r, eligible: [] as typeof r.eligible, lotProblem: 'frontage unresolved: no driveway or street meets this lot' }));
    const d = homeDesignsDiagnosis({ elements: els, concepts: HOME_DESIGNS, stockRows: rows, stockAllowed: true });
    expect(d.summary).toMatch(/^5 detached house lots/);
    expect(d.lines.at(-1)).toBe('Stock plans: none fit 5 of 5 lots — frontage unresolved: no driveway or street meets this lot.');
  });
});

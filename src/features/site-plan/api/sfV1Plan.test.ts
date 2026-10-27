import { describe, it, expect } from 'vitest';
import { validatePlanElements } from '../../../engine/validatePlan';
import { isSfPlanElement } from './generateSfPlan';
import {
  sfV1Route, normalizeTests, fillBand, fillColor, padFillByLot, sfV1ToElements, sfV1SummaryLine, isOverride, isSfV1Element,
  type SfV1Response,
} from './sfV1Plan';

// A tiny by-right plan in EPSG:2274 feet: a street across the middle of the
// site with two lots and their pads above it, a pond and an interior remnant.
const X = 1727000; const Y = 670000;
const rect = (x: number, y: number, w: number, h: number) => `((${x} ${y},${x + w} ${y},${x + w} ${y + h},${x} ${y + h},${x} ${y}))`;

const PLAN: SfV1Response = {
  status: 'done',
  basis: 'by_right',
  flood_hold: 'sfha',
  lots: 2,
  pattern: 'single street',
  rings: 0, cross_streets: 0, cul_de_sacs: 1, corner_lots: 0, edge_lots: 1, stubs: 0, connections: 1,
  lot_w_ft: 50, lot_d_ft: 120, min_lot_sf: 6000,
  metrics: { gross_du_per_ac: 2.4, street_ft: 300, row_pct: 18.2, lot_pct: 61.5, open_pct: 20.3, avg_lot_sf: 6400, dead_ends: 1, dead_end_max_ft: 300, impervious_pct: 31, pond_sf: 2400, low_point_ft: 431.2 },
  open_pieces: [{ kind: 'pond', acres: 0.06 }, { kind: 'interior remnant', acres: 0.1 }],
  lot_kinds: ['standard', 'edge'],
  tests: [
    { id: 'street.dead_end_max', pass: true, value: 300, limit: 750 },
    { id: 'access.second_connection', pass: false, value: 1, limit: 2 },
    { id: 'storm.low_point', pass: true },
  ],
  fails: ['access.second_connection'],
  notes: ['one connection to the outside: the plan dead-ends at 300 ft', '0.4 ac of the plan is in the floodplain'],
  street_lines_wkt: `MULTILINESTRING((${X} ${Y + 200},${X + 300} ${Y + 200}))`,
  row_wkt: `MULTIPOLYGON(${rect(X, Y + 175, 300, 50)})`,
  pave_wkt: `MULTIPOLYGON(${rect(X, Y + 187, 300, 26)})`,
  bulbs_wkt: `MULTIPOLYGON(${rect(X + 300, Y + 165, 60, 70)})`,
  lots_wkt: `MULTIPOLYGON(${rect(X, Y + 225, 50, 120)},${rect(X + 50, Y + 225, 70, 120)})`,
  pads_wkt: `MULTIPOLYGON(${rect(X + 10, Y + 255, 30, 40)},${rect(X + 65, Y + 255, 40, 40)})`,
  drives_wkt: `MULTIPOLYGON(${rect(X + 20, Y + 225, 12, 30)},${rect(X + 75, Y + 225, 12, 30)})`,
  open_wkt: `MULTIPOLYGON(${rect(X + 150, Y + 225, 60, 45)},${rect(X + 220, Y + 225, 80, 120)})`,
  pond_wkt: `POLYGON${rect(X + 150, Y + 225, 60, 45)}`,
  low_point_wkt: `POINT(${X + 180} ${Y + 247})`,
  earthwork: {
    bfe_ft: 433, pad_target_ft: 434,
    fill_cy: { pads: 1200, streets: 800 },
    pad_fill_ft: { min: 1.5, median: 5, max: 13 },
    lots_with_pad_fill_over_10ft: 1,
    cut: { required_cy: 2000, pond_cy: 900, open_floodplain_ac_available: 0.3, avg_depth_ft_needed: 3.1, closes_on_site: false },
    pad_fill_ft_by_lot: [1.5, 13],
  },
};

describe('the owner\'s routing rule, from the base district', () => {
  it('R / RS → the by-right subdivision; RM / MUL / SP → attached homes; the rest → not this path', () => {
    expect(sfV1Route('R8')).toBe('sf_v1');
    expect(sfV1Route('RS20')).toBe('sf_v1');
    expect(sfV1Route('rs7.5')).toBe('sf_v1');
    expect(sfV1Route('R80')).toBe('sf_v1');
    expect(sfV1Route('RM20')).toBe('th');
    expect(sfV1Route('RM40-A')).toBe('th');
    expect(sfV1Route('MUL')).toBe('th');
    expect(sfV1Route('SP')).toBe('th');
    expect(sfV1Route('MUG-A')).toBeNull();
    expect(sfV1Route('CS')).toBeNull();
    expect(sfV1Route(null)).toBeNull();
    expect(sfV1Route('')).toBeNull();
  });

  it('an override is anything the user set; an empty option set is by right', () => {
    expect(isOverride({})).toBe(false);
    expect(isOverride(JSON.parse('{"lot_w_ft":null}'))).toBe(false);
    expect(isOverride({ lot_w_ft: 50 })).toBe(true);
    expect(isOverride({ flood: 'floodway' })).toBe(true);
  });
});

describe('tests arrive as a list or as an object; fill bands', () => {
  it('normalizes both shapes to {id, pass, value, limit}', () => {
    expect(normalizeTests([{ id: 'a', pass: true, value: 1, limit: 2 }, { test: 'b', ok: false }, { nope: 1 }]))
      .toEqual([{ id: 'a', pass: true, value: 1, limit: 2 }, { test: 'b', ok: false, id: 'b', pass: false }]);
    expect(normalizeTests({ 'street.dead_end_max': { pass: false, value: 900, limit: 750 }, 'storm.low_point': true }))
      .toEqual([{ id: 'street.dead_end_max', pass: false, value: 900, limit: 750 }, { id: 'storm.low_point', pass: true }]);
    expect(normalizeTests(null)).toEqual([]);
  });

  it('bands pad fill at 4 / 8 / 12 ft', () => {
    expect(fillBand(0)).toBe('under4');
    expect(fillBand(3.9)).toBe('under4');
    expect(fillBand(4)).toBe('4to8');
    expect(fillBand(8)).toBe('8to12');
    expect(fillBand(12)).toBe('over12');
    expect(fillColor(13)).toBe('#DC2626');
    expect(padFillByLot({ pad_fill_ft_by_lot: [1, 2] })).toEqual([1, 2]);
    expect(padFillByLot({ pads: [{ fill_ft: 3 }, { fill_ft: null }] })).toEqual([3, null]);
    expect(padFillByLot({ pad_fill_ft: { min: 1 } })).toBeNull();
  });
});

describe('sfV1ToElements — the plan on the sheet', () => {
  it('draws lots, pads, the street, driveways, open space, the pond, wetlands and the low point', () => {
    const { elements, summary } = sfV1ToElements(PLAN, { nobuildWkt: `MULTIPOLYGON(${rect(X + 220, Y + 300, 40, 40)})` });
    const byType = (t: string) => elements.filter(e => e.type === t);
    const lots = elements.filter(e => /^Lot \d+$/.test(e.name ?? ''));
    expect(lots).toHaveLength(2);
    expect(lots[0]!.properties?.lotKind).toBe('standard');
    expect(lots[0]!.properties?.widthFt).toBe(50); // the module, on a standard lot only
    expect(lots[1]!.properties?.lotKind).toBe('edge');
    expect(lots[1]!.properties?.widthFt).toBeUndefined();

    const pads = byType('building');
    expect(pads).toHaveLength(2);
    expect(pads.every(p => p.properties?.house === true)).toBe(true);
    // the earthwork view: each pad coloured by its fill
    expect(pads[0]!.properties?.padFillFt).toBe(1.5);
    expect(pads[0]!.properties?.fillBand).toBe('under4');
    expect(pads[1]!.properties?.fillBand).toBe('over12');
    expect(pads[1]!.properties?.color).toBe('#DC2626');
    expect(summary.fillView).toBe(true);

    const circ = byType('circulation');
    // pavement + bulb merge into ONE street piece; two driveways
    expect(circ.filter(c => c.name === 'Street')).toHaveLength(1);
    expect(circ.filter(c => c.name === 'Driveway')).toHaveLength(2);
    expect(Array.isArray(circ.find(c => c.name === 'Street')!.properties?.centerline2274)).toBe(true);
    expect(elements.filter(e => e.name === 'Right-of-way')).toHaveLength(1);

    const greens = byType('greenspace');
    expect(greens.map(g => g.name).sort()).toEqual(['Interior remnant', 'Pond', 'Wetland']);
    // the pond is among the open pieces, so pond_wkt is not drawn a second time
    expect(elements.filter(e => e.name === 'Pond')).toHaveLength(1);
    expect(greens.find(g => g.name === 'Wetland')!.properties?.kind).toBe('greenway');
    expect(elements.find(e => e.name === 'Low point')).toBeTruthy();

    // every element carries the sfv1- prefix so a regenerate REPLACES
    expect(elements.every(isSfV1Element)).toBe(true);
    expect(elements.every(isSfPlanElement)).toBe(true);
    // and the generator's own clean plan passes the zero-overlap gate
    expect(validatePlanElements(elements).ok).toBe(true);
  });

  it('carries the numbers, the tests, the fails and the notes verbatim', () => {
    const { summary } = sfV1ToElements(PLAN);
    expect(summary.status).toBe('done');
    expect(summary.basis).toBe('by_right');
    expect(summary.floodHold).toBe('sfha');
    expect(summary.lots).toBe(2);
    expect(summary.pattern).toBe('single street');
    expect(summary.densityDuAc).toBe(2.4);
    expect(summary.lotWFt).toBe(50);
    expect(summary.counts.culDeSacs).toBe(1);
    expect(summary.tests).toHaveLength(3);
    expect(summary.fails).toEqual(['access.second_connection']);
    expect(summary.notes).toHaveLength(2);
    expect(summary.lotKinds).toEqual({ standard: 1, edge: 1 });
    expect(summary.openPieces).toEqual([{ kind: 'pond', acres: 0.06 }, { kind: 'interior remnant', acres: 0.1 }]);
    expect(summary.earthwork?.bfe_ft).toBe(433);
    expect(summary.basisLine).toContain('2 lots @ 50 × 120 ft by by right on a single street');
    expect(summary.basisLine).toContain('flood hold: sfha');
    expect(summary.basisLine).toContain('fails access.second_connection');
  });

  it('a skipped parcel and an override are named as such', () => {
    const skipped = sfV1ToElements({ status: 'skipped', reason: 'no single-family standard for district MUG' });
    expect(skipped.elements).toHaveLength(0);
    expect(skipped.summary.status).toBe('skipped');
    expect(sfV1SummaryLine(skipped.summary)).toBe('By-right subdivision skipped — no single-family standard for district MUG');

    const over = sfV1ToElements({ ...PLAN, basis: 'override', flood_hold: 'floodway', earthwork: null }, { overrideRequested: true });
    expect(over.summary.basis).toBe('override');
    expect(over.summary.fillView).toBe(false);
    expect(over.summary.basisLine).toContain('by OVERRIDE');
    // fails fall back to the failed tests when the server sends no list
    const { fails: _omitted, ...planWithoutFails } = PLAN;
    void _omitted;
    const noFails = sfV1ToElements(planWithoutFails);
    expect(noFails.summary.fails).toEqual(['access.second_connection']);
  });
});

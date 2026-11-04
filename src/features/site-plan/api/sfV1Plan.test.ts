import { describe, it, expect } from 'vitest';
import { validatePlanElements } from '../../../engine/validatePlan';
import { isSfPlanElement } from './generateSfPlan';
import {
  sfV1Route, normalizeTests, fillBand, fillColor, padFillByLot, earthworkHasFlood, openStyle,
  sfV1ToElements, sfV1SummaryLine, isOverride, isSfV1Element,
  type SfV1Response,
} from './sfV1Plan';

// A small by-right plan in EPSG:2274 feet, shaped like the live payload for
// 4701 Bowfield Dr (682644): a street across the site with two lots and their
// pads above it, the pond and its edge, a street island, an unassigned piece.
const X = 1727000; const Y = 670000;
const rect = (x: number, y: number, w: number, h: number) => `((${x} ${y},${x + w} ${y},${x + w} ${y + h},${x} ${y + h},${x} ${y}))`;

const PLAN: SfV1Response = {
  ms: 1753,
  status: 'done',
  basis: 'by_right',
  flood_hold: 'sfha',
  ogc_fid: 682644,
  address: '4701 BOWFIELD DR',
  zoning: 'R8',
  site_acres: 10.73,
  lots: 2,
  pattern: 'loop',
  rings: 1, cross_streets: 0, cul_de_sacs: 0, corner_lots: 0, edge_lots: 1, stubs: 2, connections: 3,
  lot_w_ft: 65, lot_d_ft: 125, min_lot_sf: 8000,
  setbacks: { front: 20, side: 5, rear: 20 },
  metrics: { gross_du_per_ac: 3.17, street_ft: 2073, row_pct: 20.7, lot_pct: 73.1, open_pct: 6.2, avg_lot_sf: 10047, dead_ends: 0, dead_end_max_ft: 0, impervious_pct: 25.7, pond_sf: 6848, low_point_ft: 559.9, lots_per_100ft_street: 1.64 },
  open_pieces: [
    { kind: 'amenity: pond and its edge', acres: 0.21 },
    { kind: 'amenity: street island / green (too shallow for a lot)', acres: 0.04 },
    { kind: 'unassigned: buildable land without a street or a lot', acres: 0.23 },
  ],
  lot_kinds: ['standard', 'edge'],
  lot_areas_sf: [10327, 8231],
  // the live shape: an object keyed by id, each test with its own figures
  tests: {
    'block.length': { pass: true, limit: 1200, value: 970 },
    'open.unassigned': { pass: false, rule: 'every open piece is a lot, an amenity or natural land', acres: 0.23 },
    'storm.low_point': { pass: true, area_sf: 6848, needed_sf: 6013 },
    'street.grade_max': { pass: false, limit: 10, value: 26.8, ft_over_limit: 440 },
    'street.dead_end_max': { pass: true, limit: 750, value: 0 },
    'yield.vs_arithmetic': { lots: 34, ratio: 0.94, arithmetic_at_62pct: 36 },
    'access.second_connection': { pass: true, value: 3, needed: 2 },
  },
  fails: ['open.unassigned', 'street.grade_max'],
  notes: [],
  earthwork: {
    cut: { pond_cy: 0, required_cy: 0, closes_on_site: false, avg_depth_ft_needed: null, open_floodplain_ac_available: 0 },
    notes: [], bfe_ft: null, fill_cy: { total: 0, streets: 0, graded_aprons: 0, pads_and_drives: 0 },
    sfha_ac: 0, fill_max_ft: 0, pad_fill_ft: { max: null, min: null, median: null }, freeboard_ft: 4, lots_in_sfha: 0,
    street_grade: { max_pct: 26.8, limit_pct: 10, ft_over_limit: 440 }, cells_in_sfha: 0,
    ground_max_ft: 628.8, ground_min_ft: 559.9, pad_target_ft: null, lots_with_pad_fill_over_10ft: 0,
  },
  street_lines_wkt: `MULTILINESTRING((${X} ${Y + 200},${X + 300} ${Y + 200}))`,
  row_wkt: `POLYGON${rect(X, Y + 175, 300, 50)}`,
  pave_wkt: `POLYGON${rect(X, Y + 187, 300, 26)}`,
  bulbs_wkt: `MULTIPOLYGON(${rect(X + 300, Y + 165, 60, 70)})`,
  lots_wkt: `MULTIPOLYGON(${rect(X, Y + 225, 65, 125)},${rect(X + 65, Y + 225, 80, 125)})`,
  pads_wkt: `MULTIPOLYGON(${rect(X + 10, Y + 255, 40, 40)},${rect(X + 80, Y + 255, 40, 40)})`,
  // the second driveway laps 6 ft into the pavement, as the generator's do
  drives_wkt: `MULTIPOLYGON(${rect(X + 20, Y + 225, 12, 30)},${rect(X + 90, Y + 207, 12, 48)})`,
  open_wkt: `MULTIPOLYGON(${rect(X + 150, Y + 225, 70, 60)},${rect(X + 230, Y + 225, 30, 30)},${rect(X + 230, Y + 270, 70, 80)})`,
  pond_wkt: `POLYGON${rect(X + 160, Y + 235, 50, 40)}`,
  park_wkt: null,
  reserve_wkt: null,
  deep_fill_hold_wkt: null,
  low_point_wkt: `POINT(${X + 185} ${Y + 255})`,
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

describe('tests, fill bands, flood', () => {
  it('normalizes the live object shape (each test with its own figures) and a list', () => {
    const t = normalizeTests(PLAN.tests);
    expect(t.map(x => x.id)).toEqual(['block.length', 'open.unassigned', 'storm.low_point', 'street.grade_max', 'street.dead_end_max', 'yield.vs_arithmetic', 'access.second_connection']);
    expect(t.find(x => x.id === 'street.grade_max')).toMatchObject({ pass: false, limit: 10, value: 26.8, ft_over_limit: 440 });
    expect(t.find(x => x.id === 'yield.vs_arithmetic')?.pass).toBeNull(); // a ratio, not a verdict
    expect(normalizeTests([{ id: 'a', pass: true, value: 1 }, { test: 'b', ok: false }, { nope: 1 }]))
      .toEqual([{ id: 'a', pass: true, value: 1 }, { test: 'b', ok: false, id: 'b', pass: false }]);
    expect(normalizeTests({ 'storm.low_point': true })).toEqual([{ id: 'storm.low_point', pass: true }]);
    expect(normalizeTests(null)).toEqual([]);
  });

  it('bands pad fill at 4 / 8 / 12 ft and reads per-pad fill under any of its keys', () => {
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

  it('a plan is in the flood hazard area when the SFHA acres, the lots in it or the fill say so — a BFE alone does not', () => {
    expect(earthworkHasFlood(PLAN.earthwork)).toBe(false);
    expect(earthworkHasFlood({ sfha_ac: 65.77 })).toBe(true);
    expect(earthworkHasFlood({ lots_in_sfha: 10 })).toBe(true);
    expect(earthworkHasFlood({ fill_cy: { total: 361859 } })).toBe(true);
    // 0 Pennington Bend Rd by right: the parcel has a BFE (421) but the plan holds the SFHA out
    expect(earthworkHasFlood({ bfe_ft: 421, pad_target_ft: 425, sfha_ac: 0, lots_in_sfha: 0, fill_cy: { total: 0 } })).toBe(false);
    expect(earthworkHasFlood(null)).toBe(false);
  });

  it('names the open pieces by their prefix: amenity green, natural hatched, unassigned as such', () => {
    expect(openStyle('amenity: neighborhood park')).toMatchObject({ name: 'Neighborhood park', kind: 'amenity', greenway: false });
    expect(openStyle('natural: wetland / water buffer')).toMatchObject({ name: 'Wetland / water buffer', kind: 'greenway', greenway: true });
    expect(openStyle('unassigned: buildable land without a street or a lot')).toMatchObject({ name: 'Unassigned', kind: 'reserve' });
  });
});

describe('sfV1ToElements — the plan on the sheet', () => {
  it('draws lots with the server\'s areas, pads, the street, driveways, open space by kind, the pond on top and the low point', () => {
    const { elements, summary } = sfV1ToElements(PLAN);
    const byType = (t: string) => elements.filter(e => e.type === t);
    const lots = elements.filter(e => /^Lot \d+$/.test(e.name ?? ''));
    expect(lots).toHaveLength(2);
    expect(lots[0]!.properties?.lotKind).toBe('standard');
    expect(lots[0]!.properties?.areaSqFt).toBe(10327); // the server's area, never re-measured
    expect(lots[0]!.properties?.widthFt).toBe(65); // the module, on a standard lot only
    expect(lots[1]!.properties?.lotKind).toBe('edge');
    expect(lots[1]!.properties?.widthFt).toBeUndefined();

    const pads = byType('building');
    expect(pads).toHaveLength(2);
    expect(pads.every(p => p.properties?.house === true)).toBe(true);
    expect(pads[0]!.properties?.color).toBe('#3B82F6'); // out of the floodplain: the plan colour
    expect(summary.fillView).toBe(false);
    expect(summary.hasFlood).toBe(false);

    const circ = byType('circulation');
    expect(circ.filter(c => c.name === 'Street')).toHaveLength(1); // pavement + bulb merge into ONE street piece
    expect(circ.filter(c => c.name === 'Driveway')).toHaveLength(2);
    // the driveway that lapped the street is cut back to the pavement edge (the gate below proves it)
    expect(Array.isArray(circ.find(c => c.name === 'Street')!.properties?.centerline2274)).toBe(true);
    expect(elements.filter(e => e.name === 'Right-of-way')).toHaveLength(1);

    const greens = byType('greenspace');
    expect(greens.map(g => g.name)).toEqual(['Pond and its edge', 'Street island / green (too shallow for a lot)', 'Unassigned', 'Pond']);
    expect(greens.find(g => g.name === 'Unassigned')!.properties?.kind).toBe('reserve');
    // the pond is drawn last, water-blue over the open piece that holds it
    expect(greens[greens.length - 1]!.properties?.kind).toBe('pond');
    expect(elements.find(e => e.name === 'Low point')).toBeTruthy();

    // every element carries the sfv1- prefix so a regenerate REPLACES
    expect(elements.every(isSfV1Element)).toBe(true);
    expect(elements.every(isSfPlanElement)).toBe(true);
    // and the generator's own clean plan passes the zero-overlap gate
    expect(validatePlanElements(elements).ok).toBe(true);
  });

  it('carries the numbers, the tests, the fails and the street grade verbatim', () => {
    const { summary } = sfV1ToElements(PLAN);
    expect(summary.status).toBe('done');
    expect(summary.basis).toBe('by_right');
    expect(summary.floodHold).toBe('sfha');
    expect(summary.address).toBe('4701 BOWFIELD DR');
    expect(summary.zoning).toBe('R8');
    expect(summary.siteAcres).toBe(10.73);
    expect(summary.lots).toBe(2);
    expect(summary.pattern).toBe('loop');
    expect(summary.densityDuAc).toBe(3.17);
    expect(summary.lotWFt).toBe(65);
    expect(summary.counts.connections).toBe(3);
    expect(summary.tests).toHaveLength(7);
    expect(summary.fails).toEqual(['open.unassigned', 'street.grade_max']);
    expect(summary.lotKinds).toEqual({ standard: 1, edge: 1 });
    expect(summary.openPieces).toHaveLength(3);
    expect(summary.streetGrade).toEqual({ maxPct: 26.8, limitPct: 10, ftOverLimit: 440 });
    expect(summary.ms).toBe(1753);
    expect(summary.basisLine).toBe('2 lots @ 65 × 125 ft by right on a loop · 3.17 du/ac gross · 20.7% ROW / 73.1% lots / 6.2% open · flood hold: sfha · fails open.unassigned, street.grade_max · generator: sf_v1');
  });

  it('the floodplain fill scenario: pads coloured by the DEM fill, the override named by what was asked', () => {
    const flood: SfV1Response = {
      ...PLAN,
      basis: 'by_right', // the live function keeps by_right under the fill scenario
      flood_hold: 'floodway',
      earthwork: {
        ...PLAN.earthwork, bfe_ft: 429, pad_target_ft: 433, sfha_ac: 65.77, lots_in_sfha: 2,
        fill_cy: { total: 361859, streets: 118740, graded_aprons: 130272, pads_and_drives: 112848 },
        pad_fill_ft: { min: 3.5, median: 9.8, max: 16 }, lots_with_pad_fill_over_10ft: 1,
        cut: { required_cy: 361859, pond_cy: 4304, open_floodplain_ac_available: 4.8, avg_depth_ft_needed: 46.2, closes_on_site: false },
      },
    };
    const { elements, summary } = sfV1ToElements(flood, { overrideRequested: true, padFillFt: [3.5, 13.2] });
    expect(summary.basis).toBe('override');
    expect(summary.hasFlood).toBe(true);
    expect(summary.fillView).toBe(true);
    const pads = elements.filter(e => e.type === 'building');
    expect(pads[0]!.properties?.fillBand).toBe('under4');
    expect(pads[1]!.properties?.fillBand).toBe('over12');
    expect(pads[1]!.properties?.color).toBe('#DC2626');
    expect(summary.basisLine).toContain('as an OVERRIDE on a loop');
    expect(summary.basisLine).toContain('flood hold: floodway');
    // without per-pad fill there is no fill view, and the panel says so
    expect(sfV1ToElements(flood, { overrideRequested: true }).summary.fillView).toBe(false);
  });

  it('a skipped parcel, a 0-lot parcel and a missing fails list are named honestly', () => {
    const skipped = sfV1ToElements({ status: 'skipped', reason: 'no single-family standard for district MUG' });
    expect(skipped.elements).toHaveLength(0);
    expect(skipped.summary.status).toBe('skipped');
    expect(sfV1SummaryLine(skipped.summary)).toBe('By-right subdivision skipped — no single-family standard for district MUG');

    const none = sfV1ToElements({ status: 'done', basis: 'by_right', lots: 0, reason: 'no lot of 10000 sf (70 x 145 ft) fits on the frontage or beside a new street: 1.59 ac buildable', notes: ['no new street fits with 70 x 145 ft lots'] });
    expect(none.elements).toHaveLength(0);
    expect(none.summary.basisLine).toBe('0 lots by right — no lot of 10000 sf (70 x 145 ft) fits on the frontage or beside a new street: 1.59 ac buildable · generator: sf_v1');

    const { fails: _omitted, ...planWithoutFails } = PLAN;
    void _omitted;
    expect(sfV1ToElements(planWithoutFails).summary.fails).toEqual(['open.unassigned', 'street.grade_max']);

    // one lot reads as one lot (0 River Road Pike, R80, 26 ac)
    expect(sfV1ToElements({ ...PLAN, lots: 1 }).summary.basisLine.startsWith('1 lot @ 65 × 125 ft by right')).toBe(true);
  });
});

describe('2026-11-04: the competition, the new layers, the options that are not overrides', () => {
  it('a pattern choice and module_by_right are by-right choices, not overrides', async () => {
    const { withoutPattern } = await import('./sfV1Plan');
    expect(isOverride({ pattern: 'grid' })).toBe(false);
    expect(isOverride({ pattern: 'neighborhood', module_by_right: true })).toBe(false);
    expect(isOverride({ module_by_right: false })).toBe(false);
    expect(isOverride({ pattern: 'grid', lot_w_ft: 50 })).toBe(true);
    expect(isOverride({ flood: 'floodway' })).toBe(true);
    expect(withoutPattern({ pattern: 'grid', flood: 'floodway' })).toEqual({ flood: 'floodway' });
  });

  it('a test that passes over its limit is reported as such; the steep-ground note is found', async () => {
    const { passesOverLimit, steepGroundNote } = await import('./sfV1Plan');
    expect(passesOverLimit({ id: 'street.grade_max', pass: true, value: 12, limit: 10, ft_over_limit: 100 })).toEqual({ over: 2, ftOver: 100 });
    expect(passesOverLimit({ id: 'street.grade_max', pass: true, value: 8, limit: 10 })).toBeNull();
    expect(passesOverLimit({ id: 'street.grade_max', pass: false, value: 26.8, limit: 10 })).toBeNull();
    expect(steepGroundNote(['1 lots added', 'ground averages 36% slope with 325 ft of fall across the parcel: …'])).toContain('36% slope');
    expect(steepGroundNote(['no new street fits with 100 x 200 ft lots'])).toBeNull();
  });

  it('the pattern reads as a phrase in the basis line', async () => {
    const { patternPhrase } = await import('./sfV1Plan');
    expect(patternPhrase('loop')).toBe(' on a loop');
    expect(patternPhrase('2 loops')).toBe(' on two loops');
    expect(patternPhrase('frontage lots, no new street')).toBe(' as frontage lots (no new street)');
    expect(patternPhrase('grid')).toBe(' on a street grid');
    expect(patternPhrase('neighborhood')).toBe(' as a neighborhood plan');
    expect(patternPhrase(null)).toBe('');
  });

  it('draws the flood hold first, the trail as a band, the green strip and a reserve piece', async () => {
    const { trailStrips3857 } = await import('./sfV1Plan');
    const strips = trailStrips3857(`LINESTRING(${X} ${Y},${X + 300} ${Y},${X + 300} ${Y + 200})`);
    expect(strips.length).toBe(1);
    const { elements } = sfV1ToElements(
      {
        ...PLAN,
        trail_wkt: `LINESTRING(${X} ${Y + 600},${X + 400} ${Y + 600})`,
        green_strip_wkt: `POLYGON${rect(X, Y + 580, 400, 40)}`,
        open_pieces: [{ kind: 'reserve', acres: 1.2 }],
        open_wkt: `MULTIPOLYGON(${rect(X + 600, Y, 100, 100)})`,
      },
      { holdWkt: `POLYGON${rect(X - 500, Y, 400, 400)}` }
    );
    expect(elements[0]!.id).toBe('sfv1-hold-1');
    expect(elements[0]!.name).toBe('Flood hazard area · held out');
    expect(elements.some(e => e.id === 'sfv1-trail-1')).toBe(true);
    expect(elements.some(e => e.id === 'sfv1-green-strip-1')).toBe(true);
    expect(elements.find(e => e.id === 'sfv1-open-1')!.name).toBe('Reserve');
    expect(openStyle('reserve: commercial').name).toBe('Reserve — commercial');
    // the new layers are greenspace: the zero-overlap gate is untouched by them
    expect(validatePlanElements(elements).ok).toBe(true);
  });

  it('summarizes the competition: rows by the drawn pattern, best, structured and the price of the structure', async () => {
    const { summarizeCandidates } = await import('./sfV1Plan');
    const cand = (requested: string, pattern: string | null, lots: number, fails: string[], total: number) => ({
      requested, pattern, status: 'done', lots, fails, notes: [], street_ft: 2000, lots_per_100ft: 1.2, open_pct: 8, connections: 3,
      score: { total, yield: { score: 6 }, geometry: { score: 7.6 } },
    });
    // 4701 Bowfield Dr: the loop is best (35, no fails), the neighborhood plan forgoes 10
    const bowfield = summarizeCandidates({
      status: 'done', best_requested: 'loop', best_by_score: 'loop', best_lots: 35, structured_lots: 25, lots_forgone_for_structure: 10, arithmetic: 36, ms: 4436,
      candidates: [cand('grid', 'grid', 25, ['street.grade_max'], 5.7), cand('neighborhood', 'neighborhood', 25, ['street.grade_max'], 5.7), cand('loop', 'loop', 35, [], 5.9)],
    })!;
    expect(bowfield.rows.map(r => r.label)).toEqual(['grid', 'neighborhood', 'loop']);
    expect(bowfield.rows.find(r => r.isBest)!.requested).toBe('loop');
    expect(bowfield.rows.find(r => r.isStructured)!.requested).toBe('neighborhood');
    expect(bowfield.sentence).toBe('The structured plan gives up 10 lots (35 → 25): the price of the structure. The owner decides.');
    expect(bowfield.rows[0]!.criteria.map(c => c.name)).toEqual(['yield', 'geometry']);
    // 3736 Old Clarksville Pike: the fewest-fails rule picks 7 lots on a single street over 16 that fail three tests
    const clarksville = summarizeCandidates({
      status: 'done', best_requested: 'loop', best_lots: 7, structured_lots: 16, lots_forgone_for_structure: -9,
      candidates: [cand('grid', 'grid', 16, ['a', 'b', 'c'], 4.1), cand('neighborhood', 'neighborhood', 16, ['a', 'b', 'c'], 4.4), cand('loop', 'single street', 7, ['open.unassigned'], 4.3)],
    })!;
    expect(clarksville.rows[2]!.label).toBe('single street');
    expect(clarksville.rows[2]!.fellBack).toBe(false); // the loop grammar drawing a single street is not a fallback
    expect(clarksville.sentence).toContain('draws 9 lots more (16 against 7) but fails 3 tests to the best plan\'s 1');
    // a neighborhood request that drew a grid says so; nothing drawn anywhere is one line
    const fell = summarizeCandidates({ status: 'done', best_requested: 'grid', candidates: [cand('neighborhood', 'grid', 10, [], 5), cand('grid', 'grid', 10, [], 5)] })!;
    expect(fell.rows[0]!.fellBack).toBe(true);
    const none = summarizeCandidates({ status: 'done', best_lots: 0, candidates: [cand('grid', null, 0, [], 0), cand('neighborhood', null, 0, [], 0), cand('loop', null, 0, [], 0)] })!;
    expect(none.allZero).toBe(true);
    expect(none.rows[0]!.label).toBe('grid grammar: nothing drawn');
    expect(none.sentence).toContain('all draw 0');
    // 1083 B Lakewalk Dr: the grid draws 1 lot, the neighborhood nothing — not "gives up 1 lot"
    const lake = summarizeCandidates({ status: 'done', best_requested: 'grid', lots_forgone_for_structure: 1, candidates: [cand('grid', 'grid', 1, [], 3.1), cand('neighborhood', null, 0, [], 0), cand('loop', null, 0, [], 0)] })!;
    expect(lake.sentence).toBe('Only the grid draws lots here (1); the neighborhood grammar draws none, so there is no structured plan to weigh against it.');
    // 0 Sullivan Hollow Rd: every pattern fails the street grade — said before the ranking
    const g = ['street.dead_end_max', 'open.unassigned', 'street.grade_max'];
    const hollow = summarizeCandidates({ status: 'done', best_requested: 'grid', lots_forgone_for_structure: 2, candidates: [cand('grid', 'grid', 15, g, 4.1), cand('neighborhood', 'neighborhood', 13, g, 4.2), cand('loop', 'T street', 5, g, 3)] })!;
    expect(hollow.sentence.startsWith("Every pattern's streets fail the grade limit here, so none is buildable as drawn")).toBe(true);
    expect(hollow.sentence).toContain('gives up 2 lots (15 → 13)');
    // 0 Neelys Bend Rd: only one pattern draws lots, and its streets fail the grade
    const neely = summarizeCandidates({ status: 'done', best_requested: 'neighborhood', lots_forgone_for_structure: 0, candidates: [cand('grid', null, 0, [], 0), cand('neighborhood', 'neighborhood', 2, g, 2.1), cand('loop', null, 0, [], 0)] })!;
    expect(neely.sentence.startsWith('The only pattern that draws lots here fails the street grade')).toBe(true);
  });

  it('names the anon timeout in words a user can act on', async () => {
    const { competitionErrorText } = await import('./sfV1Plan');
    expect(competitionErrorText('canceling statement due to statement timeout')).toContain('20 s the server allows the app');
    expect(competitionErrorText('permission denied')).toBe('permission denied');
  });
});

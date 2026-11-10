import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SfV1Panel, testDetails } from './SfV1Panel';
import type { SfV1Summary } from '../api/sfV1Plan';

const SUMMARY: SfV1Summary = {
  status: 'done',
  reason: null,
  basis: 'by_right',
  floodHold: 'sfha',
  address: '4701 BOWFIELD DR',
  zoning: 'R8',
  siteAcres: 10.73,
  hasFlood: true,
  streetGrade: { maxPct: 26.8, limitPct: 10, ftOverLimit: 440 },
  ms: 1753,
  lots: 24,
  pattern: 'loop',
  densityDuAc: 3.1,
  lotWFt: 60, lotDFt: 130, minLotSf: 8000,
  streetFt: 1850, rowPct: 17.4, lotPct: 63.2, openPct: 19.4, avgLotSf: 8600,
  deadEnds: 0, deadEndMaxFt: 0, imperviousPct: 29, pondSf: 6100, lowPointFt: 428.5,
  counts: { rings: 1, crossStreets: 0, culDeSacs: 0, cornerLots: 4, edgeLots: 6, stubs: 1, connections: 1 },
  floodplainBuiltOnAc: 0.4,
  streetInWetlandFt: 0,
  heldAcres: 0,
  heldPct: 0,
  openPieces: [{ kind: 'pond', acres: 0.14 }, { kind: 'edge open space', acres: 0.9 }],
  lotKinds: { standard: 14, edge: 6, corner: 4 },
  housesPlaced: null,
  tests: [
    { id: 'street.dead_end_max', pass: true, value: 0, limit: 750 },
    { id: 'access.second_connection', pass: false, value: 1, needed: 2 },
    { id: 'flood.freeboard', pass: true, pad_fill_ft: { min: 0.5, median: 2.1, max: 6.4 }, lots_in_sfha: 24, pad_target_ft: 432 },
    { id: 'open.unassigned', pass: false, rule: 'every open piece is a lot, an amenity or natural land', acres: 0.23 },
  ],
  fails: ['access.second_connection', 'open.unassigned'],
  notes: ['0.4 ac of the plan is in the floodplain', 'two lots gave way to the pond'],
  earthwork: {
    bfe_ft: 431, freeboard_ft: 1, pad_target_ft: 432, sfha_ac: 3.2, lots_in_sfha: 24,
    ground_min_ft: 426.1, ground_max_ft: 441.8,
    fill_cy: { total: 6000, streets: 1800, graded_aprons: 0, pads_and_drives: 4200 },
    pad_fill_ft: { min: 0.5, median: 2.1, max: 6.4 }, lots_with_pad_fill_over_10ft: 0,
    cut: { required_cy: 6000, pond_cy: 5200, open_floodplain_ac_available: 0.9, avg_depth_ft_needed: 0.6, closes_on_site: true },
    street_grade: { max_pct: 26.8, limit_pct: 10, ft_over_limit: 440 },
    pad_fill_ft_by_lot: [0.5, 2.1],
  },
  fillView: true,
  privateDrive: null,
  hillsideAcres: null,
  buildableAfterHoldsAc: null,
  remainder: null,
  generatorVersion: 'sf_v1',
  basisLine: '24 lots @ 60 × 130 ft by right on a loop · 3.1 du/ac gross',
};

describe('SfV1Panel (the by-right subdivision and its own grade)', () => {
  it('shows the headline, the tests with fails in red, the notes verbatim and the earthwork', () => {
    render(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-lots').textContent).toBe('24 lots');
    expect(screen.getByTestId('sfv1-basis').textContent).toBe('By right');
    expect(screen.getByTestId('sfv1-flood-hold').textContent).toContain('sfha');
    expect(screen.getByTestId('sfv1-pattern').textContent).toContain('loop');
    expect(screen.getByTestId('sfv1-density').textContent).toBe('3.1 du/ac gross');
    // tests: every id on the list, the failed ones marked, each with its own figures and rule
    expect(screen.getByTestId('sfv1-tests').children).toHaveLength(4);
    expect(screen.getByTestId('sfv1-test-access.second_connection').getAttribute('data-pass')).toBe('false');
    expect(screen.getByTestId('sfv1-test-access.second_connection').textContent).toContain('value 1 · needed 2');
    expect(screen.getByTestId('sfv1-test-flood.freeboard').textContent).toContain('pad fill ft: min 0.5, median 2.1, max 6.4');
    expect(screen.getByTestId('sfv1-test-open.unassigned').textContent).toContain('acres 0.23 — every open piece is a lot, an amenity or natural land');
    expect(screen.getByTestId('sfv1-fails').textContent).toBe('Fails: access.second_connection, open.unassigned');
    expect(screen.getByTestId('sfv1-notes').textContent).toContain('two lots gave way to the pond');
    // earthwork: the ground, the street grade (over the limit, in red), the flood figures, the fill legend
    const ew = screen.getByTestId('sfv1-earthwork').textContent ?? '';
    expect(ew).toContain('426.1–441.8 ft');
    expect(screen.getByTestId('sfv1-street-grade').textContent).toBe('max 26.8% · limit 10% · 440 ft of street over the limit');
    expect(screen.getByTestId('sfv1-street-grade').className).toContain('text-red-700');
    expect(ew).toContain('431 ft + 1 ft freeboard → pads at 432 ft');
    expect(ew).toContain('pads and drives 4,200 cy');
    expect(ew).not.toContain('graded aprons'); // a zero component is not listed
    expect(ew).toContain('median 2.1');
    expect(ew).toContain('closes on site');
    expect(ew).toContain('over 12 ft');
  });

  it('out of the floodplain the earthwork block still states the ground and the street grade', () => {
    const dry = { ...SUMMARY, hasFlood: false, fillView: false, earthwork: { ...SUMMARY.earthwork, sfha_ac: 0, lots_in_sfha: 0, bfe_ft: null, fill_cy: { total: 0 } } };
    // flood land held out (the SFHA is there, the plan keeps out of it)
    const { rerender } = render(<SfV1Panel summary={{ ...dry, heldAcres: 2.5 }} override={{}} onOverride={() => undefined} />);
    const ew = screen.getByTestId('sfv1-earthwork');
    expect(ew.getAttribute('data-flood')).toBe('false');
    expect(ew.textContent).toContain('stays out of the flood hazard area');
    expect(ew.textContent).not.toContain('BFE');
    expect(screen.getByTestId('sfv1-street-grade').textContent).toContain('max 26.8%');
    expect(screen.getByTestId('sfv1-override-floodway')).toBeTruthy();
    // nothing held, no BFE (3736 Old Clarksville Pike): no flood land at all, and no fill scenario to offer
    rerender(<SfV1Panel summary={{ ...dry, heldAcres: 0 }} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-earthwork').textContent).toContain('No FEMA flood hazard area on the site');
    expect(screen.queryByTestId('sfv1-override-floodway')).toBeNull();
    expect(screen.getByTestId('sfv1-no-fill-scenario').textContent).toContain('no fill scenario');
  });

  it('the yield comparison reads as a sentence, not a formula', () => {
    render(<SfV1Panel summary={{ ...SUMMARY, tests: [{ id: 'yield.vs_arithmetic', pass: null, lots: 7, ratio: 0.44, arithmetic_at_62pct: 16 }], fails: [] }} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-test-yield.vs_arithmetic').textContent).toContain('7 lots; a 62% net-to-gross estimate would say 16 (ratio 0.44)');
  });

  it('a pass over the limit is marked as the engine allowing it, not a plain tick', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, tests: [{ id: 'street.grade_max', pass: true, value: 12, limit: 10, ft_over_limit: 100 }], fails: [] }}
        override={{}}
        onOverride={() => undefined}
      />
    );
    const row = screen.getByTestId('sfv1-test-street.grade_max');
    expect(row.getAttribute('data-over-limit')).toBe('true');
    expect(row.textContent).toContain("passes over the limit for 100 ft, within the engine's allowance");
  });

  it('leads with the steep-ground caveat; on a 0-lot answer the DEM says it when the engine did not', () => {
    const steepNote = 'ground averages 36% slope with 325 ft of fall across the parcel: streets and pads here need grading the engine does not model yet';
    const { rerender } = render(<SfV1Panel summary={{ ...SUMMARY, notes: [steepNote, 'two lots gave way to the pond'] }} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-steep').textContent).toContain('36% slope');
    expect(screen.getByTestId('sfv1-notes').textContent).not.toContain('36% slope'); // said once
    const zero = { ...SUMMARY, lots: 0, pattern: null, tests: [], fails: [], notes: ['no new street fits with 100 x 200 ft lots'], earthwork: null, fillView: false, hasFlood: false, heldAcres: null };
    rerender(
      <SfV1Panel summary={zero} override={{}} onOverride={() => undefined}
        terrain={{ meanSlopePct: 28.5, maxSlopePct: 92.1, fallFt: 82 }} site={{ heldAcres: 2.71, siteAcres: 1.77 }} />
    );
    expect(screen.getByTestId('sfv1-steep').textContent).toContain('averages 29% slope (max 92%) with 82 ft of fall');
    expect(screen.getByTestId('sfv1-steep').textContent).toContain('may not be what stops this plan');
    expect(screen.getByTestId('sfv1-held').textContent).toContain('takes 2.71 ac out before the layout; 1.77 ac are left');
    // engine g13 (0 Dry Fork Rd): the steepest land is held out as hillside — the caveat says so
    const hillside = { ...zero, notes: ['25.0 ac steeper than 25% held out as hillside (no lots or pads on it; a street may still cross it and is graded against the limit)'] };
    rerender(<SfV1Panel summary={hillside} override={{}} onOverride={() => undefined} terrain={{ meanSlopePct: 37, maxSlopePct: 77, fallFt: 287 }} />);
    expect(screen.getByTestId('sfv1-steep').textContent).toContain('holds the land steeper than 25% out as hillside and finds no lot on the rest');
    expect(screen.getByTestId('sfv1-steep').textContent).not.toContain('does not lay out by it yet');
    // flat ground: no caveat
    rerender(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} terrain={{ meanSlopePct: 3.8, maxSlopePct: 15.8, fallFt: 10 }} />);
    expect(screen.queryByTestId('sfv1-steep')).toBeNull();
  });

  it('a skip is shown with its reason; an override is labelled and can be reset', () => {
    const onOverride = vi.fn();
    const { rerender } = render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'no single-family standard for district MUG', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={onOverride}
      />
    );
    expect(screen.getByTestId('sfv1-skipped').textContent).toContain('no single-family standard for district MUG');
    expect(screen.queryByTestId('sfv1-earthwork')).toBeNull();

    rerender(<SfV1Panel summary={{ ...SUMMARY, basis: 'override' }} override={{ flood: 'floodway' }} onOverride={onOverride} />);
    expect(screen.getByTestId('sfv1-basis').textContent).toBe('Override');
    expect(screen.getByTestId('sfv1-override-floodway').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('sfv1-override-reset'));
    expect(onOverride).toHaveBeenLastCalledWith({});
  });

  it('0 new lots offers the one house the lot carries, and says when it is drawn', () => {
    const onDrawHouse = vi.fn();
    const zero = {
      ...SUMMARY, lots: 0, pattern: null, tests: [], fails: [], earthwork: null, fillView: false, hasFlood: false,
      reason: 'no lot of 40000 sf (140 x 290 ft) fits on the frontage or beside a new street: 2.91 ac buildable',
      basisLine: '0 lots by right — no lot of 40000 sf (140 x 290 ft) fits on the frontage or beside a new street: 2.91 ac buildable · generator: sf_v1',
    };
    const { rerender } = render(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} onDrawHouse={onDrawHouse} />);
    expect(screen.getByTestId('sfv1-lots').textContent).toBe('0 lots');
    expect(screen.getByTestId('sfv1-one-house').textContent).toContain('the parcel itself is one lot');
    fireEvent.click(screen.getByTestId('sfv1-draw-house'));
    expect(onDrawHouse).toHaveBeenCalledTimes(1);
    rerender(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} onDrawHouse={onDrawHouse} houseDrawn />);
    expect(screen.queryByTestId('sfv1-draw-house')).toBeNull();
    expect(screen.getByTestId('sfv1-one-house').textContent).toContain('the house it carries is drawn');
    // a plan with lots never offers it
    rerender(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} onDrawHouse={onDrawHouse} />);
    expect(screen.queryByTestId('sfv1-one-house')).toBeNull();
  });

  it('a seed that could not place the house says so in place and stops offering the button', () => {
    const zero = { ...SUMMARY, lots: 0, pattern: null, tests: [], fails: [], earthwork: null, fillView: false, hasFlood: false };
    render(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} onDrawHouse={() => undefined} houseError="it returned a house with no footprint for this parcel." />);
    expect(screen.queryByTestId('sfv1-draw-house')).toBeNull();
    expect(screen.getByTestId('sfv1-house-error').textContent).toContain('could not place the house: it returned a house with no footprint');
  });

  it('a landlocked parcel: the one house assumes an access easement', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'landlocked: the longest touch on a street is 1163 ft', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={() => undefined}
        onDrawHouse={() => undefined}
      />
    );
    expect(screen.getByTestId('sfv1-house-access').textContent).toContain('assumes an access easement');
  });

  it('a flood skip offers the fill scenario as an override, and the house its flood caveat', () => {
    const onOverride = vi.fn();
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'floodplain leaves no buildable piece', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={onOverride}
        onDrawHouse={() => undefined}
      />
    );
    fireEvent.click(screen.getByTestId('sfv1-override-floodway'));
    expect(onOverride).toHaveBeenLastCalledWith({ flood: 'floodway' });
    expect(screen.getByTestId('sfv1-house-flood').textContent).toContain('stands in the floodplain');
    expect(screen.queryByTestId('sfv1-override-apply')).toBeNull(); // a lot module cannot answer it
  });

  it('a parcel smaller than the district minimum says so; street-only fill shows no pad legend', () => {
    const zero = { ...SUMMARY, lots: 0, pattern: null, tests: [], fails: [], notes: ['no new street fits with 270 x 300 ft lots'], earthwork: null, fillView: false, hasFlood: false, minLotSf: 80000 };
    const { rerender } = render(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} site={{ heldAcres: 0, siteAcres: 1.43, parcelAcres: 1.43 }} />);
    expect(screen.getByTestId('sfv1-undersized').textContent).toContain('The parcel (62,291 SF) is smaller than the district\'s minimum lot (80,000 SF)');
    rerender(
      <SfV1Panel
        summary={{ ...SUMMARY, hasFlood: true, fillView: false, earthwork: { ...SUMMARY.earthwork, lots_in_sfha: 0, sfha_ac: 0, fill_cy: { total: 20, streets: 20 } } }}
        override={{}}
        onOverride={() => undefined}
      />
    );
    expect(screen.getByTestId('sfv1-street-only-fill').textContent).toContain('the fill is for the street');
  });

  it('a skipped parcel shows no controls that cannot help, and the one-house offer', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'no street edge and no vacant neighbour: landlocked', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={() => undefined}
        onDrawHouse={() => undefined}
      />
    );
    expect(screen.getByTestId('sfv1-skipped').textContent).toContain('landlocked');
    expect(screen.queryByTestId('sfv1-override-apply')).toBeNull();
    expect(screen.queryByTestId('sfv1-override-floodway')).toBeNull();
    expect(screen.queryByTestId('sfv1-override-reset')).toBeNull();
    expect(screen.getByTestId('sfv1-draw-house')).toBeTruthy();
  });

  it('says when the generator did not use the lot module that was asked for', () => {
    const { rerender } = render(
      <SfV1Panel summary={{ ...SUMMARY, basis: 'override', lots: 0, lotWFt: 135, lotDFt: 300 }} override={{ lot_w_ft: 100, lot_d_ft: 400, min_lot_sf: 40000 }} onOverride={() => undefined} />
    );
    expect(screen.getByTestId('sfv1-module-ignored').textContent).toBe('You asked for 100 × 400 ft lots; the generator used 135 × 300 ft.');
    rerender(<SfV1Panel summary={{ ...SUMMARY, basis: 'override', lotWFt: 50, lotDFt: 120 }} override={{ lot_w_ft: 50, lot_d_ft: 120, min_lot_sf: 6000 }} onOverride={() => undefined} />);
    expect(screen.queryByTestId('sfv1-module-ignored')).toBeNull();
  });

  it('no cut is listed when the plan needs none', () => {
    render(<SfV1Panel summary={{ ...SUMMARY, earthwork: { ...SUMMARY.earthwork, cut: { required_cy: 0, pond_cy: 0, closes_on_site: false } } }} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-earthwork').textContent).not.toContain('does not close on site');
  });

  it('the override controls send a lot module and the fill scenario', () => {
    const onOverride = vi.fn();
    render(<SfV1Panel summary={SUMMARY} override={{}} onOverride={onOverride} />);
    fireEvent.change(screen.getByTestId('sfv1-override-lot-w'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('sfv1-override-lot-d'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('sfv1-override-min-sf'), { target: { value: '6000' } });
    fireEvent.click(screen.getByTestId('sfv1-override-apply'));
    expect(onOverride).toHaveBeenLastCalledWith({ lot_w_ft: 50, lot_d_ft: 120, min_lot_sf: 6000 });
    fireEvent.click(screen.getByTestId('sfv1-override-floodway'));
    expect(onOverride).toHaveBeenLastCalledWith({ flood: 'floodway' });
    // by right again: the reset is disabled when nothing is overridden
    expect((screen.getByTestId('sfv1-override-reset') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('SfV1Panel — third batch (2026-11-04)', () => {
  it('says when the sheet shows the competition\'s best because the default drew nothing, and offers the way back', () => {
    const onView = vi.fn();
    const auto = { requested: 'grid', why: 'default_empty' as const, defaultLots: 0, bestLots: 19, defaultStreetFt: null, bestStreetFt: 2100, defaultFails: 0, bestFails: 0 };
    render(<SfV1Panel summary={{ ...SUMMARY, lots: 19 }} override={{}} onOverride={() => undefined} autoBest={auto} onViewCandidate={onView} />);
    expect(screen.getByTestId('sfv1-auto-best').textContent).toContain('the grid grammar. It is still by right');
    expect(screen.getByTestId('sfv1-auto-best-back').textContent).toBe('Show the default answer (0 lots)');
    fireEvent.click(screen.getByTestId('sfv1-auto-best-back'));
    expect(onView).toHaveBeenLastCalledWith('loop');
  });

  it('engine g13: the same lots on less street, and the way back to the default\'s lots', () => {
    const auto = { requested: 'neighborhood', why: 'same_lots' as const, defaultLots: 3, bestLots: 3, defaultStreetFt: 699, bestStreetFt: 384, defaultFails: 1, bestFails: 0 };
    render(<SfV1Panel summary={{ ...SUMMARY, lots: 3 }} override={{}} onOverride={() => undefined} autoBest={auto} onViewCandidate={() => undefined} />);
    const note = screen.getByTestId('sfv1-auto-best');
    expect(note.getAttribute('data-why')).toBe('same_lots');
    expect(note.textContent).toContain('draws the same 3 lots as the default (loop) grammar on 384 ft of new street against 699 ft');
    expect(screen.getByTestId('sfv1-auto-best-back').textContent).toBe('Show the default answer (3 lots)');
  });

  it('engine g13: a shared private drive is said in words, and a flood skip shows its hold', () => {
    const { rerender } = render(
      <SfV1Panel summary={{ ...SUMMARY, lots: 5, pattern: 'shared private drive', privateDrive: { easementFt: 24, laneFt: 16, lengthFt: 857, maxLots: 6 } }} override={{}} onOverride={() => undefined} />
    );
    expect(screen.getByTestId('sfv1-private-drive').textContent).toBe(
      'The lots share a private drive (857 ft long, a 16-ft lane in a 24-ft access easement) off the existing street: no new public street to build or dedicate. A shared drive may serve at most 6 lots here.');
    // the band is an easement, the length a drive's, and a test the drive section switches off says so
    expect(screen.getByTestId('sfv1-panel').textContent).toContain('17.4% easement');
    expect(screen.getByTestId('sfv1-panel').textContent).toContain('Private drive');
    expect(testDetails({ id: 'block.length', pass: true, limit: 1e9, value: 857 })).toBe('no limit here · value 857');
    // 0 Hickory Bend Dr (672526): skipped for floodplain, all 5.24 ac held
    rerender(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'floodplain leaves no buildable piece', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}} onOverride={() => undefined} site={{ heldAcres: 5.24, siteAcres: 0, parcelAcres: 5.24 }}
      />
    );
    expect(screen.getByTestId('sfv1-held').textContent).toBe('The flood hold takes 5.24 ac out, the whole site (hatched blue on the sheet).');
  });

  it('flags lots on the parcel\'s holes and frontage lots on a parcel with no street', () => {
    const { rerender } = render(
      <SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined}
        holeOverlap={{ holes: 5, holesAcres: 3.88, lotsOnHoles: 9, lots: 9, overlapSf: 140072 }} />
    );
    expect(screen.getByTestId('sfv1-holes').textContent).toContain('9 of 9 lots lie partly on land that is not this parcel (140,072 SF)');
    rerender(<SfV1Panel summary={{ ...SUMMARY, lots: 12, pattern: 'frontage lots, no new street' }} override={{}} onOverride={() => undefined} frontageLandlocked />);
    expect(screen.getByTestId('sfv1-frontage-landlocked').textContent).toContain('the lots front a property line');
    // a street plan on a landlocked parcel is not flagged as frontage lots
    rerender(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} frontageLandlocked />);
    expect(screen.queryByTestId('sfv1-frontage-landlocked')).toBeNull();
  });

  it('engine g14: the hillside hold is said in acres, with what is left after every hold (0 Dry Fork Rd)', () => {
    const zero = { ...SUMMARY, lots: 0, pattern: null, tests: [], fails: [], notes: ['25.0 ac steeper than 25% held out as hillside'], earthwork: null, fillView: false, hasFlood: false, hillsideAcres: 25.03, buildableAfterHoldsAc: 5.64 };
    const { rerender } = render(<SfV1Panel summary={zero} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-hillside').textContent).toBe('The hillside hold takes 25.03 ac out (steeper than 25%, hatched tan on the sheet); 5.64 ac are left after every hold.');
    rerender(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} />);
    expect(screen.queryByTestId('sfv1-hillside')).toBeNull();
  });
});

describe('SfV1Panel — explainable status (the scope\'s P0.2, 2026-11-09)', () => {
  it('a landlocked skip lists the edges by class, and the house note says the open edge is not a street (0 Ivey Point Rd)', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'skipped', reason: 'landlocked: the longest touch on a street is 2069 ft (a street run needs 40 ft); no vacant neighbour to connect through (neighbours by edge length: open_edge 2069 ft, residential 945 ft)', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={() => undefined}
        onDrawHouse={() => undefined}
      />
    );
    expect(screen.getByTestId('sfv1-edges').textContent).toBe('Edges by class: 2,069 ft open edge (no street, no parcel) · 945 ft residential neighbour · no mapped street contact.');
    const access = screen.getByTestId('sfv1-house-access').textContent ?? '';
    expect(access).toContain('the 2,069-ft open edge is not a street');
    expect(access).toContain('conditional on that easement');
  });

  it('a plan with lots names what its checks cover and what they do not (4727 Post Rd)', () => {
    render(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} />);
    const d = screen.getByTestId('sfv1-diligence').textContent ?? '';
    expect(d).toContain('4 checks from the district\'s standards');
    expect(d).toContain('Not evaluated here: survey and legal access, utility service and capacity, stormwater detention sizing, geotechnical, street and driveway permits');
    expect(screen.queryByTestId('sfv1-edges')).toBeNull();
  });
});

describe('SfV1Panel — the engine\'s house plans (2026-11-09)', () => {
  it('says how many lots carry a catalogue plan', () => {
    render(<SfV1Panel summary={{ ...SUMMARY, lots: 5, housesPlaced: 3 }} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-houses').textContent).toBe('3 of 5 lots carry a catalogue plan · the rest keep a generic pad');
  });
  it('stays silent when the engine did not say', () => {
    render(<SfV1Panel summary={{ ...SUMMARY, housesPlaced: null }} override={{}} onOverride={() => undefined} />);
    expect(screen.queryByTestId('sfv1-houses')).toBeNull();
  });
});

describe('SfV1Panel — the generator raised instead of answering (8192 Charlotte Pike, 2026-11-10)', () => {
  it('says it is an engine error, draws no offer and no override in its place', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, status: 'error', reason: 'division by zero', lots: 0, tests: [], fails: [], notes: [], earthwork: null, fillView: false }}
        override={{}}
        onOverride={() => undefined}
        onDrawHouse={() => undefined}
      />
    );
    expect(screen.getByTestId('sfv1-error').textContent).toBe('The by-right generator failed on this parcel: division by zero. This is an engine error, not a finding about the land. No plan is drawn; nothing was substituted for it.');
    expect(screen.queryByTestId('sfv1-skipped')).toBeNull();
    expect(screen.queryByTestId('sfv1-draw-house')).toBeNull();
    expect(screen.queryByTestId('sfv1-override-floodway')).toBeNull();
  });
});

describe('SfV1Panel — engine g18: the holding answer and a figure that is not a check', () => {
  it('says how much land the plan does not reach', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, lots: 13, pattern: 'frontage lots, no new street', fails: [], remainder: { acres: 11.7, lots: 7 } }}
        override={{}}
        onOverride={() => undefined}
      />,
    );
    expect(screen.getByTestId('sfv1-remainder').textContent).toBe('⚠ 11.7 ac inside 7 oversized lots is not planned: no street, terrace or lane drawn here reaches it. The lot count is a holding answer for that land, not a subdivision of it.');
  });

  it('shows no holding line when the plan reaches the land', () => {
    render(<SfV1Panel summary={{ ...SUMMARY, remainder: null }} override={{}} onOverride={() => undefined} />);
    expect(screen.queryByTestId('sfv1-remainder')).toBeNull();
  });

  it('a figure over its limit is a flag on its row, not a failed check', () => {
    render(
      <SfV1Panel
        summary={{ ...SUMMARY, fails: [], tests: [
          { id: 'access.lane_on_held_land', pass: false, figure: true, value: 1535, share: 0.55, limit_share: 0.5 },
          { id: 'lot.min_area', pass: true, limit: 20000, value: 20600, lots_under: 0 },
        ] }}
        override={{}}
        onOverride={() => undefined}
      />,
    );
    const row = screen.getByTestId('sfv1-test-access.lane_on_held_land');
    expect(row.getAttribute('data-figure')).toBe('true');
    expect(row.getAttribute('data-over-limit')).toBe('true');
    expect(row.className).not.toContain('text-red-700');
    expect(row.textContent).toContain('!');
    expect(row.textContent).toContain('a figure over its limit: a flag, not a failed check');
    expect(row.textContent).not.toContain('within the engine');
    expect(screen.getByTestId('sfv1-test-lot.min_area').getAttribute('data-pass')).toBe('true');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SfV1Panel } from './SfV1Panel';
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
    render(<SfV1Panel summary={{ ...SUMMARY, hasFlood: false, fillView: false, earthwork: { ...SUMMARY.earthwork, sfha_ac: 0, lots_in_sfha: 0, bfe_ft: null, fill_cy: { total: 0 } } }} override={{}} onOverride={() => undefined} />);
    const ew = screen.getByTestId('sfv1-earthwork');
    expect(ew.getAttribute('data-flood')).toBe('false');
    expect(ew.textContent).toContain('stays out of the flood hazard area');
    expect(ew.textContent).not.toContain('BFE');
    expect(screen.getByTestId('sfv1-street-grade').textContent).toContain('max 26.8%');
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

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SfV1Panel } from './SfV1Panel';
import type { SfV1Summary } from '../api/sfV1Plan';

const SUMMARY: SfV1Summary = {
  status: 'done',
  reason: null,
  basis: 'by_right',
  floodHold: 'sfha',
  lots: 24,
  pattern: 'loop',
  densityDuAc: 3.1,
  lotWFt: 60, lotDFt: 130, minLotSf: 8000,
  streetFt: 1850, rowPct: 17.4, lotPct: 63.2, openPct: 19.4, avgLotSf: 8600,
  deadEnds: 0, deadEndMaxFt: 0, imperviousPct: 29, pondSf: 6100, lowPointFt: 428.5,
  counts: { rings: 1, crossStreets: 0, culDeSacs: 0, cornerLots: 4, edgeLots: 6, stubs: 1, connections: 1 },
  floodplainBuiltOnAc: 0.4,
  streetInWetlandFt: 0,
  openPieces: [{ kind: 'pond', acres: 0.14 }, { kind: 'edge open space', acres: 0.9 }],
  lotKinds: { standard: 14, edge: 6, corner: 4 },
  tests: [
    { id: 'street.dead_end_max', pass: true, value: 0, limit: 750 },
    { id: 'access.second_connection', pass: false, value: 1, limit: 2 },
    { id: 'flood.freeboard', pass: true, value: 1, limit: 1 },
  ],
  fails: ['access.second_connection'],
  notes: ['0.4 ac of the plan is in the floodplain', 'two lots gave way to the pond'],
  earthwork: {
    bfe_ft: 431, pad_target_ft: 432, fill_cy: { pads: 4200, streets: 1800 },
    pad_fill_ft: { min: 0.5, median: 2.1, max: 6.4 }, lots_with_pad_fill_over_10ft: 0,
    cut: { required_cy: 6000, pond_cy: 5200, open_floodplain_ac_available: 0.9, avg_depth_ft_needed: 0.6, closes_on_site: true },
    pad_fill_ft_by_lot: [0.5, 2.1],
  },
  fillView: true,
  generatorVersion: 'sf_v1',
  basisLine: '24 lots @ 60 × 130 ft by by right on a loop · 3.1 du/ac gross',
};

describe('SfV1Panel (the by-right subdivision and its own grade)', () => {
  it('shows the headline, the tests with fails in red, the notes verbatim and the earthwork', () => {
    render(<SfV1Panel summary={SUMMARY} override={{}} onOverride={() => undefined} />);
    expect(screen.getByTestId('sfv1-lots').textContent).toBe('24 lots');
    expect(screen.getByTestId('sfv1-basis').textContent).toBe('By right');
    expect(screen.getByTestId('sfv1-flood-hold').textContent).toContain('sfha');
    expect(screen.getByTestId('sfv1-pattern').textContent).toContain('loop');
    expect(screen.getByTestId('sfv1-density').textContent).toBe('3.1 du/ac gross');
    // tests: every id on the list, the failed one marked
    expect(screen.getByTestId('sfv1-tests').children).toHaveLength(3);
    expect(screen.getByTestId('sfv1-test-access.second_connection').getAttribute('data-pass')).toBe('false');
    expect(screen.getByTestId('sfv1-test-access.second_connection').textContent).toContain('1 vs 2');
    expect(screen.getByTestId('sfv1-fails').textContent).toBe('Fails: access.second_connection');
    expect(screen.getByTestId('sfv1-notes').textContent).toContain('two lots gave way to the pond');
    // earthwork, with the fill legend because per-pad fill came back
    const ew = screen.getByTestId('sfv1-earthwork').textContent ?? '';
    expect(ew).toContain('431 ft');
    expect(ew).toContain('pads 4,200 cy');
    expect(ew).toContain('median 2.1');
    expect(ew).toContain('closes on site');
    expect(ew).toContain('over 12 ft');
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

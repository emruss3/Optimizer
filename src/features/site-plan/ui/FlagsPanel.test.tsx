import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FlagsPanel from './FlagsPanel';

describe('FlagsPanel — regime comparison receipts', () => {
  it('renders both complete solves with the chosen regime and basis', () => {
    render(
      <FlagsPanel
        violations={[]}
        lineageFlags={['regime_tuck_under_v1']}
        regimeComparison={{
          surface_gsf: null,
          surface_error: 'planner_parking_infeasible',
          tuck_under_gsf: 227760,
          chosen: 'tuck_under',
          basis: 'complete_real_solves_argmax_gsf',
        }}
      />
    );
    expect(screen.getByText('Parking-regime comparison (two complete solves)')).toBeTruthy();
    expect(screen.getByText('Surface regime refusal')).toBeTruthy();
    expect(screen.getByText('planner parking infeasible')).toBeTruthy();
    expect(screen.getByText('Tuck-under regime GSF')).toBeTruthy();
    expect(screen.getByText('227,760')).toBeTruthy();
    expect(screen.getByText('tuck under')).toBeTruthy();
    // The lineage flag carries its human description too
    expect(screen.getByText(/tuck-under regime/)).toBeTruthy();
  });

  it('stays silent when there was no comparison', () => {
    render(<FlagsPanel violations={[]} lineageFlags={[]} />);
    expect(screen.queryByText(/Parking-regime comparison/)).toBeNull();
    expect(screen.getByText(/Nothing to check/)).toBeTruthy();
  });
});

describe('FlagsPanel — attention first, derivation notes behind a count (the scope\'s P0.2, 2026-11-09)', () => {
  it('shows the actionable flags as rows and folds the receipts (0 Whites Creek Pike carried 49)', () => {
    render(
      <FlagsPanel
        violations={[]}
        lineageFlags={['parking_below_ratio', 'precedent_set_from_district', 'parking_summary_disagrees', 'prior_consumed_v2']}
      />
    );
    const rows = screen.getAllByTestId('flag-attention');
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('parking_below_ratio'),
      expect.stringContaining('parking_summary_disagrees'),
    ]);
    const notes = screen.getByTestId('flag-notes');
    expect(notes.querySelector('summary')?.textContent).toBe('2 generator notes (derivation receipts, no action needed)');
    expect(notes.textContent).toContain('precedent_set_from_district');
    expect(notes.textContent).toContain('prior_consumed_v2');
  });

  it('only notes: no attention rows, the fold still counts them', () => {
    render(<FlagsPanel violations={[]} lineageFlags={['precedent_set_from_district']} />);
    expect(screen.queryAllByTestId('flag-attention')).toHaveLength(0);
    expect(screen.getByTestId('flag-notes').querySelector('summary')?.textContent).toBe('1 generator note (derivation receipts, no action needed)');
  });
});

describe('what the Checks badge counts', () => {
  it('counts flags that ask something of the user and leaves generator notes out (1710 Meharry)', async () => {
    const { isActionableFlag } = await import('./FlagsPanel');
    // a derivation receipt: how the precedent set was picked. Nothing for the user to do.
    expect(isActionableFlag('regrid_sample_capped_100')).toBe(false);
    expect(isActionableFlag('bar_depth_from_typology_program_spec')).toBe(false);
    // these ask for something
    expect(isActionableFlag('parking_summary_disagrees')).toBe(true);
    expect(isActionableFlag('far_exceeded_pinned')).toBe(true);
    expect(['regrid_sample_capped_100'].filter(isActionableFlag).length).toBe(0);
  });
});

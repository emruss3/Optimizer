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
    expect(screen.getByText(/No active flags/)).toBeTruthy();
  });
});

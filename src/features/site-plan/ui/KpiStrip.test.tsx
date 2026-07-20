import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiStrip from './KpiStrip';
import type { SiteMetrics } from '../../../engine/types';

const base = {
  totalBuiltSF: 100000,
  siteCoveragePct: 25,
  achievedFAR: 1.0,
  parkingRatio: 1.5,
  openSpacePct: 40,
  totalUnits: 80,
  stallsProvided: 120,
  stallsRequired: 120,
  violations: [],
  zoningCompliant: true,
} as unknown as SiteMetrics;

describe('KpiStrip — parking regime chip', () => {
  it('shows the tuck-under chip only for tuck_under solves', () => {
    const { rerender } = render(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'tuck_under' } as SiteMetrics}
        investment={null}
        utilizationPct={100}
      />
    );
    expect(screen.getByText('Tuck-under parking')).toBeTruthy();

    rerender(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'surface' } as SiteMetrics}
        investment={null}
        utilizationPct={100}
      />
    );
    expect(screen.queryByText('Tuck-under parking')).toBeNull();
  });

  it('keeps compliance and envelope verdicts separate from the regime chip', () => {
    render(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'tuck_under' } as SiteMetrics}
        investment={null}
        utilizationPct={62}
      />
    );
    expect(screen.getByText('Code compliant')).toBeTruthy();
    expect(screen.getByText(/62% of theoretical envelope/)).toBeTruthy();
    expect(screen.getByText('Tuck-under parking')).toBeTruthy();
  });
});

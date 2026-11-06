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

describe('KpiStrip — a by-right subdivision on the sheet', () => {
  it('reads lots, du/ac and the plan\'s own tests, not stalls and "0 issues"', () => {
    const sub = { ...base, totalUnits: 25, openSpacePct: 9, zoningCompliant: false } as SiteMetrics;
    const { rerender } = render(
      <KpiStrip metrics={sub} investment={null} subdivision={{ lots: 25, densityDuAc: 2.33, fails: ['street.grade_max'], status: 'done' }} />
    );
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('Lots25');
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('du / ac2.33');
    expect(screen.queryByText('Stalls')).toBeNull();
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('1 test fail');
    rerender(<KpiStrip metrics={sub} investment={null} subdivision={{ lots: 35, densityDuAc: 3.26, fails: [], status: 'done' }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('All tests pass');
    rerender(<KpiStrip metrics={sub} investment={null} subdivision={{ lots: 0, densityDuAc: null, fails: [], status: 'done' }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('No new lots by right');
  });

  it('the townhome engine\'s plan counts townhomes and homes per acre (multifamily land, 2026-11-04)', () => {
    const th = { ...base, totalUnits: 27, openSpacePct: 41, zoningCompliant: true } as SiteMetrics;
    render(<KpiStrip metrics={th} investment={null} subdivision={{ lots: 27, densityDuAc: 12.7, fails: [], status: 'done', label: 'Townhomes', densityLabel: 'homes / ac' }} />);
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('Townhomes27');
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('homes / ac12.7');
  });
});

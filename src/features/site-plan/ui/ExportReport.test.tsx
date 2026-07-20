import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportReport from './ExportReport';
import type { SiteMetrics } from '../../../engine/types';

vi.mock('./TabulationPanel', () => ({ default: () => <div data-testid="tabulation" /> }));
vi.mock('./MaxBuildoutHeadline', () => ({ default: () => <div data-testid="headline" /> }));
vi.mock('./FlagsPanel', () => ({ default: () => <div data-testid="flags" /> }));
vi.mock('../api/plannerContext', () => ({
  plannerContextSummary: () => 'Context v2 · 6 precedents (medium)',
}));

const METRICS = {
  totalBuiltSF: 43400,
  siteCoveragePct: 22,
  achievedFAR: 0.88,
  parkingRatio: 1.6,
  openSpacePct: 40,
  zoningCompliant: true,
  violations: [],
  optimizationStatus: 'feasible_demonstrably_constrained',
  optimizationProof: { proof_basis: 'buildable_envelope_exhausted' },
} as unknown as SiteMetrics;

describe('ExportReport — the exit artifact', () => {
  it('renders header, plan snapshot, and every honest section with the context footer', () => {
    const onClose = vi.fn();
    render(
      <ExportReport
        address="2611 W HEIMAN ST"
        zoning="RM40"
        planPng="data:image/png;base64,xyz"
        planBasis="Max GSF 55800 · achieved 43400"
        metrics={METRICS}
        elements={[]}
        buildout={null}
        currentStories={4}
        plannerCtx={{ context_id: 'ctx-1', context_hash: 'hash-1' } as never}
        violations={[]}
        lineageFlags={[]}
        acres={1.1}
        onClose={onClose}
      />
    );
    expect(screen.getByText('2611 W HEIMAN ST')).toBeTruthy();
    expect(screen.getByText(/Zoning RM40 · 1\.10 ac/)).toBeTruthy();
    expect(screen.getByAltText('Site plan')).toBeTruthy();
    expect(screen.getByTestId('tabulation')).toBeTruthy();
    expect(screen.getByTestId('headline')).toBeTruthy();
    expect(screen.getByTestId('flags')).toBeTruthy();
    // Provenance footer: context identity + the vocabulary discipline
    expect(screen.getByText(/context id ctx-1/)).toBeTruthy();
    expect(screen.getByText(/"achievable" is used only for solver-reproduced numbers/)).toBeTruthy();

    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});

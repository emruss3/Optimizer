import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultsPanel from './ResultsPanel';
import type { SiteMetrics } from '../../../engine/types';

const metrics = (over: Partial<SiteMetrics> = {}): SiteMetrics => ({
  totalBuiltSF: 54244, siteCoveragePct: 0, achievedFAR: 0, openSpacePct: 0, parkingRatio: 1.7,
  violations: [], warnings: [], zoningCompliant: true, ...over,
} as SiteMetrics);

describe('ResultsPanel', () => {
  it('shows a figure the plan did not report as not reported, never as zero', () => {
    render(<ResultsPanel metrics={metrics()} investmentAnalysis={null} isGenerating={false} violations={[]} />);
    expect(screen.getByTestId('results-far').textContent).toBe('not reported');
    expect(screen.getByTestId('results-coverage').textContent).toBe('not reported');
  });

  it('shows a reported figure as it is', () => {
    render(<ResultsPanel metrics={metrics({ achievedFAR: 1.06, siteCoveragePct: 31.2 })} investmentAnalysis={null} isGenerating={false} violations={[]} />);
    expect(screen.getByTestId('results-far').textContent).toBe('1.06');
    expect(screen.getByTestId('results-coverage').textContent).toBe('31.2%');
  });

  it('says the figures are the previous plan while the next one loads', () => {
    render(<ResultsPanel metrics={metrics()} investmentAnalysis={null} isGenerating violations={[]} />);
    expect(screen.getByTestId('results-updating').textContent).toMatch(/previous plan/);
  });
});

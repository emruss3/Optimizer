import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchemeCompare from './SchemeCompare';
import type { MfCandidate } from '../api/generateMfPlan';

const cand = (id: string, metrics: MfCandidate['metrics'], marginOnCost?: number): MfCandidate => ({
  id, createdAt: '2026-07-14T12:00:00Z', seed: 1, pins: [], parentId: null, metrics, contextId: 'ctx', contextHash: null, marginOnCost: marginOnCost ?? null,
});
const ring = [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]];

describe('SchemeCompare', () => {
  it('shows stored figures and differences against the first scheme', async () => {
    const a = cand('a', { units_est: 60, stalls: 70, gfa_sqft: 54000, far: 0.7 }, 0.12);
    const b = cand('b', { units_est: 72, stalls: 64, gfa_sqft: 61000 }, 0.1);
    const load = vi.fn().mockResolvedValue(null);
    render(<SchemeCompare schemes={[{ candidate: a, name: 'Option 1' }, { candidate: b, name: 'Option 2' }]} parcelRing={ring} load={load} activeId="a" onView={() => undefined} onUnderwrite={() => undefined} onClose={() => undefined} />);
    expect(screen.getByTestId('compare-units-0').textContent).toBe('60');
    expect(screen.getByTestId('compare-units-1').textContent).toBe('72');
    expect(screen.getByText('+12')).toBeTruthy();
    expect(screen.getByText('−6')).toBeTruthy();
    expect(screen.getByText('−2.0 pts')).toBeTruthy();
    // a figure a scheme did not store is missing, not zero
    expect(screen.getByTestId('compare-far-1').textContent).toBe('not reported');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText('Drawing not available')).toHaveLength(2));
  });

  it('underwrites the scheme whose button was pressed', () => {
    const a = cand('a', { units_est: 60 }), b = cand('b', { units_est: 72 });
    const onUnderwrite = vi.fn(), onClose = vi.fn();
    render(<SchemeCompare schemes={[{ candidate: a, name: 'Option 1' }, { candidate: b, name: 'Option 2' }]} parcelRing={ring} load={() => Promise.resolve(null)} activeId={null} onView={() => undefined} onUnderwrite={onUnderwrite} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('compare-underwrite-1'));
    expect(onUnderwrite).toHaveBeenCalledWith(b);
    expect(onClose).toHaveBeenCalled();
  });
});

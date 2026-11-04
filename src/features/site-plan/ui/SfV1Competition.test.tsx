import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SfV1CompetitionBlock } from './SfV1Competition';
import { summarizeCandidates } from '../api/sfV1Plan';

const cand = (requested: string, pattern: string | null, lots: number, fails: string[], total: number) => ({
  requested, pattern, status: 'done', lots, fails, notes: [], street_ft: 2073, lots_per_100ft: 1.69, open_pct: 5.5, connections: 3,
  score: { total, yield: { score: 9 }, compliance: { score: 10 } },
});
const BOWFIELD = summarizeCandidates({
  status: 'done', best_requested: 'loop', best_by_score: 'loop', best_lots: 35, structured_lots: 25, lots_forgone_for_structure: 10, arithmetic: 36, ms: 4436,
  candidates: [cand('grid', 'grid', 25, ['street.grade_max'], 5.7), cand('neighborhood', 'neighborhood', 25, ['street.grade_max'], 5.7), cand('loop', 'loop', 35, [], 5.9)],
});

describe('SfV1CompetitionBlock (best and structured, side by side)', () => {
  it('lists the patterns drawn, marks best and structured, the plan on the sheet, and the price of the structure', () => {
    const onView = vi.fn();
    render(<SfV1CompetitionBlock competition={{ state: 'done', data: BOWFIELD, error: null }} shownRequested="loop" onView={onView} />);
    const block = screen.getByTestId('sfv1-competition');
    expect(block.getAttribute('data-best')).toBe('loop');
    expect(block.getAttribute('data-forgone')).toBe('10');
    expect(screen.getByTestId('sfv1-cand-best-loop')).toBeTruthy();
    expect(screen.getByTestId('sfv1-cand-structured-neighborhood')).toBeTruthy();
    expect(screen.getByTestId('sfv1-cand-onsheet-loop')).toBeTruthy();
    expect(screen.getByTestId('sfv1-competition-sentence').textContent).toContain('gives up 10 lots (35 → 25)');
    fireEvent.click(screen.getByTestId('sfv1-cand-view-neighborhood'));
    expect(onView).toHaveBeenLastCalledWith('neighborhood');
    fireEvent.click(screen.getByTestId('sfv1-competition-scores-toggle'));
    expect(screen.getByTestId('sfv1-competition-scores').textContent).toContain('compliance');
  });

  it('loading, idle and a timeout each say what is happening', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SfV1CompetitionBlock competition={{ state: 'loading', data: null, error: null }} shownRequested="loop" />);
    expect(screen.getByTestId('sfv1-competition-loading')).toBeTruthy();
    rerender(<SfV1CompetitionBlock competition={{ state: 'idle', data: null, error: null }} shownRequested="loop" onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId('sfv1-competition-run'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<SfV1CompetitionBlock competition={{ state: 'error', data: null, error: 'the three plans did not finish inside the 20 s the server allows the app' }} shownRequested="loop" onRetry={onRetry} />);
    expect(screen.getByTestId('sfv1-competition-error').textContent).toContain('20 s');
  });

  it('a parcel where nothing fits gets one line, no table', () => {
    const none = summarizeCandidates({ status: 'done', best_lots: 0, candidates: [cand('grid', null, 0, [], 0), cand('neighborhood', null, 0, [], 0), cand('loop', null, 0, [], 0)] });
    render(<SfV1CompetitionBlock competition={{ state: 'done', data: none, error: null }} shownRequested="loop" />);
    expect(screen.queryByTestId('sfv1-competition-table')).toBeNull();
    expect(screen.getByTestId('sfv1-competition-sentence').textContent).toContain('all draw 0');
  });
});

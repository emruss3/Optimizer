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

describe('SfV1CompetitionBlock — the third audit and the townhome candidate (2026-11-04)', () => {
  it('shows the engine verdict verbatim, code fails apart from quality flags, density and the townhome row', () => {
    const data = summarizeCandidates({
      status: 'done', best_requested: 'townhome', best_lots: 32, structured_lots: 12, lots_forgone_for_structure: 20,
      verdict: 'buildable as drawn', best_buildable: true, best_code_fails: [], homes_allowed_by_density: 129, attached_permitted: true,
      candidates: [
        { requested: 'grid', pattern: 'grid', status: 'done', lots: 12, fails: ['cost.street_ft_per_lot'] },
        { requested: 'neighborhood', pattern: 'neighborhood', status: 'done', lots: 12, fails: ['street.grade_max', 'open.unassigned'] },
        { requested: 'loop', pattern: 'single street', status: 'done', lots: 12, fails: [] },
        { requested: 'townhome', pattern: 'townhomes (mews)', status: 'done', lots: 32, fails: [], product: 'attached' } as never,
      ],
      best: { status: 'done', lots: 32, product: 'attached', full_plan_call: "fn_generate_th_site_plan_v3(ogc_fid, 'aor')" } as never,
    });
    render(<SfV1CompetitionBlock competition={{ state: 'done', data, error: null }} shownRequested="loop" onView={() => undefined} />);
    expect(screen.getByTestId('sfv1-competition-verdict').textContent).toBe('Engine verdict: buildable as drawn');
    expect(screen.getByTestId('sfv1-competition-density').textContent).toContain('allows 129 homes');
    expect(screen.getByTestId('sfv1-cand-townhome').textContent).toContain('32 homes');
    expect(screen.getByTestId('sfv1-cand-engine-townhome').textContent).toContain('fn_generate_th_site_plan_v3');
    expect(screen.queryByTestId('sfv1-cand-view-townhome')).toBeNull();
    const nb = screen.getByTestId('sfv1-cand-neighborhood').textContent ?? '';
    expect(nb).toContain('fails street.grade_max');
    expect(nb).toContain('flags open.unassigned');
    expect(screen.getByTestId('sfv1-cand-grid').textContent).toContain('no code fails');
  });

  it('a best that fails a code test says so in red', () => {
    const data = summarizeCandidates({
      status: 'done', best_requested: 'grid', best_lots: 19, verdict: 'the best plan fails a code test: not buildable as drawn',
      best_buildable: false, best_code_fails: ['street.dead_end_max', 'street.grade_max'],
      candidates: [{ requested: 'grid', pattern: 'grid', status: 'done', lots: 19, fails: ['street.dead_end_max', 'street.grade_max'] }],
    });
    render(<SfV1CompetitionBlock competition={{ state: 'done', data, error: null }} shownRequested="loop" />);
    const v = screen.getByTestId('sfv1-competition-verdict');
    expect(v.getAttribute('data-buildable')).toBe('false');
    expect(v.textContent).toBe('Engine verdict: the best plan fails a code test: not buildable as drawn (street.dead_end_max, street.grade_max)');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanActions, { describeChange, type PlanSummary } from './PlanActions';

const sum = (over: Partial<PlanSummary> = {}): PlanSummary => ({ units: 30, stalls: 52, gsf: 54244, buildings: 1, locked: 0, ...over });
const noop = () => undefined;
const base = {
  busy: false, onRecalculate: noop, onAnotherOption: noop, onSaveVersion: noop, savedAs: null, justSaved: null,
  locked: 0, free: 1, onUnlockAll: noop, change: null, onDismissChange: noop,
};

describe('describeChange', () => {
  it('states each figure that moved, from the engine figures', () => {
    const lines = describeChange({ action: 'New option', before: sum(), after: sum({ units: 34, stalls: 48, gsf: 60100, buildings: 2 }) });
    expect(lines).toEqual([
      'Units 30 → 34 (+4)',
      'Stalls 52 → 48 (−4)',
      'Building area 54,244 → 60,100 GSF (+5,856)',
      'Buildings 1 → 2 (+1)',
    ]);
  });

  it('says so when nothing moved, and names the locked buildings that were kept', () => {
    expect(describeChange({ action: 'Recalculated', before: sum(), after: sum() })).toEqual(['Units, stalls and building area are unchanged']);
    expect(describeChange({ action: 'New option', before: sum({ locked: 1 }), after: sum({ units: 31, locked: 1 }) })).toEqual([
      'Units 30 → 31 (+1)',
      '1 locked building kept in place',
    ]);
  });

  it('does not invent a difference from a figure the engine did not report', () => {
    expect(describeChange({ action: 'Recalculated', before: sum({ stalls: null }), after: sum({ stalls: 40 }) })).toEqual(['Units, stalls and building area are unchanged']);
  });
});

describe('PlanActions', () => {
  it('keeps recalculating, a new option and saving apart', () => {
    const onRecalculate = vi.fn(), onAnotherOption = vi.fn(), onSaveVersion = vi.fn();
    render(<PlanActions {...base} onRecalculate={onRecalculate} onAnotherOption={onAnotherOption} onSaveVersion={onSaveVersion} savedAs="Option 3" />);
    fireEvent.click(screen.getByText('Recalculate this design'));
    fireEvent.click(screen.getByText('Create another option'));
    fireEvent.click(screen.getByText('Save version'));
    expect([onRecalculate.mock.calls.length, onAnotherOption.mock.calls.length, onSaveVersion.mock.calls.length]).toEqual([1, 1, 1]);
    expect(screen.getByTestId('plan-saved-state').textContent).toBe('On the sheet: Option 3');
  });

  it('says what is locked and what is free, and unlocks on request', () => {
    const onUnlockAll = vi.fn();
    render(<PlanActions {...base} locked={1} free={2} onUnlockAll={onUnlockAll} />);
    expect(screen.getByTestId('plan-locks').textContent).toBe('1 locked · 2 free');
    fireEvent.click(screen.getByTestId('plan-locks'));
    expect(screen.getByTestId('plan-locks-detail').textContent).toMatch(/The planner keeps them exactly where they are/);
    fireEvent.click(screen.getByTestId('plan-unlock-all'));
    expect(onUnlockAll).toHaveBeenCalled();
  });

  it('reports a save that worked and one that did not', () => {
    const { rerender } = render(<PlanActions {...base} justSaved="Option 3, Nov 12, 3:41 PM" />);
    expect(screen.getByTestId('plan-saved-state').textContent).toBe('Saved as Option 3, Nov 12, 3:41 PM');
    rerender(<PlanActions {...base} saveFailed="Saving plans requires signing in." />);
    expect(screen.getByRole('alert').textContent).toBe('Not saved. Saving plans requires signing in.');
  });

  it('shows what the last action changed', () => {
    render(<PlanActions {...base} change={{ action: 'Recalculated', before: sum(), after: sum({ units: 32 }) }} />);
    expect(screen.getByTestId('plan-change').textContent).toContain('Recalculated');
    expect(screen.getByTestId('plan-change').textContent).toContain('Units 30 → 32 (+2)');
  });
});

describe('PlanActions for a guest', () => {
  it('offers sign-in beside a save refused for want of an account', () => {
    render(<PlanActions {...base} saveFailed="Sign in to save this plan." signIn={<button>Sign in</button>} />);
    expect(screen.getByRole('alert').textContent).toContain('Not saved. Sign in to save this plan.');
    expect(screen.getByTestId('plan-sign-in').textContent).toBe('Sign in');
  });
});

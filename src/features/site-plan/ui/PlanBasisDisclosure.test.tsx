import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PlanBasisDisclosure } from './PlanBasisDisclosure';

describe('<PlanBasisDisclosure>', () => {
  it('is one line until asked, then shows the receipts', () => {
    render(
      <PlanBasisDisclosure summary={['147,592 GSF seed plan @ 4 st', 'context applied', '147,250 GSF upper bound', '100% capture']} tone="ok">
        <div data-testid="receipt">the ladder</div>
      </PlanBasisDisclosure>,
    );
    const toggle = screen.getByTestId('plan-basis-toggle');
    expect(toggle.textContent).toContain('Plan basis · 147,592 GSF seed plan @ 4 st · context applied · 147,250 GSF upper bound · 100% capture');
    expect(screen.queryByTestId('receipt')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('receipt').textContent).toBe('the ladder');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens itself when the state needs the user', () => {
    const { rerender } = render(
      <PlanBasisDisclosure summary={['plan stale']} tone="warn" forceOpen={false}>
        <div data-testid="receipt">stale</div>
      </PlanBasisDisclosure>,
    );
    expect(screen.queryByTestId('receipt')).toBeNull();
    rerender(
      <PlanBasisDisclosure summary={['plan stale']} tone="warn" forceOpen>
        <div data-testid="receipt">stale</div>
      </PlanBasisDisclosure>,
    );
    expect(screen.getByTestId('receipt')).not.toBeNull();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SitePlannerErrorBoundary } from './ErrorBoundary';

function Boom({ when }: { when: () => boolean }) {
  if (when()) throw new Error('renderer lost its context');
  return <div data-testid="three-d">3D is up</div>;
}

describe('SitePlannerErrorBoundary — a scoped failure with the way back (the scope\'s P0.3, 2026-11-09)', () => {
  it('names the failure, offers Back to 2D and a retry that remounts only the subtree', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    const back = vi.fn();
    render(
      <SitePlannerErrorBoundary title="The 3D view failed" description="The 2D plan is intact." retryLabel="Retry 3D" onBackTo2D={back}>
        <Boom when={() => broken} />
      </SitePlannerErrorBoundary>
    );
    expect(screen.getByTestId('planner-error').textContent).toContain('The 3D view failed');
    expect(screen.getByTestId('planner-error').textContent).toContain('The 2D plan is intact.');
    fireEvent.click(screen.getByTestId('planner-error-back-2d'));
    expect(back).toHaveBeenCalledTimes(1);
    // the renderer recovers; Retry remounts the subtree, no page reload
    broken = false;
    fireEvent.click(screen.getByTestId('planner-error-retry'));
    expect(screen.getByTestId('three-d').textContent).toBe('3D is up');
    spy.mockRestore();
  });

  it('without a 2D callback the fallback offers only retry and refresh', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SitePlannerErrorBoundary>
        <Boom when={() => true} />
      </SitePlannerErrorBoundary>
    );
    expect(screen.queryByTestId('planner-error-back-2d')).toBeNull();
    expect(screen.getByTestId('planner-error-retry').textContent).toContain('Retry');
    spy.mockRestore();
  });
});

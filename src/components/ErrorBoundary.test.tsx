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

describe('SitePlannerErrorBoundary — files replaced by a newer release (audit cf4f0e8, R3)', () => {
  it('says a newer release is live and offers to keep the plan, not a retry that cannot work', async () => {
    const { ChunkLoadError } = await import('../lib/staleBuild');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const move = vi.fn();
    const back = vi.fn();
    function Gone(): React.ReactElement { throw new ChunkLoadError('3D view', new Error('404'), true, 'https://app/assets/Massing3D-old.js'); }
    render(
      <SitePlannerErrorBoundary title="The 3D view failed" onBackTo2D={back} onMoveToNewRelease={move}>
        <Gone />
      </SitePlannerErrorBoundary>
    );
    expect(screen.getByTestId('planner-stale-release').textContent).toContain('A newer release of the app is live');
    expect(screen.queryByTestId('planner-error-retry')).toBeNull();
    fireEvent.click(screen.getByTestId('planner-move-release'));
    expect(move).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('planner-error-back-2d'));
    expect(back).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks the lazy part for its file afresh on Retry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onRetry = vi.fn();
    let broken = true;
    render(
      <SitePlannerErrorBoundary retryLabel="Retry 3D" onRetry={() => { onRetry(); broken = false; }}>
        <Boom when={() => broken} />
      </SitePlannerErrorBoundary>
    );
    fireEvent.click(screen.getByTestId('planner-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('three-d')).toBeTruthy();
    spy.mockRestore();
  });
});

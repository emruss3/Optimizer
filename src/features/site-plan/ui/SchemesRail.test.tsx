import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SchemesRail from './SchemesRail';
import type { MfCandidate } from '../api/generateMfPlan';

const cand = (over: Partial<MfCandidate>): MfCandidate => ({
  id: 'c1',
  createdAt: '2026-07-14T12:00:00Z',
  seed: 1,
  pins: [],
  parentId: null,
  metrics: { units_est: 75, stalls: 52, far: 0.7 },
  contextId: null,
  contextHash: null,
  ...over,
});

describe('SchemesRail (saved candidates keep their context identity)', () => {
  it('marks candidates from an older or pre-contract context; current ones stay clean', () => {
    render(
      <SchemesRail
        candidates={[
          cand({ id: 'current', contextId: 'ctx-active' }),
          cand({ id: 'older', contextId: 'ctx-old' }),
          cand({ id: 'legacy', contextId: null }),
        ]}
        activeId={null}
        onView={() => undefined}
        activeContextId="ctx-active"
        onRegenerateWithCurrentContext={() => undefined}
      />
    );
    // The explicit action appears ONLY for the two non-current candidates
    expect(screen.getAllByText('Regenerate with current context')).toHaveLength(2);
    // Badges distinguish "older context" from "predates the contract"
    expect(screen.getByTitle(/Saved under an older context version/)).toBeTruthy();
    expect(screen.getByTitle(/Saved before the context contract/)).toBeTruthy();
  });

  it('without an active context nothing is flagged (no context to be older than)', () => {
    render(
      <SchemesRail
        candidates={[cand({ id: 'legacy', contextId: null })]}
        activeId={null}
        onView={() => undefined}
        activeContextId={null}
        onRegenerateWithCurrentContext={() => undefined}
      />
    );
    expect(screen.queryByText('Regenerate with current context')).toBeNull();
  });

  it('viewing passes the candidate through untouched; regenerate is a separate explicit action', () => {
    const onView = vi.fn();
    const onRegen = vi.fn();
    const older = cand({ id: 'older', contextId: 'ctx-old' });
    render(
      <SchemesRail
        candidates={[older]}
        activeId={null}
        onView={onView}
        activeContextId="ctx-active"
        onRegenerateWithCurrentContext={onRegen}
      />
    );
    fireEvent.click(screen.getByText('75 u'));
    expect(onView).toHaveBeenCalledWith(older); // carries its STORED contextId
    expect(onRegen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Regenerate with current context'));
    expect(onRegen).toHaveBeenCalledWith(older);
  });
});

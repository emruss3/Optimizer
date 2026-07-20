import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const compileMock = vi.fn(async (_fid: number, use: string) => ({
  context_id: `ctx-${use}`,
  generation_allowed: use !== 'blocked_use',
  context: { typology: use === 'multi_family' ? 'multifamily' : 'single_family' },
}));
const buildoutMock = vi.fn(async () => ({
  max_gsf: 55800,
  units_at_max: 36,
  entitlement_capacity: { max_units: 45 },
}));

vi.mock('../api/plannerContext', () => ({
  compilePlannerContext: (fid: number, use: string) => compileMock(fid, use),
}));
vi.mock('../api/maxBuildout', () => ({
  fetchMaxBuildout: () => buildoutMock(),
}));

import HbuStrip from './HbuStrip';

describe('HbuStrip — highest & best is analyzed, not asserted', () => {
  it('ranks uses by legal envelope, stars the best, and flips use on click', async () => {
    const onSelect = vi.fn();
    render(
      <HbuStrip
        ogcFid={1}
        uses={['single_family', 'multi_family']}
        activeUse="single_family"
        onSelectUse={onSelect}
      />
    );

    // Multifamily carries the envelope and ranks first with the star
    await waitFor(() => expect(screen.getByText('Multi Family')).toBeTruthy());
    expect(screen.getByText(/56k GSF · 36u/)).toBeTruthy();
    expect(screen.getByLabelText('Highest and best')).toBeTruthy();
    // The active use is NOT the best — the strip says so
    expect(screen.getByText(/active use is not the highest envelope/)).toBeTruthy();

    // Clicking the best use flips the workspace through the use-change path
    fireEvent.click(screen.getByText('Multi Family'));
    expect(onSelect).toHaveBeenCalledWith('multi_family');
  });

  it('renders nothing with fewer than two uses', () => {
    const { container } = render(
      <HbuStrip ogcFid={1} uses={['multi_family']} activeUse="multi_family" onSelectUse={() => undefined} />
    );
    expect(container.firstChild).toBeNull();
  });
});

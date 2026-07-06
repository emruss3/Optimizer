import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ContextPanel from './ContextPanel';

// Live-shaped payloads (parcel 669046, RM40): the context fn keys off the
// typology it was ASKED about; permitted uses say multifamily is as-of-right.
const CTX_BY_TYPOLOGY: Record<string, unknown> = {
  single_family: {
    zoning_base: 'RM40',
    typology: 'single_family',
    regime: 'horizontal',
    setbacks: { front: { value: 20, source: 'typology_default' } },
  },
  multifamily: {
    zoning_base: 'RM40',
    typology: 'multifamily',
    regime: 'horizontal_pending',
    setbacks: { front: { value: 20, source: 'typology_default' } },
    parking: { basis: 'per_unit', ratio: 1.5, stall_w_ft: 9, stall_d_ft: 18, drive_aisle_ft: 24 },
  },
};

const fetchDesignContext = vi.hoisted(() => vi.fn());
const fetchPermittedUses = vi.hoisted(() => vi.fn());

vi.mock('../api/designContext', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/designContext')>();
  return {
    ...actual,
    fetchDesignContext,
    fetchPermittedUses,
    fetchLocalBuiltForm: vi.fn().mockResolvedValue(null),
    fetchLocalPricing: vi.fn().mockResolvedValue(null),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchDesignContext.mockImplementation(async (_fid: number, use: string) => {
    // Mirror the real client: p_typology is the MAPPED vocabulary
    const typology = use === 'multi_family' ? 'multifamily' : use;
    return CTX_BY_TYPOLOGY[typology] ?? null;
  });
  fetchPermittedUses.mockResolvedValue({
    feasible_uses_as_of_right: ['single_family', 'two_family', 'multi_family'],
  });
});

/** Drives the panel like SiteWorkspace does: use lives in parent state. */
const Harness: React.FC<{
  onSettled: (ctx: unknown) => void;
  onUseChange?: (use: string) => void;
}> = ({ onSettled, onUseChange }) => {
  const [use, setUse] = React.useState('single_family');
  return (
    <ContextPanel
      ogcFid={669046}
      use={use}
      onUseChange={u => {
        onUseChange?.(u);
        setUse(u);
      }}
      onSettled={onSettled}
      autoSelectUse
    />
  );
};

describe('ContextPanel autoSelectUse (zoning-grounded default use)', () => {
  it('corrects the hardcoded initial use to the highest-intensity as-of-right use BEFORE settling', async () => {
    const onSettled = vi.fn();
    const onUseChange = vi.fn();
    render(<Harness onSettled={onSettled} onUseChange={onUseChange} />);

    await waitFor(() => expect(onSettled).toHaveBeenCalled());

    // The correction happened…
    expect(onUseChange).toHaveBeenCalledWith('multi_family');
    // …and the ONLY settled context is the corrected one — the wrong-use
    // (single_family) context never reaches the auto-plan router.
    expect(onSettled).toHaveBeenCalledTimes(1);
    const settled = onSettled.mock.calls[0][0] as { typology?: string };
    expect(settled?.typology).toBe('multifamily');

    // Sanity: the corrected zoning chip renders
    expect(await screen.findByText('RM40')).toBeTruthy();
  });

  it('settles directly (no loop) when the initial use is already the preferred one', async () => {
    fetchPermittedUses.mockResolvedValue({
      feasible_uses_as_of_right: ['single_family'],
    });
    const onSettled = vi.fn();
    const onUseChange = vi.fn();
    render(<Harness onSettled={onSettled} onUseChange={onUseChange} />);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(onUseChange).not.toHaveBeenCalled();
    const settled = onSettled.mock.calls[0][0] as { typology?: string };
    expect(settled?.typology).toBe('single_family');
  });

  it('settles with whatever it has when the permitted-uses RPC fails (fail-soft)', async () => {
    fetchPermittedUses.mockResolvedValue(null);
    const onSettled = vi.fn();
    render(<Harness onSettled={onSettled} />);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    const settled = onSettled.mock.calls[0][0] as { typology?: string };
    expect(settled?.typology).toBe('single_family');
  });
});

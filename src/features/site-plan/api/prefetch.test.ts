import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prefetchPlanner, __resetPrefetch, type PrefetchDeps } from './prefetch';

const deps = (): PrefetchDeps => ({
  topo: vi.fn(async () => ({})),
  neighbors: vi.fn(async () => ({})),
  seed: vi.fn(async () => ({})),
  permittedUses: vi.fn(async () => ['multi_family']),
  compile: vi.fn(async () => ({})),
  useFor: vi.fn(() => 'multi_family'),
});

describe('starting the planner calls while the drawer is open', () => {
  beforeEach(() => __resetPrefetch());

  it('starts topography, neighbours, the seed and the context for the planner use', async () => {
    const d = deps();
    await prefetchPlanner(554072, 'RM40', d);
    expect(d.topo).toHaveBeenCalledWith(554072);
    expect(d.neighbors).toHaveBeenCalledWith(554072);
    expect(d.seed).toHaveBeenCalledWith(554072);
    expect(d.useFor).toHaveBeenCalledWith(['multi_family'], 'RM40');
    expect(d.compile).toHaveBeenCalledWith(554072, 'multi_family');
  });

  it('runs each parcel once, one parcel at a time, and survives a failed call', async () => {
    const d = deps();
    (d.topo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const first = prefetchPlanner(1, null, d);
    expect(prefetchPlanner(2, null, d)).toBeNull(); // one at a time
    await first;
    expect(prefetchPlanner(1, null, d)).toBeNull(); // once per parcel
    await prefetchPlanner(2, null, d);
    expect(d.compile).toHaveBeenCalledTimes(2);
    expect(prefetchPlanner(Number.NaN, null, d)).toBeNull();
  });
});

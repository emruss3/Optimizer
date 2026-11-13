import { describe, it, expect, vi, beforeEach } from 'vitest';

const or = vi.fn();
let hang = false;
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: () => ({ or: (f: string) => { or(f); return { limit: () => (hang ? new Promise(() => undefined) : Promise.resolve({ data: [], error: null })) }; } }) }) },
}));

import { searchParcels } from './parcelSearch';

describe('searchParcels', () => {
  beforeEach(() => or.mockReset());

  it('keeps filter syntax and wildcards a user typed out of the query', async () => {
    await searchParcels('12*3 "Main" St, (rear) 50%_');
    const filter = or.mock.calls[0]?.[0] as string;
    expect(filter).toContain('address.ilike.%12 3 Main St rear 50%');
    expect(filter).not.toMatch(/["*()]/);
  });

  it('keeps an apostrophe as a one-character match', async () => {
    await searchParcels("12 O'Brien Ave");
    expect(or.mock.calls[0]?.[0]).toContain('address.ilike.%12 O_Brien Ave%');
  });

  it('matches a parcel ID typed with its spaces against the unformatted number', async () => {
    await searchParcels('116 02 0 020.00');
    expect(or.mock.calls[0]?.[0]).toContain('parcelnumb_no_formatting.ilike.%11602002000%');
  });

  it('reports a search that never answers, so the screen is not left searching', async () => {
    vi.useFakeTimers();
    hang = true;
    const pending = searchParcels('12 Main St').catch(e => (e as Error).message);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toBe('no answer after 12 seconds');
    hang = false;
    vi.useRealTimers();
  });

  it('does not search on a single character', async () => {
    expect(await searchParcels('a')).toEqual([]);
    expect(or).not.toHaveBeenCalled();
  });
});

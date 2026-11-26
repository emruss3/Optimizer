import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { compilePlannerContext } from './plannerContext';

beforeEach(() => {
  rpcMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('compiling the planner context', () => {
  it('takes a decline as the answer and does not ask again', async () => {
    rpcMock.mockResolvedValue({ data: { error: 'selected_use_not_as_of_right' }, error: null });
    const result = await compilePlannerContext(910001, 'single_family');
    expect(result).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('still asks once more after a failed call', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset', code: 'XX000' } });
    const result = await compilePlannerContext(910002, 'single_family');
    expect(result).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { isRetryableRpcError, withRpcRetry } from './rpcRetry';

const sleep = vi.fn(async () => {});

describe('one more try for a planner call that ran out of time', () => {
  it('retries a statement timeout once and returns the second answer', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await withRpcRetry(call, { sleep })).toEqual({ data: { ok: true }, error: null });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second attempt', async () => {
    const timeout = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    const call = vi.fn().mockResolvedValue(timeout);
    expect(await withRpcRetry(call, { sleep })).toEqual(timeout);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refusal, a bad argument or a success', async () => {
    for (const r of [
      { data: null, error: { code: '42883', message: 'function does not exist' } },
      { data: null, error: { code: '42501', message: 'permission denied' } },
      { data: { ok: 1 }, error: null },
    ]) {
      const call = vi.fn().mockResolvedValue(r);
      await withRpcRetry(call, { sleep });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it('knows which errors are worth another try', () => {
    expect(isRetryableRpcError({ code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' })).toBe(true);
    expect(isRetryableRpcError({ status: 504 })).toBe(true);
    expect(isRetryableRpcError({ message: 'canceling statement due to statement timeout' })).toBe(true);
    expect(isRetryableRpcError({ code: '23505' })).toBe(false);
    expect(isRetryableRpcError(null)).toBe(false);
  });
});

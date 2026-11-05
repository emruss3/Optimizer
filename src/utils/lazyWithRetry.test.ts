import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryImport } from './lazyWithRetry';

const RELOAD_TIMESTAMP_KEY = 'app:lastDynamicImportReload';

describe('retryImport', () => {
  let reloadMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    window.sessionStorage.clear();
    reloadMock = vi.fn();
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('resolves on the first successful attempt', async () => {
    const mod = { default: 'ok' };
    const factory = vi.fn().mockResolvedValue(mod);

    await expect(retryImport(factory, { intervalMs: 1 })).resolves.toBe(mod);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('retries a transient failure and then resolves', async () => {
    const mod = { default: 'recovered' };
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(mod);

    await expect(retryImport(factory, { retries: 2, intervalMs: 1 })).resolves.toBe(mod);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('forces one reload after retries are exhausted', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('stale chunk'));

    // Promise intentionally stays pending because the page "reloads".
    void retryImport(factory, { retries: 1, intervalMs: 1, reloadCooldownMs: 10_000 });

    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(2); // initial + 1 retry
    expect(window.sessionStorage.getItem(RELOAD_TIMESTAMP_KEY)).not.toBeNull();
  });

  it('rejects instead of reloading again during the cooldown window', async () => {
    // Simulate a reload that just happened.
    window.sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now()));
    const error = new Error('still broken after reload');
    const factory = vi.fn().mockRejectedValue(error);

    await expect(
      retryImport(factory, { retries: 0, intervalMs: 1, reloadCooldownMs: 10_000 }),
    ).rejects.toBe(error);
    expect(reloadMock).not.toHaveBeenCalled();
  });
});

import { lazy, type ComponentType } from 'react';

type ModuleFactory<T> = () => Promise<{ default: T }>;

export interface RetryImportOptions {
  /** Number of in-place retries before falling back to a full reload. */
  retries?: number;
  /** Delay between retries, in milliseconds. */
  intervalMs?: number;
  /** Minimum gap between forced reloads, to guard against reload loops. */
  reloadCooldownMs?: number;
}

// A failed dynamic import almost always means the chunk URL the browser is
// asking for no longer exists on the server: in dev this happens when Vite
// re-optimizes dependencies (the "?v=" hash changes) while a tab is open, and
// in production it happens when a new deploy ships fresh chunk hashes to a user
// who still has the old index loaded. Retrying the same URL rarely helps once
// the graph has moved, so after a few quick retries we force a one-time full
// reload to pull the current module graph.
const RELOAD_TIMESTAMP_KEY = 'app:lastDynamicImportReload';

function now(): number {
  return Date.now();
}

function readLastReload(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function markReload(): void {
  try {
    window.sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(now()));
  } catch {
    // sessionStorage may be unavailable (private mode, SSR); reload guard is
    // best-effort only.
  }
}

export function retryImport<T>(
  factory: ModuleFactory<T>,
  options: RetryImportOptions = {},
): Promise<{ default: T }> {
  const { retries = 2, intervalMs = 400, reloadCooldownMs = 10_000 } = options;

  return new Promise<{ default: T }>((resolve, reject) => {
    const attempt = (remaining: number): void => {
      factory().then(resolve, (error: unknown) => {
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), intervalMs);
          return;
        }

        // Out of retries. Force a single reload unless we just did one — that
        // guards against an infinite reload loop when the module is genuinely
        // broken rather than merely stale.
        const canReload =
          typeof window !== 'undefined' &&
          now() - readLastReload() > reloadCooldownMs;

        if (canReload) {
          markReload();
          window.location.reload();
          return; // page is reloading; leave the promise pending
        }

        reject(error);
      });
    };

    attempt(retries);
  });
}

/**
 * Drop-in replacement for `React.lazy` that tolerates transient dynamic-import
 * failures (stale Vite dep-optimizer hashes in dev, stale chunk hashes after a
 * production deploy) by retrying and then reloading once.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: ModuleFactory<T>,
  options?: RetryImportOptions,
) {
  return lazy(() => retryImport(factory, options));
}

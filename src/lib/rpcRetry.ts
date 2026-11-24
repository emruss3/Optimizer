/**
 * One more try for a planner call that ran out of time.
 *
 * On 2026-11-24 the database (a 280 MB cache for 5 GB of data, 82% cache hits)
 * answered a parcel nobody had opened recently in 9 to 23 s, past the API's
 * statement timeout, while the same call a moment later answered in about a
 * second because the first attempt had warmed the cache. A statement timeout
 * (57014), or a gateway that could not reach the database (PGRST002, 503,
 * 504), is therefore worth one more attempt after a short pause. A refusal
 * or a bad argument is not: it is returned at once.
 */
export interface RpcError { code?: string; message?: string; status?: number }
export interface RpcResult<T> { data: T | null; error: RpcError | null }

export function isRetryableRpcError(error: RpcError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '57014' || error.code === 'PGRST002') return true;
  if (error.status === 503 || error.status === 504) return true;
  return /statement timeout|schema cache/i.test(error.message ?? '');
}

export async function withRpcRetry<T>(
  call: () => PromiseLike<RpcResult<T>>,
  opts: { label?: string; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RpcResult<T>> {
  const first = await call();
  if (!isRetryableRpcError(first.error)) return first;
  if (opts.label) console.info(`[${opts.label}] ${first.error?.message ?? 'timed out'}; trying once more`);
  await (opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms))))(opts.waitMs ?? 1500);
  return call();
}

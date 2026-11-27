// Plan engines whose answer can outlast the 20 s statement limit of the app's database role go through the
// `engine-long` edge function (140 s, signed-in users, an allow-list of engine functions). 0 Knight Dr (RS7.5,
// 57 ac, 2026-11-26): fn_sf_v1_plan_app took 34-41 s, the RPC was cancelled and the sheet stayed empty.
import { supabase } from '../../../lib/supabase';

export type EngineRpcResult<T> = { data: T | null; error: { code?: string | null; message: string } | null };

/** True for a Postgres statement cancelled by its timeout (SQLSTATE 57014). */
export function isStatementTimeout(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return String(e?.code ?? '') === '57014' || /statement timeout/i.test(String(e?.message ?? ''));
}

/** Runs an allow-listed engine function through the edge function; the function's JSON comes back unchanged. */
export async function engineLong<T>(fn: string, args: Record<string, unknown>): Promise<EngineRpcResult<T>> {
  if (!supabase) return { data: null, error: { message: 'the plan service is not configured' } };
  try {
    const { data, error } = await supabase.functions.invoke('engine-long', { body: { fn, args } });
    if (error) return { data: null, error: { message: String((error as { message?: string }).message ?? error) } };
    const body = data as { data?: T; error?: { code?: string | null; message: string } | string } | null;
    if (body?.error) return { data: null, error: typeof body.error === 'string' ? { message: body.error } : body.error };
    return { data: (body?.data ?? null) as T | null, error: null };
  } catch (err) {
    return { data: null, error: { message: String(err) } };
  }
}

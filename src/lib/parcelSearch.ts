import { supabase } from './supabase';

export interface ParcelHit {
  ogcFid: number;
  address: string;
  parcelNumber: string | null;
  zoning: string | null;
}

export const SEARCH_TIMEOUT_MS = 12_000;

interface ParcelSearchRow {
  ogc_fid: number;
  address: string | null;
  parcelnumb: string | null;
  zoning: string | null;
}

export async function searchParcels(query: string, limit = 10, signal?: AbortSignal): Promise<ParcelHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  if (!supabase) throw new Error('the database client is not configured');
  signal?.throwIfAborted();

  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => {
    controller.abort(new Error(`no answer after ${SEARCH_TIMEOUT_MS / 1000} seconds`));
  }, SEARCH_TIMEOUT_MS);
  try {
    const request = supabase.rpc('find_planner_parcels', { p_query: term, p_limit: limit })
      .abortSignal(controller.signal);
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    });
    const { data, error } = await Promise.race([request, cancelled]);
    if (error) throw new Error(error.message ?? String(error));
    return ((data ?? []) as ParcelSearchRow[]).map(p => ({
      ogcFid: p.ogc_fid,
      address: p.address || 'Unknown Address',
      parcelNumber: p.parcelnumb,
      zoning: p.zoning,
    }));
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', cancel);
  }
}

/** Open a parcel the way a map click does. `planner` goes straight to its plan. */
export function openParcel(hit: { ogcFid: number | string; address?: string | null; zoning?: string | null }, planner = false): void {
  document.dispatchEvent(new CustomEvent('openParcelDrawer', {
    detail: { ogc_fid: String(hit.ogcFid), address: hit.address ?? undefined, zoning: hit.zoning ?? undefined, openPlanner: planner },
  }));
}

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
  const term = query.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim();
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
    const client = supabase;
    const request = async () => {
      // The exact-first lookup is designed for the address and APN expression
      // indexes. The old raw-column ILIKE OR cannot use those indexes.
      const result = await client.rpc('find_planner_parcels', { p_query: term, p_limit: limit })
        .abortSignal(controller.signal);
      if (result.error?.code !== 'PGRST202') return result;

      // Older development databases may not expose the RPC. Do not issue a
      // second, expensive query for real production errors or cancellations.
      controller.signal.throwIfAborted();
      const legacyTerm = term.replace(/'/g, '_');
      const apn = legacyTerm.replace(/[^0-9a-z]/gi, '');
      const filters = [`address.ilike.%${legacyTerm}%`, `parcelnumb.ilike.%${legacyTerm}%`];
      if (apn.length >= 3) filters.push(`parcelnumb_no_formatting.ilike.%${apn}%`);
      return client.from('parcels').select('ogc_fid, parcelnumb, address, zoning')
        .or(filters.join(',')).limit(limit).abortSignal(controller.signal);
    };
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    });
    const { data, error } = await Promise.race([request(), cancelled]);
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

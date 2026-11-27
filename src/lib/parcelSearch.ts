import { supabase } from './supabase';
import { mark } from './timeline';

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

/** Street words as the assessor writes them ("2500 West Heiman Street" → "2500 W HEIMAN ST"). */
const ABBREV: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  AVENUE: 'AVE', STREET: 'ST', DRIVE: 'DR', ROAD: 'RD', LANE: 'LN', COURT: 'CT', BOULEVARD: 'BLVD',
  PLACE: 'PL', CIRCLE: 'CIR', HIGHWAY: 'HWY', PARKWAY: 'PKWY', TERRACE: 'TER', TRAIL: 'TRL',
};
export function assessorStyle(term: string): string {
  return term.toUpperCase().split(' ').map(w => ABBREV[w] ?? w).join(' ');
}

/**
 * Parcel search (audit 9379472 F7): an address or parcel number as before; the app's own parcel ID
 * (the number in planner links and fixtures, e.g. 675423) found exactly; and when the words as typed
 * find nothing, one more try with street words abbreviated the assessor's way. The retry only runs on
 * an empty answer, so "West End Ave" still finds West End Avenue.
 */
export async function searchParcels(query: string, limit = 10, signal?: AbortSignal): Promise<ParcelHit[]> {
  const term = query.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (term.length < 2) return [];
  const byId = /^\d{4,8}$/.test(term) ? await parcelById(Number(term), signal).catch(() => null) : null;
  let rows = await searchTerm(term, limit, signal);
  if (!rows.length) {
    const alt = assessorStyle(term);
    if (alt !== term.toUpperCase()) rows = await searchTerm(alt, limit, signal);
  }
  return byId ? [byId, ...rows.filter(r => r.ogcFid !== byId.ogcFid)].slice(0, limit) : rows;
}

/** The parcel with this app ID (ogc_fid), or null. */
async function parcelById(id: number, signal?: AbortSignal): Promise<ParcelHit | null> {
  if (!supabase || !Number.isFinite(id)) return null;
  let q = supabase.from('parcels').select('ogc_fid, parcelnumb, address, zoning').eq('ogc_fid', id).limit(1);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error || !data?.length) return null;
  const p = data[0] as ParcelSearchRow;
  mark('search-by-id', { ogcFid: p.ogc_fid });
  return { ogcFid: p.ogc_fid, address: p.address || 'Unknown Address', parcelNumber: p.parcelnumb, zoning: p.zoning };
}

async function searchTerm(term: string, limit: number, signal?: AbortSignal): Promise<ParcelHit[]> {
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
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const { data, error } = await Promise.race([request(), cancelled]);
    if (error) { mark('search-failed', { error: error.message ?? String(error) }); throw new Error(error.message ?? String(error)); }
    mark('search-results', { rows: (data ?? []).length, ms: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - started) });
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
  mark(planner ? 'planner-requested' : 'parcel-opened', { ogcFid: String(hit.ogcFid) });
  document.dispatchEvent(new CustomEvent('openParcelDrawer', {
    detail: { ogc_fid: String(hit.ogcFid), address: hit.address ?? undefined, zoning: hit.zoning ?? undefined, openPlanner: planner },
  }));
}

import { supabase } from './supabase';

export interface ParcelHit {
  ogcFid: number;
  address: string;
  parcelNumber: string | null;
  zoning: string | null;
}

/**
 * Find parcels by street address or parcel ID. An APN typed with its spaces
 * or dashes ("116 02 0 020.00") never matched the stored number, so the
 * unformatted column takes the digits as well. Throws when the request fails:
 * a failed search is not "no results".
 */
export async function searchParcels(query: string, limit = 10): Promise<ParcelHit[]> {
  if (!supabase) throw new Error('the database client is not configured');
  // PostgREST's filter grammar reads commas, parentheses and quotes as syntax,
  // and ilike reads *, % and _ as wildcards: none of them is part of an address
  // An apostrophe stays a one-character match, so O'Brien still finds O'BRIEN.
  const term = query.replace(/[,()"\\*%_]/g, ' ').replace(/'/g, '_').replace(/\s+/g, ' ').trim();
  if (term.length < 2) return [];
  const digits = term.replace(/[^0-9a-z]/gi, '');
  const filters = [`address.ilike.%${term}%`, `parcelnumb.ilike.%${term}%`];
  if (digits.length >= 3) filters.push(`parcelnumb_no_formatting.ilike.%${digits}%`);
  const { data, error } = await supabase
    .from('parcels')
    .select('ogc_fid, parcelnumb, address, zoning, landval')
    .or(filters.join(','))
    .limit(limit);
  if (error) throw new Error(error.message ?? String(error));
  return (data ?? []).map(p => ({
    ogcFid: Number(p.ogc_fid),
    address: p.address || 'Unknown Address',
    parcelNumber: p.parcelnumb ?? null,
    zoning: p.zoning ?? null,
  }));
}

/** Open a parcel the way a map click does. `planner` goes straight to its plan. */
export function openParcel(hit: { ogcFid: number | string; address?: string | null; zoning?: string | null }, planner = false): void {
  document.dispatchEvent(new CustomEvent('openParcelDrawer', {
    detail: { ogc_fid: String(hit.ogcFid), address: hit.address ?? undefined, zoning: hit.zoning ?? undefined, openPlanner: planner },
  }));
}

import { supabase } from './supabase';

/**
 * Combine parcels into one site the planner can open.
 *
 * The engines plan one parcel record at a time, so an assemblage is a combined
 * parcel record made by the database (`fn_assemble_parcels`). The outline, the
 * area and the zoning of the combined site all come from there: nothing is
 * merged or measured in the browser.
 */
export type AssembleResult =
  | { status: 'ready'; ogcFid: number; address: string | null; zoning: string | null; acres: number | null }
  /** the engine looked at the set and said no, with its reason */
  | { status: 'refused'; code: string; message: string }
  /** the database does not have the combine function yet */
  | { status: 'unavailable'; message: string }
  | { status: 'failed'; message: string };

const REFUSALS: Record<string, string> = {
  too_few: 'Add at least two parcels to combine them.',
  not_adjacent: 'These parcels do not all touch, so they cannot be planned as one site. Remove the one that stands apart, or add the parcel between them.',
  mixed_zoning: 'These parcels are in different zoning districts. One site needs one district, so this set would need a rezoning first.',
  not_found: 'One of these parcels is no longer on record.',
  too_many: 'That is more parcels than one assemblage can hold.',
};

const missingFunction = (e: { code?: string; message?: string }): boolean =>
  e.code === 'PGRST202' || e.code === '42883' || /could not find the function|function .* does not exist/i.test(e.message ?? '');

export async function assembleParcels(ids: Array<string | number>): Promise<AssembleResult> {
  const fids = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (fids.length < 2) return { status: 'refused', code: 'too_few', message: 'Add at least two parcels to combine them.' };
  if (!supabase) return { status: 'failed', message: 'The database client is not configured.' };
  try {
    const { data, error } = await supabase.rpc('fn_assemble_parcels', { p_fids: fids });
    if (error) {
      if (missingFunction(error)) {
        return { status: 'unavailable', message: 'The planning engine cannot combine parcels yet. Each parcel can still be planned on its own.' };
      }
      return { status: 'failed', message: error.message ?? String(error) };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return { status: 'failed', message: 'The engine returned nothing for this set.' };
    if (typeof row.error === 'string') {
      const said = typeof row.message === 'string' && row.message ? row.message : null;
      return { status: 'refused', code: row.error, message: REFUSALS[row.error] ?? said ?? `The engine declined this set (${row.error}).` };
    }
    const ogcFid = Number(row.ogc_fid);
    if (!Number.isInteger(ogcFid) || ogcFid <= 0) return { status: 'failed', message: 'The engine did not return a combined site.' };
    const acres = Number(row.acres);
    return {
      status: 'ready',
      ogcFid,
      address: typeof row.address === 'string' ? row.address : null,
      zoning: typeof row.zoning === 'string' ? row.zoning : null,
      acres: Number.isFinite(acres) && acres > 0 ? acres : null,
    };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}

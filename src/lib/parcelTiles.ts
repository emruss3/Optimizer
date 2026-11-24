// Where the map's parcel outlines come from (docs/PARCEL_TILES.md).
//
// `legacy` is what production has served: tiles made on request by the
// mvt-parcels edge function from the database, zoom 14 and up only. Its
// settings are kept exactly as they were so the control does not move while
// the candidate is measured against it.
//
// `candidate` is a published release of static tiles: the map reads one small
// manifest, then reads tiles straight from storage, and never asks the
// database to make a tile. If the manifest cannot be read or does not look
// right, the map falls back to legacy and says why.
//
// The choice, in order: ?parcelTiles=candidate|legacy in the address, then the
// same value saved on this device, then VITE_PARCEL_TILES, then legacy.

export type ParcelTilesMode = 'legacy' | 'candidate';

export interface ParcelSourceConfig {
  mode: ParcelTilesMode;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  promoteId: string;
  bounds?: [number, number, number, number];
  release: string | null;
  attribution?: string;
  /** Set when the candidate was asked for but legacy is being used, with the reason. */
  fallback: string | null;
}

export interface ParcelTilesManifest {
  schemaVersion: number;
  release: string;
  layer: string;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  fields: string[];
  idField: string;
  attribution?: string;
}

export const LEGACY_PARCEL_SOURCE: ParcelSourceConfig = {
  mode: 'legacy',
  tiles: ['https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}'],
  // lot-level tiles only exist at z >= 14 on this path: keep in sync with parcels_mvt_b64 and the edge gate
  minzoom: 14,
  maxzoom: 17,
  // Unchanged from production. The legacy tiles carry ogc_fid in the feature
  // header only, so this promoteId finds no property and features have no id
  // (clicks fall back to the point lookup, feature-state highlights never match).
  // Recorded in docs/PARCEL_TILES.md; the candidate fixes it by carrying both.
  promoteId: 'ogc_fid',
  release: null,
  fallback: null,
};

export const PARCEL_TILES_STORAGE_KEY = 'pp.parcelTiles';

export function defaultManifestUrl(supabaseUrl: string | undefined): string | null {
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/parcel-tiles/manifest.json` : null;
}

const asMode = (v: unknown): ParcelTilesMode | null => (v === 'candidate' || v === 'legacy' ? v : null);

export function resolveParcelTilesMode(input: { search?: string; stored?: string | null; env?: string | undefined }): ParcelTilesMode {
  let fromQuery: ParcelTilesMode | null = null;
  try { fromQuery = asMode(new URLSearchParams(input.search ?? '').get('parcelTiles')); } catch { /* a malformed address is no choice */ }
  return fromQuery ?? asMode(input.stored) ?? asMode(input.env) ?? 'legacy';
}

/** The reasons a manifest cannot be used; empty when it can. */
export function manifestProblems(m: unknown): string[] {
  const p: string[] = [];
  const o = m as Partial<ParcelTilesManifest> | null;
  if (!o || typeof o !== 'object') return ['the manifest is not an object'];
  if (o.schemaVersion !== 1) p.push(`schema version ${String(o.schemaVersion)} is not 1`);
  if (o.layer !== 'parcels') p.push(`layer ${String(o.layer)} is not "parcels"`);
  if (typeof o.release !== 'string' || !o.release) p.push('no release id');
  if (!Array.isArray(o.tiles) || !o.tiles.length || !o.tiles.every(t => typeof t === 'string' && /^https:\/\//.test(t) && t.includes('{z}') && t.includes('{x}') && t.includes('{y}'))) p.push('tiles must be https URL templates with {z}, {x} and {y}');
  if (!Number.isInteger(o.minzoom) || !Number.isInteger(o.maxzoom) || (o.minzoom as number) > (o.maxzoom as number)) p.push('minzoom and maxzoom must be integers, minzoom first');
  if (!Array.isArray(o.bounds) || o.bounds.length !== 4 || !o.bounds.every(Number.isFinite)) p.push('bounds must be [west, south, east, north]');
  if (o.idField !== 'ogc_fid') p.push(`id field ${String(o.idField)} is not ogc_fid`);
  if (!Array.isArray(o.fields) || !['ogc_fid', 'zoning', 'sqft'].every(f => o.fields!.includes(f))) p.push('fields must include ogc_fid, zoning and sqft');
  return p;
}

export function candidateSource(m: ParcelTilesManifest): ParcelSourceConfig {
  return {
    mode: 'candidate',
    tiles: m.tiles,
    minzoom: m.minzoom,
    maxzoom: m.maxzoom,
    // the candidate tiles carry ogc_fid as a property as well as the feature id
    promoteId: m.idField,
    bounds: m.bounds,
    release: m.release,
    ...(m.attribution ? { attribution: m.attribution } : {}),
    fallback: null,
  };
}

/**
 * The source the map should add. Never throws: any failure to read or trust
 * the candidate's manifest gives the legacy source, with the reason attached.
 */
export async function loadParcelSource(opts: {
  mode: ParcelTilesMode;
  manifestUrl: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ParcelSourceConfig> {
  if (opts.mode !== 'candidate') return LEGACY_PARCEL_SOURCE;
  if (!opts.manifestUrl) return { ...LEGACY_PARCEL_SOURCE, fallback: 'no manifest address is configured' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 4000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(opts.manifestUrl, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) return { ...LEGACY_PARCEL_SOURCE, fallback: `the manifest answered ${r.status}` };
    const m = await r.json();
    const problems = manifestProblems(m);
    if (problems.length) return { ...LEGACY_PARCEL_SOURCE, fallback: `the manifest is not usable: ${problems.join('; ')}` };
    return candidateSource(m as ParcelTilesManifest);
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return { ...LEGACY_PARCEL_SOURCE, fallback: name === 'AbortError' ? 'the manifest did not answer in time' : `the manifest could not be read (${String((e as Error)?.message ?? e)})` };
  } finally {
    clearTimeout(timer);
  }
}

/** The mode for this page load, read from the address, this device and the build. */
export function currentParcelTilesMode(): ParcelTilesMode {
  let stored: string | null = null;
  try {
    const q = new URLSearchParams(window.location.search).get('parcelTiles');
    // an explicit choice in the address is remembered on this device, so a reviewer can keep it across reloads
    if (q === 'candidate' || q === 'legacy') window.localStorage.setItem(PARCEL_TILES_STORAGE_KEY, q);
    stored = window.localStorage.getItem(PARCEL_TILES_STORAGE_KEY);
  } catch { /* storage can be unavailable */ }
  return resolveParcelTilesMode({ search: window.location.search, stored, env: import.meta.env.VITE_PARCEL_TILES });
}

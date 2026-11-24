import { describe, it, expect, vi } from 'vitest';
import { LEGACY_PARCEL_SOURCE, candidateSource, isMissingParcelTile, isRetryableParcelTileError, defaultManifestUrl, loadParcelSource, manifestProblems, resolveParcelTilesMode, type ParcelTilesManifest } from './parcelTiles';

const manifest: ParcelTilesManifest = {
  schemaVersion: 1,
  release: '2026-11-24_regrid-2025-05-29_abc123',
  layer: 'parcels',
  tiles: ['https://okxrvetbzpoazrybhcqj.supabase.co/storage/v1/object/public/parcel-tiles/releases/2026-11-24_regrid-2025-05-29_abc123/{z}/{x}/{y}.pbf'],
  minzoom: 10,
  maxzoom: 17,
  bounds: [-87.06, 35.96, -86.51, 36.41],
  fields: ['ogc_fid', 'zoning', 'sqft'],
  idField: 'ogc_fid',
  attribution: 'Parcel data © Regrid',
};
const answer = (body: unknown, status = 200) => vi.fn(async () => ({ ok: status === 200, status, json: async () => body }) as unknown as Response);

describe('which parcel tiles the map reads', () => {
  it('reads the published release unless something asks for the live tiles', () => {
    expect(resolveParcelTilesMode({})).toBe('candidate');
    expect(resolveParcelTilesMode({ env: 'legacy' })).toBe('legacy');
    expect(resolveParcelTilesMode({ env: 'legacy', stored: 'candidate' })).toBe('candidate');
    expect(resolveParcelTilesMode({ search: '?parcelTiles=legacy', stored: 'candidate', env: 'candidate' })).toBe('legacy');
    expect(resolveParcelTilesMode({ search: '?parcelTiles=nonsense', env: 'garbage' })).toBe('candidate');
  });

  it('keeps the legacy source exactly as production has it', () => {
    expect(LEGACY_PARCEL_SOURCE).toMatchObject({
      tiles: ['https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}'],
      minzoom: 14, maxzoom: 17, promoteId: 'ogc_fid',
    });
    expect(defaultManifestUrl('https://okxrvetbzpoazrybhcqj.supabase.co/')).toBe('https://okxrvetbzpoazrybhcqj.supabase.co/storage/v1/object/public/parcel-tiles/manifest.json');
  });

  it('reads a good manifest into a source that starts at zoom 10 and states its coverage', async () => {
    const src = await loadParcelSource({ mode: 'candidate', manifestUrl: 'https://m', fetchImpl: answer(manifest) });
    expect(src).toMatchObject({ mode: 'candidate', minzoom: 10, maxzoom: 17, promoteId: 'ogc_fid', release: manifest.release, bounds: manifest.bounds, fallback: null });
    expect(candidateSource(manifest).tiles).toEqual(manifest.tiles);
  });

  it('does not fetch anything in legacy mode', async () => {
    const fetchImpl = answer(manifest);
    expect(await loadParcelSource({ mode: 'legacy', manifestUrl: 'https://m', fetchImpl })).toBe(LEGACY_PARCEL_SOURCE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the live tiles, and says why, when the manifest is missing, wrong or slow', async () => {
    expect((await loadParcelSource({ mode: 'candidate', manifestUrl: null })).fallback).toMatch(/no manifest address/);
    expect((await loadParcelSource({ mode: 'candidate', manifestUrl: 'https://m', fetchImpl: answer({}, 404) })).fallback).toMatch(/answered 404/);
    const bad = await loadParcelSource({ mode: 'candidate', manifestUrl: 'https://m', fetchImpl: answer({ ...manifest, layer: 'lots', idField: 'id' }) });
    expect(bad.mode).toBe('legacy');
    expect(bad.fallback).toMatch(/layer lots/);
    const thrown = vi.fn(async () => { throw new Error('network down'); });
    expect((await loadParcelSource({ mode: 'candidate', manifestUrl: 'https://m', fetchImpl: thrown as unknown as typeof fetch })).fallback).toMatch(/network down/);
    const slow = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    expect((await loadParcelSource({ mode: 'candidate', manifestUrl: 'https://m', fetchImpl: slow as unknown as typeof fetch, timeoutMs: 20 })).fallback).toMatch(/did not answer in time/);
  });

  it('names every reason a manifest cannot be trusted', () => {
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifestProblems(null)).toEqual(['the manifest is not an object']);
    const p = manifestProblems({ ...manifest, schemaVersion: 2, tiles: ['http://insecure/{z}/{x}/{y}'], minzoom: 18, bounds: [1, 2], fields: ['ogc_fid'] });
    expect(p.join('\n')).toMatch(/schema version 2/);
    expect(p.join('\n')).toMatch(/https URL templates/);
    expect(p.join('\n')).toMatch(/minzoom first/);
    expect(p.join('\n')).toMatch(/bounds/);
    expect(p.join('\n')).toMatch(/zoning and sqft/);
  });

  it('treats a missing release tile as empty, and nothing else', () => {
    const url = 'https://okxrvetbzpoazrybhcqj.supabase.co/storage/v1/object/public/parcel-tiles/releases/r/17/1/1.pbf';
    expect(isMissingParcelTile({ sourceId: 'parcels', error: { status: 400, url } })).toBe(true);
    expect(isMissingParcelTile({ sourceId: 'parcels', error: { status: 404, url } })).toBe(true);
    expect(isMissingParcelTile({ sourceId: 'parcels', error: { status: 500, url } })).toBe(false);
    expect(isMissingParcelTile({ sourceId: 'parcels', error: { status: 400, url: 'https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z=14' } })).toBe(false);
    expect(isMissingParcelTile({ sourceId: 'roads', error: { status: 400, url } })).toBe(false);
    expect(isMissingParcelTile(null)).toBe(false);
  });

  it('asks again for a parcel tile that failed with a server error, not for a refusal', () => {
    expect(isRetryableParcelTileError({ sourceId: 'parcels', error: { status: 503 } })).toBe(true);
    expect(isRetryableParcelTileError({ sourceId: 'parcels', error: { status: 544 } })).toBe(true);
    expect(isRetryableParcelTileError({ sourceId: 'parcels', error: { status: 429 } })).toBe(true);
    expect(isRetryableParcelTileError({ sourceId: 'parcels', error: { status: 400 } })).toBe(false);
    expect(isRetryableParcelTileError({ sourceId: 'roads', error: { status: 503 } })).toBe(false);
  });
});

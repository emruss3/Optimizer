import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, decodeTile, listTiles, loadConfig, percentiles, releaseId, tileBounds, tileKey, tippecanoeArgs, validateTiles } from './lib.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const fixture = name => fs.readFileSync(path.join(here, '__fixtures__', name));
const config = loadConfig();

// one tile laid out as tippecanoe writes a release: dir/z/x/y.pbf
function tileDir(buf, z = 17, x = 33930, y = 51412) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tiles-'));
  fs.mkdirSync(path.join(dir, String(z), String(x)), { recursive: true });
  fs.writeFileSync(path.join(dir, String(z), String(x), `${y}.pbf`), buf);
  return dir;
}
const onlyZ17 = { ...config, minzoom: 17, maxzoom: 17, baseZoom: 17 };

describe('the live tiles and the candidate, decoded (12 South, 17/33930/51412)', () => {
  it('the live tile carries ogc_fid in the feature header only, so promoteId finds nothing', () => {
    const L = decodeTile(fixture('legacy_17_33930_51412.pbf')).layers.parcels;
    expect(L.length).toBe(67);
    const f = L.feature(0);
    expect(typeof f.id).toBe('number');
    expect(f.properties.ogc_fid).toBeUndefined();
    expect(Object.keys(f.properties).sort()).toEqual(['sqft', 'zoning']);
  });

  it('the candidate carries the same 67 parcels with the same zoning and area, and ogc_fid both ways', () => {
    const live = decodeTile(fixture('legacy_17_33930_51412.pbf')).layers.parcels;
    const cand = decodeTile(fixture('candidate_17_33930_51412.pbf')).layers.parcels;
    const rows = L => new Map(Array.from({ length: L.length }, (_, i) => L.feature(i)).map(f => [Number(f.id), f.properties]));
    const a = rows(live), b = rows(cand);
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [id, p] of a) {
      expect(b.get(id).zoning).toBe(p.zoning);
      expect(b.get(id).sqft).toBe(p.sqft);
      expect(b.get(id).ogc_fid).toBe(id);
    }
  });
});

describe('validating a built release', () => {
  it('passes the candidate tile', () => {
    const check = validateTiles(tileDir(fixture('candidate_17_33930_51412.pbf')), onlyZ17);
    expect(check.problems).toEqual([]);
    expect(check.byZoom[17]).toMatchObject({ tiles: 1, features: 67 });
  });

  it('refuses a tile whose features lack ogc_fid as a property', () => {
    const check = validateTiles(tileDir(fixture('legacy_17_33930_51412.pbf')), onlyZ17);
    expect(check.problems.join('\n')).toMatch(/has id \d+ and ogc_fid undefined/);
  });

  it('refuses a tile over the byte limit, a missing zoom, and bytes that are not a tile', () => {
    expect(validateTiles(tileDir(fixture('candidate_17_33930_51412.pbf')), { ...onlyZ17, maxTileBytes: 1000 }).problems.join('\n')).toMatch(/over the 1000 limit/);
    expect(validateTiles(tileDir(fixture('candidate_17_33930_51412.pbf')), { ...onlyZ17, minzoom: 16, baseZoom: 16 }).problems).toContain('no tiles at zoom 16');
    expect(validateTiles(tileDir(Buffer.from('not a tile at all')), onlyZ17).problems.join('\n')).toMatch(/does not decode|layers/);
  });
});

describe('the build command and the manifest', () => {
  it('asks tippecanoe for the published fields only, every parcel from the base zoom, shared borders and no compression', () => {
    const args = tippecanoeArgs(config, 'in.geojsonl', 'out');
    const s = args.join(' ');
    expect(s).toContain('--layer parcels');
    expect(s).toContain('--minimum-zoom 10');
    expect(s).toContain('--maximum-zoom 17');
    expect(s).toContain('--base-zoom 12');
    expect(s).toContain('--include ogc_fid --include zoning --include sqft');
    expect(s).toContain('--detect-shared-borders');
    expect(s).toContain('--no-tile-compression');
    // the id comes from the GeoJSON feature id; --use-attribute-for-id would strip the property
    expect(s).not.toContain('--use-attribute-for-id');
    expect(args[args.length - 1]).toBe('in.geojsonl');
  });

  it('writes a manifest that points at the release prefix and states coverage', () => {
    const m = buildManifest({ config, release: '2026-11-24_r1', tilesBase: 'https://x.supabase.co/storage/v1/object/public/parcel-tiles/', bounds: [-87, 36, -86.5, 36.4] });
    expect(m.tiles).toEqual(['https://x.supabase.co/storage/v1/object/public/parcel-tiles/releases/2026-11-24_r1/{z}/{x}/{y}.pbf']);
    expect(m).toMatchObject({ layer: 'parcels', minzoom: 10, maxzoom: 17, idField: 'ogc_fid', fields: ['ogc_fid', 'zoning', 'sqft'] });
    expect(() => buildManifest({ config, release: 'r', tilesBase: 'https://x' })).toThrow();
    expect(tileKey(config, 'r1', 14, 4242, 6425)).toBe('releases/r1/14/4242/6425.pbf');
  });

  it('gives coverage bounds from the tiles and a release id safe in a key', () => {
    const dir = tileDir(fixture('candidate_17_33930_51412.pbf'));
    const [w, s, e, n] = tileBounds(listTiles(dir), 17);
    expect(w).toBeLessThan(-86.80); expect(e).toBeGreaterThan(-86.81);
    expect(s).toBeLessThan(36.13); expect(n).toBeGreaterThan(36.12);
    expect(releaseId({ date: '2026-11-24', dataVersion: 'Regrid 2025-05-29', build: 'ABC123' })).toBe('2026-11-24_regrid-2025-05-29_abc123');
  });

  it('reports p50 and p95 by nearest rank', () => {
    expect(percentiles([5, 1, 3, 2, 4, 100, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])).toEqual({ n: 20, p50: 10, p95: 19, max: 100 });
    expect(percentiles([])).toEqual({ n: 0, p50: null, p95: null, max: null });
  });
});

describe('how the tile scripts reach Supabase', async () => {
  const { brokerClient, clientFromEnv, githubToken } = await import('./broker.mjs');

  it('uses the broker with a GitHub token when no key is set, and the key directly when one is', () => {
    expect(clientFromEnv({ SUPABASE_URL: 'https://p.supabase.co', ACTIONS_ID_TOKEN_REQUEST_URL: 'u', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 't' }).mode).toBe('broker');
    expect(clientFromEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }).mode).toBe('direct');
    expect(() => clientFromEnv({})).toThrow(/SUPABASE_URL/);
  });

  it('asks GitHub for a token for the parcel-tiles audience and reuses it', async () => {
    const calls = [];
    const fetchImpl = async (u, init) => { calls.push([u, init.headers.Authorization]); return new Response(JSON.stringify({ value: 'jwt' })); };
    const token = githubToken({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://gh/token?x=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'req' }, fetchImpl);
    expect(await token()).toBe('jwt');
    expect(await token()).toBe('jwt');
    expect(calls).toEqual([['https://gh/token?x=1&audience=parcel-tiles', 'bearer req']]);
    await expect(githubToken({})()).rejects.toThrow(/id-token: write/);
  });

  it('sends every broker call with the token, and does not retry a refusal', async () => {
    const seen = [];
    const fetchImpl = async (u, init) => {
      seen.push({ u, method: init.method, auth: init.headers.Authorization });
      return u.includes('op=object') ? new Response('{"error":"no"}', { status: 401 }) : new Response('{"parcels":1}');
    };
    const c = brokerClient({ supabaseUrl: 'https://p.supabase.co/', token: async () => 'jwt', fetchImpl });
    expect(await c.snapshot()).toEqual({ parcels: 1 });
    await expect(c.put('manifest.json', '{}')).rejects.toThrow(/401/);
    expect(seen).toEqual([
      { u: 'https://p.supabase.co/functions/v1/parcel-tiles-ci?op=snapshot', method: 'GET', auth: 'Bearer jwt' },
      { u: 'https://p.supabase.co/functions/v1/parcel-tiles-ci?op=object&key=manifest.json', method: 'PUT', auth: 'Bearer jwt' },
    ]);
  });
});

describe('retrying storage under load', async () => {
  const { brokerClient } = await import('./broker.mjs');
  it('retries a lock timeout that storage reports as a 400, but not a plain refusal', async () => {
    let calls = 0;
    const lock = async () => (++calls < 2
      ? new Response('{"error":"storage answered 400: {\\"statusCode\\":\\"503\\",\\"error\\":\\"acquiring_lock_timeout\\"}"}', { status: 400 })
      : new Response('{"key":"k"}'));
    const c = brokerClient({ supabaseUrl: 'https://p', token: async () => 't', fetchImpl: lock });
    expect(await c.put('manifest.json', '{}')).toEqual({ key: 'k' });
    expect(calls).toBe(2);
    let refusals = 0;
    const refuse = async () => { refusals++; return new Response('{"error":"the key x is not a release tile"}', { status: 400 }); };
    await expect(brokerClient({ supabaseUrl: 'https://p', token: async () => 't', fetchImpl: refuse }).put('x', 'b')).rejects.toThrow(/400/);
    expect(refusals).toBe(1);
  }, 10_000);
});

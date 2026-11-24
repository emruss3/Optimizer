// parcel-tiles-ci: the only way the parcel-tiles workflow reaches the database
// and storage (docs/PARCEL_TILES.md, section 3).
//
// No key leaves Supabase. A workflow run proves who it is with a GitHub OIDC
// token, signed by GitHub, for the audience "parcel-tiles". Only a run of
// emruss3/Optimizer's parcel-tiles workflow on main, started by hand, is
// accepted (policy.ts). This function then uses the service key the Edge
// runtime already holds, for exactly these operations:
//
//   GET  ?op=snapshot                 fn_parcel_tile_snapshot()
//   GET  ?op=export&after=N&limit=N   one page of fn_parcel_tile_export
//   POST ?op=bucket                   create the public parcel-tiles bucket if missing
//   PUT  ?op=object&key=K             write one release tile, a release manifest,
//                                     or the live manifest.json
//
// It cannot delete, cannot write anywhere else, and cannot read anything but
// the export. Deployed with verify_jwt off: the GitHub token is the auth.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { AUDIENCE, BUCKET, ISSUER, JSON_TYPE, MAX_EXPORT_PAGE, MAX_OBJECT_BYTES, TILE_TYPE, claimsProblem, objectRule } from './policy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const service = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const tilesPrefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/releases/`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function caller(req: Request): Promise<{ run: string } | { problem: string }> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { problem: 'no GitHub OIDC token' };
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['RS256'] });
    const p = claimsProblem(payload as Record<string, unknown>);
    return p ? { problem: p } : { run: `${payload.run_id}/${payload.run_attempt} by ${payload.actor}` };
  } catch (e) {
    return { problem: `the token did not verify: ${(e as Error).message}` };
  }
}

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(`${fn} answered ${r.status}: ${text.slice(0, 300)}`), { status: r.status });
  return JSON.parse(text);
}

async function ensureBucket() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: service });
  if (r.ok) {
    const b = await r.json();
    return { bucket: BUCKET, public: b.public, created: false };
  }
  const c = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_OBJECT_BYTES, allowed_mime_types: [TILE_TYPE, JSON_TYPE] }),
  });
  if (!c.ok) throw new Error(`could not create the bucket: ${c.status} ${(await c.text()).slice(0, 200)}`);
  return { bucket: BUCKET, public: true, created: true };
}

function manifestProblem(bytes: Uint8Array): string | null {
  try {
    const m = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(m.tiles) || m.tiles.length !== 1) return 'the manifest needs exactly one tile URL';
    if (!String(m.tiles[0]).startsWith(tilesPrefix)) return `the manifest's tiles must live under ${tilesPrefix}`;
    if (typeof m.release !== 'string' || !String(m.tiles[0]).startsWith(`${tilesPrefix}${m.release}/`)) return 'the manifest points at another release than it names';
    return null;
  } catch {
    return 'the manifest is not JSON';
  }
}

async function putObject(key: string, req: Request) {
  const rule = objectRule(key);
  if ('problem' in rule) return json(400, { error: rule.problem });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_OBJECT_BYTES) return json(400, { error: `the object is ${bytes.length} bytes` });
  if (rule.contentType === JSON_TYPE) {
    const p = manifestProblem(bytes);
    if (p) return json(400, { error: p });
  }
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { ...service, 'Content-Type': rule.contentType, 'cache-control': rule.cacheControl, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!r.ok) return json(r.status >= 500 ? 502 : r.status, { error: `storage answered ${r.status}: ${(await r.text()).slice(0, 200)}` });
  return json(200, { key, bytes: bytes.length });
}

Deno.serve(async (req) => {
  const who = await caller(req);
  if ('problem' in who) return json(401, { error: who.problem });
  const url = new URL(req.url);
  const op = url.searchParams.get('op');
  try {
    if (op === 'snapshot' && req.method === 'GET') return json(200, await rpc('fn_parcel_tile_snapshot', {}));
    if (op === 'export' && req.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? '0');
      const limit = Number(url.searchParams.get('limit') ?? '2000');
      if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_EXPORT_PAGE) {
        return json(400, { error: 'after and limit must be whole numbers, limit 1 to 5000' });
      }
      const rows = await rpc('fn_parcel_tile_export', { p_after: after, p_limit: limit });
      return json(200, Array.isArray(rows) ? rows[0] ?? null : rows);
    }
    if (op === 'bucket' && req.method === 'POST') return json(200, await ensureBucket());
    if (op === 'object' && req.method === 'PUT') return await putObject(url.searchParams.get('key') ?? '', req);
    return json(400, { error: 'unknown operation' });
  } catch (e) {
    const status = (e as { status?: number }).status;
    return json(status && status < 500 ? status : 502, { error: (e as Error).message });
  }
});

// How the tile scripts reach the database and storage.
//
// In the parcel-tiles workflow: through the parcel-tiles-ci Edge Function,
// proving who we are with a GitHub OIDC token (the job needs
// `permissions: id-token: write`). No Supabase key is stored in GitHub.
//
// By hand, with SUPABASE_SERVICE_ROLE_KEY set: directly, as before.
//
// Both expose the same four calls: snapshot, exportPage, ensureBucket, put.

const AUDIENCE = 'parcel-tiles';
const BUCKET = 'parcel-tiles';

async function retry(fn, label, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= attempts || e.permanent) throw new Error(`${label}: ${e.message}`);
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function check(r, label) {
  if (r.ok) return r;
  const text = (await r.text()).slice(0, 300);
  const err = new Error(`${label} answered ${r.status}: ${text}`);
  err.permanent = r.status >= 400 && r.status < 500 && r.status !== 429;
  throw err;
}

/** A GitHub OIDC token, fetched again when it is more than four minutes old. */
export function githubToken(env = process.env, fetchImpl = fetch) {
  let cached = null, at = 0;
  return async () => {
    if (cached && Date.now() - at < 4 * 60_000) return cached;
    const url = env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!url || !bearer) throw new Error('no GitHub OIDC token: the job needs permissions: id-token: write');
    const r = await check(await fetchImpl(`${url}&audience=${AUDIENCE}`, { headers: { Authorization: `bearer ${bearer}` } }), 'GitHub OIDC');
    cached = (await r.json()).value; at = Date.now();
    return cached;
  };
}

export function brokerClient({ supabaseUrl, token, fetchImpl = fetch }) {
  const base = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/parcel-tiles-ci`;
  const call = async (method, query, body, headers = {}) => retry(async () => {
    const r = await check(await fetchImpl(`${base}?${new URLSearchParams(query)}`, {
      method, body, headers: { Authorization: `Bearer ${await token()}`, ...headers },
    }), `parcel-tiles-ci ${query.op}`);
    return r.json();
  }, `parcel-tiles-ci ${query.op}`);
  return {
    mode: 'broker',
    snapshot: () => call('GET', { op: 'snapshot' }),
    exportPage: (after, limit) => call('GET', { op: 'export', after: String(after), limit: String(limit) }),
    ensureBucket: () => call('POST', { op: 'bucket' }),
    // the broker sets the content type and cache header from the key
    put: (key, body) => call('PUT', { op: 'object', key }, body, { 'Content-Type': 'application/octet-stream' }),
  };
}

export function directClient({ supabaseUrl, key, fetchImpl = fetch }) {
  const url = supabaseUrl.replace(/\/$/, '');
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  const rpc = (fn, body) => retry(async () => {
    const r = await check(await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    }), fn);
    return r.json();
  }, fn);
  const typeFor = k => (k.endsWith('.pbf') ? 'application/vnd.mapbox-vector-tile' : 'application/json');
  const cacheFor = k => (k === 'manifest.json' ? 'public, max-age=60' : 'public, max-age=31536000, immutable');
  return {
    mode: 'direct',
    snapshot: () => rpc('fn_parcel_tile_snapshot', {}),
    exportPage: async (after, limit) => {
      const rows = await rpc('fn_parcel_tile_export_page', { p_after: after, p_limit: limit });
      return Array.isArray(rows) ? rows[0] ?? null : rows;
    },
    ensureBucket: async () => {
      const r = await fetchImpl(`${url}/storage/v1/bucket/${BUCKET}`, { headers: auth });
      if (r.ok) { const b = await r.json(); return { bucket: BUCKET, public: b.public, created: false }; }
      await check(await fetchImpl(`${url}/storage/v1/bucket`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 1_000_000, allowed_mime_types: ['application/vnd.mapbox-vector-tile', 'application/json'] }),
      }), 'create bucket');
      return { bucket: BUCKET, public: true, created: true };
    },
    put: (k, body) => retry(async () => {
      await check(await fetchImpl(`${url}/storage/v1/object/${BUCKET}/${k}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': typeFor(k), 'cache-control': cacheFor(k), 'x-upsert': 'true' }, body,
      }), `upload ${k}`);
      return { key: k };
    }, `upload ${k}`),
  };
}

/** The client for this run: direct with a key, else the broker with GitHub's token. */
export function clientFromEnv(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
  if (env.SUPABASE_SERVICE_ROLE_KEY) return directClient({ supabaseUrl, key: env.SUPABASE_SERVICE_ROLE_KEY });
  return brokerClient({ supabaseUrl, token: githubToken(env) });
}

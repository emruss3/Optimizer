#!/usr/bin/env node
// Export the parcel snapshot for one tile build, page by page.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/parcel-tiles/export.mjs --out parcels.geojsonl
//
// Reads through fn_parcel_tile_export (service_role only). Takes the snapshot
// figures before and after; if the data changed while it was read, it stops and
// writes nothing usable, so a release is never built from two imports at once.
import fs from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const out = arg('out', 'parcels.geojsonl');
const pageSize = Number(arg('page', '2000'));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

async function rpc(fn, body, attempt = 1) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) return r.json();
  const text = await r.text();
  if (attempt < 5 && (r.status === 429 || r.status >= 500)) {
    await new Promise(res => setTimeout(res, 2000 * attempt));
    return rpc(fn, body, attempt + 1);
  }
  throw new Error(`${fn} ${r.status}: ${text.slice(0, 300)}`);
}

const before = await rpc('fn_parcel_tile_snapshot', {});
console.log('snapshot before:', JSON.stringify(before));

const tmp = `${out}.partial`;
const fd = fs.openSync(tmp, 'w');
let after = 0, features = 0, pages = 0;
const t0 = Date.now();
for (;;) {
  const rows = await rpc('fn_parcel_tile_export', { p_after: after, p_limit: pageSize });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || row.last_ogc_fid == null) break;
  if (row.body) fs.writeSync(fd, row.body + '\n');
  features += row.features;
  pages += 1;
  after = row.last_ogc_fid;
  if (pages % 20 === 0) console.log(`  ${features} features through ogc_fid ${after}, ${Math.round((Date.now() - t0) / 1000)} s`);
}
fs.closeSync(fd);

const end = await rpc('fn_parcel_tile_snapshot', {});
const same = ['parcels', 'max_ogc_fid', 'data_updated_at'].every(k => JSON.stringify(before[k]) === JSON.stringify(end[k]));
if (!same) {
  console.error('the parcel data changed during the export; nothing was written');
  console.error('before:', JSON.stringify(before));
  console.error('after: ', JSON.stringify(end));
  fs.rmSync(tmp, { force: true });
  process.exit(1);
}
fs.renameSync(tmp, out);
const snapshot = { ...before, exported_features: features, pages, export_ms: Date.now() - t0 };
fs.writeFileSync(`${out}.snapshot.json`, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`exported ${features} features in ${pages} pages, ${Math.round((Date.now() - t0) / 1000)} s`);
if (features < before.parcels) console.warn(`${before.parcels - features} parcels had no usable polygon and were left out`);

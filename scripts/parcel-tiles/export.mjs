#!/usr/bin/env node
// Export the parcel snapshot for one tile build, page by page.
//
//   SUPABASE_URL=... node scripts/parcel-tiles/export.mjs --out parcels.geojsonl
//
// In the workflow it reads through the parcel-tiles-ci Edge Function with a
// GitHub OIDC token; by hand, set SUPABASE_SERVICE_ROLE_KEY (broker.mjs).
// Either way the rows come from fn_parcel_tile_export (service_role only). Takes the snapshot
// figures before and after; if the data changed while it was read, it stops and
// writes nothing usable, so a release is never built from two imports at once.
import fs from 'node:fs';
import { clientFromEnv } from './broker.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const out = arg('out', 'parcels.geojsonl');
const pageSize = Number(arg('page', '2000'));
const client = clientFromEnv();
console.log(`reading through ${client.mode === 'broker' ? 'the parcel-tiles-ci broker' : 'PostgREST with a service key'}`);

// The snapshot is cheap: the highest ogc_fid and the table's running count of
// inserts, updates and deletes. If either moves while we read, the export is
// refused. The data date and the counties come from the pages themselves.
const before = await client.snapshot();
console.log('snapshot before:', JSON.stringify(before));

const tmp = `${out}.partial`;
const fd = fs.openSync(tmp, 'w');
let after = 0, features = 0, rowsRead = 0, pages = 0, maxUpdated = null;
const geoids = new Set();
const t0 = Date.now();
for (;;) {
  const row = await client.exportPage(after, pageSize);
  if (!row || row.last_ogc_fid == null) break;
  if (row.body) fs.writeSync(fd, row.body + '\n');
  features += row.features;
  rowsRead += row.rows_read ?? row.features;
  if (row.max_updated && (!maxUpdated || row.max_updated > maxUpdated)) maxUpdated = row.max_updated;
  for (const g of row.geoids ?? []) geoids.add(g);
  pages += 1;
  after = row.last_ogc_fid;
  if (pages % 20 === 0) console.log(`  ${features} features through ogc_fid ${after}, ${Math.round((Date.now() - t0) / 1000)} s`);
}
fs.closeSync(fd);

const end = await client.snapshot();
const same = ['max_ogc_fid', 'writes'].every(k => JSON.stringify(before[k]) === JSON.stringify(end[k]));
if (!same) {
  console.error('the parcel data changed during the export; nothing was written');
  console.error('before:', JSON.stringify(before));
  console.error('after: ', JSON.stringify(end));
  fs.rmSync(tmp, { force: true });
  process.exit(1);
}
fs.renameSync(tmp, out);
const snapshot = {
  ...before,
  parcels: rowsRead,
  data_updated_at: maxUpdated,
  geoids: [...geoids].sort(),
  exported_features: features,
  pages,
  export_ms: Date.now() - t0,
};
fs.writeFileSync(`${out}.snapshot.json`, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`exported ${features} features from ${rowsRead} parcels in ${pages} pages, ${Math.round((Date.now() - t0) / 1000)} s; data up to ${maxUpdated}; counties ${[...geoids].join(', ')}`);
if (features < rowsRead) console.warn(`${rowsRead - features} parcels had no usable polygon and were left out`);

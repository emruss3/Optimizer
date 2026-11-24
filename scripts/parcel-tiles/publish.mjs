#!/usr/bin/env node
// Publish a built release of parcel tiles to Supabase Storage, then make it live.
//
//   SUPABASE_URL=... node scripts/parcel-tiles/publish.mjs --build build/ --confirm-public
//   (writes through the parcel-tiles-ci broker in the workflow, or directly with
//   SUPABASE_SERVICE_ROLE_KEY by hand; see broker.mjs)
//   ... publish.mjs --rollback <release>      make an earlier release live again
//
// Order matters and is the point of this script:
//   1. upload every tile under releases/<release>/ (immutable, new prefix);
//   2. upload that release's own manifest copy beside its tiles;
//   3. read a sample of tiles back through the public URL the map will use;
//   4. only then rewrite the single live manifest.json.
// Until step 4 the map keeps reading the previous release. Nothing is deleted:
// the previous release's tiles stay, so a rollback is step 4 pointed back.
import fs from 'node:fs';
import path from 'node:path';
import { listTiles, loadConfig, tileKey } from './lib.mjs';
import { clientFromEnv } from './broker.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const has = name => process.argv.includes(`--${name}`);

const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const client = clientFromEnv();
const config = loadConfig();
const publicUrl = k => `${url}/storage/v1/object/public/${config.bucket}/${k}`;

// the client sets each object's content type and cache header from its key:
// release objects immutable for a year, manifest.json for 60 s
const put = (k, body) => client.put(k, body);

async function ensureBucket() {
  if (!has('confirm-public')) {
    throw new Error(`publishing makes the tiles public; rerun with --confirm-public (docs/PARCEL_TILES.md section 5, decision 1)`);
  }
  const b = await client.ensureBucket();
  if (!b.public) throw new Error(`bucket ${config.bucket} exists but is not public; the map cannot read it`);
  if (b.created) console.log(`created public bucket ${config.bucket}`);
}

async function makeLive(manifest) {
  await put(config.manifestKey, JSON.stringify(manifest, null, 2));
  const check = await fetch(`${publicUrl(config.manifestKey)}?v=${Date.now()}`);
  const live = check.ok ? await check.json() : null;
  if (live?.release !== manifest.release) throw new Error(`the live manifest reads ${live?.release ?? 'nothing'}, expected ${manifest.release}`);
  console.log(`live release is now ${manifest.release}`);
}

if (arg('rollback')) {
  const release = arg('rollback');
  const r = await fetch(publicUrl(`${config.releasePrefix}/${release}/manifest.json`));
  if (!r.ok) { console.error(`no manifest for release ${release} (${r.status})`); process.exit(1); }
  await makeLive(await r.json());
  process.exit(0);
}

const buildDir = arg('build', 'build');
const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'manifest.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(buildDir, 'report.json'), 'utf8'));
if (report.problems?.length) { console.error('the build reported problems; refusing to publish'); process.exit(1); }
const release = manifest.release;
const tiles = listTiles(path.join(buildDir, 'tiles'));

await ensureBucket();

const concurrency = Number(arg('concurrency', '16'));
const t0 = Date.now();
let done = 0, bytes = 0;
const queue = [...tiles];
await Promise.all(Array.from({ length: concurrency }, async () => {
  for (let t = queue.shift(); t; t = queue.shift()) {
    const body = fs.readFileSync(t.file);
    await put(tileKey(config, release, t.z, t.x, t.y), body);
    done += 1; bytes += body.length;
    if (done % 2000 === 0) console.log(`  ${done}/${tiles.length} tiles, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}));
console.log(`uploaded ${done} tiles, ${(bytes / 1e6).toFixed(1)} MB, in ${Math.round((Date.now() - t0) / 1000)} s`);

await put(`${config.releasePrefix}/${release}/manifest.json`, JSON.stringify(manifest, null, 2));

// read back through the public URL: every zoom, then a random sample
const sample = [];
for (let z = config.minzoom; z <= config.maxzoom; z++) { const at = tiles.filter(t => t.z === z); if (at.length) sample.push(at[Math.floor(at.length / 2)]); }
for (let i = 0; i < 40 && tiles.length; i++) sample.push(tiles[Math.floor(Math.random() * tiles.length)]);
for (const t of sample) {
  const r = await fetch(publicUrl(tileKey(config, release, t.z, t.x, t.y)));
  const got = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  const want = fs.readFileSync(t.file);
  if (!got || !got.equals(want)) { console.error(`read-back failed for ${t.z}/${t.x}/${t.y}: ${r.status}`); process.exit(1); }
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('vnd.mapbox-vector-tile')) { console.error(`${t.z}/${t.x}/${t.y} is served as ${type}`); process.exit(1); }
}
console.log(`read back ${sample.length} tiles through the public URL`);

await makeLive(manifest);

#!/usr/bin/env node
// Publish a built release of parcel tiles to Supabase Storage, then make it live.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/parcel-tiles/publish.mjs --build build/ --confirm-public
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

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const has = name => process.argv.includes(`--${name}`);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
const config = loadConfig();
const auth = { apikey: key, Authorization: `Bearer ${key}` };
const objectUrl = k => `${url}/storage/v1/object/${config.bucket}/${k}`;
const publicUrl = k => `${url}/storage/v1/object/public/${config.bucket}/${k}`;

async function retry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= 5) throw new Error(`${label}: ${e.message}`);
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

async function put(k, body, contentType, cacheControl) {
  return retry(async () => {
    const r = await fetch(objectUrl(k), {
      method: 'POST',
      headers: { ...auth, 'Content-Type': contentType, 'cache-control': cacheControl, 'x-upsert': 'true' },
      body,
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  }, `upload ${k}`);
}

async function ensureBucket() {
  const r = await fetch(`${url}/storage/v1/bucket/${config.bucket}`, { headers: auth });
  if (r.ok) {
    const b = await r.json();
    if (!b.public) throw new Error(`bucket ${config.bucket} exists but is not public; the map cannot read it`);
    return;
  }
  if (!has('confirm-public')) {
    throw new Error(`bucket ${config.bucket} does not exist. Creating it makes the tiles public: rerun with --confirm-public once the owner has confirmed the data licence allows it`);
  }
  const c = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: config.bucket, name: config.bucket, public: true, file_size_limit: config.maxTileBytes * 2, allowed_mime_types: ['application/vnd.mapbox-vector-tile', 'application/json'] }),
  });
  if (!c.ok) throw new Error(`could not create bucket: ${c.status} ${(await c.text()).slice(0, 200)}`);
  console.log(`created public bucket ${config.bucket}`);
}

async function makeLive(manifest) {
  await put(config.manifestKey, JSON.stringify(manifest, null, 2), 'application/json', 'public, max-age=60');
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
    await put(tileKey(config, release, t.z, t.x, t.y), body, 'application/vnd.mapbox-vector-tile', 'public, max-age=31536000, immutable');
    done += 1; bytes += body.length;
    if (done % 2000 === 0) console.log(`  ${done}/${tiles.length} tiles, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}));
console.log(`uploaded ${done} tiles, ${(bytes / 1e6).toFixed(1)} MB, in ${Math.round((Date.now() - t0) / 1000)} s`);

await put(`${config.releasePrefix}/${release}/manifest.json`, JSON.stringify(manifest, null, 2), 'application/json', 'public, max-age=31536000, immutable');

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

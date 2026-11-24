#!/usr/bin/env node
// Build one release of parcel tiles from an exported snapshot.
//
//   node scripts/parcel-tiles/build.mjs --input parcels.geojsonl --out build/ \
//     --release 2026-11-24_regrid-2025-05-29_abc1234 --tiles-base https://<project>.supabase.co/storage/v1/object/public/parcel-tiles
//
// Writes build/tiles/{z}/{x}/{y}.pbf, build/manifest.json and build/report.json.
// Exits non-zero if the tiles fail validation: a failed build is never published.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildManifest, listTiles, loadConfig, tileBounds, tippecanoeArgs, validateTiles } from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

const input = arg('input');
const out = arg('out', 'build');
const release = arg('release');
const tilesBase = arg('tiles-base');
const snapshotFile = arg('snapshot');
if (!input || !release || !tilesBase) {
  console.error('usage: build.mjs --input <geojsonl> --release <id> --tiles-base <url> [--out dir] [--snapshot snapshot.json]');
  process.exit(2);
}

const config = loadConfig();
const tilesDir = path.join(out, 'tiles');
fs.mkdirSync(out, { recursive: true });

const t0 = Date.now();
const run = spawnSync('tippecanoe', tippecanoeArgs(config, input, tilesDir), { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stderr);
  console.error(`tippecanoe failed with status ${run.status}`);
  process.exit(1);
}
const buildMs = Date.now() - t0;

const check = validateTiles(tilesDir, config);
const tiles = listTiles(tilesDir);
// the finest zoom gives the tightest coverage: the map requests no tile outside it
const bounds = tileBounds(tiles, config.maxzoom);
const snapshot = snapshotFile ? JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) : null;
const stats = { tiles: check.tiles, buildMs, byZoom: check.byZoom, tippecanoeWarnings: (run.stderr || '').split('\n').filter(Boolean).slice(0, 50) };
const manifest = buildManifest({ config, release, tilesBase, bounds, snapshot, stats });

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ release, input, ...stats, problems: check.problems }, null, 2) + '\n');

console.log(`release ${release}: ${check.tiles} tiles in ${Math.round(buildMs / 1000)} s`);
for (const [z, s] of Object.entries(check.byZoom)) {
  console.log(`  z${z}: ${s.tiles} tiles, ${(s.bytes / 1e6).toFixed(1)} MB, largest ${(s.maxBytes / 1e3).toFixed(0)} KB, most features ${s.maxFeatures}`);
}
if (check.problems.length) {
  console.error(`${check.problems.length} problem(s):`);
  for (const p of check.problems.slice(0, 40)) console.error(`  ${p}`);
  process.exit(1);
}

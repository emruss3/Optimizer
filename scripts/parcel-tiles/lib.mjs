// Parcel vector tiles: the parts of the build that are pure and testable.
//
// One release of tiles is built once from a snapshot of the licensed parcel
// data, published under its own prefix, and made live by rewriting a single
// manifest. The map reads the manifest and then reads tiles; it never asks the
// database to make a tile. See docs/PARCEL_TILES.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// this file's folder; under the test runner import.meta.url is not always a file: URL
const HERE = (() => {
  try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return path.resolve('scripts/parcel-tiles'); }
})();
const require = createRequire(path.join(HERE, 'lib.mjs'));

export function loadConfig(file = path.join(HERE, 'config.json')) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['layer', 'minzoom', 'maxzoom', 'baseZoom', 'fields', 'idField', 'bucket', 'releasePrefix', 'manifestKey']) {
    if (config[k] == null) throw new Error(`config is missing ${k}`);
  }
  if (!config.fields.includes(config.idField)) throw new Error('the id field must also be a published field');
  if (config.minzoom > config.baseZoom || config.baseZoom > config.maxzoom) throw new Error('zooms must satisfy minzoom <= baseZoom <= maxzoom');
  return config;
}

/**
 * The tippecanoe command for one build.
 *
 * - The feature id comes from the GeoJSON feature `id` (the export writes
 *   ogc_fid there) and ogc_fid also stays a property, so Mapbox's promoteId and
 *   the click handler both find it. With --use-attribute-for-id tippecanoe
 *   strips the property, which is what the live tiles do today.
 * - Every parcel is kept from the base zoom up; below it tippecanoe may drop the
 *   smallest features to stay under the tile byte limit.
 * - Shared borders are simplified once, so neighbouring lots do not open gaps.
 * - Tiles are written uncompressed: storage serves them as they are and Mapbox
 *   cannot read a gzipped tile without a Content-Encoding header.
 */
export function tippecanoeArgs(config, input, outDir) {
  return [
    '--quiet',
    '--force',
    '--output-to-directory', outDir,
    '--layer', config.layer,
    '--minimum-zoom', String(config.minzoom),
    '--maximum-zoom', String(config.maxzoom),
    '--base-zoom', String(config.baseZoom),
    ...config.fields.flatMap(f => ['--include', f]),
    '--detect-shared-borders',
    '--drop-smallest-as-needed',
    '--maximum-tile-bytes', String(config.maxTileBytes),
    '--maximum-tile-features', String(config.maxTileFeatures),
    '--no-tile-compression',
    '--no-tile-stats',
    input,
  ];
}

/** Every z/x/y.pbf under a tippecanoe output directory. */
export function listTiles(dir) {
  const out = [];
  for (const z of fs.readdirSync(dir)) {
    const zd = path.join(dir, z);
    if (!/^\d+$/.test(z) || !fs.statSync(zd).isDirectory()) continue;
    for (const x of fs.readdirSync(zd)) {
      const xd = path.join(zd, x);
      if (!/^\d+$/.test(x)) continue;
      for (const f of fs.readdirSync(xd)) {
        const m = /^(\d+)\.pbf$/.exec(f);
        if (m) out.push({ z: +z, x: +x, y: +m[1], file: path.join(xd, f) });
      }
    }
  }
  return out.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

export function decodeTile(buf) {
  const { VectorTile } = require('@mapbox/vector-tile');
  const Pbf = require('pbf');
  const P = Pbf.default ?? Pbf;
  return new VectorTile(new P(buf));
}

/**
 * Check a built tile set before it can be published. A tile set that fails is
 * never uploaded. Returns per-zoom counts and every problem found.
 */
export function validateTiles(dir, config) {
  const tiles = listTiles(dir);
  const problems = [];
  const byZoom = {};
  for (const t of tiles) {
    const buf = fs.readFileSync(t.file);
    const zs = (byZoom[t.z] ??= { tiles: 0, bytes: 0, maxBytes: 0, features: 0, maxFeatures: 0 });
    zs.tiles += 1; zs.bytes += buf.length; zs.maxBytes = Math.max(zs.maxBytes, buf.length);
    if (buf.length > config.maxTileBytes) problems.push(`${t.z}/${t.x}/${t.y}: ${buf.length} bytes, over the ${config.maxTileBytes} limit`);
    let vt;
    try { vt = decodeTile(buf); } catch (e) { problems.push(`${t.z}/${t.x}/${t.y}: does not decode (${e.message})`); continue; }
    const names = Object.keys(vt.layers);
    if (names.length !== 1 || names[0] !== config.layer) { problems.push(`${t.z}/${t.x}/${t.y}: layers ${JSON.stringify(names)}, expected ["${config.layer}"]`); continue; }
    const L = vt.layers[config.layer];
    zs.features += L.length; zs.maxFeatures = Math.max(zs.maxFeatures, L.length);
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i);
      const id = f.properties[config.idField];
      // the header id and the property must name the same parcel, or a click and a highlight disagree
      if (f.id == null || id == null || Number(f.id) !== Number(id)) { problems.push(`${t.z}/${t.x}/${t.y}: feature ${i} has id ${f.id} and ${config.idField} ${id}`); break; }
      const extra = Object.keys(f.properties).filter(k => !config.fields.includes(k));
      if (extra.length) { problems.push(`${t.z}/${t.x}/${t.y}: unexpected fields ${extra.join(', ')}`); break; }
    }
  }
  for (let z = config.minzoom; z <= config.maxzoom; z++) if (!byZoom[z]) problems.push(`no tiles at zoom ${z}`);
  return { tiles: tiles.length, byZoom, problems };
}

/** Bounds [w, s, e, n] in degrees of the tiles at one zoom: the coverage the map is told about. */
export function tileBounds(tiles, z) {
  const at = tiles.filter(t => t.z === z);
  if (!at.length) return null;
  const n = 2 ** z;
  const lon = x => (x / n) * 360 - 180;
  const lat = y => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const xs = at.map(t => t.x), ys = at.map(t => t.y);
  const r = v => Math.round(v * 1e5) / 1e5;
  return [r(lon(Math.min(...xs))), r(lat(Math.max(...ys) + 1)), r(lon(Math.max(...xs) + 1)), r(lat(Math.min(...ys)))];
}

/** A release id: date, data version and a short build hash, safe in an object key. */
export function releaseId({ date, dataVersion, build }) {
  const clean = s => String(s).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
  return [clean(date), clean(dataVersion), clean(build)].filter(Boolean).join('_');
}

export function tileKey(config, release, z, x, y) {
  return `${config.releasePrefix}/${release}/${z}/${x}/${y}.pbf`;
}

/**
 * The one file the map reads first. Switching releases is a rewrite of this
 * file only; the tiles of the previous release stay where they are, so a
 * rollback is the same rewrite pointing back.
 */
export function buildManifest({ config, release, tilesBase, bounds, snapshot, stats, builtAt }) {
  if (!release || !tilesBase || !bounds) throw new Error('a manifest needs a release, a tiles base URL and bounds');
  return {
    schemaVersion: config.schemaVersion ?? 1,
    release,
    layer: config.layer,
    tiles: [`${tilesBase.replace(/\/+$/, '')}/${config.releasePrefix}/${release}/{z}/{x}/{y}.pbf`],
    minzoom: config.minzoom,
    maxzoom: config.maxzoom,
    bounds,
    fields: config.fields,
    idField: config.idField,
    attribution: config.attribution,
    markets: config.markets.map(m => ({ id: m.id, name: m.name })),
    snapshot: snapshot ?? null,
    stats: stats ?? null,
    builtAt: builtAt ?? new Date().toISOString(),
  };
}

/** p50 and p95 of a list of numbers, nearest-rank. */
export function percentiles(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, p50: null, p95: null, max: null };
  const at = p => v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
  return { n: v.length, p50: at(50), p95: at(95), max: v[v.length - 1] };
}

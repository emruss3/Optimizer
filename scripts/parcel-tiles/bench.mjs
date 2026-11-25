#!/usr/bin/env node
// Tile delivery benchmark: the live edge/database tiles against a published release.
//
//   node scripts/parcel-tiles/bench.mjs --samples 50 --out bench.json
//   node scripts/parcel-tiles/bench.mjs --samples 50 --manifest https://.../parcel-tiles/manifest.json
//
// What it measures, and what it does not: the time for one HTTP client to get
// each fixture tile, from wherever this runs. It is not a browser number: it
// does not include drawing, and a CI runner's network is not a phone's. It is
// the tile half of the comparison, run the same way against both sources,
// interleaved request by request so neither gets a warmer cache or a quieter
// minute. Each response is decoded and its features counted, so an empty 200 or
// a 204 is reported as what it is, not as a fast tile.
import fs from 'node:fs';
import { decodeTile, percentiles } from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const samples = Number(arg('samples', '20'));
const out = arg('out', 'bench.json');
const legacyTemplate = arg('legacy', 'https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}');
const manifestUrl = arg('manifest');
const timeoutMs = Number(arg('timeout', '60000'));
const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')); // run as a script, so import.meta.url is a file: URL

const sources = [{ name: 'legacy', template: legacyTemplate, minzoom: 14, maxzoom: 17 }];
if (manifestUrl) {
  const m = await (await fetch(manifestUrl)).json();
  sources.push({ name: `candidate:${m.release}`, template: m.tiles[0], minzoom: m.minzoom, maxzoom: m.maxzoom });
}

async function fetchTile(template, t) {
  const u = template.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' });
    const headersMs = performance.now() - t0;
    const buf = Buffer.from(await r.arrayBuffer());
    const totalMs = performance.now() - t0;
    let features = null, decodeError = null;
    if (r.status === 200 && buf.length) {
      try { const L = decodeTile(buf).layers.parcels; features = L ? L.length : 0; } catch (e) { decodeError = e.message; }
    } else if (r.status === 204 || buf.length === 0) features = 0;
    return {
      status: r.status, headersMs: Math.round(headersMs), totalMs: Math.round(totalMs), bytes: buf.length, features, decodeError,
      cache: r.headers.get('cf-cache-status') ?? r.headers.get('x-cache') ?? null,
      cacheControl: r.headers.get('cache-control'),
    };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : e.message, totalMs: Math.round(performance.now() - t0) };
  } finally { clearTimeout(timer); }
}

const raw = [];
const startedAt = new Date().toISOString();
for (let round = 0; round < samples; round++) {
  for (const t of fixtures.tiles) {
    // alternate which source goes first, so neither always follows a warm-up
    const order = round % 2 ? [...sources].reverse() : sources;
    for (const s of order) {
      if (t.z < s.minzoom || t.z > s.maxzoom) { raw.push({ round, source: s.name, tile: `${t.z}/${t.x}/${t.y}`, skipped: 'outside the source zoom range' }); continue; }
      raw.push({ round, source: s.name, tile: `${t.z}/${t.x}/${t.y}`, label: t.label, ...(await fetchTile(s.template, t)) });
    }
  }
  console.log(`round ${round + 1}/${samples}`);
}

const summary = {};
for (const r of raw) {
  if (r.skipped) continue;
  const k = `${r.source} ${r.tile}`;
  (summary[k] ??= { source: r.source, tile: r.tile, label: r.label, ms: [], statuses: {}, features: new Set(), errors: 0 });
  summary[k].ms.push(r.totalMs);
  summary[k].statuses[r.status] = (summary[k].statuses[r.status] ?? 0) + 1;
  if (r.features != null) summary[k].features.add(r.features);
  if (r.error || r.decodeError) summary[k].errors += 1;
}
const rows = Object.values(summary).map(s => ({ source: s.source, tile: s.tile, label: s.label, ...percentiles(s.ms), statuses: s.statuses, featureCounts: [...s.features], errors: s.errors }));

fs.writeFileSync(out, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), samples, runner: process.env.RUNNER_NAME ?? null, sources, rows, raw }, null, 2) + '\n');
for (const r of rows) console.log(`${r.source.padEnd(28)} ${r.tile.padEnd(18)} p50 ${String(r.p50).padStart(6)} ms  p95 ${String(r.p95).padStart(6)} ms  features ${r.featureCounts.join('/')}  statuses ${JSON.stringify(r.statuses)}`);

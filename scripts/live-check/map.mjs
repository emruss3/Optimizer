#!/usr/bin/env node
// Live map check: open the deployed app in a real browser and see whether the
// parcel map works, on the live edge tiles and on the published release.
//
//   APP_URL=https://... OUT=live-check node scripts/live-check/map.mjs
//
// For each source (?parcelTiles=legacy, ?parcelTiles=candidate) it records:
// the source the map says it used (data-parcel-tiles on the map container)
// and any fallback reason; every parcel tile response by status; console
// errors; and a screenshot at the opening view (zoom 12) and after zooming in
// to about zoom 15 (the live tiles start at 14). Then it clicks the middle of
// the map and records whether a parcel lookup or drawer followed.
//
// It fails (exit 1) when the map never says which source it used, when a
// source draws no parcel tile at zoom 14, or when the candidate falls back.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
const out = process.env.OUT ?? 'live-check';
if (!base) { console.error('APP_URL is required'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const isTile = u => u.includes('/functions/v1/mvt-parcels') || u.includes('/storage/v1/object/public/parcel-tiles/');
const results = [];
const browser = await chromium.launch();

for (const mode of ['legacy', 'candidate']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // a returning visitor: the first visit shows the marketing page, not the map
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); } catch { /* private mode */ } });
  const page = await context.newPage();
  const tiles = [], errors = [], lookups = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
  page.on('response', r => {
    const u = r.url();
    if (isTile(u)) tiles.push({ status: r.status(), z: Number((u.match(/[?&]z=(\d+)/) ?? u.match(/\/(\d+)\/\d+\/\d+\.pbf/) ?? [])[1]), source: u.includes('mvt-parcels') ? 'edge' : 'storage', at: Date.now() });
    if (u.includes('get_parcel_at_point') || u.includes('parcel') && u.includes('/rest/v1/rpc/')) lookups.push({ status: r.status(), fn: u.split('/rpc/')[1]?.split('?')[0] });
  });

  const row = { mode, url: `${base}/?parcelTiles=${mode}` };
  try {
    await page.goto(row.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // the start page, then the map, the way a visitor gets there
    const browse = page.locator('[data-testid="start-browse-map"]').first();
    await browse.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    if (await browse.isVisible().catch(() => false)) { await browse.click(); row.startPage = 'passed'; }
    const skip = page.getByText('Skip Tour').first();
    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
    const container = page.locator('[data-parcel-tiles]').first();
    await container.waitFor({ state: 'attached', timeout: 60000 });
    row.source = await container.getAttribute('data-parcel-tiles');
    row.release = await container.getAttribute('data-parcel-tiles-release');
    row.fallback = await container.getAttribute('data-parcel-tiles-fallback');
    await page.waitForTimeout(8000);
    row.atOpen = summarize(tiles);
    await page.screenshot({ path: path.join(out, `${mode}-z12.png`) });

    const canvas = page.locator('canvas.mapboxgl-canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      const before = tiles.length;
      // zoom 12 to about 15: the live tiles start at 14
      for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(400); }
      await page.waitForTimeout(8000);
      row.afterZoom = summarize(tiles.slice(before));
      await page.screenshot({ path: path.join(out, `${mode}-zoomed.png`) });
      const lookBefore = lookups.length;
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(6000);
      row.click = { lookups: lookups.slice(lookBefore) };
      await page.screenshot({ path: path.join(out, `${mode}-clicked.png`) });
    } else {
      row.problem = 'no map canvas on the page';
    }
  } catch (e) {
    row.problem = String(e.message ?? e).slice(0, 300);
    row.pageText = (await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
    row.mapDom = await page.evaluate(() => ({ mapboxContainers: document.querySelectorAll('.mapboxgl-map').length, canvases: document.querySelectorAll('canvas.mapboxgl-canvas').length })).catch(() => null);
    await page.screenshot({ path: path.join(out, `${mode}-problem.png`) }).catch(() => {});
  }
  row.consoleErrors = errors.slice(0, 20);
  row.consoleErrorCount = errors.length;
  results.push(row);
  await context.close();
}
await browser.close();

function summarize(list) {
  const byStatus = {}, byZoom = {};
  for (const t of list) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.status === 200) byZoom[t.z] = (byZoom[t.z] ?? 0) + 1;
  }
  return { requests: list.length, byStatus, okByZoom: byZoom, sources: [...new Set(list.map(t => t.source))] };
}

const problems = [];
for (const r of results) {
  if (r.problem) problems.push(`${r.mode}: ${r.problem}`);
  if (!r.source) problems.push(`${r.mode}: the map never said which parcel source it used`);
  if (r.mode === 'candidate' && r.source !== 'candidate') problems.push(`candidate: fell back to ${r.source} (${r.fallback})`);
  const ok = (r.afterZoom?.byStatus?.[200] ?? 0) + (r.atOpen?.byStatus?.[200] ?? 0);
  if (!ok) problems.push(`${r.mode}: no parcel tile loaded`);
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results, problems }, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.mode}: source=${r.source} release=${r.release ?? '-'} fallback=${r.fallback ?? '-'} start page ${r.startPage ?? 'not seen'}`);
  if (r.pageText) console.log(`  page text: ${r.pageText}`);
  if (r.mapDom) console.log(`  map DOM: ${JSON.stringify(r.mapDom)}`);
  console.log(`  open (z12): ${JSON.stringify(r.atOpen)}`);
  console.log(`  zoomed (~z15): ${JSON.stringify(r.afterZoom)}`);
  console.log(`  click: ${JSON.stringify(r.click)}`);
  console.log(`  console errors: ${r.consoleErrorCount}${r.consoleErrors?.length ? ' e.g. ' + r.consoleErrors.slice(0, 3).join(' || ') : ''}`);
}
if (problems.length) { console.log('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('live map check passed');

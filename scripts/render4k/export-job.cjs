#!/usr/bin/env node
// Writes the scene the offline renderer works from: <out>/scene.glb and
// <out>/render-job.json, taken from the running app's own model through the
// dev-only window.__ppRenderJob hook.
//
//   node scripts/render4k/export-job.cjs <outDir> <ogc_fid> "<address>" <zoning>
//
// Needs the app on APP_URL (default http://localhost:5199) in dev mode.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [out, fid, address, zoning] = process.argv.slice(2);
  if (!out || !fid) { console.error('usage: export-job.cjs <outDir> <ogc_fid> "<address>" <zoning>'); process.exit(2); }
  const url = process.env.APP_URL || 'http://localhost:5199/';
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const start = page.locator('[data-testid="landing-start"]').first();
  if (await start.isVisible().catch(() => false)) { await start.click(); await page.waitForTimeout(2500); }
  const skip = page.getByText('Skip Tour').first();
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  await page.evaluate(parcel => document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel })), { ogc_fid: Number(fid), address: address || '', zoning: zoning || '' });
  await page.waitForTimeout(1200);
  await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
  await page.waitForTimeout(Number(process.env.SETTLE || 11000));
  const res = await page.evaluate(async opts => (window.__ppRenderJob ? window.__ppRenderJob(opts) : null), {
    ...(process.env.SUN_KEY ? { sunKey: process.env.SUN_KEY } : {}),
    ...(process.env.SUN_HOUR ? { sunHour: Number(process.env.SUN_HOUR) } : {}),
  });
  await browser.close();
  if (!res) { console.error('no render job: the plan has no drawing, or the app is not a dev build'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'scene.glb'), Buffer.from(res.glbBase64, 'base64'));
  fs.writeFileSync(path.join(out, 'render-job.json'), JSON.stringify(res.job, null, 2) + '\n');
  const j = res.job;
  console.log(`wrote ${out}: revision ${j.site.revision}, ${j.mesh_groups.length} meshes, ${j.glb.bytes} bytes, sha256 ${j.glb.sha256.slice(0, 12)}`);
  console.log('quantities', JSON.stringify(j.quantities), 'cameras', j.cameras.map(c => c.id).join(','), 'size ft', j.bounds_ft.size.join(' x '));
})().catch(e => { console.error(e); process.exit(1); });

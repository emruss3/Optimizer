#!/usr/bin/env node
// Live views check (PR 221 audit, Delivery C): on a laptop viewport, open each parcel's plan, go
// to 3D, the Rendering look and the Street camera, and record what was asked for and what is
// shown (the camera label and any fallback reason), whether the schedule dock folded for 3D, how
// the 4K entry is labelled, and the session timeline (search → shell → context → revision → 3D).
//
//   APP_URL=http://localhost:5199 OUT=live-views node scripts/live-check/views.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
const out = process.env.OUT ?? 'live-views';
if (!base) { console.error('APP_URL is required'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const PARCELS = [
  { name: '535 Main St', id: 469303, apn: null, address: '535 Main St' },
  { name: '0 Delk Ave', id: 675423, apn: '08110007300' },
];

const browser = await chromium.launch();
const results = [];
for (const p of PARCELS) {
  const row = { parcel: p.name, id: p.id };
  // the audit's laptop viewport
  const context = await browser.newContext({ viewport: { width: 1536, height: 791 } });
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); localStorage.setItem('pp.dock', 'open'); } catch { /* private */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const box = page.locator('[data-testid="start-search"]').first();
    await box.waitFor({ state: 'visible', timeout: 30000 });
    await box.fill(p.apn ?? p.address);
    await page.locator('[data-testid="start-results"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="start-results"] li button').first().click();
    await page.getByText('Site Planner', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
    await page.getByText('Site Planner', { exact: true }).first().click();
    // a settled plan: a revision mark in the timeline
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const tl = await page.evaluate(() => window.__ppTimeline ?? []);
      if (tl.some(m => m.name === 'plan-revision')) break;
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(4000);
    row.dockBefore3d = await page.locator('[data-testid="dock"]').getAttribute('data-open').catch(() => null);
    await page.getByText('3D Massing', { exact: true }).first().click();
    await page.locator('[data-testid="massing-3d"][data-ready="true"]').first().waitFor({ timeout: 60000 });
    row.dockIn3d = await page.locator('[data-testid="dock"]').getAttribute('data-open').catch(() => null);
    const vp = await page.locator('[data-testid="massing-3d"]').boundingBox();
    row.viewport3d = vp ? `${Math.round(vp.width)}×${Math.round(vp.height)}` : null;
    await page.locator('[data-testid="look-rendering"]').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    // the 3D toolbar can re-render while the scene settles: retry the click, then force it
    await page.locator('[data-testid="camera-street"]').first().click({ timeout: 15000 })
      .catch(() => page.locator('[data-testid="camera-street"]').first().click({ force: true }));
    await page.waitForTimeout(2500);
    row.camera = await page.locator('[data-testid="camera-label"]').innerText().catch(() => null);
    row.cameraFallback = await page.locator('[data-testid="camera-label"]').getAttribute('data-fallback').catch(() => null);
    row.shotNote = await page.locator('[data-testid="shot-note"]').innerText().catch(() => null);
    row.fourK = await page.locator('[data-testid="render-4k"]').innerText().catch(() => null);
    await page.screenshot({ path: path.join(out, `${p.id}-street.png`) });
    // Present (audit 9379472 F8): the look label follows what is on screen, never Review over an illustration
    await page.locator('[data-testid="look-review"]').first().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.locator('[data-testid="render-present"]').first().click();
    await page.waitForTimeout(2000);
    row.present = {
      on: await page.locator('[data-testid="massing-3d"]').getAttribute('data-present').catch(() => null),
      reviewPressed: await page.locator('[data-testid="look-review"]').getAttribute('aria-pressed').catch(() => null),
      renderingPressed: await page.locator('[data-testid="look-rendering"]').getAttribute('aria-pressed').catch(() => null),
      label: await page.locator('[data-testid="look-illustration"]').innerText().catch(() => null),
    };
    await page.screenshot({ path: path.join(out, `${p.id}-present.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.getByText('2D Plan', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    row.dockBack2d = await page.locator('[data-testid="dock"]').getAttribute('data-open').catch(() => null);
    const tl = await page.evaluate(() => window.__ppTimeline ?? []);
    const at = n => tl.find(m => m.name === n)?.atMs ?? null;
    row.timeline = {
      search: at('search-results'), shell: at('planner-shell'), context: at('context-compiled'),
      revision: at('plan-revision'), interactive3d: at('3d-interactive'),
      cameras: tl.filter(m => m.name === 'camera').map(m => `${m.detail?.requested}→${m.detail?.shown}`),
    };
    if (!row.camera) throw new Error('no camera label after asking for the street view');
    if (row.cameraFallback === 'true' && !/requested · showing the aerial instead: /.test(row.shotNote ?? '')) throw new Error('fallback without a reason');
    if (row.present?.on !== 'true' || row.present.reviewPressed !== 'false' || row.present.renderingPressed !== 'true' || !/Present/.test(row.present.label ?? '')) throw new Error(`Present shows the wrong look label: ${JSON.stringify(row.present)}`);
    if (row.timeline.revision == null || row.timeline.interactive3d == null) throw new Error('timeline missing the plan revision or 3D milestone');
  } catch (e) {
    row.problem = String(e.message ?? e).slice(0, 240);
    await page.screenshot({ path: path.join(out, `${p.id}-problem.png`) }).catch(() => {});
  }
  row.errors = errors.slice(0, 5);
  results.push(row);
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.parcel} (${r.id}) | 3D ${r.viewport3d} dock ${r.dockBefore3d}→${r.dockIn3d}→${r.dockBack2d} | ${r.camera} | ${r.shotNote ?? 'no fallback'} | 4K button "${r.fourK}" | present ${JSON.stringify(r.present ?? null)} | timeline ${JSON.stringify(r.timeline)}${r.problem ? ` | ${r.problem}` : ''}`);
}
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} parcels failed`); process.exit(1); }
console.log(`all ${results.length} parcels passed`);

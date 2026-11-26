#!/usr/bin/env node
// Live home-switch check (audit 2026-11-26): open each detached parcel in the
// planner, read how many stock plans fit each lot, then on the first parcel
// change the home on one lot and confirm that only that house changed, and
// that Undo puts it back.
//
//   APP_URL=http://localhost:5199 OUT=live-homes node scripts/live-check/homes.mjs
//
// Needs the dev build (the plan evidence hook, window.__planEvidence, is
// dev-only): run it through the live-check workflow with app_ref.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
const out = process.env.OUT ?? 'live-homes';
if (!base) { console.error('APP_URL is required'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const PARCELS = [
  { name: '0 Delk Ave', id: 675423, apn: '08110007300', change: true },
  { name: '3245 Hummingbird Dr', id: 639551, apn: '05913003800' },
  { name: '409 Foothill Dr', id: 635920, apn: '10616001400' },
];

const evidence = page => page.evaluate(() => window.__planEvidence ?? null);
async function waitFor(page, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ev = await evidence(page).catch(() => null);
    if (ev && pred(ev)) return ev;
    await page.waitForTimeout(1000);
  }
  return evidence(page).catch(() => null);
}

const browser = await chromium.launch();
const results = [];
for (const p of PARCELS) {
  const row = { parcel: p.name, id: p.id };
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); } catch { /* private mode */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const box = page.locator('[data-testid="start-search"]').first();
    await box.waitFor({ state: 'visible', timeout: 30000 });
    await box.fill(p.apn);
    await page.locator('[data-testid="start-results"]').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('[data-testid="start-results"] li button').first().click();
    await page.getByText('Site Planner', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
    await page.getByText('Site Planner', { exact: true }).first().click();
    const ev = await waitFor(page, e => e.homes?.rows?.length > 0, 150000);
    row.rows = ev?.homes?.rows ?? null;
    row.lotsShown = ev?.sfV1?.lots ?? null;
    await page.screenshot({ path: path.join(out, `${p.id}-plan.png`) });
    if (!row.rows) throw new Error('no house lots reached the plan evidence');
    row.summary = row.rows.map(r => `${r.lot}: ${r.eligible.length}${r.problem ? ` (${r.problem})` : ''}`);

    if (p.change) {
      const target = row.rows.find(r => r.eligible.length >= 2);
      if (!target) throw new Error('no lot with two or more fitting plans to change');
      const before = ev.homes.pads;
      const homesBtn = page.locator('[data-testid="home-designs"]').first();
      await homesBtn.click();
      const lotSel = page.locator('[data-testid="home-stock-lot"]').first();
      await lotSel.waitFor({ state: 'visible', timeout: 20000 });
      await lotSel.selectOption(target.house);
      const listed = await page.locator('nav[aria-label="Buildable stock plans"] button strong').allInnerTexts();
      row.studioListed = listed;
      row.listMatchesEvidence = JSON.stringify(listed) === JSON.stringify(target.eligible);
      // pick the second plan in the list, then change the home on that lot
      await page.locator('nav[aria-label="Buildable stock plans"] button').nth(1).click();
      await page.screenshot({ path: path.join(out, `${p.id}-studio.png`) });
      row.applyLabel = await page.locator('[data-testid="home-stock-apply"]').innerText();
      await page.locator('[data-testid="home-stock-apply"]').click();
      const after = (await waitFor(page, e => JSON.stringify(e.homes?.pads) !== JSON.stringify(before), 20000))?.homes?.pads ?? [];
      const changed = after.filter(a => { const b = before.find(x => x.id === a.id); return !b || b.design !== a.design || b.outline !== a.outline; }).map(a => a.id);
      row.changedPads = changed;
      row.changedDesign = after.find(a => a.id === target.house)?.design ?? null;
      row.onlyTargetChanged = changed.length === 1 && changed[0] === target.house;
      row.status = await page.locator('[data-testid="home-change-status"]').innerText().catch(() => null);
      await page.screenshot({ path: path.join(out, `${p.id}-changed.png`) });
      await page.getByText('Undo home change').first().click();
      const undone = (await waitFor(page, e => JSON.stringify(e.homes?.pads) === JSON.stringify(before), 15000))?.homes?.pads;
      row.undoRestored = JSON.stringify(undone) === JSON.stringify(before);
      if (!row.listMatchesEvidence) throw new Error('studio list differs from the eligibility result');
      if (!row.onlyTargetChanged) throw new Error(`changed ${changed.join(',') || 'nothing'}, expected only ${target.house}`);
      if (!row.undoRestored) throw new Error('Undo did not restore the plan');
    }
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
  console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.parcel} (${r.id}) | lots: ${(r.summary ?? []).join(' · ')}` +
    (r.changedPads ? ` | changed ${r.changedPads.join(',')} → ${r.changedDesign} | only target: ${r.onlyTargetChanged} | undo: ${r.undoRestored} | "${r.applyLabel}"` : '') +
    (r.problem ? ` | ${r.problem}` : ''));
}
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} parcels failed`); process.exit(1); }
console.log(`all ${results.length} parcels passed`);

#!/usr/bin/env node
// Live decision-state check (audit 9379472): search by app ID and by spelled-out street words;
// at Delk a home change moves the impervious figure and the houses never read as apartments;
// at 2611 W Heiman the basis line does not claim connected access beside zero reachable bays.
//
//   APP_URL=http://localhost:5199 OUT=live-decision node scripts/live-check/decision.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
const out = process.env.OUT ?? 'live-decision';
if (!base) { console.error('APP_URL is required'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const results = [];
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); localStorage.setItem('pp.inspector', 'open'); } catch { /* private */ } });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="start-search"]').first().waitFor({ state: 'visible', timeout: 30000 });
  return { context, page };
};
const search = async (page, q) => {
  const box = page.locator('[data-testid="start-search"]').first();
  await box.fill(q);
  const got = await Promise.race([
    page.locator('[data-testid="start-results"]').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'results'),
    page.getByText(/No parcel matches/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'none'),
  ]).catch(() => 'nothing');
  const rows = got === 'results' ? await page.locator('[data-testid="start-results"] li').allInnerTexts() : [];
  return { got, rows };
};
const evidence = page => page.evaluate(() => window.__planEvidence ?? null);
const settle = async page => {
  const t0 = Date.now(); let last = '', still = Date.now();
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(1500);
    const ev = await evidence(page).catch(() => null);
    const key = JSON.stringify([ev?.homes?.pads ?? null, ev?.basis ?? null, ev?.sfV1?.competition?.state ?? null]);
    if (key !== last) { last = key; still = Date.now(); }
    if (ev && (ev.basis || ev.homes) && Date.now() - still > 6000) return ev;
  }
  return evidence(page);
};
const openPlanner = async (page, q) => {
  await search(page, q);
  await page.locator('[data-testid="start-results"] li button').first().click();
  await page.getByText('Site Planner', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
  await page.getByText('Site Planner', { exact: true }).first().click();
  return settle(page);
};

// 1. search by app ID and spelled-out street words
{
  const row = { case: 'search' };
  const { context, page } = await open();
  try {
    const id = await search(page, '675423');
    row.byId = id.rows[0] ?? null;
    const words = await search(page, '2500 West Heiman Street');
    row.byWords = words.rows[0] ?? null;
    if (!/DELK/i.test(row.byId ?? '')) throw new Error(`app ID 675423 did not find 0 Delk Ave: ${row.byId}`);
    if (!/HEIMAN/i.test(row.byWords ?? '')) throw new Error(`"2500 West Heiman Street" found nothing on Heiman: ${row.byWords}`);
  } catch (e) { row.problem = String(e.message ?? e).slice(0, 240); }
  results.push(row); await context.close();
}

// 2. Delk: a home change moves impervious; houses never read as apartments
{
  const row = { case: '0 Delk Ave' };
  const { context, page } = await open();
  try {
    const ev = await openPlanner(page, '08110007300');
    const imperv = async () => (await page.getByText(/% impervious/).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    row.imperviousBefore = (await imperv()).match(/[\d.]+% impervious[^·]*/)?.[0] ?? null;
    const target = ev?.homes?.rows?.find(r => r.eligible.length >= 2);
    if (!target) throw new Error('no lot to change');
    await page.locator('[data-testid="home-designs"]').first().click();
    const lotSel = page.locator('[data-testid="home-stock-lot"]').first();
    await lotSel.waitFor({ state: 'visible', timeout: 30000 });
    await lotSel.selectOption(target.house);
    await page.locator('nav[aria-label="Buildable stock plans"] button').last().click();
    await page.locator('[data-testid="home-stock-apply"]').click();
    await page.waitForTimeout(2500);
    row.imperviousAfter = (await imperv()).match(/[\d.]+% impervious[^·]*/)?.[0] ?? null;
    const body = await page.locator('body').innerText();
    row.saysApartments = /\b\d+\s+apartments?\b/i.test(body);
    if (!row.imperviousAfter || row.imperviousAfter === row.imperviousBefore) throw new Error(`impervious did not move: ${row.imperviousBefore} → ${row.imperviousAfter}`);
    if (row.saysApartments) throw new Error('the detached plan reads as apartments');
  } catch (e) { row.problem = String(e.message ?? e).slice(0, 240); }
  await page.screenshot({ path: path.join(out, 'delk.png') }).catch(() => {});
  results.push(row); await context.close();
}

// 3. 2611 W Heiman: no connected claim beside zero reachable bays
{
  const row = { case: '2611 W Heiman St' };
  const { context, page } = await open();
  try {
    const ev = await openPlanner(page, '08114001700');
    row.basis = (ev?.basis ?? '').slice(0, 200);
    row.basisShown = (ev?.basisShown ?? '').slice(0, 260);
    const bare = /\baccess\b[^·;.(]*\bconnected\b(?! \(engine summary)/i;
    row.reachable = await page.getByText(/reachable from the street/).first().innerText().catch(() => null);
    if (/\b0 reachable from the street\b/.test(row.reachable ?? '') && bare.test(row.basisShown)) throw new Error('basis still claims connected access beside 0 reachable');
  } catch (e) { row.problem = String(e.message ?? e).slice(0, 240); }
  await page.screenshot({ path: path.join(out, 'heiman-2611.png') }).catch(() => {});
  results.push(row); await context.close();
}

await browser.close();
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.case} | ${JSON.stringify({ ...r, case: undefined })}`);
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} cases failed`); process.exit(1); }
console.log(`all ${results.length} cases passed`);

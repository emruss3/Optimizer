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
let lotsBeforeGlobal = null;
const results = [];
for (const p of PARCELS) {
  const row = { parcel: p.name, id: p.id };
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  // the inspector open, so the by-right panel (and its override, the re-solve route) is on the page
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); localStorage.setItem('pp.inspector', 'open'); } catch { /* private mode */ } });
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
    let ev = await waitFor(page, e => e.homes?.rows?.length > 0, 150000);
    // let the plan settle: the pattern competition can put its best plan on the sheet after the
    // first answer (Delk: a 3-lot default, then a 4-lot best). Wait for the competition and for
    // the houses to hold still for 6 s.
    {
      const t0 = Date.now();
      let last = JSON.stringify(ev?.homes?.pads ?? null), still = Date.now();
      while (Date.now() - t0 < 120000) {
        await page.waitForTimeout(1500);
        const now = await evidence(page).catch(() => null);
        const key = JSON.stringify(now?.homes?.pads ?? null);
        if (key !== last) { last = key; still = Date.now(); }
        if (now) ev = now;
        const comp = now?.sfV1?.competition?.state;
        if ((comp == null || comp === 'done' || comp === 'failed') && Date.now() - still > 6000) break;
      }
      row.settledMs = Date.now() - t0;
    }
    row.rows = ev?.homes?.rows ?? null;
    row.lotsShown = ev?.sfV1?.lots ?? null;
    await page.screenshot({ path: path.join(out, `${p.id}-plan.png`) });
    if (!row.rows) throw new Error('no house lots reached the plan evidence');
    row.summary = row.rows.map(r => `${r.lot}: ${r.eligible.length}${r.problem ? ` (${r.problem})` : ''}`);

    if (p.change) {
      const target = row.rows.find(r => r.eligible.length >= 2);
      if (!target) throw new Error('no lot with two or more fitting plans to change');
      const homesBtn = page.locator('[data-testid="home-designs"]').first();
      row.homesButton = { visible: await homesBtn.isVisible().catch(() => false), disabled: await homesBtn.isDisabled().catch(() => null), title: await homesBtn.getAttribute('title').catch(() => null) };
      await homesBtn.click();
      const lotSel = page.locator('[data-testid="home-stock-lot"]').first();
      await lotSel.waitFor({ state: 'visible', timeout: 30000 }).catch(async (e) => {
        row.dialog = (await page.locator('[role="dialog"]').first().innerText().catch(() => 'no dialog')).replace(/\s+/g, ' ').slice(0, 300);
        throw e;
      });
      await lotSel.selectOption(target.house);
      const listed = await page.locator('nav[aria-label="Buildable stock plans"] button strong').allInnerTexts();
      row.studioListed = listed;
      row.listMatchesEvidence = JSON.stringify(listed) === JSON.stringify(target.eligible);
      // pick the second plan in the list, then change the home on that lot
      await page.locator('nav[aria-label="Buildable stock plans"] button').nth(1).click();
      await page.screenshot({ path: path.join(out, `${p.id}-studio.png`) });
      row.applyLabel = await page.locator('[data-testid="home-stock-apply"]').innerText();
      // the plan as it stands at the click is the one the change is measured against
      const before = (await evidence(page))?.homes?.pads ?? [];
      await page.locator('[data-testid="home-stock-apply"]').click();
      const after = (await waitFor(page, e => JSON.stringify(e.homes?.pads) !== JSON.stringify(before), 20000))?.homes?.pads ?? [];
      const changed = after.filter(a => { const b = before.find(x => x.id === a.id); return !b || b.design !== a.design || b.outline !== a.outline; }).map(a => a.id);
      row.changedPads = changed;
      row.changedDesign = after.find(a => a.id === target.house)?.design ?? null;
      row.onlyTargetChanged = changed.length === 1 && changed[0] === target.house;
      row.status = await page.locator('[data-testid="home-change-status"]').innerText().catch(() => null);
      await page.screenshot({ path: path.join(out, `${p.id}-changed.png`) });
      // the top bar's Undo, the one control every change shares
      await page.locator('[data-testid="plan-undo"]').first().click();
      const undone = (await waitFor(page, e => JSON.stringify(e.homes?.pads) === JSON.stringify(before), 15000))?.homes?.pads;
      row.undoRestored = JSON.stringify(undone) === JSON.stringify(before);
      // Redo puts the change back
      await page.locator('[data-testid="plan-redo"]').first().click().catch(() => {});
      row.redo = (await waitFor(page, e => e.homes?.pads?.find(x => x.id === target.house)?.design === row.changedDesign, 15000))?.homes?.pads?.find(x => x.id === target.house)?.design === row.changedDesign;

      // a mixed masterplan: three different plans on three lots of the same scheme
      // pick, on each lot, a plan no other lot of the mix carries (by plan number, not list position)
      const used = new Set();
      const applyOn = async (house, lock = false) => {
        await homesBtn.click();
        await lotSel.waitFor({ state: 'visible', timeout: 30000 });
        await lotSel.selectOption(house);
        const names = await page.locator('nav[aria-label="Buildable stock plans"] button strong').allInnerTexts();
        const k = names.findIndex(n => !used.has(n));
        if (k < 0) { await page.keyboard.press('Escape'); return null; }
        used.add(names[k]);
        await page.locator('nav[aria-label="Buildable stock plans"] button').nth(k).click();
        if (lock) await page.locator('[data-testid="home-stock-lock"] input').check().catch(() => {});
        const before = JSON.stringify((await evidence(page))?.homes?.pads?.find(x => x.id === house) ?? null);
        await page.locator('[data-testid="home-stock-apply"]').click();
        return (await waitFor(page, e => JSON.stringify(e.homes?.pads?.find(x => x.id === house) ?? null) !== before, 15000))?.homes?.pads?.find(x => x.id === house)?.design ?? null;
      };
      const lots3 = row.rows.filter(r => r.eligible.length >= 3).slice(0, 3);
      const mix = {};
      if (lots3.length === 3) {
        for (const r of lots3) {
          const current = (await evidence(page))?.homes?.pads?.find(x => x.id === r.house)?.design;
          const plan = current ? current.replace(/^abhp:/, '') : null;
          if (plan && !used.has(plan) && r.house === target.house) { used.add(plan); mix[r.house] = current; continue; }
          // the second lot's home is locked through re-solves
          mix[r.house] = await applyOn(r.house, r === lots3[1]);
        }
        const pads = (await evidence(page))?.homes?.pads ?? [];
        row.mix = Object.fromEntries(Object.keys(mix).map(h => [h, pads.find(x => x.id === h)?.design ?? null]));
        row.mixDistinct = new Set(Object.values(row.mix).filter(Boolean)).size === 3;
        await page.screenshot({ path: path.join(out, `${p.id}-mix.png`) });
      }

      // one plan on two lots at once: both change, the rest do not, one Undo takes both back
      if (row.mix) {
        const before = (await evidence(page))?.homes?.pads ?? [];
        await homesBtn.click();
        await lotSel.waitFor({ state: 'visible', timeout: 30000 });
        const first = row.rows.find(r => r.eligible.length >= 2);
        await lotSel.selectOption(first.house);
        // a plan neither lot carries yet, so both visibly change
        const names = await page.locator('nav[aria-label="Buildable stock plans"] button strong').allInnerTexts();
        const carried = new Set(before.map(b => (b.design ?? '').replace(/^abhp:/, '')));
        const k = Math.max(0, names.findIndex(n => !carried.has(n)));
        await page.locator('nav[aria-label="Buildable stock plans"] button').nth(k).click();
        const also = page.locator('[data-testid="home-stock-also"] input[type="checkbox"]');
        if (await also.count()) {
          await also.first().check();
          await page.locator('[data-testid="home-stock-apply-many"]').click();
          const after = (await waitFor(page, e => JSON.stringify(e.homes?.pads) !== JSON.stringify(before), 15000))?.homes?.pads ?? [];
          const changed = after.filter(a => { const b = before.find(x => x.id === a.id); return !b || b.design !== a.design || b.outline !== a.outline; });
          row.many = { plan: names[k], changed: changed.map(c => c.id), sameDesign: new Set(changed.map(c => c.design)).size === 1 };
          await page.locator('[data-testid="plan-undo"]').first().click();
          row.many.undone = JSON.stringify((await waitFor(page, e => JSON.stringify(e.homes?.pads) === JSON.stringify(before), 15000))?.homes?.pads) === JSON.stringify(before);
        } else {
          await page.keyboard.press('Escape');
          row.many = { skipped: 'the first plan fits no other lot' };
        }
      }

      // re-solve: draw the plan again under a lot-width override, then by right again; every choice
      // must be reported or kept on the override plan, and all of them back on the by-right plan
      const shownBefore = (await evidence(page))?.sfV1?.shown ?? null;
      lotsBeforeGlobal = (await evidence(page))?.sfV1?.lots ?? null;
      const lotsBefore = (await evidence(page))?.sfV1?.lots ?? null;
      const lotW = page.locator('[data-testid="sfv1-override-lot-w"]').first();
      if (row.mix && await lotW.count()) {
        const w = Number(await lotW.getAttribute('placeholder')) || 50;
        await lotW.fill(String(Math.round(w + 6)));
        await page.locator('[data-testid="sfv1-override-apply"]').first().click();
        const over = await waitFor(page, e => e.sfV1?.basis === 'override', 90000);
        row.resolve = { overrideLots: over?.sfV1?.lots ?? null };
        await page.waitForTimeout(1500);
        row.resolve.overrideStatus = (await page.locator('[data-testid="home-carry-status"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) || null;
        // the locked home cannot stay on the override plan: the conflict is shown and the previous plan offered
        row.resolve.lockConflict = (await page.locator('[data-testid="home-lock-conflict"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 240) || null;
        let back;
        if (row.resolve.lockConflict) {
          await page.locator('[data-testid="home-lock-return"]').click();
          back = await waitFor(page, e => e.sfV1?.basis !== 'override' && e.sfV1?.lots === lotsBefore, 30000);
          row.resolve.via = 'return to the previous plan';
        } else {
          await page.locator('[data-testid="sfv1-override-reset"]').first().click();
          back = await waitFor(page, e => e.sfV1?.basis !== 'override' && e.sfV1?.lots === lotsBefore, 90000);
          row.resolve.via = 'by-right reset';
        }
        // the competition's best may need drawing again to return to the plan the mix was made on
        if (back?.sfV1?.shown !== shownBefore && shownBefore) {
          const view = page.locator(`[data-testid="sfv1-cand-view-${shownBefore}"]`);
          if (await view.count()) { await view.click(); back = await waitFor(page, e => e.sfV1?.shown === shownBefore, 60000); }
        }
        back = await waitFor(page, e => Object.entries(row.mix).every(([h, d]) => e.homes?.pads?.find(x => x.id === h)?.design === d), 20000);
        row.resolve.backStatus = (await page.locator('[data-testid="home-carry-status"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) || null;
        row.resolve.restored = Object.entries(row.mix).every(([h, d]) => back?.homes?.pads?.find(x => x.id === h)?.design === d);
        await page.screenshot({ path: path.join(out, `${p.id}-resolved.png`) });
      } else {
        row.resolve = { skipped: !row.mix ? 'fewer than three lots with three fitting plans' : 'no lot-width override on this plan' };
      }
      if (!row.listMatchesEvidence) throw new Error('studio list differs from the eligibility result');
      if (!row.onlyTargetChanged) throw new Error(`changed ${changed.join(',') || 'nothing'}, expected only ${target.house}`);
      if (!row.undoRestored) throw new Error('Undo did not restore the plan');
      if (row.redo === false) throw new Error('Redo did not put the change back');
      if (row.many && !row.many.skipped && !(row.many.changed.length === 2 && row.many.sameDesign && row.many.undone)) throw new Error(`apply to two lots: ${JSON.stringify(row.many)}`);
      if (row.mix && !row.mixDistinct) throw new Error(`three lots did not carry three different plans: ${JSON.stringify(row.mix)}`);
      if (row.resolve && row.resolve.overrideLots != null && row.resolve.overrideLots !== lotsBeforeGlobal && !row.resolve.lockConflict) throw new Error('a locked home was lost on the override plan without a conflict');
      if (row.resolve && row.resolve.restored === false) throw new Error(`after a re-solve and back, the three choices did not all return: ${JSON.stringify(row.mix)}`);
    }
  } catch (e) {
    row.problem = String(e.message ?? e).slice(0, 240);
    await page.screenshot({ path: path.join(out, `${p.id}-problem.png`) }).catch(() => {});
  }
  row.errors = errors.slice(0, 5);
  if (row.problem) console.log(`  diagnostics ${p.id}: button ${JSON.stringify(row.homesButton ?? null)} dialog ${JSON.stringify(row.dialog ?? null)} errors ${JSON.stringify(row.errors)}`);
  results.push(row);
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.parcel} (${r.id}) | lots: ${(r.summary ?? []).join(' · ')}` +
    (r.changedPads ? ` | changed ${r.changedPads.join(',')} → ${r.changedDesign} | only target: ${r.onlyTargetChanged} | undo: ${r.undoRestored} | "${r.applyLabel}"` : '') +
    (r.redo != null ? ` | redo: ${r.redo}` : '') +
    (r.mix ? ` | mix ${JSON.stringify(r.mix)} distinct: ${r.mixDistinct}` : '') +
    (r.many ? ` | two lots ${JSON.stringify(r.many)}` : '') +
    (r.resolve ? ` | re-solve ${JSON.stringify(r.resolve)}` : '') +
    (r.problem ? ` | ${r.problem}` : ''));
}
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} parcels failed`); process.exit(1); }
console.log(`all ${results.length} parcels passed`);

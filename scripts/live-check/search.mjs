#!/usr/bin/env node
// Live search check: search the deployed app for each audit parcel by street
// address and by assessor parcel number, as a user does, then open the
// expected parcel in the planner.
//
//   APP_URL=https://... OUT=live-search node scripts/live-check/search.mjs
//
// For every case it records: the parcels the search returned (by parcel
// number, read from the result rows, mapped to parcel IDs), the time from the
// last keystroke to the results showing (this includes the field's 250 ms
// debounce and the app's own 12 s search timeout is left as it is), whether
// the expected parcel was among them, and whether picking it opened the drawer
// and then the planner for that parcel ID (the planner's own server calls name
// the parcel). It fails if any case misses its parcel or its planner.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
const out = process.env.OUT ?? 'live-search';
if (!base) { console.error('APP_URL is required'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

// expected parcel ID and its parcel number, and every parcel that shares the
// address (the address search must return all of them)
const PARCELS = [
  { name: '0 McMurray Cir', address: '0 McMurray Cir', apn: '147160A90000CO', id: 681001, sharing: { '147160A90000CO': 681001 } },
  { name: '0 Belle Arbor Dr', address: '0 Belle Arbor Dr', apn: '050020A90900CO', id: 679263,
    sharing: { '050020A90900CO': 679263, '050020A90700CO': 679349, '050020A90300CO': 680576, '050020A90500CO': 680885 } },
  { name: '0 Laurel Ln', address: '0 Laurel Ln', apn: '18200024500', id: 671773, sharing: { '18200024500': 671773, '182070A90800CO': 671821 } },
  { name: '497 Paragon Mills Rd', address: '497 Paragon Mills Rd', apn: '13300007000', id: 664902, sharing: { '13300007000': 664902 } },
  { name: '0 Trail Hollow Ln', address: '0 Trail Hollow Ln', apn: '04100011900', id: 678361,
    sharing: { '04100012000': 671938, '05000010400': 672590, '04100012100': 672649, '05000011600': 673687, '04100011800': 675456,
      '05000011400': 677973, '04100011900': 678361, '04100012300': 679803, '04100012200': 680199 } },
];

const browser = await chromium.launch();
const results = [];

for (const p of PARCELS) {
  for (const by of ['address', 'apn']) {
    const query = by === 'address' ? p.address : p.apn;
    const row = { parcel: p.name, by, query, expected: p.id };
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); } catch { /* private mode */ } });
    const page = await context.newPage();
    const plannerCalls = [];
    const searchCalls = [];
    page.on('request', r => {
      const u = r.url();
      if (u.includes('/rpc/find_planner_parcels') || u.includes('/rest/v1/parcels?')) searchCalls.push(u.includes('/rpc/') ? 'find_planner_parcels' : 'legacy parcels query');
      if (/\/rpc\/(fn_compile_planner_context|fn_parcel_topo|fn_planner_neighbors|fn_permitted_uses|get_parcel_by_id)/.test(u)) {
        let body = null; try { body = JSON.parse(r.postData() ?? 'null'); } catch { /* not JSON */ }
        plannerCalls.push({ fn: u.split('/rpc/')[1].split('?')[0], ogc: body?.p_ogc_fid ?? body?.parcel_id ?? body?.p_parcel_id ?? null });
      }
    });
    try {
      await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      const box = page.locator('[data-testid="start-search"]').first();
      await box.waitFor({ state: 'visible', timeout: 30000 });
      await box.fill(query);
      const t0 = Date.now();
      const outcome = await Promise.race([
        page.locator('[data-testid="start-results"]').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'results'),
        page.locator('[data-testid="start-search-box"] [role="alert"]').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'error'),
        page.getByText(/No parcel matches/).first().waitFor({ state: 'visible', timeout: 20000 }).then(() => 'no match'),
      ]).catch(() => 'nothing in 20 s');
      row.lookupMs = Date.now() - t0;
      row.outcome = outcome;
      row.searchCall = searchCalls[0] ?? null;
      if (outcome !== 'results') {
        row.detail = (await page.locator('[data-testid="start-search-box"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        throw new Error(`search: ${outcome}`);
      }
      const rows = page.locator('[data-testid="start-results"] li');
      const texts = await rows.allInnerTexts();
      const apns = texts.map(t => (t.split('\n')[1] ?? '').split('·')[0].trim());
      row.returnedApns = apns;
      row.returnedIds = apns.map(a => p.sharing[a] ?? `other:${a}`);
      row.found = row.returnedIds.includes(p.id);
      if (by === 'address') {
        const want = Object.values(p.sharing).sort((a, b) => a - b);
        row.allSharingReturned = want.every(id => row.returnedIds.includes(id));
        row.sharingExpected = want.length;
      }
      if (!row.found) throw new Error('search: the expected parcel was not returned');
      // open the expected parcel: the row with its parcel number
      const idx = apns.indexOf(p.apn);
      await rows.nth(idx).locator('button').click();
      await page.getByText('Site Planner', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
      row.drawerOpened = true;
      const tPlan = Date.now();
      await page.getByText('Site Planner', { exact: true }).first().click();
      // the planner shell: its header names the parcel, and its first server
      // calls name the parcel ID
      await page.getByText('Back to map').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(8000);
      const ids = [...new Set(plannerCalls.map(c => c.ogc).filter(v => v != null).map(Number))];
      row.plannerParcelIds = ids;
      row.plannerCalls = [...new Set(plannerCalls.map(c => c.fn))];
      row.plannerOpened = ids.length > 0 && ids.every(v => v === p.id);
      row.plannerMs = Date.now() - tPlan;
      row.plannerHeader = (await page.locator('header, [role="banner"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
      await page.screenshot({ path: path.join(out, `${p.id}-${by}.png`) });
      if (!row.plannerOpened) throw new Error(`planner: opened for ${ids.join(',') || 'no parcel'}, expected ${p.id}`);
    } catch (e) {
      row.problem = String(e.message ?? e).slice(0, 200);
      await page.screenshot({ path: path.join(out, `${p.id}-${by}-problem.png`) }).catch(() => {});
    }
    results.push(row);
    await context.close();
  }
}
await browser.close();

fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.parcel} by ${r.by} "${r.query}" expected ${r.expected} | ${r.lookupMs ?? '-'} ms ${r.outcome ?? ''} via ${r.searchCall ?? '-'} | returned ${(r.returnedIds ?? []).join(',')}` +
    (r.by === 'address' && r.sharingExpected ? ` | all ${r.sharingExpected} sharing parcels returned: ${r.allSharingReturned}` : '') +
    ` | planner ${r.plannerOpened ? 'opened ' + r.plannerParcelIds.join(',') : 'not opened'}${r.plannerMs ? ' in ' + r.plannerMs + ' ms' : ''}` +
    (r.problem ? ` | ${r.problem}` : ''));
}
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} cases failed`); process.exit(1); }
console.log(`all ${results.length} cases passed`);

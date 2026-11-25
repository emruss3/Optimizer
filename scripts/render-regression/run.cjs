#!/usr/bin/env node
// Opens every parcel of the regression set in the live 3D view, takes the drone and the street
// shot of each, and writes what happened: errors, how long the model took, what ground it stands
// on, the grading that was assumed, whether a street view was found. Then one contact sheet.
//
//   node scripts/render-regression/run.cjs <outDir> [fid ...]
//
// Needs the app on APP_URL (default http://localhost:5199) in dev mode, against the fixture store.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'parcels.json'), 'utf8')).parcels;
const argv = process.argv.slice(2);
const baseAt = argv.indexOf('--baseline');
const baselinePath = baseAt >= 0 ? argv.splice(baseAt, 2)[1] : null;
const [out, ...only] = argv;
if (!out) { console.error('usage: run.cjs <outDir> [fid ...] [--baseline results.json]'); process.exit(2); }
/** The longest a model may take to build at the full tier before the row fails, ms. */
const MODEL_MS = 2500;
const url = process.env.APP_URL || 'http://localhost:5199/';
const W = 1280, H = 720;

async function one(browser, parcel) {
  const row = { ...parcel, errors: [], modelMs: null, ground: null, shots: {}, streetNote: null, plan: null, opened: false, buildings: null, saysEmpty: false };
  const page = await (await browser.newContext({ viewport: { width: W, height: H + 150 } })).newPage();
  const times = [];
  page.on('pageerror', e => row.errors.push(String(e).slice(0, 200)));
  page.on('console', m => {
    const t = m.text();
    const hit = /\[time\] model: trees planted at (\d+) ms/.exec(t);
    if (hit) times.push(Number(hit[1]));
    if (m.type() === 'error' && !/maxTextureDimension2D|Failed to load resource|ERR_|net::/.test(t)) row.errors.push('console: ' + t.slice(0, 200));
  });
  await page.addInitScript(() => { window.__renderDebug = true; window.__renderQuality = 'full'; });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const start = page.locator('[data-testid="landing-start"]').first();
    if (await start.isVisible().catch(() => false)) { await start.click(); await page.waitForTimeout(2500); }
    const skip = page.getByText('Skip Tour').first();
    if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
    await page.evaluate(p => document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: p })), { ogc_fid: parcel.fid, address: parcel.address, zoning: parcel.zoning });
    await page.waitForTimeout(1200);
    await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
    await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
    // wait for the plan itself, not for a fixed time: a slow solve is not a rendering finding
    await page.waitForFunction(() => { const e = window.__planEvidence; return !!e && (e.solvedBy || e.planPattern || e.serverPlanError); }, null, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    row.plan = await page.evaluate(() => {
      const e = window.__planEvidence || {};
      return { solvedBy: e.solvedBy ?? null, pattern: e.planPattern ?? null, lots: e.subdivisionLots ?? null, error: e.serverPlanError ?? null };
    });
    const tab = page.getByText('3D Massing', { exact: true }).first();
    if (!(await tab.isVisible().catch(() => false))) { row.errors.push('no 3D view offered for this parcel'); return row; }
    await tab.click();
    await page.waitForSelector('[data-testid="massing-3d"] canvas', { timeout: 120000 });
    await page.waitForSelector('[data-testid="massing-3d"][data-ready="true"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    row.opened = true;
    const look = page.locator('[data-testid="look-rendering"]');
    if (await look.count()) {
      await look.click();
      await page.waitForTimeout(800);
      await page.waitForSelector('[data-testid="massing-3d"][data-ready="true"]', { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    const view = page.locator('[data-testid="massing-3d"]');
    for (const cam of ['iso', 'street']) {
      await page.locator(`[data-testid="camera-${cam}"]`).click().catch(() => {});
      await page.waitForTimeout(3000);
      const file = `${parcel.fid}-${cam === 'iso' ? 'drone' : 'street'}.jpg`;
      await view.screenshot({ path: path.join(out, file), type: 'jpeg', quality: 82 });
      let shot = null;
      try { shot = JSON.parse((await view.getAttribute('data-shot')) || 'null'); } catch { /* not there */ }
      row.shots[cam === 'iso' ? 'drone' : 'street'] = { file, got: shot ? shot.shot : null };
      if (cam === 'street') row.streetNote = await page.locator('[data-testid="shot-note"]').textContent().catch(() => null);
    }
    try { row.ground = JSON.parse((await view.getAttribute('data-ground')) || 'null'); } catch { /* not there */ }
    row.buildings = Number(await view.getAttribute('data-buildings'));
    row.saysEmpty = (await page.locator('[data-testid="empty-scheme"]').count()) > 0;
    row.modelMs = times.length ? Math.max(...times) : null;
  } catch (err) {
    row.errors.push('run: ' + String(err).split('\n')[0].slice(0, 200));
  } finally {
    await page.context().close();
  }
  return row;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const rows = [];
  for (const parcel of set.filter(p => !only.length || only.includes(String(p.fid)))) {
    const row = await one(browser, parcel);
    rows.push(row);
    const g = row.ground || {};
    console.log(`${parcel.fid} ${parcel.address.padEnd(24)} opened=${row.opened} model=${row.modelMs ?? '-'}ms ground=${g.kind ?? '-'}${g.kind === 'graded' ? ` cut ${g.deepest_cut_ft} ft fill ${g.deepest_fill_ft} ft` : ''} street=${row.shots.street ? row.shots.street.got : '-'} errors=${row.errors.length}`);
  }
  // each row passes or fails on what can be read without eyes
  for (const r of rows) {
    const why = [];
    if (!r.opened) why.push('did not open');
    if (r.errors.length) why.push(`${r.errors.length} error(s)`);
    if (r.modelMs != null && r.modelMs > MODEL_MS) why.push(`model took ${r.modelMs} ms, over ${MODEL_MS}`);
    if (r.buildings > 0 && !(r.shots.street && r.shots.street.got === 'street')) why.push('no street view of a scheme that has buildings');
    if (r.buildings === 0 && !r.saysEmpty) why.push('nothing is drawn and the view does not say so');
    r.fails = why;
  }
  // a run of a few parcels keeps the others' rows from the run before, so one parcel can be redone
  const before = path.join(out, 'results.json');
  if (only.length && fs.existsSync(before)) {
    const kept = JSON.parse(fs.readFileSync(before, 'utf8')).rows.filter(r => !rows.some(n => n.fid === r.fid));
    const order = set.map(p => p.fid);
    rows.push(...kept);
    rows.sort((a, b) => order.indexOf(a.fid) - order.indexOf(b.fid));
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2) + '\n');

  // the contact sheet: a row a parcel, its drone and its street shot, and the facts under them
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const img = f => `data:image/jpeg;base64,${fs.readFileSync(path.join(out, f)).toString('base64')}`;
  const html = `<body style="margin:0;font:12px/1.35 Inter,Helvetica,Arial,sans-serif;background:#fff;color:#1f2630"><div style="padding:14px;width:1500px">
<div style="font-size:16px;font-weight:700;margin-bottom:8px">Render regression set · ${rows.length} parcels</div>
${rows.map(r => {
    const g = r.ground || {};
    const facts = [
      r.plan && (r.plan.pattern || r.plan.solvedBy) ? `plan: ${esc(r.plan.pattern || r.plan.solvedBy)}${r.plan.lots ? `, ${r.plan.lots} lots` : ''}` : 'plan: none read',
      `ground: ${esc(g.kind ?? 'unknown')}${g.kind === 'graded' ? `, existing ${g.existing_slope_pct}% to ${g.graded_slope_pct}%, cut ${g.deepest_cut_ft} ft, fill ${g.deepest_fill_ft} ft` : ''}`,
      `model built in ${r.modelMs ?? '?'} ms`,
      `street view: ${r.shots.street && r.shots.street.got === 'street' ? 'found' : 'none found'}`,
      (r.fails || []).length ? `<b style="color:#b4232a">FAIL: ${esc(r.fails.join('; '))}</b>` : '<b style="color:#1a7f37">pass</b>',
    ];
    return `<div style="display:flex;gap:8px;margin-bottom:10px;border-top:1px solid #d8dbde;padding-top:8px">
<div style="width:250px"><div style="font-weight:700">${esc(r.address)}</div><div>${esc(r.zoning)} · ${esc(r.class)}</div><div style="color:#4b5158;margin-top:4px">${facts.join('<br>')}</div></div>
${['drone', 'street'].map(k => r.shots[k] ? `<img src="${img(r.shots[k].file)}" style="width:600px;height:auto;border:1px solid #d8dbde">` : `<div style="width:600px;height:330px;background:#eef1f3;display:flex;align-items:center;justify-content:center;color:#7a8087">not rendered</div>`).join('')}
</div>`;
  }).join('\n')}</div></body>`;
  const page = await browser.newPage({ viewport: { width: 1530, height: 900 } });
  await page.setContent(html);
  await page.screenshot({ path: path.join(out, 'contact-sheet.jpg'), type: 'jpeg', quality: 80, fullPage: true });
  await browser.close();
  const bad = rows.filter(r => (r.fails || []).length);
  console.log(`\n${rows.length - bad.length} of ${rows.length} pass. Contact sheet: ${path.join(out, 'contact-sheet.jpg')}`);
  for (const r of bad) console.log(`  FAIL ${r.fid} ${r.address}: ${r.fails.join('; ')}`);
  if (baselinePath && fs.existsSync(baselinePath)) {
    const was = new Map(JSON.parse(fs.readFileSync(baselinePath, 'utf8')).rows.map(r => [r.fid, r]));
    console.log(`\nAgainst ${baselinePath}:`);
    let moved = 0;
    for (const r of rows) {
      const b = was.get(r.fid);
      if (!b) continue;
      const diff = [];
      const g = (x) => (x.ground || {}).kind || '-';
      if (g(r) !== g(b)) diff.push(`ground ${g(b)} to ${g(r)}`);
      const st = (x) => (x.shots.street && x.shots.street.got === 'street' ? 'found' : 'none');
      if (st(r) !== st(b)) diff.push(`street view ${st(b)} to ${st(r)}`);
      if (b.modelMs && r.modelMs && Math.abs(r.modelMs - b.modelMs) > Math.max(400, b.modelMs * 0.35)) diff.push(`model ${b.modelMs} to ${r.modelMs} ms`);
      const cut = (x) => ((x.ground || {}).deepest_cut_ft ?? null);
      if (cut(r) !== cut(b) && cut(r) != null && cut(b) != null && Math.abs(cut(r) - cut(b)) > 1) diff.push(`deepest cut ${cut(b)} to ${cut(r)} ft`);
      if (diff.length) { moved++; console.log(`  ${r.fid} ${r.address}: ${diff.join('; ')}`); }
    }
    if (!moved) console.log('  no row moved');
  }
})().catch(e => { console.error(e); process.exit(1); });

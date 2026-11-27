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
  // the tree grower (about 4 MB) is fetched only once the model is planted, never for Review
  const treeFetches = [];
  page.on('request', r => { if (/ez-tree/.test(r.url())) treeFetches.push(r.url()); });
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
    await page.waitForTimeout(1500);
    // one 3D view, the rendering (owner, 11-27): it plants trees from the start, and the plan's lines
    // draw over it on request, keeping the camera
    row.look = await page.locator('[data-testid="massing-3d"]').getAttribute('data-look').catch(() => null);
    row.treeFetches = treeFetches.length;
    row.lookToggle = await page.locator('[data-testid="look-review"]').count();
    const shotOf = () => page.locator('[data-testid="massing-3d"]').getAttribute('data-shot').then(v => { try { return JSON.parse(v ?? 'null'); } catch { return null; } }).catch(() => null);
    const before = await shotOf();
    await page.locator('[data-testid="plan-lines"]').first().click();
    await page.locator('[data-testid="massing-3d"][data-ready="true"]').first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const after = await shotOf();
    const moved = before?.position && after?.position ? Math.hypot(...before.position.map((v, i) => v - after.position[i])) : null;
    row.planLines = {
      pressed: await page.locator('[data-testid="plan-lines"]').getAttribute('aria-pressed').catch(() => null),
      legend: await page.locator('[data-testid="review-legend"]').count(),
      cameraKept: moved != null ? moved < 0.05 : null,
    };
    await page.screenshot({ path: path.join(out, `${p.id}-plan-lines.png`) });
    await page.locator('[data-testid="plan-lines"]').first().click();
    await page.locator('[data-testid="massing-3d"][data-ready="true"]').first().waitFor({ timeout: 60000 }).catch(() => {});
    // the 3D toolbar can re-render while the scene settles: retry the click, then force it
    await page.locator('[data-testid="camera-street"]').first().click({ timeout: 15000 })
      .catch(() => page.locator('[data-testid="camera-street"]').first().click({ force: true }));
    await page.waitForTimeout(2500);
    row.camera = await page.locator('[data-testid="camera-label"]').innerText().catch(() => null);
    row.cameraFallback = await page.locator('[data-testid="camera-label"]').getAttribute('data-fallback').catch(() => null);
    row.shotNote = await page.locator('[data-testid="shot-note"]').innerText().catch(() => null);
    // what the street camera actually shows of its building, measured on the drawn picture (audit eb378b1)
    { const st = await shotOf(); row.streetSeen = st?.seen ? { subject: st.seen.subject, visible: st.seen.visible, framed: st.seen.framed, hiddenBy: st.seen.hiddenBy, tried: st.seen.tried, quality: st.seen.quality } : null; row.streetBasis = st?.basis ?? null; }
    row.cameraChecks = await page.evaluate(() => (window.__ppTimeline ?? []).filter(m => m.name === 'camera-check').map(m => m.detail)).catch(() => null);
    row.fourK = await page.locator('[data-testid="render-4k"]').innerText().catch(() => null);
    await page.screenshot({ path: path.join(out, `${p.id}-street.png`) });
    // Fit site is the rescue (navigation audit 11-27): from the street it rises to the whole parcel, and says so
    await page.locator('[data-testid="camera-fit"]').first().click({ timeout: 15000 }).catch(() => page.locator('[data-testid="camera-fit"]').first().click({ force: true }));
    await page.waitForTimeout(1500);
    const fitShot = await page.locator('[data-testid="massing-3d"]').getAttribute('data-shot').then(v => { try { return JSON.parse(v ?? 'null'); } catch { return null; } }).catch(() => null);
    row.fit = { label: (await page.locator('[data-testid="camera-label"]').innerText().catch(() => '')).slice(0, 120), heightFt: fitShot?.position?.[2] ?? null, shot: fitShot?.shot ?? null };
    await page.screenshot({ path: path.join(out, `${p.id}-fit.png`) });
    // Previous view steps back to the street camera
    await page.locator('[data-testid="camera-previous"]').first().click().catch(() => {});
    await page.waitForTimeout(800);
    row.previousLabel = (await page.locator('[data-testid="camera-label"]').innerText().catch(() => '')).slice(0, 120);
    // Present: the rendering full screen, labelled as illustration
    await page.locator('[data-testid="render-present"]').first().click();
    await page.waitForTimeout(2000);
    row.present = {
      on: await page.locator('[data-testid="massing-3d"]').getAttribute('data-present').catch(() => null),
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
      revision: at('plan-revision'), interactive3d: at('3d-interactive'), renderingFrame: at('rendering-frame'),
      cameras: tl.filter(m => m.name === 'camera').map(m => `${m.detail?.requested}→${m.detail?.shown}`),
    };
    if (!row.camera) throw new Error('no camera label after asking for the street view');
    if (row.cameraFallback === 'true' && !/requested · showing the aerial instead: /.test(row.shotNote ?? '')) throw new Error('fallback without a reason');
    // an eye-level street camera is accepted only with its measured view of the building, and never one that mostly hides it
    if (row.cameraFallback !== 'true') {
      if (!row.streetSeen) throw new Error(`street camera without a measured view of its building: ${row.streetBasis}`);
      if (row.streetSeen.visible < 0.3) throw new Error(`street camera shows ${Math.round(row.streetSeen.visible * 100)}% of ${row.streetSeen.subject}`);
    }
    if (row.present?.on !== 'true' || !/Present/.test(row.present.label ?? '')) throw new Error(`Present shows the wrong label: ${JSON.stringify(row.present)}`);
    if (!/Fit site/.test(row.fit?.label ?? '') || !(row.fit?.heightFt > 60)) throw new Error(`Fit site did not rise to the whole site: ${JSON.stringify(row.fit)}`);
    if (row.look !== 'rendering' || row.lookToggle !== 0) throw new Error(`3D is not the single rendered view: look ${row.look}, review toggle ${row.lookToggle}`);
    if (row.planLines?.pressed !== 'true' || !row.planLines.legend || row.planLines.cameraKept === false) throw new Error(`Plan lines did not draw over the rendering in place: ${JSON.stringify(row.planLines)}`);
    if (row.timeline.revision == null || row.timeline.interactive3d == null) throw new Error('timeline missing the plan revision or 3D milestone');
  } catch (e) {
    row.problem = String(e.message ?? e).slice(0, 240);
    await page.screenshot({ path: path.join(out, `${p.id}-problem.png`) }).catch(() => {});
  }
  row.errors = errors.slice(0, 5);
  results.push(row);
  await context.close();
}
// The audit's small laptop (F5): at 1280×720, how much of the window the drawing gets, what stands above
// it, and how much of it the overlays (toolbar, legend, title) cover. Measured, not judged.
const layout = [];
for (const p of PARCELS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => { try { localStorage.setItem('pp.visited', '1'); } catch { /* private */ } });
  const page = await context.newPage();
  const row = { parcel: p.name };
  try {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const box = page.locator('[data-testid="start-search"]').first();
    await box.waitFor({ state: 'visible', timeout: 30000 });
    await box.fill(p.apn ?? p.address);
    await page.locator('[data-testid="start-results"] li button').first().click({ timeout: 20000 });
    await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 20000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const tl = await page.evaluate(() => window.__ppTimeline ?? []);
      if (tl.some(m => m.name === 'plan-revision')) break;
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(4000);
    Object.assign(row, await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const drawings = [...document.querySelectorAll('svg, canvas')].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
      const d = drawings[0];
      if (!d) return { drawing: null };
      const R = d.r;
      // bands above the drawing that span most of its width
      const bands = [...document.body.querySelectorAll('div, header, nav, section')].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.bottom <= R.top + 1 && r.width >= R.width * 0.6 && r.height >= 14 && r.height < 300)
        .map(({ el, r }) => ({ id: el.getAttribute('data-testid') ?? el.className.toString().slice(0, 40), top: Math.round(r.top), h: Math.round(r.height) }));
      // overlays standing over the drawing
      let covered = 0;
      const overlays = [];
      for (const el of document.querySelectorAll('div, button, aside')) {
        if (!vis(el) || el.contains(d.el)) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        const w = Math.max(0, Math.min(r.right, R.right) - Math.max(r.left, R.left)), h = Math.max(0, Math.min(r.bottom, R.bottom) - Math.max(r.top, R.top));
        if (w * h < 400) continue;
        // only what is actually on top: a panel stacked behind the planner covers nothing
        const cx = Math.max(r.left, R.left) + w / 2, cy = Math.max(r.top, R.top) + h / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top || !(el === top || el.contains(top))) continue;
        // document order: an overlay's own children come after it and are not counted again
        if (overlays.some(o => o.el.contains(el))) continue;
        overlays.push({ el, id: el.getAttribute('data-testid') ?? el.className.toString().slice(0, 40), area: Math.round(w * h) });
        covered += w * h;
      }
      return {
        drawing: { left: Math.round(R.left), top: Math.round(R.top), w: Math.round(R.width), h: Math.round(R.height), shareOfWindow: Math.round((R.width * R.height) / (innerWidth * innerHeight) * 100) },
        bandsAbove: bands.sort((a, b) => a.top - b.top).slice(0, 12),
        overlaysCoverPct: Math.round(Math.min(1, covered / (R.width * R.height)) * 100),
        overlays: overlays.sort((a, b) => b.area - a.area).slice(0, 8).map(({ id, area }) => ({ id, area })),
      };
    }));
    await page.screenshot({ path: path.join(out, `${p.id}-1280x720.png`) });
  } catch (e) {
    row.problem = String(e.message ?? e).slice(0, 200);
  }
  layout.push(row);
  await context.close();
}
for (const l of layout) console.log(`LAYOUT 1280×720 ${l.parcel} | ${JSON.stringify(l)}`);

await browser.close();
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ base, at: new Date().toISOString(), results, layout }, null, 2) + '\n');
for (const r of results) {
  console.log(`${r.problem ? 'FAIL' : 'OK  '} ${r.parcel} (${r.id}) | 3D ${r.viewport3d} dock ${r.dockBefore3d}→${r.dockIn3d}→${r.dockBack2d} | ${r.camera} | ${r.shotNote ?? 'no fallback'} | 4K button "${r.fourK}" | present ${JSON.stringify(r.present ?? null)} | look ${r.look} trees fetched ${r.treeFetches} plan lines ${JSON.stringify(r.planLines ?? null)} | fit ${JSON.stringify(r.fit ?? null)} previous "${r.previousLabel ?? ''}"  timeline ${JSON.stringify(r.timeline)}${r.problem ? ` | ${r.problem}` : ''}`);
}
const failed = results.filter(r => r.problem);
if (failed.length) { console.log(`${failed.length} of ${results.length} parcels failed`); process.exit(1); }
console.log(`all ${results.length} parcels passed`);

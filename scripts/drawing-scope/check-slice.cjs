// Drawing-scope check, first slice: one saved multifamily parcel, one building, three views.
// Drives the dev server (:5199) against the visual battery's mock store and fails unless the plan,
// the 3D inspector and sheet A-01 state the same building id, footprint, stories and height, the
// selection survives the 2D/3D switch in both directions, and the classic path is still there.
// Writes screenshots, the sheets (SVG and PDF, letter and 11 x 17) and a screen recording to OUT_DIR.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/drawing-scope/check-slice.cjs OUT_DIR
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PARCEL = { ogc_fid: 488278, address: '1710 MEHARRY BLVD', zoning: 'RM20' };
const out = process.argv[2];
if (!out) { console.error('usage: node check-slice.cjs OUT_DIR'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

async function openPlanner(page, query = '') {
  await page.goto('http://localhost:5199/' + query, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const trial = page.getByText('Start Free Trial').first();
  if (await trial.isVisible().catch(() => false)) { await trial.click(); await page.waitForTimeout(2500); }
  const skip = page.getByText('Skip Tour').first();
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  await page.evaluate(parcel => document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel })), PARCEL);
  await page.waitForTimeout(1200);
  await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
  await page.waitForFunction(() => (window.__planEvidence?.elementCount ?? window.__planEvidence?.elements ?? 1) && !!window.__planEvidence?.solvedBy, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
}
const to3d = async page => {
  const t0 = Date.now();
  await page.getByText('3D Massing', { exact: true }).first().click();
  await page.waitForSelector('[data-testid="massing-3d"] canvas', { timeout: 30000 });
  const ms = Date.now() - t0;
  await page.waitForTimeout(2500);
  return ms;
};
const to2d = async page => {
  await page.getByText('2D Plan', { exact: true }).first().click();
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1152, height: 720 } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await openPlanner(page);
  const scene = await page.evaluate(() => window.__planEvidence?.scene ?? null);
  check(!!scene, 'the workspace builds a drawing scene');
  const b = scene?.buildings?.[0];
  check(scene?.buildings?.length === 1 && b?.tag === 'A', 'the scene carries one building, tagged A');
  check(scene?.frame?.check?.status === 'verified', `the frame is verified against the engine's footprint (${scene?.frame?.check?.note ?? 'no check'})`);
  check(scene?.schedule?.consistent === true, 'the drawn units and stalls add up to the scheme schedule');
  check(b?.heightBasis === 'estimated', 'the height is marked as estimated');
  await page.screenshot({ path: path.join(out, 'plan.png') });

  // 3D: select by tag, read the inspector
  const first3dMs = await to3d(page);
  check((await page.locator('[data-testid="scene-inspector"]').count()) === 0, 'nothing is selected on first entry to 3D');
  await page.locator('[data-testid="scene-select-A"]').click();
  await page.waitForSelector('[data-testid="scene-inspector"]', { timeout: 5000 });
  const field = name => page.locator(`[data-testid="scene-inspector"] [data-field="${name}"]`).first().evaluate(n => n.childNodes[0].textContent.trim());
  const insp = { id: await field('id'), tag: await field('tag'), floors: await field('floors'), footprint: await field('footprint'), height: await field('height') };
  const heightLabel = await page.locator('[data-testid="scene-inspector"] [data-field="height"]').evaluate(n => n.previousElementSibling.textContent.trim());
  const note = await page.locator('[data-testid="scene-inspector"] [data-field="height-note"]').textContent();
  check(insp.id === b?.id && insp.tag === 'A', `3D inspector shows the plan's building id (${insp.id})`);
  check(insp.floors === `${b?.floors} stories`, `3D inspector stories: ${insp.floors}`);
  check(insp.footprint === `${Number(b?.footprintSqFt).toLocaleString('en-US')} sf`, `3D inspector footprint: ${insp.footprint}`);
  check(insp.height === `${b?.heightFt} ft` && heightLabel === 'Estimated height', `3D inspector height: ${heightLabel} ${insp.height}`);
  check(/Not a measured or controlling height/.test(note ?? ''), '3D inspector says the height is not measured or controlling');
  await page.screenshot({ path: path.join(out, 'model_selected.png') });

  // 3D to 2D: the plan opens on the same selection, with the same values
  await to2d(page);
  const planSel = page.locator('[data-testid="plan-selected-building"]');
  check((await planSel.count()) === 1 && (await planSel.getAttribute('data-feature-id')) === b?.id, 'the plan opens on the building selected in 3D');
  const planText = (await planSel.textContent().catch(() => '')) ?? '';
  check(planText.includes('A') && planText.includes(insp.footprint) && planText.includes(`estimated height ${insp.height}`), `plan panel: ${planText.trim()}`);
  await page.screenshot({ path: path.join(out, 'plan_selected.png') });

  // 2D to 3D: the model opens on it too
  await to3d(page);
  check((await page.locator('[data-testid="scene-inspector"]').getAttribute('data-feature-id').catch(() => null)) === b?.id, 'the 3D view opens on the building selected in the plan');
  await page.locator('[data-testid="scene-inspector"] button[aria-label="Clear selection"]').click();
  await to2d(page);
  check((await page.locator('[data-testid="plan-selected-building"]').count()) === 0, 'clearing the selection in 3D clears it in the plan');

  // the sheet
  await page.locator('[data-testid="open-sheets"]').click();
  await page.waitForSelector('[data-testid="sheet-a01"] svg', { timeout: 10000 });
  const row = await page.locator(`[data-testid="sheet-a01"] [data-schedule-row="${b?.id}"]`).evaluate(n => [...n.querySelectorAll('text')].map(t => t.textContent)).catch(() => null);
  check(!!row && row[0] === 'A' && row[2] === String(b?.floors) && row[3] === insp.footprint && row[4] === `est. ${insp.height}`, `sheet A-01 schedule row: ${JSON.stringify(row)}`);
  check((await page.locator(`[data-testid="sheet-a01"] path[data-role="building"][data-feature-id="${b?.id}"]`).count()) === 1, 'sheet A-01 draws that building once');
  check((await page.locator(`[data-testid="sheet-a01"] [data-label="building-tag"][data-feature-id="${b?.id}"]`).count()) === 1, 'sheet A-01 tags it A');
  const scaleText = await page.locator('[data-testid="sheet-a01"] [data-role="numeric-scale"]').textContent();
  check(/^Scale 1" = \d+' at full size \(17 × 11 in\)$/.test(scaleText ?? ''), `11 x 17 sheet scale: ${scaleText}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'sheet_A-01_11x17.png') });
  const sheets = {};
  sheets.tabloid = await page.locator('[data-testid="sheet-a01"]').innerHTML();
  await page.locator('[data-testid="sheet-size-letter"]').click();
  await page.waitForTimeout(400);
  sheets.letter = await page.locator('[data-testid="sheet-a01"]').innerHTML();
  check(/width="11in" height="8.5in"/.test(sheets.letter), 'the letter sheet is 11 x 8.5 in');
  await page.screenshot({ path: path.join(out, 'sheet_A-01_letter.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await page.locator('[data-testid="exhibit-sheets"]').count()) === 0, 'Escape closes the sheets');
  check((await page.locator('text=Site Planner Error').count()) === 0, 'no error boundary on the page');
  const real = errors.filter(e => !/maxTextureDimension2D/.test(e));
  check(real.length === 0, `no page errors${real.length ? ': ' + real.join(' | ').slice(0, 300) : ''}`);
  const video = page.video();
  await page.close();
  await ctx.close();
  if (video) fs.renameSync(await video.path(), path.join(out, 'slice.webm'));

  // the print set: each sheet as SVG and as a PDF at its page size
  const pctx = await browser.newContext();
  for (const [size, w, h] of [['tabloid', '17in', '11in'], ['letter', '11in', '8.5in']]) {
    const name = `A-01_site-plan_${size === 'tabloid' ? '11x17' : 'letter'}`;
    fs.writeFileSync(path.join(out, `${name}.svg`), sheets[size]);
    const p = await pctx.newPage();
    await p.setContent(`<!doctype html><html><head><style>@page{size:${w} ${h};margin:0}html,body{margin:0}svg{display:block;width:${w};height:${h}}</style></head><body>${sheets[size]}</body></html>`);
    await p.pdf({ path: path.join(out, `${name}.pdf`), width: w, height: h, printBackground: true, pageRanges: '1' });
    await p.close();
  }
  await pctx.close();

  // the original path is still there
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cpage = await cctx.newPage();
  await openPlanner(cpage, '?drawing=classic');
  check((await cpage.evaluate(() => window.__planEvidence?.scene ?? null)) === null, 'with ?drawing=classic no scene is built');
  check((await cpage.locator('[data-testid="open-sheets"]').count()) === 0, 'with ?drawing=classic the workspace is the original one');
  await cpage.screenshot({ path: path.join(out, 'classic_plan.png') });
  await cctx.close();

  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify({ parcel: PARCEL, scene, inspector: insp, sheetRow: row, sheetScale: scaleText, first3dMs, fails }, null, 1));
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

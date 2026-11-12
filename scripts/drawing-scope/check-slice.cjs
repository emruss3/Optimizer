// Drawing-scope check: one saved multifamily parcel, one building, three views.
// Drives the dev server (:5199) against the visual battery's mock store and fails unless
//  - the plan, the 3D inspector and sheet A-01 state the same building id, footprint, stories and height,
//  - the selection survives the 2D/3D switch in both directions,
//  - the 3D view is the rendering and has drawn a picture,
//  - the sheet is laid over a render of the plan, and falls back to the drawn plan on request,
//  - the classic path is still there.
// Writes screenshots, the sheets (SVG and PDF) and a screen recording to OUT_DIR.
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
  const trial = page.locator('[data-testid="landing-start"]').first();
  if (await trial.isVisible().catch(() => false)) { await trial.click(); await page.waitForTimeout(2500); }
  const skip = page.getByText('Skip Tour').first();
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
  await page.evaluate(parcel => document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel })), PARCEL);
  await page.waitForTimeout(1200);
  await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
  await page.waitForFunction(() => !!window.__planEvidence?.solvedBy, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
}
const to3d = async page => {
  const t0 = Date.now();
  await page.getByText('3D Massing', { exact: true }).first().click();
  await page.waitForSelector('[data-testid="massing-3d"] canvas', { timeout: 30000 });
  await page.waitForSelector('[data-testid="massing-3d"][data-ready="true"]', { timeout: 60000 }).catch(() => {});
  const ms = Date.now() - t0;
  await page.waitForTimeout(3500);
  return ms;
};
const to2d = async page => {
  await page.getByText('2D Plan', { exact: true }).first().click();
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
};
// how many different colours the 3D canvas holds, sampled coarsely: a blank or failed frame has one or two
const colours = page => page.evaluate(() => {
  const c = document.querySelector('[data-testid="massing-3d"] canvas');
  if (!c) return 0;
  const t = document.createElement('canvas');
  t.width = 96; t.height = 60;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0, 96, 60);
  const d = x.getImageData(0, 0, 96, 60).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`);
  return seen.size;
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: out, size: { width: 1152, height: 720 } } });
  // this machine draws on its processor, where the app would choose its lighter picture: the main run asks for the full one
  await ctx.addInitScript(() => { window.__renderQuality = 'full'; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // the photoreal pass: a signed-in user, and the app's function stood in for.
  // The stand-in records what the app sends and returns a small picture.
  await page.addInitScript(() => {
    localStorage.setItem('kissy-auth', JSON.stringify({
      access_token: 'check-session-token', token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: 'check-refresh', user: { id: 'check-user', aud: 'authenticated', role: 'authenticated', email: 'check@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  const PAINTED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFUlEQVR4nGP8z8Dwn4EBB2AcqEoA6oQGAeu1fJkAAAAASUVORK5CYII=';
  const sent = [];
  await page.route('**/api/photoreal', async route => {
    const req = route.request();
    sent.push({ auth: req.headers().authorization, body: JSON.parse(req.postData() || '{}') });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ image: PAINTED, model: 'stand-in' }) });
  });

  await openPlanner(page);
  const scene = await page.evaluate(() => window.__planEvidence?.scene ?? null);
  check(!!scene, 'the workspace builds a drawing scene');
  const b = scene?.buildings?.[0];
  check(scene?.buildings?.length === 1 && b?.tag === 'A', 'the scene carries one building, tagged A');
  check(scene?.frame?.check?.status === 'verified', `the frame is verified against the engine's footprint (${scene?.frame?.check?.note ?? 'no check'})`);
  check(scene?.schedule?.consistent === true, 'the drawn units and stalls add up to the scheme schedule');
  check(b?.heightBasis === 'estimated', 'the height is marked as estimated');
  await page.screenshot({ path: path.join(out, 'plan.png') });

  // 3D: the rendering, a picture on it, select by tag, read the inspector
  const first3dMs = await to3d(page);
  const view = page.locator('[data-testid="massing-3d"]');
  check((await view.getAttribute('data-rendered')) === 'pbr' && (await view.getAttribute('data-ready')) === 'true', 'the 3D view is the rendering and it is ready');
  const seen = await colours(page);
  check(seen > 60, `the rendering has drawn a picture (${seen} colours sampled)`);
  check((await page.locator('[data-testid="scene-inspector"]').count()) === 0, 'nothing is selected on first entry to 3D');
  // the 3D view opens for review: the proposal in its materials, the neighbours plain, the parcel and the access marked
  check((await view.getAttribute('data-look')) === 'review' && (await page.locator('[data-testid="review-legend"]').count()) === 1, 'the 3D view opens in the review view, with its legend');
  check(/Parcel/.test((await page.locator('[data-testid="review-legend"]').textContent()) ?? '') && /Access/.test((await page.locator('[data-testid="review-legend"]').textContent()) ?? ''), 'the legend names the parcel line and the access');
  await view.screenshot({ path: path.join(out, 'model_review.png') });
  // Present shows the rendering, whichever view was chosen, and gives the review back
  await page.locator('[data-testid="render-present"]').click();
  await page.waitForSelector('[data-testid="massing-3d"][data-look="rendering"]', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  check((await view.getAttribute('data-look')) === 'rendering' && (await colours(page)) > 60, 'Present shows the rendering');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(4000);
  check((await view.getAttribute('data-look')) === 'review', 'and Escape returns to the review view');
  // the rest of this run reads the rendering
  await page.locator('[data-testid="look-rendering"]').click();
  await page.waitForTimeout(6000);
  check((await view.getAttribute('data-look')) === 'rendering' && (await page.locator('[data-testid="review-legend"]').count()) === 0, 'Rendering is one click away');
  await view.screenshot({ path: path.join(out, 'model_aerial.png') });
  await page.locator('[data-testid="camera-street"]').click();
  await page.waitForTimeout(3000);
  await view.screenshot({ path: path.join(out, 'model_street.png') });
  await page.locator('[data-testid="camera-top"]').click();
  await page.waitForTimeout(2000);
  await page.locator('[data-testid="camera-fit"]').click();
  await page.locator('[data-testid="camera-iso"]').click();
  await page.waitForTimeout(2000);
  check((await colours(page)) > 60, 'the cameras (Street, Top, Fit site, Aerial) each leave a picture');
  // the buildings can be shown in four styles: a change redraws them, keeps the camera and the facts, and is remembered
  const picker = page.locator('[data-testid="arch-style"]');
  check((await picker.count()) === 1 && (await picker.inputValue()) === 'mansard' && (await picker.locator('option').count()) === 4, 'the 3D view offers four styles and opens in the first');
  const signature = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="massing-3d"] canvas');
    const t = document.createElement('canvas');
    t.width = 64; t.height = 40;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0, 64, 40);
    return Array.from(x.getImageData(0, 0, 64, 40).data).filter((_, i) => i % 4 !== 3).map(v => v >> 4);
  });
  const far = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 1 ? 1 : 0), 0) / a.length;
  const asMansard = await signature();
  for (const style of ['farmhouse', 'modern', 'heritage']) {
    await picker.selectOption(style);
    await page.waitForSelector('[data-testid="massing-3d"][data-ready="true"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const now = await signature();
    const moved = far(asMansard, now);
    check((await picker.inputValue()) === style && moved > 0.004 && moved < 0.25, `the ${style} style redraws the buildings from the same camera (${(moved * 100).toFixed(1)}% of the picture changed)`);
    await view.screenshot({ path: path.join(out, `model_style_${style}.png`) });
  }
  check((await page.evaluate(() => localStorage.getItem('pp.archStyle'))) === 'heritage', 'the choice of style is kept on this device');
  await picker.selectOption('mansard');
  await page.waitForSelector('[data-testid="massing-3d"][data-ready="true"]', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  check(far(asMansard, await signature()) < 0.02, 'and the first style comes back as it was');
  // the rendering fills the window on request, and Escape gives the workspace back
  await page.locator('[data-testid="render-present"]').click();
  await page.waitForTimeout(2500);
  const full = await view.boundingBox();
  check(!!full && full.width >= 1430 && full.height >= 890, 'Present fills the window with the rendering');
  await page.screenshot({ path: path.join(out, 'model_present.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  check((await view.count()) === 1 && (await view.getAttribute('data-present').catch(() => null)) === 'false', 'Escape returns from Present, and the workspace stays open');
  // the photoreal pass from the 3D view
  await page.locator('[data-testid="render-photoreal"]').click();
  await page.waitForSelector('[data-testid="photoreal-image"]', { timeout: 60000 });
  check((await page.locator('[data-testid="photoreal-image"]').getAttribute('src')) === PAINTED, 'Photoreal shows the picture the image service returns');
  check(/AI impression/.test((await page.locator('[data-testid="photoreal-note"]').textContent()) ?? ''), 'and labels it an AI impression, not a design');
  const first = sent[0];
  check(!!first && first.auth === 'Bearer check-session-token', 'the request carries the user\'s session');
  check(!!first && Object.keys(first.body).sort().join() === 'image,product,stories,style,view' && /^data:image\/jpeg;base64,/.test(first.body.image), `only the picture and four fixed words are sent (${first ? Object.keys(first.body).sort().join() : 'nothing'})`);
  check(!!first && first.body.product === 'apartments' && first.body.stories === 4 && first.body.view === 'aerial' && first.body.style === 'mansard', `the scene is described from fixed lists: ${first ? [first.body.product, first.body.stories, first.body.view, first.body.style].join(', ') : ''}`);
  check(!!first && !/MEHARRY|488278/i.test(JSON.stringify({ ...first.body, image: '' })), 'no address or parcel number is in the request');
  await page.screenshot({ path: path.join(out, 'photoreal_view.png') });
  await page.locator('[data-testid="photoreal-back"]').click();
  check((await page.locator('[data-testid="photoreal-view"]').count()) === 0, 'Back to model returns to the rendering');
  await page.locator('[data-testid="scene-select-A"]').click();
  await page.waitForSelector('[data-testid="scene-inspector"]', { timeout: 90000 });
  const field = name => page.locator(`[data-testid="scene-inspector"] [data-field="${name}"]`).first().evaluate(n => n.childNodes[0].textContent.trim());
  const insp = { id: await field('id'), tag: await field('tag'), floors: await field('floors'), footprint: await field('footprint'), height: await field('height') };
  const heightLabel = await page.locator('[data-testid="scene-inspector"] [data-field="height"]').evaluate(n => n.previousElementSibling.textContent.trim());
  const note = await page.locator('[data-testid="scene-inspector"] [data-field="height-note"]').textContent();
  check(insp.id === b?.id && insp.tag === 'A', `3D inspector shows the plan's building id (${insp.id})`);
  check(insp.floors === `${b?.floors} stories`, `3D inspector stories: ${insp.floors}`);
  check(insp.footprint === `${Number(b?.footprintSqFt).toLocaleString('en-US')} sf`, `3D inspector footprint: ${insp.footprint}`);
  check(insp.height === `${b?.heightFt} ft` && heightLabel === 'Estimated height', `3D inspector height: ${heightLabel} ${insp.height}`);
  check(/Not a measured or controlling height/.test(note ?? ''), '3D inspector says the height is not measured or controlling');
  check(/illustrative/.test((await view.textContent()) ?? ''), 'the rendering says its facades, planting and cars are illustrative');
  await page.waitForTimeout(1200);
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

  // the sheet: a slide first, laid over a render of the plan
  const sheet = page.locator('[data-testid="sheet-a01"]');
  const rendered = () => page.waitForSelector('[data-testid="sheet-a01"][data-sheet-style="rendered"]', { timeout: 120000 }).then(() => true).catch(() => false);
  await page.locator('[data-testid="open-sheets"]').click();
  await page.waitForSelector('[data-testid="sheet-a01"] svg', { timeout: 60000 });
  check(await rendered(), 'the sheet is laid over a render of the plan');
  check((await sheet.locator('image[data-role="underlay"]').count()) === 1, 'the render is on the sheet, under the linework');
  const row = await sheet.locator(`[data-schedule-row="${b?.id}"]`).evaluate(n => [...n.querySelectorAll('text')].map(t => t.textContent)).catch(() => null);
  check(!!row && row[0] === 'A' && row[2] === String(b?.floors) && row[3] === insp.footprint && row[4] === `est. ${insp.height}`, `sheet A-01 schedule row: ${JSON.stringify(row)}`);
  check((await sheet.locator(`path[data-role="building"][data-feature-id="${b?.id}"]`).count()) === 1, 'sheet A-01 draws that building once');
  check((await sheet.locator(`[data-label="building-tag"][data-feature-id="${b?.id}"]`).count()) === 1, 'sheet A-01 tags it A');
  check((await sheet.locator('[data-site-data]').count()) >= 4, 'sheet A-01 carries a site data table');
  check(((await sheet.locator('[data-role="numeric-scale"]').textContent()) ?? '') === 'Graphic scale', 'the slide states no numeric scale');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'sheet_A-01_slide.png') });
  const sheets = {};
  sheets.slide = await sheet.innerHTML();
  await page.locator('[data-testid="sheet-size-tabloid"]').click();
  check(await rendered(), 'the 11 x 17 sheet is rendered too');
  const scaleText = await sheet.locator('[data-role="numeric-scale"]').textContent();
  check(/^Scale 1" = \d+' at full size \(17 × 11 in\)$/.test(scaleText ?? ''), `11 x 17 sheet scale: ${scaleText}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'sheet_A-01_11x17.png') });
  sheets.tabloid = await sheet.innerHTML();
  // A-02: the aerial view as a sheet
  await page.locator('[data-testid="sheet-tab-view"]').click();
  const a02 = page.locator('[data-testid="sheet-a02"]');
  const viewReady = await page.waitForSelector('[data-testid="sheet-a02"][data-sheet-style="rendered"]', { timeout: 120000 }).then(() => true).catch(() => false);
  check(viewReady && (await a02.locator('image[data-role="rendering"]').count()) === 1, 'sheet A-02 carries a rendering of the scheme');
  check(/are illustration, not a design/.test((await a02.locator('[data-role="view-note"]').textContent()) ?? ''), 'sheet A-02 says what is illustration');
  check((await a02.locator('[data-figure]').count()) >= 3, 'sheet A-02 carries the scheme\'s figures');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'sheet_A-02_11x17.png') });
  sheets.view = await a02.innerHTML();
  // the same pass on the sheet
  await page.locator('[data-testid="sheet-photoreal"]').click();
  const paintedSheet = await page.waitForSelector('[data-testid="sheet-a02"][data-sheet-style="photoreal"]', { timeout: 60000 }).then(() => true).catch(() => false);
  check(paintedSheet && /AI IMPRESSION/.test((await a02.textContent()) ?? ''), 'sheet A-02 takes the photoreal picture and says it is an AI impression');
  await page.locator('[data-testid="sheet-picture-model"]').click();
  check((await a02.getAttribute('data-sheet-style')) === 'rendered', 'and the model rendering is one click back');
  await page.locator('[data-testid="sheet-tab-plan"]').click();
  await page.waitForSelector('[data-testid="sheet-a01"] svg', { timeout: 60000 });
  await page.locator('[data-testid="sheet-style-drawn"]').click();
  await page.waitForSelector('[data-testid="sheet-a01"][data-sheet-style="drawn"]', { timeout: 5000 });
  check((await sheet.locator('image[data-role="underlay"]').count()) === 0 && (await sheet.locator('[data-role="shadows"]').count()) === 1, 'the drawn plan is one click away');
  await page.locator('[data-testid="sheet-size-letter"]').click();
  await page.waitForTimeout(400);
  sheets.letter_drawn = await sheet.innerHTML();
  check(/width="11in" height="8.5in"/.test(sheets.letter_drawn), 'the letter sheet is 11 x 8.5 in');
  await page.screenshot({ path: path.join(out, 'sheet_A-01_letter_drawn.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await page.locator('[data-testid="exhibit-sheets"]').count()) === 0, 'Escape closes the sheets');
  check((await page.locator('canvas[data-export="site-plan"]').count()) === 1, 'and leaves the workspace open under them');
  check((await page.locator('text=Site Planner Error').count()) === 0, 'no error boundary on the page');
  const real = errors.filter(e => !/maxTextureDimension2D/.test(e));
  check(real.length === 0, `no page errors${real.length ? ': ' + real.join(' | ').slice(0, 300) : ''}`);
  const video = page.video();
  await page.close();
  await ctx.close();
  if (video) fs.renameSync(await video.path(), path.join(out, 'slice.webm'));

  // the print set: each sheet as SVG and as a PDF at its page size
  const pctx = await browser.newContext();
  for (const [key, name, w, h] of [['slide', 'A-01_site-plan_slide_16x9', '13.333in', '7.5in'], ['tabloid', 'A-01_site-plan_11x17', '17in', '11in'], ['letter_drawn', 'A-01_site-plan_letter_drawn', '11in', '8.5in'], ['view', 'A-02_aerial-view_11x17', '17in', '11in']]) {
    const file = name;
    fs.writeFileSync(path.join(out, `${file}.svg`), sheets[key]);
    const p = await pctx.newPage();
    await p.setContent(`<!doctype html><html><head><style>@page{size:${w} ${h};margin:0}html,body{margin:0}svg{display:block;width:${w};height:${h}}</style></head><body>${sheets[key]}</body></html>`);
    await p.pdf({ path: path.join(out, `${file}.pdf`), width: w, height: h, printBackground: true, pageRanges: '1' });
    await p.close();
  }
  await pctx.close();

  // the original path is still there
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // left to itself on a machine with no graphics acceleration, the view draws its lighter picture and says so
  const lpage = await cctx.newPage();
  await openPlanner(lpage);
  const lightMs = await to3d(lpage);
  const lview = lpage.locator('[data-testid="massing-3d"]');
  const software = await lpage.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const i = gl && gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|software/i.test(i ? String(gl.getParameter(i.UNMASKED_RENDERER_WEBGL)) : ''); });
  if (software) {
    check((await lview.getAttribute('data-quality')) === 'light', 'on a machine with no graphics acceleration the 3D view chooses its lighter picture');
    check(/drawn simply/.test((await lview.textContent()) ?? ''), 'and says it is drawn simply');
    check((await lpage.evaluate(() => { const c = document.querySelector('[data-testid="massing-3d"] canvas'); const k = document.createElement('canvas'); k.width = 96; k.height = 60; const x = k.getContext('2d'); x.drawImage(c, 0, 0, 96, 60); const d = x.getImageData(0, 0, 96, 60).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(`${d[i] >> 3},${d[i + 1] >> 3},${d[i + 2] >> 3}`); return seen.size; })) > 60, `the lighter picture is drawn (ready ${Math.round(lightMs / 100) / 10} s after the click)`);
    await lview.screenshot({ path: path.join(out, 'model_light.png') });
  }
  await lpage.close();
  const cpage = await cctx.newPage();
  await openPlanner(cpage, '?drawing=classic');
  check((await cpage.evaluate(() => window.__planEvidence?.scene ?? null)) === null, 'with ?drawing=classic no scene is built');
  check((await cpage.locator('[data-testid="open-sheets"]').count()) === 0, 'with ?drawing=classic the workspace is the original one');
  await cpage.getByText('3D Massing', { exact: true }).first().click();
  await cpage.waitForSelector('[data-testid="massing-3d"] canvas', { timeout: 30000 });
  check((await cpage.locator('[data-testid="massing-3d"]').getAttribute('data-rendered')) === 'false', 'with ?drawing=classic the 3D view is the original massing');
  await cpage.waitForTimeout(3000);
  await cpage.screenshot({ path: path.join(out, 'classic_model.png') });
  await cctx.close();

  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify({ parcel: PARCEL, scene, inspector: insp, sheetRow: row, sheetScale: scaleText, first3dMs, fails }, null, 1));
  await browser.close();
  console.log(fails.length ? `\n${fails.length} failed` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

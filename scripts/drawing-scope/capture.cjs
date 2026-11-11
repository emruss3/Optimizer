// Drawing-scope evidence: the same parcels, viewports and views before and after a change.
// Drives the dev server (:5199) against the visual battery's mock store and saves, per parcel and
// viewport, the 2D sheet and the 3D view. Deterministic inputs: committed fixtures, fixed viewports,
// no basemap tiles.
//   node scripts/drawing-scope/capture.cjs OUT_DIR [fid ...]
// CAPTURE_QUERY=?drawing=classic captures the original drawing path.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FIXTURES = [
  { ogc_fid: 682644, address: '4701 BOWFIELD DR', zoning: 'R8', role: 'subdivision' },
  { ogc_fid: 488278, address: '1710 MEHARRY BLVD', zoning: 'RM20', role: 'multifamily, one building, surface parking' },
  { ogc_fid: 669046, address: '1200 W H DAVIS DR', zoning: 'RM40', role: 'multifamily, surface parking' },
  { ogc_fid: 469303, address: '535 MAIN ST', zoning: 'MUG-A', role: 'wrap round a garage and court' },
  { ogc_fid: 686430, address: '4255 BRICK CHURCH PIKE', zoning: 'R20', role: 'sloped site with flood and hillside holds' },
  { ogc_fid: 672526, address: '0 HICKORY BEND DR', zoning: 'RS10', role: 'no generated geometry (flood skip)' },
  { ogc_fid: 408571, address: '2405 12TH AVE S', zoning: 'CS', role: 'commercial capacity only' },
];
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900, views: ['2d', '3d'] },
  { name: '1920x1080', width: 1920, height: 1080, views: ['2d', '3d'] },
  { name: '1280x800', width: 1280, height: 800, views: ['2d'] },
];

const [out, ...only] = process.argv.slice(2);
if (!out) { console.error('usage: node capture.cjs OUT_DIR [fid ...]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const parcels = only.length ? FIXTURES.filter(f => only.includes(String(f.ogc_fid))) : FIXTURES;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const results = {};
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    for (const p of parcels) {
      const page = await ctx.newPage();
      const key = `${p.ogc_fid}_${vp.name}`;
      const t0 = Date.now();
      try {
        await page.goto('http://localhost:5199/' + (process.env.CAPTURE_QUERY || ''), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);
        const trial = page.getByText('Start Free Trial').first();
        if (await trial.isVisible().catch(() => false)) { await trial.click(); await page.waitForTimeout(2500); }
        const skip = page.getByText('Skip Tour').first();
        if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(800); }
        await page.evaluate(parcel => document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel })), p);
        await page.waitForTimeout(1200);
        await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
        await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
        await page.waitForTimeout(13000);
        await page.screenshot({ path: path.join(out, `${key}_2d.png`) });
        const scene = await page.evaluate(() => window.__planEvidence?.scene ?? null);
        const rec = { role: p.role, scene, ms2d: Date.now() - t0 };
        if (vp.views.includes('3d')) {
          const t1 = Date.now();
          const btn = page.getByText('3D Massing', { exact: true }).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click({ timeout: 10000 });
            // the 3D root carries a test id from the first drawing-scope slice on; before it, the wait times out
            const found = await page.waitForSelector('[data-testid="massing-3d"] canvas', { timeout: 15000 }).then(() => true).catch(() => false);
            if (found) rec.msFirst3d = Date.now() - t1;
            await page.waitForTimeout(5000);
            await page.screenshot({ path: path.join(out, `${key}_3d.png`) });
          } else rec.no3d = true;
        }
        results[key] = rec;
        console.log(`done ${key}`);
      } catch (e) {
        await page.screenshot({ path: path.join(out, `${key}_FAIL.png`) }).catch(() => {});
        results[key] = { error: String(e).slice(0, 300) };
        console.log(`FAIL ${key}: ${String(e).slice(0, 160)}`);
      }
      await page.close();
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close();
})();

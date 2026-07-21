import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-Optimizer/95899e1b-c1d4-5d12-92bb-5bf376ae4c76/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const ONE = process.env.ONE_PARCEL === '1';
const PARCELS = [
  { ogc_fid: 553450, address: '2600 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 667574, address: '2622 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 669046, address: '1200 W H DAVIS DR', zoning: 'RM40' },
  { ogc_fid: 488278, address: '1710 MEHARRY BLVD', zoning: 'RM20' },
];

const consoleErrors = {};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

for (const p of (ONE ? PARCELS.slice(0, 1) : PARCELS)) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 220));
  });
  page.on('pageerror', e => errs.push(String(e).slice(0, 220)));
  try {
    await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    // Past the landing page into the app shell.
    const trial = page.getByText('Start Free Trial').first();
    if (await trial.isVisible().catch(() => false)) {
      await trial.click();
      await page.waitForTimeout(2500);
    }
    // Dismiss the quick-tour overlay (it intercepts all clicks).
    const skip = page.getByText('Skip Tour').first();
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(800);
    }
    // Open the drawer via the app's own test event, then the planner.
    await page.evaluate(parcel => {
      document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel }));
    }, p);
    await page.waitForTimeout(1200);
    await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
    // Wait for the plan canvas, then let the solve settle.
    await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_2d.png` });
    // 3D massing
    await page.getByText('3D Massing', { exact: true }).first().click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_3d.png` });
    console.log(`OK ${p.ogc_fid} (${p.address})`);
  } catch (e) {
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_FAIL.png` }).catch(() => {});
    console.log(`FAIL ${p.ogc_fid}: ${String(e).slice(0, 200)}`);
  }
  consoleErrors[p.ogc_fid] = errs;
  await page.close();
}

fs.writeFileSync(`${OUT}/console_errors.json`, JSON.stringify(consoleErrors, null, 2));
await browser.close();
console.log('done');

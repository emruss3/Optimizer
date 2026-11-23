/**
 * PR #188 lead evidence: Delk 675423 street 3D before/after cottage apply.
 * Fixture-replay deep search (rev 316a0d36) vs cottage candidate abhp:1754-00010.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'qa/audits/2026-11-23-housing-delk-pr188');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.APP_URL || 'http://127.0.0.1:5199';
const parcel = { ogc_fid: 675423, address: '0 DELK AVE', zoning: 'RS5' };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('pp.inspector', 'open');
    localStorage.setItem('pp.dock', 'open');
  } catch { /* ignore */ }
});
const page = await ctx.newPage();
page.on('console', m => {
  if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200));
});

async function waitPlan() {
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 60000 });
  for (let i = 0; i < 45; i++) {
    const info = await page.evaluate(() => {
      const ev = window.__planEvidence ?? null;
      return {
        lots: ev?.sfV1?.lots ?? null,
        shown: ev?.sfV1?.shown ?? null,
        deep: document.querySelector('[data-testid="sfv1-deep-search"]')?.textContent ?? null,
        basis: ev?.basis ?? null,
        inspector: document.querySelector('[data-testid="inspector-toggle"]')?.getAttribute('aria-expanded') ?? null,
        picker: !!document.querySelector('[data-testid="housing-design-picker"]'),
      };
    });
    if (info.lots >= 5) return info;
    await page.waitForTimeout(1000);
  }
  return page.evaluate(() => {
    const ev = window.__planEvidence ?? null;
    return {
      lots: ev?.sfV1?.lots ?? null,
      shown: ev?.sfV1?.shown ?? null,
      deep: document.querySelector('[data-testid="sfv1-deep-search"]')?.textContent ?? null,
      basis: ev?.basis ?? null,
      picker: !!document.querySelector('[data-testid="housing-design-picker"]'),
    };
  });
}

async function ensureInspectorOpen() {
  const toggle = page.getByTestId('inspector-toggle');
  if (!(await toggle.isVisible().catch(() => false))) return false;
  const exp = await toggle.getAttribute('aria-expanded');
  if (exp !== 'true') {
    await toggle.click();
    await page.waitForTimeout(600);
  }
  return (await toggle.getAttribute('aria-expanded')) === 'true';
}

async function go2d() {
  const tab = page.getByText('2D Plan', { exact: true }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(800);
  }
  await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 30000 }).catch(() => {});
}

async function open3dStreet(label) {
  await page.getByText('3D Massing', { exact: true }).first().click({ timeout: 10000 });
  const state3d = await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="massing-3d"]');
    if (v?.getAttribute('data-rendered') === 'pbr') return v.getAttribute('data-ready') === 'true' ? 'ready' : false;
    if (v?.getAttribute('data-rendered') === 'true') return 'classic';
    return /Generate a plan to see the 3D massing/.test(document.body.innerText ?? '') ? 'no plan' : false;
  }, null, { timeout: 120000, polling: 500 }).then(h => h.jsonValue()).catch(() => null);

  // RenderView street control (preferred) or classic Massing3D bookmark
  const street = page.getByRole('button', { name: /^Street$/i }).first();
  if (await street.isVisible().catch(() => false)) {
    await street.click();
    await page.waitForTimeout(700);
  } else {
    const cam = page.getByTestId('camera-street');
    if (await cam.isVisible().catch(() => false)) await cam.click();
  }
  await page.waitForTimeout(state3d === 'ready' ? 1800 : 3000);

  const meta = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="massing-3d"]');
    let shot = null;
    try { shot = v?.getAttribute('data-shot') ? JSON.parse(v.getAttribute('data-shot')) : null; } catch { /* */ }
    const ev = window.__planEvidence ?? null;
    return {
      ready: v?.getAttribute('data-ready') ?? null,
      rendered: v?.getAttribute('data-rendered') ?? null,
      quality: v?.getAttribute('data-quality') ?? null,
      buildings: v?.getAttribute('data-buildings') ?? null,
      look: v?.getAttribute('data-look') ?? null,
      sceneKey: v?.getAttribute('data-scene-key') ?? null,
      shot,
      housingSelected: document.querySelector('[data-testid="housing-design-1754-00010"]')?.getAttribute('data-selected') ?? null,
      fitSummary: document.querySelector('[data-testid="housing-fit-summary"]')?.textContent ?? null,
      designId: ev?.housingDesignId ?? ev?.scene?.housingDesignId ?? null,
      evidenceHousing: ev?.housingDesignId ?? null,
      revisionFromShot: shot?.revision ?? null,
    };
  });

  const shotPath = path.join(OUT, label);
  await page.screenshot({ path: shotPath, timeout: 60000 });
  return { state3d, meta, shotPath };
}

console.log('goto', BASE);
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
const trial = page.locator('[data-testid="landing-start"]').first();
if (await trial.isVisible().catch(() => false)) {
  await trial.click();
  await page.waitForTimeout(2500);
}
const skip = page.getByText('Skip Tour').first();
if (await skip.isVisible().catch(() => false)) {
  await skip.click();
  await page.waitForTimeout(800);
}

await page.evaluate(p => {
  document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: p }));
}, parcel);
await page.waitForTimeout(1200);
await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });

const planInfo = await waitPlan();
console.log('plan settled', JSON.stringify(planInfo));
await ensureInspectorOpen();
await page.waitForTimeout(500);

await page.screenshot({ path: path.join(OUT, '675423_2d_pre-cottage.png'), timeout: 60000 });

const before = await open3dStreet('675423_3d_street_baseline-fixture_316a0d36.png');
console.log('before', before.state3d, 'rev', before.meta.revisionFromShot, 'shot', before.meta.shot?.shot, 'housing', before.meta.housingSelected);
fs.writeFileSync(path.join(OUT, 'meta-before.json'), JSON.stringify({ planInfo, commitHint: 'fixture deep search = production audit rev 316a0d36', ...before }, null, 2));

await go2d();
await ensureInspectorOpen();
await page.waitForTimeout(800);

// Scroll housing picker into view inside inspector
await page.evaluate(() => {
  document.querySelector('[data-testid="housing-design-picker"]')?.scrollIntoView({ block: 'center' });
  document.querySelector('[data-testid="sfv1-panel"]')?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(400);

const cottage = page.getByTestId('housing-design-1754-00010');
const pickerVisible = await page.getByTestId('housing-design-picker').isVisible().catch(() => false);
const cottageVisible = await cottage.isVisible().catch(() => false);
console.log('picker', pickerVisible, 'cottage', cottageVisible);

if (!cottageVisible) {
  // Dump inspector HTML snippet for diagnosis
  const dump = await page.evaluate(() => ({
    inspector: document.querySelector('[data-testid="inspector-toggle"]')?.getAttribute('aria-expanded'),
    sfv1: !!document.querySelector('[data-testid="sfv1-panel"]'),
    bodyHasHousing: /House design|1754-00010|parking pad/.test(document.body.innerText ?? ''),
    leftRail: document.querySelector('[data-testid="inspector-toggle"]')?.outerHTML?.slice(0, 200) ?? null,
  }));
  console.log('picker missing dump', dump);
  await page.screenshot({ path: path.join(OUT, '675423_picker_missing.png'), timeout: 60000 });
  throw new Error('housing cottage picker not visible — cannot complete cottage candidate street shot');
}

await cottage.click();
await page.waitForTimeout(3000);
const afterSelect = await page.evaluate(() => ({
  selected: document.querySelector('[data-testid="housing-design-1754-00010"]')?.getAttribute('data-selected'),
  fit: document.querySelector('[data-testid="housing-fit-summary"]')?.textContent ?? null,
  unplaced: Array.from(document.querySelectorAll('[data-testid="housing-unplaced"] li')).map(e => e.textContent),
  evidence: window.__planEvidence?.housingDesignId ?? null,
}));
console.log('after select', afterSelect);
await page.screenshot({ path: path.join(OUT, '675423_2d_cottage-selected.png'), timeout: 60000 });

const after = await open3dStreet('675423_3d_street_cottage-candidate_abhp-1754-00010.png');
console.log('after', after.state3d, 'rev', after.meta.revisionFromShot, 'shot', after.meta.shot?.shot, 'housing', after.meta.housingSelected, after.meta.fitSummary);
fs.writeFileSync(path.join(OUT, 'meta-after.json'), JSON.stringify({ afterSelect, ...after }, null, 2));

await browser.close();
console.log('DONE', OUT);

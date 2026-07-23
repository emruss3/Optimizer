// Headless visual battery: drives the real app (landing → tour → drawer →
// Site Planner) against either the mock Supabase (fixture mode) or a live
// backend, screenshots 2D + 3D per parcel, and — in ASSERT mode — machine-
// checks each parcel against expectations.json so it can gate merges.
//
// Env:
//   ASSERT=1        fail (exit 1) when a parcel violates expectations.json
//   SHOTS_DIR=...   output dir (screenshots + results.json + console_errors.json)
//   ONE_PARCEL=1    first parcel only (debug)
//   ALL_CONSOLE=1   capture all console output, not just errors
//   LIVE_RANDOM=1   append one random cohort parcel (advisory: never asserted)
//   CHROMIUM_PATH   explicit chromium binary (sandbox); default = playwright's
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOTS_DIR
  || '/tmp/claude-0/-home-user-Optimizer/95899e1b-c1d4-5d12-92bb-5bf376ae4c76/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const ONE = process.env.ONE_PARCEL === '1';
const ASSERT = process.env.ASSERT === '1';

const PARCELS = [
  { ogc_fid: 553450, address: '2600 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 667574, address: '2622 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 669046, address: '1200 W H DAVIS DR', zoning: 'RM40' },
  { ogc_fid: 488278, address: '1710 MEHARRY BLVD', zoning: 'RM20' },
];

// Live mode only: one extra parcel drawn from the sweep cohort, advisory —
// it must load and screenshot without crashing, but is never asserted
// (fixture mode has nothing stored for it, and floors need a history).
if (process.env.LIVE_RANDOM === '1') {
  try {
    const cohort = JSON.parse(fs.readFileSync(path.join(HERE, 'cohort.json'), 'utf8'));
    const pick = cohort[Math.floor(Math.random() * cohort.length)];
    PARCELS.push({ ogc_fid: pick, address: `COHORT ${pick}`, zoning: '', advisory: true });
  } catch { /* no cohort file — skip */ }
}

let expectations = {};
if (ASSERT) {
  expectations = JSON.parse(fs.readFileSync(path.join(HERE, 'expectations.json'), 'utf8'));
}

const consoleErrors = {};
const results = {};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

/** Judge one parcel's evidence against its expectation. Returns [] when clean. */
function judge(exp, ev) {
  if (!exp) return [];
  if (!ev) return ['no plan evidence surfaced (window.__planEvidence missing — did the workspace mount?)'];
  const errs = [];
  if (exp.mode === 'server-plan') {
    if (ev.solvedBy !== 'server') {
      errs.push(`expected the SERVER plan to render, got solvedBy=${ev.solvedBy ?? 'none'}`);
    }
    if ((ev.violationCodes ?? []).includes('server-plan-rejected')) {
      errs.push('server plan was rejected by the geometry gate');
    }
    // Capture from the server basis line: "achieved N (X%)"; utilization is
    // the fallback (same number, KPI-derived).
    const m = /achieved\s[\d,]+\s\((\d+(?:\.\d+)?)%\)/.exec(ev.basis ?? '');
    const capture = m ? parseFloat(m[1]) : (typeof ev.utilizationPct === 'number' ? ev.utilizationPct : null);
    if (typeof exp.minCapturePct === 'number') {
      if (capture == null) errs.push('capture % not found in basis or KPI');
      else if (capture < exp.minCapturePct) {
        errs.push(`capture ${capture}% below the floor ${exp.minCapturePct}% — floors only ratchet UP`);
      }
    }
  } else if (exp.mode === 'honest-refusal') {
    // Current known-good behavior for a defective server response: the plan
    // is rejected LOUDLY and the worker fallback renders. When the server is
    // fixed, flip this parcel to server-plan and set its floor.
    if (!(ev.violationCodes ?? []).includes('server-plan-rejected')) {
      errs.push('expected a loud SERVER-PLAN-REJECTED violation (honest-refusal machinery)');
    }
    if (ev.solvedBy !== 'worker') {
      errs.push(`expected the worker fallback to render, got solvedBy=${ev.solvedBy ?? 'none'}`);
    }
  }
  // CC-3a: the legacy client-frame envelope construction must never serve a
  // reference parcel — the brief's EPSG:2274-true envelope is the staging.
  if (exp.requireBriefEnvelope && ev.envelopeSource !== 'brief_2274_true') {
    errs.push(`expected envelopeSource=brief_2274_true, got ${ev.envelopeSource ?? 'none'} (legacy envelope path fired)`);
  }
  // Render-path smoke (ops lesson from the buildings RLS deny-all): a layer
  // that has data in the served responses must actually LOAD — an RLS change
  // can never silently blank the neighborhood render again.
  if (exp.requireNeighborLayers) {
    const nl = ev.neighborsLoaded;
    if (!nl) errs.push('neighbor layers never loaded (neighborsLoaded missing)');
    else {
      for (const layer of ['parcels', 'buildings', 'roads']) {
        if (exp.requireNeighborLayers[layer] && !(nl[layer] > 0)) {
          errs.push(`neighbor layer '${layer}' is EMPTY (RLS/data regression — expected > 0)`);
        }
      }
    }
  }
  return errs;
}

for (const p of (ONE ? PARCELS.slice(0, 1) : PARCELS)) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => {
    const t = m.text();
    if (process.env.ALL_CONSOLE === '1') errs.push(`[${m.type()}] ${t.slice(0, 300)}`);
    else if (m.type() === 'error') errs.push(t.slice(0, 220));
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
    // Evidence hook (DEV builds): what actually rendered, from the workspace.
    const evidence = await page.evaluate(() => window.__planEvidence ?? null);
    // 3D massing
    await page.getByText('3D Massing', { exact: true }).first().click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_3d.png` });

    const verdictErrs = p.advisory ? [] : judge(expectations[String(p.ogc_fid)], evidence);
    results[p.ogc_fid] = {
      ok: verdictErrs.length === 0,
      advisory: p.advisory ?? false,
      evidence,
      violations: verdictErrs,
    };
    console.log(
      `${verdictErrs.length === 0 ? 'OK' : 'GATE-FAIL'} ${p.ogc_fid} (${p.address})` +
      (verdictErrs.length ? ` — ${verdictErrs.join(' | ')}` : '')
    );
  } catch (e) {
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_FAIL.png` }).catch(() => {});
    results[p.ogc_fid] = { ok: false, advisory: p.advisory ?? false, evidence: null, violations: [`battery flow failed: ${String(e).slice(0, 200)}`] };
    console.log(`FAIL ${p.ogc_fid}: ${String(e).slice(0, 200)}`);
  }
  consoleErrors[p.ogc_fid] = errs;
  await page.close();
}

fs.writeFileSync(`${OUT}/console_errors.json`, JSON.stringify(consoleErrors, null, 2));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();

const gateFailures = Object.entries(results).filter(([, r]) => !r.ok && !r.advisory);
if (ASSERT && gateFailures.length) {
  console.log(`BATTERY GATE: ${gateFailures.length} parcel(s) violated expectations — see results.json`);
  process.exit(1);
}
console.log('done');

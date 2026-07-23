// DB acceptance battery — the SOLVER-side merge gate (audit 2026-07-21 CC-1).
//
// Runs the live generator (read-only: p_persist=false) for the fixed acceptance
// parcels + one rotating cohort parcel, and fails on any unexpected error,
// capture regression, composition regression, or refusal-contract regression.
// Capture = metrics.gfa_sqft / fn_max_buildout.max_gsf, computed from raw
// numbers, never parsed from display strings.
//
// Scope note: this gate checks NUMBERS, VERDICTS, and ERRORS at the solver
// boundary. Canonical fn_parcel_buildability refusals are reviewed outputs, not
// ladder failures. Geometry validity is the visual fixture-gate's job.
//
// Env:
//   BATTERY_SUPABASE_URL       PostgREST base (e.g. https://<ref>.supabase.co)
//   BATTERY_SUPABASE_ANON_KEY  anon key (read-only RPCs; publishable class)
//   COHORT_INDEX               optional override for the rotating pick
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_BASE = process.env.BATTERY_SUPABASE_URL;
const ANON = process.env.BATTERY_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) {
  console.error('BATTERY_SUPABASE_URL / BATTERY_SUPABASE_ANON_KEY not set — cannot run the DB battery.');
  process.exit(2);
}

const expectations = JSON.parse(fs.readFileSync(path.join(HERE, 'floors.json'), 'utf8'));
const FIXED = Object.keys(expectations).filter(k => /^\d+$/.test(k)).map(Number);

function normalizeExpectation(raw) {
  if (typeof raw === 'number') {
    return {
      minCapturePct: raw,
      maxBars: null,
      expectedVerdict: null,
      expectedReason: null,
    };
  }
  if (!raw || typeof raw !== 'object') {
    return {
      minCapturePct: null,
      maxBars: null,
      expectedVerdict: null,
      expectedReason: null,
    };
  }
  return {
    minCapturePct: Number.isFinite(Number(raw.minCapturePct)) ? Number(raw.minCapturePct) : null,
    maxBars: Number.isFinite(Number(raw.maxBars)) ? Number(raw.maxBars) : null,
    expectedVerdict: typeof raw.expectedVerdict === 'string' ? raw.expectedVerdict : null,
    expectedReason: typeof raw.expectedReason === 'string' ? raw.expectedReason : null,
  };
}

// One rotating cohort parcel per day (deterministic — no CI flake), asserted
// for "no unexpected error" only: floors need a history before they exist.
const cohort = JSON.parse(
  fs.readFileSync(path.join(HERE, '..', 'visual-battery', 'cohort.json'), 'utf8')
);
const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5);
const cohortPick = cohort[(Number(process.env.COHORT_INDEX ?? dayOfYear)) % cohort.length];

async function rpc(fn, args, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: ANON,
        authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${fn} HTTP ${res.status}: ${JSON.stringify(body)?.slice(0, 200)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

// Verdict-class refusals are legitimate solver outputs, not battery failures.
const ALLOWED_VERDICTS = new Set(['planner_generation_not_allowed']);

async function solveParcel(fid) {
  const compile = await rpc('fn_compile_planner_context', {
    p_ogc_fid: fid, p_use: 'multi_family', p_user_intent: null,
  });
  if (!compile || compile.error) {
    return { fid, error: `compile failed: ${compile?.error ?? 'empty response'}` };
  }
  const solve = await rpc('fn_generate_mf_site_plan_v2', {
    p_ogc_fid: fid, p_typology: 'multifamily', p_seed: 1, p_pins: null,
    p_parent: null, p_persist: false, p_context_id: compile.context_id,
  });
  if (!solve) return { fid, error: 'solve returned empty response' };
  if (solve.error && !ALLOWED_VERDICTS.has(solve.error)) {
    return { fid, error: `solver error: ${solve.error}` };
  }
  if (solve.error) {
    return {
      fid,
      verdict: solve.error,
      reason: solve.reason ?? null,
      verdictClass: solve.verdict_class ?? null,
      buildabilityVerdict: solve.buildability?.verdict ?? null,
      hasMetrics: Object.prototype.hasOwnProperty.call(solve, 'metrics'),
      hasPlanBasis: Object.prototype.hasOwnProperty.call(solve, 'plan_basis'),
    };
  }
  const gfa = solve.metrics?.gfa_sqft;
  if (typeof gfa !== 'number' || !(solve.buildings?.length > 0)) {
    return { fid, error: `no plan produced (generation: ${solve.generation ?? 'unknown'})` };
  }
  const mb = await rpc('fn_max_buildout', { p_ogc_fid: fid, p_typology: 'multifamily' });
  const maxGsf = mb?.max_gsf;
  const capture = typeof maxGsf === 'number' && maxGsf > 0 ? (gfa / maxGsf) * 100 : null;
  return {
    fid,
    gfa,
    maxGsf,
    capture,
    bars: solve.buildings.length,
    buildabilityVerdict: solve.buildability?.verdict ?? null,
  };
}

const failures = [];
for (const fid of FIXED) {
  try {
    const r = await solveParcel(fid);
    if (r.error) {
      failures.push(`${fid}: ${r.error}`);
      console.log(`FAIL ${fid} — ${r.error}`);
      continue;
    }

    const exp = normalizeExpectation(expectations[String(fid)]);
    if (exp.expectedVerdict) {
      if (r.verdict !== exp.expectedVerdict) {
        failures.push(`${fid}: expected verdict ${exp.expectedVerdict}, got ${r.verdict ?? 'plan'}`);
        console.log(`FAIL ${fid} — expected verdict ${exp.expectedVerdict}, got ${r.verdict ?? 'plan'}`);
      } else if (exp.expectedReason && r.reason !== exp.expectedReason) {
        failures.push(`${fid}: expected reason ${exp.expectedReason}, got ${r.reason ?? 'none'}`);
        console.log(`FAIL ${fid} — expected reason ${exp.expectedReason}, got ${r.reason ?? 'none'}`);
      } else if (r.hasMetrics || r.hasPlanBasis) {
        failures.push(`${fid}: refusal leaked authoritative plan reporting`);
        console.log(`FAIL ${fid} — refusal leaked metrics or plan_basis`);
      } else {
        console.log(
          `OK   ${fid} — canonical verdict ${r.verdict}` +
          `${r.reason ? ` (${r.reason})` : ''}` +
          `${r.buildabilityVerdict ? ` · buildability ${r.buildabilityVerdict}` : ''}`
        );
      }
      continue;
    }

    if (r.verdict) {
      failures.push(`${fid}: floor parcel returned verdict ${r.verdict}${r.reason ? ` (${r.reason})` : ''}`);
      console.log(`FAIL ${fid} — floor parcel returned verdict ${r.verdict}${r.reason ? ` (${r.reason})` : ''}`);
      continue;
    }

    const cap = r.capture == null ? null : Math.round(r.capture * 10) / 10;
    if (exp.minCapturePct == null) {
      failures.push(`${fid}: invalid expectation configuration`);
      console.log(`FAIL ${fid} — invalid expectation configuration`);
    } else if (r.capture == null) {
      failures.push(`${fid}: capture not computable (max_gsf missing)`);
      console.log(`FAIL ${fid} — capture not computable`);
    } else if (r.capture < exp.minCapturePct - 0.05) {
      failures.push(`${fid}: capture ${cap}% below the floor ${exp.minCapturePct}%`);
      console.log(`FAIL ${fid} — capture ${cap}% < floor ${exp.minCapturePct}% (gfa ${r.gfa} / max ${r.maxGsf}, ${r.bars} bars)`);
    } else if (exp.maxBars != null && r.bars > exp.maxBars) {
      failures.push(`${fid}: ${r.bars} bars exceeds the reviewed cap ${exp.maxBars}`);
      console.log(`FAIL ${fid} — ${r.bars} bars > cap ${exp.maxBars} (capture ${cap}%)`);
    } else {
      const barReceipt = exp.maxBars == null ? `${r.bars} bars` : `${r.bars}/${exp.maxBars} bars`;
      console.log(`OK   ${fid} — capture ${cap}% ≥ floor ${exp.minCapturePct}% (gfa ${r.gfa} / max ${r.maxGsf}, ${barReceipt})`);
    }
  } catch (e) {
    failures.push(`${fid}: ${String(e).slice(0, 200)}`);
    console.log(`FAIL ${fid} — ${String(e).slice(0, 200)}`);
  }
}

// Rotating cohort parcel: error-check only.
try {
  const r = await solveParcel(cohortPick);
  if (r.error) {
    failures.push(`cohort ${cohortPick}: ${r.error}`);
    console.log(`FAIL cohort ${cohortPick} — ${r.error}`);
  } else if (r.verdict) {
    console.log(`OK   cohort ${cohortPick} — verdict ${r.verdict}${r.reason ? ` (${r.reason})` : ''}`);
  } else {
    console.log(`OK   cohort ${cohortPick} — capture ${r.capture == null ? 'n/a' : Math.round(r.capture * 10) / 10}% (advisory, no floor yet)`);
  }
} catch (e) {
  failures.push(`cohort ${cohortPick}: ${String(e).slice(0, 200)}`);
  console.log(`FAIL cohort ${cohortPick} — ${String(e).slice(0, 200)}`);
}

if (failures.length) {
  console.log(`\nDB BATTERY: ${failures.length} failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nDB BATTERY: all expectations held.');

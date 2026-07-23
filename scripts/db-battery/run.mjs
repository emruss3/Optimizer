// DB acceptance battery — the SOLVER-side merge gate (audit 2026-07-21 CC-1).
//
// Runs the live generator (read-only: p_persist=false) for the three floor
// parcels + one rotating cohort parcel, and fails on any unexpected error or
// any capture below its recorded floor (floors.json — floors only ratchet UP).
// Capture = metrics.gfa_sqft / fn_max_buildout.max_gsf, computed from raw
// numbers, never parsed from display strings.
//
// Scope note: this gate checks NUMBERS and ERRORS at the solver boundary.
// Geometry validity (overlaps, containment) is the visual fixture-gate's job
// (scripts/visual-battery) — the two compose.
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

const floors = JSON.parse(fs.readFileSync(path.join(HERE, 'floors.json'), 'utf8'));
const FIXED = Object.keys(floors).filter(k => /^\d+$/.test(k)).map(Number);

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
  if (solve.error) return { fid, verdict: solve.error };
  const gfa = solve.metrics?.gfa_sqft;
  if (typeof gfa !== 'number' || !(solve.buildings?.length > 0)) {
    return { fid, error: `no plan produced (generation: ${solve.generation ?? 'unknown'})` };
  }
  // The frontier read is a sub-call of the verdict — one transient failure
  // must not red the gate (the 2026-07-23 480089 false alarm). Retry once
  // and LABEL the failure so transient vs shape-change is legible in CI.
  let mb;
  let mbErr = 'not attempted';
  for (let attempt = 0; attempt < 2 && mbErr !== null; attempt++) {
    try {
      mb = await rpc('fn_max_buildout', { p_ogc_fid: fid, p_typology: 'multifamily' });
      // Label the VALUE, not just absence: the 2026-07-23 18:12 red was an
      // intermittently non-number max_gsf during live edits of the frontier
      // fn — "unknown" hid it. A wrong type is an upstream contract break;
      // we name it, never coerce it.
      const v = mb?.max_gsf;
      mbErr = typeof v === 'number' && v > 0
        ? null
        : `max_gsf=${JSON.stringify(v)} (${typeof v})`;
    } catch (e) {
      mbErr = String(e).slice(0, 120);
    }
  }
  const maxGsf = mb?.max_gsf;
  const capture = typeof maxGsf === 'number' && maxGsf > 0 ? (gfa / maxGsf) * 100 : null;
  return { fid, gfa, maxGsf, capture, mbErr, bars: solve.buildings.length };
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
    const floor = floors[String(fid)];
    if (r.verdict) {
      // A FLOOR parcel refusing is a floor regression, and it must say so —
      // verdict records previously fell through to the capture check and
      // printed the blind "unknown" (the 480089 mystery, solved).
      failures.push(`${fid}: solver verdict '${r.verdict}' where floor ${floor}% expected`);
      console.log(`FAIL ${fid} — verdict '${r.verdict}' where floor ${floor}% expected`);
      continue;
    }
    const cap = r.capture == null ? null : Math.round(r.capture * 10) / 10;
    if (r.capture == null) {
      failures.push(`${fid}: capture not computable (fn_max_buildout: ${r.mbErr ?? 'unknown'})`);
      console.log(`FAIL ${fid} — capture not computable (fn_max_buildout: ${r.mbErr ?? 'unknown'})`);
    } else if (r.capture < floor - 0.05) {
      failures.push(`${fid}: capture ${cap}% below the floor ${floor}%`);
      console.log(`FAIL ${fid} — capture ${cap}% < floor ${floor}% (gfa ${r.gfa} / max ${r.maxGsf}, ${r.bars} bars)`);
    } else {
      console.log(`OK   ${fid} — capture ${cap}% ≥ floor ${floor}% (gfa ${r.gfa} / max ${r.maxGsf}, ${r.bars} bars)`);
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
    console.log(`OK   cohort ${cohortPick} — verdict ${r.verdict} (legitimate refusal)`);
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
console.log('\nDB BATTERY: all floors held.');

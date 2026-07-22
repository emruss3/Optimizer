// Census — the generation-health instrument (GENERATION_STRATEGY_v2).
//
// Samples the RM/OR/MU universe in TWO strata and runs the live solver
// (read-only) over each parcel, classifying every outcome:
//   ok · verdict (legitimate refusal) · error (named planner error) ·
//   exception (unhandled SQL/transport crash) · timeout
//
// Strata (the 2026-07-21 run's lesson): a raw random draw of this universe
// is dominated by degenerate slivers (12/15 parcels with max_gsf < 3,000 sf
// — remnant fabric where refusal is CORRECT); an unstratified error rate
// measures Nashville's parcel fabric, not the solver. So:
//   full      — the honest ops picture (what any parcel click can hit)
//   buildable — lot_sqft >= MIN_LOT_SQFT: the solver's real exam
//
// The census is an INSTRUMENT, not a gate: it always exits 0 (set
// CENSUS_GATE=1 to fail on exceptions — crashes are never acceptable).
//
// Env: BATTERY_SUPABASE_URL, BATTERY_SUPABASE_ANON_KEY (same as db-battery)
//      CENSUS_N (default 15 per stratum) · CENSUS_SEED (default UTC date)
//      CENSUS_OUT (default qa/census) · MIN_LOT_SQFT (default 5000)
import fs from 'node:fs';
import path from 'node:path';

const URL_BASE = process.env.BATTERY_SUPABASE_URL;
const ANON = process.env.BATTERY_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) {
  console.error('BATTERY_SUPABASE_URL / BATTERY_SUPABASE_ANON_KEY not set — census cannot run.');
  process.exit(2);
}
const N = Number(process.env.CENSUS_N ?? 15);
const SEED = process.env.CENSUS_SEED ?? new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CENSUS_OUT ?? 'qa/census';
const MIN_LOT_SQFT = Number(process.env.MIN_LOT_SQFT ?? 5000);

const HEADERS = {
  'content-type': 'application/json',
  apikey: ANON,
  authorization: `Bearer ${ANON}`,
};

async function rest(pathq, init = {}, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_BASE}${pathq}`, { ...init, headers: HEADERS, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// Deterministic seeded shuffle (mulberry32 over a string hash) — same seed,
// same census, no Date/Math.random flake in CI.
function seededPick(arr, n, seed) {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

async function sampleStratum(name, minSqft) {
  // Page of candidate fids via PostgREST; seeded local sample keeps CI stable.
  const filter = minSqft ? `&sqft=gte.${minSqft}` : '';
  const r = await rest(`/rest/v1/parcels?select=ogc_fid&zoning=ilike.RM*${filter}&limit=2000`);
  const rows = Array.isArray(r.body) ? r.body : [];
  if (!rows.length) {
    console.log(`stratum ${name}: no candidates returned (${r.status}) — skipping`);
    return [];
  }
  return seededPick(rows.map(x => x.ogc_fid), N, `${SEED}:${name}`);
}

async function solveOne(fid) {
  try {
    const compile = await rest('/rest/v1/rpc/fn_compile_planner_context', {
      method: 'POST', body: JSON.stringify({ p_ogc_fid: fid, p_use: 'multi_family', p_user_intent: null }),
    });
    if (!compile.ok) return { fid, outcome: 'exception', detail: `compile HTTP ${compile.status}: ${JSON.stringify(compile.body)?.slice(0, 160)}` };
    if (compile.body?.error) return { fid, outcome: 'error', detail: `compile: ${compile.body.error}` };
    const solve = await rest('/rest/v1/rpc/fn_generate_mf_site_plan_v2', {
      method: 'POST', body: JSON.stringify({
        p_ogc_fid: fid, p_typology: 'multifamily', p_seed: 1, p_pins: null,
        p_parent: null, p_persist: false, p_context_id: compile.body.context_id,
      }),
    });
    if (!solve.ok) return { fid, outcome: 'exception', detail: `solve HTTP ${solve.status}: ${JSON.stringify(solve.body)?.slice(0, 160)}` };
    const err = solve.body?.error;
    if (err === 'planner_generation_not_allowed') return { fid, outcome: 'verdict', detail: err };
    if (err) return { fid, outcome: 'error', detail: err };
    const gfa = solve.body?.metrics?.gfa_sqft;
    const bars = solve.body?.buildings?.length ?? 0;
    if (typeof gfa !== 'number' || bars === 0) {
      return { fid, outcome: 'error', detail: `no plan (generation: ${solve.body?.generation ?? 'unknown'})` };
    }
    const mb = await rest('/rest/v1/rpc/fn_max_buildout', {
      method: 'POST', body: JSON.stringify({ p_ogc_fid: fid, p_typology: 'multifamily' }),
    });
    const maxGsf = mb.body?.max_gsf;
    const capture = typeof maxGsf === 'number' && maxGsf > 0 ? Math.round((gfa / maxGsf) * 1000) / 10 : null;
    return { fid, outcome: 'ok', capture, gfa, max_gsf: maxGsf, bars };
  } catch (e) {
    const msg = String(e);
    return { fid, outcome: msg.includes('abort') ? 'timeout' : 'exception', detail: msg.slice(0, 160) };
  }
}

function summarize(results) {
  const by = {};
  for (const r of results) {
    const key = r.outcome === 'error' ? `error:${r.detail}` : r.outcome;
    by[key] = (by[key] ?? 0) + 1;
  }
  const clusters = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ class: k, count: v }));
  const oks = results.filter(r => r.outcome === 'ok');
  return {
    n: results.length,
    ok: oks.length,
    error_rate_pct: results.length ? Math.round(((results.length - oks.length - results.filter(r => r.outcome === 'verdict').length) / results.length) * 1000) / 10 : null,
    median_capture_pct: oks.length ? [...oks].sort((a, b) => (a.capture ?? 0) - (b.capture ?? 0))[Math.floor(oks.length / 2)].capture : null,
    clusters,
  };
}

const census = { date: SEED, seed: SEED, n_per_stratum: N, min_lot_sqft: MIN_LOT_SQFT, strata: {} };
for (const [name, minSqft] of [['full', null], ['buildable', MIN_LOT_SQFT]]) {
  const fids = await sampleStratum(name, minSqft);
  const results = [];
  for (const fid of fids) {
    const r = await solveOne(fid);
    results.push(r);
    console.log(`[${name}] ${fid}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ''}${r.capture != null ? ` — ${r.capture}%` : ''}`);
  }
  census.strata[name] = { results, summary: summarize(results) };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `${SEED}.json`), JSON.stringify(census, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(census, null, 2));
for (const [name, s] of Object.entries(census.strata)) {
  console.log(`\n== ${name}: ${s.summary.ok}/${s.summary.n} ok · error rate ${s.summary.error_rate_pct}% · median capture ${s.summary.median_capture_pct ?? 'n/a'}%`);
  for (const c of s.summary.clusters) console.log(`   ${c.count}× ${c.class}`);
}

const exceptions = Object.values(census.strata).flatMap(s => s.results).filter(r => r.outcome === 'exception');
if (process.env.CENSUS_GATE === '1' && exceptions.length) {
  console.log(`\nCENSUS GATE: ${exceptions.length} unhandled exception(s) — crashes are never acceptable.`);
  process.exit(1);
}

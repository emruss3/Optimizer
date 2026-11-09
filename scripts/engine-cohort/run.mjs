// Re-run the engine cohort live and score it (2026-11-09).
//
// Calls the same RPCs the app calls, as the anonymous role, for every parcel
// in cohort.json, writes the answers in the harvest store format, and scores
// them (score.mjs). Run it after each engine release:
//
//   BATTERY_SUPABASE_URL=https://<ref>.supabase.co BATTERY_SUPABASE_ANON_KEY=<anon> \
//     node scripts/engine-cohort/run.mjs --engine g16 [--baseline runs/2026-11-09_g15.json] [--only 659670,660683]
//
// Writes runs/<date>_<engine>.store.json (the raw answers) and
// runs/<date>_<engine>.json (the scoreboard), and prints the board with the
// parcels whose answer changed since the baseline.
//
// The anonymous role has a 20 s statement timeout: a parcel whose plan or
// competition does not finish inside it is recorded as an error, not a plan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_BASE = process.env.BATTERY_SUPABASE_URL;
const ANON = process.env.BATTERY_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) {
  console.error('BATTERY_SUPABASE_URL / BATTERY_SUPABASE_ANON_KEY not set — cannot re-run the cohort.');
  process.exit(2);
}
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const engine = args.engine ?? 'engine';
const only = args.only ? new Set(String(args.only).split(',').map(s => s.trim())) : null;
const cohort = JSON.parse(fs.readFileSync(path.join(HERE, 'cohort.json'), 'utf8')).filter(c => !only || only.has(String(c.fid)));

async function rpc(fn, body, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${ANON}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { error: `${fn} HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}` };
    return json;
  } catch (e) {
    return { error: `${fn}: ${e?.name === 'AbortError' ? 'timed out' : String(e?.message ?? e)}` };
  } finally {
    clearTimeout(t);
  }
}

const store = { _timings: {} };
const t0 = Date.now();
for (const c of cohort) {
  const fid = c.fid;
  const rm = /^RM/.test(c.zoning);
  const started = Date.now();
  const plan = await rpc('fn_sf_v1_plan_app', { p_ogc_fid: fid, p_opt: {} });
  store[`rpc:fn_sf_v1_plan_app:${fid}:`] = plan;
  store._timings[`_plan_ms:${fid}`] = Date.now() - started;
  const c0 = Date.now();
  const opt = rm ? { th_budget_ms: 8000 } : {};
  const comp = await rpc('fn_sf_v1_candidates_app', { p_ogc_fid: fid, p_opt: opt });
  store[`rpc:fn_sf_v1_candidates_app:${fid}:${rm ? ':{"th_budget_ms":8000}' : ''}`] = comp;
  store._timings[`_cand_ms:${fid}`] = Date.now() - c0;
  if (rm) {
    const m0 = Date.now();
    const ctx = await rpc('fn_compile_planner_context', { p_ogc_fid: fid, p_use: 'multi_family', p_user_intent: {} });
    const contextId = ctx?.context_id ?? null;
    const mf = contextId
      ? await rpc('fn_generate_mf_site_plan_v2', { p_ogc_fid: fid, p_typology: 'multifamily', p_seed: 1, p_pins: null, p_parent: null, p_persist: false, p_context_id: contextId })
      : { error: ctx?.error ?? 'no planner context' };
    store[`rpc:fn_compile_planner_context:${fid}:multi_family`] = ctx;
    store[`rpc:fn_generate_mf_site_plan_v2:${fid}:multifamily`] = mf;
    store._timings[`_mf_ms:${fid}`] = Date.now() - m0;
  }
  const a = plan?.error ? `error: ${plan.error}` : `${plan?.status ?? '?'} lots=${plan?.lots ?? '-'} ${plan?.pattern ?? ''}`;
  console.log(`${fid} ${c.address} (${c.zoning}) — ${a} · ${Date.now() - started} ms`);
}
console.log(`\n${cohort.length} parcels in ${Math.round((Date.now() - t0) / 1000)} s`);

const stamp = new Date().toISOString().slice(0, 10);
const storePath = path.join(HERE, 'runs', `${stamp}_${engine}.store.json`);
const outPath = path.join(HERE, 'runs', `${stamp}_${engine}.json`);
fs.mkdirSync(path.join(HERE, 'runs'), { recursive: true });
fs.writeFileSync(storePath, JSON.stringify(store));
const scoreArgs = ['--store', storePath, '--out', outPath, '--engine', engine];
if (args.baseline) scoreArgs.push('--baseline', args.baseline);
const r = spawnSync(process.execPath, [path.join(HERE, 'score.mjs'), ...scoreArgs], { stdio: 'inherit' });
process.exit(r.status ?? 1);

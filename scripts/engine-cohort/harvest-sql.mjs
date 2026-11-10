// The cohort harvest as SQL, for a run through a SQL console (the audit harness
// runs it through the Supabase MCP, where the anonymous REST role is not
// reachable). Prints one statement per group of parcels; each statement returns
// one row whose column `t` is the JSON of the store keys score.mjs reads
// (padded so a console that caps rows saves it to a file instead of truncating).
//
//   node scripts/engine-cohort/harvest-sql.mjs [--per 3] [--only 659670,660683] > cohort.sql
//
// Merge each statement's row into a store with the harness's peek.py (or any
// tool that parses the `t` column as JSON and merges the keys), then:
//   node scripts/engine-cohort/score.mjs --store <merged store> --engine g16 --out runs/<date>_g16.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const per = Number(args.per ?? 3);
const only = args.only ? new Set(String(args.only).split(',').map(s => s.trim())) : null;
const cohort = JSON.parse(fs.readFileSync(path.join(HERE, 'cohort.json'), 'utf8')).filter(c => !only || only.has(String(c.fid)));

const sf = cohort.filter(c => !/^RM/.test(c.zoning));
const rm = cohort.filter(c => /^RM/.test(c.zoning));

function sfStatement(group) {
  const ctes = [];
  const objs = [];
  for (const c of group) {
    const f = c.fid;
    ctes.push(`t0_${f} as (select clock_timestamp() t)`,
      `pl_${f} as (select public.fn_sf_v1_plan_app(${f}, '{}'::jsonb) j from t0_${f})`,
      `t1_${f} as (select clock_timestamp() t from pl_${f})`,
      `c_${f} as (select public.fn_sf_v1_candidates_app(${f}, '{}'::jsonb) j from t1_${f})`,
      `t2_${f} as (select clock_timestamp() t from c_${f})`);
    objs.push(`jsonb_build_object('_plan_ms:${f}', round(extract(epoch from (select t from t1_${f}) - (select t from t0_${f})) * 1000),
  '_cand_ms:${f}', round(extract(epoch from (select t from t2_${f}) - (select t from t1_${f})) * 1000),
  'rpc:fn_sf_v1_plan_app:${f}:', (select j from pl_${f}),
  'rpc:fn_sf_v1_candidates_app:${f}:', (select j from c_${f}))`);
  }
  return `SET statement_timeout = '58s';\nwith ${ctes.join(',\n')}\nselect (${objs.join('\n || ')})::text || repeat(' ', 90000) as t`;
}

function rmStatement(c) {
  const f = c.fid;
  return `SET statement_timeout = '58s';
with t0 as (select clock_timestamp() t),
pl as (select public.fn_sf_v1_plan_app(${f}, '{}'::jsonb) j from t0),
t1 as (select clock_timestamp() t from pl),
c as (select public.fn_sf_v1_candidates_app(${f}, '{"th_budget_ms":8000}'::jsonb) j from t1),
t2 as (select clock_timestamp() t from c),
ctx as (select public.fn_compile_planner_context(${f}, 'multi_family', '{}'::jsonb) j from t2),
m as (select ctx.j ctx, public.fn_generate_mf_site_plan_v2(${f}, 'multifamily', 1, '[]'::jsonb, null, false, (ctx.j->>'context_id')::uuid) mf from ctx),
t3 as (select clock_timestamp() t from m)
select (jsonb_build_object('_plan_ms:${f}', round(extract(epoch from (select t from t1) - (select t from t0)) * 1000),
  '_cand_ms:${f}', round(extract(epoch from (select t from t2) - (select t from t1)) * 1000),
  '_mf_ms:${f}', round(extract(epoch from (select t from t3) - (select t from t2)) * 1000),
  'rpc:fn_sf_v1_plan_app:${f}:', (select j from pl),
  'rpc:fn_sf_v1_candidates_app:${f}::{"th_budget_ms":8000}', (select j from c),
  'rpc:fn_compile_planner_context:${f}:multi_family', (select ctx from m),
  'rpc:fn_generate_mf_site_plan_v2:${f}:multifamily', (select mf from m)))::text || repeat(' ', 90000) as t`;
}

const out = [];
for (let i = 0; i < sf.length; i += per) out.push(sfStatement(sf.slice(i, i + per)));
for (const c of rm) out.push(rmStatement(c));
// Run this first and last: if the two answers differ, the engine changed during the harvest and the store
// mixes two releases (it happened twice on 2026-11-10). Put the value in the store as "_engine_release".
const release = `-- the release the engine names itself; run before the first statement and after the last\nselect public.fn_sf_v1_params()->>'engine_release' as engine_release;\n\n`;
process.stdout.write(release + out.map((s, i) => `-- statement ${i + 1} of ${out.length}\n${s}\n`).join('\n'));

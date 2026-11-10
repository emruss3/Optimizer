// The engine cohort scoreboard (2026-11-09).
//
// Eric: "If we aren't getting better each time we do this, we need to re-focus."
// Random draws measure the land as much as the engine. This is the fixed
// measure: every parcel from the audit batches (cohort.json) with what a civil
// engineer or developer would draw on it (the target), scored against one
// engine run. One number per run — plans that land where a civil would — and
// the parcels whose answer changed since the last run, so each engine release
// is judged on the same ground.
//
// Usage:
//   node score.mjs --store <store.json> [--out runs/<name>.json] [--baseline runs/<prev>.json] [--engine g15]
//
// The store is the harvest format the audit harness and run.mjs both write:
//   rpc:fn_sf_v1_plan_app:<fid>:                              the by-right plan
//   rpc:fn_sf_v1_candidates_app:<fid>:                        the pattern competition (R / RS)
//   rpc:fn_sf_v1_candidates_app:<fid>::{"th_budget_ms":8000}  the competition on RM land (the app's call)
//   rpc:fn_generate_mf_site_plan_v2:<fid>:multifamily         the multifamily plan (RM)
//
// A parcel's ANSWER is what the app would put on the sheet by default:
//   R / RS: the by-right plan (the competition's best replaces it only by the
//           app's auto-best rule: more lots and buildable, or the same lots with
//           less street / fewer fails);
//   RM:     the layout choice — the neighborhood's best when it places more homes
//           than the apartments, is buildable and drawable; otherwise the apartments.
// The TARGET says whether anything should be drawn at all (refuse) and, when
// it should, the lot range, the product, and whether a new public street belongs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.store) {
  console.error('usage: node score.mjs --store <store.json> [--out runs/<name>.json] [--baseline runs/<prev>.json] [--engine <label>]');
  process.exit(2);
}

export const QUALITY_FLAGS = new Set(['open.unassigned', 'cost.street_ft_per_lot', 'yield.vs_arithmetic', 'access.private_drive_length']);
export const codeFails = fails => (Array.isArray(fails) ? fails : []).filter(f => !QUALITY_FLAGS.has(f));
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The grammar the best plan was asked for: the engine's field, or (since its 2026-11-09 release dropped it) the
 *  candidate row that drew the best plan's pattern and lots; 'loop' when the default row is among them. */
export function bestRequestedOf(comp) {
  if (!comp) return null;
  if (typeof comp.best_requested === 'string' && comp.best_requested) return comp.best_requested;
  const pattern = comp.best_pattern ?? comp.best?.pattern ?? null;
  const lots = num(comp.best_lots) ?? num(comp.best?.lots);
  if (pattern == null || lots == null) return null;
  const rows = (comp.candidates ?? []).filter(r => r.pattern === pattern && num(r.lots) === lots && (r.status ?? 'done') === 'done');
  if (rows.length === 0) return null;
  return rows.some(r => (r.requested ?? 'loop') === 'loop') ? 'loop' : (rows[0].requested ?? null);
}

/** The by-right side's answer: the plan, or the competition's best when the app's auto-best rule would take it. */
export function sfAnswer(plan, comp) {
  const a = { status: plan?.status ?? (plan?.error ? 'error' : plan ? 'done' : 'missing'), lots: num(plan?.lots) ?? 0, pattern: plan?.pattern ?? null,
    streetFt: num(plan?.metrics?.street_ft) ?? 0, fails: codeFails(plan?.fails), flags: (plan?.fails ?? []).filter(f => QUALITY_FLAGS.has(f)),
    reason: plan?.reason ?? null, from: 'default', product: 'lots', hillsideAc: num(plan?.hillside_ac), buildableAc: num(plan?.buildable_after_holds_ac) };
  if (a.status === 'error') { a.lots = 0; a.reason = plan.error ?? plan.reason ?? null; return a; }
  if (plan?.status === 'skipped') { a.lots = 0; return a; }
  const best = comp?.status === 'done' ? (comp.best ?? null) : null;
  const bestRow = comp?.status === 'done' ? (comp.candidates ?? []).find(r => r.requested === bestRequestedOf(comp)) : null;
  if (best && bestRow && bestRow.status === 'done' && num(bestRow.lots) > 0 && bestRow.requested !== 'loop' && bestRow.product !== 'attached') {
    const bLots = num(bestRow.lots) ?? 0;
    const bFails = codeFails(bestRow.fails);
    const bStreet = num(bestRow.street_ft) ?? num(best.metrics?.street_ft) ?? 0;
    const buildable = comp.best_buildable ?? bFails.length === 0;
    const takes = buildable && (a.lots === 0 || bLots > a.lots || (bLots === a.lots && (bStreet < a.streetFt || bFails.length < a.fails.length)));
    if (takes) return { ...a, lots: bLots, pattern: bestRow.pattern ?? best.pattern ?? null, streetFt: bStreet, fails: bFails, from: bestRow.requested };
  }
  return a;
}

/** The layout choice on RM land: the neighborhood's best or the apartments. */
export function rmAnswer(plan, comp, mf) {
  const units = num(mf?.metrics?.units_est) ?? num(mf?.metrics?.units);
  const bestRow = comp?.status === 'done' ? (comp.candidates ?? []).find(r => r.requested === bestRequestedOf(comp)) : null;
  const nbLots = bestRow && bestRow.status === 'done' ? num(bestRow.lots) ?? 0 : 0;
  const nbFails = bestRow ? codeFails(bestRow.fails) : [];
  const nbBuildable = bestRow ? (comp.best_buildable ?? nbFails.length === 0) : false;
  const nbAttached = bestRow?.product === 'attached';
  const nbDrawable = nbAttached ? (bestRow?.engine === 'v3' || comp?.best?.engine === 'v3') : true;
  const floodSkip = comp?.status === 'skipped' && /floodplain leaves no buildable piece/i.test(comp.reason ?? '');
  const th = comp?.status === 'done' ? (comp.candidates ?? []).find(r => r.requested === 'townhome' && r.status === 'done') : null;
  const base = { status: comp?.status ?? 'missing', mfUnits: units, nbLots, nbPattern: bestRow?.pattern ?? null, nbFails, thLots: th ? num(th.lots) : null, thFails: th ? codeFails(th.fails) : null, floodSkip, reason: comp?.reason ?? plan?.reason ?? null };
  if (nbLots > 0 && (units == null || nbLots > units) && nbBuildable && nbDrawable) {
    return { ...base, lots: nbLots, product: nbAttached ? 'attached' : 'lots', fails: nbFails, from: bestRow.requested, streetFt: num(bestRow.street_ft) ?? 0 };
  }
  if (units != null && units > 0) return { ...base, lots: units, product: 'apartments', fails: [], from: 'multifamily', streetFt: 0 };
  return { ...base, lots: 0, product: 'none', fails: nbFails, from: 'none', streetFt: 0 };
}

/** Does the answer land where a civil would? */
export function judge(target, ans) {
  // the engine raised instead of answering: a miss on either side, never "not in this run"
  if (ans.status === 'error') return { pass: false, why: `the engine raised: ${ans.reason ?? 'no message'}` };
  const nothing = ans.lots === 0 || ans.status === 'skipped' || (ans.lots === 1 && ans.streetFt === 0 && ans.product !== 'apartments');
  if (target.kind === 'refuse') {
    return nothing ? { pass: true, why: 'nothing drawn, as it should be' } : { pass: false, why: `drew ${homes(ans.lots, ans.product)} where nothing belongs` };
  }
  // a target whose range starts at one lot names the parcel as one lot as an answer (605 Harpeth Ln)
  if (nothing && ans.lots === 1 && ans.fails.length === 0 && target.lots[0] <= 1) return { pass: true, why: 'the parcel as one lot, as the target allows' };
  if (nothing) return target.altRefuse ? { pass: true, why: 'nothing drawn; acceptable here' } : { pass: false, why: `drew nothing; ${target.lots[0]}–${target.lots[1]} expected` };
  const [lo, hi] = target.lots;
  if (ans.lots < lo || ans.lots > hi) return { pass: false, why: `${homes(ans.lots, ans.product)}; ${lo}–${hi} expected` };
  if (ans.fails.length > 0) return { pass: false, why: `${homes(ans.lots, ans.product)} but fails ${ans.fails.join(', ')}` };
  if (target.product === 'attached' && ans.product !== 'attached') return { pass: false, why: `${homes(ans.lots, ans.product)}; attached homes expected` };
  if (target.product === 'lots' && ans.product === 'apartments') return { pass: false, why: `${ans.lots} apartments; house lots expected` };
  if (target.noStreet && ans.streetFt > 0 && !/drive/i.test(ans.pattern ?? '')) return { pass: false, why: `${ans.lots} lots on ${Math.round(ans.streetFt)} ft of new public street; none belongs` };
  return { pass: true, why: `${homes(ans.lots, ans.product)}${ans.pattern ? ` (${ans.pattern})` : ''}` };
}

const fingerprint = a => `${a.status}|${a.lots}|${a.product ?? ''}|${a.pattern ?? ''}|${Math.round(a.streetFt ?? 0)}|${(a.fails ?? []).join(',')}|${a.from ?? ''}`;
const homes = (n, product) => `${n} ${product === 'lots' ? (n === 1 ? 'lot' : 'lots') : product === 'attached' ? (n === 1 ? 'attached home' : 'attached homes') : product === 'apartments' ? (n === 1 ? 'apartment' : 'apartments') : product}`;

export function scoreStore(store, cohort) {
  const rows = [];
  for (const c of cohort) {
    const fid = String(c.fid);
    const plan = store[`rpc:fn_sf_v1_plan_app:${fid}:`] ?? null;
    const rm = /^RM/.test(c.zoning);
    const comp = store[`rpc:fn_sf_v1_candidates_app:${fid}::{"th_budget_ms":8000}`] ?? store[`rpc:fn_sf_v1_candidates_app:${fid}:`] ?? null;
    const mf = store[`rpc:fn_generate_mf_site_plan_v2:${fid}:multifamily`] ?? null;
    const present = rm ? (comp != null || mf != null) : plan != null;
    if (!present) { rows.push({ ...c, answer: null, verdict: { pass: null, why: 'not in this run' } }); continue; }
    const answer = rm ? rmAnswer(plan, comp, mf) : sfAnswer(plan, comp);
    rows.push({ ...c, answer: { ...answer, fingerprint: fingerprint(answer) }, verdict: judge(c.target, answer) });
  }
  return rows;
}

export function scoreboard(rows) {
  const run = rows.filter(r => r.answer);
  const plan = run.filter(r => r.target.kind === 'plan');
  const refuse = run.filter(r => r.target.kind === 'refuse');
  return {
    parcels: rows.length, run: run.length,
    plan: { pass: plan.filter(r => r.verdict.pass).length, of: plan.length },
    refuse: { pass: refuse.filter(r => r.verdict.pass).length, of: refuse.length },
  };
}

const cohort = JSON.parse(fs.readFileSync(path.join(HERE, 'cohort.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(args.store, 'utf8'));
const rows = scoreStore(store, cohort);
const board = scoreboard(rows);
const baseline = args.baseline ? JSON.parse(fs.readFileSync(args.baseline, 'utf8')) : null;
const baseRows = baseline ? new Map(baseline.rows.map(r => [String(r.fid), r])) : null;

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
console.log(`ENGINE COHORT · ${args.engine ?? 'this run'} · ${board.run} of ${board.parcels} parcels answered`);
console.log(`  plans where a civil would draw one: ${board.plan.pass} of ${board.plan.of} (${pct(board.plan.pass, board.plan.of)})`);
console.log(`  refusals where nothing belongs:     ${board.refuse.pass} of ${board.refuse.of} (${pct(board.refuse.pass, board.refuse.of)})`);
if (baseline) {
  const b = baseline.board;
  console.log(`  baseline ${baseline.engine ?? ''}: plans ${b.plan.pass}/${b.plan.of}, refusals ${b.refuse.pass}/${b.refuse.of}`);
}
console.log('');
for (const r of rows) {
  const mark = r.verdict.pass == null ? '  ' : r.verdict.pass ? 'OK' : '--';
  const changed = baseRows?.get(String(r.fid))?.answer && r.answer && baseRows.get(String(r.fid)).answer.fingerprint !== r.answer.fingerprint;
  const flip = changed ? (baseRows.get(String(r.fid)).verdict.pass === r.verdict.pass ? ' · changed' : r.verdict.pass ? ' · FIXED' : ' · BROKE') : '';
  console.log(`${mark} ${r.fid} ${r.address} (${r.zoning}, ${r.acres} ac) — ${r.verdict.why}${flip}`);
  if (changed) console.log(`     was: ${baseRows.get(String(r.fid)).verdict.why}`);
}
const missing = rows.filter(r => !r.answer);
if (missing.length) console.log(`\n${missing.length} not in this run: ${missing.map(r => r.fid).join(', ')}`);
if (args.out) {
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ engine: args.engine ?? null, scoredAt: new Date().toISOString(), board, rows: rows.map(r => ({ fid: r.fid, address: r.address, zoning: r.zoning, target: r.target, answer: r.answer, verdict: r.verdict })) }, null, 1));
  console.log(`\nsaved ${args.out}`);
}

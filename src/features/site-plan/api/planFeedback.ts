// Site planner feedback (owner, 2026-11-27): the owner's note goes to Claude with the plan on screen
// (api/plan-feedback.js); the reading is stored with its scope and lesson (planner.plan_feedback); the engine
// settings Claude proposes can be tried on this plan, and kept for every later solve of this parcel.
import { supabase } from '../../../lib/supabase';
import type { SfV1Options, SfV1Summary } from './sfV1Plan';

export interface FeedbackSetting { key: string; kind: 'num' | 'bool' | string; min: number | null; max: number | null; step: number | null; current: unknown }
export interface FeedbackLevers { product: string; patterns: string[]; settings: FeedbackSetting[] }
export interface FeedbackChanges { pattern: string | null; params: Record<string, number | boolean> }
export interface FeedbackReading {
  reading: string;
  category: string;
  scope: 'parcel' | 'district' | 'product' | 'all';
  lesson: string;
  engineCanChange: boolean;
  changes: FeedbackChanges | null;
  whyNot: string | null;
  reply: string;
  model: string;
}
export interface KeptAdjustment { id: string; note: string; changes: FeedbackChanges; reading: string | null; created_at: string }
/** Settings accepted from a note whose scope reaches this site: its district, its product, or every plan. */
export interface Guidance { id: string; scope: string; lesson: string | null; changes: FeedbackChanges; from_parcel: number | null; created_at: string }
export interface FeedbackContext {
  kept: KeptAdjustment[];
  guidance: Guidance[];
  parcel_notes: Array<{ note: string; lesson: string | null; category: string | null; status: string; created_at: string }>;
  lessons: Array<{ scope: string; category: string | null; lesson: string; times: number; parcels: number; last_at: string }>;
}
export type FeedbackStatus = 'open' | 'applied' | 'kept' | 'dismissed' | 'resolved';

/** The product an engine draws, as the feedback store names it. */
export function productOf(generator: string | null | undefined): 'single_family' | 'townhome' | 'multifamily' | 'other' {
  const g = (generator ?? '').toLowerCase();
  if (g.startsWith('sf') || g.includes('subdivision')) return 'single_family';
  if (g.startsWith('th') || g.includes('townhome')) return 'townhome';
  if (g.startsWith('mf') || g.includes('apartment') || g.includes('multifamily')) return 'multifamily';
  return 'other';
}

const EMPTY_LEVERS: FeedbackLevers = { product: 'other', patterns: [], settings: [] };

export async function fetchFeedbackLevers(product: string): Promise<FeedbackLevers> {
  if (!supabase) return EMPTY_LEVERS;
  const { data, error } = await supabase.rpc('fn_plan_feedback_levers', { p_product: product });
  if (error || !data) return { ...EMPTY_LEVERS, product };
  const d = data as Partial<FeedbackLevers>;
  return { product: d.product ?? product, patterns: Array.isArray(d.patterns) ? d.patterns : [], settings: Array.isArray(d.settings) ? d.settings : [] };
}

export async function fetchFeedbackContext(ogcFid: number, zoning: string | null, product: string): Promise<FeedbackContext> {
  const empty: FeedbackContext = { kept: [], guidance: [], parcel_notes: [], lessons: [] };
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc('fn_plan_feedback_context', { p_ogc_fid: ogcFid, p_zoning: zoning, p_product: product });
  if (error || !data) return empty;
  const d = data as Partial<FeedbackContext>;
  return { kept: d.kept ?? [], guidance: d.guidance ?? [], parcel_notes: d.parcel_notes ?? [], lessons: d.lessons ?? [] };
}

export async function saveFeedback(row: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('fn_plan_feedback_save', { p: row });
  return error ? null : (data as string | null);
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus, revision?: string | null): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('fn_plan_feedback_set_status', { p_id: id, p_status: status, p_applied_revision: revision ?? null });
  return !error && data === true;
}

export async function setFeedbackScope(id: string, scope: FeedbackReading['scope']): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('fn_plan_feedback_set_scope', { p_id: id, p_scope: scope });
  return !error && data === true;
}

/** True when signed in: feedback is stored per user and the model call needs a session. */
export async function feedbackSession(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Ask Claude to read the note. Rejects with a sentence fit to show the user. */
export async function requestPlanFeedback(
  req: { note: string; plan: Record<string, unknown>; levers: FeedbackLevers; prior: Partial<FeedbackContext>; image?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackReading> {
  const token = await feedbackSession();
  if (!token) throw new Error('Sign in to send feedback.');
  let r: Response;
  try {
    r = await fetchImpl('/api/plan-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ note: req.note, plan: req.plan, levers: req.levers, prior: { parcel_notes: req.prior.parcel_notes ?? [], lessons: req.prior.lessons ?? [] }, image: req.image ?? undefined }),
    });
  } catch {
    throw new Error('The feedback service could not be reached.');
  }
  const body = await r.json().catch(() => null) as (FeedbackReading & { error?: string }) | null;
  if (!r.ok || !body || body.error) throw new Error(body?.error ?? `The feedback service answered ${r.status}.`);
  return body;
}

/** The current options with the changes on top: a pattern replaces the pattern; settings merge into params. */
export function mergeChanges(opt: SfV1Options, changes: FeedbackChanges | null | undefined): SfV1Options {
  if (!changes) return opt;
  const next: SfV1Options = { ...opt };
  // the loop is the engine's default grammar: asked for by sending no pattern
  if (changes.pattern === 'loop') delete next.pattern;
  else if (changes.pattern) next.pattern = changes.pattern;
  const params = { ...(opt.params ?? {}), ...changes.params };
  if (Object.keys(params).length) next.params = params;
  return next;
}

/** Every kept adjustment of a parcel, oldest first, as one set of changes (a later one wins on the same setting). */
export function keptChanges(kept: KeptAdjustment[]): FeedbackChanges | null {
  if (!kept.length) return null;
  const out: FeedbackChanges = { pattern: null, params: {} };
  for (const k of kept) {
    if (k.changes?.pattern) out.pattern = k.changes.pattern;
    Object.assign(out.params, k.changes?.params ?? {});
  }
  return out.pattern || Object.keys(out.params).length ? out : null;
}

/** What a site starts from: the guidance that reaches it (oldest first), then this parcel's own kept adjustments,
 *  so the more specific and the more recent win on the same setting. */
export function startingChanges(ctx: Pick<FeedbackContext, 'kept' | 'guidance'>): { changes: FeedbackChanges | null; ids: string[]; lessons: string[] } {
  const ordered = [...ctx.guidance, ...ctx.kept];
  const changes = keptChanges(ordered.map(g => ({ id: g.id, note: '', reading: null, created_at: g.created_at, changes: g.changes })));
  return {
    changes,
    ids: ordered.map(g => g.id),
    lessons: [...new Set(ctx.guidance.map(g => g.lesson).filter((l): l is string => !!l))],
  };
}

/** Keep a guided plan only when it is at least as good on what the engine is held to: no fewer homes, no new code
 *  failure (maximize units, by right). Otherwise the site keeps its default plan, and says why. */
export function guidedVerdict(
  base: { lots: number; fails: string[] } | null | undefined,
  guided: { lots: number; fails: string[]; status?: string } | null | undefined,
): { keep: boolean; why: string } {
  if (!base || !guided) return { keep: false, why: 'no plan to compare' };
  if (guided.status && guided.status !== 'done') return { keep: false, why: 'the engine could not draw the guided plan here' };
  if (guided.fails.length > base.fails.length) return { keep: false, why: `the guided plan fails ${guided.fails.length - base.fails.length} more check${guided.fails.length - base.fails.length === 1 ? '' : 's'}` };
  if (guided.lots < base.lots) return { keep: false, why: `the guided plan has ${base.lots - guided.lots} fewer home${base.lots - guided.lots === 1 ? '' : 's'} (${guided.lots} against ${base.lots})` };
  const gain = guided.lots - base.lots;
  return { keep: true, why: gain > 0 ? `${gain} more home${gain === 1 ? '' : 's'} than the default plan` : `the same ${guided.lots} homes as the default plan` };
}

// What each engine setting is, in a developer's words (the copy on screen; the values come from the engine).
const SETTING_WORDS: Record<string, string> = {
  block_len_max_ft: 'Longest block',
  cul_de_sac_min_lots: 'Fewest lots on a cul-de-sac',
  edge_lot_d_max_factor: 'Deepest edge lot (× standard depth)',
  grid_block_len_ft: 'Grid block length',
  grid_depth_compress_min_share: 'Least block depth kept on a grid',
  leg_bend_deg: 'Sharpest street bend',
  lot_compactness_min: 'Least lot compactness',
  remainder_lot_factor: 'Largest leftover lot (× standard)',
  ring_depth_adaptive: 'Fit loop depth to the site',
  walk_straighten_tol_ft: 'Street straightening tolerance',
  walk_turn_weight: 'Penalty for street turns',
  // townhomes
  max_row_homes: 'Most homes in a row',
  min_row_homes: 'Fewest homes in a row',
  unit_w_ft: 'Home width',
  unit_d_ft: 'Home depth',
  front_yard_ft: 'Front yard',
  street_setback_ft: 'Setback from the street',
  row_break_ft: 'Gap between rows',
  courtyard_min_depth_ft: 'Least courtyard depth',
  green_sf_per_home: 'Green space per home (sf)',
  guest_stalls_per_home_target: 'Guest parking per home',
  amenity_pad_sf: 'Amenity area (sf)',
};
const PATTERN_WORDS: Record<string, string> = { loop: 'loop streets', single: 'a single street', grid: 'a street grid' };

function valueWords(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const s = Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100);
  return key.endsWith('_ft') ? `${s} ft` : key.endsWith('_deg') ? `${s}°` : s;
}

/** The changes as lines a developer reads: "Street pattern: a street grid", "Longest block: 900 ft (was 1,200 ft)". */
export function describeChanges(changes: FeedbackChanges | null | undefined, levers: FeedbackLevers): string[] {
  if (!changes) return [];
  const lines: string[] = [];
  if (changes.pattern) lines.push(`Street pattern: ${PATTERN_WORDS[changes.pattern] ?? changes.pattern}`);
  for (const [key, v] of Object.entries(changes.params)) {
    const s = levers.settings.find(x => x.key === key);
    const was = s?.current != null ? ` (was ${valueWords(key, s.current)})` : '';
    lines.push(`${SETTING_WORDS[key] ?? key.replace(/_/g, ' ')}: ${valueWords(key, v)}${was}`);
  }
  return lines;
}

/** What the model reads about the plan on screen: the engine's own summary, no geometry. */
export function planForFeedback(input: {
  address: string | null; zoning: string | null; generator: string | null; revision: string | null; view: '2d' | '3d';
  summary: SfV1Summary | null; options: SfV1Options; buildings: Array<{ use: string; label: string | null; floors?: number | null }>;
  selected: { id: string; label: string | null; type: string } | null; cameraBasis?: string | null;
}): Record<string, unknown> {
  const s = input.summary;
  const byUse: Record<string, number> = {};
  for (const b of input.buildings) byUse[b.use] = (byUse[b.use] ?? 0) + 1;
  return {
    address: input.address, zoning: input.zoning, generator: input.generator, revision: input.revision, view: input.view,
    selected: input.selected, camera: input.cameraBasis ?? null,
    buildings: { count: input.buildings.length, by_use: byUse },
    options_in_use: input.options,
    ...(s ? {
      subdivision: {
        lots: s.lots, pattern: s.pattern, basis: s.basis, site_acres: s.siteAcres, density_du_ac: s.densityDuAc,
        lot_module_ft: s.lotWFt && s.lotDFt ? `${s.lotWFt} x ${s.lotDFt}` : null, min_lot_sf: s.minLotSf, avg_lot_sf: s.avgLotSf,
        street_ft: s.streetFt, row_pct: s.rowPct, lot_pct: s.lotPct, open_pct: s.openPct, impervious_pct: s.imperviousPct,
        dead_ends: s.deadEnds, dead_end_max_ft: s.deadEndMaxFt, counts: s.counts, lot_kinds: s.lotKinds,
        held_acres: s.heldAcres, flood_hold: s.floodHold, hillside_acres: s.hillsideAcres,
        fails: s.fails, notes: s.notes.slice(0, 8), remainder: s.remainder,
      },
    } : {}),
  };
}

/**
 * By-right subdivision generator client (sf_v1, 2026-10-27; shaped to the
 * live payload 2026-11-03).
 *
 * `fn_sf_v1_plan(ogc_fid, opt)` draws the single-family subdivision a parcel
 * gets BY RIGHT from the base district's own standards — the lot module, the
 * setbacks, the street pattern (loop / 2 loops / single street / T street /
 * frontage lots, no new street), the storm pond at the low point, the flood
 * hold — and grades itself: `tests` (an object keyed by test id, each with
 * its pass and its own figures), `fails`, `notes`, and `earthwork` (ground,
 * street grade, and the fill / cut when the plan builds in the flood hazard
 * area). Every dimension and threshold comes from `fn_sf_v1_params()` and
 * `planning_principle`; nothing is parcel-specific.
 *
 * The app reaches it through `fn_sf_v1_plan_app` / `fn_sf_v1_site_app`
 * (SECURITY DEFINER wrappers, migration 20261103184636): the generator's own
 * helpers are not granted to the anon role.
 *
 * Routing (the owner's standing instruction): by right by default from the
 * parcel's base district. R / RS → this generator. RM / MUL / SP → attached
 * homes (th v2 stays the product default until v3 is faster). An override —
 * a lot module, the floodway-only fill scenario, setbacks, the entry
 * position — is a second, flagged answer the user asks for, never the
 * default. The live function keeps `basis: 'by_right'` under the fill
 * scenario, so the client labels an override by what it asked for.
 *
 * Geometry arrives as WKT in EPSG:2274 feet and goes through the same
 * 2274 → 4326 → 3857 pipeline as everything else on the sheet.
 */
import type { LineString, Point, Polygon, Position } from 'geojson';
import type { Element } from '../../../engine/types';
import { clipPolysToObstacles, unionPolys } from '../../../engine/validatePlan';
import { feature4326To3857 } from '../../../utils/reproject';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { supabase } from '../../../lib/supabase';
import { wktLines, wktPoint, wktPolygons } from './wkt';

export type SfV1Basis = 'by_right' | 'override';

/** One self-grading test: `street.dead_end_max`, `access.second_connection`,
 *  `block.length`, `storm.low_point`, `open.unassigned`, `yield.vs_arithmetic`
 *  (no pass — a ratio), and in the floodplain `flood.freeboard`,
 *  `flood.cut_fill_balance`, `street.grade_max`. Each carries its own
 *  figures (value / limit, acres, area_sf / needed_sf, fill_cy …). */
export interface SfV1Test {
  id: string;
  pass: boolean | null;
  [k: string]: unknown;
}

export interface SfV1Cut {
  required_cy?: number | null;
  pond_cy?: number | null;
  open_floodplain_ac_available?: number | null;
  avg_depth_ft_needed?: number | null;
  closes_on_site?: boolean | null;
  [k: string]: unknown;
}

export interface SfV1StreetGrade {
  max_pct?: number | null;
  limit_pct?: number | null;
  ft_over_limit?: number | null;
  [k: string]: unknown;
}

/** Always present on a drawn plan: the ground and the street grade; the flood
 *  figures are zero / null unless the plan builds in the SFHA. */
export interface SfV1Earthwork {
  bfe_ft?: number | null;
  pad_target_ft?: number | null;
  freeboard_ft?: number | null;
  sfha_ac?: number | null;
  lots_in_sfha?: number | null;
  cells_in_sfha?: number | null;
  ground_min_ft?: number | null;
  ground_max_ft?: number | null;
  fill_max_ft?: number | null;
  /** cubic yards by component (total, streets, graded_aprons, pads_and_drives) or one total */
  fill_cy?: Record<string, number | null> | number | null;
  pad_fill_ft?: { min?: number | null; median?: number | null; max?: number | null } | null;
  lots_with_pad_fill_over_10ft?: number | null;
  cut?: SfV1Cut | null;
  street_grade?: SfV1StreetGrade | null;
  notes?: string[] | null;
  /** per-pad fill in feet, parallel to the pads, should the server ever send it */
  pad_fill_ft_by_lot?: Array<number | null> | null;
  pad_fills_ft?: Array<number | null> | null;
  pads?: Array<{ fill_ft?: number | null; [k: string]: unknown }> | null;
  [k: string]: unknown;
}

export interface SfV1Metrics {
  gross_du_per_ac?: number | null;
  lots_per_100ft_street?: number | null;
  street_ft?: number | null;
  row_pct?: number | null;
  lot_pct?: number | null;
  open_pct?: number | null;
  avg_lot_sf?: number | null;
  dead_ends?: number | null;
  dead_end_max_ft?: number | null;
  impervious_pct?: number | null;
  pond_sf?: number | null;
  low_point_ft?: number | null;
  buffat_mill_reference?: unknown;
  [k: string]: unknown;
}

export interface SfV1OpenPiece {
  acres?: number | null;
  /** 'amenity: pond and its edge', 'amenity: street island / green (too shallow for a lot)',
   *  'amenity: neighborhood park', 'natural: wetland / water buffer',
   *  'unassigned: buildable land without a street or a lot' */
  kind?: string | null;
  [k: string]: unknown;
}

/** A catalogue floor plan the engine placed on a lot (CubiCasa5k, scaled). */
export interface SfV1House {
  plan?: string | null;
  floorplan_id?: string | null;
  footprint_sf?: number | null;
  w_ft?: number | null;
  d_ft?: number | null;
  beds?: number | null;
  baths?: number | null;
  floors?: number | null;
  garage?: boolean | null;
  turned?: boolean | null;
  source?: string | null;
}

/** "4 bed · 3,184 sf", or null when the lot carries only the generic pad. */
export function houseLabel(h: SfV1House | null | undefined): string | null {
  if (!h) return null;
  const parts: string[] = [];
  if (typeof h.beds === 'number') parts.push(`${h.beds} bed`);
  if (typeof h.footprint_sf === 'number') parts.push(`${Math.round(h.footprint_sf).toLocaleString()} sf`);
  return parts.length ? parts.join(' · ') : null;
}

export interface SfV1Response {
  status?: 'done' | 'skipped' | string;
  reason?: string | null;
  error?: string | null;
  basis?: SfV1Basis | string;
  flood_hold?: string | null;
  ogc_fid?: number | null;
  address?: string | null;
  zoning?: string | null;
  site_acres?: number | null;
  held_acres?: number | null;
  ms?: number | null;
  lots?: number | null;
  pattern?: string | null;
  rings?: number | null;
  cross_streets?: number | null;
  cul_de_sacs?: number | null;
  corner_lots?: number | null;
  edge_lots?: number | null;
  stubs?: number | null;
  connections?: number | null;
  lot_w_ft?: number | null;
  lot_d_ft?: number | null;
  min_lot_sf?: number | null;
  block_depth_ft?: number | null;
  setbacks?: Record<string, unknown> | null;
  metrics?: SfV1Metrics | null;
  floodplain_built_on_ac?: number | null;
  street_in_wetland_ft?: number | null;
  open_pieces?: SfV1OpenPiece[] | null;
  /** standard / edge / corner / pie / estate, parallel to the lots */
  lot_kinds?: string[] | null;
  /** square feet, parallel to the lots */
  lot_areas_sf?: number[] | null;
  /** 2026-11-09: a catalogue house plan per lot (aligned with lots_wkt), or null where only the generic pad fit */
  houses?: Array<SfV1House | null> | null;
  houses_placed?: number | null;
  tests?: Record<string, unknown> | SfV1Test[] | null;
  fails?: string[] | null;
  notes?: string[] | null;
  earthwork?: SfV1Earthwork | null;
  /** WKT, EPSG:2274 feet */
  street_lines_wkt?: string | null;
  row_wkt?: string | null;
  pave_wkt?: string | null;
  bulbs_wkt?: string | null;
  lots_wkt?: string | null;
  pads_wkt?: string | null;
  drives_wkt?: string | null;
  open_wkt?: string | null;
  pond_wkt?: string | null;
  park_wkt?: string | null;
  reserve_wkt?: string | null;
  reserve_ac?: number | null;
  deep_fill_hold_wkt?: string | null;
  /** the neighborhood grammar's trail along the green (LINESTRING) and the green strip it runs in */
  trail_wkt?: string | null;
  green_strip_wkt?: string | null;
  low_point_wkt?: string | null;
  origin_wkt?: string | null;
  generator_version?: string | null;
  /** engine g14: land steeper than 25% held out before the layout, as geometry (0-lot answers included) and acres */
  hillside_wkt?: string | null;
  hillside_ac?: number | null;
  /** engine g14: the site less every hold (flood, hillside) */
  buildable_after_holds_ac?: number | null;
  [k: string]: unknown;
}

/** The `p_opt` of fn_sf_v1_plan. A lot module, the fill scenario, setbacks,
 *  the entry position or params make the answer an override; the pattern
 *  (grid / neighborhood) and `module_by_right` do not — they are by-right
 *  choices the engine draws from the district's own standards. */
export interface SfV1Options {
  lot_w_ft?: number;
  lot_d_ft?: number;
  min_lot_sf?: number;
  /** 'floodway' = the fill scenario: hold out only the regulatory floodway */
  flood?: 'floodway' | string;
  setbacks?: Record<string, number>;
  entry_frac?: number;
  /** overrides for any fn_sf_v1_params() value */
  params?: Record<string, unknown>;
  /** draw one pattern: 'grid' | 'neighborhood' (absent: the loop grammar, the default) — not an override */
  pattern?: 'grid' | 'neighborhood' | string;
  /** try another shape of the district module, still by right (estate districts) — not an override */
  module_by_right?: boolean;
  /** EPSG:2274 polygon held out of the site (commercial, anything else) */
  reserve_wkt?: string;
  /** the competition's budget for the townhome engine's search (ms; the engine's default is 15 s) — not an override */
  th_budget_ms?: number;
}

/** Option keys that choose among by-right answers rather than override the district. */
const BY_RIGHT_OPTION_KEYS = new Set(['pattern', 'module_by_right', 'th_budget_ms']);

/** The townhome search's share of the competition on multifamily land (engine g13: "~8 s to stay under 20 s cold"). */
export const RM_COMPETITION_TH_BUDGET_MS = 8000;

/** The shared private drive (engine g13, the estate grammar's first form): a
 *  24-ft easement, a 16-ft lane, no turnaround bulb, at most 6 lots. Since
 *  engine g14 `pattern: 'drive'` is self-contained (the client once had to
 *  send the drive section as params). */
export const DRIVE_PATTERN = 'shared private drive';
export const isDrivePattern = (pattern: string | null | undefined): boolean => (pattern ?? '').trim().toLowerCase() === DRIVE_PATTERN;

/** The option set the competition used for one grammar's plan: the user's
 *  options and the pattern (never an override). */
export function candidateOpt(requested: string, opt: SfV1Options): SfV1Options {
  const base = withoutPattern(opt);
  if (requested === 'loop') return base;
  return { ...base, pattern: requested };
}

/** A grammar by name, as the competition's rows say it. */
export function grammarName(requested: string): string {
  if (requested === 'drive') return DRIVE_PATTERN;
  if (requested === 'townhome') return 'townhomes';
  if (requested === 'single') return 'single-street grammar';
  if (requested === 'estate') return 'estate lots';
  return `${requested} grammar`;
}

export const SFV1_ID_PREFIX = 'sfv1-';

export function isSfV1Element(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith(SFV1_ID_PREFIX);
}

/** The owner's routing rule, from the base district: R / RS → the by-right
 *  subdivision; RM / MUL / SP → attached homes; anything else → not this path. */
export function sfV1Route(zoningBase: string | null | undefined): 'sf_v1' | 'th' | null {
  const z = (zoningBase ?? '').trim().toUpperCase();
  if (!z) return null;
  if (/^RS?\d/.test(z)) return 'sf_v1';
  if (/^(RM|MUL|SP)/.test(z)) return 'th';
  return null;
}

export function isOverride(opt: SfV1Options | null | undefined): boolean {
  return !!opt && Object.entries(opt).some(([k, v]) => !BY_RIGHT_OPTION_KEYS.has(k) && v !== undefined && v !== null && v !== false);
}

/** The options without the pattern choice: the lot module / fill scenario the user set. */
export function withoutPattern(opt: SfV1Options): SfV1Options {
  const { pattern: _pattern, ...rest } = opt;
  void _pattern;
  return rest;
}

function cleanOpt(opt: SfV1Options | null | undefined): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opt ?? {})) if (v !== undefined && v !== null) clean[k] = v;
  return clean;
}

/** A test that passes with its value over its limit (street.grade_max at 12% against 10%,
 *  100 ft of street over it): the engine allows some length over the limit, and the panel
 *  says so instead of showing a plain tick next to a number over the limit. */
export function passesOverLimit(t: SfV1Test): { over: number; ftOver: number | null } | null {
  if (t.pass !== true) return null;
  const value = num(t.value);
  const limit = num(t.limit);
  if (value == null || limit == null || value <= limit) return null;
  return { over: value - limit, ftOver: num(t.ft_over_limit) };
}

/** The engine's steep-ground caveat ("ground averages 36% slope with 325 ft of fall …"):
 *  the engine measures terrain but does not lay out by it yet, so the panel leads with it. */
export function steepGroundNote(notes: string[]): string | null {
  return notes.find(n => /\bslope\b/i.test(n) && /\bfall\b/i.test(n)) ?? null;
}

/** Fill-depth bands for the earthwork view (feet of pad fill). */
export type FillBand = 'under4' | '4to8' | '8to12' | 'over12';
export const FILL_BANDS: Array<{ key: FillBand; label: string; color: string }> = [
  { key: 'under4', label: 'under 4 ft', color: '#FDE68A' },
  { key: '4to8', label: '4–8 ft', color: '#FBBF24' },
  { key: '8to12', label: '8–12 ft', color: '#F97316' },
  { key: 'over12', label: 'over 12 ft', color: '#DC2626' },
];
export function fillBand(ft: number): FillBand {
  if (ft < 4) return 'under4';
  if (ft < 8) return '4to8';
  if (ft < 12) return '8to12';
  return 'over12';
}
export function fillColor(ft: number): string {
  return FILL_BANDS.find(b => b.key === fillBand(ft))?.color ?? '#DC2626';
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === 'string') : []);

/** `tests` arrives as an object keyed by id (the live shape), each value an
 *  object with `pass` and its own figures, or a bare boolean; a list of
 *  {id, pass, …} is accepted too. A test without `pass` (yield.vs_arithmetic
 *  is a ratio, not a verdict) keeps pass = null. */
export function normalizeTests(tests: unknown): SfV1Test[] {
  const passOf = (o: Record<string, unknown>): boolean | null =>
    typeof o.pass === 'boolean' ? o.pass : typeof o.ok === 'boolean' ? o.ok : null;
  if (Array.isArray(tests)) {
    return (tests as unknown[]).flatMap(t => {
      if (!t || typeof t !== 'object') return [];
      const o = t as Record<string, unknown>;
      const id = str(o.id) ?? str(o.test) ?? str(o.name);
      if (!id) return [];
      return [{ ...o, id, pass: passOf(o) }];
    });
  }
  if (tests && typeof tests === 'object') {
    return Object.entries(tests as Record<string, unknown>).map(([id, v]) => {
      if (typeof v === 'boolean') return { id, pass: v };
      const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      return { ...o, id, pass: passOf(o) };
    });
  }
  return [];
}

/** Does the plan build in the flood hazard area (so fill, cut and the pad target mean something)?
 *  A BFE on the parcel is not enough: a by-right plan that holds the SFHA out
 *  carries the BFE (0 Pennington Bend Rd: BFE 421, nothing built below it)
 *  and needs no fill. */
export function earthworkHasFlood(ew: SfV1Earthwork | null | undefined): boolean {
  if (!ew) return false;
  const total = typeof ew.fill_cy === 'number' ? ew.fill_cy : num(ew.fill_cy?.total);
  return (num(ew.sfha_ac) ?? 0) > 0 || (num(ew.lots_in_sfha) ?? 0) > 0 || (total ?? 0) > 0;
}

/** Per-pad fill in feet when the server gives it, under any of the keys it might use. */
export function padFillByLot(ew: SfV1Earthwork | null | undefined): Array<number | null> | null {
  if (!ew) return null;
  const arr = ew.pad_fill_ft_by_lot ?? ew.pad_fills_ft ?? (Array.isArray(ew.pads) ? ew.pads.map(p => num(p?.fill_ft)) : null);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.map(v => num(v));
}

export interface SfV1Summary {
  status: string;
  reason: string | null;
  basis: SfV1Basis;
  floodHold: string | null;
  address: string | null;
  zoning: string | null;
  siteAcres: number | null;
  lots: number;
  pattern: string | null;
  densityDuAc: number | null;
  lotWFt: number | null;
  lotDFt: number | null;
  minLotSf: number | null;
  streetFt: number | null;
  rowPct: number | null;
  lotPct: number | null;
  openPct: number | null;
  avgLotSf: number | null;
  deadEnds: number | null;
  deadEndMaxFt: number | null;
  imperviousPct: number | null;
  pondSf: number | null;
  lowPointFt: number | null;
  counts: { rings: number | null; crossStreets: number | null; culDeSacs: number | null; cornerLots: number | null; edgeLots: number | null; stubs: number | null; connections: number | null };
  floodplainBuiltOnAc: number | null;
  streetInWetlandFt: number | null;
  /** land the generator held out of the site (the flood hold) and, with the natural pieces inside it, the share of the parcel */
  heldAcres: number | null;
  heldPct: number | null;
  openPieces: Array<{ kind: string; acres: number | null }>;
  lotKinds: Record<string, number>;
  /** lots that carry a catalogue house plan (the rest keep a generic pad); null when the engine did not say */
  housesPlaced: number | null;
  tests: SfV1Test[];
  fails: string[];
  notes: string[];
  earthwork: SfV1Earthwork | null;
  /** the plan builds in the SFHA: fill, cut and the pad target apply */
  hasFlood: boolean;
  /** fill-depth colouring applied to the pads (per-pad fill from the DEM) */
  fillView: boolean;
  streetGrade: { maxPct: number | null; limitPct: number | null; ftOverLimit: number | null } | null;
  /** the shared private drive (pattern 'shared private drive'): its easement and lane, measured off the drawing, and the lot cap */
  privateDrive: { easementFt: number | null; laneFt: number | null; lengthFt: number | null; maxLots: number | null } | null;
  /** engine g14: the hillside hold (land steeper than 25%) and what is left after every hold */
  hillsideAcres: number | null;
  buildableAfterHoldsAc: number | null;
  ms: number | null;
  generatorVersion: string | null;
  basisLine: string;
}

type Poly3857 = { type: 'Polygon'; coordinates: number[][][] };

function to3857(p: Polygon): Polygon | null {
  try {
    const out = feature4326To3857(geom2274To4326(p as never) as never) as Polygon;
    return Array.isArray(out?.coordinates?.[0]) && out.coordinates[0].length >= 4 ? out : null;
  } catch {
    return null;
  }
}
function polys3857(wkt: string | null | undefined): Polygon[] {
  return wktPolygons(wkt).map(to3857).filter((p): p is Polygon => p != null);
}
/** Area of an EPSG:2274 (US ft) WKT in square feet: outer rings less their holes. */
function areaSf2274(wkt: string | null | undefined): number {
  const ring = (r: Position[]) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i]![0]! * r[i + 1]![1]! - r[i + 1]![0]! * r[i]![1]!;
    return Math.abs(a) / 2;
  };
  return wktPolygons(wkt).reduce((sum, p) => sum + p.coordinates.reduce((s, r, k) => s + (k === 0 ? ring(r) : -ring(r)), 0), 0);
}
/** Length of an EPSG:2274 WKT line in feet. */
function lengthFt2274(wkt: string | null | undefined): number {
  return wktLines(wkt).reduce((sum, l) => {
    let L = 0;
    for (let i = 1; i < l.coordinates.length; i++) L += Math.hypot(l.coordinates[i]![0]! - l.coordinates[i - 1]![0]!, l.coordinates[i]![1]! - l.coordinates[i - 1]![1]!);
    return sum + L;
  }, 0);
}
/** A path drawn as a thin band: each segment of the EPSG:2274 line becomes a
 *  quad ~8 ft wide in the canvas frame, unioned into one piece per line. */
export function trailStrips3857(wkt: string | null | undefined, halfWidthM = 1.5): Polygon[] {
  const out: Polygon[] = [];
  for (const line of wktLines(wkt)) {
    let coords: Position[];
    try {
      coords = (feature4326To3857(geom2274To4326(line as never) as never) as LineString).coordinates;
    } catch {
      continue;
    }
    const quads: Poly3857[] = [];
    for (let i = 1; i < coords.length; i++) {
      const [ax, ay] = coords[i - 1] as [number, number];
      const [bx, by] = coords[i] as [number, number];
      const len = Math.hypot(bx - ax, by - ay);
      if (!(len > 0.01)) continue;
      const nx = (-(by - ay) / len) * halfWidthM;
      const ny = ((bx - ax) / len) * halfWidthM;
      quads.push({ type: 'Polygon', coordinates: [[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny], [ax + nx, ay + ny]]] });
    }
    for (const piece of unionPolys(quads)) out.push(piece as unknown as Polygon);
  }
  return out;
}
function point3857(wkt: string | null | undefined): Position | null {
  const pt = wktPoint(wkt);
  if (!pt) return null;
  try {
    return (feature4326To3857(geom2274To4326(pt as never) as never) as Point).coordinates;
  } catch {
    return null;
  }
}

/** Element properties without undefined keys (exactOptionalPropertyTypes). */
function props(o: Record<string, unknown>): Element['properties'] {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Element['properties'];
}

/** Open-space kinds ('amenity: …', 'natural: …', 'unassigned: …') → how they draw.
 *  An amenity is green; natural land is held out, hatched; unassigned land is
 *  what the layout could not use, drawn as such — never as an amenity. */
export function openStyle(kind: string): { name: string; kind: string; color: string; strokeColor: string; opacity: number; greenway: boolean; label?: string } {
  const k = kind.toLowerCase();
  const after = kind.includes(':') ? kind.slice(kind.indexOf(':') + 1).trim() : kind;
  const cap = after.charAt(0).toUpperCase() + after.slice(1);
  if (k.startsWith('natural')) return { name: cap || 'Natural land', kind: 'greenway', color: '#99F6E4', strokeColor: '#0D9488', opacity: 0.6, greenway: true, label: cap };
  if (k.startsWith('unassigned')) return { name: 'Unassigned', kind: 'reserve', color: '#F1F5F9', strokeColor: '#CBD5E1', opacity: 0.4, greenway: false };
  // land held out on request (commercial, anything else) — not an amenity, not waste
  if (k.startsWith('reserve')) return { name: cap && cap.toLowerCase() !== 'reserve' ? `Reserve — ${after}` : 'Reserve', kind: 'reserve', color: '#E2E8F0', strokeColor: '#64748B', opacity: 0.45, greenway: false };
  if (k.startsWith('amenity')) return { name: cap || 'Amenity', kind: 'amenity', color: '#BBF7D0', strokeColor: '#16A34A', opacity: 0.6, greenway: false };
  if (k.includes('wetland') || k.includes('buffer')) return { name: cap, kind: 'greenway', color: '#99F6E4', strokeColor: '#0D9488', opacity: 0.6, greenway: true, label: cap };
  if (k.includes('pond')) return { name: 'Pond', kind: 'pond', color: '#BFDBFE', strokeColor: '#2563EB', opacity: 0.85, greenway: false };
  return { name: cap || 'Open space', kind: 'open', color: '#D9F99D', strokeColor: '#65A30D', opacity: 0.5, greenway: false };
}

/**
 * Map the generator payload to canvas elements.
 *   lots                    → 'other'        (parcel-line style, below everything; "Lot N" carries the lot tag with the server's area)
 *   pads                    → 'building'     (one house footprint each; coloured by fill depth in the earthwork view)
 *   right-of-way            → 'other'        (the band the street sits in)
 *   pavement + bulbs        → 'circulation'  (unioned: the street itself; centrelines ride along for the profile)
 *   driveways               → 'circulation'  (clipped to the pads they serve)
 *   open space by kind, the park, the reserve, the deep-fill hold, the pond, the wetlands → 'greenspace'
 *   the low point           → a small marker ('other')
 */
export function sfV1ToElements(
  resp: SfV1Response,
  opts: {
    nobuildWkt?: string | null;
    /** the land the flood hold takes out of the site (fn_sf_v1_site_app hold_wkt) */
    holdWkt?: string | null;
    overrideRequested?: boolean;
    padFillFt?: Array<number | null> | null;
  } = {}
): { elements: Element[]; summary: SfV1Summary } {
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];

  // The flood hold: the land the generator takes out of the site before it
  // lays anything out. Drawn first, under everything — without it a by-right
  // plan that keeps out of the floodplain leaves an unexplained blank
  // (930 Morton Mill Rd: 2.71 of 4.47 ac held, 0 lots on the rest).
  const holdLabel = str(resp.flood_hold) === 'floodway' ? 'Regulatory floodway · held out' : 'Flood hazard area · held out';
  polys3857(opts.holdWkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}hold-${i + 1}`,
      type: 'greenspace',
      name: holdLabel,
      geometry: poly,
      properties: props({
        kind: 'greenway', hazardKind: 'floodplain', label: holdLabel,
        styleOverride: true, color: '#DBEAFE', opacity: 0.45, strokeColor: '#3B82F6',
      }),
      metadata: meta,
    });
  });
  // The hillside hold (engine g14): land steeper than 25% the generator holds
  // out before the layout, returned as geometry on every plan, 0-lot answers
  // included (0 Dry Fork Rd: 25 of 31 ac). Drawn like the flood hold, unless
  // the plan already carries it as natural open pieces (the same land, named).
  const hillsideInPieces = (Array.isArray(resp.open_pieces) ? resp.open_pieces : []).some(p => /hillside/i.test(str(p?.kind) ?? ''));
  const hillsideLabel = 'Hillside · held out (over 25% slope)';
  if (!hillsideInPieces) {
    polys3857(str(resp.hillside_wkt)).forEach((poly, i) => {
      elements.push({
        id: `${SFV1_ID_PREFIX}hillside-${i + 1}`,
        type: 'greenspace',
        name: hillsideLabel,
        geometry: poly,
        properties: props({
          kind: 'greenway', hazardKind: 'slope', label: hillsideLabel,
          styleOverride: true, color: '#FDE68A', opacity: 0.45, strokeColor: '#B45309',
        }),
        metadata: meta,
      });
    });
  }
  const m = resp.metrics ?? {};
  const tests = normalizeTests(resp.tests);
  const fails = strings(resp.fails).length > 0 ? strings(resp.fails) : tests.filter(t => t.pass === false).map(t => t.id);
  const notes = strings(resp.notes);
  const earthwork = resp.earthwork && typeof resp.earthwork === 'object' ? resp.earthwork : null;
  const hasFlood = earthworkHasFlood(earthwork);
  const perPadFill = opts.padFillFt ?? padFillByLot(earthwork);
  const basis: SfV1Basis = opts.overrideRequested || resp.basis === 'override' ? 'override' : 'by_right';
  // The shared private drive (engine g13): the band is an access easement and
  // the pavement a private lane, not a public street — measured off the
  // drawing (area over centreline length), so the label follows the engine.
  const drivePlan = isDrivePattern(str(resp.pattern));
  const driveLenFt = drivePlan ? lengthFt2274(resp.street_lines_wkt) : 0;
  const privateDrive = drivePlan
    ? {
        easementFt: driveLenFt > 0 ? Math.round(areaSf2274(resp.row_wkt) / driveLenFt) || null : null,
        laneFt: driveLenFt > 0 ? Math.round(areaSf2274(resp.pave_wkt) / driveLenFt) || null : null,
        lengthFt: driveLenFt > 0 ? Math.round(driveLenFt) : num(m.street_ft),
        maxLots: num(tests.find(t => t.id === 'access.private_drive_max_lots')?.limit),
      }
    : null;

  // Right-of-way: the band, drawn like a lot line so the pavement reads on top of it.
  polys3857(resp.row_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}row-${i + 1}`,
      type: 'other',
      name: drivePlan ? 'Access easement' : 'Right-of-way',
      geometry: poly,
      properties: props({ kind: drivePlan ? 'easement' : 'row', styleOverride: true, color: '#E2E8F0', opacity: 0.6, strokeColor: '#CBD5E1' }),
      metadata: meta,
    });
  });

  // The street: pavement and the cul-de-sac bulbs as one network (a bulb meets
  // its stem by construction — one merged piece, never two overlapping ones).
  const pavePieces = unionPolys([
    ...polys3857(resp.pave_wkt),
    ...polys3857(resp.bulbs_wkt),
  ].map(p => ({ type: 'Polygon' as const, coordinates: p.coordinates as number[][][] })));
  const centerlines = wktLines(resp.street_lines_wkt).map(l => l.coordinates);
  const pattern = str(resp.pattern);
  pavePieces.forEach((piece, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}street-${i + 1}`,
      type: 'circulation',
      name: pattern === 'frontage lots, no new street' ? 'Existing street frontage' : drivePlan ? 'Shared private drive' : 'Street',
      geometry: piece as unknown as Polygon,
      properties: props({
        kind: 'through',
        pattern: pattern ?? undefined,
        // the sheet labels it an access easement, not a public right-of-way
        privateDrive: drivePlan || undefined,
        easementFt: privateDrive?.easementFt ?? undefined,
        laneFt: privateDrive?.laneFt ?? undefined,
        // EPSG:2274 centrelines travel with the street for stationing and the profile
        centerline2274: centerlines[i],
        extraCenterlines2274: i === 0 && centerlines.length > pavePieces.length ? centerlines.slice(pavePieces.length) : undefined,
        styleOverride: true, color: '#A9B4C0', opacity: 0.92, strokeColor: '#7B8794',
      }),
      metadata: meta,
    });
  });

  // Lots, with their kind (standard / edge / corner / pie / estate) and the server's area riding along.
  const lotKinds = strings(resp.lot_kinds);
  const lotAreas = Array.isArray(resp.lot_areas_sf) ? resp.lot_areas_sf : [];
  const lotKindCounts: Record<string, number> = {};
  const houses = Array.isArray(resp.houses) ? resp.houses : [];
  const lotPolys = polys3857(resp.lots_wkt);
  lotPolys.forEach((poly, i) => {
    const kind = lotKinds[i] ?? null;
    if (kind) lotKindCounts[kind] = (lotKindCounts[kind] ?? 0) + 1;
    const house = houses[i] ?? null;
    elements.push({
      id: `${SFV1_ID_PREFIX}lot-${i + 1}`,
      type: 'other',
      name: `Lot ${i + 1}`,
      geometry: poly,
      properties: props({
        lotKind: kind ?? undefined,
        // the engine's house plan for this lot, read on the sheet as "4 bed · 3,184 sf" (2026-11-09)
        houseLabel: houseLabel(house) ?? undefined,
        houseBeds: house?.beds ?? undefined,
        houseBaths: house?.baths ?? undefined,
        houseFootprintSf: house?.footprint_sf ?? undefined,
        areaSqFt: num(lotAreas[i]) ?? undefined,
        // the module is the standard lot's dimension; an edge, corner, pie or estate lot has its own
        widthFt: kind === 'standard' ? num(resp.lot_w_ft) ?? undefined : undefined,
        depthFt: kind === 'standard' ? num(resp.lot_d_ft) ?? undefined : undefined,
        color: kind === 'pie' ? '#EEF2F7' : '#E5E7EB',
      }),
      metadata: meta,
    });
  });

  // Pads: one house footprint per lot. In the earthwork view each pad is
  // coloured by the fill it needs (under 4 / 4–8 / 8–12 / over 12 ft).
  const padPolys = polys3857(resp.pads_wkt);
  const fillView = hasFlood && !!perPadFill && perPadFill.some(v => v != null);
  padPolys.forEach((poly, i) => {
    const fill = fillView ? perPadFill?.[i] ?? null : null;
    const house = houses[i] ?? null;
    const label = houseLabel(house);
    elements.push({
      id: `${SFV1_ID_PREFIX}pad-${i + 1}`,
      type: 'building',
      // a placed catalogue plan is the real footprint; the generic pad says so by having no plan
      name: label ? `House ${i + 1} · ${label}` : `House ${i + 1}`,
      geometry: poly,
      properties: props({
        floors: house?.floors ?? 1,
        stories: house?.floors ?? 1,
        use: 'residential',
        house: true,
        housePlan: house?.plan ?? undefined,
        floorplanId: house?.floorplan_id ?? undefined,
        houseBeds: house?.beds ?? undefined,
        houseBaths: house?.baths ?? undefined,
        houseFootprintSf: house?.footprint_sf ?? undefined,
        houseGarage: house?.garage ?? undefined,
        houseSource: house?.source ?? undefined,
        areaSqFt: house?.footprint_sf ?? undefined,
        padFillFt: fill ?? undefined,
        fillBand: fill != null ? fillBand(fill) : undefined,
        ...(fill != null
          ? { styleOverride: true, color: fillColor(fill), opacity: 0.9, strokeColor: '#7C2D12' }
          : { color: '#3B82F6' }),
      }),
      metadata: meta,
    });
  });

  // Driveways: clipped to the pads they serve and to the street they meet, so
  // the gate never sees a pad under pavement or a driveway lapping the street
  // (2400 W Heiman: 18 m² of driveway over the pavement rejected the plan).
  const driveObstacles = [
    ...padPolys.map(p => ({ type: 'Polygon' as const, coordinates: p.coordinates as number[][][] })),
    ...(pavePieces as Poly3857[]),
  ];
  const drivePieces = clipPolysToObstacles(
    polys3857(resp.drives_wkt).map(p => ({ type: 'Polygon' as const, coordinates: p.coordinates as number[][][] })),
    driveObstacles,
    1
  );
  (drivePieces as Poly3857[]).forEach((piece, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}drive-${i + 1}`,
      type: 'circulation',
      name: 'Driveway',
      geometry: piece as unknown as Polygon,
      properties: props({ kind: 'driveway', styleOverride: true, color: '#D5DCE4', opacity: 0.85, strokeColor: '#AEB8C4' }),
      metadata: meta,
    });
  });

  // Open space by kind. The pieces list is parallel to the polygons of open_wkt.
  const pieces = Array.isArray(resp.open_pieces) ? resp.open_pieces : [];
  const openPolys = polys3857(resp.open_wkt);
  const openPieces: Array<{ kind: string; acres: number | null }> = pieces.map(p => ({ kind: str(p?.kind) ?? 'open space', acres: num(p?.acres) }));
  let naturalPieces = 0;
  openPolys.forEach((poly, i) => {
    const kind = str(pieces[i]?.kind) ?? 'open space';
    const style = openStyle(kind);
    if (style.greenway) naturalPieces += 1;
    const acres = num(pieces[i]?.acres);
    elements.push({
      id: `${SFV1_ID_PREFIX}open-${i + 1}`,
      type: 'greenspace',
      name: style.name,
      geometry: poly,
      properties: props({
        kind: style.kind,
        openKind: kind,
        hazardKind: style.greenway ? 'wetland' : undefined,
        label: style.label,
        areaSqFt: acres != null ? Math.round(acres * 43560) : undefined,
        styleOverride: true, color: style.color, opacity: style.opacity, strokeColor: style.strokeColor,
      }),
      metadata: meta,
    });
  });

  // The park and the reserve, when the generator sets them aside.
  polys3857(resp.park_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}park-${i + 1}`, type: 'greenspace', name: 'Park', geometry: poly,
      properties: props({ kind: 'amenity', styleOverride: true, color: '#86EFAC', opacity: 0.6, strokeColor: '#22C55E' }), metadata: meta,
    });
  });
  polys3857(resp.reserve_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}reserve-${i + 1}`, type: 'greenspace', name: 'Reserve', geometry: poly,
      properties: props({ kind: 'reserve', styleOverride: true, color: '#F1F5F9', opacity: 0.35, strokeColor: '#CBD5E1' }), metadata: meta,
    });
  });
  // The neighborhood grammar's green strip and the trail along it (W Heiman:
  // a linear park on the stream corridor with the trail down its length).
  polys3857(resp.green_strip_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}green-strip-${i + 1}`, type: 'greenspace', name: 'Green', geometry: poly,
      properties: props({ kind: 'amenity', styleOverride: true, color: '#BBF7D0', opacity: 0.6, strokeColor: '#15803D' }), metadata: meta,
    });
  });
  trailStrips3857(resp.trail_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}trail-${i + 1}`, type: 'greenspace', name: 'Trail', geometry: poly,
      properties: props({ kind: 'trail', styleOverride: true, color: '#A16207', opacity: 0.75, strokeColor: '#713F12' }), metadata: meta,
    });
  });

  // Land held out because the fill to the pad target would exceed the cap.
  polys3857(resp.deep_fill_hold_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}deep-fill-hold-${i + 1}`, type: 'greenspace', name: 'Deep-fill hold', geometry: poly,
      properties: props({ kind: 'greenway', hazardKind: 'floodplain', label: 'Deep-fill hold (fill over the cap)', styleOverride: true, color: '#FECACA', opacity: 0.5, strokeColor: '#B91C1C' }), metadata: meta,
    });
  });

  // Wetlands (the site's no-build land) hatched as greenway, unless the plan
  // already carries its natural pieces (the same land, named by the generator).
  if (naturalPieces === 0) {
    polys3857(opts.nobuildWkt).forEach((poly, i) => {
      elements.push({
        id: `${SFV1_ID_PREFIX}nobuild-${i + 1}`,
        type: 'greenspace',
        name: 'Wetland',
        geometry: poly,
        properties: props({ kind: 'greenway', hazardKind: 'wetland', styleOverride: true, color: '#99F6E4', opacity: 0.5, strokeColor: '#0D9488' }),
        metadata: meta,
      });
    });
  }

  // The storm pond at the low point, water-blue over whatever open piece holds it.
  polys3857(resp.pond_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}pond-${i + 1}`,
      type: 'greenspace',
      name: 'Pond',
      geometry: poly,
      properties: props({
        kind: 'pond', areaSqFt: num(m.pond_sf) ?? undefined,
        styleOverride: true, color: '#BFDBFE', opacity: 0.9, strokeColor: '#2563EB',
      }),
      metadata: meta,
    });
  });

  // The low point: a small marker where the site drains (the pond's reason).
  const low = point3857(resp.low_point_wkt);
  if (low && low.length >= 2) {
    const [lx, ly] = low as [number, number];
    const r = 2.5; // ~8 ft across in the canvas frame (metres)
    const ring: number[][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ring.push([lx + r * Math.cos(a), ly + r * Math.sin(a)]);
    }
    ring.push([lx + r, ly]);
    elements.push({
      id: `${SFV1_ID_PREFIX}low-point`,
      type: 'other',
      name: 'Low point',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: props({
        kind: 'low_point', elevationFt: num(m.low_point_ft) ?? undefined,
        styleOverride: true, color: '#1D4ED8', opacity: 0.9, strokeColor: '#1E3A8A',
      }),
      metadata: meta,
    });
  }

  const sg = earthwork?.street_grade && typeof earthwork.street_grade === 'object' ? earthwork.street_grade : null;
  const siteAcres = num(resp.site_acres);
  const heldAcres = num(resp.held_acres);
  const naturalAcres = openPieces.filter(p => p.kind.toLowerCase().startsWith('natural')).reduce((a, p) => a + (p.acres ?? 0), 0);
  // the hillside hold counts as held land; on a drawn plan it is already among the natural pieces
  const hillsideAcres = num(resp.hillside_ac);
  const heldOutAcres = (heldAcres ?? 0) + naturalAcres + (hillsideInPieces ? 0 : hillsideAcres ?? 0);
  const heldPct = siteAcres != null && siteAcres > 0 ? Math.round((heldOutAcres / (siteAcres + (heldAcres ?? 0))) * 1000) / 10 : null;
  const summary: SfV1Summary = {
    status: str(resp.status) ?? (resp.error ? 'error' : 'done'),
    reason: str(resp.reason) ?? str(resp.error),
    basis,
    floodHold: str(resp.flood_hold),
    address: str(resp.address),
    zoning: str(resp.zoning),
    siteAcres,
    lots: num(resp.lots) ?? lotPolys.length,
    pattern,
    densityDuAc: num(m.gross_du_per_ac),
    lotWFt: num(resp.lot_w_ft),
    lotDFt: num(resp.lot_d_ft),
    minLotSf: num(resp.min_lot_sf),
    streetFt: num(m.street_ft),
    rowPct: num(m.row_pct),
    lotPct: num(m.lot_pct),
    openPct: num(m.open_pct),
    avgLotSf: num(m.avg_lot_sf),
    deadEnds: num(m.dead_ends),
    deadEndMaxFt: num(m.dead_end_max_ft),
    imperviousPct: num(m.impervious_pct),
    pondSf: num(m.pond_sf),
    lowPointFt: num(m.low_point_ft),
    counts: {
      rings: num(resp.rings), crossStreets: num(resp.cross_streets), culDeSacs: num(resp.cul_de_sacs),
      cornerLots: num(resp.corner_lots), edgeLots: num(resp.edge_lots), stubs: num(resp.stubs), connections: num(resp.connections),
    },
    floodplainBuiltOnAc: num(resp.floodplain_built_on_ac),
    streetInWetlandFt: num(resp.street_in_wetland_ft),
    heldAcres,
    heldPct,
    openPieces,
    lotKinds: lotKindCounts,
    housesPlaced: num(resp.houses_placed) ?? (Array.isArray(resp.houses) ? resp.houses.filter(Boolean).length : null),
    tests,
    fails,
    notes,
    earthwork,
    hasFlood,
    fillView,
    streetGrade: sg ? { maxPct: num(sg.max_pct), limitPct: num(sg.limit_pct), ftOverLimit: num(sg.ft_over_limit) } : null,
    privateDrive,
    hillsideAcres,
    buildableAfterHoldsAc: num(resp.buildable_after_holds_ac),
    ms: num(resp.ms),
    generatorVersion: str(resp.generator_version) ?? 'sf_v1',
    basisLine: '',
  };
  summary.basisLine = sfV1SummaryLine(summary);
  return { elements, summary };
}

/** One line for the basis row and the lot-fit strip. */
export function sfV1SummaryLine(s: SfV1Summary): string {
  if (s.status === 'skipped') return `By-right subdivision skipped — ${s.reason ?? 'no reason given'}`;
  const basis = s.basis === 'override' ? 'as an OVERRIDE' : 'by right';
  if (s.lots === 0) return `0 lots ${basis}${s.reason ? ` — ${s.reason}` : ''} · generator: ${s.generatorVersion ?? 'sf_v1'}`;
  const module = s.lotWFt != null && s.lotDFt != null ? ` @ ${s.lotWFt} × ${s.lotDFt} ft` : '';
  const dens = s.densityDuAc != null ? ` · ${s.densityDuAc} du/ac gross` : '';
  const land = s.rowPct != null && s.lotPct != null ? ` · ${s.rowPct}% ${isDrivePattern(s.pattern) ? 'easement' : 'ROW'} / ${s.lotPct}% lots${s.openPct != null ? ` / ${s.openPct}% open` : ''}` : '';
  const flood = s.floodHold ? ` · flood hold: ${s.floodHold}` : '';
  const passed = s.tests.filter(t => t.pass === true).length;
  const grade = s.fails.length > 0 ? ` · fails ${s.fails.join(', ')}` : passed > 0 ? ` · ${passed} tests pass` : '';
  return `${s.lots} lot${s.lots === 1 ? '' : 's'}${module} ${basis}${patternPhrase(s.pattern)}${dens}${land}${flood}${grade} · generator: ${s.generatorVersion ?? 'sf_v1'}`;
}

/** "The lots share a private drive (857 ft long, a 16-ft lane in a 24-ft access easement) off the existing street: …" */
export function privateDriveSentence(pd: NonNullable<SfV1Summary['privateDrive']>): string {
  const len = pd.lengthFt != null ? `${pd.lengthFt.toLocaleString()} ft long` : null;
  const band = pd.laneFt != null && pd.easementFt != null
    ? `a ${pd.laneFt}-ft lane in a ${pd.easementFt}-ft access easement`
    : pd.laneFt != null ? `a ${pd.laneFt}-ft lane` : pd.easementFt != null ? `a ${pd.easementFt}-ft access easement` : null;
  const inner = [len, band].filter(Boolean).join(', ');
  return `The lots share a private drive${inner ? ` (${inner})` : ''} off the existing street: no new public street to build or dedicate.`
    + (pd.maxLots != null ? ` A shared drive may serve at most ${pd.maxLots} lots here.` : '');
}

/** The drawn pattern as a phrase after "N lots by right": "on a loop", "on two loops", "as frontage lots (no new street)". */
export function patternPhrase(pattern: string | null | undefined): string {
  const p = (pattern ?? '').trim();
  if (!p) return '';
  if (/^frontage lots/i.test(p)) return ' as frontage lots (no new street)';
  if (isDrivePattern(p)) return ' on a shared private drive (no new public street)';
  // engine g15: the estate grammar's second form — a rear tier of flag lots on poles to the frontage
  if (/^estate lots/i.test(p)) return ' as estate lots (flag lots behind the frontage, no new street)';
  if (/^2 loops$/i.test(p)) return ' on two loops';
  if (/^grid$/i.test(p)) return ' on a street grid';
  if (/^neighbou?rhood$/i.test(p)) return ' as a neighborhood plan';
  if (/^(loop|single street|t street)$/i.test(p)) return ` on a ${p}`;
  return ` · ${p}`;
}

/** Fail-soft RPC: null when the service is unreachable; a server verdict
 *  (`status: 'skipped'`, `error`) comes back as the payload so the caller can name it. */
export async function fetchSfV1Plan(ogcFid: number, opt: SfV1Options = {}): Promise<SfV1Response | null> {
  try {
    if (!supabase) return null;
    const clean = cleanOpt(opt);
    const { data, error } = await supabase.rpc('fn_sf_v1_plan_app', { p_ogc_fid: ogcFid, p_opt: clean });
    if (error) {
      console.warn('[sfV1Plan] RPC failed:', error.message ?? error);
      return null;
    }
    return (data as SfV1Response) ?? null;
  } catch (err) {
    console.warn('[sfV1Plan] RPC threw:', err);
    return null;
  }
}

/** The site the generator works on: the no-build land (wetlands, hatched on
 *  the sheet), the land the flood hold takes out, and the acres of each —
 *  `fn_sf_v1_site_app(ogc_fid, flood)`. Null when unavailable. */
export interface SfV1Site {
  nobuildWkt: string | null;
  holdWkt: string | null;
  heldAcres: number | null;
  siteAcres: number | null;
  floodHold: string | null;
  /** engine g13: on a skipped parcel the site still returns its hold, and why it skipped */
  reason?: string | null;
}
export async function fetchSfV1Site(ogcFid: number, flood: string | null | undefined): Promise<SfV1Site | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_sf_v1_site_app', { p_ogc_fid: ogcFid, p_flood: flood ?? null });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    return {
      nobuildWkt: str(d.nobuild_wkt),
      holdWkt: str(d.hold_wkt),
      heldAcres: num(d.held_acres),
      siteAcres: num(d.site_acres),
      floodHold: str(d.flood_hold),
      reason: str(d.reason),
    };
  } catch {
    return null;
  }
}

/** The site's no-build land alone (kept for callers that only hatch wetlands). */
export async function fetchSfV1Nobuild(ogcFid: number, flood: string | null | undefined): Promise<string | null> {
  return (await fetchSfV1Site(ogcFid, flood))?.nobuildWkt ?? null;
}

/** Fill per pad to the pad target, from the parcel's DEM (`fn_sf_v1_pad_fill`); null when unavailable. */
export async function fetchPadFill(ogcFid: number, padsWkt: string, padTargetFt: number): Promise<Array<number | null> | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_sf_v1_pad_fill', { p_ogc_fid: ogcFid, p_pads_wkt: padsWkt, p_pad_target_ft: padTargetFt });
    if (error || !Array.isArray(data)) return null;
    return (data as unknown[]).map(v => num(v));
  } catch {
    return null;
  }
}

/** The ground-at-BFE contour for the earthwork view: EPSG:2274 lines from the
 *  parcel's DEM (`fn_sf_v1_bfe_contour`), or null. */
export async function fetchBfeContour(ogcFid: number, bfeFt: number): Promise<LineString[] | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_sf_v1_bfe_contour', { p_ogc_fid: ogcFid, p_bfe_ft: bfeFt });
    if (error || !data) return null;
    const wkt = typeof data === 'string' ? data : (data as { wkt?: unknown }).wkt;
    if (typeof wkt !== 'string') return null;
    const lines = wktLines(wkt);
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The pattern competition (2026-11-03 evening): fn_sf_v1_candidates draws the
// grid, the neighborhood and the loop grammar and reports them side by side.
// `best` is the plan with the fewest failed tests, then the most lots;
// `structured` is the neighborhood plan (the owner's planning principles);
// `lots_forgone_for_structure` is the price of the structure. Both plans are
// shown and the owner decides. Every row is labelled by the pattern it DREW —
// a grammar that fell back says so rather than being named for what was asked.
// ---------------------------------------------------------------------------

export interface SfV1CandidateScore {
  total?: number | null;
  [criterion: string]: unknown;
}

export interface SfV1Candidate {
  /** the grammar asked for: grid | neighborhood | loop */
  requested?: string | null;
  /** what the plan actually drew */
  pattern?: string | null;
  status?: string | null;
  error?: string | null;
  lots?: number | null;
  score?: SfV1CandidateScore | null;
  street_ft?: number | null;
  lots_per_100ft?: number | null;
  open_pct?: number | null;
  connections?: number | null;
  fails?: string[] | null;
  notes?: string[] | null;
}

export interface SfV1CandidatesResponse {
  status?: string | null;
  reason?: string | null;
  error?: string | null;
  ogc_fid?: number | null;
  site_acres?: number | null;
  zoning?: string | null;
  /** lots a 62% net-to-gross estimate would give */
  arithmetic?: number | null;
  best_by_score?: string | null;
  scores?: Record<string, number | null> | null;
  best_requested?: string | null;
  best_pattern?: string | null;
  best_lots?: number | null;
  structured_lots?: number | null;
  lots_forgone_for_structure?: number | null;
  candidates?: SfV1Candidate[] | null;
  best?: SfV1Response | null;
  structured?: SfV1Response | null;
  ms?: number | null;
  /** 2026-11-04 third audit: read these before calling any plan "best" */
  best_buildable?: boolean | null;
  /** verbatim: "buildable as drawn" | "the best plan fails a code test: not buildable as drawn" | … */
  verdict?: string | null;
  /** the best plan's CODE fails only (quality flags excluded) */
  best_code_fails?: string[] | null;
  /** attached homes (townhomes) where the district permits them, capped by density */
  homes_allowed_by_density?: number | null;
  attached_permitted?: boolean | null;
  /** engine g13: why no pattern drew a lot, " | "-separated ("no lot of 40000 sf … fits … | 25.0 ac steeper than 25% held out as hillside …") */
  why?: string | null;
  [k: string]: unknown;
}

/** Quality flags: shown, not ranked on, not "fails" in the code sense (the engine's own split). */
export const SFV1_QUALITY_FLAGS = new Set(['open.unassigned', 'cost.street_ft_per_lot', 'yield.vs_arithmetic',
  // engine g14: a private drive's total length against the 750-ft figure, a flag until Metro's reading is confirmed
  'access.private_drive_length']);
export const codeFails = (fails: string[]): string[] => fails.filter(f => !SFV1_QUALITY_FLAGS.has(f));
export const qualityFlags = (fails: string[]): string[] => fails.filter(f => SFV1_QUALITY_FLAGS.has(f));

export interface SfV1CompetitionRow {
  requested: string;
  pattern: string | null;
  /** the drawn pattern — never the grammar that was asked for */
  label: string;
  /** a grid / neighborhood request that drew a different pattern */
  fellBack: boolean;
  status: string;
  error: string | null;
  /** a grammar that ran and found no lot ("no lot of 40000 sf … fits …"): a reason, not an error */
  nothingDrawn: string | null;
  lots: number;
  streetFt: number | null;
  lotsPer100Ft: number | null;
  openPct: number | null;
  connections: number | null;
  fails: string[];
  notes: string[];
  score: number | null;
  criteria: Array<{ name: string; score: number | null }>;
  isBest: boolean;
  isStructured: boolean;
  isTopScore: boolean;
  /** 'attached' for the townhome candidate (drawn by its own engine) */
  product: string | null;
  /** the townhome candidate's engine: 'v3' (drawn here, fn_generate_th_site_plan_v3_app) or 'v2' */
  engine: string | null;
  /** the townhome engine's call: the candidate's plan carries metrics only */
  fullPlanCall: string | null;
}

export interface SfV1Competition {
  status: string;
  reason: string | null;
  rows: SfV1CompetitionRow[];
  bestRequested: string | null;
  bestLots: number | null;
  structuredLots: number | null;
  forgone: number | null;
  bestByScore: string | null;
  arithmetic: number | null;
  ms: number | null;
  /** every grammar drew nothing */
  allZero: boolean;
  /** one sentence on the price of the structure */
  sentence: string;
  /** the engine's verdict on its best plan, verbatim, and whether it is buildable (code fails only) */
  verdict: string | null;
  bestBuildable: boolean | null;
  bestCodeFails: string[];
  homesAllowedByDensity: number | null;
  attachedPermitted: boolean | null;
  /** engine g13: why no pattern drew a lot, one reason per line */
  why: string[];
}

const lotsWord = (n: number) => `${n} lot${n === 1 ? '' : 's'}`;

/** "the grid, the neighborhood, the loop grammar and the shared private drive" */
function grammarList(requested: string[]): string {
  const names = requested.map(r =>
    r === 'grid' ? 'the grid' : r === 'neighborhood' ? 'the neighborhood' : r === 'loop' ? 'the loop grammar' : `the ${grammarName(r)}`);
  if (names.length <= 1) return names[0] ?? 'every grammar';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
const homesWord = (n: number) => `${n} home${n === 1 ? '' : 's'}`;
const testsWord = (n: number) => `${n} test${n === 1 ? '' : 's'}`;

/** The candidates response → the rows and the sentence the panel shows. */
export function summarizeCandidates(resp: SfV1CandidatesResponse | null | undefined): SfV1Competition | null {
  if (!resp || typeof resp !== 'object') return null;
  const status = str(resp.status) ?? (resp.error ? 'error' : 'done');
  const bestRequested = str(resp.best_requested);
  const bestByScore = str(resp.best_by_score);
  const rows: SfV1CompetitionRow[] = (Array.isArray(resp.candidates) ? resp.candidates : []).map(c => {
    const requested = str(c?.requested) ?? 'loop';
    const pattern = str(c?.pattern);
    const lots = num(c?.lots) ?? 0;
    const cstatus = str(c?.status) ?? 'done';
    const fellBack = pattern != null && (
      ((requested === 'grid' || requested === 'neighborhood') && pattern !== requested)
      || (requested === 'drive' && !isDrivePattern(pattern)));
    // a grammar that ran and found no lot is not an error (the drive row on
    // 0 Dry Fork Rd: "failed — no lot of 40000 sf … fits")
    const err = str(c?.error);
    const nothingDrawn = lots === 0 && err != null && /^no lots?\b/i.test(err) ? err : null;
    const label = pattern ?? (cstatus === 'done' || nothingDrawn ? `${grammarName(requested)}: nothing drawn` : `${grammarName(requested)}: ${cstatus}`);
    const score = c?.score && typeof c.score === 'object' ? c.score : null;
    const criteria = score
      ? Object.entries(score)
          .filter(([k, v]) => k !== 'total' && v && typeof v === 'object')
          .map(([k, v]) => ({ name: k.replace(/_/g, ' '), score: num((v as Record<string, unknown>).score) }))
      : [];
    return {
      requested, pattern, label, fellBack, status: cstatus, error: nothingDrawn ? null : err, nothingDrawn, lots,
      streetFt: num(c?.street_ft), lotsPer100Ft: num(c?.lots_per_100ft), openPct: num(c?.open_pct), connections: num(c?.connections),
      fails: strings(c?.fails), notes: strings(c?.notes),
      score: num(score?.total) ?? num(resp.scores?.[requested]),
      criteria,
      isBest: bestRequested != null && requested === bestRequested,
      isStructured: requested === 'neighborhood',
      isTopScore: bestByScore != null && requested === bestByScore,
      product: str((c as Record<string, unknown>)?.product),
      engine: str((c as Record<string, unknown>)?.engine),
      fullPlanCall: null,
    };
  });
  // the townhome candidate's plan holds metrics only; its drawing is a call to its own engine
  const bestPlan = resp.best && typeof resp.best === 'object' ? (resp.best as Record<string, unknown>) : null;
  for (const r of rows) if (r.isBest && bestPlan && typeof bestPlan.full_plan_call === 'string') r.fullPlanCall = bestPlan.full_plan_call;
  const done = rows.filter(r => r.status === 'done');
  const allZero = rows.length > 0 && done.every(r => r.lots === 0);
  const best = rows.find(r => r.isBest) ?? null;
  const structured = rows.find(r => r.isStructured) ?? null;
  const forgone = num(resp.lots_forgone_for_structure);
  let sentence: string;
  if (status !== 'done') sentence = `No competition: ${str(resp.reason) ?? str(resp.error) ?? status}.`;
  else if (rows.length === 0) sentence = 'The engine returned no candidates.';
  else if (allZero) sentence = `No pattern fits a lot here: ${grammarList(rows.filter(r => r.product !== 'attached').map(r => r.requested))} all draw 0.`;
  else if (!structured || structured.status !== 'done') sentence = `No structured plan: ${structured?.error ?? 'the neighborhood grammar did not run'}.`;
  else if (best && best === structured) sentence = `The structured plan is also the best plan: ${lotsWord(structured.lots)}, ${testsWord(codeFails(structured.fails).length)} of the code failed.`;
  // the townhome candidate counts homes, not lots (multifamily land, 2026-11-04)
  else if (best && best.product === 'attached' && structured.lots === 0) sentence = `The ${best.label} place ${homesWord(best.lots)}; the neighborhood grammar draws no lots, so there is no structured plan to weigh against them.`;
  else if (best && best.product === 'attached' && forgone != null && forgone > 0) sentence = `The structured plan (house lots) places ${forgone} fewer home${forgone === 1 ? '' : 's'} than the ${best.label}: ${best.lots} → ${structured.lots}. The owner decides.`;
  else if (best && structured.lots === 0 && best.lots > 0) sentence = `Only the ${best.label} draws lots here (${best.lots}); the neighborhood grammar draws none, so there is no structured plan to weigh against it.`;
  else if (best && forgone != null && forgone > 0) sentence = `The structured plan gives up ${lotsWord(forgone)} (${best.lots} → ${structured.lots}): the price of the structure. The owner decides.`;
  else if (best && forgone != null && forgone < 0) sentence = `The structured plan draws ${best.product === 'attached' ? homesWord(-forgone) : lotsWord(-forgone)} more (${structured.lots} against ${best.lots}) but fails ${testsWord(codeFails(structured.fails).length)} of the code to the best plan's ${codeFails(best.fails).length}: the engine ranks the fewest code fails first, then lots.`;
  else if (best) sentence = `The structured plan costs no lots (${best.lots} each).`;
  else sentence = 'No best plan among the candidates.';
  // 0 Sullivan Hollow Rd (36% mean slope): every pattern's streets exceed the
  // grade limit, and the ranking is between plans the ground does not allow.
  const drawnRows = done.filter(r => r.lots > 0);
  if (drawnRows.length > 1 && drawnRows.every(r => r.fails.includes('street.grade_max'))) {
    sentence = `Every pattern's streets fail the grade limit here, so none is buildable as drawn; the engine does not lay streets out by grade yet. ${sentence}`;
  } else if (drawnRows.length === 1 && drawnRows[0]!.fails.includes('street.grade_max')) {
    // 0 Neelys Bend Rd: one pattern draws lots at all, and its streets fail the grade
    sentence = `The only pattern that draws lots here fails the street grade, so it is not buildable as drawn; the engine does not lay streets out by grade yet. ${sentence}`;
  }
  const bestRow = rows.find(r => r.isBest) ?? null;
  return {
    status, reason: str(resp.reason) ?? str(resp.error), rows,
    bestRequested, bestLots: num(resp.best_lots), structuredLots: num(resp.structured_lots), forgone,
    bestByScore, arithmetic: num(resp.arithmetic), ms: num(resp.ms), allZero, sentence,
    verdict: str(resp.verdict),
    bestBuildable: typeof resp.best_buildable === 'boolean' ? resp.best_buildable : null,
    bestCodeFails: Array.isArray(resp.best_code_fails) ? strings(resp.best_code_fails) : bestRow ? codeFails(bestRow.fails) : [],
    homesAllowedByDensity: num(resp.homes_allowed_by_density),
    attachedPermitted: typeof resp.attached_permitted === 'boolean' ? resp.attached_permitted : null,
    why: whyLines(resp.why),
  };
}

/** The engine's `why` (" | "-separated) as lines, without the grammar's own settings ("grid: 2 local streets 920 ft apart …"). */
export function whyLines(why: unknown): string[] {
  const s = str(why);
  if (!s) return [];
  const setting = /^(grid|neighbou?rhood|loop|drive):\s/i;
  return s.split(' | ')
    // the grammar's settings also ride on the end of a reason ("…against the limit); grid: 2 local streets 920 ft apart")
    .map(x => x.replace(/;\s*(grid|neighbou?rhood|loop|drive):\s.*$/i, '').trim())
    .filter(x => x.length > 0 && !setting.test(x));
}

/** Why the competition's best plan is on the sheet in place of the default (loop) answer. */
export interface SfV1AutoBest {
  /** the grammar on the sheet */
  requested: string;
  /** default_empty: the default drew no lots · same_lots: the same lots, a better plan · more_lots: more lots, and buildable */
  why: 'default_empty' | 'same_lots' | 'more_lots';
  defaultLots: number;
  bestLots: number;
  defaultStreetFt: number | null;
  bestStreetFt: number | null;
  /** every failed test, code and quality alike (the engine's tie-break counts flags) */
  defaultFails: number;
  bestFails: number;
}

/**
 * Does the competition's best plan take the sheet from the default (loop)
 * answer? The engine's rule (g13, 2026-11-06): sheet the best when it is
 * buildable and draws at least the default's lots, or when it draws the same
 * lots (the engine ranks equal lots by fewer flags, then less street: 0 Union
 * Hill Rd, 3 lots on 384 ft of street against the loop's 699 ft); keep the
 * default whenever it draws strictly more. Never a one-lot "best" (the lot of
 * record, not a subdivision) and never a plan the client cannot draw (the
 * townhome engine's candidate carries metrics only).
 */
export function chooseAutoBest(
  resp: SfV1CandidatesResponse | null | undefined,
  def: SfV1Response | null | undefined,
): SfV1AutoBest | null {
  if (!resp || !resp.best || typeof resp.best_requested !== 'string' || resp.best_requested === 'loop') return null;
  const best = resp.best as Record<string, unknown>;
  if (typeof best.full_plan_call === 'string' || best.product === 'attached') return null;
  if (!def || (def.status != null && def.status !== 'done') || def.error) return null;
  const bestLots = num(best.lots) ?? 0;
  const defaultLots = num(def.lots) ?? 0;
  if (bestLots < 2 || defaultLots > bestLots) return null;
  const buildable = typeof resp.best_buildable === 'boolean'
    ? resp.best_buildable
    : codeFails(strings(best.fails)).length === 0;
  const same = bestLots === defaultLots;
  if (!buildable && !same) return null;
  const failsOf = (p: Record<string, unknown>) => {
    const f = strings(p.fails);
    if (f.length > 0) return f.length;
    return normalizeTests(p.tests).filter(t => t.pass === false).length;
  };
  const metricsOf = (p: Record<string, unknown>) => (p.metrics && typeof p.metrics === 'object' ? (p.metrics as Record<string, unknown>) : {});
  const defaultStreetFt = num(metricsOf(def as Record<string, unknown>).street_ft);
  const bestStreetFt = num(metricsOf(best).street_ft);
  const defaultFails = failsOf(def as Record<string, unknown>);
  const bestFails = failsOf(best);
  // Engine g15 (0 Hillwood Blvd): a grid or neighborhood request can fall back
  // to the very plan the default drew (the estate grammar's three flag lots).
  // The same lots take the sheet only when the plan is better — less street or
  // fewer failed tests — never an identical plan under another grammar's name.
  if (same && defaultLots > 0) {
    const lessStreet = bestStreetFt != null && defaultStreetFt != null && bestStreetFt < defaultStreetFt;
    if (!lessStreet && !(bestFails < defaultFails)) return null;
  }
  return {
    requested: resp.best_requested,
    why: defaultLots === 0 ? 'default_empty' : same ? 'same_lots' : 'more_lots',
    defaultLots,
    bestLots,
    defaultStreetFt,
    bestStreetFt,
    defaultFails,
    bestFails,
  };
}

/** The panel's sentence for a best plan on the sheet in place of the default. */
export function autoBestSentence(a: SfV1AutoBest): string {
  const name = a.requested === 'drive' ? 'shared private drive' : `${a.requested} grammar`;
  if (a.why === 'default_empty') {
    return `The default (loop) grammar draws no lots here, so the sheet shows the competition's best plan, the ${name}. It is still by right.`;
  }
  if (a.why === 'same_lots') {
    const parts: string[] = [];
    if (a.bestStreetFt != null && a.defaultStreetFt != null && a.bestStreetFt < a.defaultStreetFt) {
      parts.push(`on ${Math.round(a.bestStreetFt).toLocaleString()} ft of new ${a.requested === 'drive' ? 'private drive' : 'street'} against ${Math.round(a.defaultStreetFt).toLocaleString()} ft`);
    }
    if (a.bestFails < a.defaultFails) parts.push(`failing ${a.bestFails === 0 ? 'no test' : testsWord(a.bestFails)} to its ${a.defaultFails}`);
    const how = parts.length > 0 ? ` ${parts.join(', ')}` : '';
    return `The ${name} draws the same ${lotsWord(a.bestLots)} as the default (loop) grammar${how}, so the sheet shows it. It is still by right.`;
  }
  return `The ${name} draws ${lotsWord(a.bestLots)} to the default (loop) grammar's ${a.defaultLots} and fails no code test, so the sheet shows it. It is still by right.`;
}

/** A server error in the words a user can act on (the anon role's 20-s timeout above all). */
export function competitionErrorText(err: string): string {
  if (/statement timeout|canceling statement/i.test(err)) {
    return 'the three plans did not finish inside the 20 s the server allows the app — the plan above stands; try again once the parcel is warm';
  }
  return err;
}

export type SfV1CandidatesResult = { data: SfV1CandidatesResponse | null; error: string | null };

// One competition per parcel and option set per session: three plan runs
// cost 3–20 s, so a revisit (or the same answer asked twice) never recomputes.
// A failure is not kept — the next ask tries again.
const candidatesCache = new Map<string, Promise<SfV1CandidatesResult>>();

export function fetchSfV1Candidates(ogcFid: number, opt: SfV1Options = {}): Promise<SfV1CandidatesResult> {
  const clean = cleanOpt(withoutPattern(opt));
  const key = `${ogcFid}:${JSON.stringify(clean)}`;
  const hit = candidatesCache.get(key);
  if (hit) return hit;
  const p: Promise<SfV1CandidatesResult> = (async () => {
    try {
      if (!supabase) return { data: null, error: 'the plan service is not configured' };
      const { data, error } = await supabase.rpc('fn_sf_v1_candidates_app', { p_ogc_fid: ogcFid, p_opt: clean });
      if (error) return { data: null, error: String((error as { message?: string }).message ?? error) };
      if (!data || typeof data !== 'object') return { data: null, error: 'the engine returned nothing' };
      return { data: data as SfV1CandidatesResponse, error: null };
    } catch (err) {
      return { data: null, error: String(err) };
    }
  })();
  candidatesCache.set(key, p);
  void p.then(r => { if (r.error || !r.data) candidatesCache.delete(key); });
  return p;
}

/** Tests and a new parcel session start clean. */
export function clearSfV1CandidatesCache(): void {
  candidatesCache.clear();
}

// ---------------------------------------------------------------------------
// Parcels with holes (2026-11-04, 0 Longwood Pl): a cooperative's land wraps
// 31 house lots of other owners — one polygon, five holes, 4.41 ac owned
// inside an 8.30-ac outer ring. The generator plans on the outer ring, so all
// nine of its lots and 23,568 SF of its street lie on those houses' lots
// while every test passes. The client knows the holes; it says so.
// ---------------------------------------------------------------------------

export interface HoleOverlap {
  holes: number;
  holesAcres: number;
  lotsOnHoles: number;
  lots: number;
  overlapSf: number;
}

const ringAreaM2 = (ring: number[][]): number => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
  return Math.abs(a) / 2;
};
const cos2 = (ring: number[][]): number => {
  const n = Math.max(1, ring.length - 1);
  let y = 0;
  for (let i = 0; i < n; i++) y += ring[i]![1]!;
  const lat = Math.atan(Math.exp(y / n / 6378137)) * 2 - Math.PI / 2;
  return Math.cos(lat) ** 2;
};
const M2_PER_SF = 0.09290304;

/** The holes of a parcel in the canvas frame (EPSG:3857), each as a polygon. */
export function parcelHoles3857(parcel3857: { type: string; coordinates: unknown } | null | undefined): Polygon[] {
  if (!parcel3857) return [];
  const polys = parcel3857.type === 'Polygon'
    ? [parcel3857.coordinates as number[][][]]
    : parcel3857.type === 'MultiPolygon' ? (parcel3857.coordinates as number[][][][]) : [];
  return polys.flatMap(p => p.slice(1).filter(r => Array.isArray(r) && r.length >= 4).map(r => ({ type: 'Polygon', coordinates: [r] }) as Polygon));
}

/** How much of the drawn lots lies in the parcel's holes (land that is not this parcel). Null when the parcel has none. */
export function lotsOnParcelHoles(
  lots: Polygon[],
  holes: Polygon[],
  intersect: (a: Polygon, b: Polygon) => Polygon[],
): HoleOverlap | null {
  if (holes.length === 0) return null;
  let lotsOnHoles = 0;
  let overlapM2 = 0;
  for (const lot of lots) {
    let mine = 0;
    for (const h of holes) {
      for (const piece of intersect(lot, h)) {
        const ring = piece.coordinates?.[0] as number[][] | undefined;
        if (ring && ring.length >= 4) mine += ringAreaM2(ring) * cos2(ring);
      }
    }
    if (mine > 10) lotsOnHoles += 1; // more than ~100 SF: not a sliver of a shared line
    overlapM2 += mine;
  }
  const holesM2 = holes.reduce((a, h) => a + ringAreaM2(h.coordinates[0] as number[][]) * cos2(h.coordinates[0] as number[][]), 0);
  return {
    holes: holes.length,
    holesAcres: Math.round((holesM2 / M2_PER_SF / 43560) * 100) / 100,
    lotsOnHoles,
    lots: lots.length,
    overlapSf: Math.round(overlapM2 / M2_PER_SF),
  };
}

/**
 * The engine's landlocked skip reason names the parcel's edges by class with
 * their lengths ("neighbours by edge length: open_edge 2069 ft, residential
 * 945 ft"), then calls the longest of them "the longest touch on a street"
 * (0 Ivey Point Rd, 2026-11-09). The typed classification is the part the
 * sheet can stand on: an open edge is not a street.
 */
export interface SfV1EdgeClass {
  kind: string;
  /** what the class means on the ground */
  label: string;
  ft: number;
}

const EDGE_LABELS: Record<string, string> = {
  open_edge: 'open edge (no street, no parcel)',
  street: 'mapped street contact',
  residential: 'residential neighbour',
  vacant: 'vacant neighbour',
  commercial: 'commercial neighbour',
  other: 'other neighbour',
};

export function parseEdgeClasses(reason: string | null | undefined): SfV1EdgeClass[] {
  if (!reason) return [];
  const m = /neighbours? by edge length:\s*([^)]*)\)?/i.exec(reason);
  if (!m) return [];
  const out: SfV1EdgeClass[] = [];
  for (const part of m[1].split(',')) {
    const mm = /([a-z_]+)\s+([\d.]+)\s*ft/i.exec(part.trim());
    if (!mm) continue;
    const kind = mm[1].toLowerCase();
    out.push({ kind, label: EDGE_LABELS[kind] ?? `${kind.replace(/_/g, ' ')} neighbour`, ft: Math.round(Number(mm[2])) });
  }
  return out;
}

/** "2,069 ft open edge (no street, no parcel) · 945 ft residential neighbour · no mapped street contact" */
export function edgeClassSentence(edges: SfV1EdgeClass[]): string | null {
  if (edges.length === 0) return null;
  const parts = edges.map(e => `${e.ft.toLocaleString()} ft ${e.label}`);
  if (!edges.some(e => e.kind === 'street')) parts.push('no mapped street contact');
  return parts.join(' · ');
}

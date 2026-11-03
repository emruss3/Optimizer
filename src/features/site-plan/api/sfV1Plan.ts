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
 * (SECURITY DEFINER wrappers, migration 20261103100000): the generator's own
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
  deep_fill_hold_wkt?: string | null;
  low_point_wkt?: string | null;
  origin_wkt?: string | null;
  generator_version?: string | null;
  [k: string]: unknown;
}

/** The `p_opt` of fn_sf_v1_plan. Anything set here makes the answer an override. */
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
  return !!opt && Object.values(opt).some(v => v !== undefined && v !== null);
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
  tests: SfV1Test[];
  fails: string[];
  notes: string[];
  earthwork: SfV1Earthwork | null;
  /** the plan builds in the SFHA: fill, cut and the pad target apply */
  hasFlood: boolean;
  /** fill-depth colouring applied to the pads (per-pad fill from the DEM) */
  fillView: boolean;
  streetGrade: { maxPct: number | null; limitPct: number | null; ftOverLimit: number | null } | null;
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
  opts: { nobuildWkt?: string | null; overrideRequested?: boolean; padFillFt?: Array<number | null> | null } = {}
): { elements: Element[]; summary: SfV1Summary } {
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];
  const m = resp.metrics ?? {};
  const tests = normalizeTests(resp.tests);
  const fails = strings(resp.fails).length > 0 ? strings(resp.fails) : tests.filter(t => t.pass === false).map(t => t.id);
  const notes = strings(resp.notes);
  const earthwork = resp.earthwork && typeof resp.earthwork === 'object' ? resp.earthwork : null;
  const hasFlood = earthworkHasFlood(earthwork);
  const perPadFill = opts.padFillFt ?? padFillByLot(earthwork);
  const basis: SfV1Basis = opts.overrideRequested || resp.basis === 'override' ? 'override' : 'by_right';

  // Right-of-way: the band, drawn like a lot line so the pavement reads on top of it.
  polys3857(resp.row_wkt).forEach((poly, i) => {
    elements.push({
      id: `${SFV1_ID_PREFIX}row-${i + 1}`,
      type: 'other',
      name: 'Right-of-way',
      geometry: poly,
      properties: props({ kind: 'row', styleOverride: true, color: '#E2E8F0', opacity: 0.6, strokeColor: '#CBD5E1' }),
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
      name: pattern === 'frontage lots, no new street' ? 'Existing street frontage' : 'Street',
      geometry: piece as unknown as Polygon,
      properties: props({
        kind: 'through',
        pattern: pattern ?? undefined,
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
  const lotPolys = polys3857(resp.lots_wkt);
  lotPolys.forEach((poly, i) => {
    const kind = lotKinds[i] ?? null;
    if (kind) lotKindCounts[kind] = (lotKindCounts[kind] ?? 0) + 1;
    elements.push({
      id: `${SFV1_ID_PREFIX}lot-${i + 1}`,
      type: 'other',
      name: `Lot ${i + 1}`,
      geometry: poly,
      properties: props({
        lotKind: kind ?? undefined,
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
    elements.push({
      id: `${SFV1_ID_PREFIX}pad-${i + 1}`,
      type: 'building',
      name: `House ${i + 1}`,
      geometry: poly,
      properties: props({
        floors: 1,
        stories: 1,
        use: 'residential',
        house: true,
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
  const heldPct = siteAcres != null && siteAcres > 0 ? Math.round((((heldAcres ?? 0) + naturalAcres) / (siteAcres + (heldAcres ?? 0))) * 1000) / 10 : null;
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
    tests,
    fails,
    notes,
    earthwork,
    hasFlood,
    fillView,
    streetGrade: sg ? { maxPct: num(sg.max_pct), limitPct: num(sg.limit_pct), ftOverLimit: num(sg.ft_over_limit) } : null,
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
  const land = s.rowPct != null && s.lotPct != null ? ` · ${s.rowPct}% ROW / ${s.lotPct}% lots${s.openPct != null ? ` / ${s.openPct}% open` : ''}` : '';
  const flood = s.floodHold ? ` · flood hold: ${s.floodHold}` : '';
  const grade = s.fails.length > 0 ? ` · fails ${s.fails.join(', ')}` : s.tests.length > 0 ? ` · ${s.tests.length} tests pass` : '';
  return `${s.lots} lot${s.lots === 1 ? '' : 's'}${module} ${basis}${s.pattern ? ` on a ${s.pattern}` : ''}${dens}${land}${flood}${grade} · generator: ${s.generatorVersion ?? 'sf_v1'}`;
}

/** Fail-soft RPC: null when the service is unreachable; a server verdict
 *  (`status: 'skipped'`, `error`) comes back as the payload so the caller can name it. */
export async function fetchSfV1Plan(ogcFid: number, opt: SfV1Options = {}): Promise<SfV1Response | null> {
  try {
    if (!supabase) return null;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(opt)) if (v !== undefined && v !== null) clean[k] = v;
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

/** The site's no-build land (wetlands, hatched on the sheet): `fn_sf_v1_site_app(ogc_fid, flood)->>'nobuild_wkt'`. */
export async function fetchSfV1Nobuild(ogcFid: number, flood: string | null | undefined): Promise<string | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_sf_v1_site_app', { p_ogc_fid: ogcFid, p_flood: flood ?? null });
    if (error || !data || typeof data !== 'object') return null;
    const wkt = (data as { nobuild_wkt?: unknown }).nobuild_wkt;
    return typeof wkt === 'string' ? wkt : null;
  } catch {
    return null;
  }
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

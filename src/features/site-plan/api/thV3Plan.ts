/**
 * The townhome engine on the sheet (th_v3, 2026-11-04): the neighborhood
 * layout on multifamily land.
 *
 * fn_sf_v1_candidates ranks a townhome candidate beside the grid, the
 * neighborhood and the loop grammar wherever the district permits attached
 * homes, and that candidate carries metrics only: its drawing is the call
 * named in `plan.full_plan_call`, fn_generate_th_site_plan_v3(ogc_fid, 'aor').
 * The app reaches it through fn_generate_th_site_plan_v3_app (SECURITY
 * DEFINER, as of right only, migration 20261104224850).
 *
 * The engine answers with the homes (20 × 40-ft footprints, one polygon per
 * home, attached in rows), the streets and alleys, the right-of-way, the
 * greens (courtyards and a neighborhood green), the amenity pad, the
 * stormwater area at the low point, the guest-parking pockets and the land it
 * holds out, all in EPSG:4326 GeoJSON, with its own tests: `required` tests
 * (their failures are the engine's `fails`, code fails in the competition's
 * sense), `scored` ones and `context` ones (shown, never failed).
 *
 * Its search is resumable: an answer without homes and with "call again to
 * continue the search" is a search still running, and the client calls again.
 */
import type { Polygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { clipPolysToObstacles, unionPolys } from '../../../engine/validatePlan';
import { feature4326To3857 } from '../../../utils/reproject';
import { supabase } from '../../../lib/supabase';

export const THV3_ID_PREFIX = 'thv3-';

export function isThV3Element(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith(THV3_ID_PREFIX);
}

/** One self-grading test of the townhome engine. `kind`: 'required' (a code
 *  test: a failure is a fail), 'scored' (ranked on), 'context' (shown only). */
export interface ThV3Test {
  id: string;
  ok: boolean | null;
  op?: string | null;
  kind?: string | null;
  value?: unknown;
  threshold?: unknown;
}

export interface ThV3Response {
  generator_version?: string;
  parcel_ogc_fid?: number;
  /** present only when the search has not finished, or the parcel was skipped */
  status?: string;
  note?: string;
  reason?: string;
  error?: string;
  mode?: string;
  run_id?: number;
  typology?: string;
  pattern?: string | null;
  site_acres?: number | null;
  held_acres?: number | null;
  zoning?: string | null;
  rules?: Record<string, unknown> | null;
  buildings?: Array<{ geom?: unknown; kind?: string | null; w_ft?: number | null; d_ft?: number | null }> | null;
  streets?: Array<{ geom?: unknown; kind?: string | null }> | null;
  right_of_way?: unknown;
  street_centerlines?: unknown;
  alleys?: Array<{ geom?: unknown; kind?: string | null }> | null;
  greens?: Array<{ geom?: unknown; kind?: string | null; sf?: number | null }> | null;
  amenity?: { geom?: unknown; sf?: number | null } | null;
  stormwater?: { geom?: unknown; sf?: number | null; needed_sf?: number | null; low_z_ft?: number | null } | null;
  parking?: { guest_pockets?: unknown[] | null; guest_stalls?: number | null; guest_target?: number | null } | null;
  held_out?: unknown;
  metrics?: Record<string, unknown> | null;
  tests?: ThV3Test[] | null;
  fails?: string[] | null;
  flags?: unknown;
  notes?: unknown;
  [k: string]: unknown;
}

export interface ThV3Summary {
  /** 'searching' = the engine's search has not finished inside its budget */
  status: 'done' | 'searching' | 'skipped' | 'error';
  reason: string | null;
  homes: number;
  pattern: string | null;
  zoning: string | null;
  siteAcres: number | null;
  heldAcres: number | null;
  homesPerAcre: number | null;
  streetFt: number | null;
  alleys: number | null;
  greens: number;
  usableOpenPct: number | null;
  guestStalls: number | null;
  guestTarget: number | null;
  stormwaterSf: number | null;
  stormwaterNeededSf: number | null;
  unitWFt: number | null;
  unitDFt: number | null;
  /** the land the engine holds out (wetland, stream buffer, flood hold) as drawn, in acres */
  heldOutAcres: number | null;
  /** the district's density cap (rules.max_homes_by_density) */
  densityCap: number | null;
  /** homes drawn over the density cap: the competition caps the candidate's count, not the engine's drawing */
  overDensityBy: number | null;
  tests: ThV3Test[];
  /** required tests that fail: code fails */
  requiredFails: string[];
  /** context tests that do not pass: shown, not failed */
  contextFlags: string[];
  notes: string[];
  generatorVersion: string;
  basisLine: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === 'string') : []);

/** A GeoJSON geometry (object or JSON text, EPSG:4326) → its polygons in the canvas frame. */
export function canvasPolygons(geom: unknown): Polygon[] {
  let g: unknown = geom;
  try {
    if (typeof g === 'string') g = JSON.parse(g);
  } catch {
    return [];
  }
  if (!g || typeof g !== 'object') return [];
  const gg = g as { type?: string; coordinates?: unknown; geometries?: unknown[] };
  const polys: Polygon[] = [];
  if (gg.type === 'Polygon' && Array.isArray(gg.coordinates)) polys.push(g as Polygon);
  else if (gg.type === 'MultiPolygon' && Array.isArray(gg.coordinates)) {
    for (const c of gg.coordinates as unknown[]) if (Array.isArray(c)) polys.push({ type: 'Polygon', coordinates: c as Polygon['coordinates'] });
  } else if (gg.type === 'GeometryCollection' && Array.isArray(gg.geometries)) {
    return gg.geometries.flatMap(canvasPolygons);
  }
  const out: Polygon[] = [];
  for (const p of polys) {
    try {
      const q = feature4326To3857(p) as Polygon;
      if (Array.isArray(q?.coordinates?.[0]) && q.coordinates[0].length >= 4) out.push(q);
    } catch {
      /* one bad piece never sinks the plan */
    }
  }
  return out;
}

function props(o: Record<string, unknown>): Element['properties'] {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Element['properties'];
}

type Poly = { type: 'Polygon'; coordinates: number[][][] };

// Area of a canvas-frame (EPSG:3857) polygon in acres, corrected for the
// Mercator scale at its latitude.
function acres3857(p: Polygon): number {
  const rings = p.coordinates as number[][][];
  const ringArea = (r: number[][]) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i]![0]! * r[i + 1]![1]! - r[i + 1]![0]! * r[i]![1]!;
    return Math.abs(a) / 2;
  };
  const outer = rings[0] ?? [];
  if (outer.length < 4) return 0;
  const yMean = outer.reduce((s, c) => s + c[1]!, 0) / outer.length;
  const lat = Math.atan(Math.exp(yMean / 6378137)) * 2 - Math.PI / 2;
  const m2 = (ringArea(outer) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0)) * Math.cos(lat) ** 2;
  return m2 / 4046.8564224;
}
const asPoly = (p: Polygon): Poly => ({ type: 'Polygon', coordinates: p.coordinates as number[][][] });

/** The engine's status: a finished plan carries homes; "call again" is a search still running. */
export function thV3Status(resp: ThV3Response | null | undefined): ThV3Summary['status'] {
  if (!resp || typeof resp !== 'object') return 'error';
  if (resp.error) return 'error';
  const st = str(resp.status);
  if (st === 'skipped') return 'skipped';
  if (st && st !== 'done') return /call again/i.test(str(resp.note) ?? '') || st === 'searching' || st === 'running' ? 'searching' : 'error';
  return 'done';
}

/**
 * Map the engine's answer to canvas elements:
 *   the land it holds out          → 'greenspace' (hatched, under everything)
 *   right-of-way                   → 'other'       (the band the street sits in)
 *   streets, alleys                → 'circulation' (alleys clipped to the street they meet)
 *   greens, the amenity pad, storm → 'greenspace'
 *   guest-parking pockets          → 'parking'     (clipped to the pavement)
 *   homes                          → 'building'    (one 20 × 40-ft footprint each, attached in rows)
 * A home carries no unit mix: the engine plans footprints, not floor area,
 * so the tabulation stays off the sheet (as it does for house lots). The
 * massing view assumes three stories, and the basis line says so.
 */
export function thV3ToElements(resp: ThV3Response): { elements: Element[]; summary: ThV3Summary } {
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];
  const status = thV3Status(resp);
  const m = resp.metrics && typeof resp.metrics === 'object' ? resp.metrics : {};
  const rules = resp.rules && typeof resp.rules === 'object' ? resp.rules : {};

  let heldOutAcres: number | null = null;
  if (status === 'done') {
    const held = canvasPolygons(resp.held_out);
    heldOutAcres = held.length > 0 ? Math.round(held.reduce((s, p) => s + acres3857(p), 0) * 100) / 100 : 0;
    held.forEach((poly, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}held-${i + 1}`, type: 'greenspace', name: 'Held out (flood / wetland)', geometry: poly,
        properties: props({ kind: 'greenway', hazardKind: 'floodplain', label: 'Held out', styleOverride: true, color: '#DBEAFE', opacity: 0.45, strokeColor: '#3B82F6' }),
        metadata: meta,
      });
    });
    canvasPolygons(resp.right_of_way).forEach((poly, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}row-${i + 1}`, type: 'other', name: 'Right-of-way', geometry: poly,
        properties: props({ kind: 'row', styleOverride: true, color: '#E2E8F0', opacity: 0.6, strokeColor: '#CBD5E1' }),
        metadata: meta,
      });
    });

    // Streets: one network (pieces that meet are merged, never two overlapping slabs).
    const streetPieces = unionPolys(
      (resp.streets ?? []).flatMap(s => canvasPolygons(s?.geom)).map(asPoly)
    ) as Poly[];
    const privateDrive = (resp.streets ?? []).length > 0 && (resp.streets ?? []).every(s => s?.kind === 'private_drive');
    streetPieces.forEach((piece, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}street-${i + 1}`, type: 'circulation', name: privateDrive ? 'Private drive' : 'Street',
        geometry: piece as unknown as Polygon,
        properties: props({ kind: privateDrive ? 'private_drive' : 'through', styleOverride: true, color: '#A9B4C0', opacity: 0.92, strokeColor: '#7B8794' }),
        metadata: meta,
      });
    });
    // Alleys meet the street at their mouths: clipped to it so the gate sees two surfaces, not an overlap.
    const alleyPieces = clipPolysToObstacles(
      unionPolys((resp.alleys ?? []).flatMap(a => canvasPolygons(a?.geom)).map(asPoly)) as Poly[],
      streetPieces,
      1,
    ) as Poly[];
    alleyPieces.forEach((piece, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}alley-${i + 1}`, type: 'circulation', name: 'Alley', geometry: piece as unknown as Polygon,
        properties: props({ kind: 'alley', styleOverride: true, color: '#C3CBD5', opacity: 0.9, strokeColor: '#94A3B8' }),
        metadata: meta,
      });
    });

    let greens = 0;
    for (const g of resp.greens ?? []) {
      const kind = str(g?.kind) ?? 'green';
      for (const poly of canvasPolygons(g?.geom)) {
        greens += 1;
        const neighbourhood = /neighbo(u)?rhood/.test(kind);
        elements.push({
          id: `${THV3_ID_PREFIX}green-${greens}`, type: 'greenspace', name: neighbourhood ? 'Neighborhood green' : 'Courtyard', geometry: poly,
          properties: props({
            kind: 'amenity', openKind: kind, areaSqFt: num(g?.sf) ?? undefined,
            styleOverride: true, color: neighbourhood ? '#86EFAC' : '#BBF7D0', opacity: 0.6, strokeColor: '#16A34A',
          }),
          metadata: meta,
        });
      }
    }
    canvasPolygons(resp.amenity?.geom).forEach((poly, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}amenity-${i + 1}`, type: 'greenspace', name: 'Amenity pad', geometry: poly,
        properties: props({ kind: 'amenity', areaSqFt: num(resp.amenity?.sf) ?? undefined, styleOverride: true, color: '#FDE68A', opacity: 0.7, strokeColor: '#D97706' }),
        metadata: meta,
      });
    });
    canvasPolygons(resp.stormwater?.geom).forEach((poly, i) => {
      elements.push({
        id: `${THV3_ID_PREFIX}pond-${i + 1}`, type: 'greenspace', name: 'Stormwater', geometry: poly,
        properties: props({ kind: 'pond', areaSqFt: num(resp.stormwater?.sf) ?? undefined, styleOverride: true, color: '#BFDBFE', opacity: 0.9, strokeColor: '#2563EB' }),
        metadata: meta,
      });
    });

    const homePolys = (resp.buildings ?? []).map(b => canvasPolygons(b?.geom)[0] ?? null);
    // Guest pockets: clipped to the pavement and the homes they sit beside.
    const pockets = clipPolysToObstacles(
      (resp.parking?.guest_pockets ?? []).flatMap(p => canvasPolygons(p)).map(asPoly),
      [...streetPieces, ...alleyPieces, ...homePolys.filter((p): p is Polygon => p != null).map(asPoly)],
      1,
    ) as Poly[];
    const guestStalls = num(resp.parking?.guest_stalls);
    pockets.forEach((piece, i) => {
      // the stalls are counted for the plan, not per pocket: spread them in order
      const share = guestStalls != null && pockets.length > 0
        ? Math.floor(guestStalls / pockets.length) + (i < guestStalls % pockets.length ? 1 : 0)
        : null;
      elements.push({
        id: `${THV3_ID_PREFIX}guest-${i + 1}`, type: 'parking', name: share != null ? `Guest parking · ${share} stall${share === 1 ? '' : 's'}` : 'Guest parking',
        geometry: piece as unknown as Polygon,
        properties: props({ stalls: share ?? undefined, parkingSpaces: share ?? undefined, guest: true, color: '#CBD5E1' }),
        metadata: meta,
      });
    });

    (resp.buildings ?? []).forEach((b, i) => {
      const poly = homePolys[i];
      if (!poly) return;
      const w = num(b?.w_ft) ?? num(m.unit_w_ft);
      const d = num(b?.d_ft) ?? num(m.unit_d_ft);
      elements.push({
        id: `${THV3_ID_PREFIX}home-${i + 1}`, type: 'building', name: `Townhome ${i + 1}`, geometry: poly,
        properties: props({
          use: 'residential', townhome: true, townhomeEngine: 'th_v3',
          fronts: str(b?.kind) ?? undefined,
          widthFt: w ?? undefined, depthFt: d ?? undefined,
          footprintSqFt: w != null && d != null ? w * d : undefined,
          // the canvas draws a townhome as a party-wall dwelling (no apartment
          // floorplate); no floor area rides along, so it writes none on the sheet
          th: { units: 1, unitWFt: w, unitDFt: d },
          // the engine plans footprints; the massing view assumes three stories
          floors: 3, stories: 3, storiesAssumed: true,
          color: '#3B82F6',
        }),
        metadata: meta,
      });
    });
  }

  const tests = (Array.isArray(resp.tests) ? resp.tests : []).filter((t): t is ThV3Test => !!t && typeof t.id === 'string');
  const requiredFails = strings(resp.fails).length > 0
    ? strings(resp.fails)
    : tests.filter(t => t.kind === 'required' && t.ok === false).map(t => t.id);
  const contextFlags = tests.filter(t => t.kind === 'context' && t.ok === false).map(t => t.id);
  const homes = status === 'done' ? num(m.homes) ?? elements.filter(e => e.type === 'building').length : 0;
  const densityCap = num(rules.max_homes_by_density);
  const summary: ThV3Summary = {
    status,
    reason: str(resp.reason) ?? str(resp.error) ?? (status === 'searching' ? 'the townhome search has not finished inside its budget' : null),
    homes,
    pattern: str(resp.pattern),
    zoning: str(resp.zoning),
    siteAcres: num(resp.site_acres) ?? num(m.site_acres),
    heldAcres: num(resp.held_acres),
    homesPerAcre: num(m.homes_per_acre),
    streetFt: num(m.street_ft),
    alleys: num(m.alleys),
    greens: elements.filter(e => e.id.startsWith(`${THV3_ID_PREFIX}green-`)).length,
    usableOpenPct: num(m.usable_open_pct),
    guestStalls: num(resp.parking?.guest_stalls),
    guestTarget: num(resp.parking?.guest_target),
    stormwaterSf: num(resp.stormwater?.sf),
    stormwaterNeededSf: num(resp.stormwater?.needed_sf),
    unitWFt: num(m.unit_w_ft),
    unitDFt: num(m.unit_d_ft),
    heldOutAcres,
    densityCap,
    overDensityBy: densityCap != null && homes > densityCap ? homes - densityCap : null,
    tests,
    requiredFails,
    contextFlags,
    notes: strings(resp.notes),
    generatorVersion: str(resp.generator_version) ?? 'th_v3',
    basisLine: '',
  };
  summary.basisLine = thV3SummaryLine(summary);
  return { elements, summary };
}

/** One line for the basis row. */
export function thV3SummaryLine(s: ThV3Summary): string {
  if (s.status === 'searching') return 'Townhome engine (th_v3): the search has not finished — try again';
  if (s.status !== 'done') return `Townhome engine (th_v3): ${s.status}${s.reason ? ` — ${s.reason}` : ''}`;
  const parts = [
    `${s.homes} townhome${s.homes === 1 ? '' : 's'}${s.pattern ? ` (${s.pattern})` : ''} by right`,
    s.unitWFt != null && s.unitDFt != null ? `${s.unitWFt} × ${s.unitDFt} ft homes, three stories assumed for the massing` : null,
    s.homesPerAcre != null ? `${s.homesPerAcre} homes / ac` : null,
    s.requiredFails.length > 0 ? `fails ${s.requiredFails.join(', ')}` : 'every required test passes',
    `generator: ${s.generatorVersion}`,
  ];
  return parts.filter(Boolean).join(' · ');
}

export type ThV3Result = { data: ThV3Response | null; error: string | null };

// One drawing per parcel per session: the competition has usually just run
// the search, so this is ~1 s; a failure or an unfinished search is not kept.
const thCache = new Map<number, Promise<ThV3Result>>();

/** The townhome plan for a parcel. A search still running is asked again (up to three calls). */
export function fetchThV3Plan(ogcFid: number, budgetMs = 12000): Promise<ThV3Result> {
  const hit = thCache.get(ogcFid);
  if (hit) return hit;
  const p: Promise<ThV3Result> = (async () => {
    try {
      if (!supabase) return { data: null, error: 'the plan service is not configured' };
      let last: ThV3Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.rpc('fn_generate_th_site_plan_v3_app', { p_ogc_fid: ogcFid, p_budget_ms: budgetMs });
        if (error) return { data: null, error: String((error as { message?: string }).message ?? error) };
        if (!data || typeof data !== 'object') return { data: null, error: 'the townhome engine returned nothing' };
        last = data as ThV3Response;
        if (thV3Status(last) !== 'searching') break;
      }
      return { data: last, error: null };
    } catch (err) {
      return { data: null, error: String(err) };
    }
  })();
  thCache.set(ogcFid, p);
  void p.then(r => { if (r.error || !r.data || thV3Status(r.data) !== 'done') thCache.delete(ogcFid); });
  return p;
}

/** Tests and a new session start clean. */
export function clearThV3Cache(): void {
  thCache.clear();
}

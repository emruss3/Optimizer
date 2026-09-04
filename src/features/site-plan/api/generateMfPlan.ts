/**
 * Multifamily site-plan generator client (Beat-TestFit M1+M2).
 *
 * fn_generate_mf_site_plan builds the whole site system server-side — entry
 * drive from the primary frontage, bar rows, parking streets, green courts,
 * amenity pad — grounded in typology_spec and the design context, with all
 * areas measured in EPSG:2274 true feet. The client renders it; it does not
 * re-measure or re-plan. Geometry converts 4326 → 3857 with the SAME function
 * the parcel outline uses, so alignment is guaranteed by construction.
 */
import type { Element, SiteMetrics } from '../../../engine/types';
import type { LineString, Point, Polygon, Position } from 'geojson';
import { generateUnitMixForCount, UNIT_TYPE_DEFS, PARKING_RATIO_DEFAULTS, type UnitMixEntry } from '../../../engine/model';
import { lineToRect } from '../../../engine/seedToElements';
import { clipPolysToObstacles, unionPolys } from '../../../engine/validatePlan';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { feature4326To3857 } from '../../../utils/reproject';
import { supabase } from '../../../lib/supabase';
import { toCanvasPolygon } from './generateSfPlan';

/** Matches the server's average-unit assumption (units = GFA / 950). */
const AVG_UNIT_SF = 950;

interface MfGeom {
  geom: unknown;
}
interface MfBuilding extends MfGeom {
  i: number;
  footprint_sqft?: number;
  floors?: number;
  /** Townhome rows: unit count the server placed (th_context_v1) */
  units?: number;
  /** User-pinned bar (edit-as-regeneration): kept verbatim by the generator */
  pinned?: boolean;
  pin_index?: number;
}

/** A pinned bar constraint: 4326 polygon + floors, echoed by the generator. */
export interface MfPin {
  geom: unknown;
  floors?: number;
}
interface MfParking extends MfGeom {
  stalls?: number;
}
interface MfAmenity extends MfGeom {
  name?: string;
  area_sqft?: number;
}
interface MfGreen extends MfGeom {
  area_sqft?: number;
}

export interface MfPlanResponse {
  parcel_ogc_fid?: number;
  typology?: string;
  seed?: number;
  pins?: MfPin[];
  parent_candidate_id?: string | null;
  plan_basis?: string;
  session_id?: string;
  candidate_id?: string;
  persisted?: boolean;
  /** Context-contract fields (generator_version mf_context_v2*) */
  context_id?: string;
  context_version?: string;
  context_hash?: string;
  generator_version?: string;
  score_version?: string;
  program_prior_version?: string;
  score_total?: number;
  score_components?: Record<string, number>;
  /** How the Regrid precedent set was selected (planner_context_v2) */
  regrid_precedent_selection?: Record<string, unknown>;
  buildings?: MfBuilding[];
  parking?: MfParking[];
  drives?: MfGeom[];
  greens?: MfGreen[];
  amenity?: MfAmenity[];
  metrics?: Record<string, number | string | null>;
  flags?: unknown;
  /** Degenerate-generation message (e.g. envelope too shallow) */
  generation?: string;
  error?: string;
}

/** Server-plan elements are identified by prefix so a regenerate REPLACES. */
export function isMfPlanElement(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith('mfgen-');
}

const mNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Map the generator response onto canvas elements + planner metrics.
 * Areas come from the response (EPSG:2274 backend truth), never re-measured.
 */
export function mfPlanToElements(resp: MfPlanResponse): {
  elements: Element[];
  metrics: SiteMetrics | null;
  basis: string | null;
  flags: string[];
} {
  const now = new Date().toISOString();
  const elements: Element[] = [];
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };

  const isTownhome = resp.typology === 'townhome';
  const mNum = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  for (const b of resp.buildings ?? []) {
    const poly = toCanvasPolygon(b.geom);
    if (!poly) continue;
    const floors = Math.max(1, Math.round(b.floors ?? 3));
    // Townhome rows carry their real unit count; apartment bars estimate
    // from GFA at the server's average-unit assumption.
    const unitsForBar = Math.max(
      1,
      Math.round(b.units ?? ((b.footprint_sqft ?? 0) * floors) / AVG_UNIT_SF)
    );
    // A townhome row is NOT an apartment floorplate: each unit is a
    // full-depth party-wall slice with its own entrance — no corridor, no
    // studio/1BR program. The row carries its true unit form (count + width
    // from the generator) and a single honest mix row; the canvas renders
    // party-wall slices from `th`, never computeFloorplate.
    const thRow = isTownhome && b.units
      ? {
          units: Math.max(1, Math.round(b.units)),
          unitWFt: mNum(resp.metrics?.unit_w_ft),
          unitDFt: mNum(resp.metrics?.unit_d_ft),
        }
      : null;
    elements.push({
      // Pinned bars keep a STABLE id across regenerations (index-based ids
      // renumber every solve, which would break live-drag element identity)
      id: b.pinned ? `mfgen-pin-${b.pin_index ?? 0}` : `mfgen-bldg-${b.i}`,
      type: 'building',
      name: thRow ? `Townhomes ${b.i} · ${b.units}u` : `Building ${b.i}`,
      geometry: poly,
      properties: {
        areaSqFt: b.footprint_sqft,
        floors,
        stories: floors,
        ...(thRow
          ? {
              th: thRow,
              unitMix: [{
                type: 'townhome' as const,
                count: thRow.units,
                avgSqft: thRow.units > 0 ? ((b.footprint_sqft ?? 0) * floors) / thRow.units : 0,
                rentPerMonth: 0,
                parkingRatio: 2.0, // garage + apron: each unit parks itself
              }],
            }
          : { unitMix: generateUnitMixForCount(unitsForBar) }),
        use: 'residential',
        color: b.pinned ? '#2563EB' : '#3B82F6',
        pinned: b.pinned ?? false,
        pinIndex: b.pin_index,
      },
      metadata: meta,
    });
  }

  (resp.amenity ?? []).forEach((a, idx) => {
    const poly = toCanvasPolygon(a.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-amenity-${idx + 1}`,
      type: 'building',
      name: a.name ?? 'Clubhouse',
      geometry: poly,
      properties: { areaSqFt: a.area_sqft, floors: 1, stories: 1, use: 'amenity', color: '#F59E0B' },
      metadata: meta,
    });
  });

  // Defensive family guard (Eric's 2026-08-04 console): a seed payload
  // reaching this LEGACY mapper crashed on `.forEach` — parking is an OBJECT
  // in the seed family. Family detection routes correctly upstream; if a
  // mixed/unknown shape ever lands here anyway, skip rather than throw.
  (Array.isArray(resp.parking) ? resp.parking : []).forEach((p, idx) => {
    const poly = toCanvasPolygon(p.geom);
    if (!poly) return;
    // Townhome "parking" is garage aprons — each dwelling parks itself off
    // the lane. Striping them like an apartment surface lot is exactly the
    // "small multifamily" misread; they render as plain driveway aprons.
    elements.push({
      id: `mfgen-park-${idx + 1}`,
      type: 'parking',
      name: isTownhome
        ? p.stalls ? `Aprons · ${p.stalls} stalls` : 'Garage aprons'
        : p.stalls ? `Parking · ${p.stalls} stalls` : 'Parking',
      geometry: poly,
      // parkingSpaces is the canvas's stall-count vocabulary (bay labels)
      properties: {
        stalls: p.stalls,
        parkingSpaces: p.stalls,
        color: isTownhome ? '#D8DEE6' : '#CBD5E1',
        ...(isTownhome ? { apron: true } : {}),
      },
      metadata: meta,
    });
  });

  (resp.drives ?? []).forEach((dr, idx) => {
    const poly = toCanvasPolygon(dr.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-drive-${idx + 1}`,
      type: 'circulation',
      name: idx === 0 ? 'Main Drive' : `Drive ${idx + 1}`,
      geometry: poly,
      properties: { color: '#94A3B8' },
      metadata: meta,
    });
  });

  (resp.greens ?? []).forEach((g, idx) => {
    const poly = toCanvasPolygon(g.geom);
    if (!poly) return;
    elements.push({
      id: `mfgen-green-${idx + 1}`,
      type: 'greenspace',
      name: 'Open space',
      geometry: poly,
      properties: { areaSqFt: g.area_sqft, color: '#86EFAC' },
      metadata: meta,
    });
  });

  const m = resp.metrics ?? {};
  const gfa = mNum(m.gfa_sqft);
  const metrics: SiteMetrics | null = gfa
    ? ({
        totalBuiltSF: gfa,
        siteCoveragePct: mNum(m.coverage_pct) ?? 0,
        achievedFAR: mNum(m.far) ?? 0,
        parkingRatio: mNum(m.parking_ratio_provided) ?? 0,
        openSpacePct: mNum(m.open_space_pct) ?? 0,
        totalUnits: mNum(m.units_est),
        stallsProvided: mNum(m.stalls),
        stallsRequired: mNum(m.stalls_required),
        // Server plans are constructed inside the setback envelope; parking
        // shortfall is surfaced via stalls (red) + plan-basis flag, not as a
        // zoning violation. Consumers (KpiStrip) need these present.
        violations: [],
        zoningCompliant: true,
        // The solver's own optimization verdict travels VERBATIM — the UI
        // must never re-infer what the server has already proven.
        optimizationStatus: typeof m.optimization_status === 'string' ? m.optimization_status : undefined,
        optimizationProof:
          m.optimization_proof && typeof m.optimization_proof === 'object'
            ? (m.optimization_proof as Record<string, unknown>)
            : undefined,
        parkingRegime: typeof m.regime === 'string' ? m.regime : undefined,
        regimeComparison:
          m.regime_comparison && typeof m.regime_comparison === 'object'
            ? (m.regime_comparison as Record<string, unknown>)
            : undefined,
      } as SiteMetrics)
    : null;

  return {
    elements,
    metrics,
    basis: resp.plan_basis ?? null,
    flags: Array.isArray(resp.flags)
      ? // Deduped: best-effort pinned solves append their marker once per
        // softened gate — counts ("+n") must reflect DISTINCT reasons.
        [...new Set((resp.flags as unknown[]).filter((f): f is string => typeof f === 'string'))]
      : [],
  };
}

// ── seed_v2 payload family (order-6) ─────────────────────────────────────────
// The DEFAULT fn_generate_mf_site_plan_v2 is the deterministic seed generator:
// buildings arrive as ONE connected S/C-form polygon per structure in native
// EPSG:2274 (`geom_2274`, `is_single_polygon`), drives as {entry_2274,
// spine_2274} skeletons, parking as ONE object with structured dual ratios,
// metrics as {gsf, units, stalls, stories, capture_pct, parking_limited, mix}.
// The search core (deep/persist path) at fn_generate_mf_site_plan_v2_search
// still returns the legacy family above — both must render.

interface SeedFamilyGeom {
  type: string;
  coordinates: unknown;
}
export interface SeedFamilyStructure {
  structure_id?: number | string | null;
  geom_2274?: SeedFamilyGeom | null;
  footprint_sqft?: number | null;
  gsf?: number | null;
  stories?: number | null;
  composition_note?: string | null;
  is_single_polygon?: boolean | null;
  /** L-form seeds carry per-leg metadata for continuous unit striping. */
  legs_meta?: unknown;
}
export interface SeedFamilyParking {
  bays?: Array<{ geom_2274?: SeedFamilyGeom | null; area_sqft?: number | null }> | null;
  stalls?: number | null;
  strategy?: string | null;
  stalls_required?: number | null;
  /** Adequacy — stalls as % of the PLACED program's need (the honest number). */
  pct_of_placed_need?: number | null;
  /** Ambition — stalls as % of the max-target program's need. */
  pct_of_max_need?: number | null;
  stalls_required_at_placed?: number | null;
  stalls_target_at_max?: number | null;
}
export interface SeedFamilyDrive {
  entry_2274?: SeedFamilyGeom | null;
  spine_2274?: SeedFamilyGeom | null;
  geom_2274?: SeedFamilyGeom | null;
  kind?: string | null;
}
export interface SeedFamilyResponse {
  parcel_ogc_fid?: number;
  typology?: string;
  seed?: number;
  context_id?: string;
  generator_version?: string;
  score_total?: number;
  persisted?: boolean;
  buildings?: SeedFamilyStructure[];
  drives?: SeedFamilyDrive[];
  parking?: SeedFamilyParking | null;
  metrics?: {
    gsf?: number | null;
    units?: number | null;
    stalls?: number | null;
    stories?: number | null;
    capture_pct?: number | null;
    parking_limited?: boolean | null;
    mix?: Array<{ pct?: number | null; type?: string | null; units?: number | null }> | null;
  } | null;
  buildability?: Record<string, unknown> | null;
  plan_basis?: string;
  flags?: unknown;
  error?: string;
  generation?: string;
}

/** Seed-family payloads carry native EPSG:2274 structures; legacy payloads
 *  carry 4326 `geom`. The FIRST building decides — families never mix. */
export function isSeedFamilyResponse(resp: MfPlanResponse | SeedFamilyResponse | null | undefined): resp is SeedFamilyResponse {
  const b0 = resp?.buildings?.[0] as { geom_2274?: unknown } | undefined;
  return !!b0?.geom_2274;
}

const seedTo3857 = <T extends SeedFamilyGeom>(g: T): T =>
  feature4326To3857(geom2274To4326(g as never) as never) as T;

/** Distribute the server's plan-level unit mix across structures by GSF share
 *  (largest remainder per type, so totals stay exact). */
function apportionMix(
  mix: NonNullable<NonNullable<SeedFamilyResponse['metrics']>['mix']>,
  shares: number[]
): UnitMixEntry[][] {
  const defs = new Map(UNIT_TYPE_DEFS.map(d => [d.type as string, d]));
  const perStructure: UnitMixEntry[][] = shares.map(() => []);
  for (const row of mix) {
    const def = row.type != null ? defs.get(row.type) : undefined;
    const total = Math.max(0, Math.round(row.units ?? 0));
    if (!def || total === 0) continue;
    const raw = shares.map(s => total * s);
    const counts = raw.map(Math.floor);
    let left = total - counts.reduce((a, b) => a + b, 0);
    const order = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (left <= 0) break;
      counts[i] += 1;
      left -= 1;
    }
    counts.forEach((count, i) => {
      if (count > 0) {
        perStructure[i].push({
          type: def.type,
          count,
          avgSqft: def.avgSqft,
          rentPerMonth: def.rentPerMonth,
          parkingRatio: PARKING_RATIO_DEFAULTS[def.type],
        });
      }
    });
  }
  return perStructure;
}

/**
 * Map a seed-family response (default MF seed generator, SF seed) onto canvas
 * elements + planner metrics. Geometry: EPSG:2274 feet → 4326 → 3857 (the
 * canvas frame); every displayed AREA is the engine's own number.
 */
export function seedFamilyPlanToElements(
  resp: SeedFamilyResponse,
  opts: { idPrefix?: string; house?: boolean } = {}
): { elements: Element[]; metrics: SiteMetrics | null; basis: string | null; flags: string[] } {
  const prefix = opts.idPrefix ?? 'mfgen';
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];
  const m = resp.metrics ?? {};
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const structures = (resp.buildings ?? []).filter(b => b?.geom_2274);
  const gsfShares = (() => {
    const gsfs = structures.map(s => num(s.gsf) ?? num(s.footprint_sqft) ?? 0);
    const total = gsfs.reduce((a, b) => a + b, 0);
    return total > 0 ? gsfs.map(g => g / total) : structures.map(() => 1 / Math.max(1, structures.length));
  })();
  const mixes = m.mix?.length ? apportionMix(m.mix, gsfShares) : null;

  structures.forEach((b, i) => {
    let poly: Polygon;
    try {
      poly = seedTo3857(b.geom_2274 as Polygon);
    } catch {
      return; // one malformed geometry must not sink the plan
    }
    const stories = Math.max(1, Math.round(num(b.stories) ?? num(m.stories) ?? 3));
    const footprint = num(b.footprint_sqft);
    const gsf = num(b.gsf) ?? (footprint != null ? footprint * stories : null);
    const unitsEst = Math.max(1, Math.round((gsf ?? 0) / AVG_UNIT_SF));
    // The building is named by what it is — stories and units — never by the
    // generator's composition token ("bars connected S form × 5 st" read as
    // noise on the sheet; Eric, 2026-09-03). The token still travels in
    // properties.compositionNote for the headline and the receipts.
    // One structure carries the engine's own unit count (the headline reads
    // the same number); several share the server's mix by GSF. The mix rows
    // can sum one short of the engine's count (server-side rounding) — the
    // sheet must not show 69 under a headline that says 70.
    const mixUnits = mixes ? mixes[i].reduce((s, e) => s + e.count, 0) : null;
    const unitsHere = structures.length === 1 ? (num(m.units) ?? mixUnits ?? unitsEst) : (mixUnits ?? unitsEst);
    elements.push({
      id: `${prefix}-bldg-${b.structure_id ?? i + 1}`,
      type: 'building',
      name: opts.house
        ? `House · ${footprint != null ? Math.round(footprint).toLocaleString() : '?'} sf`
        : `${structures.length === 1 ? 'Apartments' : `Bldg ${b.structure_id ?? i + 1}`} · ${stories} ${stories === 1 ? 'story' : 'stories'} · ${unitsHere} unit${unitsHere === 1 ? '' : 's'}`,
      geometry: poly,
      properties: {
        areaSqFt: footprint ?? undefined,
        floors: stories,
        stories,
        // When the server SENT a mix — even an all-zero one (the degenerate
        // 1-unit/no-parking seeds found in the 2026-07-28 sweep) — it travels
        // verbatim. The GFA-derived estimate exists only for payloads with NO
        // mix at all: fabricating 18 units beside metrics.units=1 was a lie.
        unitMix: opts.house
          ? [{ type: 'townhome' as const, count: 1, avgSqft: gsf ?? footprint ?? 0, rentPerMonth: 0, parkingRatio: 2.0 }]
          : (mixes ? mixes[i] : generateUnitMixForCount(unitsEst)),
        use: 'residential',
        color: '#3B82F6',
        ...(b.composition_note ? { compositionNote: b.composition_note } : {}),
        ...(b.legs_meta != null ? { legsMeta: b.legs_meta } : {}),
      },
      metadata: meta,
    } as Element);
  });

  const bays = resp.parking?.bays?.filter(b => b?.geom_2274) ?? [];
  const totalBayArea = bays.reduce((a, b) => a + (num(b.area_sqft) ?? 0), 0);
  const stallsTotal = num(resp.parking?.stalls) ?? num(m.stalls) ?? 0;
  bays.forEach((b, i) => {
    let poly: Polygon;
    try {
      poly = seedTo3857(b.geom_2274 as Polygon);
    } catch {
      return;
    }
    const share = totalBayArea > 0 ? (num(b.area_sqft) ?? 0) / totalBayArea : 1 / bays.length;
    const stalls = Math.max(0, Math.round(stallsTotal * share));
    elements.push({
      id: `${prefix}-park-${i + 1}`,
      type: 'parking',
      name: stalls ? `Parking · ~${stalls} stalls` : 'Parking',
      geometry: poly,
      properties: { stalls, parkingSpaces: stalls, color: '#CBD5E1' },
      metadata: meta,
    } as Element);
  });

  // Drives. The engine's skeleton is a CENTERLINE + entry point — width is
  // client-fabricated (24 ft buffer, apron marker). Fabricated geometry must
  // become valid BY CONSTRUCTION before the zero-overlap gate sees it: the
  // skeleton pieces union into one network (a junction is one drive, not two
  // overlapping rectangles) and clip against buildings/bays — the engine's
  // centerline legitimately passes under masses it placed after routing.
  // REAL corridor polygons the engine emits (drives[].geom_2274) stay
  // first-class: only defensively clipped, never invented.
  const obstacles = [
    ...structures.map(b => {
      try { return seedTo3857(b.geom_2274 as Polygon); } catch { return null; }
    }),
    ...bays.map(b => {
      try { return seedTo3857(b.geom_2274 as Polygon); } catch { return null; }
    }),
  ].filter((p): p is Polygon => p != null)
    .map(p => ({ type: 'Polygon' as const, coordinates: p.coordinates as number[][][] }));

  const skeletonPolys: Array<{ type: 'Polygon'; coordinates: number[][][] }> = [];
  (resp.drives ?? []).forEach((dr, i) => {
    if (dr?.spine_2274) {
      try {
        const rect = lineToRect(seedTo3857(dr.spine_2274 as unknown as LineString), 7.3); // 24 ft drive
        if (rect) skeletonPolys.push({ type: 'Polygon', coordinates: rect.coordinates as number[][][] });
      } catch { /* skip malformed spine */ }
    }
    if (dr?.entry_2274) {
      try {
        const [ex, ey] = seedTo3857(dr.entry_2274 as unknown as Point).coordinates as Position;
        const w = 3.7, d = 3.0; // 12×10 ft apron marker at the curb
        skeletonPolys.push({
          type: 'Polygon',
          coordinates: [[[ex - w, ey - d], [ex + w, ey - d], [ex + w, ey + d], [ex - w, ey + d], [ex - w, ey - d]]],
        });
      } catch { /* skip malformed entry */ }
    }
    if (dr?.geom_2274) {
      try {
        const poly = seedTo3857(dr.geom_2274 as Polygon);
        const clipped = clipPolysToObstacles(
          [{ type: 'Polygon' as const, coordinates: poly.coordinates as number[][][] }],
          obstacles,
          2
        );
        clipped.forEach((piece, pi) => {
          elements.push({
            id: `${prefix}-drive-${i + 1}${pi > 0 ? `-${pi + 1}` : ''}`,
            type: 'circulation',
            name: dr.kind === 'driveway' ? 'Driveway' : `Drive ${i + 1}`,
            geometry: piece as unknown as Polygon,
            properties: { color: '#94A3B8' },
            metadata: meta,
          } as Element);
        });
      } catch { /* skip malformed drive */ }
    }
  });
  clipPolysToObstacles(unionPolys(skeletonPolys), obstacles, 2).forEach((piece, i) => {
    elements.push({
      id: `${prefix}-drive-skel-${i + 1}`,
      type: 'circulation',
      name: i === 0 ? 'Access drive' : `Access drive ${i + 1}`,
      geometry: piece as unknown as Polygon,
      properties: { color: '#94A3B8' },
      metadata: meta,
    } as Element);
  });

  const gsf = num(m.gsf);
  const units = num(m.units);
  const stalls = num(m.stalls) ?? num(resp.parking?.stalls);
  const stallsRequired = num(resp.parking?.stalls_required_at_placed) ?? num(resp.parking?.stalls_required);
  const metrics: SiteMetrics | null = gsf
    ? ({
        totalBuiltSF: gsf,
        // The seed payload doesn't report FAR/coverage/open-space and the
        // client never re-measures — zeros here mean "not reported" and the
        // KPI strip hides zero-valued stats rather than display fabricated 0s.
        siteCoveragePct: 0,
        achievedFAR: 0,
        openSpacePct: 0,
        parkingRatio: units && stalls != null ? stalls / units : 0,
        totalUnits: units ?? undefined,
        stallsProvided: stalls ?? undefined,
        stallsRequired: stallsRequired ?? undefined,
        violations: [],
        warnings: [],
        zoningCompliant: true,
        parkingPctOfPlacedNeed: num(resp.parking?.pct_of_placed_need) ?? undefined,
        parkingPctOfMaxNeed: num(resp.parking?.pct_of_max_need) ?? undefined,
        parkingStallsTargetAtMax: num(resp.parking?.stalls_target_at_max) ?? undefined,
        parkingStrategy: resp.parking?.strategy ?? undefined,
        parkingLimited: m.parking_limited === true,
        capturePct: num(m.capture_pct) ?? undefined,
      } as SiteMetrics)
    : null;

  const flags = [
    ...new Set([
      ...(Array.isArray(resp.flags) ? (resp.flags as unknown[]).filter((f): f is string => typeof f === 'string') : []),
      ...(m.parking_limited === true ? ['parking_limited'] : []),
    ]),
  ];

  return { elements, metrics, basis: resp.plan_basis ?? null, flags };
}

export interface MfGenerateOptions {
  seed?: number;
  typology?: string;
  /** Edit-as-regeneration: bars the generator must keep verbatim */
  pins?: MfPin[];
  /** Candidate this variation descends from (lineage) */
  parentId?: string | null;
  /** false = view-only re-render (no new candidate row) */
  persist?: boolean;
}

/** Fail-soft RPC call: null (with a console warning) on any failure. */
export async function generateMfSitePlan(
  ogcFid: number,
  opts: MfGenerateOptions = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_mf_site_plan', {
      p_ogc_fid: ogcFid,
      p_typology: opts.typology ?? 'multifamily',
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
    });
    if (error) {
      console.warn('[generateMfPlan] RPC failed:', error.message ?? error);
      return null;
    }
    const resp = data as MfPlanResponse | null;
    if (!resp) return null;
    if (resp.error || resp.generation) {
      console.info('[generateMfPlan] generator declined:', resp.error ?? resp.generation);
      return resp; // caller can distinguish "declined" from "unreachable"
    }
    return resp;
  } catch (err) {
    console.warn('[generateMfPlan] RPC threw:', err);
    return null;
  }
}

/**
 * Context-contract errors: the v2 generator REJECTED the request because the
 * context snapshot is wrong (missing, stale, for another parcel/use) or
 * generation is legally blocked. These must surface to the user — silently
 * regenerating on the legacy six-argument path would produce a plan that
 * ignores the compiled context while the UI still claims one exists.
 * The legacy generator remains ONLY the compatibility path for when the v2
 * RPC itself is unreachable (transport failure / not yet deployed).
 */
export const CONTEXT_CONTRACT_ERRORS = new Set([
  'planner_context_required',
  'planner_context_not_found',
  'planner_context_parcel_mismatch',
  'planner_context_use_mismatch',
  'planner_generation_not_allowed',
  'planner_solver_brief_invalid',
  'context_id and expected parcel are required',
]);

export function isContextContractError(err: string | null | undefined): boolean {
  return err != null && (CONTEXT_CONTRACT_ERRORS.has(err) || err.startsWith('planner_'));
}

/**
 * Context-driven generation (mf_context_v2): all planning values come from
 * the verified solver brief behind p_context_id. Contract errors surface in
 * the response's `error` (planner_generation_not_allowed,
 * planner_context_parcel_mismatch, …); transport failures return null.
 */
export async function generateMfSitePlanV2(
  ogcFid: number,
  contextId: string,
  opts: MfGenerateOptions = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_mf_site_plan_v2', {
      p_ogc_fid: ogcFid,
      p_typology: opts.typology ?? 'multifamily',
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
      p_context_id: contextId,
    });
    if (error) {
      console.warn('[generateMfPlan] v2 RPC failed:', error.message ?? error);
      return null;
    }
    return (data as MfPlanResponse) ?? null;
  } catch (err) {
    console.warn('[generateMfPlan] v2 RPC threw:', err);
    return null;
  }
}

/**
 * Townhome product (th_context_v1): same context gate and response shape as
 * the MF generator, but a row/motor-court grammar with attached-dwelling
 * ordinance standards and townhome-typology Regrid unit form. Reuses the
 * MfPlanResponse pipeline (mapper, pins, rail, money) end to end.
 */
export async function generateThSitePlan(
  ogcFid: number,
  contextId: string,
  opts: Omit<MfGenerateOptions, 'typology'> = {}
): Promise<MfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_th_site_plan', {
      p_ogc_fid: ogcFid,
      p_seed: opts.seed ?? 1,
      p_pins: opts.pins && opts.pins.length > 0 ? opts.pins : null,
      p_parent: opts.parentId ?? null,
      p_persist: opts.persist ?? true,
      p_context_id: contextId,
    });
    if (error) {
      console.warn('[generateThPlan] RPC failed:', error.message ?? error);
      return null;
    }
    return (data as MfPlanResponse) ?? null;
  } catch (err) {
    console.warn('[generateThPlan] RPC threw:', err);
    return null;
  }
}

/** A3: the money block — local-sales revenue vs cost, with provenance. */
export interface MfMoney {
  available: boolean;
  gdv?: number;
  total_cost?: number;
  land?: number;
  hard_cost_psf?: number;
  cost_source?: string;
  price_psf_p50?: number;
  n_sales?: number;
  pricing_confidence?: string;
  margin_on_cost?: number;
  basis?: string;
  flags?: string[];
  reason?: string;
}

/** Value a scheme against LOCAL pricing. Fail-soft: null when unreachable. */
// Fail-QUIET, not just fail-soft: when the endpoint is broken (404/405/…),
// stop asking for the rest of the session instead of flooding the console —
// the rail enriches many candidates per refresh. Identical inputs share one
// in-flight/settled promise (same parcel+GFA ⇒ same margin).
let moneyConsecutiveFailures = 0;
let moneyUnavailable = false;
const moneyCache = new Map<string, Promise<MfMoney | null>>();

export function fetchMfMoney(
  ogcFid: number,
  gfaSqft: number,
  units?: number
): Promise<MfMoney | null> {
  if (!supabase || !gfaSqft || moneyUnavailable) return Promise.resolve(null);
  const key = `${ogcFid}|${Math.round(gfaSqft)}`;
  const hit = moneyCache.get(key);
  if (hit) return hit;

  const p = (async (): Promise<MfMoney | null> => {
    try {
      const { data, error } = await supabase!.rpc('fn_mf_money', {
        p_ogc_fid: ogcFid,
        p_gfa_sqft: gfaSqft,
        p_units: units ?? null,
      });
      if (error || !data) {
        moneyConsecutiveFailures += 1;
        if (moneyConsecutiveFailures >= 2 && !moneyUnavailable) {
          moneyUnavailable = true;
          console.info('[generateMfPlan] fn_mf_money unavailable — market margin hidden for this session:', error?.message ?? 'no data');
        }
        moneyCache.delete(key);
        return null;
      }
      moneyConsecutiveFailures = 0;
      return data as MfMoney;
    } catch {
      moneyCache.delete(key);
      return null;
    }
  })();
  moneyCache.set(key, p);
  return p;
}

/** Test hook. */
export function __resetMfMoneyAvailability(): void {
  moneyConsecutiveFailures = 0;
  moneyUnavailable = false;
  moneyCache.clear();
}

/** One persisted scheme (candidate) in a parcel's design history. */
export interface MfCandidate {
  id: string;
  createdAt: string;
  seed: number;
  pins: MfPin[];
  parentId: string | null;
  metrics: Record<string, number | string | null>;
  /** Context snapshot the candidate was generated from (v2 candidates only).
   *  A saved scheme stays explainable from the context that PRODUCED it — a
   *  view re-render must use this id, never today's context. */
  contextId: string | null;
  contextHash: string | null;
  /** Generator lineage for the rail's version tag (tolerant read) */
  generatorVersion?: string | null;
  /** Local-sales margin on cost (A3 ranking) — enriched client-side */
  marginOnCost?: number | null;
}

/** Enrich candidates with their local-sales margin so the rail can rank. */
export async function enrichCandidatesWithMoney(
  ogcFid: number,
  candidates: MfCandidate[]
): Promise<MfCandidate[]> {
  return Promise.all(
    candidates.map(async c => {
      const gfa = Number(c.metrics.gfa_sqft);
      const units = Number(c.metrics.units_est);
      if (!Number.isFinite(gfa) || gfa <= 0) return c;
      const m = await fetchMfMoney(ogcFid, gfa, Number.isFinite(units) ? units : undefined);
      return { ...c, marginOnCost: m?.available ? m.margin_on_cost ?? null : null };
    })
  );
}

/** A1 schemes rail: list a parcel's persisted candidates, newest first. */
export async function listMfCandidates(ogcFid: number, limit = 20): Promise<MfCandidate[]> {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc('fn_list_mf_candidates', {
      p_ogc_fid: ogcFid,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map(r => {
      const metrics = (r.metrics as Record<string, number | string | null>) ?? {};
      // Context lineage reads tolerantly: v2 candidates persist context_hash
      // (and, on newer list RPCs, context_id) in/next to their metrics;
      // v1 candidates have neither and stay null.
      const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
      return {
        id: String(r.id),
        createdAt: String(r.created_at ?? ''),
        seed: Number(r.seed) || 1,
        pins: Array.isArray(r.pins) ? (r.pins as MfPin[]) : [],
        parentId: (r.parent_candidate_id as string | null) ?? null,
        metrics,
        contextId: str(r.context_id) ?? str(metrics.context_id),
        contextHash: str(r.context_hash) ?? str(metrics.context_hash),
        generatorVersion: str(r.generator_version) ?? str(metrics.generator_version),
      };
    });
  } catch {
    return [];
  }
}

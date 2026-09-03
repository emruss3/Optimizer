/**
 * Subdivision generator client (2026-09-03).
 *
 * The server draws the NEIGHBOURHOOD — the organization the civil's concept
 * sheets show, generalized to any parcel: through-streets on the parcel's
 * long axis (as many as the width allows), cross connectors that cap block
 * length, rear alleys behind every row, whole lots on every street face,
 * courts breaking the rows, an optional amenity at the head of the site and
 * a cul-de-sac wherever a dead-end would exceed 750 ft.
 *
 * Geometry arrives in EPSG:2274 feet (engine truth) and is converted
 * 2274 → 4326 → 3857 with the same functions the parcel outline goes through,
 * so alignment with the parcel is by construction. Every area rendered is the
 * server's; nothing is re-measured or invented here.
 */
import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { feature4326To3857 } from '../../../utils/reproject';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { supabase } from '../../../lib/supabase';

export type Geom2274 = Polygon | MultiPolygon | { type: string; coordinates: unknown };

export interface SubdivisionStreet {
  name?: string;
  /** through (long-axis street) | cross (connector) | connector (entrance) | cul_de_sac */
  kind?: string;
  width_ft?: number;
  length_ft?: number;
  geom_2274?: Geom2274 | null;
  centerline_2274?: unknown;
}

export interface SubdivisionPolygon {
  geom_2274?: Geom2274 | null;
  area_sqft?: number | null;
  at?: string;
}

/** A held-out hazard piece: FEMA floodplain / floodway or an NWI wetland (25-ft buffer). */
export interface SubdivisionHazard extends SubdivisionPolygon {
  kind?: 'floodplain' | 'floodway' | 'wetland' | string;
  zone?: string | null;
  subtype?: string | null;
  buffer_ft?: number | null;
}

export interface SubdivisionLot {
  lot: number;
  street?: string;
  face?: number;
  geom_2274?: Geom2274 | null;
  area_sqft?: number;
  width_ft?: number;
  depth_ft?: number;
  buildable_depth_ft?: number;
  fronts?: string;
  garage?: string;
}

export interface SubdivisionMetrics {
  lots?: number;
  lot_width_ft?: number;
  lot_depth_ft?: number;
  lot_width_basis?: string;
  lot_depth_basis?: string;
  buildable_depth_ft?: number;
  front_loaded_lots?: number;
  streets?: number;
  blocks?: number;
  street_length_ft?: number;
  courts?: number;
  amenity_sqft?: number;
  pct_land_in_row?: number;
  pct_land_in_alleys?: number;
  pct_land_in_lots?: number;
  pct_land_residual?: number;
  gross_density_du_ac?: number;
  parcel_acres?: number;
  floodplain_100yr_pct?: number;
  /** v1.1: held-out hazards (FEMA SFHA + NWI wetlands) and whether the layers cover this area */
  hazard_sqft?: number;
  floodplain_sqft?: number;
  wetland_sqft?: number;
  pct_land_hazard?: number;
  hazard_layer_coverage?: 'ingested' | 'not_ingested' | string;
  parcel_sqft?: number;
  [k: string]: unknown;
}

export interface SubdivisionAccess {
  mode?: string;
  basis?: string;
  across_start_end?: string | null;
  across_end_end?: string | null;
  [k: string]: unknown;
}

export interface SubdivisionResponse {
  parcel_ogc_fid?: number;
  generator_version?: string;
  pattern?: string;
  /** spine | ladder | grid | single_loaded */
  network?: string;
  error?: string;
  frame?: Record<string, unknown>;
  access?: SubdivisionAccess;
  streets?: SubdivisionStreet[];
  alleys?: SubdivisionPolygon[];
  courts?: SubdivisionPolygon[];
  amenity?: SubdivisionPolygon | null;
  /** v1.1: floodplain / floodway / wetland pieces held out of the lot pattern (drawn as greenway) */
  hazards?: SubdivisionHazard[];
  reserves?: SubdivisionPolygon[];
  lots?: SubdivisionLot[];
  metrics?: SubdivisionMetrics;
  params?: Record<string, unknown>;
  plan_basis?: string;
  flags?: unknown;
}

export interface SubdivisionParams {
  /** Requested lot width (e.g. 25 for an SP townhome scheme); null = district minimum */
  lotWidthFt?: number | null;
  /** Percent of the parcel given to an amenity at the head of the site (the 08/30 trade) */
  amenityPct?: number | null;
  /** auto | start | end | both — where the network connects to the outside */
  access?: 'auto' | 'start' | 'end' | 'both' | null;
}

export interface SubdivisionSummary {
  lots: number;
  network: string;
  streets: number;
  courts: number;
  lotWidthFt: number | null;
  lotDepthFt: number | null;
  buildableDepthFt: number | null;
  pctRow: number | null;
  pctAlleys: number | null;
  pctLots: number | null;
  pctResidual: number | null;
  /** courts + amenity + reserves as % of the parcel (server areas) */
  pctOpen: number | null;
  densityDuAc: number | null;
  floodplainPct: number | null;
  /** v1.1: % of the parcel held out as greenway (floodplain + wetland), from real geometry */
  pctHazard: number | null;
  floodplainHeldOutPct: number | null;
  wetlandHeldOutPct: number | null;
  /** 'ingested' = FEMA/NWI tiles cover this area; 'not_ingested' = only the parcel-level FEMA fraction is known */
  hazardCoverage: string | null;
  accessMode: string | null;
  flags: string[];
  basis: string;
}

export const SUBDIVISION_ID_PREFIX = 'subdiv-';

/** Subdivision elements are one replace-on-regenerate class (same as SF lot fits). */
export function isSubdivisionElement(el: Pick<Element, 'id'>): boolean {
  return el.id.startsWith(SUBDIVISION_ID_PREFIX);
}

function isPoly(g: unknown): g is Polygon {
  return !!g && typeof g === 'object' && (g as { type?: string }).type === 'Polygon' && Array.isArray((g as Polygon).coordinates);
}

function isMultiPoly(g: unknown): g is MultiPolygon {
  return !!g && typeof g === 'object' && (g as { type?: string }).type === 'MultiPolygon' && Array.isArray((g as MultiPolygon).coordinates);
}

/** EPSG:2274 polygon(s) → canvas EPSG:3857. A MultiPolygon becomes several polygons. */
export function polygons2274To3857(geom: unknown): Polygon[] {
  try {
    const g = typeof geom === 'string' ? JSON.parse(geom) : geom;
    const parts: Polygon[] = [];
    if (isPoly(g)) parts.push(g);
    else if (isMultiPoly(g)) {
      for (const coords of g.coordinates) parts.push({ type: 'Polygon', coordinates: coords });
    } else return [];
    return parts
      .map(p => feature4326To3857(geom2274To4326(p as never) as never) as Polygon)
      .filter(p => Array.isArray(p?.coordinates?.[0]) && p.coordinates[0].length >= 4);
  } catch {
    return [];
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Element properties without undefined keys (exactOptionalPropertyTypes). */
function props(o: Record<string, unknown>): Element['properties'] {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Element['properties'];
}

function stringFlags(flags: unknown): string[] {
  return Array.isArray(flags) ? (flags as unknown[]).filter((f): f is string => typeof f === 'string') : [];
}

/**
 * Map the generator payload to canvas elements.
 *   streets + alleys → 'circulation' (ROW asphalt / lighter alley pavement)
 *   lots             → 'other' (parcel-line style, below everything)
 *   courts / amenity / reserves → 'greenspace'
 */
export function subdivisionToElements(resp: SubdivisionResponse): { elements: Element[]; summary: SubdivisionSummary } {
  const now = new Date().toISOString();
  const meta = { createdAt: now, updatedAt: now, source: 'ai-generated' as const };
  const elements: Element[] = [];

  (resp.streets ?? []).forEach((s, i) => {
    const kind = s.kind ?? 'through';
    polygons2274To3857(s.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}street-${i + 1}${j > 0 ? `-${j + 1}` : ''}`,
        type: 'circulation',
        name: s.name ?? (kind === 'cul_de_sac' ? 'Cul-de-sac' : 'Street'),
        geometry: poly,
        properties: props({
          kind, widthFt: s.width_ft, lengthFt: s.length_ft,
          styleOverride: true, color: '#A9B4C0', opacity: 0.92, strokeColor: '#7B8794',
        }),
        metadata: meta,
      });
    });
  });

  (resp.alleys ?? []).forEach((a, i) => {
    polygons2274To3857(a.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}alley-${i + 1}${j > 0 ? `-${j + 1}` : ''}`,
        type: 'circulation',
        name: 'Alley',
        geometry: poly,
        properties: props({
          areaSqFt: a.area_sqft ?? undefined, kind: 'alley',
          styleOverride: true, color: '#D5DCE4', opacity: 0.85, strokeColor: '#AEB8C4',
        }),
        metadata: meta,
      });
    });
  });

  for (const lot of resp.lots ?? []) {
    const [poly] = polygons2274To3857(lot.geom_2274);
    if (!poly) continue;
    elements.push({
      id: `${SUBDIVISION_ID_PREFIX}lot-${lot.lot}`,
      type: 'other',
      name: `Lot ${lot.lot}`,
      geometry: poly,
      properties: props({
        areaSqFt: lot.area_sqft,
        widthFt: lot.width_ft, depthFt: lot.depth_ft, buildableDepthFt: lot.buildable_depth_ft,
        fronts: lot.fronts, garage: lot.garage, color: '#E5E7EB',
      }),
      metadata: meta,
    });
  }

  (resp.courts ?? []).forEach((c, i) => {
    polygons2274To3857(c.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}court-${i + 1}${j > 0 ? `-${j + 1}` : ''}`,
        type: 'greenspace',
        name: 'Court',
        geometry: poly,
        properties: props({ areaSqFt: c.area_sqft ?? undefined, kind: 'court' }),
        metadata: meta,
      });
    });
  });

  if (resp.amenity?.geom_2274) {
    polygons2274To3857(resp.amenity.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}amenity${j > 0 ? `-${j + 1}` : ''}`,
        type: 'greenspace',
        name: 'Amenity',
        geometry: poly,
        properties: props({
          areaSqFt: resp.amenity?.area_sqft ?? undefined, kind: 'amenity',
          styleOverride: true, color: '#86EFAC', opacity: 0.6, strokeColor: '#22C55E',
        }),
        metadata: meta,
      });
    });
  }

  // Held-out hazards read as GREENWAY — the one thing a plan must never put a lot on.
  (resp.hazards ?? []).forEach((h, i) => {
    const kind = h.kind ?? 'floodplain';
    const label = kind === 'floodway' ? 'Floodway' : kind === 'wetland' ? 'Wetland' : 'Floodplain';
    polygons2274To3857(h.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}hazard-${i + 1}${j > 0 ? `-${j + 1}` : ''}`,
        type: 'greenspace',
        name: `${label}${h.zone ? ` (${h.zone})` : ''}`,
        geometry: poly,
        properties: props({
          areaSqFt: h.area_sqft ?? undefined, kind: 'greenway', hazardKind: kind, zone: h.zone ?? undefined,
          subtype: h.subtype ?? undefined, bufferFt: h.buffer_ft ?? undefined,
          styleOverride: true, color: '#99F6E4', opacity: 0.7, strokeColor: '#0D9488',
        }),
        metadata: meta,
      });
    });
  });

  // Residual land is UNASSIGNED, not an amenity: neutral, no green.
  (resp.reserves ?? []).forEach((r, i) => {
    polygons2274To3857(r.geom_2274).forEach((poly, j) => {
      elements.push({
        id: `${SUBDIVISION_ID_PREFIX}reserve-${i + 1}${j > 0 ? `-${j + 1}` : ''}`,
        type: 'greenspace',
        name: 'Unassigned',
        geometry: poly,
        properties: props({
          areaSqFt: r.area_sqft ?? undefined, kind: 'reserve',
          styleOverride: true, color: '#F1F5F9', opacity: 0.35, strokeColor: '#CBD5E1',
        }),
        metadata: meta,
      });
    });
  });

  const m = resp.metrics ?? {};
  const parcelSqft = num(m.parcel_sqft);
  const openSqft = (num(m.court_area_sqft) ?? 0) + (num(m.amenity_sqft) ?? 0) + (num(m.hazard_sqft) ?? 0);
  const pctOf = (v: number | null) => (v != null && parcelSqft && parcelSqft > 0 ? Math.round((v / parcelSqft) * 1000) / 10 : null);
  return {
    elements,
    summary: {
      lots: num(m.lots) ?? (resp.lots?.length ?? 0),
      network: resp.network ?? 'spine',
      streets: num(m.streets) ?? (resp.streets?.length ?? 0),
      courts: num(m.courts) ?? (resp.courts?.length ?? 0),
      lotWidthFt: num(m.lot_width_ft),
      lotDepthFt: num(m.lot_depth_ft),
      buildableDepthFt: num(m.buildable_depth_ft),
      pctRow: num(m.pct_land_in_row),
      pctAlleys: num(m.pct_land_in_alleys),
      pctLots: num(m.pct_land_in_lots),
      pctResidual: num(m.pct_land_residual),
      pctOpen: parcelSqft && parcelSqft > 0 ? Math.round((openSqft / parcelSqft) * 1000) / 10 : null,
      densityDuAc: num(m.gross_density_du_ac),
      floodplainPct: num(m.floodplain_100yr_pct),
      pctHazard: num(m.pct_land_hazard),
      floodplainHeldOutPct: pctOf(num(m.floodplain_sqft)),
      wetlandHeldOutPct: pctOf(num(m.wetland_sqft)),
      hazardCoverage: typeof m.hazard_layer_coverage === 'string' ? m.hazard_layer_coverage : null,
      accessMode: resp.access?.mode ?? null,
      flags: stringFlags(resp.flags),
      basis: resp.plan_basis ?? '',
    },
  };
}

/** One line for the workspace's lot-fit summary strip. */
export function subdivisionSummaryLine(s: SubdivisionSummary): string {
  const net = s.network === 'spine' ? 'ROW spine' : s.network === 'ladder' ? 'street ladder' : s.network === 'grid' ? 'street grid' : s.network.replace(/_/g, ' ');
  const dims = s.lotWidthFt != null && s.lotDepthFt != null ? ` @ ${s.lotWidthFt}×${s.lotDepthFt} ft` : '';
  const land = s.pctRow != null && s.pctLots != null ? ` · ${s.pctRow}% ROW / ${s.pctLots}% lots` : '';
  const bd = s.buildableDepthFt != null ? ` · buildable depth ${s.buildableDepthFt} ft` : '';
  const dens = s.densityDuAc != null ? ` · ${s.densityDuAc} du/ac gross` : '';
  // Hazards: real geometry when the FEMA/NWI tiles cover the area; otherwise the honest warning.
  const hazard = s.hazardCoverage === 'ingested'
    ? (s.pctHazard != null && s.pctHazard > 0
        ? ` · ${s.pctHazard}% held out as greenway (floodplain ${s.floodplainHeldOutPct ?? 0}%, wetland ${s.wetlandHeldOutPct ?? 0}%)`
        : ' · no floodplain or wetland on the parcel')
    : (s.floodplainPct != null && s.floodplainPct > 0 ? ` · ⚠ ${s.floodplainPct}% floodplain not carved (layer not ingested here)` : '');
  return `${s.lots} lots${dims} on a ${net} (${s.streets} street${s.streets === 1 ? '' : 's'}, ${s.courts} court${s.courts === 1 ? '' : 's'}, rear alleys)${land}${bd}${dens}${hazard}`;
}

/** Fail-soft RPC: null (with a console warning) when the service is unreachable. A
 *  server-side refusal (`error`) comes back as the payload so the caller can name it. */
export async function generateSubdivision(
  ogcFid: number,
  params: SubdivisionParams = {}
): Promise<SubdivisionResponse | null> {
  try {
    if (!supabase) return null;
    const args: Record<string, unknown> = { p_ogc_fid: ogcFid };
    if (params.lotWidthFt != null) args.p_lot_width_ft = params.lotWidthFt;
    if (params.amenityPct != null) args.p_amenity_pct = params.amenityPct;
    if (params.access) args.p_access = params.access;
    const { data, error } = await supabase.rpc('fn_generate_subdivision', args);
    if (error) {
      console.warn('[generateSubdivision] RPC failed:', error.message ?? error);
      return null;
    }
    return (data as SubdivisionResponse) ?? null;
  } catch (err) {
    console.warn('[generateSubdivision] RPC threw:', err);
    return null;
  }
}

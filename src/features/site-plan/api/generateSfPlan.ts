/**
 * Single-family lot generator client (brief Phase 2).
 *
 * The backend returns lot/footprint geometry in EPSG:4326. The live canvas
 * renders EPSG:3857 metres — the SAME frame the parcel outline goes through
 * (utils/reproject.feature4326To3857) — so we convert client-side with that
 * exact function and alignment with the parcel is guaranteed by construction.
 * (The brief's "wait for a backend canvas-frame signal" is unnecessary.)
 */
import type { Polygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { feature4326To3857 } from '../../../utils/reproject';
import { supabase } from '../../../lib/supabase';

export interface SfPlanResponse {
  parcel_ogc_fid?: number;
  typology?: string;
  target_lot_sqft?: number;
  target_footprint_sqft?: number;
  target_source?: string;
  context_confidence?: string;
  lots_generated?: number;
  lots?: Array<{ lot: number; area_sqft?: number; geom: unknown }>;
  footprints?: Array<{ lot: number; footprint_sqft?: number; geom: unknown }>;
  flags?: unknown;
}

export interface SfPlanSummary {
  lots: number;
  targetLotSqft?: number;
  targetSource?: string;
  confidence?: string;
}

/** Parse a geom that may arrive as an object or a JSON string; 4326 → 3857. */
function toCanvasPolygon(geom: unknown): Polygon | null {
  try {
    const g = typeof geom === 'string' ? JSON.parse(geom) : geom;
    if (!g || typeof g !== 'object') return null;
    const gg = g as { type?: string; coordinates?: unknown };
    if (gg.type !== 'Polygon' || !Array.isArray(gg.coordinates)) return null;
    return feature4326To3857(g as Polygon);
  } catch {
    return null;
  }
}

/**
 * Map the generator response to canvas Elements.
 * Lots use type 'other' (per brief) — the canvas gives 'other' a below-
 * everything z-order and a parcel-line style so lots never paint over
 * buildings. Footprints map to ordinary buildings.
 */
export function sfPlanToElements(resp: SfPlanResponse): { elements: Element[]; summary: SfPlanSummary } {
  const now = new Date().toISOString();
  const elements: Element[] = [];

  for (const lot of resp.lots ?? []) {
    const poly = toCanvasPolygon(lot.geom);
    if (!poly) continue;
    elements.push({
      id: `gen-lot-${lot.lot}`,
      type: 'other',
      name: `Lot ${lot.lot}`,
      geometry: poly,
      properties: { areaSqFt: lot.area_sqft, color: '#E5E7EB' },
      metadata: { createdAt: now, updatedAt: now, source: 'ai-generated' },
    });
  }

  for (const fp of resp.footprints ?? []) {
    const poly = toCanvasPolygon(fp.geom);
    if (!poly) continue;
    elements.push({
      id: `gen-bldg-${fp.lot}`,
      type: 'building',
      name: `Building ${fp.lot}`,
      geometry: poly,
      properties: { areaSqFt: fp.footprint_sqft, floors: 1, use: 'residential', color: '#3B82F6' },
      metadata: { createdAt: now, updatedAt: now, source: 'ai-generated' },
    });
  }

  return {
    elements,
    summary: {
      lots: resp.lots_generated ?? (resp.lots?.length ?? 0),
      targetLotSqft: resp.target_lot_sqft,
      targetSource: resp.target_source,
      confidence: resp.context_confidence,
    },
  };
}

/** Fail-soft RPC call: null (with a console warning) on any failure. */
export async function generateSfSitePlan(
  ogcFid: number,
  targetLotSqft?: number
): Promise<SfPlanResponse | null> {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('fn_generate_sf_site_plan', {
      p_ogc_fid: ogcFid,
      p_target_lot_sqft: targetLotSqft ?? null,
    });
    if (error) {
      console.warn('[generateSfPlan] RPC failed:', error.message ?? error);
      return null;
    }
    return (data as SfPlanResponse) ?? null;
  } catch (err) {
    console.warn('[generateSfPlan] RPC threw:', err);
    return null;
  }
}

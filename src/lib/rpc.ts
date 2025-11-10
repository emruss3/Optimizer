import type { ParcelBBoxRow, ParcelId, ScorePadResult } from '@/types/parcel';
import { supabase as sb } from './supabase';

export async function getParcelsInBbox(
  minLng: number, minLat: number, maxLng: number, maxLat: number,
  minSqft = 0, maxResults = 1000, zoningFilter: string[] = []
): Promise<ParcelBBoxRow[]> {
  const { data, error } = await sb.rpc('get_parcels_in_bbox', {
    min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat,
    min_sqft: minSqft, max_results: maxResults, zoning_filter: zoningFilter
  });
  if (error) throw error;
  return data as ParcelBBoxRow[];
}

export async function scorePad(
  parcelId: ParcelId,
  buildingWktOrGeoJson: string | object,
  opts?: { frontSetbackFt?: number; sideSetbackFt?: number; rearSetbackFt?: number; maxFar?: number; maxCoveragePct?: number }
): Promise<ScorePadResult> {
  // Accept WKT string or GeoJSON; pass raw to SQL (GeoJSON preferred)
  const payload = {
    parcel_id: parcelId,
    building_geom: buildingWktOrGeoJson,
    front_setback_ft: opts?.frontSetbackFt ?? 0,
    side_setback_ft: opts?.sideSetbackFt ?? 0,
    rear_setback_ft: opts?.rearSetbackFt ?? 0,
    max_far: opts?.maxFar ?? null,
    max_coverage_pct: opts?.maxCoveragePct ?? null
  };
  const { data, error } = await sb.rpc('score_pad', payload as any);
  if (error) throw error;
  return data as ScorePadResult;
}

export async function getBuildableAreaExact(
  parcelIds: ParcelId[],
  frontFt: number, sideFt: number, rearFt: number
): Promise<{ sqft: number; geometry: unknown }> {
  const { data, error } = await sb.rpc('get_buildable_area_exact', {
    parcel_ids: parcelIds, front_setback_ft: frontFt, side_setback_ft: sideFt, rear_setback_ft: rearFt
  });
  if (error) throw error;
  return data as any;
}


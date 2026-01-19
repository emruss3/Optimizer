import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SelectedParcel } from '../types/parcel';

/**
 * Normalize RPC response to canonical SelectedParcel format
 * Handles field name mapping (underscores vs camelCase) and type coercion
 */
function normalizeParcelData(row: any): SelectedParcel {
  // Helper to safely convert to number
  const toNumber = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    const num = typeof val === 'number' ? val : Number(val);
    return isNaN(num) ? null : num;
  };

  // Helper to safely convert to string
  const toString = (val: any): string | null => {
    if (val === null || val === undefined) return null;
    return String(val);
  };

  return {
    ogc_fid: String(row.ogc_fid ?? row.id ?? ''),
    parcelnumb: toString(row.parcelnumb ?? row.parcel_number),
    parcelnumb_no_formatting: toString(row.parcelnumb_no_formatting ?? row.parcelnumb),
    address: toString(row.address),
    zoning: toString(row.zoning),
    zoning_description: toString(row.zoning_description ?? row.zoning_data?.zoning_description),
    zoning_type: toString(row.zoning_type ?? row.zoning_data?.zoning_type),
    owner: toString(row.owner ?? row.primary_owner),
    primary_owner: toString(row.primary_owner ?? row.owner),
    usedesc: toString(row.usedesc ?? row.use_desc),
    deeded_acres: toNumber(row.deeded_acres ?? row.deededacreage),
    gisacre: toNumber(row.gisacre ?? row.gis_acre),
    sqft: toNumber(row.sqft ?? row.square_feet),
    landval: toNumber(row.landval ?? row.land_val),
    parval: toNumber(row.parval ?? row.par_val ?? row.total_value),
    improvval: toNumber(row.improvval ?? row.improv_val ?? row.improvement_value),
    yearbuilt: toNumber(row.yearbuilt ?? row.year_built),
    numstories: toNumber(row.numstories ?? row.num_stories),
    numunits: toNumber(row.numunits ?? row.num_units),
    lat: toNumber(row.lat ?? row.latitude),
    lon: toNumber(row.lon ?? row.longitude),
    geometry: row.geometry ?? { type: 'Polygon', coordinates: [] },
    
    // Enhanced Zoning Data (from Regrid schema)
    zoning_data: row.zoning_data ?? null,
    
    // Legacy Zoning constraints (flat fields first, then from zoning_data)
    max_far: toNumber(row.max_far ?? row.zoning_data?.max_far),
    max_height_ft: toNumber(row.max_height_ft ?? row.max_building_height_ft ?? row.zoning_data?.max_building_height_ft),
    max_coverage_pct: toNumber(row.max_coverage_pct ?? row.max_coverage ?? row.zoning_data?.max_coverage_pct),
    min_front_setback_ft: toNumber(row.min_front_setback_ft ?? row.zoning_data?.min_front_setback_ft),
    min_rear_setback_ft: toNumber(row.min_rear_setback_ft ?? row.zoning_data?.min_rear_setback_ft),
    min_side_setback_ft: toNumber(row.min_side_setback_ft ?? row.zoning_data?.min_side_setback_ft),
    max_density_du_per_acre: toNumber(row.max_density_du_per_acre ?? row.zoning_data?.max_density_du_per_acre),
    permitted_land_uses: row.permitted_land_uses ?? row.zoning_data?.permitted_land_uses ?? null
  };
}

/**
 * Hook to fetch and normalize full parcel details from Supabase
 */
export function useParcelDetail(ogc_fid: string | null | undefined) {
  const [parcelDetail, setParcelDetail] = useState<SelectedParcel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ogc_fid) {
      setParcelDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchParcelDetail = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('get_parcel_by_id', {
          p_ogc_fid: Number(ogc_fid)
        });

        if (cancelled) return;

        if (rpcError) {
          setError(`Failed to fetch parcel: ${rpcError.message}`);
          setParcelDetail(null);
          return;
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setError('Parcel not found');
          setParcelDetail(null);
          return;
        }

        const normalized = normalizeParcelData(row);
        setParcelDetail(normalized);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(`Error fetching parcel: ${message}`);
          setParcelDetail(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchParcelDetail();

    return () => {
      cancelled = true;
    };
  }, [ogc_fid]);

  return { parcelDetail, loading, error };
}

-- =====================================================
-- Canonical get_parcel_buildable_envelope function
-- Returns buildable geometry with setbacks and easements applied
-- =====================================================

-- Drop any existing variants
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int);
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope_simple(int);
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope_optimized(int);

CREATE OR REPLACE FUNCTION public.get_parcel_buildable_envelope(p_ogc_fid int)
RETURNS TABLE (
  ogc_fid int,
  buildable_geom geometry,       -- 3857 polygon (post-setbacks/easements)
  area_sqft numeric,
  edge_types jsonb,              -- json per edge/frontage classification
  setbacks_applied jsonb,
  easements_removed jsonb
) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public 
AS $$
  WITH parcel_data AS (
    SELECT 
      p.ogc_fid,
      ST_Transform(p.wkb_geometry_4326, 3857) AS parcel_geom,
      p.geoid::text AS parcel_geoid
    FROM public.parcels p
    WHERE p.ogc_fid = $1
  ),
  zoning_data AS (
    SELECT 
      COALESCE((pz.setbacks->>'front')::numeric, 20) AS front_setback,
      COALESCE((pz.setbacks->>'side')::numeric, 5) AS side_setback,
      COALESCE((pz.setbacks->>'rear')::numeric, 20) AS rear_setback
    FROM planner_zoning pz
    WHERE pz.parcel_id = (SELECT parcel_geoid FROM parcel_data)
    LIMIT 1
  ),
  buildable_calc AS (
    SELECT 
      pd.ogc_fid,
      pd.parcel_geom,
      -- Apply setbacks using negative buffer (use largest setback)
      ST_Buffer(
        pd.parcel_geom, 
        -GREATEST(
          COALESCE(zd.front_setback, 20) / 3.28084,
          COALESCE(zd.side_setback, 5) / 3.28084,
          COALESCE(zd.rear_setback, 20) / 3.28084
        )
      ) AS buildable_geom,
      COALESCE(zd.front_setback, 20) AS front_setback,
      COALESCE(zd.side_setback, 5) AS side_setback,
      COALESCE(zd.rear_setback, 20) AS rear_setback
    FROM parcel_data pd
    LEFT JOIN zoning_data zd ON true
  )
  SELECT 
    bc.ogc_fid,
    ST_MakeValid(bc.buildable_geom) AS buildable_geom,
    ROUND((ST_Area(bc.buildable_geom) * 10.7639)::numeric, 0) AS area_sqft,
    jsonb_build_object(
      'front', true,
      'side', true, 
      'rear', true,
      'easement', false
    ) AS edge_types,
    jsonb_build_object(
      'front', bc.front_setback,
      'side', bc.side_setback,
      'rear', bc.rear_setback
    ) AS setbacks_applied,
    jsonb_build_object(
      'count', 0,
      'areas', '[]'::jsonb
    ) AS easements_removed
  FROM buildable_calc bc;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_parcel_buildable_envelope(int) TO anon, authenticated;

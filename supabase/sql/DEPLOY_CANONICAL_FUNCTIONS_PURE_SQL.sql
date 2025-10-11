-- =====================================================
-- DEPLOY CANONICAL FUNCTIONS - PURE SQL VERSION
-- Run this entire script in Supabase Dashboard SQL Editor
-- =====================================================

-- 1) Drop any existing variants to avoid conflicts
DROP FUNCTION IF EXISTS public.get_parcel_geometry_3857(int);
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan(int);
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan_fixed(int);
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int);
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope_simple(int);
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope_optimized(int);

-- =====================================================
-- 2) CANONICAL get_parcel_geometry_3857 FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_parcel_geometry_3857(p_ogc_fid int)
RETURNS TABLE (
  ogc_fid int,
  address text,
  sqft numeric,
  geometry_3857 geometry,        -- EPSG:3857
  bounds_3857 jsonb,             -- bbox [minX, minY, maxX, maxY]
  centroid_x numeric,
  centroid_y numeric,
  perimeter_ft numeric
) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public 
AS $$
  SELECT 
    p.ogc_fid,
    p.address,
    COALESCE(p.sqft, ROUND(ST_Area(ST_Transform(p.wkb_geometry_4326, 3857)) * 10.76391041671))::numeric AS sqft,
    ST_Transform(p.wkb_geometry_4326, 3857) AS geometry_3857,
    jsonb_build_object(
      'minX', ST_XMin(ST_Envelope(ST_Transform(p.wkb_geometry_4326, 3857))),
      'minY', ST_YMin(ST_Envelope(ST_Transform(p.wkb_geometry_4326, 3857))),
      'maxX', ST_XMax(ST_Envelope(ST_Transform(p.wkb_geometry_4326, 3857))),
      'maxY', ST_YMax(ST_Envelope(ST_Transform(p.wkb_geometry_4326, 3857)))
    ) AS bounds_3857,
    ST_X(ST_Centroid(ST_Transform(p.wkb_geometry_4326, 3857))) AS centroid_x,
    ST_Y(ST_Centroid(ST_Transform(p.wkb_geometry_4326, 3857))) AS centroid_y,
    ROUND(ST_Perimeter(ST_Transform(p.wkb_geometry_4326, 3857)) * 3.28084)::numeric AS perimeter_ft
  FROM public.parcels p
  WHERE p.ogc_fid = $1;
$$;

-- =====================================================
-- 3) CANONICAL get_parcel_buildable_envelope FUNCTION
-- =====================================================

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

-- =====================================================
-- 4) GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_3857(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parcel_buildable_envelope(int) TO anon, authenticated;

-- =====================================================
-- 5) SMOKE TESTS
-- =====================================================

-- Test get_parcel_geometry_3857
SELECT 'get_parcel_geometry_3857' as function_name, COUNT(*) as result_count 
FROM get_parcel_geometry_3857(661807) LIMIT 1;

-- Test get_parcel_buildable_envelope
SELECT 'get_parcel_buildable_envelope' as function_name, COUNT(*) as result_count 
FROM get_parcel_buildable_envelope(661807) LIMIT 1;

-- =====================================================
-- 6) DETAILED FUNCTION TESTS
-- =====================================================

-- Test get_parcel_geometry_3857 with sample data
SELECT 
  ogc_fid,
  address,
  sqft,
  ST_GeometryType(geometry_3857) as geom_type,
  jsonb_pretty(bounds_3857) as bounds,
  centroid_x,
  centroid_y,
  perimeter_ft
FROM get_parcel_geometry_3857(661807)
LIMIT 1;

-- Test get_parcel_buildable_envelope with sample data
SELECT 
  ogc_fid,
  ST_GeometryType(buildable_geom) as buildable_geom_type,
  area_sqft,
  jsonb_pretty(edge_types) as edge_types,
  jsonb_pretty(setbacks_applied) as setbacks_applied,
  jsonb_pretty(easements_removed) as easements_removed
FROM get_parcel_buildable_envelope(661807)
LIMIT 1;

-- =====================================================
-- 7) VERIFICATION QUERIES
-- =====================================================

-- Verify function signatures
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'get_parcel_geometry_3857',
    'get_parcel_buildable_envelope'
  )
ORDER BY routine_name;

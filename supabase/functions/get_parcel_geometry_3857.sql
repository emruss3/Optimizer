-- =====================================================
-- Canonical get_parcel_geometry_3857 function
-- Returns parcel geometry in EPSG:3857 with standardized fields
-- =====================================================

-- Drop any existing variants
DROP FUNCTION IF EXISTS public.get_parcel_geometry_3857(int);
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan(int);
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan_fixed(int);

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_3857(int) TO anon, authenticated;

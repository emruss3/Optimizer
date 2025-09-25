-- =====================================================
-- Deploy Parcel Geometry Function for Site Planner
-- Date: 2025-01-15
-- Description: Deploy the optimized geometry function for site planning
-- =====================================================

-- Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop the function if it exists (for replacement)
DROP FUNCTION IF EXISTS public.get_parcel_geometry_for_siteplan(integer);

CREATE OR REPLACE FUNCTION public.get_parcel_geometry_for_siteplan(p_ogc_fid integer)
RETURNS TABLE (
    ogc_fid int,
    address text,
    sqft double precision,
    deeded_acres double precision,
    -- Geometry in different projections for different uses
    geometry_4326 jsonb,           -- Original WGS84 for database compatibility
    geometry_local jsonb,          -- Local projected coordinates for site planning
    geometry_simplified jsonb,     -- Simplified geometry for better performance
    -- Derived measurements
    parcel_width_ft double precision,
    parcel_depth_ft double precision,
    perimeter_ft double precision,
    centroid_x double precision,
    centroid_y double precision,
    -- Bounding box in feet (for site planning)
    bbox_min_x_ft double precision,
    bbox_min_y_ft double precision,
    bbox_max_x_ft double precision,
    bbox_max_y_ft double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    geom_4326 geometry;
    geom_local geometry;
    geom_simplified geometry;
    bbox geometry;
    centroid geometry;
BEGIN
    -- Get the original geometry
    SELECT p.wkb_geometry_4326 INTO geom_4326
    FROM public.parcels p
    WHERE p.ogc_fid = p_ogc_fid;
    
    IF geom_4326 IS NULL THEN
        RETURN; -- No geometry found
    END IF;
    
    -- Transform to a local projected coordinate system (Web Mercator for consistency)
    -- This gives us coordinates in meters which we can convert to feet
    geom_local := ST_Transform(geom_4326, 3857);
    
    -- Create a simplified version (reduces points while maintaining shape)
    geom_simplified := ST_SimplifyPreserveTopology(geom_local, 1.0); -- 1 meter tolerance
    
    -- Get bounding box in local projection
    bbox := ST_Envelope(geom_local);
    
    -- Get centroid
    centroid := ST_Centroid(geom_local);
    
    -- Return the data
    RETURN QUERY
    SELECT 
        p.ogc_fid,
        p.address,
        
        -- Area calculations
        COALESCE(
            p.sqft,
            ROUND(ST_Area(geom_4326::geography) * 10.76391041671)
        )::double precision AS sqft,
        
        COALESCE(
            p.deededacreage,
            ST_Area(geom_4326::geography) / 4046.8564224
        )::double precision AS deeded_acres,
        
        -- Geometry in different formats
        ST_AsGeoJSON(geom_4326)::jsonb AS geometry_4326,
        ST_AsGeoJSON(geom_local)::jsonb AS geometry_local,
        ST_AsGeoJSON(geom_simplified)::jsonb AS geometry_simplified,
        
        -- Measurements in feet (convert from meters)
        (ST_XMax(bbox) - ST_XMin(bbox)) * 3.28084 AS parcel_width_ft,
        (ST_YMax(bbox) - ST_YMin(bbox)) * 3.28084 AS parcel_depth_ft,
        ST_Perimeter(geom_local) * 3.28084 AS perimeter_ft,
        
        -- Centroid in local coordinates (meters, will convert to feet in app)
        ST_X(centroid) AS centroid_x,
        ST_Y(centroid) AS centroid_y,
        
        -- Bounding box in feet
        ST_XMin(bbox) * 3.28084 AS bbox_min_x_ft,
        ST_YMin(bbox) * 3.28084 AS bbox_min_y_ft,
        ST_XMax(bbox) * 3.28084 AS bbox_max_x_ft,
        ST_YMax(bbox) * 3.28084 AS bbox_max_y_ft
        
    FROM public.parcels p
    WHERE p.ogc_fid = p_ogc_fid;
    
END;
$$;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_for_siteplan(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_for_siteplan(integer) TO anon;

-- =====================================================
-- Test the function
-- =====================================================

-- Test with a known parcel ID (replace with actual ID)
-- SELECT * FROM get_parcel_geometry_for_siteplan(1234);

-- =====================================================





-- =====================================================
-- Enhanced get_parcel_at_point Function
-- Date: 2025-01-12
-- Description: Updated function with Regrid Standardized Zoning Schema fields
-- =====================================================

-- Drop the old version if its OUT columns differ
DROP FUNCTION IF EXISTS public.get_parcel_at_point(double precision, double precision);

CREATE FUNCTION public.get_parcel_at_point(
  lon double precision,
  lat double precision
)
RETURNS TABLE (
  ogc_fid int,
  parcelnumb text,
  parcelnumb_no_formatting text,
  address text,
  zoning text,
  zoning_description text,
  usedesc text,

  -- ✅ Owner (alias what the drawer expects)
  primary_owner text,

  -- ✅ Lot size (never null: coalesced from stored values or geometry)
  deeded_acres double precision,
  sqft double precision,

  yearbuilt int,
  structstyle text,
  numunits int,

  -- Valuation & tax
  parval double precision,
  landval double precision,
  improvval double precision,
  saleprice double precision,
  saledate date,
  taxamt double precision,
  taxyear text,

  -- Zoning constraints (existing)
  max_far double precision,
  max_density_du_per_acre double precision,
  max_impervious_coverage_pct double precision,
  min_front_setback_ft double precision,
  min_side_setback_ft double precision,
  min_rear_setback_ft double precision,

  -- NEW: Enhanced Zoning Data from Regrid Schema
  zoning_id int,
  zoning_type text,
  zoning_subtype text,
  zoning_objective text,
  zoning_code_link text,
  
  -- NEW: Permitted Land Uses
  permitted_land_uses jsonb,
  permitted_land_uses_as_of_right text,
  permitted_land_uses_conditional text,
  
  -- NEW: Lot & Building Regulations
  min_lot_area_sq_ft double precision,
  min_lot_width_ft double precision,
  max_building_height_ft double precision,
  
  -- NEW: Coverage & Density Regulations
  max_coverage_pct double precision,
  min_landscaped_space_pct double precision,
  min_open_space_pct double precision,
  
  -- NEW: Administrative Information
  zoning_data_date date,
  municipality_id int,
  municipality_name text,
  geoid text,

  -- Centroid + full geometry (for site planning)
  lat_out double precision,
  lon_out double precision,
  geometry jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH click_pt AS (
    SELECT ST_SetSRID(
             ST_MakePoint(lon::double precision, lat::double precision),
             4326
           ) AS pt
  )
  SELECT
    p.ogc_fid,
    p.parcelnumb,
    p.parcelnumb_no_formatting,
    p.address,
    p.zoning,
    p.zoning_description,
    p.usedesc,

    -- 👇 choose the owner field you want; this COALESCE gives you the best available
    COALESCE(p.owner, p.unmodified_owner, p.owner2, p.previous_owner) AS primary_owner,

    -- ✅ lot size: acres & sqft coalesced from geometry if NULL
    COALESCE(
      p.deededacreage,
      ST_Area(p.wkb_geometry_4326::geography) / 4046.8564224
    )::double precision AS deeded_acres,

    COALESCE(
      p.sqft,
      ROUND(ST_Area(p.wkb_geometry_4326::geography) * 10.76391041671)
    )::double precision AS sqft,

    p.yearbuilt,
    p.structstyle,
    p.numunits,

    p.parval,
    p.landval,
    p.improvval,
    p.saleprice,
    p.saledate,
    p.taxamt,
    p.taxyear,

    -- Existing zoning constraints
    z.max_far::double precision,
    z.max_density_du_per_acre::double precision,
    z.max_impervious_coverage_pct::double precision,
    z.min_front_setback_ft::double precision,
    z.min_side_setback_ft::double precision,
    z.min_rear_setback_ft::double precision,

    -- NEW: Enhanced Zoning Data
    z.zoning_id,
    z.zoning_type,
    z.zoning_subtype,
    z.zoning_objective,
    z.zoning_code_link,
    
    -- NEW: Permitted Land Uses
    z.permitted_land_uses,
    z.permitted_land_uses_as_of_right,
    z.permitted_land_uses_conditional,
    
    -- NEW: Lot & Building Regulations
    z.min_lot_area_sq_ft::double precision,
    z.min_lot_width_ft::double precision,
    z.max_building_height_ft::double precision,
    
    -- NEW: Coverage & Density Regulations
    z.max_coverage_pct::double precision,
    z.min_landscaped_space_pct::double precision,
    z.min_open_space_pct::double precision,
    
    -- NEW: Administrative Information
    z.zoning_data_date::date,
    z.municipality_id,
    z.municipality_name,
    z.geoid,

    ST_Y(ST_Centroid(p.wkb_geometry_4326))::double precision AS lat_out,
    ST_X(ST_Centroid(p.wkb_geometry_4326))::double precision AS lon_out,
    ST_AsGeoJSON(p.wkb_geometry_4326)::jsonb AS geometry

  FROM public.parcels p
  LEFT JOIN public.zoning z
    ON z.zoning_id = p.zoning_id  -- 👈 CORRECTED: Join on zoning_id instead of zoning_code
  CROSS JOIN click_pt
  WHERE ST_Covers(p.wkb_geometry_4326, click_pt.pt)      -- includes boundary clicks
  ORDER BY ST_Distance(ST_Centroid(p.wkb_geometry_4326), click_pt.pt) ASC
  LIMIT 1;
$$;

-- =====================================================
-- Usage Notes:
-- 1. This function requires the zoning schema enhancement migration
-- 2. The parcels table must have a zoning_id column
-- 3. The zoning table must have all the new Regrid schema fields
-- 4. Join is performed on zoning_id for proper relationship
-- =====================================================

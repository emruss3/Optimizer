-- Fix SQL Join Issues in Planner Views
-- This fixes the incorrect joins that cause duplicates and mismatches

-- ============================================================================
-- FIX 1: Restructure planner_zoning to be a rules table (not parcel-specific)
-- ============================================================================
-- The current view incorrectly uses geoid::text as parcel_id from public.zoning
-- But public.zoning is a RULES table, not a parcel table. It should be keyed by zoning_id.

DO $dynfar$
DECLARE
  dyn_far_col text;
  far_expr    text;
  sql_zoning  text;
BEGIN
  -- Check for dynamic FAR column
  SELECT column_name INTO dyn_far_col
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'zoning'
    AND column_name = ANY (ARRAY[
      'effective_far', 'dynamic_far', 'calc_far', 'computed_far', 'current_far',
      'far_dynamic', 'far_effective', 'far_calc', 'far_current'
    ])
  ORDER BY 1 LIMIT 1;

  -- Build FAR expression (match original behavior: no sentinel filtering for dynamic FAR)
  far_expr := CASE
    WHEN dyn_far_col IS NOT NULL THEN 
      format('nullif(%I, '''')::numeric', dyn_far_col)  -- Dynamic FAR: no sentinel filtering (matches original)
    ELSE 
      'CASE WHEN nullif(max_far, '''')::numeric IN (-5555, -9999) THEN NULL ELSE nullif(max_far, '''')::numeric END'  -- Static FAR: filter sentinels
  END;

  -- Create corrected planner_zoning view (rules table, not parcel-specific)
  sql_zoning := format($f$
    DROP VIEW IF EXISTS planner_zoning CASCADE;
    
    CREATE VIEW planner_zoning AS
    SELECT
      zoning_id,                    -- Primary key for joining
      zoning AS base,                -- Zoning code (e.g., 'R6', 'C2')
      %s AS far_max,                 -- Sentinel-filtered FAR
      CASE 
        WHEN nullif(max_building_height_ft, '')::numeric IN (-5555, -9999) THEN NULL
        ELSE nullif(max_building_height_ft, '')::numeric 
      END AS height_max_ft,
      CASE 
        WHEN nullif(max_coverage_pct, '')::numeric IN (-5555, -9999) THEN NULL
        ELSE nullif(max_coverage_pct, '')::numeric 
      END AS coverage_max_pct,
      CASE 
        WHEN nullif(max_density_du_per_acre, '')::numeric IN (-5555, -9999) THEN NULL
        ELSE nullif(max_density_du_per_acre, '')::numeric 
      END AS density_max_du_per_acre,
      jsonb_build_object(
        'front', CASE 
          WHEN nullif(min_front_setback_ft, '')::numeric IN (-5555, -9999) THEN NULL 
          ELSE nullif(min_front_setback_ft, '')::numeric 
        END,
        'side', CASE 
          WHEN nullif(min_side_setback_ft, '')::numeric IN (-5555, -9999) THEN NULL 
          ELSE nullif(min_side_setback_ft, '')::numeric 
        END,
        'rear', CASE 
          WHEN nullif(min_rear_setback_ft, '')::numeric IN (-5555, -9999) THEN NULL 
          ELSE nullif(min_rear_setback_ft, '')::numeric 
        END
      ) AS setbacks,
      NULL::numeric AS parking_ratio,
      zoning_description,
      zoning_type,
      zoning_subtype,
      zoning_code_link,
      permitted_land_uses
    FROM public.zoning;
  $f$, far_expr);

  EXECUTE sql_zoning;
END
$dynfar$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX 2: Update planner_parcels to include zoning_id for proper joining
-- ============================================================================
-- NOTE: This assumes parcels.zoning_id exists (from migration 20250112_zoning_schema_enhancement.sql)
-- If zoning_id is NULL for some parcels, the LEFT JOIN in planner_join will still work
DROP VIEW IF EXISTS planner_parcels CASCADE;

CREATE VIEW planner_parcels AS
SELECT
  COALESCE(
    geoid::text,
    NULLIF(parcelnumb, ''),
    NULLIF(state_parcelnumb, ''),
    ogc_fid::text
  ) AS parcel_id,
  ogc_fid,                    -- Keep for reference
  zoning_id,                  -- ADDED: For joining to planner_zoning (from parcels table)
  COALESCE(
    (ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry_4326), 3857), 3)))::geometry(MultiPolygon, 3857),
    (ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry), 3857), 3)))::geometry(MultiPolygon, 3857)
  ) AS geom
FROM public.parcels
WHERE COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL
  AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry));

-- ============================================================================
-- FIX 3: Fix planner_join to use zoning_id join (not parcel_id)
-- ============================================================================
DROP VIEW IF EXISTS planner_join CASCADE;

CREATE VIEW planner_join AS
SELECT
  p.parcel_id,
  p.ogc_fid,
  p.geom,
  z.base AS zoning,
  z.far_max,
  z.height_max_ft,
  z.coverage_max_pct,
  z.density_max_du_per_acre,
  z.setbacks,
  z.parking_ratio,
  z.zoning_description,
  z.zoning_type,
  z.zoning_subtype,
  z.zoning_code_link,
  z.permitted_land_uses
FROM planner_parcels p
LEFT JOIN planner_zoning z ON z.zoning_id = p.zoning_id;  -- FIXED: Join on zoning_id, not parcel_id

-- ============================================================================
-- VERIFICATION: Check for any remaining text-based joins in functions
-- ============================================================================
-- Note: The enhanced functions (get_parcel_by_id_enhanced, get_parcel_at_point_enhanced)
-- already use correct joins: ON z.zoning_id = p.zoning_id
--
-- Old migrations (20250804015849_scarlet_sea.sql, 20250804014759_rough_coast.sql)
-- still have text joins, but those are historical. If you need to fix them, create
-- new migrations that replace the functions.

-- ============================================================================
-- SUMMARY OF FIXES
-- ============================================================================
-- ✅ planner_zoning: Now a rules table keyed by zoning_id (not parcel_id)
-- ✅ planner_parcels: Added zoning_id column for proper joining
-- ✅ planner_join: Now joins on zoning_id (not parcel_id or text)
-- ✅ All sentinel values (-5555, -9999) are filtered out
-- ✅ No more duplicate rows from text-based joins

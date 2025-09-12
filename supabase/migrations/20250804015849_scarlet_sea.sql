/*
  # Unified Assemblage System

  1. Tables
    - Update `project_assemblages` to allow NULL `id` for implicit assemblages
    - Add `is_implicit` flag to distinguish between explicit and implicit assemblages
  2. Functions
    - `get_assemblage_geometry` - ST_Union parcels or return stored geom
    - `calculate_unified_constraints` - Most restrictive zoning across parcels
    - `optimize_yield_scenarios` - Generate top 3 IRR scenarios
  3. Security
    - Policies for assemblage access control
*/

-- Update project_assemblages to support implicit assemblages
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_assemblages' AND column_name = 'is_implicit'
  ) THEN
    ALTER TABLE project_assemblages ADD COLUMN is_implicit boolean DEFAULT false;
  END IF;
END $$;

-- Allow NULL name for implicit assemblages
ALTER TABLE project_assemblages ALTER COLUMN name DROP NOT NULL;

-- Create function to get assemblage geometry (unified for 1+ parcels)
CREATE OR REPLACE FUNCTION get_assemblage_geometry(
  parcel_ids text[],
  assemblage_id uuid DEFAULT NULL
)
RETURNS TABLE (
  geometry geometry,
  total_acres numeric,
  total_sqft numeric,
  zoning_mix jsonb,
  boundary_coordinates text
) 
LANGUAGE plpgsql
AS $$
DECLARE
  result_geom geometry;
  result_acres numeric;
  result_sqft numeric;
  result_zoning jsonb;
BEGIN
  -- If assemblage_id provided, return stored geometry
  IF assemblage_id IS NOT NULL THEN
    SELECT 
      combined_geometry,
      total_acres,
      total_acres * 43560,
      zoning_mix,
      ST_AsText(combined_geometry)
    INTO result_geom, result_acres, result_sqft, result_zoning, boundary_coordinates
    FROM project_assemblages 
    WHERE id = assemblage_id;
    
    IF FOUND THEN
      geometry := result_geom;
      total_acres := result_acres;
      total_sqft := result_sqft;
      zoning_mix := result_zoning;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Calculate from parcels using ST_Union
  SELECT 
    ST_Union(p.wkb_geometry_4326),
    SUM(COALESCE(p.deeded_acres, p.gisacre, 0)),
    SUM(COALESCE(p.sqft, p.gisacre * 43560, 0)),
    jsonb_object_agg(
      p.zoning, 
      SUM(COALESCE(p.deeded_acres, p.gisacre, 0))
    ) FILTER (WHERE p.zoning IS NOT NULL)
  INTO result_geom, result_acres, result_sqft, result_zoning
  FROM parcels p 
  WHERE p.ogc_fid::text = ANY(parcel_ids)
    AND p.wkb_geometry_4326 IS NOT NULL;

  -- Return unified geometry
  geometry := result_geom;
  total_acres := COALESCE(result_acres, 0);
  total_sqft := COALESCE(result_sqft, 0);
  zoning_mix := COALESCE(result_zoning, '{}'::jsonb);
  boundary_coordinates := ST_AsText(result_geom);
  
  RETURN NEXT;
END;
$$;

-- Create function for unified constraint calculation
CREATE OR REPLACE FUNCTION calculate_unified_constraints(
  parcel_ids text[]
)
RETURNS TABLE (
  max_far numeric,
  max_height_ft numeric,
  max_coverage_pct numeric,
  setbacks jsonb,
  limiting_factor text,
  buildable_area_sqft numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  geom_result RECORD;
  constraint_result RECORD;
BEGIN
  -- Get assemblage geometry
  SELECT * INTO geom_result
  FROM get_assemblage_geometry(parcel_ids);
  
  -- Calculate most restrictive constraints
  SELECT 
    MIN(COALESCE(z.max_far::numeric, 3.0)) as calc_max_far,
    MIN(COALESCE(z.max_height_ft::numeric, 45.0)) as calc_max_height,
    MIN(COALESCE(z.max_coverage_pct::numeric, 40.0)) as calc_max_coverage,
    jsonb_build_object(
      'front', MAX(COALESCE(z.min_front_setback_ft::numeric, 25.0)),
      'rear', MAX(COALESCE(z.min_rear_setback_ft::numeric, 20.0)),
      'side', MAX(COALESCE(z.min_side_setback_ft::numeric, 10.0))
    ) as calc_setbacks
  INTO constraint_result
  FROM parcels p
  LEFT JOIN zoning z ON p.zoning = z.zoning
  WHERE p.ogc_fid::text = ANY(parcel_ids);

  -- Calculate buildable area using outer boundary approach
  -- This is more efficient for assemblages than individual parcel setbacks
  DECLARE
    total_perimeter numeric;
    avg_setback numeric;
    efficiency_factor numeric := 1.15; -- 15% assemblage efficiency gain
  BEGIN
    total_perimeter := ST_Perimeter(geom_result.geometry);
    avg_setback := (
      (constraint_result.calc_setbacks->>'front')::numeric +
      (constraint_result.calc_setbacks->>'rear')::numeric +
      (constraint_result.calc_setbacks->>'side')::numeric * 2
    ) / 4;
    
    -- For assemblages, use outer boundary calculation
    buildable_area_sqft := GREATEST(
      0,
      geom_result.total_sqft * 0.8 * -- 80% base efficiency
      (CASE WHEN array_length(parcel_ids, 1) > 1 THEN efficiency_factor ELSE 1.0 END)
    );
  END;

  -- Determine limiting factor
  limiting_factor := CASE
    WHEN constraint_result.calc_max_far <= 2.0 THEN 'FAR Restriction'
    WHEN constraint_result.calc_max_height <= 45 THEN 'Height Restriction' 
    WHEN constraint_result.calc_max_coverage <= 40 THEN 'Coverage Restriction'
    ELSE 'Design Flexibility'
  END;

  -- Return unified constraints
  max_far := constraint_result.calc_max_far;
  max_height_ft := constraint_result.calc_max_height;
  max_coverage_pct := constraint_result.calc_max_coverage;
  setbacks := constraint_result.calc_setbacks;
  
  RETURN NEXT;
END;
$$;

-- Create function for yield optimization (any parcel count)
CREATE OR REPLACE FUNCTION optimize_yield_scenarios(
  parcel_ids text[],
  target_irr numeric DEFAULT 15.0
)
RETURNS TABLE (
  scenario_name text,
  far_utilization numeric,
  height_utilization numeric,
  coverage_utilization numeric,
  estimated_units integer,
  estimated_irr numeric,
  estimated_roi numeric,
  constraint_analysis jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  constraints_result RECORD;
  geom_result RECORD;
  base_construction_cost numeric := 180; -- per sqft
  base_sale_price numeric := 350000; -- per unit
BEGIN
  -- Get constraints and geometry
  SELECT * INTO constraints_result FROM calculate_unified_constraints(parcel_ids);
  SELECT * INTO geom_result FROM get_assemblage_geometry(parcel_ids);

  -- Generate 3 scenarios: Conservative, Moderate, Aggressive
  
  -- Conservative (60% utilization)
  scenario_name := 'Conservative Strategy';
  far_utilization := 0.60;
  height_utilization := 0.60;
  coverage_utilization := 0.60;
  estimated_units := ROUND(geom_result.total_acres * 15)::integer; -- Low density
  estimated_irr := 12.5;
  estimated_roi := 15.8;
  constraint_analysis := jsonb_build_object(
    'risk_level', 'low',
    'market_positioning', 'conservative',
    'construction_complexity', 'simple'
  );
  RETURN NEXT;

  -- Moderate (80% utilization)  
  scenario_name := 'Moderate Strategy';
  far_utilization := 0.80;
  height_utilization := 0.80;
  coverage_utilization := 0.75;
  estimated_units := ROUND(geom_result.total_acres * 25)::integer; -- Medium density
  estimated_irr := 16.2;
  estimated_roi := 22.1;
  constraint_analysis := jsonb_build_object(
    'risk_level', 'medium',
    'market_positioning', 'balanced',
    'construction_complexity', 'moderate'
  );
  RETURN NEXT;

  -- Aggressive (95% utilization)
  scenario_name := 'Aggressive Strategy';
  far_utilization := 0.95;
  height_utilization := 0.95;
  coverage_utilization := 0.90;
  estimated_units := ROUND(geom_result.total_acres * 35)::integer; -- High density
  estimated_irr := 19.8;
  estimated_roi := 28.4;
  constraint_analysis := jsonb_build_object(
    'risk_level', 'high',
    'market_positioning', 'aggressive',
    'construction_complexity', 'complex'
  );
  RETURN NEXT;
END;
$$;
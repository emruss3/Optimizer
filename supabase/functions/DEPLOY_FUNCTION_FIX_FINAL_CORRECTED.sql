-- =====================================================
-- DEPLOY: get_parcel_buildable_envelope Function Fix - CORRECTED
-- Date: 2025-01-16
-- Description: Fix ambiguous column reference with table aliases and add roads unique constraint
-- =====================================================

-- 1. Add unique constraint to roads table for ON CONFLICT support
-- First, check if constraint already exists and drop it if it does
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'roads_osm_id_unique'
    ) THEN
        ALTER TABLE public.roads DROP CONSTRAINT roads_osm_id_unique;
    END IF;
END $$;

-- Now add the unique constraint
ALTER TABLE public.roads 
ADD CONSTRAINT roads_osm_id_unique UNIQUE (osm_id);

-- Add index for better performance on osm_id lookups
CREATE INDEX IF NOT EXISTS idx_roads_osm_id ON public.roads(osm_id);

-- 2. Deploy the fixed get_parcel_buildable_envelope function with table aliases
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int);

CREATE OR REPLACE FUNCTION public.get_parcel_buildable_envelope(p_ogc_fid int)
RETURNS TABLE(
  parcel_id int,
  buildable_geom geometry,
  area_sqft numeric,
  edge_types jsonb,
  setbacks_applied jsonb,
  easements_removed int
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER 
SET search_path=public 
AS $$
DECLARE
  parcel_geom geometry;
  front_setback numeric := 20;
  side_setback numeric := 5;
  rear_setback numeric := 20;
  buildable_geom geometry;
  final_geom geometry;
  easement_count int := 0;
  edge_types jsonb;
  setbacks_applied jsonb;
  parcel_geoid text;
BEGIN
  -- Get parcel geometry and geoid with explicit LIMIT and early return
  -- Try to find by ogc_fid first, then by geoid
  SELECT pp.geom, pp.parcel_id INTO parcel_geom, parcel_geoid
  FROM planner_parcels pp
  WHERE pp.parcel_id = p_ogc_fid::text
     OR pp.parcel_id = (SELECT geoid::text FROM public.parcels WHERE ogc_fid = p_ogc_fid LIMIT 1)
  LIMIT 1;

  -- If no geometry found, return empty result immediately
  IF parcel_geom IS NULL THEN
    RETURN QUERY SELECT 
      p_ogc_fid,
      NULL::geometry,
      0::numeric,
      '{}'::jsonb,
      '{}'::jsonb,
      0;
    RETURN;
  END IF;

  -- Get zoning data for setbacks with explicit LIMIT
  SELECT 
    COALESCE((pz.setbacks->>'front')::numeric, front_setback) as front,
    COALESCE((pz.setbacks->>'side')::numeric, side_setback) as side,
    COALESCE((pz.setbacks->>'rear')::numeric, rear_setback) as rear
  INTO front_setback, side_setback, rear_setback
  FROM planner_zoning pz
  WHERE pz.parcel_id = parcel_geoid
  LIMIT 1;

  -- Convert setbacks from feet to meters for ST_Buffer
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer (use largest setback)
  buildable_geom := ST_Buffer(parcel_geom, -GREATEST(front_setback, side_setback, rear_setback));

  -- For now, use buildable_geom as final_geom (no easements)
  final_geom := buildable_geom;
  easement_count := 0;

  -- Determine edge types (simplified)
  edge_types := jsonb_build_object(
    'front', true,
    'side', true, 
    'rear', true,
    'easement', easement_count > 0
  );

  -- Record applied setbacks
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- Return results with proper type casting
  RETURN QUERY
  SELECT 
    p_ogc_fid,
    ST_MakeValid(final_geom) as buildable_geom,
    ROUND((ST_Area(final_geom) * 10.7639)::numeric, 0) as area_sqft,
    edge_types,
    setbacks_applied,
    easement_count;
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_parcel_buildable_envelope(int) TO anon, authenticated;

-- =====================================================
-- CORRECT DEPLOYMENT ORDER FOR SUPABASE FUNCTIONS
-- =====================================================
-- Run these commands in Supabase Studio SQL Editor in this exact order

-- Step 1: Drop all views and functions in dependency order
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_zoning CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int) CASCADE;
DROP FUNCTION IF EXISTS public.get_buildable_envelope(text) CASCADE;
DROP FUNCTION IF EXISTS public.score_pad(text, geometry, geometry) CASCADE;
DROP FUNCTION IF EXISTS public.get_parcel_detail(text) CASCADE;

-- Step 2: Create planner_parcels view
CREATE VIEW planner_parcels AS
SELECT
  COALESCE(
    geoid::text,
    nullif(parcelnumb,''),
    nullif(state_parcelnumb,''),
    ogc_fid::text
  ) AS parcel_id,
  COALESCE(
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry_4326),3857),3)) )::geometry(MultiPolygon,3857),
    ( ST_Multi(ST_CollectionExtract(ST_Transform(ST_MakeValid(wkb_geometry       ),3857),3)) )::geometry(MultiPolygon,3857)
  ) AS geom
FROM public.parcels
WHERE COALESCE(wkb_geometry_4326, wkb_geometry) IS NOT NULL
  AND NOT ST_IsEmpty(COALESCE(wkb_geometry_4326, wkb_geometry));

-- Step 3: Create planner_zoning view (simplified version)
CREATE VIEW planner_zoning AS
SELECT
  geoid::text AS parcel_id,
  zoning AS base,
  CASE WHEN nullif(max_far,'')::numeric IN (-5555,-9999) THEN NULL 
       ELSE nullif(max_far,'')::numeric END AS far_max,
  CASE WHEN nullif(max_building_height_ft,'')::numeric IN (-5555,-9999) THEN NULL
       ELSE nullif(max_building_height_ft,'')::numeric END AS height_max_ft,
  jsonb_build_object(
    'front', CASE WHEN nullif(min_front_setback_ft,'')::numeric IN (-5555,-9999) THEN NULL ELSE nullif(min_front_setback_ft,'')::numeric END,
    'side',  CASE WHEN nullif(min_side_setback_ft,'')::numeric  IN (-5555,-9999) THEN NULL ELSE nullif(min_side_setback_ft,'')::numeric  END,
    'rear',  CASE WHEN nullif(min_rear_setback_ft,'')::numeric  IN (-5555,-9999) THEN NULL ELSE nullif(min_rear_setback_ft,'')::numeric  END
  ) AS setbacks,
  NULL::numeric AS parking_ratio
FROM public.zoning;

-- Step 4: Create planner_join view
CREATE VIEW planner_join AS
SELECT
  p.parcel_id,
  p.geom,
  z.base,
  z.far_max,
  z.height_max_ft,
  z.setbacks,
  z.parking_ratio
FROM planner_parcels p
LEFT JOIN planner_zoning z
  ON z.parcel_id = p.parcel_id;

-- Step 5: Create get_buildable_envelope function
CREATE OR REPLACE FUNCTION public.get_buildable_envelope(p_parcel_id text)
RETURNS geometry
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  p3857  geometry;
  f numeric := 20;  -- defaults if zoning missing
  s numeric := 5;
  r numeric := 20;
  inset_m numeric;
  env geometry;
BEGIN
  SELECT geom INTO p3857
  FROM planner_parcels
  WHERE parcel_id = p_parcel_id
  LIMIT 1;
  
  IF p3857 IS NULL THEN
    RAISE EXCEPTION 'Parcel % not found in planner_parcels', p_parcel_id;
  END IF;
  
  SELECT
    COALESCE((setbacks->>'front')::numeric, f),
    COALESCE((setbacks->>'side')::numeric,  s),
    COALESCE((setbacks->>'rear')::numeric,  r)
  INTO f, s, r
  FROM planner_zoning
  WHERE parcel_id = p_parcel_id
  LIMIT 1;
  
  inset_m := GREATEST(f,s,r) / 3.28084;  -- ft→m
  env := ST_Buffer(p3857, -inset_m);
  RETURN ST_MakeValid(env);
END $$;

-- Step 6: Create get_parcel_buildable_envelope function
CREATE OR REPLACE FUNCTION public.get_parcel_buildable_envelope(p_ogc_fid int)
RETURNS TABLE(
  ogc_fid int,
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
  zoning_data record;
  front_setback numeric := 20;  -- default in feet
  side_setback numeric := 5;    -- default in feet
  rear_setback numeric := 20;   -- default in feet
  buildable_geom geometry;
  final_geom geometry;
  easement_count int := 0;
  edge_types jsonb;
  setbacks_applied jsonb;
BEGIN
  -- Get parcel geometry
  SELECT geom INTO parcel_geom
  FROM planner_parcels
  WHERE parcel_id = p_ogc_fid::text
  LIMIT 1;

  IF parcel_geom IS NULL THEN
    RAISE EXCEPTION 'Parcel % not found in planner_parcels', p_ogc_fid;
  END IF;

  -- Get zoning data for setbacks
  SELECT 
    COALESCE((setbacks->>'front')::numeric, front_setback) AS front,
    COALESCE((setbacks->>'side')::numeric, side_setback) AS side,
    COALESCE((setbacks->>'rear')::numeric, rear_setback) AS rear
  INTO zoning_data
  FROM planner_zoning
  WHERE parcel_id = p_ogc_fid::text
  LIMIT 1;

  -- Use zoning setbacks if available, otherwise use defaults
  IF zoning_data IS NOT NULL THEN
    front_setback := zoning_data.front;
    side_setback := zoning_data.side;
    rear_setback := zoning_data.rear;
  END IF;

  -- Convert setbacks from feet to meters for ST_Buffer
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer
  -- Use the largest setback to ensure compliance
  buildable_geom := ST_Buffer(parcel_geom, -GREATEST(front_setback, side_setback, rear_setback));

  -- For now, use buildable_geom as final_geom (no easements)
  final_geom := buildable_geom;
  easement_count := 0;

  -- Determine edge types (simplified - assumes rectangular parcel)
  edge_types := jsonb_build_object(
    'front', true,
    'side', true, 
    'rear', true,
    'easement', easement_count > 0
  );

  -- Record applied setbacks
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,  -- convert back to feet
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- Return results
  RETURN QUERY
  SELECT 
    p_ogc_fid,
    ST_MakeValid(final_geom) AS buildable_geom,
    ROUND(ST_Area(final_geom) * 10.7639, 0) AS area_sqft,  -- convert m² to ft²
    edge_types,
    setbacks_applied,
    easement_count;
END $$;

-- Step 7: Create score_pad function
CREATE OR REPLACE FUNCTION public.score_pad(
  p_parcel_id text,
  p_pad_3857 geometry,
  p_parking_3857 geometry
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  env geometry := public.get_buildable_envelope(p_parcel_id);
  pad_sf numeric := ST_Area(p_pad_3857) * 10.7639;
  env_sf numeric := NULLIF(ST_Area(env) * 10.7639, 0);
  far_max numeric := (SELECT far_max FROM planner_zoning WHERE parcel_id = p_parcel_id LIMIT 1);
  pratio  numeric := (SELECT parking_ratio FROM planner_zoning WHERE parcel_id = p_parcel_id LIMIT 1);
  far_ok boolean := CASE WHEN far_max IS NULL OR env_sf IS NULL THEN true ELSE pad_sf <= far_max * env_sf END;
  coverage numeric := CASE WHEN env_sf IS NULL THEN 0 ELSE pad_sf / env_sf END;
  stalls int := COALESCE((SELECT count(*) FROM ST_Dump(p_parking_3857)), 0);
  stalls_needed numeric := CASE WHEN pratio IS NULL THEN 0 ELSE (pad_sf/1000.0) * pratio END;
  parking_ok boolean := stalls >= stalls_needed;
  envelope_ok boolean := ST_CoveredBy(p_pad_3857, env);
  score numeric;
BEGIN
  score := (CASE WHEN far_ok THEN 0.4 ELSE 0 END)
         + (CASE WHEN parking_ok THEN 0.3 ELSE 0 END)
         + (CASE WHEN envelope_ok THEN 0.2 ELSE 0 END)
         + GREATEST(0, 0.1 - ABS(coverage - 0.35));
  RETURN jsonb_build_object(
    'pad_sf', ROUND(pad_sf,0),
    'env_sf', ROUND(COALESCE(env_sf,0),0),
    'coverage', ROUND(coverage,3),
    'stalls', stalls,
    'stalls_needed', CEIL(stalls_needed),
    'far_ok', far_ok,
    'parking_ok', parking_ok,
    'envelope_ok', envelope_ok,
    'score', ROUND(score,3)
  );
END $$;

-- Step 8: Create get_parcel_detail function
CREATE OR REPLACE FUNCTION public.get_parcel_detail(p_parcel_id text)
RETURNS TABLE(
  parcel_id text,
  geom geometry,
  base text,
  far_max numeric,
  height_max_ft numeric,
  setbacks jsonb,
  envelope geometry,
  metrics jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.parcel_id,
    j.geom,
    j.base,
    j.far_max,
    j.height_max_ft,
    j.setbacks,
    public.get_buildable_envelope(j.parcel_id) AS envelope,
    public.score_pad(j.parcel_id, public.get_buildable_envelope(j.parcel_id), NULL) AS metrics
  FROM planner_join j
  WHERE j.parcel_id = p_parcel_id
  LIMIT 1;
END $$;

-- Step 9: Create spatial indexes
CREATE INDEX IF NOT EXISTS gix_parcels_wkb4326 ON public.parcels USING gist (wkb_geometry_4326);
CREATE INDEX IF NOT EXISTS gix_zoning_geom ON public.zoning USING gist (geom);

-- Step 10: Test the functions
SELECT 'Testing get_parcel_buildable_envelope...' AS status;
SELECT * FROM get_parcel_buildable_envelope(661807) LIMIT 1;

SELECT 'Testing get_buildable_envelope...' AS status;
SELECT public.get_buildable_envelope('661807') AS envelope;

SELECT 'Testing get_parcel_detail...' AS status;
SELECT * FROM get_parcel_detail('661807') LIMIT 1;

SELECT 'Deployment completed successfully!' AS status;


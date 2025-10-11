-- ============================================================================
-- COMPLETE PLANNER SYSTEM DEPLOYMENT
-- Deploy in this exact order as specified in requirements
-- ============================================================================

-- 1) BASE TABLES / VIEWS
-- ============================================================================

-- 1.1 planner_parcels view (drop dependencies first)
DROP VIEW IF EXISTS planner_join CASCADE;
DROP VIEW IF EXISTS planner_parcels CASCADE;
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

-- 1.2 planner_zoning view (dynamic FAR detection)
DROP VIEW IF EXISTS planner_zoning CASCADE;
DO $dynfar$
DECLARE
  dyn_far_col text;
  far_expr    text;
  sql_zoning  text;
BEGIN
  SELECT column_name INTO dyn_far_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='zoning'
    AND column_name = ANY (ARRAY[
      'effective_far','dynamic_far','calc_far','computed_far','current_far',
      'far_dynamic','far_effective','far_calc','far_current'
    ])
  ORDER BY 1 LIMIT 1;

  far_expr := CASE
    WHEN dyn_far_col IS NOT NULL THEN format('nullif(%I, '''')::numeric', dyn_far_col)
    ELSE                           'case when nullif(max_far, '''')::numeric in (-5555,-9999) then null else nullif(max_far, '''')::numeric end'
  END;

  sql_zoning := format($f$
    CREATE VIEW planner_zoning AS
    SELECT
      geoid::text AS parcel_id,
      zoning      AS base,
      %s          AS far_max,
      CASE WHEN nullif(max_building_height_ft,'')::numeric in (-5555,-9999) THEN null
           ELSE nullif(max_building_height_ft,'')::numeric END AS height_max_ft,
      jsonb_build_object(
        'front', CASE WHEN nullif(min_front_setback_ft,'')::numeric in (-5555,-9999) THEN null ELSE nullif(min_front_setback_ft,'')::numeric END,
        'side',  CASE WHEN nullif(min_side_setback_ft,'')::numeric  in (-5555,-9999) THEN null ELSE nullif(min_side_setback_ft,'')::numeric  END,
        'rear',  CASE WHEN nullif(min_rear_setback_ft,'')::numeric  in (-5555,-9999) THEN null ELSE nullif(min_rear_setback_ft,'')::numeric  END
      ) AS setbacks,
      null::numeric AS parking_ratio,
      zoning_description, zoning_type, zoning_subtype, zoning_code_link, permitted_land_uses
    FROM public.zoning;
  $f$, far_expr);

  EXECUTE sql_zoning;
END
$dynfar$ LANGUAGE plpgsql;

-- 1.3 planner_join view
DROP VIEW IF EXISTS planner_join CASCADE;
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

-- 2) GEOMETRY HELPERS + SCORING
-- ============================================================================

-- 2.1 get_buildable_envelope function
DROP FUNCTION IF EXISTS public.get_buildable_envelope(text);
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

-- 2.2 score_pad function (exact parameter names as specified)
DROP FUNCTION IF EXISTS public.score_pad(text, geometry, geometry);
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
  env_sf numeric := nullif(ST_Area(env) * 10.7639, 0);

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
         + GREATEST(0, 0.1 - abs(coverage - 0.35));

  RETURN jsonb_build_object(
    'pad_sf', round(pad_sf,0),
    'env_sf', round(COALESCE(env_sf,0),0),
    'coverage', round(coverage,3),
    'stalls', stalls,
    'stalls_needed', ceil(stalls_needed),
    'far_ok', far_ok,
    'parking_ok', parking_ok,
    'envelope_ok', envelope_ok,
    'score', round(score,3)
  );
END $$;

-- 2.3 get_parcel_detail function
DROP FUNCTION IF EXISTS public.get_parcel_detail(text);
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
    public.score_pad(j.parcel_id, public.get_buildable_envelope(j.parcel_id), null) AS metrics
  FROM planner_join j
  WHERE j.parcel_id = p_parcel_id
  LIMIT 1;
END $$;

-- 3) CANONICAL ENVELOPE FOR UI
-- ============================================================================

-- 3.1 get_parcel_geometry_3857 (ONE version only - canonical signature)
DROP FUNCTION IF EXISTS public.get_parcel_geometry_3857(int);
CREATE OR REPLACE FUNCTION public.get_parcel_geometry_3857(p_ogc_fid int)
RETURNS TABLE(
  ogc_fid int,
  address text,
  sqft numeric,
  geometry_3857 geometry,       -- SRID 3857
  bounds_3857 jsonb,            -- [minX,minY,maxX,maxY]
  centroid_x numeric,
  centroid_y numeric,
  perimeter_ft numeric
) LANGUAGE sql STABLE AS $$
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
    ST_X(ST_Centroid(ST_Transform(p.wkb_geometry_4326, 3857)))::numeric AS centroid_x,
    ST_Y(ST_Centroid(ST_Transform(p.wkb_geometry_4326, 3857)))::numeric AS centroid_y,
    ROUND(ST_Perimeter(ST_Transform(p.wkb_geometry_4326, 3857)) * 3.28084)::numeric AS perimeter_ft
  FROM public.parcels p
  WHERE p.ogc_fid = p_ogc_fid
  LIMIT 1;
$$;

-- 3.2 get_parcel_buildable_envelope (ONE version only - canonical signature)
DROP FUNCTION IF EXISTS public.get_parcel_buildable_envelope(int);
CREATE OR REPLACE FUNCTION public.get_parcel_buildable_envelope(p_ogc_fid int)
RETURNS TABLE(
  ogc_fid int,
  buildable_geom geometry,      -- 3857 polygon after setbacks/easements
  area_sqft numeric,
  edge_types jsonb,             -- {front:..., side:..., rear:...}
  setbacks_applied jsonb,       -- {front,side,rear} in feet
  easements_removed int
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
  -- 1) fetch parcel geom (3857)
  SELECT ST_Transform(p.wkb_geometry_4326, 3857), p.geoid::text 
  INTO parcel_geom, parcel_geoid
  FROM public.parcels p
  WHERE p.ogc_fid = p_ogc_fid
  LIMIT 1;
  
  IF parcel_geom IS NULL THEN
    RETURN QUERY SELECT 
      p_ogc_fid, NULL::geometry, 0::numeric, '{}'::jsonb, '{}'::jsonb, 0;
    RETURN;
  END IF;

  -- 2) derive setbacks from planner_zoning (fallback defaults)
  -- TODO: Re-implement zoning lookup when planner_zoning is available
  -- For now, use default setbacks
  front_setback := front_setback / 3.28084;  -- Convert feet to meters
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- 3) ST_Buffer negative by the controlling setback, ST_Difference easements
  buildable_geom := ST_Buffer(parcel_geom, -GREATEST(front_setback, side_setback, rear_setback));
  final_geom := buildable_geom;
  
  -- TODO: Implement easement removal with ST_Difference
  easement_count := 0;

  -- 4) build edge_types + setbacks_applied
  edge_types := jsonb_build_object(
    'front', true,
    'side', true,
    'rear', true,
    'easement', easement_count > 0
  );
  
  setbacks_applied := jsonb_build_object(
    'front', front_setback * 3.28084,  -- Convert back to feet for reporting
    'side', side_setback * 3.28084,
    'rear', rear_setback * 3.28084
  );

  -- 5) RETURN QUERY
  RETURN QUERY
  SELECT 
    p_ogc_fid, 
    ST_MakeValid(final_geom) AS buildable_geom, 
    ROUND((ST_Area(final_geom) * 10.7639)::numeric, 0) AS area_sqft,
    edge_types, 
    setbacks_applied, 
    easement_count;
END $$;

-- 4) INDEXES LAST
-- ============================================================================

-- 4.1 Indexes on underlying tables (views cannot have indexes)
-- Indexes on public.parcels (underlying table for planner_parcels)
CREATE INDEX IF NOT EXISTS idx_parcels_geoid ON public.parcels(geoid);
CREATE INDEX IF NOT EXISTS idx_parcels_ogc_fid ON public.parcels(ogc_fid);
CREATE INDEX IF NOT EXISTS idx_parcels_geom_4326 ON public.parcels USING GIST(wkb_geometry_4326);
CREATE INDEX IF NOT EXISTS idx_parcels_geom ON public.parcels USING GIST(wkb_geometry);

-- Indexes on public.zoning (underlying table for planner_zoning)
CREATE INDEX IF NOT EXISTS idx_zoning_geoid ON public.zoning(geoid);
CREATE INDEX IF NOT EXISTS idx_zoning_zoning ON public.zoning(zoning);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_parcel_geometry_3857(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parcel_buildable_envelope(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_buildable_envelope(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_pad(text, geometry, geometry) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parcel_detail(text) TO anon, authenticated;

-- ============================================================================
-- DEPLOYMENT COMPLETE
-- ============================================================================

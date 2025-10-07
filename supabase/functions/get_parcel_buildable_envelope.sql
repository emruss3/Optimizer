-- =====================================================
-- RPC: get_parcel_buildable_envelope(ogc_fid int)
-- =====================================================
-- Returns buildable geometry with setbacks and easements applied
-- This is the geometry backbone for the site planner

drop function if exists public.get_parcel_buildable_envelope(int);
create or replace function public.get_parcel_buildable_envelope(p_ogc_fid int)
returns table(
  ogc_fid int,
  buildable_geom geometry,
  area_sqft numeric,
  edge_types jsonb,
  setbacks_applied jsonb,
  easements_removed int
) 
language plpgsql 
stable 
security definer 
set search_path=public 
as $$
declare
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
begin
  -- Get parcel geometry
  select geom into parcel_geom
  from planner_parcels
  where parcel_id = p_ogc_fid::text
  limit 1;

  if parcel_geom is null then
    raise exception 'Parcel % not found in planner_parcels', p_ogc_fid;
  end if;

  -- Get zoning data for setbacks
  select 
    coalesce((setbacks->>'front')::numeric, front_setback) as front,
    coalesce((setbacks->>'side')::numeric, side_setback) as side,
    coalesce((setbacks->>'rear')::numeric, rear_setback) as rear
  into zoning_data
  from planner_zoning
  where parcel_id = p_ogc_fid::text
  limit 1;

  -- Use zoning setbacks if available, otherwise use defaults
  if zoning_data is not null then
    front_setback := zoning_data.front;
    side_setback := zoning_data.side;
    rear_setback := zoning_data.rear;
  end if;

  -- Convert setbacks from feet to meters for ST_Buffer
  front_setback := front_setback / 3.28084;
  side_setback := side_setback / 3.28084;
  rear_setback := rear_setback / 3.28084;

  -- Apply setbacks using negative buffer
  -- Use the largest setback to ensure compliance
  buildable_geom := ST_Buffer(parcel_geom, -greatest(front_setback, side_setback, rear_setback));

  -- Handle easements (if easement table exists)
  -- This is a placeholder - implement based on your easement data structure
  /*
  with easements as (
    select ST_Union(geom) as easement_geom
    from easements 
    where ST_Intersects(geom, parcel_geom)
  )
  select 
    ST_Difference(buildable_geom, easement_geom) as final_geom,
    (select count(*) from easements where ST_Intersects(geom, parcel_geom)) as easement_count
  into final_geom, easement_count
  from easements;
  */

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
  return query
  select 
    p_ogc_fid,
    ST_MakeValid(final_geom) as buildable_geom,
    round(ST_Area(final_geom) * 10.7639, 0) as area_sqft,  -- convert m² to ft²
    edge_types,
    setbacks_applied,
    easement_count;
end $$;
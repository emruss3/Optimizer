-- Stage-1/2 representation contract.
--
-- fn_site_skeleton_v2 emits authoritative structures[] for both frontage and
-- landlocked/easement parcels. Frontage legs are welded into one structure
-- polygon instead of being discarded as separate point-touching parts.
-- fn_seed_parking now carries that structure contract through its RPC on both
-- parcel classes; landlocked lots return the structure plus an explicit
-- easement-parking refinement receipt rather than an empty v1 early return.

create or replace function public.fn_site_skeleton_v2(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
) returns jsonb
language plpgsql
stable
set search_path=pg_catalog,public,extensions
as $function$
declare
  sk jsonb;
  leg1 geometry;
  wing geometry;
  weld geometry;
  structure geometry;
  legs_meta jsonb;
  ctx jsonb;
  envj jsonb;
  env geometry;
  up jsonb;
  mb jsonb;
  obb geometry;
  ring geometry;
  e1 double precision;
  e2 double precision;
  ax double precision;
  bar_depth numeric;
  need_ft numeric;
  bar_len numeric;
  cx double precision;
  cy double precision;
  dx double precision;
  dy double precision;
  bar geometry;
  barc geometry;
  ret numeric;
  entry geometry;
  spine geometry;
  spine_end geometry;
  p geometry[];
  l12 double precision;
  l23 double precision;
begin
  sk := public.fn_site_skeleton(p_ogc_fid,p_typology);
  if sk ? 'error' then return sk; end if;

  if (sk->>'skeleton')='landlocked_court_scheme' then
    ctx := public.fn_resolve_design_context(p_ogc_fid,p_typology);
    envj := public.fn_directional_envelope(
      p_ogc_fid,
      coalesce((ctx#>>'{setbacks,front,value}')::numeric,20),
      coalesce((ctx#>>'{setbacks,side,value}')::numeric,5),
      coalesce((ctx#>>'{setbacks,rear,value}')::numeric,20)
    );
    env := ST_SetSRID(ST_GeomFromGeoJSON((envj->'geom_2274')::text),2274);
    up := public.fn_unit_program(p_typology);
    bar_depth := coalesce((up->>'implied_bar_depth_ft')::numeric,67.3);
    mb := public.fn_max_buildout(p_ogc_fid,p_typology);
    need_ft := (mb->>'max_gsf')::numeric
      / greatest((mb#>>'{program_frontier,gsf_max_option,stories}')::numeric,1)
      / bar_depth;

    obb := ST_OrientedEnvelope(env);
    ring := ST_ExteriorRing(obb);
    p := array[ST_PointN(ring,1),ST_PointN(ring,2),ST_PointN(ring,3)];
    l12 := ST_Distance(p[1],p[2]);
    l23 := ST_Distance(p[2],p[3]);
    if l12>=l23 then
      ax:=ST_Azimuth(p[1],p[2]); e1:=l12; e2:=l23;
    else
      ax:=ST_Azimuth(p[2],p[3]); e1:=l23; e2:=l12;
    end if;

    cx:=ST_X(ST_Centroid(obb));
    cy:=ST_Y(ST_Centroid(obb));
    dx:=sin(ax);
    dy:=cos(ax);
    bar_len:=least(need_ft,e1-30,280);
    bar:=ST_MakePolygon(ST_MakeLine(array[
      ST_SetSRID(ST_MakePoint(cx-dx*bar_len/2-dy*bar_depth/2,cy-dy*bar_len/2+dx*bar_depth/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*bar_len/2-dy*bar_depth/2,cy+dy*bar_len/2+dx*bar_depth/2),2274),
      ST_SetSRID(ST_MakePoint(cx+dx*bar_len/2+dy*bar_depth/2,cy+dy*bar_len/2-dx*bar_depth/2),2274),
      ST_SetSRID(ST_MakePoint(cx-dx*bar_len/2+dy*bar_depth/2,cy-dy*bar_len/2-dx*bar_depth/2),2274),
      ST_SetSRID(ST_MakePoint(cx-dx*bar_len/2-dy*bar_depth/2,cy-dy*bar_len/2+dx*bar_depth/2),2274)
    ]));
    barc:=ST_CollectionExtract(ST_Intersection(bar,env),3);
    select d.geom into barc
    from (select (ST_Dump(barc)).geom) d
    order by ST_Area(d.geom) desc
    limit 1;
    ret:=case when ST_Area(bar)>0
      then round((100*ST_Area(barc)/ST_Area(bar))::numeric,1)
      else 0 end;

    -- The easement is assumed at one principal-axis end. Stop the centerline
    -- just outside the bar: the solver widens it to an aisle and refines the
    -- parking field without ever drawing a road through the structure.
    entry:=ST_SetSRID(ST_MakePoint(
      cx-dx*greatest(e1/2-2,bar_len/2+8),
      cy-dy*greatest(e1/2-2,bar_len/2+8)
    ),2274);
    spine_end:=ST_SetSRID(ST_MakePoint(
      cx-dx*(bar_len/2+4),
      cy-dy*(bar_len/2+4)
    ),2274);
    spine:=ST_CollectionExtract(ST_Intersection(
      env,ST_Buffer(ST_MakeLine(entry,spine_end),0.01,'endcap=flat')
    ),2);
    if spine is null or ST_IsEmpty(spine) then
      spine:=ST_MakeLine(entry,spine_end);
    else
      spine:=ST_LineMerge(ST_Boundary(spine));
      if ST_GeometryType(spine)<>'ST_LineString' then
        spine:=ST_MakeLine(entry,spine_end);
      end if;
    end if;

    return sk || jsonb_build_object(
      'structures',jsonb_build_array(jsonb_build_object(
        'structure_id',1,
        'geom_2274',ST_AsGeoJSON(barc)::jsonb,
        'footprint_sqft',round(ST_Area(barc)),
        'bar_length_ft',round(bar_len),
        'bar_depth_ft',bar_depth,
        'envelope_retention_pct',ret,
        'is_single_polygon',(ST_GeometryType(barc)='ST_Polygon')
      )),
      'structure_count',1,
      'skeleton_v2',jsonb_build_object(
        'entry_2274',ST_AsGeoJSON(entry)::jsonb,
        'spine_2274',ST_AsGeoJSON(spine)::jsonb,
        'spine_axis_deg',round(degrees(ax)::numeric,1),
        'access_mode','easement_assumed',
        'easement_assumed',true,
        'basis','principal-axis structure for landlocked/easement lot; access approaches one axis end'
      ),
      'flags',coalesce(sk->'flags','[]'::jsonb)
        || jsonb_build_array(
          'site_skeleton_v2_structures_authoritative_v1',
          'landlocked_access_via_easement_assumed'
        ),
      'note_v2','GATE ON structures[]. Landlocked parcels use the principal-axis structure, never improvised fragments.'
    );
  end if;

  leg1:=ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{seed,leg1,geom_2274}')::text),2274);
  begin
    wing:=ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{seed,wing,geom_2274}')::text),2274);
  exception when others then
    wing:=null;
  end;

  if wing is not null and not ST_IsEmpty(wing) then
    -- The two legal legs meet at a corner. Polygon union treats point-touching
    -- pieces as a MultiPolygon, so a sub-square-foot weld makes their intended
    -- single structure explicit without changing the design dimensions.
    weld:=ST_Buffer(ST_ClosestPoint(leg1,wing),0.75);
    structure:=ST_CollectionExtract(ST_MakeValid(
      ST_UnaryUnion(ST_Collect(array[leg1,wing,weld]))
    ),3);
  else
    structure:=leg1;
  end if;

  legs_meta:=jsonb_build_array(
    (sk#>'{seed,leg1}')::jsonb-'geom_2274',
    coalesce((sk#>'{seed,wing}')::jsonb-'geom_2274','null'::jsonb)
  );

  return sk || jsonb_build_object(
    'structures',jsonb_build_array(jsonb_build_object(
      'structure_id',1,
      'geom_2274',ST_AsGeoJSON(structure)::jsonb,
      'footprint_sqft',round(ST_Area(structure)),
      'legs_meta',legs_meta,
      'is_single_polygon',(
        ST_GeometryType(structure)='ST_Polygon'
        and ST_NumGeometries(structure)=1
      )
    )),
    'structure_count',1,
    'skeleton_v2',coalesce(sk->'skeleton','{}'::jsonb) || jsonb_build_object(
      'access_mode','verified_frontage',
      'easement_assumed',false,
      'basis','frontage seed legs welded into one authoritative structure polygon'
    ),
    'flags',coalesce(sk->'flags','[]'::jsonb)
      || jsonb_build_array(
        'site_skeleton_v2_structures_authoritative_v1',
        'site_skeleton_v2_structure_union_weld_v1'
      ),
    'note_v2','GATE ON structures[], not separate seed legs.'
  );
end
$function$;

create or replace function public.fn_seed_parking(
  p_ogc_fid integer,
  p_typology text default 'multifamily'::text
) returns jsonb
language plpgsql
stable
set search_path=pg_catalog,public,extensions
as $function$
declare
  sk jsonb;
  mb jsonb;
  rear geometry;
  spine geometry;
  structures_u geometry;
  stalls_needed integer;
  nx double precision;
  ny double precision;
  az double precision;
  ex double precision;
  ey double precision;
  ux double precision;
  uy double precision;
  row_len numeric;
  rows_needed integer;
  i integer;
  module numeric:=60;
  stall_pitch numeric:=9;
  bay geometry;
  bays jsonb:='[]'::jsonb;
  achieved integer:=0;
  a double precision;
  b double precision;
  lo double precision;
  hi double precision;
begin
  sk:=public.fn_site_skeleton_v2(p_ogc_fid,p_typology);
  if sk ? 'error' then return sk; end if;
  mb:=public.fn_max_buildout(p_ogc_fid,p_typology);
  stalls_needed:=coalesce((mb->>'stalls_required_at_max')::integer,100);

  select ST_UnaryUnion(ST_Collect(
    ST_SetSRID(ST_GeomFromGeoJSON((s->'geom_2274')::text),2274)
  )) into structures_u
  from jsonb_array_elements(coalesce(sk->'structures','[]'::jsonb)) s;

  if (sk->>'skeleton')='landlocked_court_scheme' then
    return sk || jsonb_build_object(
      'parking_seed',jsonb_build_object(
        'stalls_target',stalls_needed,
        'stalls_achieved_est',0,
        'coverage_of_target_pct',0,
        'bays','[]'::jsonb,
        'access_mode','easement_assumed',
        'basis','authoritative landlocked structure supplied; solver fits stalls from the easement spine without changing composition'
      )
    );
  end if;

  rear:=ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{skeleton,rear_zone_2274}')::text),2274);
  spine:=ST_SetSRID(ST_GeomFromGeoJSON((sk#>'{skeleton,spine_2274}')::text),2274);
  if rear is null or ST_IsEmpty(rear) then
    return sk || jsonb_build_object(
      'parking_seed',jsonb_build_object(
        'stalls_target',stalls_needed,
        'stalls_achieved_est',0,
        'coverage_of_target_pct',0,
        'bays','[]'::jsonb,
        'note','no rear zone'
      )
    );
  end if;

  az:=ST_Azimuth(ST_StartPoint(spine),ST_EndPoint(spine));
  nx:=sin(az); ny:=cos(az);
  ux:=sin(az+pi()/2); uy:=cos(az+pi()/2);
  ex:=ST_X(ST_EndPoint(spine)); ey:=ST_Y(ST_EndPoint(spine));

  select min((ST_X(p.geom)-ex)*ux+(ST_Y(p.geom)-ey)*uy),
         max((ST_X(p.geom)-ex)*ux+(ST_Y(p.geom)-ey)*uy)
    into lo,hi
  from ST_DumpPoints(rear) p;
  row_len:=greatest(60,least(hi-lo,500));
  rows_needed:=least(6,greatest(1,ceil(
    stalls_needed::numeric/greatest(floor(2*row_len/stall_pitch),1)
  )::integer));

  for i in 0..rows_needed-1 loop
    a:=ex+nx*(i*(module+4))+ux*((lo+hi)/2);
    b:=ey+ny*(i*(module+4))+uy*((lo+hi)/2);
    bay:=ST_MakePolygon(ST_MakeLine(array[
      ST_SetSRID(ST_MakePoint(a-ux*row_len/2,b-uy*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(a+ux*row_len/2,b+uy*row_len/2),2274),
      ST_SetSRID(ST_MakePoint(a+ux*row_len/2+nx*module,b+uy*row_len/2+ny*module),2274),
      ST_SetSRID(ST_MakePoint(a-ux*row_len/2+nx*module,b-uy*row_len/2+ny*module),2274),
      ST_SetSRID(ST_MakePoint(a-ux*row_len/2,b-uy*row_len/2),2274)
    ]));
    bay:=ST_CollectionExtract(ST_Intersection(bay,rear),3);
    if structures_u is not null and not ST_IsEmpty(structures_u) then
      bay:=ST_CollectionExtract(ST_Difference(bay,ST_Buffer(structures_u,5)),3);
    end if;
    if bay is not null and not ST_IsEmpty(bay) and ST_Area(bay)>2000 then
      achieved:=achieved+floor(2*(ST_Area(bay)/module)/stall_pitch)::integer;
      bays:=bays || jsonb_build_object(
        'row',i+1,
        'geom_2274',ST_AsGeoJSON(bay)::jsonb,
        'area_sqft',round(ST_Area(bay))
      );
    end if;
    exit when achieved>=stalls_needed;
  end loop;

  return sk || jsonb_build_object(
    'parking_seed',jsonb_build_object(
      'stalls_target',stalls_needed,
      'stalls_achieved_est',achieved,
      'coverage_of_target_pct',round(100.0*achieved/greatest(stalls_needed,1)),
      'bays',bays,
      'access_mode','verified_frontage',
      'basis','double-loaded 60ft modules off the spine, clipped clear of authoritative structures; solver refines islands/ADA/edges'
    )
  );
end
$function$;

comment on function public.fn_site_skeleton_v2(integer,text) is
  'Stage-1/2 authoritative structure seed for frontage and landlocked/easement parcels. structures[] is the solver/render contract; separate legs are metadata only.';

comment on function public.fn_seed_parking(integer,text) is
  'Stage-1/2 seed RPC carrying fn_site_skeleton_v2.structures[] on both access classes plus frontage parking rows or an explicit landlocked parking-refinement receipt.';

notify pgrst,'reload schema';

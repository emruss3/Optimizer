-- Target-sized constructive parking for authoritative structures.
--
-- Evaluate complete one-to-eight-module rear-field families. Each family:
--   1. starts from the reserved side spine plus the entry-connected drive root;
--   2. places double-loaded rows behind the structure;
--   3. exhausts collector -> dogleg -> shared-axis routing;
--   4. clips parking from structures and circulation;
--   5. proves I-1, one drive component, and the impervious cap.
-- Return the smallest family meeting the placed-unit stall target, or the
-- highest-stall legal family when the target is genuinely constrained.

create or replace function public.fn_mf_refill_structure_seed_parking(
  p_envelope geometry,
  p_buildings geometry,
  p_drives geometry,
  p_parking geometry,
  p_spine_x numeric,
  p_target_stalls integer,
  p_stall_w numeric,
  p_stall_d numeric,
  p_aisle numeric,
  p_footprint_sqft numeric,
  p_max_impervious_sqft numeric default null
) returns table(
  out_drives geometry,
  out_parking geometry,
  out_stalls integer,
  out_modules_added integer
)
language plpgsql
immutable
set search_path=pg_catalog,public,extensions
as $function$
declare
  v_spine geometry;
  v_existing_clear geometry;
  v_entry_root geometry;
  v_base_drives geometry;
  v_base_parking geometry;
  v_aisles geometry;
  v_rows geometry;
  v_aisle_piece geometry;
  v_row_piece geometry;
  v_candidate_drives geometry;
  v_candidate_parking geometry;
  v_best_drives geometry;
  v_best_parking geometry;
  v_building_clear geometry;
  v_xmin numeric:=ST_XMin(p_envelope);
  v_xmax numeric:=ST_XMax(p_envelope);
  v_ymin numeric:=ST_YMin(p_envelope);
  v_ymax numeric:=ST_YMax(p_envelope);
  v_mid_x numeric;
  v_x0 numeric;
  v_x1 numeric;
  v_start_y numeric;
  v_module_depth numeric;
  v_module_pitch numeric;
  v_max_modules integer;
  v_modules integer;
  v_m integer;
  v_components integer;
  v_stalls integer:=0;
  v_best_stalls integer:=0;
  v_impervious numeric;
  v_best_impervious numeric:=1e30;
  v_route_budget numeric;
  v_i1 jsonb;
begin
  v_module_depth:=2*p_stall_d+p_aisle;
  v_module_pitch:=v_module_depth+4;
  v_mid_x:=(v_xmin+v_xmax)/2;
  v_building_clear:=case
    when p_buildings is null or ST_IsEmpty(p_buildings) then null
    else ST_Buffer(p_buildings,5)
  end;

  -- Full authoritative side spine. Stage-3 has already reserved this strip.
  v_spine:=ST_CollectionExtract(ST_Intersection(
    p_envelope,
    ST_MakeEnvelope(
      p_spine_x-p_aisle/2,v_ymin,
      p_spine_x+p_aisle/2,v_ymax,
      ST_SRID(p_envelope)
    )
  ),3);
  if p_buildings is not null and not ST_IsEmpty(p_buildings) then
    v_spine:=ST_CollectionExtract(
      ST_Difference(v_spine,ST_Buffer(p_buildings,0.05)),3
    );
  end if;
  if v_spine is null or ST_IsEmpty(v_spine) then
    return query select p_drives,p_parking,0,0;
    return;
  end if;

  -- Preserve only existing drive geometry tied to the entry/spine root; remote
  -- islands are deliberately not inherited by the constructive field.
  if p_drives is not null and not ST_IsEmpty(p_drives) then
    v_existing_clear:=ST_CollectionExtract(
      ST_Difference(
        p_drives,
        case when p_buildings is null or ST_IsEmpty(p_buildings)
          then ST_GeomFromText('POLYGON EMPTY',ST_SRID(p_envelope))
          else ST_Buffer(p_buildings,0.05) end
      ),3);
    select ST_UnaryUnion(ST_Collect(q.geom)) into v_entry_root
    from (select (ST_Dump(v_existing_clear)).geom) q
    where ST_DWithin(q.geom,v_spine,0.50);
  end if;

  v_base_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
    ST_Buffer(v_spine,0.05),
    case when v_entry_root is null then null else ST_Buffer(v_entry_root,0.05) end
  ])),3);
  if v_base_drives is null or ST_IsEmpty(v_base_drives) then
    v_base_drives:=v_spine;
  end if;

  -- Existing legal parking is retained as a head start, but never controls the
  -- field geometry and can be reclaimed by new circulation.
  if p_parking is not null and not ST_IsEmpty(p_parking) then
    v_base_parking:=ST_CollectionExtract(ST_Difference(
      p_parking,
      ST_UnaryUnion(ST_Collect(array[
        case when v_building_clear is null then null else v_building_clear end,
        ST_Buffer(v_base_drives,0.05)
      ]))
    ),3);
    if v_base_parking is not null and not ST_IsEmpty(v_base_parking) then
      select ST_UnaryUnion(ST_Collect(q.geom)) into v_base_parking
      from (select (ST_Dump(v_base_parking)).geom) q
      where ST_Area(q.geom)>50;
    end if;
  end if;

  v_best_drives:=v_base_drives;
  v_best_parking:=v_base_parking;
  v_best_stalls:=floor(coalesce(ST_Area(v_base_parking),0)
    /(p_stall_w*p_stall_d)*0.90)::integer;
  v_best_impervious:=p_footprint_sqft
    +coalesce(ST_Area(v_base_drives),0)
    +coalesce(ST_Area(v_base_parking),0);

  if p_spine_x<=v_mid_x then
    v_x0:=p_spine_x+p_aisle/2-0.10;
    v_x1:=v_xmax-5;
  else
    v_x0:=v_xmin+5;
    v_x1:=p_spine_x-p_aisle/2+0.10;
  end if;
  if v_x1-v_x0<54 then
    return query select v_best_drives,v_best_parking,v_best_stalls,0;
    return;
  end if;

  v_start_y:=greatest(
    v_ymin+5,
    case when p_buildings is null or ST_IsEmpty(p_buildings)
      then v_ymin+5 else ST_YMax(p_buildings)+5 end
  );
  v_max_modules:=least(
    8,
    greatest(0,floor((v_ymax-5-v_start_y-v_module_depth)/v_module_pitch)::integer+1)
  );
  if v_max_modules<1 then
    return query select v_best_drives,v_best_parking,v_best_stalls,0;
    return;
  end if;

  v_route_budget:=case when p_max_impervious_sqft is null then null
    else greatest(p_max_impervious_sqft-p_footprint_sqft,0) end;

  for v_modules in 1..v_max_modules loop
    v_aisles:=null;
    v_rows:=null;
    for v_m in 0..v_modules-1 loop
      v_aisle_piece:=ST_MakeEnvelope(
        v_x0,
        v_start_y+v_m*v_module_pitch+p_stall_d,
        v_x1,
        v_start_y+v_m*v_module_pitch+p_stall_d+p_aisle,
        ST_SRID(p_envelope)
      );
      v_row_piece:=ST_UnaryUnion(ST_Collect(array[
        ST_MakeEnvelope(
          v_x0,
          v_start_y+v_m*v_module_pitch,
          v_x1,
          v_start_y+v_m*v_module_pitch+p_stall_d,
          ST_SRID(p_envelope)
        ),
        ST_MakeEnvelope(
          v_x0,
          v_start_y+v_m*v_module_pitch+p_stall_d+p_aisle,
          v_x1,
          v_start_y+v_m*v_module_pitch+v_module_depth,
          ST_SRID(p_envelope)
        )
      ]));
      v_aisles:=case when v_aisles is null then v_aisle_piece
        else ST_UnaryUnion(ST_Collect(v_aisles,v_aisle_piece)) end;
      v_rows:=case when v_rows is null then v_row_piece
        else ST_UnaryUnion(ST_Collect(v_rows,v_row_piece)) end;
    end loop;

    v_aisles:=ST_CollectionExtract(ST_Intersection(p_envelope,v_aisles),3);
    v_rows:=ST_CollectionExtract(ST_Intersection(p_envelope,v_rows),3);
    if p_buildings is not null and not ST_IsEmpty(p_buildings) then
      v_aisles:=ST_CollectionExtract(
        ST_Difference(v_aisles,ST_Buffer(p_buildings,0.05)),3
      );
      v_rows:=ST_CollectionExtract(
        ST_Difference(v_rows,v_building_clear),3
      );
    end if;
    if v_aisles is null or ST_IsEmpty(v_aisles)
       or v_rows is null or ST_IsEmpty(v_rows) then
      continue;
    end if;

    v_candidate_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
      ST_Buffer(v_base_drives,0.05),ST_Buffer(v_aisles,0.05)
    ])),3);
    v_candidate_drives:=public.fn_mf_connect_drive_components_collector(
      v_candidate_drives,p_buildings,p_envelope,p_aisle,v_route_budget
    );
    v_candidate_drives:=public.fn_mf_connect_drive_components_dogleg(
      v_candidate_drives,p_buildings,p_envelope,p_aisle,v_route_budget
    );
    v_candidate_drives:=public.fn_mf_connect_drive_components_shared_axis(
      v_candidate_drives,p_buildings,p_envelope,p_aisle,v_route_budget
    );
    v_components:=case when v_candidate_drives is null
      or ST_IsEmpty(v_candidate_drives) then 0
      else ST_NumGeometries(ST_CollectionExtract(
        ST_UnaryUnion(v_candidate_drives),3
      )) end;
    if v_components<>1 then
      continue;
    end if;

    v_candidate_parking:=ST_CollectionExtract(ST_Difference(
      ST_UnaryUnion(ST_Collect(array[v_base_parking,v_rows])),
      ST_UnaryUnion(ST_Collect(array[
        case when v_building_clear is null then null else v_building_clear end,
        ST_Buffer(v_candidate_drives,0.05)
      ]))
    ),3);
    if v_candidate_parking is null or ST_IsEmpty(v_candidate_parking) then
      continue;
    end if;
    select ST_UnaryUnion(ST_Collect(q.geom)) into v_candidate_parking
    from (select (ST_Dump(v_candidate_parking)).geom) q
    where ST_Area(q.geom)>50;
    if v_candidate_parking is null or ST_IsEmpty(v_candidate_parking) then
      continue;
    end if;

    v_stalls:=floor(ST_Area(v_candidate_parking)
      /(p_stall_w*p_stall_d)*0.90)::integer;
    v_impervious:=p_footprint_sqft
      +ST_Area(v_candidate_drives)+ST_Area(v_candidate_parking);
    v_i1:=public.fn_mf_validate_element_disjointness(
      array[p_buildings],v_candidate_parking,v_candidate_drives,1
    );
    if not coalesce((v_i1->>'ok')::boolean,false)
       or (p_max_impervious_sqft is not null
           and v_impervious>p_max_impervious_sqft+1) then
      continue;
    end if;

    if v_stalls>=p_target_stalls then
      return query select
        v_candidate_drives,v_candidate_parking,v_stalls,v_modules;
      return;
    end if;

    if v_stalls>v_best_stalls
       or (v_stalls=v_best_stalls and v_impervious<v_best_impervious) then
      v_best_drives:=v_candidate_drives;
      v_best_parking:=v_candidate_parking;
      v_best_stalls:=v_stalls;
      v_best_impervious:=v_impervious;
    end if;
  end loop;

  return query select v_best_drives,v_best_parking,v_best_stalls,
    case when v_best_stalls>floor(coalesce(ST_Area(v_base_parking),0)
      /(p_stall_w*p_stall_d)*0.90)::integer then v_max_modules else 0 end;
end
$function$;

comment on function public.fn_mf_refill_structure_seed_parking(geometry,geometry,geometry,geometry,numeric,integer,numeric,numeric,numeric,numeric,numeric) is
  'Evaluates complete routed rear-field families and returns the smallest I-1/impervious-valid family meeting the placed-unit stall target.';

notify pgrst,'reload schema';

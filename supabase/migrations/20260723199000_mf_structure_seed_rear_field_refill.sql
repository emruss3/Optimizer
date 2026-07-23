-- Authoritative one-structure plans have a reserved side-spine strip and rear
-- parking land. Rebuild that spine through the full parking envelope, then
-- search double-loaded rear modules whose aisle overlaps the spine by a tenth
-- of a foot. Every candidate is clipped in construction order:
-- structure -> circulation -> parking, then tested for one drive component,
-- stall improvement, and the statutory impervious cap.

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
  v_drives geometry;
  v_parking geometry;
  v_spine geometry;
  v_drive_band geometry;
  v_parking_rows geometry;
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
  v_y0 numeric;
  v_start_y numeric;
  v_module_depth numeric;
  v_stalls integer:=0;
  v_candidate_stalls integer;
  v_best_stalls integer;
  v_modules integer:=0;
  v_pass integer;
  v_components integer;
  v_impervious numeric;
  v_best_impervious numeric;
begin
  v_module_depth:=2*p_stall_d+p_aisle;
  v_mid_x:=(v_xmin+v_xmax)/2;
  v_building_clear:=case
    when p_buildings is null or ST_IsEmpty(p_buildings) then null
    else ST_Buffer(p_buildings,5)
  end;

  -- Reassert the authoritative side spine across the entire parking envelope.
  -- The Stage-3 intake reserved this strip from the structure already.
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

  v_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
    case when p_drives is null then null
         else ST_Difference(p_drives,ST_Buffer(p_buildings,0.05)) end,
    v_spine
  ])),3);
  if v_drives is null or ST_IsEmpty(v_drives) then
    return query select p_drives,p_parking,0,0;
    return;
  end if;

  -- Existing parking remains only where it is clear of structures and the
  -- rebuilt connected drive network.
  v_parking:=ST_CollectionExtract(ST_Difference(
    coalesce(p_parking,ST_GeomFromText('POLYGON EMPTY',ST_SRID(p_envelope))),
    ST_UnaryUnion(ST_Collect(array[
      case when v_building_clear is null then null else v_building_clear end,
      ST_Buffer(v_drives,0.05)
    ]))
  ),3);
  if v_parking is not null and not ST_IsEmpty(v_parking) then
    select ST_UnaryUnion(ST_Collect(q.geom)) into v_parking
    from (select (ST_Dump(v_parking)).geom) q
    where ST_Area(q.geom)>50;
  end if;

  v_stalls:=floor(coalesce(ST_Area(v_parking),0)
    /(p_stall_w*p_stall_d)*0.90)::integer;

  if p_spine_x<=v_mid_x then
    v_x0:=p_spine_x+p_aisle/2-0.10;
    v_x1:=v_xmax-5;
  else
    v_x0:=v_xmin+5;
    v_x1:=p_spine_x-p_aisle/2+0.10;
  end if;
  if v_x1-v_x0<54 then
    return query select v_drives,v_parking,v_stalls,0;
    return;
  end if;

  v_start_y:=greatest(
    v_ymin+5,
    case when p_buildings is null or ST_IsEmpty(p_buildings)
      then v_ymin+5 else ST_YMax(p_buildings)+5 end
  );

  for v_pass in 1..4 loop
    exit when v_stalls>=p_target_stalls;
    v_best_drives:=null;
    v_best_parking:=null;
    v_best_stalls:=v_stalls;
    v_best_impervious:=1e30;
    v_y0:=v_start_y;

    while v_y0+v_module_depth<=v_ymax-5 loop
      v_drive_band:=ST_CollectionExtract(ST_Intersection(
        p_envelope,
        ST_MakeEnvelope(
          v_x0,v_y0+p_stall_d,
          v_x1,v_y0+p_stall_d+p_aisle,
          ST_SRID(p_envelope)
        )
      ),3);
      v_parking_rows:=ST_CollectionExtract(ST_Intersection(
        p_envelope,
        ST_UnaryUnion(ST_Collect(array[
          ST_MakeEnvelope(
            v_x0,v_y0,v_x1,v_y0+p_stall_d,ST_SRID(p_envelope)
          ),
          ST_MakeEnvelope(
            v_x0,v_y0+p_stall_d+p_aisle,
            v_x1,v_y0+v_module_depth,ST_SRID(p_envelope)
          )
        ]))
      ),3);

      if p_buildings is not null and not ST_IsEmpty(p_buildings) then
        v_drive_band:=ST_CollectionExtract(
          ST_Difference(v_drive_band,ST_Buffer(p_buildings,0.05)),3
        );
        v_parking_rows:=ST_CollectionExtract(
          ST_Difference(v_parking_rows,v_building_clear),3
        );
      end if;

      if v_drive_band is not null and not ST_IsEmpty(v_drive_band)
         and v_parking_rows is not null and not ST_IsEmpty(v_parking_rows) then
        v_candidate_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
          ST_Buffer(v_drives,0.05),ST_Buffer(v_drive_band,0.05)
        ])),3);
        v_components:=ST_NumGeometries(
          ST_CollectionExtract(ST_UnaryUnion(v_candidate_drives),3)
        );

        if v_components=1 then
          v_candidate_parking:=ST_CollectionExtract(ST_Difference(
            ST_UnaryUnion(ST_Collect(array[v_parking,v_parking_rows])),
            ST_UnaryUnion(ST_Collect(array[
              case when v_building_clear is null then null else v_building_clear end,
              ST_Buffer(v_candidate_drives,0.05)
            ]))
          ),3);
          if v_candidate_parking is not null
             and not ST_IsEmpty(v_candidate_parking) then
            select ST_UnaryUnion(ST_Collect(q.geom)) into v_candidate_parking
            from (select (ST_Dump(v_candidate_parking)).geom) q
            where ST_Area(q.geom)>50;
          end if;

          v_candidate_stalls:=floor(coalesce(ST_Area(v_candidate_parking),0)
            /(p_stall_w*p_stall_d)*0.90)::integer;
          v_impervious:=p_footprint_sqft
            +coalesce(ST_Area(v_candidate_drives),0)
            +coalesce(ST_Area(v_candidate_parking),0);

          if v_candidate_stalls>v_best_stalls
             and (p_max_impervious_sqft is null
                  or v_impervious<=p_max_impervious_sqft+1)
             and coalesce((public.fn_mf_validate_element_disjointness(
               array[p_buildings],v_candidate_parking,v_candidate_drives,1
             )->>'ok')::boolean,false) then
            v_best_drives:=v_candidate_drives;
            v_best_parking:=v_candidate_parking;
            v_best_stalls:=v_candidate_stalls;
            v_best_impervious:=v_impervious;
          elsif v_candidate_stalls=v_best_stalls
                and v_candidate_stalls>v_stalls
                and v_impervious<v_best_impervious
                and (p_max_impervious_sqft is null
                     or v_impervious<=p_max_impervious_sqft+1)
                and coalesce((public.fn_mf_validate_element_disjointness(
                  array[p_buildings],v_candidate_parking,v_candidate_drives,1
                )->>'ok')::boolean,false) then
            v_best_drives:=v_candidate_drives;
            v_best_parking:=v_candidate_parking;
            v_best_impervious:=v_impervious;
          end if;
        end if;
      end if;

      v_y0:=v_y0+10;
    end loop;

    exit when v_best_drives is null or v_best_stalls<=v_stalls;
    v_drives:=v_best_drives;
    v_parking:=v_best_parking;
    v_stalls:=v_best_stalls;
    v_modules:=v_modules+1;
  end loop;

  return query select v_drives,v_parking,v_stalls,v_modules;
end
$function$;

comment on function public.fn_mf_refill_structure_seed_parking(geometry,geometry,geometry,geometry,numeric,integer,numeric,numeric,numeric,numeric,numeric) is
  'Rebuilds a full side spine, then chooses connected rear double-loaded modules under I-1 and impervious constraints for authoritative structure seeds.';

notify pgrst,'reload schema';

-- Construction order is structure → circulation → parking. The first refill
-- implementation incorrectly treated existing parking as an obstacle to a new
-- drive connector, preventing the side spine from extending into the rear
-- field. Allow circulation to reclaim that strip, then clip and recount all
-- parking against the connected drive network.

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
  v_drives geometry:=ST_CollectionExtract(ST_UnaryUnion(p_drives),3);
  v_parking geometry:=ST_CollectionExtract(ST_UnaryUnion(p_parking),3);
  v_drive_candidate geometry;
  v_parking_candidate geometry;
  v_connector geometry;
  v_new_drives geometry;
  v_new_parking geometry;
  v_building_obstacle geometry;
  v_xmin numeric:=ST_XMin(p_envelope);
  v_xmax numeric:=ST_XMax(p_envelope);
  v_ymin numeric:=ST_YMin(p_envelope);
  v_ymax numeric:=ST_YMax(p_envelope);
  v_x0 numeric;
  v_y0 numeric;
  v_len numeric;
  v_desired_len numeric;
  v_missing integer;
  v_stalls integer:=0;
  v_new_stalls integer;
  v_modules integer:=0;
  v_module_index integer;
  v_found boolean;
  v_impervious numeric;
  v_mid_x numeric;
begin
  if v_drives is null or ST_IsEmpty(v_drives) then
    return query select p_drives,p_parking,0,0;
    return;
  end if;

  v_building_obstacle:=case
    when p_buildings is null or ST_IsEmpty(p_buildings) then null
    else ST_Buffer(p_buildings,5)
  end;
  v_mid_x:=(v_xmin+v_xmax)/2;
  v_stalls:=floor(coalesce(ST_Area(v_parking),0)/(p_stall_w*p_stall_d)*0.90)::integer;

  for v_module_index in 1..4 loop
    exit when v_stalls>=p_target_stalls;
    v_missing:=p_target_stalls-v_stalls;
    v_desired_len:=greatest(54,ceil(v_missing*p_stall_w/1.80));
    v_len:=least(v_desired_len,greatest(54,v_xmax-v_xmin-10));
    v_found:=false;

    while v_len>=54 and not v_found loop
      if p_spine_x<=v_mid_x then
        v_x0:=greatest(v_xmin+5,p_spine_x+p_aisle/2-0.10);
        if v_x0+v_len>v_xmax-5 then v_len:=v_xmax-5-v_x0; end if;
      else
        v_x0:=least(v_xmax-5,p_spine_x-p_aisle/2+0.10)-v_len;
        if v_x0<v_xmin+5 then
          v_x0:=v_xmin+5;
          v_len:=least(v_len,v_xmax-5-v_x0);
        end if;
      end if;
      exit when v_len<54;

      v_y0:=v_ymin+5;
      while v_y0+2*p_stall_d+p_aisle<=v_ymax-5 and not v_found loop
        v_drive_candidate:=ST_CollectionExtract(ST_Intersection(
          p_envelope,
          ST_MakeEnvelope(
            v_x0,v_y0+p_stall_d,
            v_x0+v_len,v_y0+p_stall_d+p_aisle,
            ST_SRID(p_envelope)
          )
        ),3);
        v_parking_candidate:=ST_CollectionExtract(ST_Intersection(
          p_envelope,
          ST_UnaryUnion(ST_Collect(array[
            ST_MakeEnvelope(
              v_x0,v_y0,v_x0+v_len,v_y0+p_stall_d,ST_SRID(p_envelope)
            ),
            ST_MakeEnvelope(
              v_x0,v_y0+p_stall_d+p_aisle,
              v_x0+v_len,v_y0+2*p_stall_d+p_aisle,ST_SRID(p_envelope)
            )
          ]))
        ),3);

        if v_building_obstacle is not null then
          v_drive_candidate:=ST_CollectionExtract(
            ST_Difference(v_drive_candidate,ST_Buffer(p_buildings,0.05)),3
          );
          v_parking_candidate:=ST_CollectionExtract(
            ST_Difference(v_parking_candidate,v_building_obstacle),3
          );
        end if;

        -- New parking adds only unused stall land. New circulation is allowed
        -- to cross old parking; the combined parking is clipped from it below.
        if v_parking is not null and not ST_IsEmpty(v_parking) then
          v_parking_candidate:=ST_CollectionExtract(
            ST_Difference(v_parking_candidate,v_parking),3
          );
        end if;
        v_parking_candidate:=ST_CollectionExtract(ST_Difference(
          v_parking_candidate,
          ST_UnaryUnion(ST_Collect(array[
            ST_Buffer(v_drives,0.05),
            case when v_drive_candidate is null then null
                 else ST_Buffer(v_drive_candidate,0.05) end
          ]))
        ),3);

        if v_drive_candidate is not null and not ST_IsEmpty(v_drive_candidate)
           and v_parking_candidate is not null and not ST_IsEmpty(v_parking_candidate)
           and ST_Area(v_drive_candidate)>=v_len*p_aisle*0.70
           and ST_Area(v_parking_candidate)>=v_len*2*p_stall_d*0.50 then
          v_connector:=null;
          if not ST_DWithin(v_drive_candidate,v_drives,0.50) then
            v_connector:=ST_CollectionExtract(ST_Intersection(
              p_envelope,
              ST_Buffer(
                ST_ShortestLine(v_drive_candidate,v_drives),
                p_aisle/2,'endcap=flat join=mitre'
              )
            ),3);
            if v_building_obstacle is not null then
              v_connector:=ST_CollectionExtract(
                ST_Difference(v_connector,v_building_obstacle),3
              );
            end if;
          end if;

          if ST_DWithin(v_drive_candidate,v_drives,0.50)
             or (v_connector is not null and not ST_IsEmpty(v_connector)
                 and ST_DWithin(v_connector,v_drive_candidate,0.50)
                 and ST_DWithin(v_connector,v_drives,0.50)) then
            v_new_drives:=ST_CollectionExtract(ST_UnaryUnion(ST_Collect(array[
              ST_Buffer(v_drives,0.05),
              ST_Buffer(v_drive_candidate,0.05),
              case when v_connector is null then null else ST_Buffer(v_connector,0.05) end
            ])),3);
            v_new_parking:=ST_CollectionExtract(ST_Difference(
              ST_UnaryUnion(ST_Collect(array[v_parking,v_parking_candidate])),
              ST_Buffer(v_new_drives,0.05)
            ),3);
            select ST_UnaryUnion(ST_Collect(q.geom)) into v_new_parking
            from (select (ST_Dump(v_new_parking)).geom) q
            where ST_Area(q.geom)>50;

            v_new_stalls:=floor(coalesce(ST_Area(v_new_parking),0)
              /(p_stall_w*p_stall_d)*0.90)::integer;
            v_impervious:=p_footprint_sqft
              +coalesce(ST_Area(v_new_drives),0)
              +coalesce(ST_Area(v_new_parking),0);

            if ST_NumGeometries(ST_CollectionExtract(ST_UnaryUnion(v_new_drives),3))=1
               and v_new_stalls>v_stalls
               and (p_max_impervious_sqft is null
                    or v_impervious<=p_max_impervious_sqft+1) then
              v_drives:=v_new_drives;
              v_parking:=v_new_parking;
              v_stalls:=v_new_stalls;
              v_modules:=v_modules+1;
              v_found:=true;
            end if;
          end if;
        end if;
        v_y0:=v_y0+10;
      end loop;

      if not v_found then v_len:=v_len-20; end if;
    end loop;
    exit when not v_found;
  end loop;

  return query select v_drives,v_parking,v_stalls,v_modules;
end
$function$;

comment on function public.fn_mf_refill_structure_seed_parking(geometry,geometry,geometry,geometry,numeric,integer,numeric,numeric,numeric,numeric,numeric) is
  'Adds connected double-loaded modules after island pruning. Circulation may reclaim parking; final parking is clipped from structures and drives before recount.';

notify pgrst,'reload schema';

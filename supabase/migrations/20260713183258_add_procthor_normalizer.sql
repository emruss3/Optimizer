-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

create or replace function training.normalize_procthor(p_limit integer default 1000, p_force boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc record;
  v_interior_id uuid;
  v_gfa numeric;
  v_room_counts jsonb;
  v_done integer := 0;
  v_errors integer := 0;
  v_error_examples jsonb := '[]'::jsonb;
begin
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'p_limit must be between 1 and 10000';
  end if;

  for v_doc in
    select r.id as raw_id, r.dataset_id, r.source_record_id, r.split, r.payload, a.source_url
    from training.raw_documents r
    join training.dataset_artifacts a on a.id = r.artifact_id
    join training.dataset_registry d on d.id = r.dataset_id
    where d.slug = 'procthor_10k'
      and r.approved_for_training
      and (p_force or r.normalized_at is null)
    order by case r.split when 'train' then 1 when 'validation' then 2 when 'test' then 3 else 4 end,
             r.record_index
    limit p_limit
  loop
    begin
      select coalesce(sum(public.st_area(g.geom) * 10.76391041671), 0)
      into v_gfa
      from jsonb_array_elements(coalesce(v_doc.payload->'rooms', '[]'::jsonb)) room
      cross join lateral (select training.procthor_polygon(room->'floorPolygon') as geom) g
      where g.geom is not null;

      select coalesce(jsonb_object_agg(room_type, room_count), '{}'::jsonb)
      into v_room_counts
      from (
        select coalesce(room->>'roomType', 'Unknown') as room_type, count(*) as room_count
        from jsonb_array_elements(coalesce(v_doc.payload->'rooms', '[]'::jsonb)) room
        group by 1
      ) x;

      if v_gfa <= 0 then
        raise exception 'No valid room polygons';
      end if;

      insert into training.building_interiors (
        dataset_id, source_record_id, building_type, subtype, floor_no,
        gross_floor_area_sqft, net_usable_area_sqft, efficiency_pct,
        program_metrics, source_file_url, metadata, approved_for_training, updated_at
      )
      values (
        v_doc.dataset_id, v_doc.source_record_id, 'residential',
        coalesce(v_doc.payload->'metadata'->>'roomSpecId', 'synthetic_house'), 1,
        v_gfa, v_gfa, 100,
        jsonb_build_object(
          'roomTypes', v_room_counts,
          'roomCount', jsonb_array_length(coalesce(v_doc.payload->'rooms', '[]'::jsonb)),
          'doorCount', jsonb_array_length(coalesce(v_doc.payload->'doors', '[]'::jsonb)),
          'windowCount', jsonb_array_length(coalesce(v_doc.payload->'windows', '[]'::jsonb)),
          'objectCountTopLevel', jsonb_array_length(coalesce(v_doc.payload->'objects', '[]'::jsonb)),
          'coordinateUnits', 'meters'
        ),
        v_doc.source_url,
        coalesce(v_doc.payload->'metadata', '{}'::jsonb) || jsonb_build_object(
          'rawDocumentId', v_doc.raw_id,
          'split', v_doc.split,
          'normalizedBy', 'training.normalize_procthor_v1'
        ),
        true,
        now()
      )
      on conflict (dataset_id, source_record_id, floor_no) do update set
        building_type = excluded.building_type,
        subtype = excluded.subtype,
        gross_floor_area_sqft = excluded.gross_floor_area_sqft,
        net_usable_area_sqft = excluded.net_usable_area_sqft,
        efficiency_pct = excluded.efficiency_pct,
        program_metrics = excluded.program_metrics,
        source_file_url = excluded.source_file_url,
        metadata = excluded.metadata,
        approved_for_training = excluded.approved_for_training,
        updated_at = now()
      returning id into v_interior_id;

      delete from training.interior_connections where interior_id = v_interior_id;
      delete from training.interior_elements where interior_id = v_interior_id;
      delete from training.interior_spaces where interior_id = v_interior_id;

      insert into training.interior_spaces (
        interior_id, source_space_id, space_type, space_subtype, function_group,
        geom, area_sqft, width_ft, depth_ft, clear_height_ft, public_private,
        conditioned, attributes
      )
      select
        v_interior_id,
        room->>'id',
        coalesce(room->>'roomType', 'Unknown'),
        lower(coalesce(room->>'roomType', 'unknown')),
        'residential',
        g.geom::public.geometry(Polygon,0),
        public.st_area(g.geom) * 10.76391041671,
        (public.st_xmax(public.box3d(g.geom)) - public.st_xmin(public.box3d(g.geom))) * 3.28083989501,
        (public.st_ymax(public.box3d(g.geom)) - public.st_ymin(public.box3d(g.geom))) * 3.28083989501,
        h.clear_height_ft,
        case coalesce(room->>'roomType', '')
          when 'Bedroom' then 'private'
          when 'Bathroom' then 'private'
          when 'Kitchen' then 'semi_public'
          when 'LivingRoom' then 'semi_public'
          else 'semi_public'
        end,
        true,
        room - 'floorPolygon'
      from jsonb_array_elements(coalesce(v_doc.payload->'rooms', '[]'::jsonb)) room
      cross join lateral (select training.procthor_polygon(room->'floorPolygon') as geom) g
      left join lateral (
        select max((point->>'y')::double precision) * 3.28083989501 as clear_height_ft
        from jsonb_array_elements(coalesce(v_doc.payload->'walls', '[]'::jsonb)) wall
        cross join lateral jsonb_array_elements(coalesce(wall->'polygon', '[]'::jsonb)) point
        where wall->>'roomId' = room->>'id' and point ? 'y'
      ) h on true
      where g.geom is not null;

      insert into training.interior_connections (
        interior_id, from_space_id, to_space_id, connection_type,
        width_ft, accessible, one_way, attributes
      )
      select
        v_interior_id,
        s0.id,
        case
          when coalesce(door->>'wall1', '') like '%exterior%'
            or s1.id = s0.id then null
          else s1.id
        end,
        'door',
        width_data.width_ft,
        case when width_data.width_ft is null then null else width_data.width_ft >= 2.6666667 end,
        false,
        (door - 'holePolygon') || jsonb_build_object(
          'isExterior', coalesce(door->>'wall1', '') like '%exterior%' or s1.id = s0.id
        )
      from jsonb_array_elements(coalesce(v_doc.payload->'doors', '[]'::jsonb)) door
      left join training.interior_spaces s0
        on s0.interior_id = v_interior_id and s0.source_space_id = door->>'room0'
      left join training.interior_spaces s1
        on s1.interior_id = v_interior_id and s1.source_space_id = door->>'room1'
      left join lateral (
        select abs(
          (door->'holePolygon'->1->>'x')::double precision -
          (door->'holePolygon'->0->>'x')::double precision
        ) * 3.28083989501 as width_ft
      ) width_data on true
      where s0.id is not null
        and s0.id is distinct from case
          when coalesce(door->>'wall1', '') like '%exterior%' or s1.id = s0.id then null
          else s1.id
        end;

      insert into training.interior_elements (
        interior_id, element_type, subtype, geom, quantity, attributes
      )
      select
        v_interior_id,
        'wall',
        wall->'material'->>'name',
        line.geom,
        1,
        (wall - 'polygon') || jsonb_build_object(
          'lengthFt', public.st_length(line.geom) * 3.28083989501
        )
      from jsonb_array_elements(coalesce(v_doc.payload->'walls', '[]'::jsonb)) wall
      cross join lateral (select training.procthor_wall_line(wall->'polygon') as geom) line
      where line.geom is not null;

      insert into training.interior_elements (
        interior_id, element_type, subtype, geom, quantity, attributes
      )
      select
        v_interior_id,
        opening_type,
        opening->>'assetId',
        case
          when wall_line.geom is null or public.st_length(wall_line.geom) = 0 then null
          else public.st_lineinterpolatepoint(
            wall_line.geom,
            greatest(0::double precision, least(1::double precision,
              coalesce((opening->'assetPosition'->>'x')::double precision, 0) /
              nullif(public.st_length(wall_line.geom), 0)
            ))
          )
        end,
        1,
        opening || jsonb_build_object(
          'isExterior', coalesce(opening->>'wall1', '') like '%exterior%'
        )
      from (
        select 'door'::text as opening_type, door as opening
        from jsonb_array_elements(coalesce(v_doc.payload->'doors', '[]'::jsonb)) door
        union all
        select 'window'::text, win
        from jsonb_array_elements(coalesce(v_doc.payload->'windows', '[]'::jsonb)) win
      ) openings
      left join lateral (
        select training.procthor_wall_line(wall->'polygon') as geom
        from jsonb_array_elements(coalesce(v_doc.payload->'walls', '[]'::jsonb)) wall
        where wall->>'id' = opening->>'wall0'
        limit 1
      ) wall_line on true;

      insert into training.interior_elements (
        interior_id, element_type, subtype, geom, quantity, attributes
      )
      with recursive object_tree(obj, parent_id, depth) as (
        select obj, null::text, 0
        from jsonb_array_elements(coalesce(v_doc.payload->'objects', '[]'::jsonb)) obj
        union all
        select child, object_tree.obj->>'id', object_tree.depth + 1
        from object_tree
        cross join lateral jsonb_array_elements(coalesce(object_tree.obj->'children', '[]'::jsonb)) child
        where object_tree.depth < 20
      ), prepared as (
        select
          obj,
          parent_id,
          depth,
          lower(coalesce(obj->>'id', '') || ' ' || coalesce(obj->>'assetId', '')) as descriptor,
          case
            when obj->'position' ? 'x' and obj->'position' ? 'z' then
              public.st_setsrid(public.st_makepoint(
                (obj->'position'->>'x')::double precision,
                (obj->'position'->>'z')::double precision
              ), 0)
            else null
          end as object_point
        from object_tree
      )
      select
        v_interior_id,
        case
          when descriptor ~ '(toilet|sink|bathtub|shower)' then 'restroom_fixture'
          when descriptor ~ '(stove|fridge|refrigerator|microwave|coffee|counter|cabinet|dishwasher|kettle|toaster)' then 'kitchen_equipment'
          when descriptor like '%stair%' then 'stair'
          when descriptor like '%elevator%' then 'elevator'
          when descriptor like '%column%' then 'column'
          else 'furniture_zone'
        end,
        split_part(coalesce(obj->>'id', obj->>'assetId', 'object'), '|', 1),
        object_point,
        1,
        (obj - 'children') || jsonb_build_object(
          'parentObjectId', parent_id,
          'treeDepth', depth,
          'assignedRoomId', assigned.source_space_id
        )
      from prepared
      left join lateral (
        select s.source_space_id
        from training.interior_spaces s
        where s.interior_id = v_interior_id
          and prepared.object_point is not null
          and public.st_covers(s.geom, prepared.object_point)
        order by s.area_sqft
        limit 1
      ) assigned on true;

      update training.raw_documents
      set normalized_at = now(), quality_status = 'accepted', quality_notes = null
      where id = v_doc.raw_id;

      v_done := v_done + 1;
    exception when others then
      v_errors := v_errors + 1;
      v_error_examples := v_error_examples || jsonb_build_array(jsonb_build_object(
        'rawDocumentId', v_doc.raw_id,
        'sourceRecordId', v_doc.source_record_id,
        'error', sqlerrm
      ));
      update training.raw_documents
      set quality_status = 'quarantined', approved_for_training = false,
          quality_notes = left(sqlerrm, 2000)
      where id = v_doc.raw_id;
    end;
  end loop;

  return jsonb_build_object(
    'normalized', v_done,
    'quarantined', v_errors,
    'errorExamples', v_error_examples
  );
end;
$$;

revoke all on function training.normalize_procthor(integer, boolean) from public, anon, authenticated;
grant execute on function training.normalize_procthor(integer, boolean) to service_role;

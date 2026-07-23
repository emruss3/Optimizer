-- The final parking self-size step was written for rectangular bars. Applying
-- its bounding-box reconstruction to an authoritative L structure converted
-- the L back into a large rectangle after parking had already been clipped,
-- recreating building×parking and building×circulation overlap.
--
-- Scale authoritative structures about their own centroids, preserving their
-- topology and orientation. Rebuild the output building arrays from the final
-- validated geometry so render payload and server invariants are identical.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('structure_seed_shape_preserved_during_self_size_v1' in d)>0 then
    return;
  end if;

  old := $old$        FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
          new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
          bars_arr[k] := ST_MakeEnvelope(
            ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
            ST_XMin(bars_arr[k])+GREATEST(new_len, 20),ST_YMax(bars_arr[k]),2274);
        END LOOP;$old$;

  new := $new$        IF structure_seed_active THEN
          bar_scale:=least(1,greatest(0.05,bar_scale));
          FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
            bars_arr[k]:=ST_Translate(
              ST_Scale(
                ST_Translate(
                  bars_arr[k],
                  -ST_X(ST_Centroid(bars_arr[k])),
                  -ST_Y(ST_Centroid(bars_arr[k]))
                ),
                sqrt(bar_scale),sqrt(bar_scale)
              ),
              ST_X(ST_Centroid(bars_arr[k])),
              ST_Y(ST_Centroid(bars_arr[k]))
            );
          END LOOP;
          flags:=flags||to_jsonb('structure_seed_shape_preserved_during_self_size_v1'::text);
        ELSE
          FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
            new_len := (ST_XMax(bars_arr[k])-ST_XMin(bars_arr[k]))*bar_scale;
            bars_arr[k] := ST_MakeEnvelope(
              ST_XMin(bars_arr[k]),ST_YMin(bars_arr[k]),
              ST_XMin(bars_arr[k])+GREATEST(new_len, 20),ST_YMax(bars_arr[k]),2274);
          END LOOP;
        END IF;$new$;

  if position(old in d)=0 then
    raise exception 'structure shape-preserving self-size marker not found';
  end if;
  d:=replace(d,old,new);

  old := $old$  -- PROFESSIONAL VALIDATORS v1 (P2-3): measured receipts, never refusals.$old$;
  new := $new$  -- Render payload must be rebuilt from the same final geometry that
  -- passed I-1. Earlier serialization predates final parking self-sizing.
  bars_j:='[]'::jsonb;
  bars_l:='[]'::jsonb;
  i:=0;
  FOR k IN 1..COALESCE(array_length(bars_arr,1),0) LOOP
    IF k=amen_idx THEN CONTINUE; END IF;
    i:=i+1;
    ub:=ST_Rotate(bars_arr[k],theta,anchor);
    bars_j:=bars_j||jsonb_build_object(
      'i',i,'footprint_sqft',round(ST_Area(bars_arr[k])),'floors',floors,
      'structure_id',case when structure_seed_active then k else null end,
      'geom',ST_AsGeoJSON(ST_Transform(ST_SetSRID(ub,2274),4326))::jsonb
    );
    bars_l:=bars_l||jsonb_build_object(
      'i',i,'footprint_sqft',round(ST_Area(bars_arr[k])),'floors',floors,
      'structure_id',case when structure_seed_active then k else null end,
      'geom',ST_AsGeoJSON(ST_Translate(ub,-ox,-oy))::jsonb
    );
  END LOOP;
  FOR k IN 1..COALESCE(array_length(pin_geoms,1),0) LOOP
    i:=i+1;
    bars_j:=bars_j||jsonb_build_object(
      'i',i,'pinned',true,'pin_index',k-1,
      'footprint_sqft',round(ST_Area(pin_geoms[k])),'floors',pin_floors[k],
      'geom',ST_AsGeoJSON(ST_Transform(ST_SetSRID(pin_geoms[k],2274),4326))::jsonb
    );
    bars_l:=bars_l||jsonb_build_object(
      'i',i,'pinned',true,'pin_index',k-1,
      'footprint_sqft',round(ST_Area(pin_geoms[k])),'floors',pin_floors[k],
      'geom',ST_AsGeoJSON(ST_Translate(pin_geoms[k],-ox,-oy))::jsonb
    );
  END LOOP;
  flags:=flags||to_jsonb('building_payload_rebuilt_from_final_validated_geometry_v1'::text);

  -- PROFESSIONAL VALIDATORS v1 (P2-3): measured receipts, never refusals.$new$;

  if position(old in d)=0 then
    raise exception 'final building serialization marker not found';
  end if;
  d:=replace(d,old,new);

  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Context-driven multifamily Stage-3 solver. Authoritative structures retain topology through self-sizing; emitted buildings are rebuilt from final I-1-validated geometry.';

notify pgrst,'reload schema';

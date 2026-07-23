-- Frontage structure seeds are authoritative composition, not immutable
-- coordinates. Refine them in-family to reserve a full-width circulation frame:
-- translate rearward for a 24-ft entry apron, then clip the smaller of the two
-- side strips. The retained geometry stays one structure and normally loses
-- only a few percent of footprint; parking and drive search then start from a
-- legal, connected frame instead of cutting through the seed.

do $patch_core$
declare
  d text;
  old text;
  new text;
begin
  select pg_get_functiondef(
    'public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text)'::regprocedure
  ) into d;

  if position('structure_seed_circulation_clearance_v1' in d)>0 then
    return;
  end if;

  old := $old$        directive_original_count:=structure_seed_count;
        directive_count:=structure_seed_count;
        directive_limit:=structure_seed_count;
        bars_capacity_arr:=bars_arr; capacity_fp:=tot_fp;$old$;

  new := $new$        directive_original_count:=structure_seed_count;
        directive_count:=structure_seed_count;
        directive_limit:=structure_seed_count;

        if not structure_seed_landlocked and structure_seed_count=1 then
          last_bar:=bars_arr[1];
          last_area:=ST_Area(last_bar);
          yoff:=greatest(
            0,
            ST_YMin(parking_rot)+aisle+0.20-ST_YMin(last_bar)
          );
          if yoff>0 and ST_Covers(rot,ST_Translate(last_bar,0,yoff)) then
            last_bar:=ST_Translate(last_bar,0,yoff);
            flags:=flags||to_jsonb('structure_seed_shifted_for_front_apron_v1'::text);
          end if;

          -- Candidate A reserves the left strip; candidate B reserves right.
          cand:=ST_CollectionExtract(ST_Intersection(
            last_bar,
            ST_MakeEnvelope(
              ST_XMin(parking_rot)+aisle+0.20,
              ST_YMin(parking_rot)+aisle+0.20,
              ST_XMax(parking_rot),ST_YMax(parking_rot),2274
            )
          ),3);
          drop_piece:=ST_CollectionExtract(ST_Intersection(
            last_bar,
            ST_MakeEnvelope(
              ST_XMin(parking_rot),
              ST_YMin(parking_rot)+aisle+0.20,
              ST_XMax(parking_rot)-aisle-0.20,
              ST_YMax(parking_rot),2274
            )
          ),3);

          if drop_piece is not null and not ST_IsEmpty(drop_piece)
             and ST_NumGeometries(drop_piece)=1
             and ST_Area(drop_piece)>=greatest(1000,last_area*0.90)
             and (cand is null or ST_IsEmpty(cand)
                  or ST_NumGeometries(cand)<>1
                  or ST_Area(drop_piece)>=ST_Area(cand)) then
            bars_arr[1]:=drop_piece;
            spine_x:=ST_XMax(parking_rot)-aisle/2;
            flags:=flags||to_jsonb('structure_seed_right_side_spine_clearance_v1'::text);
          elsif cand is not null and not ST_IsEmpty(cand)
                and ST_NumGeometries(cand)=1
                and ST_Area(cand)>=greatest(1000,last_area*0.90) then
            bars_arr[1]:=cand;
            spine_x:=ST_XMin(parking_rot)+aisle/2;
            flags:=flags||to_jsonb('structure_seed_left_side_spine_clearance_v1'::text);
          else
            bars_arr[1]:=last_bar;
            spine_x:=case
              when ST_XMin(last_bar)-ST_XMin(parking_rot)
                   >=ST_XMax(parking_rot)-ST_XMax(last_bar)
                then ST_XMin(parking_rot)+aisle/2
              else ST_XMax(parking_rot)-aisle/2
            end;
            flags:=flags||to_jsonb('structure_seed_side_clearance_retention_floor_v1'::text);
          end if;

          tot_fp:=ST_Area(bars_arr[1]);
          flags:=flags||to_jsonb('structure_seed_circulation_clearance_v1'::text);
        end if;

        bars_capacity_arr:=bars_arr; capacity_fp:=tot_fp;$new$;

  if position(old in d)=0 then
    raise exception 'structure-seed circulation-clearance intake marker missing';
  end if;
  d:=replace(d,old,new);

  old := $old$  IF structure_seed_active and structure_seed_landlocked THEN
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    spine_x:=case
      when ST_XMin(bars_u)-bxmin >= bxmax-ST_XMax(bars_u)
        then greatest(bxmin+aisle/2,ST_XMin(bars_u)-aisle/2-2)
      else least(bxmax-aisle/2,ST_XMax(bars_u)+aisle/2+2) end;
    spine:=ST_Intersection(rot,ST_MakeEnvelope(
      spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274));
    lead_street:=false;
    flags:=flags||to_jsonb('landlocked_access_via_easement_assumed'::text)
      ||to_jsonb('site_skeleton_v2_easement_side_spine_v1'::text);
  ELSIF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    spine_x := case when ST_X(entry_rot) <= (bxmin+bxmax)/2
                    then bxmin+aisle/2 else bxmax-aisle/2 end;
    spine := ST_UnaryUnion(ST_Union(
      ST_Intersection(rot, ST_MakeEnvelope(
        spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274)),
      ST_Intersection(rot,ST_Buffer(ST_SetSRID(ST_MakeLine(
        ST_MakePoint(ST_X(entry_rot),bymin),
        ST_MakePoint(spine_x,bymin+aisle/2)
      ),2274),aisle/2,'endcap=flat join=mitre'))
    ));
    lead_street := false;
    flags := flags
      || to_jsonb('massing_side_spine_preserves_consolidated_bar_v1'::text)
      || to_jsonb('massing_frontage_entry_throat_v1'::text);$old$;

  new := $new$  IF structure_seed_active and structure_seed_landlocked THEN
    select ST_UnaryUnion(ST_Collect(bg)) into bars_u from unnest(bars_arr) bg;
    spine_x:=case
      when ST_XMin(bars_u)-bxmin >= bxmax-ST_XMax(bars_u)
        then greatest(bxmin+aisle/2,ST_XMin(bars_u)-aisle/2-2)
      else least(bxmax-aisle/2,ST_XMax(bars_u)+aisle/2+2) end;
    spine:=ST_Intersection(rot,ST_MakeEnvelope(
      spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274));
    lead_street:=false;
    flags:=flags||to_jsonb('landlocked_access_via_easement_assumed'::text)
      ||to_jsonb('site_skeleton_v2_easement_side_spine_v1'::text);
  ELSIF structure_seed_active THEN
    spine:=ST_CollectionExtract(ST_Intersection(
      parking_rot,
      ST_UnaryUnion(ST_Collect(array[
        ST_MakeEnvelope(
          spine_x-aisle/2,ST_YMin(parking_rot),
          spine_x+aisle/2,ST_YMax(parking_rot),2274
        ),
        ST_Buffer(ST_SetSRID(ST_MakeLine(array[
          entry_rot,
          ST_SetSRID(ST_MakePoint(
            ST_X(entry_rot),ST_YMin(parking_rot)+aisle/2
          ),2274),
          ST_SetSRID(ST_MakePoint(
            spine_x,ST_YMin(parking_rot)+aisle/2
          ),2274)
        ]),2274),aisle/2,'endcap=flat join=mitre')
      ]))
    ),3);
    lead_street:=false;
    flags:=flags
      ||to_jsonb('structure_seed_parking_envelope_side_spine_v1'::text)
      ||to_jsonb('structure_seed_front_apron_v1'::text);
  ELSIF directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') THEN
    spine_x := case when ST_X(entry_rot) <= (bxmin+bxmax)/2
                    then bxmin+aisle/2 else bxmax-aisle/2 end;
    spine := ST_UnaryUnion(ST_Union(
      ST_Intersection(rot, ST_MakeEnvelope(
        spine_x-aisle/2,bymin,spine_x+aisle/2,bymax,2274)),
      ST_Intersection(rot,ST_Buffer(ST_SetSRID(ST_MakeLine(
        ST_MakePoint(ST_X(entry_rot),bymin),
        ST_MakePoint(spine_x,bymin+aisle/2)
      ),2274),aisle/2,'endcap=flat join=mitre'))
    ));
    lead_street := false;
    flags := flags
      || to_jsonb('massing_side_spine_preserves_consolidated_bar_v1'::text)
      || to_jsonb('massing_frontage_entry_throat_v1'::text);$new$;

  if position(old in d)=0 then
    raise exception 'structure-seed circulation spine marker missing';
  end if;
  d:=replace(d,old,new);

  old := $old$  if directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then
    drives_cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(spine_x,bymin),ST_MakePoint(spine_x,bymax)),2274));
    cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(ST_X(entry_rot),ST_Y(entry_rot)),
      ST_MakePoint(spine_x,ST_Y(entry_rot))),2274));
    if cl is not null and not ST_IsEmpty(cl) then
      drives_cl := case when drives_cl is null then cl else ST_Union(drives_cl,cl) end;
    end if;$old$;

  new := $new$  if structure_seed_active and not structure_seed_landlocked then
    drives_cl:=ST_Intersection(parking_rot,ST_SetSRID(ST_MakeLine(
      ST_MakePoint(spine_x,ST_YMin(parking_rot)),
      ST_MakePoint(spine_x,ST_YMax(parking_rot))
    ),2274));
    cl:=ST_Intersection(parking_rot,ST_SetSRID(ST_MakeLine(array[
      entry_rot,
      ST_SetSRID(ST_MakePoint(
        ST_X(entry_rot),ST_YMin(parking_rot)+aisle/2
      ),2274),
      ST_SetSRID(ST_MakePoint(
        spine_x,ST_YMin(parking_rot)+aisle/2
      ),2274)
    ]),2274));
    if cl is not null and not ST_IsEmpty(cl) then
      drives_cl:=case when drives_cl is null then cl else ST_Union(drives_cl,cl) end;
    end if;
  elsif directive_active
     and directive_parti in ('street_bar_parking_behind','L_scheme_bar_on_frontage_wing_deep') then
    drives_cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(spine_x,bymin),ST_MakePoint(spine_x,bymax)),2274));
    cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(
      ST_MakePoint(ST_X(entry_rot),ST_Y(entry_rot)),
      ST_MakePoint(spine_x,ST_Y(entry_rot))),2274));
    if cl is not null and not ST_IsEmpty(cl) then
      drives_cl := case when drives_cl is null then cl else ST_Union(drives_cl,cl) end;
    end if;$new$;

  if position(old in d)=0 then
    raise exception 'structure-seed centerline marker missing';
  end if;
  d:=replace(d,old,new);

  execute d;
end
$patch_core$;

comment on function public.fn_mf_solve_core(integer,text,integer,jsonb,uuid,boolean,uuid,text) is
  'Stage-3 exact seed refinement reserves a full 24-ft front/side circulation frame while retaining the authoritative one-structure composition; parking and roads start clear by construction.';

notify pgrst,'reload schema';

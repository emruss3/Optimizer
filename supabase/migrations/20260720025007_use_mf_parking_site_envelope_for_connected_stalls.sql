-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- Search for connected surface parking in the side-setback site envelope used
-- by fn_max_buildout, rather than limiting the search to the directional
-- building envelope. The assumption remains explicit until jurisdiction- and
-- use-specific parking setbacks are loaded into the planner contract.

do $patch$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  v_definition := replace(
    v_definition,
    '        ST_Intersection(rot,ST_Buffer(drives,stall_d)),',
    '        ST_Intersection(parking_rot,ST_Buffer(drives,stall_d)),'
  );

  if position('parking_envelope_side_setback_inset_pending_specific_parking_setbacks' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN' || chr(10) ||
      '      parks := CASE WHEN parks IS NULL THEN supplemental_parking' || chr(10) ||
      '                    ELSE ST_UnaryUnion(ST_Union(parks,supplemental_parking)) END;',
      '    IF supplemental_parking IS NOT NULL AND NOT ST_IsEmpty(supplemental_parking) THEN' || chr(10) ||
      '      IF COALESCE(ST_Area(ST_Difference(supplemental_parking,rot)),0)>1 THEN' || chr(10) ||
      '        flags := flags || to_jsonb(''parking_envelope_side_setback_inset_pending_specific_parking_setbacks''::text);' || chr(10) ||
      '      END IF;' || chr(10) ||
      '      parks := CASE WHEN parks IS NULL THEN supplemental_parking' || chr(10) ||
      '                    ELSE ST_UnaryUnion(ST_Union(parks,supplemental_parking)) END;'
    );
  end if;

  if position('ST_Intersection(parking_rot,ST_Buffer(drives,stall_d))' in v_definition) = 0
     or position('parking_envelope_side_setback_inset_pending_specific_parking_setbacks' in v_definition) = 0 then
    raise exception 'unable to align MF connected parking with site envelope';
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Buildings use directional building setbacks; connected surface parking may use the broader side-setback site envelope assumed by fn_max_buildout and is explicitly flagged pending parking-specific setback standards.';

notify pgrst, 'reload schema';

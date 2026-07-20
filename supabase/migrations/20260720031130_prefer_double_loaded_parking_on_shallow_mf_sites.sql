-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- On a shallow parking-bound site, the prior solver deepened the residential
-- bar and accepted only one stall row. When a complete 45-foot bar plus
-- double-loaded parking module fits, choose that module instead: it supports
-- materially more GSF after the hard parking solve.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('bar_depth_reduced_for_double_loaded_parking' in v_definition) = 0 then
    v_old := $old$
  IF avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    bar_depth := GREATEST(45, avail_h - (stall_d + aisle) - 6);
    IF bar_depth + stall_d + aisle + 6 > avail_h THEN
      lead_street := false;
      bar_depth := GREATEST(40, LEAST(bar_depth, avail_h - 4));
    END IF;
    flags := flags || to_jsonb('bar_depth_clamped_shallow_site'::text);
  END IF;
$old$;
    v_new := $new$
  IF avail_h >= drive_gap + 45 + 1
     AND avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    -- On a parking-bound shallow site, prefer a constructable bar plus two
    -- stall rows over a deeper bar plus one row. This preserves more GSF after
    -- the hard parking solve even though the individual floorplate is shallower.
    bar_depth := 45;
    flags := flags || to_jsonb('bar_depth_reduced_for_double_loaded_parking'::text);
  ELSIF avail_h < (stall_d + aisle) + bar_depth + 6 THEN
    bar_depth := GREATEST(45, avail_h - (stall_d + aisle) - 6);
    IF bar_depth + stall_d + aisle + 6 > avail_h THEN
      lead_street := false;
      bar_depth := GREATEST(40, LEAST(bar_depth, avail_h - 4));
    END IF;
    flags := flags || to_jsonb('bar_depth_clamped_shallow_site'::text);
  END IF;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF shallow depth marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
  IF avail_h > bar_depth * 2 + drive_gap + 20 THEN
    y := bymin + 2 + (p_seed % 3) * 4;
  ELSE
    y := bymin + 1;
  END IF;
$old$;
    v_new := $new$
  IF avail_h > bar_depth * 2 + drive_gap + 20 THEN
    y := bymin + 2 + (p_seed % 3) * 4;
  ELSIF avail_h >= drive_gap + bar_depth + 1 THEN
    y := bymin + 0.5;
  ELSE
    y := bymin + 1;
  END IF;
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF shallow row origin marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
    IF y+drive_gap+bar_depth<=bymax-1 AND avail_h<2*bar_depth+drive_gap+20 THEN
$old$;
    v_new := $new$
    IF y+drive_gap+bar_depth<=bymax-0.5 AND avail_h<2*bar_depth+drive_gap+20 THEN
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF double-loaded lead condition marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);

    v_old := $old$
  WHILE y + bar_depth <= bymax - 1 LOOP
$old$;
    v_new := $new$
  WHILE y + bar_depth <= bymax - 0.5 LOOP
$new$;
    if position(v_old in v_definition) = 0 then
      raise exception 'MF bar-row fit marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Parking-bound shallow sites prefer a constructable 45-foot bar with double-loaded surface parking when the complete module fits.';

notify pgrst, 'reload schema';

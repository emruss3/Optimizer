-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.
--
-- The development objective is gross square feet, not raw unit count. Density
-- caps units; unit size remains a programming variable inside the legal,
-- parking-land, impervious and height frontier.

alter table public.typology_spec
  add column if not exists avg_unit_gsf numeric,
  add column if not exists net_efficiency numeric,
  add column if not exists floor_height_ft numeric,
  add column if not exists stall_land_sf numeric;

update public.typology_spec
set avg_unit_gsf = coalesce(avg_unit_gsf, 950),
    net_efficiency = coalesce(net_efficiency, 0.85),
    floor_height_ft = coalesce(floor_height_ft, floor_to_floor_ft, 11),
    stall_land_sf = coalesce(stall_land_sf, 420)
where typology = 'multifamily';

update public.typology_spec
set floor_height_ft = coalesce(floor_height_ft, 11),
    stall_land_sf = coalesce(stall_land_sf, 420)
where typology = 'single_family';

create or replace function public.fn_max_buildout(
  p_ogc_fid integer,
  p_typology text default 'multifamily'
) returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','public'
as $function$
declare
  ctx jsonb;
  ts public.typology_spec%rowtype;
  v_lot numeric;
  v_usable numeric;
  v_density numeric;
  v_height numeric;
  v_isr numeric;
  v_side numeric;
  v_far numeric;
  far_uncapped boolean;
  stall_sf numeric;
  pk_ratio numeric;
  fl_h numeric;
  max_stories integer;
  s integer;
  ug numeric;
  units numeric;
  fp numeric;
  gsf numeric;
  cap_units numeric;
  land_cap numeric;
  best_gsf numeric := 0;
  best jsonb;
  ladder jsonb := '[]'::jsonb;
  story_best jsonb;
  story_best_gsf numeric;
begin
  if p_ogc_fid is null or p_ogc_fid <= 0 then
    return jsonb_build_object('error','valid p_ogc_fid is required');
  end if;
  if p_typology is null or btrim(p_typology) = '' then
    return jsonb_build_object('error','valid p_typology is required');
  end if;

  select * into ts
  from public.typology_spec
  where typology = lower(btrim(p_typology));

  if not found or ts.avg_unit_gsf is null then
    return jsonb_build_object('error','max_buildout not defined for typology: ' || p_typology);
  end if;

  ctx := public.fn_resolve_design_context(p_ogc_fid, lower(btrim(p_typology)));
  if ctx ? 'error' then return ctx; end if;

  v_lot := nullif(ctx #>> '{entitlement_capacity,lot_sqft}', '')::numeric;
  v_density := nullif(ctx #>> '{density_max_du_acre,value}', '')::numeric;
  v_height := coalesce(nullif(ctx #>> '{height_max_ft,value}', '')::numeric, ts.floor_height_ft * 3);
  v_isr := coalesce(nullif(ctx #>> '{max_isr,value}', '')::numeric, 0.9);
  v_side := coalesce(nullif(ctx #>> '{setbacks,side,value}', '')::numeric, 5);
  v_far := nullif(ctx #>> '{far_max,value}', '')::numeric;
  far_uncapped := coalesce((ctx #>> '{entitlement_capacity,far_uncapped_for_mf}')::boolean, false);
  pk_ratio := coalesce(ts.surface_parking_ratio, 1.5);
  stall_sf := coalesce(ts.stall_land_sf, 420);
  fl_h := coalesce(ts.floor_height_ft, ts.floor_to_floor_ft, 11);

  if v_lot is null or v_lot <= 0 then
    return jsonb_build_object('error','measured lot area is required for max buildout');
  end if;

  select public.st_area(public.st_buffer((public.st_dump(p.geom_2274)).geom, -v_side))
    into v_usable
  from public.parcels p
  where p.ogc_fid = p_ogc_fid;

  v_usable := coalesce(v_usable, v_lot * 0.8);
  max_stories := greatest(1, floor(v_height / fl_h)::integer);
  cap_units := coalesce(v_density, 1e9) * v_lot / 43560.0;

  for s in 1..max_stories loop
    story_best_gsf := 0;
    story_best := null;

    for ug in
      select unnest(array[750,950,1150,1350,1550]::numeric[])
    loop
      land_cap := least(v_usable, v_isr * v_lot);
      units := least(cap_units, land_cap / (ug / s + pk_ratio * stall_sf));
      gsf := units * ug;

      if v_far is not null and not far_uncapped then
        gsf := least(gsf, v_far * v_lot);
        units := least(units, gsf / ug);
      end if;

      if gsf > story_best_gsf then
        story_best_gsf := gsf;
        fp := units * ug / s;
        story_best := jsonb_build_object(
          'stories', s,
          'max_gsf', round(gsf),
          'units', floor(units),
          'unit_gsf', ug,
          'footprint_sqft', round(fp),
          'binding', case
            when units >= cap_units - 0.5 then 'density'
            when v_far is not null and not far_uncapped and abs(gsf - v_far * v_lot) < 1 then 'far'
            when v_isr * v_lot < v_usable then 'impervious_coverage'
            else 'land_after_parking'
          end
        );
      end if;
    end loop;

    ladder := ladder || story_best;
    if story_best_gsf > best_gsf then
      best_gsf := story_best_gsf;
      best := story_best;
    end if;
  end loop;

  if best is null then
    return jsonb_build_object('error','no buildout frontier could be calculated');
  end if;

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid,
    'typology', lower(btrim(p_typology)),
    'max_gsf', (best->>'max_gsf')::integer,
    'at_stories', (best->>'stories')::integer,
    'at_unit_gsf', (best->>'unit_gsf')::numeric,
    'units_at_max', (best->>'units')::integer,
    'footprint_at_max', (best->>'footprint_sqft')::integer,
    'binding_constraint', best->>'binding',
    'stories_ladder', ladder,
    'entitlement_capacity', ctx->'entitlement_capacity',
    'assumptions', jsonb_build_object(
      'unit_gsf_band', '750-1550 swept',
      'parking_ratio', pk_ratio,
      'stall_land_sf', stall_sf,
      'floor_height_ft', fl_h,
      'usable_land_sqft', round(v_usable),
      'usable_basis', 'uniform side-setback inset (directional pending frontage)',
      'source', 'typology_spec program prior; tightens when unit_spec lands'
    ),
    'note', 'Objective: MAXIMIZE GSF. Density caps units, not SF; larger units can recover the envelope. Precedents shape form only.'
  );
end
$function$;

revoke all on function public.fn_max_buildout(integer,text) from public;
grant execute on function public.fn_max_buildout(integer,text) to service_role;

comment on function public.fn_max_buildout(integer,text) is
  'Returns the maximum gross square-foot frontier by sweeping stories and gross unit size while enforcing density, FAR, impervious land, parking-land and setback assumptions. Quantity target for typed solvers; precedents may shape form but may not cap GSF.';

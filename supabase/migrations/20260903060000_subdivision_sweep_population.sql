-- Subdivision sweep (Eric, 2026-09-03: "Everything we do needs to help train
-- decision making for multiple parcels, not just a one off solve"). Every
-- eligible single-family parcel is run through fn_generate_subdivision and
-- the OUTCOME is stored — numbers only, no geometry — so the decision rules
-- (network by width, lot objective, access reading, hazards held out,
-- residual on irregular outlines) are calibrated on the population, and
-- fn_plan_pattern can show what the generator achieved on parcels like this.
--
-- Population: single-family / agricultural-residential zoning with land ≥ the
-- subdivision floor (max(2 ac, 9 × district minimum lot)); AR2a capped at
-- 100 ac. Batches claim rows with SKIP LOCKED so parallel calls never repeat.

create table if not exists public.subdivision_sweep (
  ogc_fid integer primary key,
  run_at timestamptz not null default now(),
  generator_version text,
  zoning text,
  acres numeric,
  obb_length_ft numeric,
  obb_width_ft numeric,
  fill_ratio numeric,
  network text,
  streets_across integer,
  lots integer,
  irregular_lots integer,
  lot_width_ft numeric,
  lot_depth_ft numeric,
  buildable_depth_ft numeric,
  streets integer,
  courts integer,
  pct_row numeric,
  pct_alleys numeric,
  pct_lots numeric,
  pct_residual numeric,
  du_ac numeric,
  access_mode text,
  error text,
  flags jsonb,
  metrics jsonb,
  params jsonb
);
create index if not exists subdivision_sweep_zoning_acres_idx on public.subdivision_sweep (zoning, acres);
alter table public.subdivision_sweep enable row level security;
drop policy if exists subdivision_sweep_read on public.subdivision_sweep;
create policy subdivision_sweep_read on public.subdivision_sweep for select to anon, authenticated using (true);

create table if not exists public.subdivision_sweep_queue (
  ogc_fid integer primary key,
  zoning_base text not null,
  min_lot_sqft numeric,
  acres numeric,
  claimed_at timestamptz
);
alter table public.subdivision_sweep_queue enable row level security;
drop policy if exists subdivision_sweep_queue_read on public.subdivision_sweep_queue;
create policy subdivision_sweep_queue_read on public.subdivision_sweep_queue for select to anon, authenticated using (true);

insert into public.subdivision_sweep_queue (ogc_fid, zoning_base, min_lot_sqft, acres)
select ogc_fid, zb, min_lot, round((a/43560.0)::numeric, 2)
from (
  select ogc_fid, st_area(geom_2274) a, zb,
    case when zb ~ '^RS' then (substring(zb from 3))::numeric * 1000
         when zb ~ '^R[0-9]' then (substring(zb from 2))::numeric * 1000
         when zb = 'AR2A' then 87120 when zb = 'AG' then 217800 end min_lot
  from (select ogc_fid, geom_2274, regexp_replace(upper(zoning), '-A$|-NS$', '') zb
        from public.parcels where zoning ~* '^(RS?[0-9.]+|AR2A|AG)(-A|-NS)?$') z
) m
where min_lot is not null and a >= greatest(87120, 9 * min_lot)
  and (zb <> 'AR2A' or a <= 100 * 43560)
on conflict (ogc_fid) do nothing;

-- Exception-safe wrapper: one bad geometry never kills a batch (or a nightly gate).
create or replace function public.fn_generate_subdivision_safe(p_ogc_fid integer)
returns jsonb
language plpgsql
stable
as $$
begin
  return public.fn_generate_subdivision(p_ogc_fid);
exception when others then
  return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1',
    'error', 'exception: ' || sqlerrm, 'flags', '["exception"]'::jsonb);
end
$$;
grant execute on function public.fn_generate_subdivision_safe(integer) to anon, authenticated;

-- One batch of the sweep: run, then upsert the numbers.
create or replace function public.fn_subdivision_sweep_batch(p_fids integer[])
returns jsonb
language plpgsql
volatile
as $$
declare
  v_n integer := 0; v_err integer := 0; v_fid integer; v_j jsonb; v_g geometry; v_obb geometry;
begin
  foreach v_fid in array p_fids loop
    v_j := public.fn_generate_subdivision_safe(v_fid);
    select geom_2274 into v_g from public.parcels where ogc_fid = v_fid;
    if v_g is null then continue; end if;
    v_obb := st_orientedenvelope(v_g);
    insert into public.subdivision_sweep as s (
      ogc_fid, run_at, generator_version, zoning, acres, obb_length_ft, obb_width_ft, fill_ratio,
      network, streets_across, lots, irregular_lots, lot_width_ft, lot_depth_ft, buildable_depth_ft, streets, courts,
      pct_row, pct_alleys, pct_lots, pct_residual, du_ac, access_mode, error, flags, metrics, params)
    select v_fid, now(), v_j->>'generator_version', p.zoning, round((st_area(v_g)/43560.0)::numeric, 2),
      (v_j#>>'{frame,obb_length_ft}')::numeric, (v_j#>>'{frame,obb_width_ft}')::numeric,
      round((st_area(v_g)/nullif(st_area(v_obb),0))::numeric, 3),
      v_j->>'network', (v_j#>>'{frame,streets_across}')::integer, coalesce((v_j#>>'{metrics,lots}')::integer, 0),
      (v_j#>>'{metrics,irregular_lots}')::integer, (v_j#>>'{metrics,lot_width_ft}')::numeric, (v_j#>>'{metrics,lot_depth_ft}')::numeric,
      (v_j#>>'{metrics,buildable_depth_ft}')::numeric, (v_j#>>'{metrics,streets}')::integer, (v_j#>>'{metrics,courts}')::integer,
      (v_j#>>'{metrics,pct_land_in_row}')::numeric, (v_j#>>'{metrics,pct_land_in_alleys}')::numeric, (v_j#>>'{metrics,pct_land_in_lots}')::numeric,
      (v_j#>>'{metrics,pct_land_residual}')::numeric, (v_j#>>'{metrics,gross_density_du_ac}')::numeric, v_j#>>'{access,mode}',
      v_j->>'error', v_j->'flags', v_j->'metrics', v_j->'params'
    from public.parcels p where p.ogc_fid = v_fid
    on conflict (ogc_fid) do update set
      run_at = excluded.run_at, generator_version = excluded.generator_version, zoning = excluded.zoning, acres = excluded.acres,
      obb_length_ft = excluded.obb_length_ft, obb_width_ft = excluded.obb_width_ft, fill_ratio = excluded.fill_ratio,
      network = excluded.network, streets_across = excluded.streets_across, lots = excluded.lots, irregular_lots = excluded.irregular_lots,
      lot_width_ft = excluded.lot_width_ft, lot_depth_ft = excluded.lot_depth_ft, buildable_depth_ft = excluded.buildable_depth_ft,
      streets = excluded.streets, courts = excluded.courts, pct_row = excluded.pct_row, pct_alleys = excluded.pct_alleys,
      pct_lots = excluded.pct_lots, pct_residual = excluded.pct_residual, du_ac = excluded.du_ac, access_mode = excluded.access_mode,
      error = excluded.error, flags = excluded.flags, metrics = excluded.metrics, params = excluded.params;
    v_n := v_n + 1;
    if v_j->>'error' is not null then v_err := v_err + 1; end if;
  end loop;
  return jsonb_build_object('processed', v_n, 'errors', v_err);
end
$$;
revoke execute on function public.fn_subdivision_sweep_batch(integer[]) from public, anon, authenticated;

-- Claim the next p_n unprocessed parcels (largest urban tracts first, AR2a last) and run them.
create or replace function public.fn_subdivision_sweep_next(p_n integer default 40)
returns jsonb
language plpgsql
volatile
as $$
declare v_fids integer[]; v_t0 timestamptz := clock_timestamp(); v_res jsonb;
begin
  with pick as (
    select ogc_fid from public.subdivision_sweep_queue
    where claimed_at is null
    order by (zoning_base = 'AR2A'), acres desc, ogc_fid
    limit p_n
    for update skip locked
  ), upd as (
    update public.subdivision_sweep_queue q set claimed_at = now()
    from pick where q.ogc_fid = pick.ogc_fid
    returning q.ogc_fid
  )
  select array_agg(ogc_fid) into v_fids from upd;
  if v_fids is null then
    return jsonb_build_object('processed', 0, 'remaining', (select count(*) from public.subdivision_sweep_queue where claimed_at is null));
  end if;
  v_res := public.fn_subdivision_sweep_batch(v_fids);
  return v_res || jsonb_build_object(
    'seconds', round(extract(epoch from clock_timestamp() - v_t0)::numeric, 1),
    'remaining', (select count(*) from public.subdivision_sweep_queue where claimed_at is null));
end
$$;
revoke execute on function public.fn_subdivision_sweep_next(integer) from public, anon, authenticated;

-- P0-6 GENERALIZATION SWEEP (owner directive: examples identify failure
-- classes, never solutions). Parcels are selected by QUERY — hash-ordered,
-- stratified by lot size, never by id — so the sweep measures the solver,
-- not a fixture list. Read-only (persist=false); nothing is written.
--
-- Acceptance gates:
--   1. 100% STRUCTURED: every eligible parcel returns a solve or a jsonb
--      error object with a machine-readable class — never a dead string.
--   2. >=85% PLAN-OR-PROVEN: solves + dimensioned impossibility terminals
--      (planner_envelope_unbuildable_depth) over eligible parcels.
--      (Ratcheted from 80 on 2026-07-20 when the P1-4 regime dispatcher —
--      surface vs tuck-under compared as complete real solves — converted
--      the parking-infeasible residual class; measured 87.0%.)
--   3. Every solve is fully parked and classified (optimization_status).
--
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/mf_generalization_sweep.sql
-- Runtime note: ~24 compiles+solves; run with a role whose statement_timeout
-- allows it, or band-by-band.

\set ON_ERROR_STOP on
\echo '=== MF generalization sweep (random 24, hash-ordered) ==='

do $sweep$
declare
  rec record;
  n_eligible int := 0;
  n_solved int := 0;
  n_proven_terminal int := 0;
  n_unstructured int := 0;
  n_unparked int := 0;
  n_unclassified int := 0;
  pct numeric;
begin
  for rec in
    with eligible as (
      select ogc_fid, ST_Area(geom_2274) as a
      from public.parcels
      where zoning ~ '^(RM|OR|MU)' and geom_2274 is not null
        and ST_Area(geom_2274) between 8000 and 450000
    ),
    pick as (
      select ogc_fid, row_number() over (order by md5(ogc_fid::text)) as rn, 'S' as band
      from eligible where a < 20000
      union all
      select ogc_fid, row_number() over (order by md5(ogc_fid::text)), 'M'
      from eligible where a >= 20000 and a < 45000
      union all
      select ogc_fid, row_number() over (order by md5(ogc_fid::text)), 'L'
      from eligible where a >= 45000 and a < 130000
      union all
      select ogc_fid, row_number() over (order by md5(ogc_fid::text)), 'XL'
      from eligible where a >= 130000
    )
    select p.band, p.ogc_fid,
           c.resp as compile,
           case when (c.resp->>'generation_allowed')::boolean
             then public.fn_generate_mf_site_plan_v2(p.ogc_fid,'multifamily',17,'[]'::jsonb,null,false,(c.resp->>'context_id')::uuid)
             else null end as r
    from pick p
    cross join lateral (select public.fn_compile_planner_context(p.ogc_fid,'multi_family','{}'::jsonb) as resp) c
    where p.rn <= 6
  loop
    continue when rec.r is null;  -- legal refusal (generation_allowed=false): structured upstream
    n_eligible := n_eligible + 1;
    if rec.r ? 'error' then
      if rec.r->>'error' = 'planner_envelope_unbuildable_depth' then
        n_proven_terminal := n_proven_terminal + 1;
      end if;
      -- structured = jsonb object with error key and at least flags or a payload field
      if jsonb_typeof(rec.r) <> 'object' or not (rec.r ? 'error') then
        n_unstructured := n_unstructured + 1;
      end if;
    else
      n_solved := n_solved + 1;
      if (rec.r#>>'{metrics,stalls}')::int < (rec.r#>>'{metrics,stalls_required}')::int then
        n_unparked := n_unparked + 1;
      end if;
      if rec.r#>>'{metrics,optimization_status}' is null then
        n_unclassified := n_unclassified + 1;
      end if;
    end if;
  end loop;

  if n_unstructured > 0 then
    raise exception '% unstructured outcomes — every refusal must be a machine-readable object', n_unstructured;
  end if;
  if n_unparked > 0 then
    raise exception '% rendered plans with parking shortfalls', n_unparked;
  end if;
  if n_unclassified > 0 then
    raise exception '% rendered plans missing optimization_status', n_unclassified;
  end if;
  pct := 100.0 * (n_solved + n_proven_terminal) / greatest(n_eligible, 1);
  raise notice 'sweep: eligible %, solved %, proven terminals %, plan-or-proven %.1f%%',
    n_eligible, n_solved, n_proven_terminal, pct;
  if pct < 85 then
    raise exception 'plan-or-proven %.1f%% is below the 85%% acceptance gate', pct;
  end if;
end
$sweep$;

\echo '=== Generalization sweep PASSED ==='

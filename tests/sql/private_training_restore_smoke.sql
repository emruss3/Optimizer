-- Private training restore smoke assertions
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/private_training_restore_smoke.sql
--
-- Verifies the invariants that must hold after restoring the owner-controlled
-- private corpus (docs/private-training-backup-scope.md). It checks structure
-- and policy gates only and never selects private row contents.

\set ON_ERROR_STOP on
\echo '=== Private Training Restore Smoke Tests ==='

do $private_smoke$
declare
  v_count bigint;
begin
  -- Both root datasets restored with the owner rights contract intact.
  select count(*) into v_count
  from training.dataset_registry
  where slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
    and training_use_status = 'approved'
    and commercial_use_allowed is true
    and license_fee_required is false
    and model_training_allowed is true
    and redistribution_allowed is false
    and metadata->>'source_confidentiality' = 'private_project_documents'
    and coalesce((metadata->>'geometry_training_weight')::numeric, 0) = 0;
  if v_count <> 2 then
    raise exception 'owned dataset rights/geometry contract count is %, expected 2', v_count;
  end if;

  -- No viewer capability may exist after a restore: neither the capability
  -- keys themselves nor an unexpired token.
  select count(*) into v_count
  from training.dataset_artifacts a
  join training.dataset_registry d on d.id = a.dataset_id
  where d.slug like 'owned_%'
    and a.metadata ?| array['viewer_token','viewer_expires_at','viewer_issued_at'];
  if v_count <> 0 then
    raise exception '% owned artifact(s) carry viewer capability metadata; restores must not recreate viewer capabilities', v_count;
  end if;

  -- Every owned building interior must keep its eligibility linkage: a raw
  -- document with the same (dataset_id, source_record_id). Broken linkage
  -- would silently drop rows from training.v_training_examples.
  select count(*) into v_count
  from training.building_interiors b
  join training.dataset_registry d on d.id = b.dataset_id
  where d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
    and not exists (
      select 1 from training.raw_documents r
      where r.dataset_id = b.dataset_id
        and r.source_record_id = b.source_record_id
    );
  if v_count <> 0 then
    raise exception '% owned building interior(s) lost their raw_documents linkage', v_count;
  end if;

  -- All owned artifacts, precedents, and interiors resolve to a root dataset
  -- and each root dataset has at least one artifact and one precedent.
  select count(*) into v_count
  from training.dataset_registry d
  where d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
    and (
      not exists (select 1 from training.dataset_artifacts a where a.dataset_id = d.id)
      or not exists (select 1 from training.site_precedents p where p.dataset_id = d.id)
    );
  if v_count <> 0 then
    raise exception '% root dataset(s) are missing artifacts or precedents after restore', v_count;
  end if;

  -- The source-controlled owned release exists and links both root datasets.
  select count(*) into v_count
  from training.training_release_datasets trd
  join training.training_releases tr on tr.id = trd.release_id
  join training.dataset_registry d on d.id = trd.dataset_id
  where tr.name = 'parcelmap_owned_us_precedents'
    and tr.version = '0.1.0'
    and d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311');
  if v_count <> 2 then
    raise exception 'parcelmap_owned_us_precedents 0.1.0 links % root dataset(s), expected 2', v_count;
  end if;

  -- Owned program templates must never arrive approved for generation.
  select count(*) into v_count
  from training.program_templates pt
  join training.dataset_registry d on d.id = pt.source_dataset_id
  where d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
    and pt.approved_for_generation;
  if v_count <> 0 then
    raise exception '% owned program template(s) are approved for generation; expected 0 pending QA gates', v_count;
  end if;

  -- No active viewer token anywhere on owned datasets (mirrors the private
  -- safety check in docs/training-corpus-migration.md).
  select count(*) into v_count
  from training.dataset_artifacts a
  join training.dataset_registry d on d.id = a.dataset_id
  where d.slug like 'owned_%'
    and a.metadata ? 'viewer_token'
    and nullif(a.metadata->>'viewer_expires_at','')::timestamptz > now();
  if v_count <> 0 then
    raise exception '% active viewer token(s) exist on owned artifacts; expected 0', v_count;
  end if;

  -- Ingestion enablement key must exist (the migrations create it with a safe
  -- default); its value is intentionally not asserted because restores must
  -- leave it unchanged.
  select count(*) into v_count
  from training.runtime_config
  where key = 'ingestion_enabled';
  if v_count <> 1 then
    raise exception 'training.runtime_config ingestion_enabled key is missing';
  end if;
end
$private_smoke$;

\echo '--- Owned closure row counts (no private contents) ---'
select d.slug,
       (select count(*) from training.dataset_artifacts a where a.dataset_id = d.id) as artifacts,
       (select count(*) from training.raw_documents r where r.dataset_id = d.id) as raw_documents,
       (select count(*) from training.site_precedents p where p.dataset_id = d.id) as site_precedents,
       (select count(*) from training.building_interiors b where b.dataset_id = d.id) as building_interiors,
       (select count(*) from training.program_templates t where t.source_dataset_id = d.id) as program_templates
from training.dataset_registry d
where d.slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
order by d.slug;

\echo '=== Private Training Restore Smoke Tests Passed ==='

-- Training corpus smoke assertions
-- Usage: psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f tests/sql/training_corpus_smoke.sql

\set ON_ERROR_STOP on
\echo '=== Training Corpus Smoke Tests ==='

do $smoke$
declare
  v_missing text[];
  v_count bigint;
  v_definition text;
begin
  if to_regnamespace('training') is null then
    raise exception 'training schema is missing';
  end if;

  select array_agg(name order by name)
  into v_missing
  from unnest(array[
    'dataset_registry',
    'dataset_artifacts',
    'raw_documents',
    'ingestion_jobs',
    'building_interiors',
    'interior_spaces',
    'interior_connections',
    'interior_elements',
    'program_templates',
    'training_releases',
    'training_release_datasets',
    'runtime_config'
  ]) as required(name)
  where to_regclass(format('training.%I', name)) is null;

  if v_missing is not null then
    raise exception 'missing training tables: %', v_missing;
  end if;

  if to_regclass('training.v_training_examples') is null then
    raise exception 'training.v_training_examples is missing';
  end if;

  if to_regprocedure('training.normalize_procthor(integer,boolean)') is null then
    raise exception 'training.normalize_procthor(integer,boolean) is missing';
  end if;

  if to_regprocedure('training.refresh_us_commercial_corpus()') is null then
    raise exception 'training.refresh_us_commercial_corpus() is missing';
  end if;

  if to_regprocedure('training.invoke_ingestion_job(uuid)') is null then
    raise exception 'training.invoke_ingestion_job(uuid) is missing';
  end if;

  if to_regprocedure('training.enforce_ingestion_enabled()') is null then
    raise exception 'training.enforce_ingestion_enabled() is missing';
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgname='raw_documents_license_gate' and not tgisinternal;
  if v_count <> 1 then
    raise exception 'raw_documents license gate trigger count is %, expected 1', v_count;
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgname='ingestion_jobs_enabled_gate' and not tgisinternal;
  if v_count <> 1 then
    raise exception 'ingestion enablement trigger count is %, expected 1', v_count;
  end if;

  select count(*) into v_count
  from training.dataset_registry
  where slug='procthor_10k'
    and training_use_status='approved'
    and commercial_use_allowed is true
    and license_fee_required is false
    and model_training_allowed is true;
  if v_count <> 1 then
    raise exception 'ProcTHOR license gate is not fully approved';
  end if;

  select count(*) into v_count
  from training.v_training_examples;
  if v_count < 484 then
    raise exception 'eligible training example count is %, expected at least 484', v_count;
  end if;

  select count(*) into v_count
  from training.building_interiors b
  join training.dataset_registry d on d.id=b.dataset_id
  where d.slug='openstudio_us_commercial_archetypes'
    and b.approved_for_training;
  if v_count < 20 then
    raise exception 'OpenStudio approved model count is %, expected at least 20', v_count;
  end if;

  select count(*) into v_count
  from training.interior_spaces s
  join training.building_interiors b on b.id=s.interior_id
  join training.dataset_registry d on d.id=b.dataset_id
  where d.slug='openstudio_us_commercial_archetypes';
  if v_count < 749 then
    raise exception 'OpenStudio normalized space count is %, expected at least 749', v_count;
  end if;

  select count(*) into v_count
  from training.interior_spaces s
  join training.building_interiors b on b.id=s.interior_id
  join training.dataset_registry d on d.id=b.dataset_id
  where d.slug='openstudio_us_commercial_archetypes'
    and s.space_type='other';
  if v_count <> 0 then
    raise exception 'OpenStudio has % unclassified spaces, expected 0', v_count;
  end if;

  select count(*) into v_count
  from training.program_templates p
  join training.dataset_registry d on d.id=p.source_dataset_id
  where d.slug='openstudio_us_commercial_archetypes';
  if v_count < 20 then
    raise exception 'OpenStudio program template count is %, expected at least 20', v_count;
  end if;

  select count(*) into v_count
  from training.program_templates p
  join training.dataset_registry d on d.id=p.source_dataset_id
  where d.slug='openstudio_us_commercial_archetypes'
    and p.approved_for_generation;
  if v_count <> 0 then
    raise exception '% OpenStudio templates are approved for generation; expected 0 pending review', v_count;
  end if;

  select count(*) into v_count
  from training.v_training_examples
  where dataset_slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples');
  if v_count <> 0 then
    raise exception 'parser fixtures leaked into eligible training examples: %', v_count;
  end if;

  select count(*) into v_count
  from training.dataset_registry
  where slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples')
    and coalesce(output_generation_allowed,false);
  if v_count <> 0 then
    raise exception '% parser fixture datasets allow output generation; expected 0', v_count;
  end if;

  select count(*) into v_count
  from training.dataset_registry
  where slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311')
    and training_use_status='approved'
    and commercial_use_allowed is true
    and model_training_allowed is true
    and redistribution_allowed is false
    and coalesce((metadata->>'geometry_training_weight')::numeric,0)=0;
  if v_count <> 2 then
    raise exception 'owned dataset rights/geometry gate count is %, expected 2', v_count;
  end if;

  select count(*) into v_count
  from training.v_training_examples
  where dataset_slug in ('owned_1300_4th_ave_multifamily_cd','owned_townhome_cd_20260311');
  if v_count < 14 then
    raise exception 'owned eligible example count is %, expected at least 14', v_count;
  end if;

  select count(*) into v_count
  from training.training_releases
  where (name,version,status) in (
    ('parcelmap_open_interiors','0.1.0','frozen'),
    ('parcelmap_open_interiors','0.2.0','archived'),
    ('parcelmap_owned_us_precedents','0.1.0','draft'),
    ('parcelmap_us_commercial_programs','0.1.0','draft'),
    ('parcelmap_openbim_parser_fixtures','0.1.0','draft')
  );
  if v_count <> 5 then
    raise exception 'training release status contract is incomplete: % of 5 rows matched', v_count;
  end if;

  select count(*) into v_count
  from training.runtime_config
  where key='edge_base_url' and length(btrim(value)) > 0;
  if v_count <> 1 then
    raise exception 'training.runtime_config edge_base_url is not configured';
  end if;

  select count(*) into v_count
  from training.runtime_config
  where key='ingestion_enabled'
    and lower(btrim(value)) in ('1','true','yes','on');
  if v_count <> 1 then
    raise exception 'training ingestion is not explicitly enabled for this environment';
  end if;

  select pg_get_functiondef('training.invoke_ingestion_job(uuid)'::regprocedure)
  into v_definition;
  if position('training.runtime_config' in v_definition)=0 then
    raise exception 'invoke_ingestion_job does not use training.runtime_config';
  end if;
  if position('training-model-ingest' in v_definition)=0 then
    raise exception 'invoke_ingestion_job does not route ifc_to_bim jobs to training-model-ingest';
  end if;

  if has_schema_privilege('anon','training','USAGE')
     or has_schema_privilege('authenticated','training','USAGE') then
    raise exception 'anon/authenticated unexpectedly have USAGE on training schema';
  end if;

  if has_function_privilege('anon','training.invoke_ingestion_job(uuid)','EXECUTE')
     or has_function_privilege('authenticated','training.invoke_ingestion_job(uuid)','EXECUTE')
     or has_function_privilege('anon','training.enforce_ingestion_enabled()','EXECUTE')
     or has_function_privilege('authenticated','training.enforce_ingestion_enabled()','EXECUTE') then
    raise exception 'anon/authenticated unexpectedly can control or invoke ingestion jobs';
  end if;
end
$smoke$;

\echo '--- Eligible examples by dataset and split ---'
select dataset_slug,split,count(*) as examples
from training.v_training_examples
group by dataset_slug,split
order by dataset_slug,split;

\echo '--- Release status ---'
select name,version,status
from training.training_releases
where name in (
  'parcelmap_open_interiors',
  'parcelmap_owned_us_precedents',
  'parcelmap_us_commercial_programs',
  'parcelmap_openbim_parser_fixtures'
)
order by name,version;

\echo '=== Training Corpus Smoke Tests Passed ==='

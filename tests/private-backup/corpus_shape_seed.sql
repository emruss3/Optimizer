-- SYNTHETIC open-corpus shape for running tests/sql/training_corpus_smoke.sql
-- against a disposable local database. All identifiers are SYN-* and all
-- content is fabricated; this only reproduces the SHAPE the smoke suite
-- expects from a fully ingested environment:
--   * >= 470 eligible ProcTHOR examples (plus 14 restored owned = >= 484)
--   * >= 20 approved OpenStudio interiors with >= 749 classified spaces
--   * >= 20 OpenStudio program templates, none approved for generation
-- The real classification/template/release logic runs via the committed
-- training.refresh_us_commercial_corpus() at the end, exactly like the
-- runbook's post-ingestion step.

\set ON_ERROR_STOP on

begin;

-- ProcTHOR: synthetic raw documents + interiors against the migration-seeded
-- approved registry row and its train artifact.
with ds as (
  select id from training.dataset_registry where slug = 'procthor_10k'
), art as (
  select a.id, a.dataset_id from training.dataset_artifacts a
  join ds on ds.id = a.dataset_id
  where a.name = 'train.jsonl.gz'
)
insert into training.raw_documents
  (dataset_id, artifact_id, source_record_id, record_index, split, payload,
   payload_sha256, quality_status, approved_for_training)
select art.dataset_id, art.id, 'SYN-PT-' || lpad(gs::text, 4, '0'), gs,
       case when gs <= 320 then 'train' when gs <= 400 then 'validation' else 'test' end,
       jsonb_build_object('synthetic', true, 'record', gs),
       encode(sha256(('SYN-PT-' || gs)::bytea), 'hex'), 'accepted', true
from art cross join generate_series(1, 470) gs;

insert into training.building_interiors
  (dataset_id, source_record_id, building_type, subtype, floor_no,
   gross_floor_area_sqft, approved_for_training, metadata)
select ds.id, 'SYN-PT-' || lpad(gs::text, 4, '0'), 'residential', 'synthetic', 1,
       1500 + gs, true, jsonb_build_object('synthetic', true)
from (select id from training.dataset_registry where slug = 'procthor_10k') ds
cross join generate_series(1, 470) gs;

-- OpenStudio: 25 synthetic approved archetype models, 30 spaces each, with
-- space_subtype values the committed taxonomy classifier maps to real types.
insert into training.building_interiors
  (dataset_id, source_record_id, building_type, subtype, floor_no,
   gross_floor_area_sqft, approved_for_training, metadata)
select ds.id, 'SYN-OS-' || lpad(gs::text, 3, '0'), 'office', 'synthetic_archetype', 1,
       40000 + gs * 500, true, jsonb_build_object('synthetic', true)
from (select id from training.dataset_registry where slug = 'openstudio_us_commercial_archetypes') ds
cross join generate_series(1, 25) gs;

insert into training.interior_spaces
  (interior_id, source_space_id, space_type, space_subtype, function_group,
   area_sqft, attributes)
select b.id, 'SYN-OS-SP-' || b.source_record_id || '-' || gs, 'other',
       case gs % 6
         when 0 then 'corridor'
         when 1 then 'openoffice'
         when 2 then 'lobby'
         when 3 then 'restroom'
         when 4 then 'mechanical'
         else 'closedoffice'
       end,
       null, 200 + gs * 10, jsonb_build_object('synthetic', true)
from training.building_interiors b
join training.dataset_registry d on d.id = b.dataset_id
cross join generate_series(1, 30) gs
where d.slug = 'openstudio_us_commercial_archetypes'
  and b.source_record_id like 'SYN-OS-%';

commit;

-- Run the committed classification/template/release refresh (the same call
-- the runbook makes after model ingestion completes), then self-check the
-- corpus shape the smoke suite requires (owned rows arrive later via the
-- restore under test).
do $corpus_check$
declare v bigint;
begin
  if (training.refresh_us_commercial_corpus()->>'templates_upserted')::int < 20 then
    raise exception 'refresh_us_commercial_corpus did not create the expected template volume';
  end if;

  select count(*) into v from training.v_training_examples where dataset_slug = 'procthor_10k';
  if v < 470 then
    raise exception 'synthetic ProcTHOR eligible examples: %, expected >= 470', v;
  end if;

  select count(*) into v
  from training.building_interiors b
  join training.dataset_registry d on d.id = b.dataset_id
  where d.slug = 'openstudio_us_commercial_archetypes' and b.approved_for_training;
  if v < 20 then
    raise exception 'synthetic OpenStudio approved models: %, expected >= 20', v;
  end if;

  select count(*) into v
  from training.interior_spaces s
  join training.building_interiors b on b.id = s.interior_id
  join training.dataset_registry d on d.id = b.dataset_id
  where d.slug = 'openstudio_us_commercial_archetypes' and s.space_type = 'other';
  if v <> 0 then
    raise exception 'synthetic OpenStudio has % unclassified spaces after refresh, expected 0', v;
  end if;

  select count(*) into v
  from training.program_templates p
  join training.dataset_registry d on d.id = p.source_dataset_id
  where d.slug = 'openstudio_us_commercial_archetypes' and p.approved_for_generation;
  if v <> 0 then
    raise exception '% synthetic OpenStudio templates approved for generation, expected 0', v;
  end if;
end
$corpus_check$;

\echo 'Synthetic open-corpus shape seeded and refreshed.'

-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Replaces two exploratory filenames with artifacts verified in the upstream repository.

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','replaced_by_canonical_artifact',
      'canonical_name',case a.name
        when 'ASHRAERetailStandalone.osm' then 'ASHRAE9012013RetailStandalone.osm'
        when 'ASHRAEWarehouse.osm' then 'DOERefWarehouse.osm'
      end
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id
  and d.slug='openstudio_us_commercial_archetypes'
  and a.name in ('ASHRAERetailStandalone.osm','ASHRAEWarehouse.osm');

with d as (
  select id from training.dataset_registry where slug='openstudio_us_commercial_archetypes'
), files(name,source_url,split,building_type,subtype,source_record_id) as (
  values
  ('ASHRAE9012013RetailStandalone.osm',
   'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/develop/data/geometry/ASHRAE9012013RetailStandalone.osm',
   'train','retail','standalone_retail_ashrae_2013','ASHRAE9012013RetailStandalone'),
  ('DOERefWarehouse.osm',
   'https://raw.githubusercontent.com/NatLabRockies/openstudio-standards/develop/data/geometry/DOERefWarehouse.osm',
   'train','industrial','warehouse_doe_reference','DOERefWarehouse')
)
insert into training.dataset_artifacts(
  dataset_id,name,source_url,split,media_type,file_format,compression,
  expected_records,license_scope,status,metadata,updated_at
)
select d.id,f.name,f.source_url,f.split,'text/plain','osm',null,1,'model-file','planned',
       jsonb_build_object(
         'source_record_id',f.source_record_id,
         'building_type',f.building_type,
         'subtype',f.subtype,
         'country_code','US',
         'us_archetype',true,
         'semantic_only',false,
         'parser_version','openstudio_osm_cleaner_v1'
       ),now()
from d cross join files f
on conflict(dataset_id,name) do update set
  source_url=excluded.source_url,
  split=excluded.split,
  media_type=excluded.media_type,
  file_format=excluded.file_format,
  expected_records=excluded.expected_records,
  license_scope=excluded.license_scope,
  metadata=training.dataset_artifacts.metadata || excluded.metadata,
  status=case when training.dataset_artifacts.status='ingested' then 'ingested' else 'planned' end,
  updated_at=now();

insert into training.ingestion_jobs(
  artifact_id,job_type,start_record,max_records,status,scheduled_at,result
)
select a.id,'ifc_to_bim',0,1,'queued',now(),'{}'::jsonb
from training.dataset_artifacts a
join training.dataset_registry d on d.id=a.dataset_id
where d.slug='openstudio_us_commercial_archetypes'
  and a.name in ('ASHRAE9012013RetailStandalone.osm','DOERefWarehouse.osm')
on conflict(artifact_id,job_type,start_record,max_records) do update set
  status=case when training.ingestion_jobs.status='completed' then 'completed' else 'queued' end,
  scheduled_at=now(),
  last_error=null,
  updated_at=now();

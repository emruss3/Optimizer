-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

insert into training.dataset_artifacts (
  dataset_id, name, source_url, split, media_type, file_format, compression,
  checksum_algorithm, checksum_value, byte_size, expected_records, status, metadata
)
select id, 'train.jsonl.gz',
       'https://github.com/allenai/procthor-10k/raw/refs/heads/main/train.jsonl.gz',
       'train', 'application/gzip', 'jsonl', 'gzip', 'sha256',
       'ee3c4aa14b4d8f0895fecfb5fdaca59395427ca1018b2f9aeeedbc61e5824587',
       53314510, 10000, 'planned', jsonb_build_object('git_lfs',true)
from training.dataset_registry where slug='procthor_10k'
on conflict (dataset_id, name) do update set
  source_url=excluded.source_url, checksum_algorithm=excluded.checksum_algorithm,
  checksum_value=excluded.checksum_value, byte_size=excluded.byte_size,
  expected_records=excluded.expected_records, updated_at=now();

insert into training.dataset_artifacts (
  dataset_id, name, source_url, split, media_type, file_format, compression,
  checksum_algorithm, checksum_value, byte_size, expected_records, status, metadata
)
select id, 'val.jsonl.gz',
       'https://github.com/allenai/procthor-10k/raw/refs/heads/main/val.jsonl.gz',
       'validation', 'application/gzip', 'jsonl', 'gzip', 'sha256',
       'd808540514e26b6726cd2790490e669b572eeb94febb5188a2f403591dd21721',
       5094681, 1000, 'planned', jsonb_build_object('git_lfs',true)
from training.dataset_registry where slug='procthor_10k'
on conflict (dataset_id, name) do update set
  source_url=excluded.source_url, checksum_algorithm=excluded.checksum_algorithm,
  checksum_value=excluded.checksum_value, byte_size=excluded.byte_size,
  expected_records=excluded.expected_records, updated_at=now();

insert into training.dataset_artifacts (
  dataset_id, name, source_url, split, media_type, file_format, compression,
  checksum_algorithm, checksum_value, byte_size, expected_records, status, metadata
)
select id, 'test.jsonl.gz',
       'https://github.com/allenai/procthor-10k/raw/refs/heads/main/test.jsonl.gz',
       'test', 'application/gzip', 'jsonl', 'gzip', 'sha256',
       '9a9fa6f134e76fe87f3fd92c00883651cf9fadf4e9ad4072d6d73be229f001dc',
       5022093, 1000, 'planned', jsonb_build_object('git_lfs',true)
from training.dataset_registry where slug='procthor_10k'
on conflict (dataset_id, name) do update set
  source_url=excluded.source_url, checksum_algorithm=excluded.checksum_algorithm,
  checksum_value=excluded.checksum_value, byte_size=excluded.byte_size,
  expected_records=excluded.expected_records, updated_at=now();

insert into training.dataset_artifacts (
  dataset_id, name, source_url, split, media_type, file_format, compression,
  checksum_algorithm, checksum_value, byte_size, expected_records, status, metadata
)
select id, 'swiss-dwellings-v3.0.0.zip',
       'https://zenodo.org/records/7788422/files/swiss-dwellings-v3.0.0.zip?download=1',
       'unassigned', 'application/zip', 'csv_bundle', 'zip', 'md5',
       '3b7915ecd5bf8e492a3e78c598b74123', 931900000, 45176, 'planned',
       jsonb_build_object('excluded_files',array['location_ratings.csv'])
from training.dataset_registry where slug='swiss_dwellings'
on conflict (dataset_id, name) do update set
  source_url=excluded.source_url, checksum_algorithm=excluded.checksum_algorithm,
  checksum_value=excluded.checksum_value, byte_size=excluded.byte_size,
  expected_records=excluded.expected_records, updated_at=now();

insert into training.ingestion_jobs (artifact_id, start_record, max_records)
select id, 0, 250 from training.dataset_artifacts where name='train.jsonl.gz'
on conflict do nothing;
insert into training.ingestion_jobs (artifact_id, start_record, max_records)
select id, 0, 100 from training.dataset_artifacts where name='val.jsonl.gz'
on conflict do nothing;
insert into training.ingestion_jobs (artifact_id, start_record, max_records)
select id, 0, 100 from training.dataset_artifacts where name='test.jsonl.gz'
on conflict do nothing;

insert into training.training_releases(name, version, description, manifest)
values ('parcelmap_open_interiors','0.1.0','Zero-license-fee commercial interior corpus foundation.',
        jsonb_build_object('license_policy','approved + commercial + no fee + model training allowed'))
on conflict (name, version) do nothing;

insert into training.training_release_datasets(release_id,dataset_id,included_splits,attribution_text)
select r.id,d.id,array['train','validation','test']::text[],d.attribution_text
from training.training_releases r
join training.dataset_registry d on d.slug='procthor_10k'
where r.name='parcelmap_open_interiors' and r.version='0.1.0'
on conflict do nothing;

insert into training.training_release_datasets(release_id,dataset_id,included_splits,attribution_text,filters)
select r.id,d.id,array['train','validation','test']::text[],d.attribution_text,
       jsonb_build_object('excluded_files',d.excluded_files)
from training.training_releases r
join training.dataset_registry d on d.slug='swiss_dwellings'
where r.name='parcelmap_open_interiors' and r.version='0.1.0'
on conflict do nothing;

-- SYNTHETIC private-corpus fixture for disposable local backup/restore testing.
--
-- Every value in this file is fabricated (SYN-* identifiers, *.invalid URLs,
-- placeholder text). It contains NO real private documents, URLs, tokens, or
-- geometry. It exists only to give the export/restore scripts a source that
-- has the same SHAPE as the documented production baseline in
-- docs/private-training-backup-scope.md:
--   dataset_artifacts 2, pdf_page_extract 7, raw_documents 14,
--   site_precedents 2, precedent_units 154, building_interiors 14,
--   interior_spaces 24, interior_connections 21, interior_elements 6,
--   program_templates 14, training_release_datasets 2 (migration-seeded).
--
-- The two owned dataset_registry rows and the owned release links are created
-- by committed migrations; this fixture only adds synthetic child rows.
-- Artifact metadata deliberately includes an ACTIVE synthetic viewer token so
-- the tests can prove the exporter strips capability fields.

\set ON_ERROR_STOP on

begin;

-- Artifacts: one synthetic CD set per root dataset, with viewer capability
-- fields that must never survive an export.
insert into training.dataset_artifacts
  (dataset_id, name, source_url, media_type, file_format, status,
   checksum_algorithm, checksum_value, byte_size, metadata)
select d.id, v.name, v.source_url, 'application/pdf', 'pdf', 'staged',
       'sha256', encode(sha256(v.name::bytea), 'hex'), v.byte_size,
       jsonb_build_object(
         'synthetic', true,
         'viewer_token', 'SYNTHETIC-VIEWER-TOKEN-' || v.tag,
         'viewer_expires_at', (now() + interval '1 hour')::text,
         'viewer_issued_at', now()::text
       )
from (values
  ('owned_1300_4th_ave_multifamily_cd', 'MF', 'synthetic-mf-cd-set.pdf',
   'https://synthetic-fixture.invalid/private/mf-cd-set.pdf', 1048576),
  ('owned_townhome_cd_20260311', 'TH', 'synthetic-th-cd-set.pdf',
   'https://synthetic-fixture.invalid/private/th-cd-set.pdf', 2097152)
) v(slug, tag, name, source_url, byte_size)
join training.dataset_registry d on d.slug = v.slug;

-- PDF page extracts: 4 synthetic pages on the MF artifact, 3 on the TH one.
insert into training.pdf_page_extract
  (artifact_id, page_number, page_width_pt, page_height_pt, text_content,
   text_sha256, parser_version, quality_status, extraction_metadata)
select a.id, gs, 2592, 1728,
       'SYNTHETIC FIXTURE PAGE ' || gs || ' — contains no real document content.',
       encode(sha256(('SYNTHETIC-' || d.slug || gs)::bytea), 'hex'),
       'fixture_parser_v1', 'extracted', jsonb_build_object('synthetic', true)
from training.dataset_artifacts a
join training.dataset_registry d on d.id = a.dataset_id
cross join lateral generate_series(1, case when d.slug = 'owned_1300_4th_ave_multifamily_cd' then 4 else 3 end) gs
where d.slug in ('owned_1300_4th_ave_multifamily_cd', 'owned_townhome_cd_20260311')
  and (a.metadata->>'synthetic')::boolean;

-- Raw documents: 7 per dataset, keyed so building_interiors stay eligible in
-- training.v_training_examples (accepted + approved + matching record ids).
insert into training.raw_documents
  (dataset_id, artifact_id, source_record_id, record_index, split, payload,
   payload_sha256, quality_status, approved_for_training)
select d.id, a.id, v.prefix || lpad(gs::text, 3, '0'), gs, 'train',
       jsonb_build_object('synthetic', true, 'record', gs, 'note', 'no real content'),
       encode(sha256((v.prefix || gs)::bytea), 'hex'), 'accepted', true
from (values
  ('owned_1300_4th_ave_multifamily_cd', 'SYN-MF-'),
  ('owned_townhome_cd_20260311', 'SYN-TH-')
) v(slug, prefix)
join training.dataset_registry d on d.slug = v.slug
join training.dataset_artifacts a on a.dataset_id = d.id and (a.metadata->>'synthetic')::boolean
cross join generate_series(1, 7) gs;

-- Site precedents: one synthetic square parcel per dataset.
insert into training.site_precedents
  (dataset_id, source_record_id, name, typology, status, city, state, country,
   parcel_geom, site_geom, site_area_sqft, units, stories, metadata)
select d.id, 'SYN-PREC-' || v.tag, 'SYNTHETIC precedent ' || v.tag, v.typology,
       'synthetic', 'Testville', 'TN', 'US',
       public.st_multi(public.st_geomfromtext(v.wkt, 4326)),
       public.st_multi(public.st_geomfromtext(v.wkt, 4326)),
       43560, 77, 3, jsonb_build_object('synthetic', true)
from (values
  ('owned_1300_4th_ave_multifamily_cd', 'MF', 'multifamily',
   'POLYGON((-86.781 36.162,-86.781 36.163,-86.780 36.163,-86.780 36.162,-86.781 36.162))'),
  ('owned_townhome_cd_20260311', 'TH', 'townhome',
   'POLYGON((-86.791 36.152,-86.791 36.153,-86.790 36.153,-86.790 36.152,-86.791 36.152))')
) v(slug, tag, typology, wkt)
join training.dataset_registry d on d.slug = v.slug;

-- Precedent units: 77 synthetic units per precedent (154 total).
insert into training.precedent_units
  (precedent_id, source_unit_id, model_unit_type, label_unit_type, variant,
   habitable_sqft, bedrooms, bathrooms, stories, metadata)
select p.id, 'SYN-U-' || lpad(gs::text, 3, '0'),
       case gs % 3 when 0 then 'B2' when 1 then 'A1' else 'C3' end,
       'Synthetic Unit ' || gs, 'standard',
       700 + gs, 1 + gs % 3, 1 + gs % 2, 1, jsonb_build_object('synthetic', true)
from training.site_precedents p
join training.dataset_registry d on d.id = p.dataset_id
cross join generate_series(1, 77) gs
where d.slug in ('owned_1300_4th_ave_multifamily_cd', 'owned_townhome_cd_20260311')
  and p.source_record_id like 'SYN-PREC-%';

-- Building interiors: 7 per dataset with raw-document linkage.
insert into training.building_interiors
  (dataset_id, source_record_id, precedent_id, building_type, subtype, floor_no,
   gross_floor_area_sqft, approved_for_training, source_file_url, metadata)
select d.id, v.prefix || lpad(gs::text, 3, '0'), p.id, v.btype, 'synthetic', 1,
       10000 + gs * 100, true,
       'https://synthetic-fixture.invalid/private/' || v.tag || '-sheet-' || gs || '.pdf',
       jsonb_build_object('synthetic', true)
from (values
  ('owned_1300_4th_ave_multifamily_cd', 'SYN-MF-', 'multifamily', 'mf'),
  ('owned_townhome_cd_20260311', 'SYN-TH-', 'townhome', 'th')
) v(slug, prefix, btype, tag)
join training.dataset_registry d on d.slug = v.slug
join training.site_precedents p on p.dataset_id = d.id and p.source_record_id like 'SYN-PREC-%'
cross join generate_series(1, 7) gs;

-- Interior spaces: 6 each on the first two interiors of each dataset (24).
-- Two thirds carry SRID-0 polygons so geometry round-tripping is exercised.
insert into training.interior_spaces
  (interior_id, source_space_id, space_type, space_subtype, function_group,
   geom, area_sqft, public_private, attributes)
select b.id, 'SYN-SP-' || b.source_record_id || '-' || gs,
       case when gs = 1 then 'corridor' else 'residential' end, 'synthetic',
       case when gs = 1 then 'circulation' else 'residential' end,
       case when gs <= 4
         then public.st_geomfromtext('POLYGON((0 0,0 10,10 10,10 0,0 0))', 0)
         else null end,
       100 + gs,
       case when gs = 1 then 'semi_public' else 'private' end,
       jsonb_build_object('synthetic', true, 'ord', gs)
from training.building_interiors b
join training.dataset_registry d on d.id = b.dataset_id
cross join generate_series(1, 6) gs
where d.slug in ('owned_1300_4th_ave_multifamily_cd', 'owned_townhome_cd_20260311')
  and b.source_record_id in ('SYN-MF-001', 'SYN-MF-002', 'SYN-TH-001', 'SYN-TH-002');

-- Interior connections: a door chain in each of the four detailed interiors
-- (5 each = 20) plus one extra visual connection (21). Identity ids of the
-- spaces are referenced, which is exactly what the restore must preserve.
insert into training.interior_connections
  (interior_id, from_space_id, to_space_id, connection_type, width_ft, accessible)
select s1.interior_id, s1.id, s2.id, 'door', 3, true
from training.interior_spaces s1
join training.interior_spaces s2
  on s2.interior_id = s1.interior_id
 and (s2.attributes->>'ord')::int = (s1.attributes->>'ord')::int + 1
where (s1.attributes->>'synthetic')::boolean
  and (s1.attributes->>'ord')::int <= 5;

insert into training.interior_connections
  (interior_id, from_space_id, to_space_id, connection_type, accessible)
select s1.interior_id, s1.id, s3.id, 'visual', null
from training.interior_spaces s1
join training.building_interiors b on b.id = s1.interior_id and b.source_record_id = 'SYN-MF-001'
join training.interior_spaces s3
  on s3.interior_id = s1.interior_id and (s3.attributes->>'ord')::int = 3
where (s1.attributes->>'ord')::int = 1;

-- Interior elements: wall/door/stair on the first interior of each dataset (6).
insert into training.interior_elements
  (interior_id, element_type, subtype, geom, quantity, attributes)
select b.id, v.etype, 'synthetic',
       case v.etype
         when 'wall' then public.st_geomfromtext('LINESTRING(0 0,10 0)', 0)
         when 'door' then public.st_geomfromtext('POINT(5 0)', 0)
         else null end,
       1, jsonb_build_object('synthetic', true)
from training.building_interiors b
join training.dataset_registry d on d.id = b.dataset_id
cross join (values ('wall'), ('door'), ('stair')) v(etype)
where d.slug in ('owned_1300_4th_ave_multifamily_cd', 'owned_townhome_cd_20260311')
  and b.source_record_id in ('SYN-MF-001', 'SYN-TH-001');

-- Program templates: 7 synthetic drafts per dataset, never generation-approved.
insert into training.program_templates
  (building_type, subtype, name, source_dataset_id, min_gfa_sqft, max_gfa_sqft,
   target_efficiency_pct, required_spaces, metadata, approved_for_generation)
select v.btype, 'synthetic', 'SYNTHETIC owned template ' || v.tag || ' ' || gs,
       d.id, 5000, 20000, 80, '[]'::jsonb,
       jsonb_build_object('synthetic', true), false
from (values
  ('owned_1300_4th_ave_multifamily_cd', 'multifamily', 'MF'),
  ('owned_townhome_cd_20260311', 'townhome', 'TH')
) v(slug, btype, tag)
join training.dataset_registry d on d.slug = v.slug
cross join generate_series(1, 7) gs;

-- Self-check: the fixture must match the documented baseline shape exactly.
do $fixture_check$
declare r record;
begin
  for r in
    select * from (values
      ('dataset_artifacts', 2, (select count(*) from training.dataset_artifacts a join training.dataset_registry d on d.id = a.dataset_id where d.slug like 'owned_%')),
      ('pdf_page_extract', 7, (select count(*) from training.pdf_page_extract p join training.dataset_artifacts a on a.id = p.artifact_id join training.dataset_registry d on d.id = a.dataset_id where d.slug like 'owned_%')),
      ('raw_documents', 14, (select count(*) from training.raw_documents x join training.dataset_registry d on d.id = x.dataset_id where d.slug like 'owned_%')),
      ('site_precedents', 2, (select count(*) from training.site_precedents x join training.dataset_registry d on d.id = x.dataset_id where d.slug like 'owned_%')),
      ('precedent_units', 154, (select count(*) from training.precedent_units u join training.site_precedents p on p.id = u.precedent_id join training.dataset_registry d on d.id = p.dataset_id where d.slug like 'owned_%')),
      ('building_interiors', 14, (select count(*) from training.building_interiors b join training.dataset_registry d on d.id = b.dataset_id where d.slug like 'owned_%')),
      ('interior_spaces', 24, (select count(*) from training.interior_spaces s join training.building_interiors b on b.id = s.interior_id join training.dataset_registry d on d.id = b.dataset_id where d.slug like 'owned_%')),
      ('interior_connections', 21, (select count(*) from training.interior_connections c join training.building_interiors b on b.id = c.interior_id join training.dataset_registry d on d.id = b.dataset_id where d.slug like 'owned_%')),
      ('interior_elements', 6, (select count(*) from training.interior_elements e join training.building_interiors b on b.id = e.interior_id join training.dataset_registry d on d.id = b.dataset_id where d.slug like 'owned_%')),
      ('program_templates', 14, (select count(*) from training.program_templates t join training.dataset_registry d on d.id = t.source_dataset_id where d.slug like 'owned_%')),
      ('training_release_datasets', 2, (select count(*) from training.training_release_datasets t join training.dataset_registry d on d.id = t.dataset_id where d.slug like 'owned_%')),
      ('v_training_examples(owned)', 14, (select count(*) from training.v_training_examples where dataset_slug like 'owned_%'))
    ) v(tbl, expected, actual)
    where v.expected <> v.actual
  loop
    raise exception 'fixture self-check failed for %: expected %, got %', r.tbl, r.expected, r.actual;
  end loop;
end
$fixture_check$;

commit;

\echo 'Synthetic private-corpus fixture seeded (baseline shape verified).'

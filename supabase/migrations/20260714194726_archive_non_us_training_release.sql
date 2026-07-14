-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Swiss Dwellings remains licensed/reference data but has zero U.S. production-precedent weight.

update training.training_releases
set status='archived',
    description='Archived because the production corpus is U.S.-first; Swiss Dwellings is not used as a U.S. design prior.',
    manifest=manifest || jsonb_build_object('production_precedent_weight',0)
where name='parcelmap_open_interiors' and version='0.2.0';

delete from training.training_release_datasets trd
using training.training_releases tr, training.dataset_registry d
where trd.release_id=tr.id
  and trd.dataset_id=d.id
  and tr.name='parcelmap_open_interiors'
  and tr.version='0.2.0'
  and d.slug='swiss_dwellings';

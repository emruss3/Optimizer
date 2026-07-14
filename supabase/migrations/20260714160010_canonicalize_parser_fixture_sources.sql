-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-14.
-- Parser fixtures are retained for IFC semantics only and have zero layout-precedent weight.

update training.dataset_registry
set training_use_status='reference_only',
    model_training_allowed=false,
    output_generation_allowed=false,
    notes='Deprecated duplicate registry row. Canonical buildingSMART PCERT source is buildingsmart_pcert_ifc_samples; retained only for audit history.',
    metadata=metadata || jsonb_build_object(
      'deprecated_duplicate',true,
      'canonical_slug','buildingsmart_pcert_ifc_samples'
    ),
    updated_at=now()
where slug='buildingsmart_sample_test_files';

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','deprecated_duplicate_registry',
      'canonical_dataset_slug','buildingsmart_pcert_ifc_samples'
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id and d.slug='buildingsmart_sample_test_files';

update training.dataset_registry
set output_generation_allowed=false,
    metadata=metadata || jsonb_build_object('precedent_weight',0,'parser_fixture_only',true),
    updated_at=now()
where slug in ('buildingsmart_pcert_ifc_samples','bim_whale_ifc_samples');

update training.dataset_artifacts a
set status='blocked',
    metadata=a.metadata || jsonb_build_object(
      'blocked_reason','source_path_not_present_in_official_repository'
    ),
    updated_at=now()
from training.dataset_registry d
where a.dataset_id=d.id
  and d.slug='buildingsmart_pcert_ifc_samples'
  and a.name in ('Infrastructure-Footing.ifc','Infrastructure-Geotech.ifc');

# Private training backup scope

This document defines the dependency closure for encrypted backup and restore of the owner-controlled training corpus. It intentionally contains no private URLs, document text, geometry, tokens, or project-file contents.

## Root datasets

- `owned_1300_4th_ave_multifamily_cd`
- `owned_townhome_cd_20260311`

Select the root `training.dataset_registry.id` values by slug at runtime. Never hardcode generated UUIDs.

## Dependency closure

Export these rows when they reference either root dataset directly or through the listed parent relationship:

| Table | Selection relationship |
|---|---|
| `training.dataset_registry` | root slug |
| `training.dataset_artifacts` | `dataset_id` |
| `training.staged_text_artifacts` | owned `artifact_id` |
| `training.pdf_page_extract` | owned `artifact_id` |
| `training.raw_documents` | `dataset_id` |
| `training.site_precedents` | `dataset_id` |
| `training.site_features` | owned `precedent_id` |
| `training.precedent_constraints` | owned `precedent_id` |
| `training.precedent_units` | owned `precedent_id` |
| `training.building_interiors` | `dataset_id` |
| `training.interior_spaces` | owned `interior_id` |
| `training.interior_connections` | owned `interior_id` |
| `training.interior_elements` | owned `interior_id` |
| `training.program_templates` | `source_dataset_id` |
| `training.training_release_datasets` | `dataset_id` |

The release rows in `training.training_releases` are source-controlled and should normally be recreated by migrations. A restore utility may verify that referenced releases exist, but should not overwrite unrelated release manifests.

## Current production baseline

The following counts were verified on July 14, 2026. They are validation baselines, not hard limits:

| Table | Rows |
|---|---:|
| `dataset_registry` | 2 |
| `dataset_artifacts` | 2 |
| `staged_text_artifacts` | 0 |
| `pdf_page_extract` | 7 |
| `raw_documents` | 14 |
| `site_precedents` | 2 |
| `site_features` | 0 |
| `precedent_constraints` | 0 |
| `precedent_units` | 154 |
| `building_interiors` | 14 |
| `interior_spaces` | 24 |
| `interior_connections` | 21 |
| `interior_elements` | 6 |
| `program_templates` | 14 |
| `training_release_datasets` | 2 |

A backup must record actual row counts in its manifest and a restore must compare restored counts to that manifest.

## Required security behavior

- Create all plaintext intermediates inside a `0700` temporary directory under `umask 077`.
- Encrypt before moving the archive to its final location. Never support a plaintext fallback.
- Use an explicit recipient or KMS-backed encryption identity supplied through the environment; never commit keys.
- Write SHA-256 checksums for every exported table file and for the final encrypted archive.
- Remove short-lived capability fields such as `viewer_token`, `viewer_expires_at`, and related issuance metadata during export. Restores must not recreate viewer capabilities.
- Keep private source URLs and extracted page text only inside the encrypted archive. Never print row contents, URLs, or text previews to logs.
- Preserve UUID values so foreign keys remain stable. Bigint identity keys are re-sequenced by the restore target (verbatim values can collide with unrelated corpus rows the target already owns); the only in-closure reference to an identity key (`interior_connections` → `interior_spaces`) is remapped so every relationship survives intact.
- Run restore in a transaction and make it idempotent with explicit conflict handling.
- Refuse to restore into an environment whose migrations are older than the manifest's required migration version.

## Suggested restore order

1. `dataset_registry`
2. `dataset_artifacts`
3. `staged_text_artifacts`, `pdf_page_extract`, `raw_documents`
4. `site_precedents`
5. `site_features`, `precedent_constraints`, `precedent_units`
6. `building_interiors`
7. `interior_spaces`
8. `interior_connections`, `interior_elements`
9. `program_templates`
10. `training_release_datasets`

After restore, run:

```bash
npm run db:smoke:training
```

The restore is not complete unless the corpus smoke test passes, public redistribution remains disabled for both root datasets, geometry-training weight remains zero, and no active viewer capability exists.

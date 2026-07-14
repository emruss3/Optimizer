# Training corpus migration runbook

This repository contains the Supabase schema and ingestion code for the open-source training corpus and the private owner-controlled precedent pipeline.

## Included in source control

- The private `training` schema and its license, artifact, ingestion, interior, precedent, release, and training-interface tables.
- ProcTHOR geometry helpers and normalizer.
- Pinned manifests for ProcTHOR, OpenStudio U.S. commercial archetypes, buildingSMART PCERT samples, and BIM Whale IFC fixtures.
- The license gate requiring approved commercial use, zero license fee, and model-training permission.
- `training-ingest` and `training-model-ingest` Edge Functions.
- `training.refresh_us_commercial_corpus()` for repeatable U.S. commercial classification, metrics, templates, and release manifests.
- Private PDF metadata, range, and text-extraction functions.
- Registry and release policies for the two owner-controlled U.S. precedent datasets.

## Excluded from this public repository

Private PDFs, CAD/BIM files, extracted private page text, temporary access capabilities, private source URLs, and unapproved private geometry are not committed. The public migrations recreate the registry and rights contract; private rows must be restored through the project's encrypted backup/private-object-store process.

## Restore order

1. Apply migrations in timestamp order. The final migration creates an ingestion enablement gate whose safe default is `false`.
2. Set the environment-specific Edge Function base URL, but do not enable ingestion yet:

```sql
insert into training.runtime_config(key,value)
values('edge_base_url','https://YOUR_PROJECT_REF.supabase.co')
on conflict(key) do update set value=excluded.value,updated_at=now();
```

3. Configure `SUPABASE_DB_URL` as an Edge Function secret. Never expose this value to browser code.
4. Deploy the capability-protected workers. They intentionally use custom one-time database nonces or short-lived document capabilities rather than Supabase JWT verification:

```bash
supabase functions deploy training-ingest --no-verify-jwt
supabase functions deploy training-model-ingest --no-verify-jwt
supabase functions deploy private-pdf-metadata --no-verify-jwt
supabase functions deploy private-pdf-proxy --no-verify-jwt
supabase functions deploy private-pdf-page-text --no-verify-jwt
supabase functions deploy private-pdf-slice-text --no-verify-jwt
```

5. After verifying the URL and deployed workers belong to this environment, explicitly enable ingestion:

```sql
insert into training.runtime_config(key,value)
values('ingestion_enabled','true')
on conflict(key) do update set value=excluded.value,updated_at=now();
```

6. Run ProcTHOR ingestion jobs:

```sql
select training.invoke_ingestion_job(id)
from training.ingestion_jobs
where job_type='jsonl_gzip_to_raw' and status in ('queued','failed','partial');
```

7. Run OpenStudio/IFC ingestion jobs:

```sql
select training.invoke_ingestion_job(id)
from training.ingestion_jobs
where job_type='ifc_to_bim' and status in ('queued','failed','partial');
```

8. Refresh the normalized commercial corpus after model ingestion finishes:

```sql
select training.refresh_us_commercial_corpus();
```

9. Restore owner-controlled rows from the encrypted backup/private object store.
10. Run the verification queries below.

To stop all new ingestion dispatches without removing workers, set `training.runtime_config.ingestion_enabled` back to `false`. Existing HTTP requests already claimed by an Edge Function are not cancelled by that setting.

## Dataset roles

| Dataset | Role | Production precedent weight |
|---|---|---:|
| `procthor_10k` | Synthetic residential topology and object semantics | Context-dependent |
| `openstudio_us_commercial_archetypes` | U.S. program and space-archetype seeds | Program prior only |
| `buildingsmart_pcert_ifc_samples` | IFC parser and semantic fixtures | 0 |
| `bim_whale_ifc_samples` | IFC hierarchy and element fixtures | 0 |
| `swiss_dwellings` | Licensed foreign reference corpus | 0 for U.S. production priors |

OpenStudio templates remain drafts until architectural review. IFC fixtures must never be used as U.S. layout precedents.

## Private owner-controlled datasets

The migrations reconcile these registry slugs without publishing their documents:

- `owned_1300_4th_ave_multifamily_cd`
- `owned_townhome_cd_20260311`

Their policy allows internal commercial model training, program extraction, context selection, and derived outputs. Public redistribution is disabled. Geometry training and direct generation remain gated by rendered-sheet and dimensional QA.

The secure restore should include rows tied to those slugs from:

```text
training.dataset_artifacts
training.pdf_page_extract
training.raw_documents
training.site_precedents
training.precedent_units
training.building_interiors
training.interior_spaces
training.interior_connections
training.interior_elements
training.program_templates
training.training_release_datasets
```

Do not restore expired viewer capabilities. Generate a new short-lived token only during an active private-document extraction session and revoke it afterward.

## Source-controlled private PDF functions

- `private-pdf-metadata`
- `private-pdf-proxy`
- `private-pdf-page-text`
- `private-pdf-slice-text`

Temporary diagnostic functions from the original extraction are deliberately not part of the portable deployment package:

- `private-pdf-stage`
- `private-pdf-extract`
- `private-pdf-range-probe`
- `edge-capabilities`

## Automated smoke tests

The database checks are fail-fast and use `psql` with `ON_ERROR_STOP=1`:

```bash
export SUPABASE_DB_URL='postgresql://...'
npm run db:smoke:all
```

`db:smoke:all` runs the existing application RPC smoke suite and `tests/sql/training_corpus_smoke.sql`. The corpus suite verifies the license trigger, explicit ingestion enablement gate, required schema objects, the minimum eligible-example baseline, OpenStudio normalization coverage, draft-only generation status, parser-fixture isolation, owner-controlled rights gates, release statuses, environment-specific runtime routing, and denial of anonymous ingestion access.

GitHub Actions runs the same command when the repository has an Actions secret named `SUPABASE_DB_URL`. Pull requests without that secret still run type checking, linting, and unit tests, but the workflow clearly reports that database checks were skipped. Point this secret at staging or a Supabase development branch rather than production whenever possible.

## Verification

### Dataset rights

```sql
select slug,
       training_use_status,
       commercial_use_allowed,
       license_fee_required,
       model_training_allowed,
       output_generation_allowed,
       redistribution_allowed
from training.dataset_registry
order by slug;
```

### Eligible examples

```sql
select dataset_slug, split, count(*)
from training.v_training_examples
group by dataset_slug, split
order by dataset_slug, split;
```

### Release manifests

```sql
select name, version, status, manifest
from training.training_releases
order by name, version;
```

### U.S. commercial refresh

```sql
select training.refresh_us_commercial_corpus();
```

### Runtime dispatch safety

```sql
select key,value,updated_at
from training.runtime_config
where key in ('edge_base_url','ingestion_enabled')
order by key;
```

Expected: the URL points to the current environment and `ingestion_enabled` is `true` only after the workers and secret have been configured.

### Private safety check

```sql
select d.slug,
       d.redistribution_allowed,
       d.metadata->>'source_confidentiality' as confidentiality,
       count(*) filter (
         where a.metadata ? 'viewer_token'
           and nullif(a.metadata->>'viewer_expires_at','')::timestamptz > now()
       ) as active_viewer_tokens
from training.dataset_registry d
left join training.dataset_artifacts a on a.dataset_id=d.id
where d.slug like 'owned_%'
group by d.slug,d.redistribution_allowed,d.metadata;
```

Expected: private confidentiality metadata, `redistribution_allowed = false`, and zero active viewer tokens outside an active extraction session.

## Release rules

- Frozen releases are immutable baselines.
- Draft releases may be regenerated as parsers improve.
- Parser fixtures always have precedent weight `0`.
- Rights approval and geometry-quality approval are separate gates.
- No template is approved for direct generation solely because its source is licensed or owner-controlled.

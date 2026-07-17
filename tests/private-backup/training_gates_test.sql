-- SQL-verifiable ingestion-gate assertions for a disposable local database.
--
-- Covers the Workstream A behaviors that do not require deployed Edge
-- Functions: the explicit ingestion enablement gate, fail-closed routing for
-- unsupported job types, nonce rotation on every dispatch, the raw-document
-- license gate, parser-fixture isolation, job status transitions, and
-- anon/authenticated privilege denial. Everything here uses SYN-* synthetic
-- rows; net.http_post is a local stub that performs no network I/O.
--
-- What this file intentionally does NOT cover (requires a staging deployment):
-- Edge Function nonce validation/replay rejection, capability-protected PDF
-- endpoints, and end-to-end job execution.

\set ON_ERROR_STOP on
\echo '=== Training ingestion gate tests (local, synthetic) ==='

-- Probe rows: a pending-review dataset (license gate must block it) and a
-- synthetic artifact under the approved ProcTHOR dataset (gate must pass it).
begin;
insert into training.dataset_registry
  (slug, name, dataset_type, provider, training_use_status,
   commercial_use_allowed, license_fee_required, model_training_allowed)
values ('synthetic_gate_probe', 'SYNTHETIC gate probe', 'other', 'local test',
        'pending_review', true, false, false)
on conflict (slug) do nothing;

insert into training.dataset_artifacts
  (dataset_id, name, source_url, file_format, status, metadata)
select d.id, v.name, 'https://synthetic-fixture.invalid/' || v.name, 'jsonl', 'staged',
       jsonb_build_object('synthetic', true)
from (values ('gate-probe.jsonl'), ('gate-probe-2.jsonl')) v(name)
cross join training.dataset_registry d
where d.slug = 'synthetic_gate_probe';

insert into training.dataset_artifacts
  (dataset_id, name, source_url, file_format, status, metadata)
select d.id, 'syn-approved-probe.jsonl.gz', 'https://synthetic-fixture.invalid/ok.jsonl.gz',
       'jsonl', 'staged', jsonb_build_object('synthetic', true)
from training.dataset_registry d
where d.slug = 'procthor_10k';
commit;

do $gates$
declare
  v_text text;
  v_count bigint;
  v_job uuid;
  v_job2 uuid;
  v_nonce1 uuid;
  v_nonce2 uuid;
  v_req1 bigint;
  v_req2 bigint;
  v_raised boolean;
  v_probe_artifact uuid;
  v_probe_artifact2 uuid;
  v_approved_artifact uuid;
begin
  select a.id into v_probe_artifact
  from training.dataset_artifacts a join training.dataset_registry d on d.id = a.dataset_id
  where d.slug = 'synthetic_gate_probe' and a.name = 'gate-probe.jsonl';
  select a.id into v_probe_artifact2
  from training.dataset_artifacts a join training.dataset_registry d on d.id = a.dataset_id
  where d.slug = 'synthetic_gate_probe' and a.name = 'gate-probe-2.jsonl';
  select a.id into v_approved_artifact
  from training.dataset_artifacts a join training.dataset_registry d on d.id = a.dataset_id
  where d.slug = 'procthor_10k' and a.name = 'syn-approved-probe.jsonl.gz';

  -- G1: safe defaults from migrations — ingestion disabled, base URL present.
  select value into v_text from training.runtime_config where key = 'ingestion_enabled';
  if lower(coalesce(v_text, '')) in ('1','true','yes','on') then
    raise exception 'G1: ingestion_enabled should default to false, found %', v_text;
  end if;
  select count(*) into v_count from training.runtime_config where key = 'edge_base_url' and length(btrim(value)) > 0;
  if v_count <> 1 then
    raise exception 'G1: edge_base_url runtime key is missing';
  end if;
  raise notice 'G1 PASS: safe runtime defaults (ingestion disabled, base URL configured)';

  -- G2: queueing a job while ingestion is disabled must fail closed.
  v_raised := false;
  begin
    insert into training.ingestion_jobs (artifact_id, job_type, start_record, max_records)
    values (v_probe_artifact, 'jsonl_gzip_to_raw', 0, 10);
  exception when others then
    v_raised := true;
    if position('ingestion is disabled' in SQLERRM) = 0 then
      raise exception 'G2: queued insert failed with an unexpected error: %', SQLERRM;
    end if;
  end;
  if not v_raised then
    raise exception 'G2: queued job insert succeeded while ingestion was disabled';
  end if;
  raise notice 'G2 PASS: disabled gate blocks queueing new jobs';

  -- G3: explicit enablement opens queueing; status transitions work.
  update training.runtime_config set value = 'true', updated_at = now() where key = 'ingestion_enabled';

  insert into training.ingestion_jobs (artifact_id, job_type, start_record, max_records)
  values (v_probe_artifact, 'jsonl_gzip_to_raw', 0, 10)
  returning id into v_job;

  update training.ingestion_jobs set status = 'running', started_at = now() where id = v_job;
  update training.ingestion_jobs set status = 'completed', completed_at = now() where id = v_job;
  update training.ingestion_jobs set status = 'partial' where id = v_job;
  update training.ingestion_jobs set status = 'failed', last_error = 'synthetic failure' where id = v_job;

  v_raised := false;
  begin
    update training.ingestion_jobs set status = 'not_a_status' where id = v_job;
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'G3: invalid job status was accepted';
  end if;
  raise notice 'G3 PASS: enablement opens queueing; queued→running→completed/partial/failed transitions hold; invalid status rejected';

  -- G4: re-disabling blocks both new queued inserts and re-queue updates.
  update training.runtime_config set value = 'false', updated_at = now() where key = 'ingestion_enabled';
  v_raised := false;
  begin
    update training.ingestion_jobs set status = 'queued' where id = v_job;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'G4: re-queue update succeeded while ingestion was disabled';
  end if;
  raise notice 'G4 PASS: disabled gate also blocks re-queueing existing jobs';

  -- G5: dispatch routing. Unknown job id and unsupported job types fail
  -- closed; supported types rotate the one-time nonce on every dispatch.
  v_raised := false;
  begin
    perform training.invoke_ingestion_job(gen_random_uuid());
  exception when others then
    v_raised := true;
    if position('Unknown ingestion job' in SQLERRM) = 0 then
      raise exception 'G5: unknown-job invoke raised unexpected error: %', SQLERRM;
    end if;
  end;
  if not v_raised then
    raise exception 'G5: invoking an unknown job id did not fail';
  end if;

  -- Unsupported job type (inserted in a non-queued state so the enablement
  -- gate is not what rejects it).
  insert into training.ingestion_jobs (artifact_id, job_type, start_record, max_records, status)
  values (v_probe_artifact, 'normalize_raw', 0, 10, 'failed')
  returning id into v_job2;
  v_raised := false;
  begin
    perform training.invoke_ingestion_job(v_job2);
  exception when others then
    v_raised := true;
    if position('No deployed ingestion worker' in SQLERRM) = 0 then
      raise exception 'G5: unsupported job type raised unexpected error: %', SQLERRM;
    end if;
  end;
  if not v_raised then
    raise exception 'G5: unsupported job type did not fail closed';
  end if;

  -- Supported dispatch (ingestion re-enabled): nonce must rotate per dispatch
  -- so a captured nonce is single-use at the database level.
  update training.runtime_config set value = 'true', updated_at = now() where key = 'ingestion_enabled';
  update training.runtime_config set value = 'http://disposable-local.invalid', updated_at = now() where key = 'edge_base_url';

  insert into training.ingestion_jobs (artifact_id, job_type, start_record, max_records)
  values (v_approved_artifact, 'jsonl_gzip_to_raw', 0, 25)
  returning id into v_job;

  select invocation_nonce into v_nonce1 from training.ingestion_jobs where id = v_job;
  select training.invoke_ingestion_job(v_job) into v_req1;
  select invocation_nonce into v_nonce2 from training.ingestion_jobs where id = v_job;
  if v_nonce1 = v_nonce2 then
    raise exception 'G5: invocation nonce did not rotate on dispatch';
  end if;

  v_nonce1 := v_nonce2;
  select training.invoke_ingestion_job(v_job) into v_req2;
  select invocation_nonce into v_nonce2 from training.ingestion_jobs where id = v_job;
  if v_nonce1 = v_nonce2 then
    raise exception 'G5: invocation nonce did not rotate on re-dispatch';
  end if;
  if v_req1 is null or v_req2 is null or v_req1 = v_req2 then
    raise exception 'G5: dispatch request ids were not recorded distinctly';
  end if;

  select count(*) into v_count from net._stub_requests
  where url = 'http://disposable-local.invalid/functions/v1/training-ingest';
  if v_count < 2 then
    raise exception 'G5: expected 2 stubbed dispatches to training-ingest, found %', v_count;
  end if;

  -- ifc_to_bim routes to training-model-ingest.
  insert into training.ingestion_jobs (artifact_id, job_type, start_record, max_records)
  values (v_approved_artifact, 'ifc_to_bim', 0, 25)
  returning id into v_job2;
  perform training.invoke_ingestion_job(v_job2);
  select count(*) into v_count from net._stub_requests
  where url = 'http://disposable-local.invalid/functions/v1/training-model-ingest';
  if v_count < 1 then
    raise exception 'G5: ifc_to_bim did not route to training-model-ingest';
  end if;
  raise notice 'G5 PASS: unknown/unsupported dispatches fail closed; nonce rotates per dispatch; routing matches job type';

  -- Leave the gate closed, mirroring the safe default.
  update training.runtime_config set value = 'false', updated_at = now() where key = 'ingestion_enabled';

  -- G6: license gate blocks training-approved raw documents for datasets that
  -- are not approved zero-fee commercial model-training sources.
  v_raised := false;
  begin
    insert into training.raw_documents
      (dataset_id, artifact_id, source_record_id, record_index, split, payload,
       payload_sha256, quality_status, approved_for_training)
    select d.id, v_probe_artifact, 'SYN-GATE-001', 1, 'train',
           jsonb_build_object('synthetic', true),
           encode(sha256('SYN-GATE-001'::bytea), 'hex'), 'accepted', true
    from training.dataset_registry d where d.slug = 'synthetic_gate_probe';
  exception when others then
    v_raised := true;
    if position('not approved for zero-fee commercial model training' in SQLERRM) = 0 then
      raise exception 'G6: license gate raised unexpected error: %', SQLERRM;
    end if;
  end;
  if not v_raised then
    raise exception 'G6: license gate allowed an unapproved dataset into approved training rows';
  end if;

  insert into training.raw_documents
    (dataset_id, artifact_id, source_record_id, record_index, split, payload,
     payload_sha256, quality_status, approved_for_training)
  select d.id, v_probe_artifact, 'SYN-GATE-002', 2, 'train',
         jsonb_build_object('synthetic', true),
         encode(sha256('SYN-GATE-002'::bytea), 'hex'), 'unreviewed', false
  from training.dataset_registry d where d.slug = 'synthetic_gate_probe';

  v_raised := false;
  begin
    update training.raw_documents set approved_for_training = true
    where source_record_id = 'SYN-GATE-002';
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'G6: license gate allowed flipping an unapproved row to approved';
  end if;
  raise notice 'G6 PASS: raw-document license gate blocks unapproved datasets on insert and update';

  -- G7: parser fixtures stay isolated — output generation is denied, their
  -- precedent weight is zero, and nothing from them is visible in
  -- v_training_examples (mirrors the committed corpus smoke contract).
  select count(*) into v_count
  from training.dataset_registry
  where slug in ('buildingsmart_pcert_ifc_samples', 'bim_whale_ifc_samples')
    and (coalesce(output_generation_allowed, false)
         or coalesce((metadata->>'precedent_weight')::numeric, 0) <> 0
         or not coalesce((metadata->>'parser_fixture_only')::boolean, false));
  if v_count <> 0 then
    raise exception 'G7: % parser fixture dataset(s) violate the isolation contract', v_count;
  end if;
  select count(*) into v_count
  from training.v_training_examples
  where dataset_slug in ('buildingsmart_pcert_ifc_samples', 'bim_whale_ifc_samples');
  if v_count <> 0 then
    raise exception 'G7: parser fixtures leaked into v_training_examples';
  end if;
  raise notice 'G7 PASS: parser fixtures cannot train or generate';

  -- G8: anon/authenticated have no access to the training schema or the
  -- ingestion control functions.
  if has_schema_privilege('anon', 'training', 'USAGE')
     or has_schema_privilege('authenticated', 'training', 'USAGE')
     or has_function_privilege('anon', 'training.invoke_ingestion_job(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'training.invoke_ingestion_job(uuid)', 'EXECUTE') then
    raise exception 'G8: anon/authenticated unexpectedly have training privileges';
  end if;
  raise notice 'G8 PASS: anon/authenticated denied on training schema and dispatch functions';
end
$gates$;

\echo '=== Training ingestion gate tests passed ==='

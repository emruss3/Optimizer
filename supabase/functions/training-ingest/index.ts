import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
if (!dbUrl) throw new Error("SUPABASE_DB_URL is not configured");

const sql = postgres(dbUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 10,
});

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

type JobRow = {
  job_id: string;
  job_type: string;
  start_record: number;
  max_records: number;
  artifact_id: string;
  artifact_name: string;
  source_url: string;
  split: "train" | "validation" | "test" | "unassigned" | "excluded";
  compression: string | null;
  expected_records: number | null;
  dataset_id: string;
  dataset_slug: string;
  training_use_status: string;
  commercial_use_allowed: boolean | null;
  license_fee_required: boolean;
  model_training_allowed: boolean | null;
};

type IncomingRecord = {
  source_record_id: string;
  record_index: number;
  payload: Record<string, unknown>;
};

async function flushBatch(job: JobRow, batch: IncomingRecord[]): Promise<number> {
  if (batch.length === 0) return 0;

  const result = await sql`
    with incoming as (
      select *
      from jsonb_to_recordset(${sql.json(batch)}::jsonb)
        as x(source_record_id text, record_index bigint, payload jsonb)
    )
    insert into training.raw_documents (
      dataset_id,
      artifact_id,
      source_record_id,
      record_index,
      split,
      payload,
      payload_sha256,
      quality_status,
      approved_for_training
    )
    select
      ${job.dataset_id}::uuid,
      ${job.artifact_id}::uuid,
      incoming.source_record_id,
      incoming.record_index,
      ${job.split},
      incoming.payload,
      encode(extensions.digest(incoming.payload::text, 'sha256'), 'hex'),
      'unreviewed',
      true
    from incoming
    on conflict (artifact_id, record_index) do update set
      source_record_id = excluded.source_record_id,
      split = excluded.split,
      payload = excluded.payload,
      payload_sha256 = excluded.payload_sha256,
      approved_for_training = true
    returning id
  `;

  return result.length;
}

async function processJsonlGzip(job: JobRow): Promise<Record<string, unknown>> {
  const source = await fetch(job.source_url, {
    redirect: "follow",
    headers: {
      accept: "application/octet-stream",
      "user-agent": "Parcelmap-Training-Ingestor/1.1",
    },
  });

  if (!source.ok || !source.body) {
    throw new Error(`Source download failed: ${source.status} ${source.statusText}`);
  }

  let byteStream: ReadableStream<Uint8Array> = source.body;
  if ((job.compression ?? "").toLowerCase() === "gzip") {
    byteStream = byteStream.pipeThrough(new DecompressionStream("gzip"));
  }

  const reader = byteStream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let absoluteIndex = 0;
  let selected = 0;
  let written = 0;
  let reachedEof = false;
  const batch: IncomingRecord[] = [];
  const batchSize = 20;

  const acceptLine = async (line: string) => {
    const index = absoluteIndex++;
    if (index < job.start_record || selected >= job.max_records) return;
    const trimmed = line.trim();
    if (!trimmed) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid JSON at record ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const metadata = payload.metadata;
    const metadataId = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).id
      : undefined;
    const candidateId = payload.id ?? payload.houseId ?? metadataId;
    const sourceRecordId = typeof candidateId === "string" && candidateId.length > 0
      ? candidateId
      : `${job.split}:${index}`;

    batch.push({ source_record_id: sourceRecordId, record_index: index, payload });
    selected++;

    if (batch.length >= batchSize) {
      written += await flushBatch(job, batch.splice(0, batch.length));
    }
  };

  try {
    while (selected < job.max_records) {
      const { value, done } = await reader.read();
      if (done) {
        reachedEof = true;
        break;
      }
      buffer += value;
      let newline = buffer.indexOf("\n");
      while (newline >= 0 && selected < job.max_records) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        await acceptLine(line);
        newline = buffer.indexOf("\n");
      }
    }

    if (reachedEof && buffer.trim() && selected < job.max_records) {
      await acceptLine(buffer);
    }
  } finally {
    if (!reachedEof) await reader.cancel("requested record limit reached").catch(() => undefined);
  }

  written += await flushBatch(job, batch.splice(0, batch.length));

  return {
    sourceRecordsScanned: absoluteIndex,
    selected,
    written,
    reachedEof,
    startRecord: job.start_record,
    requested: job.max_records,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ error: "POST required" }, 405);

  let jobId: string | undefined;
  try {
    const body = await req.json() as { job_id?: string; nonce?: string };
    jobId = body.job_id;
    const nonce = body.nonce;
    if (!jobId || !nonce || !uuidPattern.test(jobId) || !uuidPattern.test(nonce)) {
      return response({ error: "A valid job_id and one-time nonce are required" }, 400);
    }

    const rows = await sql<JobRow[]>`
      with claimed as (
        update training.ingestion_jobs
        set status='running', attempts=attempts+1, started_at=now(), completed_at=null,
            last_error=null, updated_at=now(), invocation_nonce=gen_random_uuid()
        where id=${jobId}::uuid
          and invocation_nonce=${nonce}::uuid
          and status in ('queued','failed','partial')
        returning id, artifact_id, job_type, start_record, max_records
      )
      select
        c.id::text as job_id,
        c.job_type,
        c.start_record,
        c.max_records,
        a.id::text as artifact_id,
        a.name as artifact_name,
        a.source_url,
        a.split,
        a.compression,
        a.expected_records,
        d.id::text as dataset_id,
        d.slug as dataset_slug,
        d.training_use_status,
        d.commercial_use_allowed,
        d.license_fee_required,
        d.model_training_allowed
      from claimed c
      join training.dataset_artifacts a on a.id = c.artifact_id
      join training.dataset_registry d on d.id = a.dataset_id
    `;

    const job = rows[0];
    if (!job) return response({ error: "Invalid, expired, or unavailable ingestion capability" }, 401);

    const licenseApproved = job.training_use_status === "approved"
      && job.commercial_use_allowed === true
      && job.license_fee_required === false
      && job.model_training_allowed === true;
    if (!licenseApproved) {
      throw new Error(`Dataset ${job.dataset_slug} failed the zero-fee commercial training license gate`);
    }
    if (job.job_type !== "jsonl_gzip_to_raw") {
      throw new Error(`Unsupported job type: ${job.job_type}`);
    }

    await sql`
      update training.dataset_artifacts
      set status='ingesting', updated_at=now()
      where id=${job.artifact_id}::uuid
    `;

    const result = await processJsonlGzip(job);
    const countRows = await sql<{ count: string }[]>`
      select count(*)::text as count
      from training.raw_documents
      where artifact_id=${job.artifact_id}::uuid
    `;
    const artifactCount = Number(countRows[0]?.count ?? 0);
    const artifactStatus = job.expected_records && artifactCount >= job.expected_records ? "ingested" : "partial";

    await sql`
      update training.ingestion_jobs
      set status='completed', records_seen=${Number(result.selected ?? 0)},
          records_written=${Number(result.written ?? 0)}, result=${sql.json(result)},
          completed_at=now(), updated_at=now()
      where id=${jobId}::uuid
    `;
    await sql`
      update training.dataset_artifacts
      set status=${artifactStatus}, retrieved_at=coalesce(retrieved_at, now()), updated_at=now(),
          metadata=metadata || ${sql.json({ lastJobId: jobId })}::jsonb
      where id=${job.artifact_id}::uuid
    `;

    return response({ ok: true, job_id: jobId, artifact: job.artifact_name, result, artifactCount, artifactStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("training-ingest failed", { jobId, message });
    if (jobId && uuidPattern.test(jobId)) {
      await sql`
        update training.ingestion_jobs
        set status='failed', last_error=${message}, completed_at=now(), updated_at=now()
        where id=${jobId}::uuid
      `.catch(() => undefined);
    }
    return response({ ok: false, job_id: jobId, error: message }, 500);
  }
});

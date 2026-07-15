#!/usr/bin/env bash
# Restore the owner-controlled private training corpus from an encrypted backup.
#
# Verifies the archive and manifest checksums before touching the database,
# refuses plaintext input, refuses targets whose migration ledger is older
# than the manifest requirement, and applies the entire restore in a single
# transaction. The restore is idempotent: the existing dependency closure for
# the root datasets is replaced atomically (explicit conflict handling), and
# rows outside the closure are never deleted — out-of-closure references
# abort the transaction with a clear error instead of causing silent damage.
#
# Usage:
#   TRAINING_BACKUP_AGE_IDENTITY_FILE=/secure/path/key.txt \
#   SUPABASE_DB_URL='postgresql://...' \
#   scripts/training-private-restore.sh --input private-backups/training-private-backup-YYYYMMDDTHHMMSSZ.tar.age [--dry-run]
#
# Environment:
#   SUPABASE_DB_URL / TRAINING_DB_URL      target database (never printed)
#   TRAINING_BACKUP_AGE_IDENTITY_FILE      age identity (private key) file path;
#                                          supplied via environment, never committed
#
# --dry-run performs every validation and the full staged restore inside the
# transaction, then rolls back without writing anything.
#
# Restores never recreate viewer capabilities: capability keys are stripped at
# export AND again at insert. training.runtime_config (ingestion_enabled) is
# left unchanged and this is verified before commit.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/training-private-common.sh
. "$SCRIPT_DIR/lib/training-private-common.sh"

INPUT=""
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$INPUT" ] || die "--input <archive.tar.age> is required"
[ -f "$INPUT" ] || die "input archive not found: $(basename "$INPUT")"

require_cmd psql age jq tar sha256sum awk
require_env TRAINING_BACKUP_AGE_IDENTITY_FILE
[ -f "$TRAINING_BACKUP_AGE_IDENTITY_FILE" ] || die "age identity file not found (TRAINING_BACKUP_AGE_IDENTITY_FILE)"
DB_URL="$(training_db_url)"

WORKDIR="$(training_make_workdir)"
trap 'rm -rf "$WORKDIR"' EXIT

# ---- Phase 1: validate the archive before any database contact ----
training_verify_sidecar "$INPUT"
training_assert_age_encrypted "$INPUT"

log "decrypting archive"
age -d -i "$TRAINING_BACKUP_AGE_IDENTITY_FILE" -o "$WORKDIR/bundle.tar" "$INPUT" \
  || die "decryption failed; wrong identity or corrupt archive. Nothing was written."
tar -xf "$WORKDIR/bundle.tar" -C "$WORKDIR" --no-same-owner
rm -f "$WORKDIR/bundle.tar"

BUNDLE_DIR="$(find "$WORKDIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
MANIFEST="$BUNDLE_DIR/manifest.json"
[ -f "$MANIFEST" ] || die "archive does not contain a manifest.json"

FORMAT_VERSION="$(jq -r '.format_version' "$MANIFEST")"
[ "$FORMAT_VERSION" = "$TRAINING_BACKUP_FORMAT_VERSION" ] \
  || die "unsupported backup format_version $FORMAT_VERSION (supported: $TRAINING_BACKUP_FORMAT_VERSION)"

REQUIRED_MIGRATION="$(jq -r '.required_migration_version' "$MANIFEST")"
SOURCE_LABEL="$(jq -r '.source_env_label' "$MANIFEST")"
[ -n "$REQUIRED_MIGRATION" ] && [ "$REQUIRED_MIGRATION" != "null" ] \
  || die "manifest is missing required_migration_version"

# Root slugs in manifest must match the configured scope exactly.
EXPECTED_SLUGS="$(printf '%s\n' $TRAINING_ROOT_SLUGS | sort)"
MANIFEST_SLUGS="$(jq -r '.root_slugs[]' "$MANIFEST" | sort)"
[ "$EXPECTED_SLUGS" = "$MANIFEST_SLUGS" ] \
  || die "manifest root slugs do not match the configured backup scope"

# Verify every per-file checksum recorded in the manifest before any write.
while IFS=$'\t' read -r rel expected; do
  f="$BUNDLE_DIR/$rel"
  [ -f "$f" ] || die "archive is missing $rel listed in manifest"
  actual="$(sha256_of "$f")"
  [ "$actual" = "$expected" ] \
    || die "checksum mismatch for $rel; the backup is corrupt or has been tampered with. Nothing was written."
done < <(jq -r '.file_checksums | to_entries[] | [.key, .value] | @tsv' "$MANIFEST")

for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
  [ -f "$BUNDLE_DIR/tables/$t.jsonl" ] || die "archive is missing tables/$t.jsonl"
  jq -e --arg t "$t" '.row_counts | has($t)' "$MANIFEST" >/dev/null \
    || die "manifest has no row count for $t"
done
log "archive validated: format v$FORMAT_VERSION, source label '$SOURCE_LABEL', requires migration $REQUIRED_MIGRATION"

# ---- Phase 2: build the single-transaction restore script ----
SLUGS_SQL="$(training_root_slugs_sql)"
EXPECTED_ROOTS="$(printf '%s\n' $TRAINING_ROOT_SLUGS | wc -l | tr -d ' ')"
RESTORE_SQL="$WORKDIR/restore.sql"

STRIP_META="jsonb_build_object('metadata', (s.doc->'metadata') - 'viewer_token' - 'viewer_expires_at' - 'viewer_issued_at')"

{
  echo "begin;"
  echo "select pg_advisory_xact_lock(hashtext('training_private_restore'));"

  # Refuse targets whose migration ledger is older than the manifest requires.
  cat <<SQL
do \$ledger\$
declare v_target text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'target has no supabase_migrations ledger; apply migrations before restoring';
  end if;
  select coalesce(max(version),'') into v_target
  from supabase_migrations.schema_migrations
  where version ~ '^[0-9]{14}\$';
  if v_target < '${REQUIRED_MIGRATION}' then
    raise exception 'target migration ledger (%) is older than the backup requires (${REQUIRED_MIGRATION}); apply migrations first', v_target;
  end if;
end
\$ledger\$;
SQL

  # Snapshot ingestion enablement so we can prove the restore left it unchanged.
  echo "create temp table _rt_before as select key, value from training.runtime_config where key = 'ingestion_enabled';"

  # Stage every table file.
  for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
    echo "create temp table _stage_$t (doc jsonb);"
    printf '\\copy _stage_%s from %s with (%s)\n' \
      "$t" "'$BUNDLE_DIR/tables/$t.jsonl'" "$TRAINING_COPY_OPTS"
  done

  # Expected row counts from the manifest.
  echo "create temp table _expected (tbl text primary key, n bigint not null);"
  for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
    n="$(jq -r --arg t "$t" '.row_counts[$t]' "$MANIFEST")"
    case "$n" in (*[!0-9]*|'') die "manifest row count for $t is not a number" ;; esac
    echo "insert into _expected values ('$t', $n);"
  done

  cat <<SQL
-- Staged data must match the manifest exactly before anything is written.
do \$staged\$
declare r record;
begin
  for r in
    select e.tbl, e.n as expected, c.n as staged
    from _expected e
    join (
      select 'dataset_registry' as tbl, count(*) as n from _stage_dataset_registry union all
      select 'dataset_artifacts', count(*) from _stage_dataset_artifacts union all
      select 'staged_text_artifacts', count(*) from _stage_staged_text_artifacts union all
      select 'pdf_page_extract', count(*) from _stage_pdf_page_extract union all
      select 'raw_documents', count(*) from _stage_raw_documents union all
      select 'site_precedents', count(*) from _stage_site_precedents union all
      select 'site_features', count(*) from _stage_site_features union all
      select 'precedent_constraints', count(*) from _stage_precedent_constraints union all
      select 'precedent_units', count(*) from _stage_precedent_units union all
      select 'building_interiors', count(*) from _stage_building_interiors union all
      select 'interior_spaces', count(*) from _stage_interior_spaces union all
      select 'interior_connections', count(*) from _stage_interior_connections union all
      select 'interior_elements', count(*) from _stage_interior_elements union all
      select 'program_templates', count(*) from _stage_program_templates union all
      select 'training_release_datasets', count(*) from _stage_training_release_datasets
    ) c on c.tbl = e.tbl
    where c.n <> e.n
  loop
    raise exception 'staged rows for % (%) do not match manifest count (%)', r.tbl, r.staged, r.expected;
  end loop;

  if exists (
    select 1 from _stage_dataset_registry s
    where s.doc->>'slug' not in (${SLUGS_SQL})
  ) then
    raise exception 'staged dataset_registry contains a slug outside the configured backup scope';
  end if;
  if (select count(distinct s.doc->>'slug') from _stage_dataset_registry s) <> ${EXPECTED_ROOTS} then
    raise exception 'staged dataset_registry does not contain exactly the configured root datasets';
  end if;
end
\$staged\$;

-- Every release referenced by the backup must already exist in the target
-- (training_releases is source-controlled and recreated by migrations; this
-- restore never creates or overwrites release manifests).
do \$rel\$
declare v_missing text;
begin
  select string_agg(distinct (s.doc->>'release_name') || '@' || (s.doc->>'release_version'), ', ')
  into v_missing
  from _stage_training_release_datasets s
  where not exists (
    select 1 from training.training_releases tr
    where tr.name = s.doc->>'release_name'
      and tr.version = s.doc->>'release_version'
  );
  if v_missing is not null then
    raise exception 'target is missing source-controlled training release(s): %. Apply migrations that create them before restoring.', v_missing;
  end if;
end
\$rel\$;

-- Existing closure rows for the root slugs (seeded placeholders or a prior
-- restore). Out-of-closure references abort instead of being touched.
create temp table _old_roots as
  select id from training.dataset_registry where slug in (${SLUGS_SQL});

do \$guard\$
declare v bigint;
begin
  select count(*) into v from training.ingestion_runs x join _old_roots r on r.id = x.dataset_id;
  if v > 0 then
    raise exception 'target has % training.ingestion_runs row(s) referencing the root datasets; these are outside the restore closure. Resolve them manually first.', v;
  end if;

  select count(*) into v
  from training.ingestion_jobs j
  join training.dataset_artifacts a on a.id = j.artifact_id
  join _old_roots r on r.id = a.dataset_id;
  if v > 0 then
    raise exception 'target has % training.ingestion_jobs row(s) referencing owned artifacts; these are outside the restore closure. Resolve them manually first.', v;
  end if;

  select count(*) into v
  from training.parcel_plan_pairs pp
  join training.site_precedents p on p.id = pp.precedent_id
  join _old_roots r on r.id = p.dataset_id;
  if v > 0 then
    raise exception 'target has % training.parcel_plan_pairs row(s) referencing owned precedents; these are outside the restore closure. Resolve them manually first.', v;
  end if;
end
\$guard\$;

-- Replace the closure atomically (children before parents; restrict FKs first).
delete from training.training_release_datasets t using _old_roots r where t.dataset_id = r.id;
delete from training.raw_documents t using _old_roots r where t.dataset_id = r.id;
delete from training.building_interiors t using _old_roots r where t.dataset_id = r.id;
delete from training.site_precedents t using _old_roots r where t.dataset_id = r.id;
delete from training.program_templates t using _old_roots r where t.source_dataset_id = r.id;
delete from training.dataset_artifacts t using _old_roots r where t.dataset_id = r.id;
delete from training.dataset_registry t using _old_roots r where t.id = r.id;
SQL

  # Inserts in dependency order. UUID keys are preserved exactly. Identity
  # (bigint) keys are re-sequenced by the target via OVERRIDING USER VALUE —
  # verbatim identity values could collide with unrelated corpus rows the
  # target already owns — and the only identity ids referenced inside the
  # closure (interior_spaces.id, referenced by interior_connections) are
  # remapped explicitly so every relationship stays intact.
  for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
    case "$t" in
      dataset_registry|dataset_artifacts)
        cat <<SQL
insert into training.$t
select rec.*
from _stage_$t s
cross join lateral jsonb_populate_record(null::training.$t, s.doc || ${STRIP_META}) rec;
SQL
        ;;
      raw_documents|site_features|precedent_constraints|interior_elements)
        cat <<SQL
insert into training.$t overriding user value
select rec.*
from _stage_$t s
cross join lateral jsonb_populate_record(null::training.$t, s.doc) rec;
SQL
        ;;
      interior_spaces)
        cat <<SQL
-- Stash the backup's space id in attributes to correlate old->new ids, then
-- build the remap table and remove the stash key in the same transaction.
insert into training.interior_spaces overriding user value
select rec.*
from _stage_interior_spaces s
cross join lateral jsonb_populate_record(
  null::training.interior_spaces,
  s.doc || jsonb_build_object(
    'attributes',
    coalesce(s.doc->'attributes','{}'::jsonb) || jsonb_build_object('__restore_old_id', s.doc->'id')
  )
) rec;

create temp table _space_map as
select (attributes->>'__restore_old_id')::bigint as old_id, id as new_id
from training.interior_spaces
where attributes ? '__restore_old_id';

update training.interior_spaces
set attributes = attributes - '__restore_old_id'
where attributes ? '__restore_old_id';
SQL
        ;;
      interior_connections)
        cat <<SQL
-- Connections must only reference spaces contained in the backup.
do \$conncheck\$
begin
  if exists (
    select 1 from _stage_interior_connections s
    where (s.doc->>'from_space_id') is not null
      and not exists (select 1 from _space_map m where m.old_id = (s.doc->>'from_space_id')::bigint)
  ) or exists (
    select 1 from _stage_interior_connections s
    where (s.doc->>'to_space_id') is not null
      and not exists (select 1 from _space_map m where m.old_id = (s.doc->>'to_space_id')::bigint)
  ) then
    raise exception 'backup interior_connections reference spaces missing from the backup closure';
  end if;
end
\$conncheck\$;

insert into training.interior_connections overriding user value
select rec.*
from _stage_interior_connections s
cross join lateral jsonb_populate_record(
  null::training.interior_connections,
  s.doc || jsonb_build_object(
    'from_space_id', (select m.new_id from _space_map m where m.old_id = (s.doc->>'from_space_id')::bigint),
    'to_space_id',   (select m.new_id from _space_map m where m.old_id = (s.doc->>'to_space_id')::bigint)
  )
) rec;
SQL
        ;;
      training_release_datasets)
        cat <<SQL
insert into training.training_release_datasets (release_id, dataset_id, included_splits, filters, attribution_text)
select tr.id, rec.dataset_id, rec.included_splits, rec.filters, rec.attribution_text
from _stage_training_release_datasets s
cross join lateral jsonb_populate_record(null::training.training_release_datasets, s.doc - 'release_name' - 'release_version') rec
join training.training_releases tr
  on tr.name = s.doc->>'release_name' and tr.version = s.doc->>'release_version';
SQL
        ;;
      *)
        cat <<SQL
insert into training.$t
select rec.*
from _stage_$t s
cross join lateral jsonb_populate_record(null::training.$t, s.doc) rec;
SQL
        ;;
    esac
  done

  cat <<SQL
-- Post-restore verification: live closure counts must equal the manifest,
-- no viewer capability may exist, rights gates must hold, and ingestion
-- enablement must be untouched. Any failure rolls the whole restore back.
create temp table _new_roots as
  select id, slug from training.dataset_registry where slug in (${SLUGS_SQL});
create temp table _new_artifacts as
  select a.id from training.dataset_artifacts a join _new_roots r on r.id = a.dataset_id;
create temp table _new_precedents as
  select p.id from training.site_precedents p join _new_roots r on r.id = p.dataset_id;
create temp table _new_interiors as
  select b.id from training.building_interiors b join _new_roots r on r.id = b.dataset_id;

do \$verify\$
declare rr record; v bigint;
begin
  for rr in
    select e.tbl, e.n as expected, c.n as actual
    from _expected e
    join (
      select 'dataset_registry' as tbl, count(*) as n from _new_roots union all
      select 'dataset_artifacts', count(*) from _new_artifacts union all
      select 'staged_text_artifacts', count(*) from training.staged_text_artifacts t join _new_artifacts a on a.id = t.artifact_id union all
      select 'pdf_page_extract', count(*) from training.pdf_page_extract t join _new_artifacts a on a.id = t.artifact_id union all
      select 'raw_documents', count(*) from training.raw_documents t join _new_roots x on x.id = t.dataset_id union all
      select 'site_precedents', count(*) from _new_precedents union all
      select 'site_features', count(*) from training.site_features t join _new_precedents p on p.id = t.precedent_id union all
      select 'precedent_constraints', count(*) from training.precedent_constraints t join _new_precedents p on p.id = t.precedent_id union all
      select 'precedent_units', count(*) from training.precedent_units t join _new_precedents p on p.id = t.precedent_id union all
      select 'building_interiors', count(*) from _new_interiors union all
      select 'interior_spaces', count(*) from training.interior_spaces t join _new_interiors i on i.id = t.interior_id union all
      select 'interior_connections', count(*) from training.interior_connections t join _new_interiors i on i.id = t.interior_id union all
      select 'interior_elements', count(*) from training.interior_elements t join _new_interiors i on i.id = t.interior_id union all
      select 'program_templates', count(*) from training.program_templates t join _new_roots x on x.id = t.source_dataset_id union all
      select 'training_release_datasets', count(*) from training.training_release_datasets t join _new_roots x on x.id = t.dataset_id
    ) c on c.tbl = e.tbl
    where c.n <> e.n
  loop
    raise exception 'restored count for % (%) does not match manifest (%)', rr.tbl, rr.actual, rr.expected;
  end loop;

  select count(*) into v
  from training.dataset_artifacts a
  join _new_roots r on r.id = a.dataset_id
  where a.metadata ?| array['viewer_token','viewer_expires_at','viewer_issued_at'];
  if v > 0 then
    raise exception 'restore would recreate viewer capability metadata on % artifact(s)', v;
  end if;

  select count(*) into v
  from training.dataset_registry d
  join _new_roots r on r.id = d.id
  where d.redistribution_allowed is distinct from false;
  if v > 0 then
    raise exception 'public redistribution must remain disabled for all root datasets (% row(s) violate)', v;
  end if;

  select count(*) into v
  from training.dataset_registry d
  join _new_roots r on r.id = d.id
  where coalesce((d.metadata->>'geometry_training_weight')::numeric, 0) <> 0;
  if v > 0 then
    raise exception 'geometry training weight must remain zero for all root datasets (% row(s) violate)', v;
  end if;

  select count(*) into v
  from (
    select key, value from training.runtime_config where key = 'ingestion_enabled'
    except select key, value from _rt_before
    union all
    select key, value from _rt_before
    except select key, value from training.runtime_config where key = 'ingestion_enabled'
  ) x;
  if v > 0 then
    raise exception 'restore must not change training.runtime_config ingestion_enabled';
  end if;
end
\$verify\$;

select 'restored ' || e.tbl || ': ' || e.n || ' rows' from _expected e order by e.tbl;
SQL

  if [ "$DRY_RUN" = 1 ]; then
    echo "rollback;"
  else
    echo "commit;"
  fi
} > "$RESTORE_SQL"

# ---- Phase 3: execute ----
if [ "$DRY_RUN" = 1 ]; then
  log "DRY RUN: validating restore transaction (will roll back)"
else
  log "restoring private training corpus (single transaction)"
fi
run_sql_file "$DB_URL" "$RESTORE_SQL"

if [ "$DRY_RUN" = 1 ]; then
  log "DRY RUN complete: archive, checksums, migration ledger, releases, and full staged restore validated; nothing was written"
  exit 0
fi

log "restore complete (source label '$SOURCE_LABEL'). Run: npm run db:smoke:training && npm run db:smoke:private"

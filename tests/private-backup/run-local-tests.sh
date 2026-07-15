#!/usr/bin/env bash
# Disposable-local test suite for the encrypted private training backup/restore
# tools and the SQL-verifiable ingestion gates.
#
# Stands up a throwaway PostgreSQL 16 cluster (unix socket only, trust auth,
# data under a temp dir), builds several databases from the committed training
# migrations, seeds SYNTHETIC fixtures (no real private data anywhere), and
# runs the required backup/restore tests end to end:
#
#   T1  export produces an encrypted archive + manifest + checksums
#   T2  restore --dry-run validates everything and writes nothing
#   T3  restore into an empty (freshly migrated) target
#   T4  repeated restore is idempotent; identity sequences re-aligned
#   T5  wrong age identity fails before any database write
#   T6  tampered table data / corrupted archive fail checksum validation
#   T7  a target with an older migration ledger is refused
#   T8  a target missing the source-controlled release is refused
#   T9  viewer capability fields are absent after restore
#   T10 restored row counts match the manifest
#   T11 public redistribution stays disabled for both root datasets
#   T12 geometry training weight stays zero
#   T13 npm run db:smoke:training passes against a corpus-shaped local target
#   G*  ingestion-gate assertions (tests/private-backup/training_gates_test.sql)
#
# Requirements: PostgreSQL 16 server binaries + PostGIS, age, jq, npm.
# pg_net is stubbed with a no-network local extension (written to the server's
# extension directory only if pg_net is not installed).
#
# Usage: bash tests/private-backup/run-local-tests.sh
#   KEEP_TEST_ENV=1   keep the cluster and workdir for inspection
#   PG_BIN=/path/bin  override PostgreSQL binary directory

set -euo pipefail
HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HARNESS_DIR/../.." && pwd)"
# shellcheck source=scripts/lib/training-private-common.sh
. "$REPO/scripts/lib/training-private-common.sh"

PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  if command -v pg_config >/dev/null 2>&1; then
    PG_BIN="$(pg_config --bindir)"
  elif [ -x /usr/lib/postgresql/16/bin/initdb ]; then
    PG_BIN=/usr/lib/postgresql/16/bin
  else
    die "PostgreSQL server binaries not found; set PG_BIN"
  fi
fi
require_cmd age age-keygen jq tar sha256sum npm
[ -x "$PG_BIN/initdb" ] || die "$PG_BIN/initdb not found"

# Training-schema migrations in timestamp order. New training migrations must
# be appended here to stay covered by the local suite.
TRAINING_MIGRATIONS=(
  20260713155034_add_site_planning_training_corpus.sql
  20260713155351_add_interior_building_training_layer.sql
  20260713181521_add_training_corpus_controls.sql
  20260713181621_register_zero_fee_training_sources.sql
  20260713181738_seed_training_artifacts_and_release.sql
  20260713182113_add_ingestion_job_capabilities.sql
  20260713183024_add_procthor_geometry_helpers.sql
  20260713183258_add_procthor_normalizer.sql
  20260713183436_publish_training_seed_interface.sql
  20260713183536_index_training_foreign_keys.sql
  20260714020628_add_rights_clean_ifc_profile_helpers.sql
  20260714020754_register_rights_clean_mini_corpus_sources.sql
  20260714020915_queue_rights_clean_mini_corpus_artifacts.sql
  20260714021138_add_ifc_artifact_profile_table.sql
  20260714021316_add_private_staged_text_artifacts.sql
  20260714022247_register_open_us_commercial_model_sources.sql
  20260714140916_add_private_pdf_page_extract.sql
  20260714143317_add_precedent_unit_schedule.sql
  20260714194726_archive_non_us_training_release.sql
  20260714194745_canonicalize_parser_fixture_sources.sql
  20260714194811_register_canonical_openstudio_artifacts.sql
  20260714194852_register_owned_training_rights_policy.sql
  20260714195131_add_us_commercial_corpus_refresh.sql
  20260714195230_fix_us_commercial_taxonomy_edge_cases.sql
  20260714200620_make_training_ingestion_runtime_portable.sql
  20260714214650_require_explicit_training_ingestion_enable.sql
)

WORK="$(mktemp -d /tmp/training-backup-tests.XXXXXX)"
chmod 755 "$WORK"
PGDATA="$WORK/pgdata"
SOCK="$WORK/sock"
OUT="$WORK/out"
KEYS="$WORK/keys"
PORT=55432
mkdir -p "$SOCK" "$OUT" "$KEYS"
chmod 755 "$SOCK"
chmod 700 "$OUT" "$KEYS"

RUN_AS=()
if [ "$(id -u)" = 0 ]; then
  id postgres >/dev/null 2>&1 || die "running as root and no postgres user exists"
  RUN_AS=(runuser -u postgres --)
  mkdir -p "$PGDATA"
  touch "$WORK/pg.log"
  chown postgres:postgres "$PGDATA" "$SOCK" "$WORK/pg.log"
fi

cleanup() {
  set +e
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1
  if [ "${KEEP_TEST_ENV:-0}" = 1 ]; then
    log "KEEP_TEST_ENV=1: leaving $WORK in place"
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres
db_url() { printf 'postgresql://postgres@/%s?host=%s&port=%s' "$1" "$SOCK" "$PORT"; }
q() { psql -d "$1" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -Atc "$2"; }
qf() { psql -d "$1" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -f "$2"; }

expect_fail() {
  local desc="$1" pattern="$2"; shift 2
  local out rc=0
  out="$("$@" 2>&1)" || rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '%s\n' "$out" | tail -5 >&2
    die "FAIL $desc: expected failure but the command succeeded"
  fi
  if ! grep -qi "$pattern" <<<"$out"; then
    printf '%s\n' "$out" | tail -10 >&2
    die "FAIL $desc: failed, but not with the expected message ($pattern)"
  fi
  log "PASS $desc"
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  [ "$expected" = "$actual" ] || die "FAIL $desc: expected '$expected', got '$actual'"
  log "PASS $desc"
}

# ---- pg_net stub (no network I/O) if the real extension is absent ----
SHAREDIR="$("$PG_BIN/pg_config" --sharedir 2>/dev/null || dirname "$(dirname "$PG_BIN")")"
EXTDIR="$SHAREDIR/extension"
if [ ! -f "$EXTDIR/pg_net.control" ]; then
  [ -w "$EXTDIR" ] || die "pg_net is not installed and $EXTDIR is not writable; cannot install the local test stub"
  log "installing local pg_net test stub into $EXTDIR (no network I/O)"
  cat > "$EXTDIR/pg_net.control" <<'CTRL'
comment = 'LOCAL TEST STUB of pg_net for disposable databases; performs no network I/O'
default_version = '0stub'
relocatable = true
CTRL
  cat > "$EXTDIR/pg_net--0stub.sql" <<'STUB'
create schema if not exists net;
create sequence if not exists net._stub_request_seq;
create table if not exists net._stub_requests (
  id bigint primary key,
  url text not null,
  created_at timestamptz not null default now()
);
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language plpgsql
as $stub$
declare v bigint := nextval('net._stub_request_seq');
begin
  insert into net._stub_requests (id, url) values (v, url);
  return v;
end
$stub$;
STUB
  chmod 644 "$EXTDIR/pg_net.control" "$EXTDIR/pg_net--0stub.sql"
fi

# ---- disposable cluster ----
log "initializing disposable PostgreSQL 16 cluster"
"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$PGDATA" -A trust -U postgres >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$WORK/pg.log" -w \
  -o "-c listen_addresses='' -c port=$PORT -c unix_socket_directories='$SOCK' -c fsync=off -c full_page_writes=off" \
  start >/dev/null

q postgres "select 1" >/dev/null
q postgres "create role anon nologin" >/dev/null
q postgres "create role authenticated nologin" >/dev/null
q postgres "create role service_role nologin" >/dev/null

bootstrap_db() {
  local db="$1"
  "$PG_BIN/createdb" "$db" >/dev/null 2>&1 || createdb "$db"
  q "$db" "create schema if not exists extensions" >/dev/null
  q "$db" "create extension if not exists postgis" >/dev/null
  q "$db" "create extension if not exists pgcrypto with schema extensions" >/dev/null
  # LOCAL SHIM: minimal stand-in for the application table referenced by
  # training.building_interiors.floorplan_id. Contains no data.
  q "$db" "create table if not exists public.floorplans (id uuid primary key default gen_random_uuid())" >/dev/null
  q "$db" "create schema if not exists supabase_migrations" >/dev/null
  q "$db" "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])" >/dev/null
}

apply_migrations() {
  local db="$1" upto="${2:-99999999999999}" f version
  for f in "${TRAINING_MIGRATIONS[@]}"; do
    version="${f%%_*}"
    if [ "$version" \> "$upto" ]; then continue; fi
    qf "$db" "$REPO/supabase/migrations/$f" >/dev/null
    q "$db" "insert into supabase_migrations.schema_migrations(version, name) values ('$version', '${f#*_}') on conflict do nothing" >/dev/null
  done
}

log "building databases (source, target, old-ledger, no-release, gates, corpus)"
for db in bk_source bk_target bk_old bk_norel bk_gates bk_corpus; do
  bootstrap_db "$db"
done
apply_migrations bk_source
apply_migrations bk_target
apply_migrations bk_old 20260714143317
apply_migrations bk_norel
apply_migrations bk_gates
apply_migrations bk_corpus

log "seeding synthetic fixtures"
qf bk_source "$HARNESS_DIR/fixture_seed.sql" >/dev/null
qf bk_corpus "$HARNESS_DIR/corpus_shape_seed.sql" >/dev/null

# age keys: a correct identity and a wrong one (both disposable, never committed)
age-keygen -o "$KEYS/backup.key" 2>/dev/null
age-keygen -o "$KEYS/wrong.key" 2>/dev/null
RECIPIENT="$(age-keygen -y "$KEYS/backup.key")"

EXPORT_ENV=(env
  "TRAINING_DB_URL=$(db_url bk_source)"
  "TRAINING_BACKUP_AGE_RECIPIENT=$RECIPIENT"
  "TRAINING_BACKUP_SOURCE_LABEL=local-disposable-fixture"
  "TRAINING_BACKUP_OUTPUT_DIR=$OUT"
)

# ---- T1: export ----
"${EXPORT_ENV[@]}" bash "$REPO/scripts/training-private-export.sh" >/dev/null 2>"$WORK/export.log" \
  || { tail -20 "$WORK/export.log" >&2; die "FAIL T1: export failed"; }
ARCHIVE="$(ls "$OUT"/training-private-backup-*.tar.age 2>/dev/null | head -1)"
[ -n "$ARCHIVE" ] || die "FAIL T1: no archive produced"
[ -f "$ARCHIVE.sha256" ] || die "FAIL T1: no checksum sidecar produced"
head -c 20 "$ARCHIVE" | grep -q '^age-encryption.org/' || die "FAIL T1: archive is not age-encrypted"
LEFTOVER="$(find "$OUT" -type f ! -name '*.tar.age' ! -name '*.sha256' | wc -l | tr -d ' ')"
assert_eq "T1 output dir contains only encrypted artifacts" 0 "$LEFTOVER"

# Inspect the decrypted bundle in a private dir: viewer capability keys must be
# stripped; the manifest must record the exact fixture (baseline) counts.
INSPECT="$WORK/inspect"; mkdir -p "$INSPECT"; chmod 700 "$INSPECT"
age -d -i "$KEYS/backup.key" -o "$INSPECT/bundle.tar" "$ARCHIVE"
tar -xf "$INSPECT/bundle.tar" -C "$INSPECT"
BUNDLE_DIR="$(find "$INSPECT" -mindepth 1 -maxdepth 1 -type d | head -1)"
if grep -q 'viewer_token\|viewer_expires_at\|viewer_issued_at' "$BUNDLE_DIR"/tables/*.jsonl; then
  die "FAIL T1: viewer capability fields leaked into the export"
fi
grep -q 'synthetic-fixture.invalid' "$BUNDLE_DIR/tables/dataset_artifacts.jsonl" \
  || die "FAIL T1: private source URLs missing inside the encrypted archive (export closure broken)"
for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
  want="$(training_baseline_min "$t")"
  got="$(jq -r --arg t "$t" '.row_counts[$t]' "$BUNDLE_DIR/manifest.json")"
  [ "$want" = "$got" ] || die "FAIL T1: manifest count for $t is $got, fixture baseline is $want"
done
assert_eq "T1 manifest requires latest applied migration" 20260714214650 "$(jq -r '.required_migration_version' "$BUNDLE_DIR/manifest.json")"
log "PASS T1 export: encrypted archive, sidecar, stripped capabilities, baseline-exact manifest"

RESTORE_ENV=(env
  "TRAINING_DB_URL=$(db_url bk_target)"
  "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key"
)

# ---- T2: dry run writes nothing ----
SEEDED_IDS="$(q bk_target "select slug || ':' || id from training.dataset_registry where slug like 'owned_%' order by slug")"
"${RESTORE_ENV[@]}" bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE" --dry-run >"$WORK/dryrun.log" 2>&1 \
  || { tail -20 "$WORK/dryrun.log" >&2; die "FAIL T2: dry run failed"; }
assert_eq "T2 dry run left owned artifacts untouched" 0 \
  "$(q bk_target "select count(*) from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id where d.slug like 'owned_%'")"
assert_eq "T2 dry run left seeded registry ids untouched" "$SEEDED_IDS" \
  "$(q bk_target "select slug || ':' || id from training.dataset_registry where slug like 'owned_%' order by slug")"
assert_eq "T2 dry run left ingestion_enabled untouched" false \
  "$(q bk_target "select value from training.runtime_config where key='ingestion_enabled'")"

# ---- T3: restore into an empty (freshly migrated) target ----
"${RESTORE_ENV[@]}" bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE" >"$WORK/restore1.log" 2>&1 \
  || { tail -20 "$WORK/restore1.log" >&2; die "FAIL T3: restore failed"; }
SOURCE_IDS="$(q bk_source "select slug || ':' || id from training.dataset_registry where slug like 'owned_%' order by slug")"
assert_eq "T3 restored registry preserves source UUIDs" "$SOURCE_IDS" \
  "$(q bk_target "select slug || ':' || id from training.dataset_registry where slug like 'owned_%' order by slug")"
GEOM_SIG_SQL="select md5(string_agg(encode(public.st_asewkb(geom),'hex'), ',' order by source_space_id)) from training.interior_spaces where geom is not null and (attributes->>'synthetic')::boolean"
assert_eq "T3 geometry round-trips byte-exact (EWKB)" "$(q bk_source "$GEOM_SIG_SQL")" "$(q bk_target "$GEOM_SIG_SQL")"
assert_eq "T3 identity-keyed connections intact" 21 \
  "$(q bk_target "select count(*) from training.interior_connections c join training.interior_spaces s1 on s1.id=c.from_space_id join training.interior_spaces s2 on s2.id=c.to_space_id where (s1.attributes->>'synthetic')::boolean")"
qf bk_target "$REPO/tests/sql/private_training_restore_smoke.sql" >/dev/null 2>&1 \
  || die "FAIL T3: private_training_restore_smoke.sql failed on restored target"
log "PASS T3 restore to empty target (UUIDs, geometry, identity links, smoke)"

# ---- T4: idempotent re-restore + sequence realignment ----
"${RESTORE_ENV[@]}" bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE" >"$WORK/restore2.log" 2>&1 \
  || { tail -20 "$WORK/restore2.log" >&2; die "FAIL T4: second restore failed"; }
assert_eq "T4 re-restore keeps precedent_units at manifest count" 154 \
  "$(q bk_target "select count(*) from training.precedent_units")"
assert_eq "T4 re-restore keeps connections at manifest count" 21 \
  "$(q bk_target "select count(*) from training.interior_connections")"
PROBE_ID="$(q bk_target "insert into training.interior_spaces (interior_id, source_space_id, space_type) select id, 'SYN-SEQ-PROBE', 'other' from training.building_interiors limit 1 returning id")"
[ -n "$PROBE_ID" ] || die "FAIL T4: fresh identity insert failed after restore"
q bk_target "delete from training.interior_spaces where id = $PROBE_ID" >/dev/null
log "PASS T4 idempotent re-restore; fresh identity inserts still work"

# ---- T5: wrong identity fails before any write ----
BEFORE="$(q bk_target "select count(*) from training.precedent_units")"
expect_fail "T5 wrong age identity is rejected before writes" "decryption failed" \
  env "TRAINING_DB_URL=$(db_url bk_target)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/wrong.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE"
assert_eq "T5 target unchanged after rejected identity" "$BEFORE" "$(q bk_target "select count(*) from training.precedent_units")"

# ---- T6: tampered data and corrupted archive fail checksum validation ----
TAMPER="$WORK/tamper"; mkdir -p "$TAMPER"; chmod 700 "$TAMPER"
cp -r "$BUNDLE_DIR" "$TAMPER/bundle"
head -1 "$TAMPER/bundle/tables/precedent_units.jsonl" | jq -c '.habitable_sqft = 999999' >> "$TAMPER/bundle/tables/precedent_units.jsonl"
TAMPERED="$WORK/tampered.tar.age"
tar -C "$TAMPER" --transform "s/^bundle/$(basename "$BUNDLE_DIR")/" -cf - bundle | age -r "$RECIPIENT" -o "$TAMPERED"
( cd "$WORK" && sha256sum "$(basename "$TAMPERED")" > "$TAMPERED.sha256" )
expect_fail "T6 tampered table data fails manifest checksum" "checksum mismatch" \
  env "TRAINING_DB_URL=$(db_url bk_target)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$TAMPERED"

CORRUPT="$WORK/corrupt.tar.age"
cp "$ARCHIVE" "$CORRUPT"
cp "$ARCHIVE.sha256" "$CORRUPT.sha256"
sed -i "s/$(basename "$ARCHIVE")/$(basename "$CORRUPT")/" "$CORRUPT.sha256"
printf '\x00' | dd of="$CORRUPT" bs=1 seek=100 count=1 conv=notrunc status=none
expect_fail "T6 corrupted archive fails sidecar checksum" "checksum mismatch" \
  env "TRAINING_DB_URL=$(db_url bk_target)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$CORRUPT"

# ---- T7: older migration ledger is refused ----
expect_fail "T7 older-ledger target is refused" "older than" \
  env "TRAINING_DB_URL=$(db_url bk_old)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE"
assert_eq "T7 old target untouched" 0 "$(q bk_old "select count(*) from training.precedent_units")"

# ---- T8: missing source-controlled release is refused ----
q bk_norel "delete from training.training_release_datasets trd using training.training_releases tr where trd.release_id = tr.id and tr.name = 'parcelmap_owned_us_precedents'" >/dev/null
q bk_norel "delete from training.training_releases where name = 'parcelmap_owned_us_precedents'" >/dev/null
expect_fail "T8 missing training release is refused" "missing source-controlled training release" \
  env "TRAINING_DB_URL=$(db_url bk_norel)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE"
assert_eq "T8 no-release target untouched" 0 "$(q bk_norel "select count(*) from training.precedent_units")"

# ---- T9–T12: policy invariants on the restored target ----
assert_eq "T9 viewer capability fields absent after restore" 0 \
  "$(q bk_target "select count(*) from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id where d.slug like 'owned_%' and a.metadata ?| array['viewer_token','viewer_expires_at','viewer_issued_at']")"
MISMATCH=0
for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
  want="$(jq -r --arg t "$t" '.row_counts[$t]' "$BUNDLE_DIR/manifest.json")"
  case "$t" in
    dataset_registry) got="$(q bk_target "select count(*) from training.dataset_registry where slug like 'owned_%'")" ;;
    dataset_artifacts) got="$(q bk_target "select count(*) from training.dataset_artifacts a join training.dataset_registry d on d.id=a.dataset_id where d.slug like 'owned_%'")" ;;
    staged_text_artifacts) got="$(q bk_target "select count(*) from training.staged_text_artifacts")" ;;
    pdf_page_extract) got="$(q bk_target "select count(*) from training.pdf_page_extract")" ;;
    raw_documents) got="$(q bk_target "select count(*) from training.raw_documents r join training.dataset_registry d on d.id=r.dataset_id where d.slug like 'owned_%'")" ;;
    site_precedents) got="$(q bk_target "select count(*) from training.site_precedents p join training.dataset_registry d on d.id=p.dataset_id where d.slug like 'owned_%'")" ;;
    site_features) got="$(q bk_target "select count(*) from training.site_features")" ;;
    precedent_constraints) got="$(q bk_target "select count(*) from training.precedent_constraints")" ;;
    precedent_units) got="$(q bk_target "select count(*) from training.precedent_units")" ;;
    building_interiors) got="$(q bk_target "select count(*) from training.building_interiors b join training.dataset_registry d on d.id=b.dataset_id where d.slug like 'owned_%'")" ;;
    interior_spaces) got="$(q bk_target "select count(*) from training.interior_spaces")" ;;
    interior_connections) got="$(q bk_target "select count(*) from training.interior_connections")" ;;
    interior_elements) got="$(q bk_target "select count(*) from training.interior_elements")" ;;
    program_templates) got="$(q bk_target "select count(*) from training.program_templates t join training.dataset_registry d on d.id=t.source_dataset_id where d.slug like 'owned_%'")" ;;
    training_release_datasets) got="$(q bk_target "select count(*) from training.training_release_datasets t join training.dataset_registry d on d.id=t.dataset_id where d.slug like 'owned_%'")" ;;
  esac
  [ "$want" = "$got" ] || { log "T10 mismatch on $t: manifest $want, restored $got"; MISMATCH=1; }
done
[ "$MISMATCH" = 0 ] || die "FAIL T10: restored counts do not match the manifest"
log "PASS T10 restored counts match the manifest for all 15 closure tables"
assert_eq "T11 public redistribution stays disabled" 2 \
  "$(q bk_target "select count(*) from training.dataset_registry where slug like 'owned_%' and redistribution_allowed is false")"
assert_eq "T12 geometry training weight stays zero" 2 \
  "$(q bk_target "select count(*) from training.dataset_registry where slug like 'owned_%' and coalesce((metadata->>'geometry_training_weight')::numeric, 0) = 0")"

# ---- G*: SQL-verifiable ingestion gates ----
qf bk_gates "$HARNESS_DIR/training_gates_test.sql" >"$WORK/gates.log" 2>&1 \
  || { tail -30 "$WORK/gates.log" >&2; die "FAIL gates: training_gates_test.sql failed"; }
log "PASS G1–G8 ingestion-gate assertions (see tests/private-backup/training_gates_test.sql)"

# ---- T13: full corpus smoke on a corpus-shaped local target ----
env "TRAINING_DB_URL=$(db_url bk_corpus)" "TRAINING_BACKUP_AGE_IDENTITY_FILE=$KEYS/backup.key" \
  bash "$REPO/scripts/training-private-restore.sh" --input "$ARCHIVE" >"$WORK/restore-corpus.log" 2>&1 \
  || { tail -20 "$WORK/restore-corpus.log" >&2; die "FAIL T13: restore into corpus DB failed"; }
# Runbook order: enable ingestion explicitly only after the environment is
# ready. This is the disposable local database, never production.
q bk_corpus "update training.runtime_config set value='http://disposable-local.invalid', updated_at=now() where key='edge_base_url'" >/dev/null
q bk_corpus "update training.runtime_config set value='true', updated_at=now() where key='ingestion_enabled'" >/dev/null
( cd "$REPO" && SUPABASE_DB_URL="$(db_url bk_corpus)" npm run --silent db:smoke:training ) >"$WORK/smoke.log" 2>&1 \
  || { tail -30 "$WORK/smoke.log" >&2; die "FAIL T13: db:smoke:training failed against the corpus-shaped local target"; }
qf bk_corpus "$REPO/tests/sql/private_training_restore_smoke.sql" >/dev/null 2>&1 \
  || die "FAIL T13: private restore smoke failed on corpus target"
log "PASS T13 db:smoke:training + private restore smoke on corpus-shaped local target"

log "ALL LOCAL BACKUP/RESTORE AND GATE TESTS PASSED"

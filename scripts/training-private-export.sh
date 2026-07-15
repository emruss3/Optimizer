#!/usr/bin/env bash
# Encrypted export of the owner-controlled private training corpus.
#
# Exports the full dependency closure for the root datasets defined in
# docs/private-training-backup-scope.md as one JSONL file per table, writes a
# manifest with per-file SHA-256 checksums and row counts, and produces a
# single age-encrypted tar archive plus a .sha256 sidecar. No plaintext ever
# leaves the 0700 temp directory and no row contents are ever printed.
#
# Usage:
#   TRAINING_BACKUP_AGE_RECIPIENT='age1...' \
#   TRAINING_BACKUP_SOURCE_LABEL='staging' \
#   SUPABASE_DB_URL='postgresql://...' \
#   scripts/training-private-export.sh [--output-dir DIR]
#
# Environment:
#   SUPABASE_DB_URL / TRAINING_DB_URL    source database (never printed)
#   TRAINING_BACKUP_AGE_RECIPIENT       age recipient (public key) to encrypt to
#   TRAINING_BACKUP_SOURCE_LABEL        environment label recorded in manifest
#   TRAINING_BACKUP_OUTPUT_DIR          default output dir (private-backups/)
#
# The output directory is git-ignored; archives must never be committed.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/training-private-common.sh
. "$SCRIPT_DIR/lib/training-private-common.sh"

OUTPUT_DIR="${TRAINING_BACKUP_OUTPUT_DIR:-$SCRIPT_DIR/../private-backups}"
while [ $# -gt 0 ]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

require_cmd psql age jq tar sha256sum awk
require_env TRAINING_BACKUP_AGE_RECIPIENT TRAINING_BACKUP_SOURCE_LABEL
DB_URL="$(training_db_url)"

WORKDIR="$(training_make_workdir)"
trap 'rm -rf "$WORKDIR"' EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BUNDLE="training-private-backup-${STAMP}"
BUNDLE_DIR="$WORKDIR/$BUNDLE"
mkdir -p "$BUNDLE_DIR/tables"

SLUGS_SQL="$(training_root_slugs_sql)"

log "verifying source database and root datasets"
ROOT_COUNT="$(run_sql "$DB_URL" -c "select count(*) from training.dataset_registry where slug in (${SLUGS_SQL})")"
EXPECTED_ROOTS="$(printf '%s\n' $TRAINING_ROOT_SLUGS | wc -l | tr -d ' ')"
[ "$ROOT_COUNT" = "$EXPECTED_ROOTS" ] \
  || die "source has $ROOT_COUNT of $EXPECTED_ROOTS root datasets; refusing to export a partial corpus"

REQUIRED_MIGRATION="$(run_sql "$DB_URL" -c "select coalesce(max(version),'') from supabase_migrations.schema_migrations where version ~ '^[0-9]{14}\$'")"
[ -n "$REQUIRED_MIGRATION" ] \
  || die "source database has no supabase_migrations ledger; cannot record a required migration version"

# Build one psql script that computes the closure and \copy's every table
# out as raw JSONL. The script contains only table names and paths.
EXPORT_SQL="$WORKDIR/export.sql"
{
  echo "begin;"
  echo "set transaction isolation level repeatable read;"
  training_closure_temp_tables_sql "$SLUGS_SQL"
  for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
    printf '\\copy (%s) to %s with (%s)\n' \
      "$(training_export_select_sql "$t")" \
      "'$BUNDLE_DIR/tables/$t.jsonl'" \
      "$TRAINING_COPY_OPTS"
  done
  echo "rollback;"
} > "$EXPORT_SQL"

log "exporting dependency closure (${#TRAINING_CLOSURE_TABLES[@]} tables)"
run_sql_file "$DB_URL" "$EXPORT_SQL" >/dev/null

# Row counts (one JSON document per line) + per-file checksums + baseline warnings.
COUNTS_JSON="{}"
CHECKSUMS_JSON="{}"
for t in "${TRAINING_CLOSURE_TABLES[@]}"; do
  f="$BUNDLE_DIR/tables/$t.jsonl"
  [ -f "$f" ] || die "export file for $t was not produced"
  n="$(wc -l < "$f" | tr -d ' ')"
  min="$(training_baseline_min "$t")"
  if [ "$n" -lt "$min" ]; then
    log "WARNING: $t exported $n rows, below the documented baseline of $min"
  fi
  h="$(sha256_of "$f")"
  COUNTS_JSON="$(jq -c --arg t "$t" --argjson n "$n" '. + {($t): $n}' <<<"$COUNTS_JSON")"
  CHECKSUMS_JSON="$(jq -c --arg k "tables/$t.jsonl" --arg v "$h" '. + {($k): $v}' <<<"$CHECKSUMS_JSON")"
  log "exported $t: $n rows"
done

GIT_COMMIT="$(git -C "$SCRIPT_DIR/.." rev-parse HEAD 2>/dev/null || echo unknown)"

jq -n \
  --argjson format_version "$TRAINING_BACKUP_FORMAT_VERSION" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg source_env_label "$TRAINING_BACKUP_SOURCE_LABEL" \
  --arg required_migration_version "$REQUIRED_MIGRATION" \
  --argjson root_slugs "$(training_root_slugs_json)" \
  --argjson row_counts "$COUNTS_JSON" \
  --argjson file_checksums "$CHECKSUMS_JSON" \
  --arg exporter_git_commit "$GIT_COMMIT" \
  '{format_version: $format_version,
    created_at: $created_at,
    source_env_label: $source_env_label,
    required_migration_version: $required_migration_version,
    root_slugs: $root_slugs,
    row_counts: $row_counts,
    file_checksums: $file_checksums,
    exporter_git_commit: $exporter_git_commit}' \
  > "$BUNDLE_DIR/manifest.json"

# Encrypt before anything leaves the workdir. There is no plaintext fallback.
mkdir -p "$OUTPUT_DIR"
ARCHIVE="$OUTPUT_DIR/$BUNDLE.tar.age"
tar -C "$WORKDIR" -cf - "$BUNDLE" \
  | age -r "$TRAINING_BACKUP_AGE_RECIPIENT" -o "$ARCHIVE" \
  || die "encryption failed; nothing was written unencrypted"
chmod 600 "$ARCHIVE"

( cd "$OUTPUT_DIR" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
chmod 600 "$ARCHIVE.sha256"

training_assert_age_encrypted "$ARCHIVE"
training_verify_sidecar "$ARCHIVE"

log "wrote $(basename "$ARCHIVE") ($(wc -c < "$ARCHIVE" | tr -d ' ') bytes) and checksum sidecar"
log "export complete; required migration version $REQUIRED_MIGRATION; source label $TRAINING_BACKUP_SOURCE_LABEL"

# shellcheck shell=bash
# Shared helpers for the encrypted private training-corpus backup/restore tools.
#
# Security contract (see docs/private-training-backup-scope.md):
#   - Plaintext exists only inside a 0700 temp dir created under umask 077.
#   - Row contents, private URLs, extracted text, and tokens are never printed.
#   - Encryption identities/recipients come from the environment, never from Git.
#
# This file is sourced by scripts/training-private-export.sh and
# scripts/training-private-restore.sh. It contains no secrets and no data.

set -euo pipefail
umask 077

TRAINING_BACKUP_FORMAT_VERSION=1

# Root datasets in scope. Overridable only for isolated test harnesses.
TRAINING_ROOT_SLUGS=${TRAINING_ROOT_SLUGS:-"owned_1300_4th_ave_multifamily_cd owned_townhome_cd_20260311"}

# Dependency-closure tables in restore (dependency) order.
# See docs/private-training-backup-scope.md "Suggested restore order".
TRAINING_CLOSURE_TABLES=(
  dataset_registry
  dataset_artifacts
  staged_text_artifacts
  pdf_page_extract
  raw_documents
  site_precedents
  site_features
  precedent_constraints
  precedent_units
  building_interiors
  interior_spaces
  interior_connections
  interior_elements
  program_templates
  training_release_datasets
)

# Identity-key note: raw_documents, site_features, precedent_constraints,
# interior_spaces, interior_connections, and interior_elements use bigint
# GENERATED ALWAYS AS IDENTITY keys. Restores re-sequence those ids on the
# target (verbatim values can collide with unrelated corpus rows) and remap
# the only in-closure reference to them (interior_connections -> interior
# _spaces) so every relationship stays intact. UUID keys are preserved.

# Documented validation baseline (minimums, not hard limits). The manifest
# always records actual counts; export warns when a table is below baseline.
training_baseline_min() {
  case "$1" in
    dataset_registry) echo 2 ;;
    dataset_artifacts) echo 2 ;;
    staged_text_artifacts) echo 0 ;;
    pdf_page_extract) echo 7 ;;
    raw_documents) echo 14 ;;
    site_precedents) echo 2 ;;
    site_features) echo 0 ;;
    precedent_constraints) echo 0 ;;
    precedent_units) echo 154 ;;
    building_interiors) echo 14 ;;
    interior_spaces) echo 24 ;;
    interior_connections) echo 21 ;;
    interior_elements) echo 6 ;;
    program_templates) echo 14 ;;
    training_release_datasets) echo 2 ;;
    *) echo 0 ;;
  esac
}

# COPY options that move one raw JSON document per line without text-format
# backslash mangling: JSON never contains raw control bytes, so \x01/\x02 are
# safe as quote/delimiter and every line passes through unchanged.
TRAINING_COPY_OPTS="format csv, quote e'\\x01', delimiter e'\\x02', header false"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "required command '$c' is not installed. Install it and retry (age: https://age-encryption.org)."
  done
}

require_env() {
  local v
  for v in "$@"; do
    [ -n "${!v:-}" ] || die "required environment variable $v is not set"
  done
}

# Resolve the database URL without ever printing it.
training_db_url() {
  if [ -n "${TRAINING_DB_URL:-}" ]; then
    printf '%s' "$TRAINING_DB_URL"
  elif [ -n "${SUPABASE_DB_URL:-}" ]; then
    printf '%s' "$SUPABASE_DB_URL"
  else
    die "set TRAINING_DB_URL or SUPABASE_DB_URL (never passed as a flag, never printed)"
  fi
}

# psql wrapper: fail fast, no psqlrc, quiet, tuples only. Callers must ensure
# queries never SELECT private row bodies for display.
run_sql() {
  local url="$1"; shift
  psql "$url" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -At "$@"
}

# Run a psql script file (may contain \copy meta-commands referencing files
# inside the private workdir only).
run_sql_file() {
  local url="$1" file="$2"; shift 2
  psql "$url" --no-psqlrc -X -q -v ON_ERROR_STOP=1 -f "$file" "$@"
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

# 0700 workdir under umask 077 with guaranteed cleanup of all plaintext.
training_make_workdir() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/training-private.XXXXXXXX")"
  chmod 700 "$d"
  printf '%s' "$d"
}

# SQL literal list of root slugs: 'a','b'
training_root_slugs_sql() {
  local out="" s
  for s in $TRAINING_ROOT_SLUGS; do
    case "$s" in
      *"'"*) die "invalid root slug" ;;
    esac
    out+="${out:+,}'${s}'"
  done
  printf '%s' "$out"
}

# JSON array of root slugs
training_root_slugs_json() {
  printf '%s\n' $TRAINING_ROOT_SLUGS | jq -R . | jq -cs .
}

# Verify an "sha256sum -c"-style sidecar for a file. Sidecar must sit next to
# the file and reference its basename.
training_verify_sidecar() {
  local file="$1" sidecar="$1.sha256"
  [ -f "$sidecar" ] || die "checksum sidecar $(basename "$sidecar") is missing; refusing to continue"
  (cd "$(dirname "$file")" && sha256sum --check --status "$(basename "$sidecar")") \
    || die "checksum mismatch for $(basename "$file"); the archive is corrupt or has been tampered with"
}

# Assert a file is an age-encrypted archive (refuse plaintext input).
training_assert_age_encrypted() {
  local file="$1" header
  header="$(head -c 20 "$file" 2>/dev/null || true)"
  case "$header" in
    "age-encryption.org/"*) : ;;
    *) die "$(basename "$file") is not an age-encrypted archive; plaintext input is refused" ;;
  esac
}

# The export/restore SELECT closure, shared so both sides agree byte-for-byte.
# Emits SQL that creates temp tables _roots/_artifacts/_precedents/_interiors
# from a live training schema. $1 = SQL literal list of root slugs.
training_closure_temp_tables_sql() {
  local slugs="$1"
  cat <<SQL
create temp table _roots as
  select id, slug from training.dataset_registry where slug in (${slugs});
create temp table _artifacts as
  select a.id from training.dataset_artifacts a join _roots r on r.id = a.dataset_id;
create temp table _precedents as
  select p.id from training.site_precedents p join _roots r on r.id = p.dataset_id;
create temp table _interiors as
  select b.id from training.building_interiors b join _roots r on r.id = b.dataset_id;
SQL
}

# Per-table export SELECT producing exactly one jsonb document per row.
#   - geometry columns are overridden with EWKB hex (SRID-preserving, and the
#     canonical text input format for PostGIS, so restore round-trips exactly)
#   - viewer capability keys are stripped from artifact/registry metadata
#   - training_release_datasets embeds the release natural key so restore can
#     remap release_id in environments where migrations reseeded releases
training_export_select_sql() {
  local t="$1"
  local strip="- 'viewer_token' - 'viewer_expires_at' - 'viewer_issued_at'"
  case "$t" in
    dataset_registry)
      echo "select to_jsonb(t) || jsonb_build_object('metadata', t.metadata ${strip}) from training.dataset_registry t join _roots r on r.id = t.id order by t.slug" ;;
    dataset_artifacts)
      echo "select to_jsonb(t) || jsonb_build_object('metadata', t.metadata ${strip}) from training.dataset_artifacts t join _roots r on r.id = t.dataset_id order by t.id" ;;
    staged_text_artifacts)
      echo "select to_jsonb(t) from training.staged_text_artifacts t join _artifacts a on a.id = t.artifact_id order by t.artifact_id" ;;
    pdf_page_extract)
      echo "select to_jsonb(t) from training.pdf_page_extract t join _artifacts a on a.id = t.artifact_id order by t.artifact_id, t.page_number" ;;
    raw_documents)
      echo "select to_jsonb(t) from training.raw_documents t join _roots r on r.id = t.dataset_id order by t.id" ;;
    site_precedents)
      echo "select to_jsonb(t) || jsonb_build_object('parcel_geom', case when t.parcel_geom is null then null else encode(public.st_asewkb(t.parcel_geom),'hex') end, 'site_geom', case when t.site_geom is null then null else encode(public.st_asewkb(t.site_geom),'hex') end) from training.site_precedents t join _roots r on r.id = t.dataset_id order by t.id" ;;
    site_features)
      echo "select to_jsonb(t) || jsonb_build_object('geom', case when t.geom is null then null else encode(public.st_asewkb(t.geom),'hex') end) from training.site_features t join _precedents p on p.id = t.precedent_id order by t.id" ;;
    precedent_constraints)
      echo "select to_jsonb(t) from training.precedent_constraints t join _precedents p on p.id = t.precedent_id order by t.id" ;;
    precedent_units)
      echo "select to_jsonb(t) from training.precedent_units t join _precedents p on p.id = t.precedent_id order by t.id" ;;
    building_interiors)
      echo "select to_jsonb(t) from training.building_interiors t join _roots r on r.id = t.dataset_id order by t.id" ;;
    interior_spaces)
      echo "select to_jsonb(t) || jsonb_build_object('geom', case when t.geom is null then null else encode(public.st_asewkb(t.geom),'hex') end) from training.interior_spaces t join _interiors i on i.id = t.interior_id order by t.id" ;;
    interior_connections)
      echo "select to_jsonb(t) from training.interior_connections t join _interiors i on i.id = t.interior_id order by t.id" ;;
    interior_elements)
      echo "select to_jsonb(t) || jsonb_build_object('geom', case when t.geom is null then null else encode(public.st_asewkb(t.geom),'hex') end) from training.interior_elements t join _interiors i on i.id = t.interior_id order by t.id" ;;
    program_templates)
      echo "select to_jsonb(t) from training.program_templates t join _roots r on r.id = t.source_dataset_id order by t.id" ;;
    training_release_datasets)
      echo "select to_jsonb(t) || jsonb_build_object('release_name', tr.name, 'release_version', tr.version) from training.training_release_datasets t join training.training_releases tr on tr.id = t.release_id join _roots r on r.id = t.dataset_id order by tr.name, tr.version, t.dataset_id" ;;
    *) die "unknown closure table $t" ;;
  esac
}

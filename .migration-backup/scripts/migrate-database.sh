#!/usr/bin/env bash
# Database migration utility — exports from source Postgres, imports to target.
#
# Use cases:
#   1. Replit → self-hosted (migrate to Railway, Fly, VPS, local)
#   2. Neon → Neon (branch or project transfer)
#   3. Local dev → staging
#   4. Full backup + restore
#
# Usage:
#   bash scripts/migrate-database.sh --source "$SOURCE_URL" --target "$TARGET_URL"
#   bash scripts/migrate-database.sh --help
#
# Required tools: psql, pg_dump, pg_restore (part of postgresql-client)
# Install: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ── Color helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BLUE}▸${NC} $*"; }
info() { echo -e "  $*"; }

# ── Argument parsing ────────────────────────────────────────────────────────
SOURCE_URL=""
TARGET_URL=""
DRY_RUN=false
SCHEMA_ONLY=false
DATA_ONLY=false
SKIP_CONFIRM=false

usage() {
  cat <<EOF
Usage: bash scripts/migrate-database.sh [options]

Options:
  --source URL      Source database URL (export from)
  --target URL      Target database URL (import to)
  --dry-run         Print what would happen without executing
  --schema-only     Export/import schema only (no data)
  --data-only       Export/import data only (schema must already exist)
  --yes             Skip confirmation prompt
  --help            Show this help

URL format: postgresql://user:password@host:5432/dbname?sslmode=require

Examples:
  # Full migration (Replit Neon → Railway Postgres)
  bash scripts/migrate-database.sh \\
    --source "\$REPLIT_DATABASE_URL" \\
    --target "\$RAILWAY_DATABASE_URL"

  # Schema-only (preview the structure)
  bash scripts/migrate-database.sh \\
    --source "\$SOURCE_URL" \\
    --target "\$TARGET_URL" \\
    --schema-only

  # Backup source to local file (omit --target)
  pg_dump --no-owner --no-acl --format=custom "\$SOURCE_URL" > backup.dump
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)       SOURCE_URL="$2"; shift 2 ;;
    --target)       TARGET_URL="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --schema-only)  SCHEMA_ONLY=true; shift ;;
    --data-only)    DATA_ONLY=true; shift ;;
    --yes)          SKIP_CONFIRM=true; shift ;;
    --help)         usage; exit 0 ;;
    *)              fail "Unknown flag: $1. Run with --help for usage." ;;
  esac
done

# ── Validate ────────────────────────────────────────────────────────────────
[ -z "$SOURCE_URL" ] && fail "--source is required"
[ -z "$TARGET_URL" ] && fail "--target is required"
[ "$SCHEMA_ONLY" = true ] && [ "$DATA_ONLY" = true ] && fail "--schema-only and --data-only are mutually exclusive"

command -v pg_dump     &>/dev/null || fail "pg_dump not found. Install postgresql-client."
command -v pg_restore  &>/dev/null || fail "pg_restore not found. Install postgresql-client."
command -v psql        &>/dev/null || fail "psql not found. Install postgresql-client."

# ── Summary ─────────────────────────────────────────────────────────────────
# Mask password for display
mask_url() {
  echo "$1" | sed 's|://[^:]*:[^@]*@|://***:***@|'
}

echo ""
echo -e "${YELLOW}H+ Analytics — Database Migration${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Source:    $(mask_url "$SOURCE_URL")"
info "Target:    $(mask_url "$TARGET_URL")"
info "Mode:      $([ "$SCHEMA_ONLY" = true ] && echo "schema only" || ([ "$DATA_ONLY" = true ] && echo "data only" || echo "full (schema + data)"))"
[ "$DRY_RUN" = true ] && warn "DRY RUN — no changes will be made"
echo ""

# ── Confirmation ─────────────────────────────────────────────────────────────
if [ "$SKIP_CONFIRM" = false ] && [ "$DRY_RUN" = false ]; then
  echo -e "${RED}WARNING: This will overwrite data in the target database.${NC}"
  echo -n "Continue? (yes/no): "
  read -r confirm
  [ "$confirm" != "yes" ] && { echo "Aborted."; exit 0; }
fi

DUMP_FILE="$(mktemp /tmp/hanalytics-dump-XXXXXX.dump)"
trap 'rm -f "$DUMP_FILE"' EXIT

# ── Step 1: Connectivity check ──────────────────────────────────────────────
step "Checking connectivity..."

if [ "$DRY_RUN" = false ]; then
  psql "$SOURCE_URL" -c "SELECT 1;" &>/dev/null || fail "Cannot connect to source database"
  ok "Source database reachable"
  psql "$TARGET_URL" -c "SELECT 1;" &>/dev/null || fail "Cannot connect to target database"
  ok "Target database reachable"
fi

# ── Step 2: Export from source ──────────────────────────────────────────────
step "Exporting from source..."

DUMP_FLAGS=(--no-owner --no-acl --format=custom)
[ "$SCHEMA_ONLY" = true ] && DUMP_FLAGS+=(--schema-only)
[ "$DATA_ONLY"   = true ] && DUMP_FLAGS+=(--data-only)

if [ "$DRY_RUN" = true ]; then
  info "Would run: pg_dump ${DUMP_FLAGS[*]} <SOURCE_URL> > $DUMP_FILE"
else
  pg_dump "${DUMP_FLAGS[@]}" "$SOURCE_URL" > "$DUMP_FILE"
  DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
  ok "Export complete (${DUMP_SIZE})"
fi

# ── Step 3: Enable pgvector on target ───────────────────────────────────────
step "Enabling pgvector extension on target..."

if [ "$DRY_RUN" = true ]; then
  info "Would run: psql <TARGET_URL> -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
else
  psql "$TARGET_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" &>/dev/null \
    && ok "pgvector enabled" \
    || warn "Could not enable pgvector — your Postgres may not have it installed. Install pgvector or use pgvector/pgvector Docker image."
fi

# ── Step 4: Import to target ─────────────────────────────────────────────────
step "Importing to target..."

RESTORE_FLAGS=(--no-owner --no-acl --clean --if-exists)

if [ "$DRY_RUN" = true ]; then
  info "Would run: pg_restore ${RESTORE_FLAGS[*]} -d <TARGET_URL> $DUMP_FILE"
else
  pg_restore "${RESTORE_FLAGS[@]}" -d "$TARGET_URL" "$DUMP_FILE" \
    && ok "Import complete" \
    || warn "pg_restore exited with warnings (often harmless — check output above for errors)"
fi

# ── Step 5: Run any outstanding Drizzle migrations ──────────────────────────
step "Running Drizzle schema push on target..."

if [ "$DATA_ONLY" = false ]; then
  if [ "$DRY_RUN" = true ]; then
    info "Would run: POSTGRES_URL=<TARGET_URL> pnpm run db:push --force"
  else
    POSTGRES_URL="$TARGET_URL" pnpm run db:push --force < /dev/null
    ok "Drizzle schema sync complete"
  fi
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Migration complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Verify your target database is healthy:"
info "  POSTGRES_URL=<TARGET_URL> pnpm run verify:summary"
echo ""

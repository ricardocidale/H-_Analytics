#!/usr/bin/env bash
# Local development setup — run this once after `docker compose up -d`
#
# What it does:
#   1. Verifies Docker services are healthy
#   2. Creates/updates .env.local from .env.example
#   3. Enables the pgvector extension on local Postgres
#   4. Runs Drizzle schema push (creates all tables)
#   5. Seeds model defaults from shared/constants.ts
#   6. Prints next steps
#
# Usage:
#   bash scripts/setup-local.sh
#   bash scripts/setup-local.sh --reset   # wipe + re-seed (dev only)

set -euo pipefail

RESET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# ── Color helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
step() { echo -e "\n${YELLOW}▸${NC} $*"; }

# ── Prerequisites ───────────────────────────────────────────────────────────
step "Checking prerequisites..."

command -v docker &>/dev/null || fail "docker is required. Install from https://docs.docker.com/get-docker/"
command -v node   &>/dev/null || fail "node is required (>=22). Install from https://nodejs.org"
command -v pnpm   &>/dev/null || fail "pnpm is required. Run: npm install -g pnpm@10.26.1"
command -v psql   &>/dev/null || warn "psql not found — some setup steps will use docker exec instead"

ok "Prerequisites satisfied"

# ── Docker services health ──────────────────────────────────────────────────
step "Waiting for Docker services to be healthy..."

wait_for_service() {
  local service="$1"
  local max_wait=60
  local waited=0
  while ! docker compose ps "$service" 2>/dev/null | grep -q "healthy"; do
    if [ "$waited" -ge "$max_wait" ]; then
      fail "Service '$service' did not become healthy within ${max_wait}s. Run: docker compose logs $service"
    fi
    echo -n "."
    sleep 2
    waited=$((waited + 2))
  done
  echo ""
  ok "Service '$service' is healthy"
}

cd "$ROOT"

docker compose ps &>/dev/null || fail "Docker Compose services not running. Run: docker compose up -d"
wait_for_service postgres
wait_for_service minio

# ── .env.local ──────────────────────────────────────────────────────────────
step "Setting up .env.local..."

if [ ! -f "$ROOT/.env.local" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env.local"
  # Patch the critical vars for local dev
  sed -i'' \
    -e 's|^POSTGRES_URL=.*|POSTGRES_URL=postgresql://hanalytics:hanalytics@localhost:5432/hanalytics|' \
    -e 's|^AUTH_PROVIDER=.*|AUTH_PROVIDER=local|' \
    -e 's|^STORAGE_PROVIDER=.*|STORAGE_PROVIDER=local|' \
    "$ROOT/.env.local"
  ok "Created .env.local — edit it to add your AI API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY)"
else
  ok ".env.local already exists (skipping)"
fi

# ── Export env vars for subsequent commands ─────────────────────────────────
set -a
# shellcheck source=/dev/null
source "$ROOT/.env.local"
set +a

# Ensure POSTGRES_URL is set for drizzle-kit
export POSTGRES_URL="${POSTGRES_URL:-postgresql://hanalytics:hanalytics@localhost:5432/hanalytics}"

# ── Reset (optional) ────────────────────────────────────────────────────────
if [ "$RESET" = "--reset" ]; then
  step "Resetting database (--reset flag)..."
  docker compose exec -T postgres psql -U hanalytics -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" &>/dev/null
  ok "Database reset"
fi

# ── pgvector extension ──────────────────────────────────────────────────────
step "Enabling pgvector extension..."

docker compose exec -T postgres psql -U hanalytics -d hanalytics \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" &>/dev/null
ok "pgvector extension enabled"

# ── Drizzle schema push ─────────────────────────────────────────────────────
step "Pushing Drizzle schema to local Postgres..."

pnpm run db:push --force 2>&1 | tail -5
ok "Schema pushed"

# ── Seed model defaults ─────────────────────────────────────────────────────
step "Seeding model defaults..."

npx tsx "$ROOT/script/seed-model-defaults.ts"
ok "Model defaults seeded"

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Local environment ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Start the app:      pnpm dev:local"
echo "  MinIO console:      http://localhost:9001  (minioadmin/minioadmin)"
echo "  App URL:            http://localhost:5000"
echo ""
echo "  Add API keys to .env.local to enable AI features:"
echo "    ANTHROPIC_API_KEY=sk-ant-..."
echo "    OPENAI_API_KEY=sk-..."
echo "    GOOGLE_AI_API_KEY=AIza..."
echo ""

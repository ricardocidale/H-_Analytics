#!/usr/bin/env bash
# End-to-end smoke test for the coderabbit-loop suite.
# Verifies toggle → status → write-state → parse → review-loop helpers form
# a coherent whole without invoking the real CodeRabbit CLI or GitHub API.
# Run from repo root: bash scripts/tests/coderabbit-loop-integration.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." >/dev/null 2>&1 && pwd)"
TOGGLE_SCRIPT="$REPO_ROOT/scripts/coderabbit-loop.sh"
REVIEW_SCRIPT="$REPO_ROOT/scripts/coderabbit-loop-review.sh"
AUTOFIX_SCRIPT="$REPO_ROOT/scripts/coderabbit-loop-autofix.sh"
SCRATCH="$REPO_ROOT/.local/coderabbit-loop"

pass=0
fail=0

ok()   { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1"; fail=$((fail + 1)); }
assert_contains() { echo "$1" | grep -q "$2" && ok "$3" || fail "$3: expected '$2' in output"; }

# Backup and restore scratch directory
SCRATCH_DIR="$REPO_ROOT/.local/coderabbit-loop-test-integration-$$"
SCRATCH_BACKUP="$SCRATCH_DIR/scratch-backup"
cleanup() {
  rm -rf "$SCRATCH_DIR"
  if [ -d "$SCRATCH_BACKUP" ]; then
    rm -rf "$SCRATCH"
    mv "$SCRATCH_BACKUP" "$SCRATCH" 2>/dev/null || true
  fi
}
trap cleanup EXIT
mkdir -p "$SCRATCH_DIR"
if [ -d "$SCRATCH" ]; then
  cp -a "$SCRATCH" "$SCRATCH_BACKUP" 2>/dev/null || true
fi

echo "=== coderabbit-loop integration smoke tests ==="
echo

# ─── 1. Toggle round-trip ─────────────────────────────────────
echo "--- toggle round-trip ---"
marker="$REPO_ROOT/.local/opmode/active"

bash "$TOGGLE_SCRIPT" on  >/dev/null 2>&1
[ -f "$marker" ] && ok "toggle: on creates marker" || fail "toggle: on did not create marker"

on_out="$(bash "$TOGGLE_SCRIPT" status 2>&1)" || true
assert_contains "$on_out" "CodeRabbit loop: ON" "toggle: status reports ON after on"

bash "$TOGGLE_SCRIPT" off >/dev/null 2>&1
[ ! -f "$marker" ] && ok "toggle: off removes marker" || fail "toggle: off did not remove marker"

off_out="$(bash "$TOGGLE_SCRIPT" status 2>&1)" || true
assert_contains "$off_out" "CodeRabbit loop: OFF" "toggle: status reports OFF after off"

# ─── 2. write-state → status shows active session ────────────
echo "--- write-state + status active session ---"
mkdir -p "$SCRATCH"
chmod 700 "$SCRATCH"
bash "$REVIEW_SCRIPT" write-state mode=review status=running current_iteration=1 \
  started_at=2026-05-12T10:00:00Z >/dev/null

status_out="$(bash "$TOGGLE_SCRIPT" status 2>&1)" || true
assert_contains "$status_out" "Active loop:" "integration: status shows Active loop when run.json present"
assert_contains "$status_out" "running"      "integration: status shows running status"
rm -f "$SCRATCH/run.json"

# ─── 3. Synthetic working-tree review loop (no real CR CLI) ───
echo "--- synthetic review loop: write-state sequence ---"
bash "$REVIEW_SCRIPT" write-state mode=review status=running current_iteration=0 \
  started_at=2026-05-12T10:00:00Z >/dev/null

# Simulate iteration 1: save state, simulate parse-ndjson, update state
cat > "$SCRATCH/iteration-01.ndjson" <<'NDJSON'
{"type":"finding","severity":"major","fileName":"src/foo.ts","codegenInstructions":"Fix the issue"}
{"type":"finding","severity":"minor","fileName":"src/bar.ts","codegenInstructions":"Add null check"}
{"type":"complete","summary":"Done"}
NDJSON
chmod 600 "$SCRATCH/iteration-01.ndjson"

parse_out="$(bash "$REVIEW_SCRIPT" parse-ndjson "$SCRATCH/iteration-01.ndjson")"
assert_contains "$parse_out" "ACTIONABLE_COUNT=2" "integration: parse-ndjson finds 2 actionable findings"

bash "$REVIEW_SCRIPT" write-state current_iteration=1 status=running >/dev/null

# Simulate iteration 2: zero findings
cat > "$SCRATCH/iteration-02.ndjson" <<'NDJSON'
{"type":"complete","summary":"All issues resolved"}
NDJSON
chmod 600 "$SCRATCH/iteration-02.ndjson"

parse_out2="$(bash "$REVIEW_SCRIPT" parse-ndjson "$SCRATCH/iteration-02.ndjson")"
assert_contains "$parse_out2" "ACTIONABLE_COUNT=0" "integration: parse-ndjson reports 0 actionable on clean pass"

bash "$REVIEW_SCRIPT" write-state current_iteration=2 status=complete-clean >/dev/null

# Verify final state
final_state="$(python3 -c "import json; d=json.load(open('$SCRATCH/run.json')); print(d['status'])")"
[ "$final_state" = "complete-clean" ] \
  && ok "integration: run.json shows complete-clean after loop" \
  || fail "integration: expected complete-clean, got $final_state"

# ─── 4. §9 persist+post-check end-to-end ─────────────────────
echo "--- §9 persist + post-check round-trip ---"
bash "$REVIEW_SCRIPT" section9-persist-precheck "src/foo.ts
src/bar.ts" >/dev/null

# Bot adds a §9 path not in precheck
post_out="$(bash "$REVIEW_SCRIPT" section9-post-check "src/foo.ts
src/bar.ts
lib/engine/src/irr.ts")"
assert_contains "$post_out" "SECTION9_POST_INTERSECT" "integration: §9 post-check detects bot-introduced §9 edit"

# Bot only adds safe paths
post_clean="$(bash "$REVIEW_SCRIPT" section9-post-check "src/foo.ts
src/bar.ts
src/baz.ts")"
assert_contains "$post_clean" "SECTION9_POST_CLEAN" "integration: §9 post-check passes when no new §9 paths"

# ─── 5. gate-check smoke ─────────────────────────────────────
echo "--- gate-check smoke ---"
gate_out="$(bash "$REVIEW_SCRIPT" gate-check 2>&1)" || true
assert_contains "$gate_out" "gate-check:" "integration: gate-check runs and produces output"

# ─── 6. Runbook exists and references key sections ───────────
echo "--- runbook exists ---"
runbook="$REPO_ROOT/docs/runbooks/coderabbit-loop-workflow.md"
[ -f "$runbook" ] && ok "runbook exists at docs/runbooks/coderabbit-loop-workflow.md" \
  || fail "runbook missing"

runbook_out="$(cat "$runbook")"
assert_contains "$runbook_out" "Global install" "runbook: contains global install section"
assert_contains "$runbook_out" "§9"             "runbook: contains §9 policy section"
assert_contains "$runbook_out" "GITHUB_PAT"     "runbook: mentions GITHUB_PAT"
assert_contains "$runbook_out" "Troubleshooting" "runbook: contains troubleshooting section"

# ─── 7. CLAUDE.md and replit.md trigger tables are identical ──
echo "--- CLAUDE.md and replit.md trigger tables identical ---"
diff_result="$(diff \
  <(awk '/^## Natural-language commands/,/^---$/' "$REPO_ROOT/CLAUDE.md") \
  <(awk '/^## Natural-language commands/,/^---$/' "$REPO_ROOT/replit.md") 2>&1)" || true
[ -z "$diff_result" ] \
  && ok "CLAUDE.md and replit.md trigger tables are identical" \
  || fail "CLAUDE.md and replit.md trigger tables DIFFER: $diff_result"

echo
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && exit 0 || exit 1

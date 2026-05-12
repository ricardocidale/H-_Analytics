#!/usr/bin/env bash
# Tests for coderabbit-loop-review.sh helper subcommands.
# Run from repo root: bash scripts/tests/coderabbit-loop-review.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." >/dev/null 2>&1 && pwd)"
SCRIPT="$REPO_ROOT/scripts/coderabbit-loop-review.sh"
SCRATCH_DIR="$REPO_ROOT/.local/coderabbit-loop-test-$$"

pass=0
fail=0

ok()   { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1"; fail=$((fail + 1)); }
assert_contains()     { echo "$1" | grep -q "$2"  && ok "$3" || fail "$3: expected '$2' in output"; }
assert_not_contains() { echo "$1" | grep -qv "$2" && ok "$3" || fail "$3: expected no '$2' in output"; }
assert_equals()       { [ "$1" = "$2" ] && ok "$3" || fail "$3: expected '$2', got '$1'"; }

cleanup() { rm -rf "$SCRATCH_DIR"; }
trap cleanup EXIT

mkdir -p "$SCRATCH_DIR"

echo "=== coderabbit-loop-review helper tests ==="
echo

# ─── parse-ndjson ────────────────────────────────────────────────
echo "--- parse-ndjson: happy path ---"

cat > "$SCRATCH_DIR/iter1.ndjson" <<'NDJSON'
{"type":"review_context","data":"some context"}
{"type":"status","message":"Starting review"}
{"type":"finding","severity":"major","fileName":"src/foo.ts","codegenInstructions":"Remove unused import","suggestions":[]}
{"type":"finding","severity":"minor","fileName":"src/bar.ts","codegenInstructions":"Add missing null check","suggestions":[]}
{"type":"finding","severity":"trivial","fileName":"src/baz.ts","codegenInstructions":"Fix typo","suggestions":[]}
{"type":"complete","summary":"Done"}
NDJSON

out="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/iter1.ndjson")"
assert_contains "$out" "ACTIONABLE_COUNT=2" "parse-ndjson: counts major+minor as actionable (excludes trivial)"
assert_contains "$out" "FINDING:major:src/foo.ts" "parse-ndjson: emits major finding"
assert_contains "$out" "FINDING:minor:src/bar.ts" "parse-ndjson: emits minor finding"
assert_not_contains "$out" "trivial" "parse-ndjson: excludes trivial findings"
assert_contains "$out" "FINDING_JSON:" "parse-ndjson: emits full JSON for each finding"

# --- zero findings ---
echo "--- parse-ndjson: zero actionable findings ---"

cat > "$SCRATCH_DIR/iter_clean.ndjson" <<'NDJSON'
{"type":"review_context","data":"some context"}
{"type":"finding","severity":"trivial","fileName":"src/nit.ts","codegenInstructions":"Cosmetic nit","suggestions":[]}
{"type":"finding","severity":"info","fileName":"src/info.ts","codegenInstructions":"Informational note","suggestions":[]}
{"type":"complete","summary":"Done"}
NDJSON

out_clean="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/iter_clean.ndjson")"
assert_contains "$out_clean" "ACTIONABLE_COUNT=0" "parse-ndjson: trivial+info count as zero actionable"

# --- critical finding is actionable ---
echo "--- parse-ndjson: critical is actionable ---"

cat > "$SCRATCH_DIR/iter_crit.ndjson" <<'NDJSON'
{"type":"finding","severity":"critical","fileName":"src/auth.ts","codegenInstructions":"SQL injection","suggestions":[]}
{"type":"complete","summary":"Done"}
NDJSON

out_crit="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/iter_crit.ndjson")"
assert_contains "$out_crit" "ACTIONABLE_COUNT=1" "parse-ndjson: critical is actionable"

# --- non-finding event types are ignored ---
echo "--- parse-ndjson: event type filtering ---"

cat > "$SCRATCH_DIR/iter_events.ndjson" <<'NDJSON'
{"type":"review_context","data":"context data"}
{"type":"status","message":"in progress"}
{"type":"error","message":"temporary error"}
{"type":"complete","summary":"review done"}
NDJSON

out_events="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/iter_events.ndjson")"
assert_contains "$out_events" "ACTIONABLE_COUNT=0" "parse-ndjson: non-finding events not counted"

# --- empty / missing file ---
echo "--- parse-ndjson: edge cases ---"

cat > "$SCRATCH_DIR/empty.ndjson" <<'NDJSON'
NDJSON

out_empty="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/empty.ndjson")"
assert_contains "$out_empty" "ACTIONABLE_COUNT=0" "parse-ndjson: empty file → zero findings"

out_missing="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/nonexistent.ndjson" 2>/dev/null)"
assert_contains "$out_missing" "ACTIONABLE_COUNT=0" "parse-ndjson: missing file → zero findings (graceful)"

# --- malformed JSON lines are skipped ---
echo "--- parse-ndjson: malformed lines ---"

cat > "$SCRATCH_DIR/iter_bad.ndjson" <<'NDJSON'
{"type":"finding","severity":"major","fileName":"src/a.ts","codegenInstructions":"fix a"}
not valid json at all
{"type":"finding","severity":"minor","fileName":"src/b.ts","codegenInstructions":"fix b"}
{"type":"complete"}
NDJSON

out_bad="$(bash "$SCRIPT" parse-ndjson "$SCRATCH_DIR/iter_bad.ndjson" 2>/dev/null)"
assert_contains "$out_bad" "ACTIONABLE_COUNT=2" "parse-ndjson: malformed lines skipped, valid findings counted"

# ─── section9-check ───────────────────────────────────────────
echo "--- section9-check ---"

out_s9_hit="$(bash "$SCRIPT" section9-check "lib/engine/src/projection.ts
src/components/foo.tsx")"
assert_contains "$out_s9_hit" "SECTION9_INTERSECT" "section9-check: detects lib/engine/src hit"
assert_contains "$out_s9_hit" "lib/engine/src/projection.ts" "section9-check: names intersecting path"

out_s9_calc="$(bash "$SCRIPT" section9-check "lib/calc/src/irr.ts")"
assert_contains "$out_s9_calc" "SECTION9_INTERSECT" "section9-check: detects lib/calc/src hit"

out_s9_constants="$(bash "$SCRIPT" section9-check "lib/shared/src/constants.ts")"
assert_contains "$out_s9_constants" "SECTION9_INTERSECT" "section9-check: detects lib/shared/src/constants*.ts hit"

out_s9_clean="$(bash "$SCRIPT" section9-check "src/components/Foo.tsx
artifacts/hospitality-business-portal/src/pages/Home.tsx")"
assert_contains "$out_s9_clean" "SECTION9_CLEAN" "section9-check: clean path returns SECTION9_CLEAN"

out_s9_empty="$(bash "$SCRIPT" section9-check "")"
assert_contains "$out_s9_empty" "SECTION9_CLEAN" "section9-check: empty list returns SECTION9_CLEAN"

# ─── check-changes ────────────────────────────────────────────
echo "--- check-changes ---"
# Create a temp uncommitted file to test
tmp_file="$REPO_ROOT/tmp-test-untracked-$$.txt"
echo "test" > "$tmp_file"
out_changes="$(bash "$SCRIPT" check-changes)"
assert_contains "$out_changes" "CHANGES_PRESENT" "check-changes: detects untracked file"
rm -f "$tmp_file"

# With clean tree (best-effort — may fail in CI with dirty tree)
# Only run if we're confident the tree is clean after cleanup
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  if bash "$SCRIPT" check-changes; then
    fail "check-changes: should return non-zero for clean tree"
  else
    ok "check-changes: exits non-zero for clean tree"
  fi
  out_no_changes="$(bash "$SCRIPT" check-changes 2>/dev/null || true)"
  assert_contains "$out_no_changes" "NO_CHANGES" "check-changes: reports NO_CHANGES for clean tree"
fi

# ─── gate-check (meta-test: just verify it runs without crash) ─
echo "--- gate-check (smoke) ---"
gate_out="$(bash "$SCRIPT" gate-check 2>&1)" || true
assert_contains "$gate_out" "gate-check:" "gate-check: runs and produces output"

# ─── branch-hygiene ───────────────────────────────────────────
echo "--- branch-hygiene (smoke) ---"
hygiene_out="$(bash "$SCRIPT" branch-hygiene 2>&1)" || true
assert_contains "$hygiene_out" "HYGIENE_" "branch-hygiene: produces HYGIENE_OK or HYGIENE_FAIL"

echo
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && exit 0 || exit 1

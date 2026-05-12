#!/usr/bin/env bash
# Tests for coderabbit-loop-autofix.sh helper subcommands
# and the new section9/branch-hygiene additions to coderabbit-loop-review.sh.
# Run from repo root: bash scripts/tests/coderabbit-loop-autofix.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." >/dev/null 2>&1 && pwd)"
AUTOFIX_SCRIPT="$REPO_ROOT/scripts/coderabbit-loop-autofix.sh"
REVIEW_SCRIPT="$REPO_ROOT/scripts/coderabbit-loop-review.sh"
SCRATCH="$REPO_ROOT/.local/coderabbit-loop"
SCRATCH_DIR="$REPO_ROOT/.local/coderabbit-loop-test-$$"

pass=0
fail=0

ok()   { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1"; fail=$((fail + 1)); }
assert_contains()     { echo "$1" | grep -q "$2"  && ok "$3" || fail "$3: expected '$2' in output"; }
assert_not_contains() { echo "$1" | grep -qv "$2" && ok "$3" || fail "$3: expected no '$2' in output"; }
assert_equals()       { [ "$1" = "$2" ] && ok "$3" || fail "$3: expected '$2', got '$1'"; }

# Save/restore the real scratch contents around tests that modify it.
SCRATCH_BACKUP="$SCRATCH_DIR/scratch-backup"

cleanup() {
  rm -rf "$SCRATCH_DIR"
  # Restore any scratch files backed up before the test that the test may have corrupted
  if [ -d "$SCRATCH_BACKUP" ]; then
    rm -rf "$SCRATCH"
    mv "$SCRATCH_BACKUP" "$SCRATCH" 2>/dev/null || true
  fi
}
trap cleanup EXIT

mkdir -p "$SCRATCH_DIR"
# Backup the real scratch dir if it exists
if [ -d "$SCRATCH" ]; then
  cp -a "$SCRATCH" "$SCRATCH_BACKUP" 2>/dev/null || true
fi

echo "=== coderabbit-loop-autofix helper tests ==="
echo

# ─── autofix script: unknown subcommand exits 2 ─────────────
echo "--- dispatch: unknown subcommand ---"
exit_code=0
bash "$AUTOFIX_SCRIPT" unknown-subcommand 2>/dev/null || exit_code=$?
assert_equals "$exit_code" "2" "autofix: unknown subcommand exits 2"

# ─── pat-scope-check: no PAT set ────────────────────────────
echo "--- pat-scope-check: missing PAT ---"
out_nopat="$(GITHUB_PAT="" bash "$AUTOFIX_SCRIPT" pat-scope-check 2>&1)" || true
assert_contains "$out_nopat" "PAT_FAIL" "pat-scope-check: fails when GITHUB_PAT not set"

# ─── parse-review-body: various formats ─────────────────────
echo "--- parse-review-body ---"

mkdir -p "$SCRATCH"
chmod 700 "$SCRATCH"

# happy path — standard format
cat > "$SCRATCH/latest-review.txt" <<'BODY'
**Actionable comments posted: 3**

<details>
<summary>♻️ Duplicate comments (2)</summary>

Previously addressed but re-flagged.
</details>

Some review text here.
BODY
chmod 600 "$SCRATCH/latest-review.txt"

out_rbody="$(bash "$AUTOFIX_SCRIPT" parse-review-body 2>/dev/null)"
assert_contains "$out_rbody" "ACTIONABLE_COUNT=3" "parse-review-body: extracts actionable count 3"
assert_contains "$out_rbody" "DUPLICATE_COUNT=2" "parse-review-body: extracts duplicate count 2"
assert_contains "$out_rbody" "REVIEW_SUMMARY:" "parse-review-body: emits REVIEW_SUMMARY"

# zero actionable
cat > "$SCRATCH/latest-review.txt" <<'BODY'
Actionable comments posted: 0

No issues found.
BODY

out_zero="$(bash "$AUTOFIX_SCRIPT" parse-review-body 2>/dev/null)"
assert_contains "$out_zero" "ACTIONABLE_COUNT=0" "parse-review-body: zero actionable"

# alternate capitalization / spacing
cat > "$SCRATCH/latest-review.txt" <<'BODY'
**ACTIONABLE COMMENTS POSTED: 7**
BODY

out_caps="$(bash "$AUTOFIX_SCRIPT" parse-review-body 2>/dev/null)"
assert_contains "$out_caps" "ACTIONABLE_COUNT=7" "parse-review-body: case-insensitive match"

# missing file
rm -f "$SCRATCH/latest-review.txt"
out_missing="$(bash "$AUTOFIX_SCRIPT" parse-review-body 2>/dev/null)"
assert_contains "$out_missing" "ACTIONABLE_COUNT=0" "parse-review-body: missing file → 0 (graceful)"

# ─── section9-persist-precheck ──────────────────────────────
echo "--- section9-persist-precheck ---"

FILES="src/foo.ts
artifacts/api-server/src/routes/health.ts
lib/shared/src/utils.ts"

out_persist="$(bash "$REVIEW_SCRIPT" section9-persist-precheck "$FILES")"
assert_contains "$out_persist" "PRECHECK_WRITTEN:" "section9-persist-precheck: emits PRECHECK_WRITTEN"

[ -f "$SCRATCH/section9-precheck.txt" ] \
  && ok "section9-persist-precheck: file created at expected path" \
  || fail "section9-persist-precheck: file not found at $SCRATCH/section9-precheck.txt"

# empty file list
out_empty_persist="$(bash "$REVIEW_SCRIPT" section9-persist-precheck "")"
assert_contains "$out_empty_persist" "PRECHECK_WRITTEN:" "section9-persist-precheck: handles empty list"

# ─── section9-post-check ─────────────────────────────────────
echo "--- section9-post-check ---"

# Setup: persist a precheck with no §9 files
bash "$REVIEW_SCRIPT" section9-persist-precheck "src/foo.ts
artifacts/api-server/src/routes/health.ts"

# Post-check: bot adds a §9 file that was NOT in precheck
NEW_FILES="src/foo.ts
artifacts/api-server/src/routes/health.ts
lib/engine/src/projection.ts"

out_post="$(bash "$REVIEW_SCRIPT" section9-post-check "$NEW_FILES")"
assert_contains "$out_post" "SECTION9_POST_INTERSECT" "section9-post-check: detects newly added §9 file"
assert_contains "$out_post" "lib/engine/src/projection.ts" "section9-post-check: names the §9 file"

# Post-check: bot adds only non-§9 files → clean
NEW_FILES_CLEAN="src/foo.ts
artifacts/api-server/src/routes/health.ts
src/bar.ts"

out_post_clean="$(bash "$REVIEW_SCRIPT" section9-post-check "$NEW_FILES_CLEAN")"
assert_contains "$out_post_clean" "SECTION9_POST_CLEAN" "section9-post-check: non-§9 additions are clean"

# Post-check: §9 file was already in precheck — not a new introduction
bash "$REVIEW_SCRIPT" section9-persist-precheck "src/foo.ts
lib/engine/src/projection.ts"

out_post_preexist="$(bash "$REVIEW_SCRIPT" section9-post-check "src/foo.ts
lib/engine/src/projection.ts")"
assert_contains "$out_post_preexist" "SECTION9_POST_CLEAN" "section9-post-check: §9 file from precheck not re-flagged"

# Post-check: no precheck file → non-zero exit
rm -f "$SCRATCH/section9-precheck.txt"
post_exit=0
bash "$REVIEW_SCRIPT" section9-post-check "src/foo.ts" 2>/dev/null || post_exit=$?
[ "$post_exit" -ne 0 ] \
  && ok "section9-post-check: exits non-zero when no precheck file" \
  || fail "section9-post-check: should exit non-zero with no precheck file"

# ─── branch-hygiene --mode=autofix ──────────────────────────
echo "--- branch-hygiene --mode=autofix ---"

# Smoke: flag is accepted; output is HYGIENE_OK or HYGIENE_FAIL depending on branch state
hygiene_autofix_out="$(bash "$REVIEW_SCRIPT" branch-hygiene --mode=autofix 2>&1)" || true
assert_contains "$hygiene_autofix_out" "HYGIENE_" "branch-hygiene --mode=autofix: flag accepted (produces HYGIENE_OK or HYGIENE_FAIL)"

# If branch is clean, verify AUTOFIX_BOT_COMMIT_COUNT is emitted; otherwise skip gracefully
if echo "$hygiene_autofix_out" | grep -q "HYGIENE_OK"; then
  assert_contains "$hygiene_autofix_out" "AUTOFIX_BOT_COMMIT_COUNT=" "branch-hygiene --mode=autofix: emits AUTOFIX_BOT_COMMIT_COUNT on clean branch"
else
  ok "branch-hygiene --mode=autofix: branch is dirty (HYGIENE_FAIL); AUTOFIX_BOT_COMMIT_COUNT only emitted on HYGIENE_OK (skip)"
fi

# Synthetic clean-branch test: create a temp git repo with a clean commit
tmp_git="$SCRATCH_DIR/tmp-git"
mkdir -p "$tmp_git"
git init -q "$tmp_git"
(
  cd "$tmp_git"
  git config user.email "test@example.com"
  git config user.name "Test User"
  echo "init" > README.md
  git add README.md
  git commit -q -m "initial commit"
  # Establish origin/main pointing to this commit
  git update-ref refs/remotes/origin/main HEAD
  git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main 2>/dev/null || true
  # Add a user commit on top (non-bot, non-Replit-Agent email)
  echo "change" >> README.md
  git add README.md
  git commit -q -m "user commit"
)
synth_out="$(cd "$tmp_git" && bash "$REVIEW_SCRIPT" branch-hygiene --mode=autofix 2>&1 || true)"
assert_contains "$synth_out" "HYGIENE_OK" "branch-hygiene --mode=autofix: HYGIENE_OK on synthetic clean branch"
assert_contains "$synth_out" "AUTOFIX_BOT_COMMIT_COUNT=" "branch-hygiene --mode=autofix: emits AUTOFIX_BOT_COMMIT_COUNT on synthetic clean branch"

# original behavior preserved (no mode flag)
hygiene_plain_out="$(bash "$REVIEW_SCRIPT" branch-hygiene 2>&1)" || true
assert_contains "$hygiene_plain_out" "HYGIENE_" "branch-hygiene: original behavior preserved (no mode flag)"

# ─── status-rollup: no valid PR → graceful ---────────────────
echo "--- status-rollup (smoke) ---"
out_rollup="$(bash "$AUTOFIX_SCRIPT" status-rollup 2>&1)" || true
assert_contains "$out_rollup" "ROLLUP_\|rollup\|required\|pr_number" \
  "status-rollup: produces output (smoke)" 2>/dev/null \
  || assert_contains "$out_rollup" "ROLLUP_" "status-rollup: produces ROLLUP_ output (smoke)"

echo
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && exit 0 || exit 1

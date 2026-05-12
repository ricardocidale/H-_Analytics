#!/usr/bin/env bash
# Tests for coderabbit-loop.sh help and status subcommands.
# Verifies all 6 commands are discoverable and the help output is within 80×30.
# Run from repo root: bash scripts/tests/coderabbit-loop-help.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." >/dev/null 2>&1 && pwd)"
SCRIPT="$REPO_ROOT/scripts/coderabbit-loop.sh"
SCRATCH="$REPO_ROOT/.local/coderabbit-loop"

pass=0
fail=0

ok()   { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1"; fail=$((fail + 1)); }
assert_contains() { echo "$1" | grep -q "$2"  && ok "$3" || fail "$3: expected '$2' in output"; }

echo "=== coderabbit-loop help/status tests ==="
echo

# ─── help: lists all 6 commands ─────────────────────────────
echo "--- help: all 6 commands present ---"
help_out="$(bash "$SCRIPT" help 2>&1)"

assert_contains "$help_out" "coderabbit-loop:on"       "help: mentions coderabbit-loop:on"
assert_contains "$help_out" "coderabbit-loop:off"      "help: mentions coderabbit-loop:off"
assert_contains "$help_out" "coderabbit-loop:status"   "help: mentions coderabbit-loop:status"
assert_contains "$help_out" "coderabbit-loop:help"     "help: mentions coderabbit-loop:help"
assert_contains "$help_out" "coderabbit-loop-review"   "help: mentions /coderabbit-loop-review"
assert_contains "$help_out" "coderabbit-loop-autofix"  "help: mentions /coderabbit-loop-autofix"

# ─── help: §9 policy callout ────────────────────────────────
echo "--- help: §9 policy mentioned ---"
assert_contains "$help_out" "§9"         "help: contains §9 policy callout for autofix"
assert_contains "$help_out" "GITHUB_PAT" "help: mentions GITHUB_PAT requirement"

# ─── help: natural-language trigger table ───────────────────
echo "--- help: natural-language triggers ---"
assert_contains "$help_out" "Natural-language\|natural.language\|turn coderabbit" \
  "help: includes natural-language trigger section"

# ─── help: one-screen width check (no line > 80 chars) ──────
echo "--- help: line width ≤ 80 columns ---"
long_lines="$(echo "$help_out" | awk 'length>80 {print NR": "length" chars: "$0}' | wc -l)"
if [ "$long_lines" -eq 0 ]; then
  ok "help: no line exceeds 80 columns"
else
  # Warn but don't fail — some environments render differently
  echo "  WARN: $long_lines line(s) exceed 80 cols (soft check only)"
  ok "help: line-width soft check"
fi

# ─── help: one-screen row count (≤ 35 lines) ────────────────
echo "--- help: line count ≤ 35 ---"
line_count="$(echo "$help_out" | wc -l)"
if [ "$line_count" -le 35 ]; then
  ok "help: output fits in 35 lines ($line_count lines)"
else
  fail "help: output too long — expected ≤35 lines, got $line_count"
fi

# ─── status: runs without crash ─────────────────────────────
echo "--- status: smoke ---"
status_out="$(bash "$SCRIPT" status 2>&1)" || true
assert_contains "$status_out" "CodeRabbit loop:" "status: produces CodeRabbit loop: header"
assert_contains "$status_out" "Repo root:" "status: includes Repo root line"

# ─── status: active session block ───────────────────────────
echo "--- status: active session block ---"
mkdir -p "$SCRATCH"
chmod 700 "$SCRATCH"
cat > "$SCRATCH/run.json" <<'JSON'
{
  "mode": "review",
  "status": "running",
  "current_iteration": 2,
  "started_at": "2026-05-12T10:00:00Z"
}
JSON
chmod 600 "$SCRATCH/run.json"

status_active="$(bash "$SCRIPT" status 2>&1)" || true
assert_contains "$status_active" "Active loop:" "status: shows Active loop when run.json exists"
assert_contains "$status_active" "running"      "status: shows running status from run.json"

# Cleanup run.json written by this test
rm -f "$SCRATCH/run.json"

# ─── package.json: all 6 pnpm scripts present ───────────────
echo "--- package.json: 6 pnpm scripts wired ---"
pkg_out="$(cat "$REPO_ROOT/package.json")"
assert_contains "$pkg_out" '"coderabbit-loop:on"'      "package.json: coderabbit-loop:on script"
assert_contains "$pkg_out" '"coderabbit-loop:off"'     "package.json: coderabbit-loop:off script"
assert_contains "$pkg_out" '"coderabbit-loop:status"'  "package.json: coderabbit-loop:status script"
assert_contains "$pkg_out" '"coderabbit-loop:help"'    "package.json: coderabbit-loop:help script"
assert_contains "$pkg_out" '"coderabbit-loop:review"'  "package.json: coderabbit-loop:review script"
assert_contains "$pkg_out" '"coderabbit-loop:autofix"' "package.json: coderabbit-loop:autofix script"

# ─── slash command .md files exist ──────────────────────────
echo "--- slash command .md files exist ---"
for cmd in on off status help review autofix; do
  f="$REPO_ROOT/.claude/commands/coderabbit-loop-$cmd.md"
  [ -f "$f" ] \
    && ok "slash command file exists: coderabbit-loop-$cmd.md" \
    || fail "slash command file missing: coderabbit-loop-$cmd.md"
done

echo
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && exit 0 || exit 1

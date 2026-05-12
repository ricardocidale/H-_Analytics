#!/usr/bin/env bash
# Tests for coderabbit-loop.sh toggle: on/off/status/help subcommands.
# Run from repo root: bash scripts/tests/coderabbit-loop-toggle.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." >/dev/null 2>&1 && pwd)"
SCRIPT="$REPO_ROOT/scripts/coderabbit-loop.sh"
MARKER="$REPO_ROOT/.local/opmode/active"

pass=0
fail=0

ok() { echo "  PASS: $1"; pass=$((pass + 1)); }
fail() { echo "  FAIL: $1"; fail=$((fail + 1)); }
assert_contains() { echo "$1" | grep -q "$2" && ok "$3" || fail "$3: expected '$2' in output"; }
assert_not_contains() { echo "$1" | grep -qv "$2" && ok "$3" || fail "$3: expected no '$2' in output"; }

# Ensure clean state before tests
rm -f "$MARKER"
rmdir "$(dirname "$MARKER")" 2>/dev/null || true

echo "=== coderabbit-loop toggle tests ==="
echo

# --- happy path: on/status/off round-trip ---
echo "--- toggle round-trip ---"

out_on="$(bash "$SCRIPT" on)"
assert_contains "$out_on" "CodeRabbit loop is ON" "on: reports ON"
[ -f "$MARKER" ] && ok "on: marker file created" || fail "on: marker file not created"

out_status_on="$(bash "$SCRIPT" status)"
assert_contains "$out_status_on" "CodeRabbit loop: ON" "status after on: reports ON"
assert_contains "$out_status_on" "marker file" "status after on: shows trigger source"

out_off="$(bash "$SCRIPT" off)"
assert_contains "$out_off" "CodeRabbit loop is OFF" "off: reports OFF"
[ ! -f "$MARKER" ] && ok "off: marker file removed" || fail "off: marker file still present"

out_status_off="$(bash "$SCRIPT" status)"
assert_contains "$out_status_off" "CodeRabbit loop: OFF" "status after off: reports OFF"

# --- edge case: status with no marker and no env var ---
echo "--- status with no marker, no env var ---"
unset OPMODE_LARGE_REPO_SHELL 2>/dev/null || true
out_clean="$(bash "$SCRIPT" status)"
assert_contains "$out_clean" "CodeRabbit loop: OFF" "status clean state: reports OFF"
assert_contains "$out_clean" "Repo root:" "status clean state: shows repo root"
# CLI section should be present (either installed or 'not installed')
assert_contains "$out_clean" "CLI:" "status clean state: shows CLI line"

# --- edge case: env var OPMODE_LARGE_REPO_SHELL=1 (no marker file) ---
echo "--- env var override ---"
out_env="$(OPMODE_LARGE_REPO_SHELL=1 bash "$SCRIPT" status)"
assert_contains "$out_env" "CodeRabbit loop: ON" "env var: reports ON"
assert_contains "$out_env" "OPMODE_LARGE_REPO_SHELL" "env var: shows env trigger source"

# --- help output completeness ---
echo "--- help output ---"
out_help="$(bash "$SCRIPT" help)"
for cmd in "coderabbit-loop:on" "coderabbit-loop:off" "coderabbit-loop:status" "coderabbit-loop:help" \
           "coderabbit-loop-review" "coderabbit-loop-autofix"; do
  assert_contains "$out_help" "$cmd" "help: lists $cmd"
done
assert_contains "$out_help" "GITHUB_PAT" "help: mentions GITHUB_PAT for autofix"
assert_contains "$out_help" "docs/runbooks/coderabbit-loop-workflow.md" "help: mentions runbook path"
assert_contains "$out_help" "coderabbit-loop:install" "help: mentions install command"

# --- error path: unknown subcommand exits 2 ---
echo "--- unknown subcommand ---"
if bash "$SCRIPT" unknowncmd 2>/dev/null; then
  fail "unknown subcommand: expected non-zero exit"
else
  ok "unknown subcommand: exits non-zero"
fi

# --- cleanup ---
rm -f "$MARKER"
rmdir "$(dirname "$MARKER")" 2>/dev/null || true

echo
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && exit 0 || exit 1

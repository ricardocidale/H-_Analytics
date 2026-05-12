#!/usr/bin/env bash
# Single source of truth for the Large-repo Shell + CodeRabbit + Compound
# operating-mode toggle.
#
# Resolves to ON if EITHER:
#   - the marker file `.local/opmode/active` exists at the repo root, OR
#   - the env var `OPMODE_LARGE_REPO_SHELL` is set to `1`.
#
# Exit code:
#   0 = ON
#   1 = OFF
#
# Usage (executable):       if scripts/opmode-active.sh; then ...; fi
# Usage (source + helper):  source scripts/opmode-active.sh; opmode_active && ...

opmode_repo_root() {
  local self_dir
  self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
  if [ -n "$self_dir" ]; then
    (cd "$self_dir/.." >/dev/null 2>&1 && pwd)
  else
    pwd
  fi
}

opmode_active() {
  local root marker
  root="$(opmode_repo_root)"
  marker="$root/.local/opmode/active"
  if [ -f "$marker" ]; then
    return 0
  fi
  if [ "${OPMODE_LARGE_REPO_SHELL:-0}" = "1" ]; then
    return 0
  fi
  return 1
}

if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
  if opmode_active; then
    exit 0
  else
    exit 1
  fi
fi

#!/usr/bin/env bash
# CodeRabbit loop on/off/status switch (Task #1386).
#
# Usage:
#   pnpm coderabbit:on       # arm the loop (creates .local/opmode/active)
#   pnpm coderabbit:off      # disarm the loop (removes the marker)
#   pnpm coderabbit:status   # report current state
#
# Natural-language alias for both Replit Agent and Claude Code:
#   "turn coderabbit loop ON"  -> pnpm coderabbit:on
#   "turn coderabbit loop OFF" -> pnpm coderabbit:off
#
# The marker file is what every other piece keys off:
#   - scripts/print-opmode-banner.sh (workflow start banner)
#   - scripts/coderabbit-review.sh   (the four review/validate scripts)

set -e

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"
marker="$repo_root/.local/opmode/active"

action="${1:-status}"

case "$action" in
  on)
    mkdir -p "$(dirname "$marker")"
    touch "$marker"
    cat <<'MSG'
CodeRabbit loop is ON.

  Inner-loop commands:
    pnpm review:uncommitted     # CodeRabbit on the working tree
    pnpm review:branch          # CodeRabbit on this branch vs origin/main
    pnpm review:scoped <dir>    # CodeRabbit on one directory
    pnpm validate:scoped <pkg>  # typecheck + lint, one workspace pkg

  Restart any artifact workflow to see the banner reminder in its logs.
  Turn it off: pnpm coderabbit:off
MSG
    ;;
  off)
    rm -f "$marker"
    rmdir "$(dirname "$marker")" 2>/dev/null || true
    echo "CodeRabbit loop is OFF. Re-arm with: pnpm coderabbit:on"
    ;;
  status)
    if [ -f "$marker" ] || [ "${OPMODE_LARGE_REPO_SHELL:-0}" = "1" ]; then
      if [ -f "$marker" ]; then
        echo "CodeRabbit loop is ON (marker: .local/opmode/active)."
      else
        echo "CodeRabbit loop is ON (env: OPMODE_LARGE_REPO_SHELL=1)."
      fi
    else
      echo "CodeRabbit loop is OFF. Arm with: pnpm coderabbit:on"
    fi
    ;;
  *)
    echo "usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac

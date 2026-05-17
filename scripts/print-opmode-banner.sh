#!/usr/bin/env bash
# Workflow start banner for the Large-repo Shell + CodeRabbit + Compound
# operating mode.
#
# Behavior contract:
#   - When the toggle is OFF, exit 0 silently — never block workflow startup.
#   - When the toggle is ON, print a plain-text reminder of the session commands,
#     the runbook path, and the "turn it off" command.
#   - If the toggle helper script is missing for any reason, exit 0 silently.

set -e

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
helper="$self_dir/opmode-active.sh"

if [ ! -f "$helper" ]; then
  exit 0
fi

# shellcheck source=./opmode-active.sh
source "$helper"

if ! opmode_active; then
  exit 0
fi

# Loop is ON — silent at workflow/Claude startup.
# Use `pnpm coderabbit-loop:status` to inspect state, or
# run `/coderabbit-loop-review` / `/coderabbit-loop-autofix` directly.
exit 0

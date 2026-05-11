#!/usr/bin/env bash
# Workflow start banner for the Large-repo Shell + CodeRabbit + Compound
# operating mode (Task #1386).
#
# Behavior contract:
#   - When the toggle is OFF, exit 0 silently — never block workflow startup.
#   - When the toggle is ON, print a fixed plain-text reminder of the four
#     pnpm scripts, the runbook path, and the "turn it off" command.
#   - If the toggle helper script is missing for any reason, exit 0 silently.
#
# This script is wrapped into the dev `run` command of three artifact tomls
# (api-server, hospitality-business-portal, mockup-sandbox) via the artifacts
# skill. The 13 check:* workflows are NOT wrapped — they run too often.

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

cat <<'BANNER'
------------------------------------------------------------------------
  OPMODE: Large-repo Shell + CodeRabbit + Compound  (toggle ON)
------------------------------------------------------------------------
  Inner-loop commands:
    pnpm review:uncommitted           # CodeRabbit on the working tree
    pnpm review:branch                # CodeRabbit on branch vs default
    pnpm review:scoped <dir>          # CodeRabbit on one directory
    pnpm validate:scoped <pkg>        # typecheck + lint, one workspace pkg

  Runbook:   docs/runbooks/coderabbit-shell-workflow.md
  Mode doc:  .agents/operating-modes/large-repo-shell-coderabbit-compound.md

  Turn it off:  rm -f .local/opmode/active
------------------------------------------------------------------------
BANNER

exit 0

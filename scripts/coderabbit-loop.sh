#!/usr/bin/env bash
# CodeRabbit loop toggle and status (on/off/status/help subcommands).
#
# Usage (via pnpm scripts):
#   pnpm coderabbit-loop:on       arm the loop (creates .local/opmode/active)
#   pnpm coderabbit-loop:off      disarm the loop (removes the marker)
#   pnpm coderabbit-loop:status   report current state, CLI version, auth
#   pnpm coderabbit-loop:help     show command reference
#
# Usage (globally via installed helper):
#   ~/.local/share/coderabbit-loop/coderabbit-loop.sh <subcommand>
#
# Note: no `set -e`. status is best-effort — a missing CLI, offline auth probe,
# or absent ripgrep should not abort the report.

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"

# Resolve repo root: works both from scripts/ in the repo AND from
# ~/.local/share/coderabbit-loop/ (global install).
resolve_repo_root() {
  # If we're in a git repo, use its root.
  local git_root
  git_root="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [ -n "$git_root" ]; then
    echo "$git_root"
    return
  fi
  # Fallback: parent of this script's directory (works from scripts/).
  (cd "$self_dir/.." >/dev/null 2>&1 && pwd)
}

repo_root="$(resolve_repo_root)"
marker="$repo_root/.local/opmode/active"

# pnpm does not inherit ~/.local/bin by default.
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) PATH="$HOME/.local/bin:$PATH" ;;
esac

action="${1:-status}"

case "$action" in
  on)
    mkdir -p "$(dirname "$marker")"
    touch "$marker"
    cat <<'MSG'
CodeRabbit loop is ON.

  Session commands (available globally once installed):
    /coderabbit-loop-review     iterative review loop (working tree, pre-PR)
    /coderabbit-loop-autofix    iterative loop with autofix on PR iteration 1

  Toggle commands:
    pnpm coderabbit-loop:off    disarm the loop
    pnpm coderabbit-loop:status show full state report

  Restart any artifact workflow to see the banner reminder in its logs.
MSG
    ;;

  off)
    rm -f "$marker"
    rmdir "$(dirname "$marker")" 2>/dev/null || true
    echo "CodeRabbit loop is OFF. Re-arm with: pnpm coderabbit-loop:on"
    ;;

  status)
    tmo() { timeout "$@" 2>/dev/null; }

    # ---- 1. State + trigger (instant) ----
    state="OFF"
    trigger=""
    armed_at=""
    if [ -f "$marker" ]; then
      state="ON"
      trigger="marker file (.local/opmode/active)"
      armed_at="$(stat -c %y "$marker" 2>/dev/null || stat -f '%Sm' "$marker" 2>/dev/null || echo unknown)"
    elif [ "${OPMODE_LARGE_REPO_SHELL:-0}" = "1" ]; then
      state="ON"
      trigger="env var OPMODE_LARGE_REPO_SHELL=1 (current shell only)"
    fi

    echo "CodeRabbit loop: $state"
    if [ "$state" = "ON" ]; then
      echo "  Trigger:           $trigger"
      [ -n "$armed_at" ] && echo "  Armed at:          $armed_at"
    fi
    echo "  Repo root:         $repo_root"

    # ---- 2. Active loop session (if any) ----
    run_json="$repo_root/.local/coderabbit-loop/run.json"
    if [ -f "$run_json" ]; then
      loop_status="$(python3 -c "import json,sys; d=json.load(open('$run_json')); print(d.get('status','unknown'))" 2>/dev/null || echo unknown)"
      loop_mode="$(python3 -c "import json,sys; d=json.load(open('$run_json')); print(d.get('mode','unknown'))" 2>/dev/null || echo unknown)"
      loop_iter="$(python3 -c "import json,sys; d=json.load(open('$run_json')); print(d.get('current_iteration',0))" 2>/dev/null || echo 0)"
      loop_started="$(python3 -c "import json,sys; d=json.load(open('$run_json')); print(d.get('started_at','unknown'))" 2>/dev/null || echo unknown)"
      echo "  Active loop:       $loop_status (mode=$loop_mode, iter=$loop_iter, started=$loop_started)"
    fi

    # ---- 3. CLI version (~instant) ----
    if command -v coderabbit >/dev/null 2>&1; then
      cli_path="$(command -v coderabbit)"
      cli_version="$(tmo 2 coderabbit --version 2>/dev/null | head -1)"
      echo "  CLI:               ${cli_version:-installed (version probe timed out)}"
      echo "  CLI path:          $cli_path"

      # ---- 4. CLI auth (slow: 1-8s network probe) ----
      printf '  CLI auth:          checking… '
      auth_out="$(tmo 8 coderabbit auth status 2>&1)"
      auth_rc=$?
      printf '\r  CLI auth:          '
      if [ $auth_rc -eq 124 ]; then
        echo "probe timed out (network unreachable?)        "
      elif echo "$auth_out" | grep -q "Logged in"; then
        cli_name="$(echo "$auth_out"  | sed -n 's/.*Name:[[:space:]]*//p'  | head -1)"
        cli_email="$(echo "$auth_out" | sed -n 's/.*Email:[[:space:]]*//p' | head -1)"
        msg="authenticated"
        [ -n "$cli_name" ]  && msg="$msg as $cli_name"
        [ -n "$cli_email" ] && msg="$msg <$cli_email>"
        echo "$msg          "
      else
        echo "NOT authenticated (run: coderabbit auth login)"
      fi
    else
      echo "  CLI:               not installed"
      echo "  CLI auth:          n/a (CLI not installed)"
    fi

    # ---- 5. Footer ----
    echo
    if [ "$state" = "ON" ]; then
      cat <<'INNER'
  Session commands (start a loop):
    /coderabbit-loop-review     working-tree iterative review
    /coderabbit-loop-autofix    open-PR loop with autofix on iteration 1

  Toggle:  pnpm coderabbit-loop:off
  Runbook: docs/runbooks/coderabbit-loop-workflow.md
INNER
    else
      echo "  Arm with:          pnpm coderabbit-loop:on"
    fi
    ;;

  help|--help|-h)
    cat <<'HELP'
coderabbit-loop — command reference

Toggle commands:
  pnpm coderabbit-loop:on       Arm the loop (creates .local/opmode/active)
  pnpm coderabbit-loop:off      Disarm the loop (removes the marker)
  pnpm coderabbit-loop:status   Full state report (toggle, active session, CLI, auth)
  pnpm coderabbit-loop:help     This help

Session commands (start an iterative loop — loop must be ON):
  /coderabbit-loop-review
      Runs `cr review --agent` on the working tree up to 4 times.
      Claude applies fixes between iterations. Exits on zero actionable findings.
      Wall time: seconds to minutes per iteration.

  /coderabbit-loop-autofix
      Iteration 1: triggers `@coderabbitai autofix` on an open PR via GitHub API.
      Iterations 2-4: `@coderabbitai review` + Claude applies findings.
      Requires: GITHUB_PAT env var (scopes: issues:write, pull_requests:read).
      Wall time: 7-30+ min per iteration (PR bot review latency).
      §9 guard: refuses autofix if PR diff touches protected engine paths.

Install globally (run once from H+ Analytics):
  pnpm coderabbit-loop:install
  # or: bash scripts/install-coderabbit-loop.sh
  # Installs .md commands → ~/.claude/commands/
  #          helper scripts → ~/.local/share/coderabbit-loop/

Natural-language triggers:
  "turn coderabbit loop on"     → /coderabbit-loop-on
  "turn coderabbit loop off"    → /coderabbit-loop-off
  "coderabbit loop status"      → /coderabbit-loop-status
  "run coderabbit review loop"  → /coderabbit-loop-review
  "loop with autofix"           → /coderabbit-loop-autofix

Runbook: docs/runbooks/coderabbit-loop-workflow.md
HELP
    ;;

  *)
    echo "usage: $0 {on|off|status|help}" >&2
    exit 2
    ;;
esac

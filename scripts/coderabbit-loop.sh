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

# Note: no `set -e`. `status` is best-effort — a missing CLI, offline auth probe,
# or absent ripgrep should not abort the report.

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"
marker="$repo_root/.local/opmode/active"

# pnpm does not inherit ~/.local/bin by default; ensure the CodeRabbit CLI is
# findable when this script is invoked via `pnpm coderabbit:status`.
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
    # 1. ON/OFF + which trigger fired
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

    # 2. CodeRabbit CLI presence + version + auth
    # Both calls are bounded by `timeout` so status stays snappy when offline.
    tmo() { timeout "$@" 2>/dev/null; }
    cli_state="not installed"
    cli_path=""
    cli_auth="n/a (CLI not installed)"
    if command -v coderabbit >/dev/null 2>&1; then
      cli_path="$(command -v coderabbit)"
      cli_version="$(tmo 2 coderabbit --version 2>/dev/null | head -1)"
      cli_state="${cli_version:-installed (version probe timed out)}"
      auth_out="$(tmo 8 coderabbit auth status 2>&1)"
      auth_rc=$?
      if [ $auth_rc -eq 124 ]; then
        cli_auth="probe timed out (network unreachable?)"
      elif echo "$auth_out" | grep -q "Logged in"; then
        cli_name="$(echo "$auth_out"  | sed -n 's/.*Name:[[:space:]]*//p'     | head -1)"
        cli_email="$(echo "$auth_out" | sed -n 's/.*Email:[[:space:]]*//p'    | head -1)"
        cli_org="$(echo "$auth_out"   | grep -A1 'Organization' | sed -n 's/.*Name:[[:space:]]*//p' | head -1)"
        cli_auth="authenticated"
        [ -n "$cli_name" ]  && cli_auth="$cli_auth as $cli_name"
        [ -n "$cli_email" ] && cli_auth="$cli_auth <$cli_email>"
        [ -n "$cli_org" ]   && cli_auth="$cli_auth (org: $cli_org)"
      else
        cli_auth="NOT authenticated (run: coderabbit auth login)"
      fi
    fi

    # 3. Banner-wrapped workflows (so the user knows where the reminder appears)
    banner_artifacts=""
    if command -v rg >/dev/null 2>&1; then
      banner_artifacts="$(
        rg -l --no-messages 'print-opmode-banner\.sh' \
          "$repo_root"/artifacts/*/.replit-artifact/artifact.toml 2>/dev/null \
          | sed -E "s|$repo_root/artifacts/||; s|/\\.replit-artifact/artifact\\.toml||" \
          | tr '\n' ',' | sed 's/,$//; s/,/, /g'
      )"
    fi

    # 4. Print
    echo "CodeRabbit loop: $state"
    if [ "$state" = "ON" ]; then
      echo "  Trigger:           $trigger"
      [ -n "$armed_at" ] && echo "  Armed at:          $armed_at"
    fi
    echo "  CLI:               $cli_state"
    [ -n "$cli_path" ] && echo "  CLI path:          $cli_path"
    echo "  CLI auth:          $cli_auth"
    echo "  Repo root:         $repo_root"
    [ -n "$banner_artifacts" ] && echo "  Banner artifacts:  $banner_artifacts"
    echo
    if [ "$state" = "ON" ]; then
      cat <<'INNER'
  Inner-loop commands:
    pnpm review:uncommitted     # CodeRabbit on the working tree
    pnpm review:branch          # CodeRabbit on this branch vs origin/main
    pnpm review:scoped <dir>    # CodeRabbit on one directory
    pnpm validate:scoped <pkg>  # typecheck + lint, one workspace pkg

  Turn it off:    pnpm coderabbit:off
  Runbook:        docs/runbooks/coderabbit-shell-workflow.md
INNER
    else
      echo "  Arm with:          pnpm coderabbit:on"
    fi
    ;;
  *)
    echo "usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
# Install the coderabbit-loop slash commands and helper scripts globally so
# they are available in every repo on this machine.
#
# Installs to:
#   ~/.claude/commands/    — Claude Code slash command .md files
#   ~/.local/share/coderabbit-loop/  — helper shell scripts
#
# Idempotent: re-running updates files in place.
# Run from any location; this script locates its own directory.

set -euo pipefail

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"
commands_src="$repo_root/.claude/commands"
scripts_src="$repo_root/scripts"

# Targets
cmd_dest="$HOME/.claude/commands"
scripts_dest="$HOME/.local/share/coderabbit-loop"

echo "Installing coderabbit-loop commands and scripts..."
echo

# 1. Slash command .md files → ~/.claude/commands/
mkdir -p "$cmd_dest"
count_cmds=0
for f in "$commands_src"/coderabbit-loop-*.md; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  cp "$f" "$cmd_dest/$name"
  echo "  installed: ~/.claude/commands/$name"
  count_cmds=$((count_cmds + 1))
done

# 2. Helper shell scripts → ~/.local/share/coderabbit-loop/
mkdir -p "$scripts_dest"
count_scripts=0
for f in \
  "$scripts_src/coderabbit-loop.sh" \
  "$scripts_src/coderabbit-loop-review.sh" \
  "$scripts_src/coderabbit-loop-autofix.sh" \
  "$scripts_src/opmode-active.sh" \
  "$scripts_src/print-opmode-banner.sh"; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  cp "$f" "$scripts_dest/$name"
  chmod +x "$scripts_dest/$name"
  echo "  installed: ~/.local/share/coderabbit-loop/$name"
  count_scripts=$((count_scripts + 1))
done

echo
echo "Done. Installed $count_cmds slash command(s) and $count_scripts script(s)."
echo
echo "Next steps:"
echo "  1. Install the CodeRabbit CLI (if not done):  bash scripts/install-coderabbit-cli.sh"
echo "  2. Authenticate (interactive, one-time):       coderabbit auth login"
echo "  3. Set GITHUB_PAT for autofix loops:           export GITHUB_PAT=<your-pat>"
echo "  4. Arm the loop in any repo:                   /coderabbit-loop-on"
echo "  5. Run a review loop:                          /coderabbit-loop-review"
echo
echo "Runbook: docs/runbooks/coderabbit-loop-workflow.md"

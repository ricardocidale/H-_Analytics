#!/usr/bin/env bash
set -e

echo "Checking Norfolk Claude setup..."

CLAUDE_ROOT="$HOME/.claude"
SKILLS_ROOT="$CLAUDE_ROOT/skills"
SETTINGS_FILE="$CLAUDE_ROOT/settings.json"

echo
echo "Claude root: $CLAUDE_ROOT"

if [ -f "$SETTINGS_FILE" ]; then
  echo "[OK] settings.json found"
else
  echo "[MISSING] settings.json not found"
fi

for skill in \
  nai-help \
  nai-update \
  nai-plan \
  nai-feature \
  nai-frontend \
  nai-review \
  nai-architecture \
  nai-agent-native-audit \
  nai-agent-native-architecture \
  nai-finance \
  nai-debug \
  nai-research
  do
  if [ -d "$SKILLS_ROOT/$skill" ]; then
    echo "[OK] $skill"
  else
    echo "[MISSING] $skill"
  fi
done

echo
echo "Next checks to run inside Claude Code:"
echo "  /doctor"
echo "  /plugins"
echo "  /nai-update"

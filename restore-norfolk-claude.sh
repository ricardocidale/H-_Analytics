#!/usr/bin/env bash
set -e
mkdir -p ~/.claude ~/.claude/skills
cp ~/workspace/norfolk-starter/claude-code/settings.template.json ~/.claude/settings.json
cp -R ~/workspace/norfolk-starter/claude-code/skills/* ~/.claude/skills/
echo "Norfolk Claude setup restored."

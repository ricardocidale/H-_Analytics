#!/bin/bash
set -e

mkdir -p ~/.claude
mkdir -p ~/.claude/skills

cp ~/workspace/.claude-backup/settings.json ~/.claude/settings.json
cp -R ~/workspace/.claude-backup/skills/start-here ~/.claude/skills/
cp -R ~/workspace/.claude-backup/skills/workflows ~/.claude/skills/
cp -R ~/workspace/.claude-backup/skills/run-workflow ~/.claude/skills/
cp -R ~/workspace/.claude-backup/skills/plugin-stack ~/.claude/skills/

echo "Claude setup restored to ~/.claude"

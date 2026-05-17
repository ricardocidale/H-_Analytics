#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

export PATH="$HOME/.local/bin:$repo_root/.config/npm/node_global/bin:$PATH"

echo "== Replit CodeRabbit bootstrap =="

if command -v coderabbit >/dev/null 2>&1; then
  echo "-- CodeRabbit CLI already installed --"
  coderabbit --version || true
else
  echo "-- CodeRabbit CLI missing; installing --"
  bash scripts/install-coderabbit-cli.sh
fi

if [ -x "$HOME/.local/share/coderabbit-loop/coderabbit-loop.sh" ]; then
  echo "-- coderabbit-loop helpers already installed --"
else
  echo "-- coderabbit-loop helpers missing; installing --"
  pnpm coderabbit-loop:install
fi

if [ -n "${CODERABBIT_API_KEY:-}" ]; then
  echo "-- CODERABBIT_API_KEY present --"
else
  echo "WARNING: CODERABBIT_API_KEY is missing from Replit Secrets"
fi

echo "-- CodeRabbit auth status --"
coderabbit auth status 2>/dev/null || true

echo "== done =="

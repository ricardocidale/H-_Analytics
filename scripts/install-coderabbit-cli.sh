#!/usr/bin/env bash
# One-time installer for the CodeRabbit CLI (vendor binary).
#
# Idempotent: re-running is safe; if `coderabbit` is already on PATH, this
# script reports the version and exits 0.
#
# After install, authentication is a USER ACTION (interactive):
#   coderabbit auth login
#   coderabbit auth status

set -e

if command -v coderabbit >/dev/null 2>&1; then
  echo "coderabbit CLI already installed: $(coderabbit --version 2>/dev/null || echo 'version unknown')"
  echo "If not authenticated yet, run: coderabbit auth login"
  exit 0
fi

echo "Installing CodeRabbit CLI from cli.coderabbit.ai/install.sh ..."
# Download to a temp file before executing so the script is not piped directly
# to sh (mitigates MITM truncation risk). No checksum is published upstream.
_cr_tmp="$(mktemp)"
trap 'rm -f "$_cr_tmp"' EXIT
curl -fsSL https://cli.coderabbit.ai/install.sh -o "$_cr_tmp"
sh "$_cr_tmp"

if command -v coderabbit >/dev/null 2>&1; then
  echo
  echo "Installed: $(coderabbit --version 2>/dev/null || echo 'version unknown')"
  echo "Next (interactive, one-time): coderabbit auth login"
else
  echo
  echo "Install completed but \`coderabbit\` is not on PATH."
  echo "Check the installer output above for the install location and add it to PATH."
  exit 1
fi

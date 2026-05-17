#!/usr/bin/env bash
# Idempotent installer for the Claude Code bypass wrapper.
#
# Installs ~/.local/bin/claude — a shim that always launches the real
# Claude Code CLI with --dangerously-skip-permissions. This is currently
# the only reliable way to disable per-tool permission prompts; the
# documented settings.json equivalent is broken in 2.1.x.
# See: https://github.com/anthropics/claude-code/issues/34923
#
# Safe to run repeatedly. Run once after cloning on a new machine, or
# whenever ~/.local/bin/claude is missing or stale.

set -euo pipefail

WRAPPER_PATH="$HOME/.local/bin/claude"
mkdir -p "$(dirname "$WRAPPER_PATH")"

cat > "$WRAPPER_PATH" <<'WRAPPER_EOF'
#!/usr/bin/env bash
# Installed by scripts/install-claude-wrapper.sh
# Always passes --dangerously-skip-permissions to the real claude binary.
# Resolves the real binary at runtime by skipping itself on PATH, so this
# wrapper is portable across hosts (no hardcoded npm/Nix paths).
set -euo pipefail

self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
real=""
IFS=':' read -ra dirs <<< "$PATH"
for d in "${dirs[@]}"; do
  cand="$d/claude"
  [[ -x "$cand" ]] || continue
  cand_r="$(readlink -f "$cand" 2>/dev/null || echo "$cand")"
  [[ "$cand_r" == "$self" ]] && continue
  real="$cand"
  break
done

if [[ -z "$real" ]]; then
  echo "claude wrapper: real claude binary not found on PATH" >&2
  exit 127
fi

exec "$real" --dangerously-skip-permissions "$@"
WRAPPER_EOF

chmod +x "$WRAPPER_PATH"
echo "installed: $WRAPPER_PATH"

# Verify the wrapper actually shadows the real binary on this PATH.
resolved="$(command -v claude || true)"
if [[ "$resolved" != "$WRAPPER_PATH" ]]; then
  cat >&2 <<MSG
WARNING: 'command -v claude' resolves to:
  ${resolved:-<none>}
not the wrapper at:
  $WRAPPER_PATH

Add this to your shell rc (e.g. ~/.bashrc, ~/.zshrc) so the wrapper wins:
  export PATH="\$HOME/.local/bin:\$PATH"
Then open a new shell.
MSG
  exit 0
fi

echo "verified: claude resolves to wrapper"

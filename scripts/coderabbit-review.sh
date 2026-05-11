#!/usr/bin/env bash
# Subcommand wrapper for the four toggle-aware pnpm scripts (Task #1386):
#
#   review:uncommitted    -> coderabbit-review.sh uncommitted
#   review:branch         -> coderabbit-review.sh branch
#   review:scoped <dir>   -> coderabbit-review.sh scoped <dir>
#   validate:scoped <pkg> -> coderabbit-review.sh validate-scoped <pkg>
#
# All four start by sourcing the toggle helper and exit 0 with a one-line
# "operating mode is OFF" message when the toggle is OFF. When ON, they
# auto-detect the default branch, degrade gracefully if the CodeRabbit CLI
# is not installed, and print a helpful message rather than failing on a
# clean tree.

set -e

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"

# shellcheck source=./opmode-active.sh
source "$self_dir/opmode-active.sh"

print_off() {
  local cmd="$1"
  echo "operating mode is OFF — run \`touch .local/opmode/active\` to enable, then re-run \`pnpm ${cmd}\`."
}

require_cli() {
  if ! command -v coderabbit >/dev/null 2>&1; then
    cat <<'MSG'
coderabbit CLI not installed.
  Install once per fresh container:
    bash scripts/install-coderabbit-cli.sh
  Then authenticate (interactive, one-time):
    coderabbit auth login
  Verify:
    coderabbit auth status
MSG
    return 1
  fi
  return 0
}

detect_default_branch() {
  local ref
  ref="$(git -C "$repo_root" symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [ -n "$ref" ]; then
    echo "${ref#refs/remotes/origin/}"
    return 0
  fi
  if git -C "$repo_root" show-ref --quiet refs/remotes/origin/main; then
    echo "main"
    return 0
  fi
  if git -C "$repo_root" show-ref --quiet refs/remotes/origin/master; then
    echo "master"
    return 0
  fi
  echo "main"
}

has_uncommitted() {
  [ -n "$(git -C "$repo_root" status --porcelain 2>/dev/null)" ]
}

has_uncommitted_in_dir() {
  local dir="$1"
  [ -n "$(git -C "$repo_root" status --porcelain -- "$dir" 2>/dev/null)" ]
}

has_branch_diff() {
  local base="$1"
  if ! git -C "$repo_root" show-ref --quiet "refs/remotes/origin/${base}"; then
    echo "origin/${base} not found locally — run \`git fetch origin ${base}\` first." >&2
    return 1
  fi
  [ -n "$(git -C "$repo_root" diff --name-only "origin/${base}...HEAD" 2>/dev/null)" ]
}

cmd_uncommitted() {
  if ! opmode_active; then
    print_off "review:uncommitted"
    return 0
  fi
  if ! has_uncommitted; then
    echo "no uncommitted changes — nothing to review."
    return 0
  fi
  if ! require_cli; then
    return 0
  fi
  echo "→ coderabbit review --type uncommitted"
  coderabbit review --type uncommitted
}

cmd_branch() {
  if ! opmode_active; then
    print_off "review:branch"
    return 0
  fi
  local base
  base="$(detect_default_branch)"
  if ! has_branch_diff "$base"; then
    echo "no commits on this branch ahead of origin/${base} — nothing to review."
    return 0
  fi
  if ! require_cli; then
    return 0
  fi
  echo "→ coderabbit review --base origin/${base}"
  coderabbit review --base "origin/${base}"
}

cmd_scoped() {
  local dir="${1:-}"
  if [ -z "$dir" ]; then
    echo "usage: pnpm review:scoped <dir>" >&2
    return 2
  fi
  if ! opmode_active; then
    print_off "review:scoped ${dir}"
    return 0
  fi
  if [ ! -d "$repo_root/$dir" ] && [ ! -d "$dir" ]; then
    echo "scoped path not found: ${dir}" >&2
    return 1
  fi
  if ! has_uncommitted_in_dir "$dir"; then
    echo "no uncommitted changes within ${dir} — nothing to review."
    return 0
  fi
  if ! require_cli; then
    return 0
  fi
  # CodeRabbit's CLI has no documented --dir flag; we constrain by chdir'ing
  # into the subtree before invoking. The runbook documents this caveat: if
  # the CLI still walks up to the repo root, switch to a smaller working set
  # via `git stash --keep-index` of out-of-scope files first.
  echo "→ coderabbit review --type uncommitted (CWD=${dir})"
  ( cd "$repo_root/$dir" 2>/dev/null || cd "$dir"; coderabbit review --type uncommitted )
}

cmd_validate_scoped() {
  local pkg="${1:-}"
  if [ -z "$pkg" ]; then
    echo "usage: pnpm validate:scoped <pkg>     (e.g. @workspace/api-server)" >&2
    return 2
  fi
  if ! opmode_active; then
    print_off "validate:scoped ${pkg}"
    return 0
  fi
  echo "→ pnpm --filter ${pkg} run typecheck"
  pnpm --filter "$pkg" run typecheck
  echo "→ pnpm --filter ${pkg} run lint"
  pnpm --filter "$pkg" run lint
}

sub="${1:-}"
shift || true
case "$sub" in
  uncommitted)     cmd_uncommitted "$@" ;;
  branch)          cmd_branch "$@" ;;
  scoped)          cmd_scoped "$@" ;;
  validate-scoped) cmd_validate_scoped "$@" ;;
  *)
    echo "usage: $0 {uncommitted|branch|scoped <dir>|validate-scoped <pkg>}" >&2
    exit 2
    ;;
esac

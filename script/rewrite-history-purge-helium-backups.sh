#!/usr/bin/env bash
# rewrite-history-purge-helium-backups.sh
#
# Purge the four `backups/heliumdb-*` files AND the stray Turborepo build-cache
# artifact `.turbo/cache/4ef2d42dbe46b27f.tar.zst` from ALL git history so
# GitHub stops billing LFS storage + bandwidth for them.
#
# This is the runbook for Task #518 (Helium backups, ~250 MB) batched with
# Task #520 (the Turbo build-cache file, ~70 MB). The agent that owns this
# Repl cannot force-push (version control is platform-managed), so this
# script is meant to be executed by a human with repo-admin push access on
# a fresh local clone of the GitHub repo — NOT inside the Replit workspace.
#
# Why batch the .turbo/cache entry into the same rewrite: it requires the
# exact same destructive history-rewrite + force-push dance, and doing it
# once is strictly cheaper than asking everyone to re-clone twice. The file
# is regenerable (Turborepo recreates it on the next build), machine-specific
# (the hash in the filename is local), and `.turbo/` is now in `.gitignore`
# so it cannot come back.
#
# Why this lives in-tree: so the procedure is reviewable, the safety checks
# can't drift away from the codebase, and the next person hunting "why is
# our LFS bill so high" can grep for "heliumdb" or ".turbo/cache" and find it.
#
# Usage:
#   ./script/rewrite-history-purge-helium-backups.sh             # dry-run, prints plan
#   ./script/rewrite-history-purge-helium-backups.sh --execute   # actually rewrite
#
# Pre-reqs (install once):
#   - git >= 2.40
#   - git-filter-repo (`brew install git-filter-repo` or `pip install git-filter-repo`)
#   - git-lfs        (`brew install git-lfs`)
#   - npx + node (only if you want the optional R2 verification step)
#
# Required env: nothing. The script reads from `origin` only.

set -euo pipefail

EXECUTE=0
if [[ "${1:-}" == "--execute" ]]; then
  EXECUTE=1
fi

YELLOW=$'\033[33m'; RED=$'\033[31m'; GREEN=$'\033[32m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
say()  { printf "%s\n" "$*"; }
warn() { printf "%s%s%s\n" "$YELLOW" "$*" "$RESET"; }
err()  { printf "%s%s%s\n" "$RED" "$*" "$RESET" >&2; }
ok()   { printf "%s%s%s\n" "$GREEN" "$*" "$RESET"; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  err "Not inside a git repo. Clone the GitHub repo fresh and run from there."
  exit 1
fi
cd "$REPO_ROOT"

say "${BOLD}== Pre-flight checks ==${RESET}"

# 1. Must be on main, clean tree.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  err "On branch '$BRANCH'. Check out 'main' first."
  exit 1
fi
ok  "On main."

if ! git diff --quiet || ! git diff --cached --quiet; then
  err "Working tree dirty. Stash or commit first; this script will rewrite history."
  exit 1
fi
ok  "Working tree clean."

# 2. Must NOT be the Replit workspace shell. The replit shell can't force-push.
if [[ -n "${REPL_ID:-}${REPLIT_DOMAINS:-}${REPLIT_DEV_DOMAIN:-}" ]]; then
  err "Detected a Replit workspace ($REPL_ID${REPLIT_DEV_DOMAIN:+ / $REPLIT_DEV_DOMAIN})."
  err "This rewrite must be done from a local clone with push access to GitHub."
  err "Run on your laptop, then force-push from there."
  exit 1
fi
ok  "Not running inside the Replit workspace."

# 3. Tools.
for tool in git git-filter-repo git-lfs; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "Missing tool: $tool. See script header for install hints."
    exit 1
  fi
done
ok  "git, git-filter-repo, git-lfs all on PATH."

# 4. Confirm origin is the canonical GitHub remote (sanity, not enforcement).
ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$ORIGIN_URL" ]]; then
  err "No 'origin' remote. Add the GitHub remote and try again."
  exit 1
fi
say  "origin = $ORIGIN_URL"

# 5. Confirm the target files actually appear somewhere in history.
#    The first four are the Helium backup dumps (Task #518, ~250 MB).
#    The last one is the stray Turborepo build-cache artifact that was
#    accidentally committed to LFS (Task #520, ~70 MB). It is regenerable;
#    `.turbo/` is in `.gitignore` and the matching `.gitattributes` LFS
#    rule has been removed so it will not come back.
TARGET_GLOBS=(
  "backups/heliumdb-data-only-20260424T174432Z.sql.gz"
  "backups/heliumdb-full-20260424T174432Z.sql.gz"
  "backups/heliumdb-rowcounts-20260424T174432Z.txt"
  "backups/heliumdb-sequences-20260424T174432Z.sql"
  ".turbo/cache/4ef2d42dbe46b27f.tar.zst"
)
say  "Looking for target paths in history..."
FOUND_ANY=0
for path in "${TARGET_GLOBS[@]}"; do
  if git log --all --pretty=format: --name-only --diff-filter=A -- "$path" 2>/dev/null | grep -q .; then
    ok "  found: $path"
    FOUND_ANY=1
  else
    warn "  absent (already gone?): $path"
  fi
done
if [[ "$FOUND_ANY" -eq 0 ]]; then
  warn "None of the target files exist in history. Nothing to purge — exiting."
  exit 0
fi

# 6. Optional: warn if R2 archive is empty (don't block — not all clones have AWS creds).
say  "(Optional) verifying R2 archive still holds the rollback set..."
if command -v npx >/dev/null 2>&1 && [[ -f "$REPO_ROOT/script/r2-list-archive.ts" ]]; then
  if npx -y tsx script/r2-list-archive.ts 2>/dev/null | grep -q "helium-rollback-20260424"; then
    ok  "R2 archive present at archive/helium-rollback-20260424/"
  else
    warn "Could not verify R2 contents (missing creds, or archive moved)."
    warn "Do NOT proceed unless you've separately confirmed R2 still holds the dumps."
  fi
else
  warn "Skipping R2 check (npx or script/r2-list-archive.ts not available here)."
fi

# 7. Plan.
say ""
say "${BOLD}== Plan ==${RESET}"
say "  1. Tar up .git into ../helium-purge-git-backup-\$(date).tar.gz   (rollback)"
say "  2. git filter-repo --invert-paths \\"
for path in "${TARGET_GLOBS[@]}"; do
  say "         --path '$path' \\"
done
say "  3. Re-add 'origin' remote (filter-repo strips remotes by design)"
say "  4. git lfs prune"
say "  5. Print the exact 'git push --force-with-lease origin main' command"
say "     — script does NOT push for you. Inspect the rewrite first."
say ""
say "After push, you must also:"
say "  a. Email github-support@github.com asking them to GC orphaned LFS objects"
say "     for this repo (they won't auto-collect; cite 'Task #518 + #520 history rewrite')."
say "  b. Tell every collaborator + every other agent shell to re-clone."
say "     Their existing clones will diverge and stale PRs will detach."
say "  c. Edit docs/developer/migration-from-replit.md, in the section titled"
say "     'History rewrite — Helium backup purge', replace 'YYYY-MM-DD' with"
say "     today's date and the new HEAD SHA so future debuggers know why old"
say "     SHAs (e.g. 92ad89cd, the pre-Task-#517 ref) no longer resolve."
say "  d. Confirm the .turbo/cache LFS object (~70 MB) is also gone from the"
say "     LFS bill — that one is part of this same rewrite (Task #520)."

if [[ "$EXECUTE" -ne 1 ]]; then
  say ""
  warn "Dry run. Re-run with --execute to actually rewrite history."
  exit 0
fi

# 8. Execute.
say ""
say "${BOLD}== Executing rewrite ==${RESET}"

BACKUP_TAR="../helium-purge-git-backup-$(date +%Y%m%dT%H%M%S).tar.gz"
say "Backing up .git to $BACKUP_TAR ..."
tar -czf "$BACKUP_TAR" .git
ok  "Backup written."

FILTER_ARGS=(--invert-paths --force)
for path in "${TARGET_GLOBS[@]}"; do
  FILTER_ARGS+=(--path "$path")
done
say "Running git filter-repo ..."
git filter-repo "${FILTER_ARGS[@]}"
ok  "History rewritten."

say "Re-adding origin = $ORIGIN_URL"
git remote add origin "$ORIGIN_URL" 2>/dev/null || git remote set-url origin "$ORIGIN_URL"

say "Pruning local LFS objects ..."
git lfs prune || warn "git lfs prune returned non-zero (often fine; inspect manually)."

NEW_HEAD="$(git rev-parse HEAD)"
say ""
ok  "${BOLD}Rewrite complete.${RESET}"
say "New HEAD on local main: $NEW_HEAD"
say ""
say "${BOLD}Next, manually:${RESET}"
say "  git push --force-with-lease origin main"
say ""
say "Then complete steps (a), (b), (c) listed in the plan above."

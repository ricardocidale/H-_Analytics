#!/usr/bin/env bash
# Helper for /coderabbit-loop-autofix — open-PR iterative autofix loop.
#
# Subcommands (called by the slash command's Claude session):
#   pr-check                      Verify open PR on current branch; emit PR_NUMBER, HEAD_SHA, REPO_OWNER, REPO_NAME
#   pat-scope-check               Verify $GITHUB_PAT has required scopes (issues:write + pull_requests:read)
#   trigger-comment <pr> <body>   Post a GitHub PR comment via curl (Authorization header never echoed)
#   poll-bot-commit <pr> <sha>    Poll for a new coderabbitai commit after <sha> (timeout 5 min)
#   poll-bot-review <pr> <since>  Poll for a new CR review newer than <since> ISO timestamp (timeout 10 min)
#   parse-review-body             Parse ACTIONABLE_COUNT from .local/coderabbit-loop/latest-review.txt
#   status-rollup <pr>            Check statusCheckRollup via gh; emit ROLLUP_PASS, ROLLUP_PENDING, or ROLLUP_FAIL
set -euo pipefail

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel)"
fi

scratch="$repo_root/.local/coderabbit-loop"

# ─── Logo & progress helpers (shown on every invocation) ─────────────────────
cr_banner() {
  printf '\n╔═══════════════════════════════════════════════╗\n'
  printf   '║     CodeRabbit Loop  •  by Ricardo Cidale     ║\n'
  printf   '╚═══════════════════════════════════════════════╝\n\n'
}

cr_progress() {
  local step="$1" total="$2" label="${3:-}"
  local width=20 filled=0 i=0 bar=""
  filled=$(( step * width / total ))
  while [ "$i" -lt "$filled" ]; do bar="${bar}█"; i=$((i+1)); done
  while [ "$i" -lt "$width"  ]; do bar="${bar}░"; i=$((i+1)); done
  printf '  [%s] %2d/%d  %s\n' "$bar" "$step" "$total" "$label"
}

cr_banner >&2

subcommand="${1:-help}"
shift || true

# ─────────────────────────────────────────────────────────────
# pr-check
#
# Verifies the current branch has an open PR and emits:
#   PR_NUMBER=N
#   HEAD_SHA=<sha>
#   PR_URL=<url>
#   REPO_OWNER=<owner>
#   REPO_NAME=<name>
# Exits 1 with PR_NONE if no open PR found.
# ─────────────────────────────────────────────────────────────
pr_check() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "PR_NONE: gh CLI not installed" >&2
    return 1
  fi

  local pr_json
  pr_json="$(gh pr view --json number,headRefOid,url 2>/dev/null)" || {
    echo "PR_NONE: no open PR found for current branch"
    return 1
  }

  local repo_json
  repo_json="$(gh repo view --json owner,name 2>/dev/null)" || {
    echo "PR_NONE: could not detect repo info" >&2
    return 1
  }

  python3 - "$pr_json" "$repo_json" <<'PYEOF'
import json, sys
pr   = json.loads(sys.argv[1])
repo = json.loads(sys.argv[2])
print(f"PR_NUMBER={pr['number']}")
print(f"HEAD_SHA={pr['headRefOid']}")
print(f"PR_URL={pr['url']}")
print(f"REPO_OWNER={repo['owner']['login']}")
print(f"REPO_NAME={repo['name']}")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# pat-scope-check
#
# Verifies $GITHUB_PAT includes the required scopes.
# Required: repo (classic) OR issues:write + pull_requests:read (fine-grained).
# Emits: PAT_OK or PAT_FAIL:<message>
# The PAT is never echoed to stdout or logged.
# ─────────────────────────────────────────────────────────────
pat_scope_check() {
  if [ -z "${GITHUB_PAT:-}" ]; then
    echo "PAT_FAIL: GITHUB_PAT is not set"
    return 1
  fi

  local headers
  headers="$(curl -sf -I -H "Authorization: Bearer $GITHUB_PAT" \
    https://api.github.com/user 2>/dev/null)" || {
    echo "PAT_FAIL: GitHub API request failed (invalid token or network error)"
    return 1
  }

  local scopes
  scopes="$(echo "$headers" | grep -i '^x-oauth-scopes:' | sed 's/^[^:]*: *//' | tr -d '\r')"

  python3 - "$scopes" <<'PYEOF'
import sys
raw = sys.argv[1].strip()
scopes = {s.strip() for s in raw.split(",")} if raw else set()

# Classic PAT: 'repo' covers everything needed
if "repo" in scopes or "public_repo" in scopes:
    print("PAT_OK")
    print(f"PAT_SCOPES: {raw or '(none listed — likely fine-grained)'}")
    sys.exit(0)

# Fine-grained PAT uses different scope names; the header may be empty
# For fine-grained tokens, x-oauth-scopes is empty — treat as OK if the
# token validated (the API call succeeded above)
if not raw:
    print("PAT_OK")
    print("PAT_SCOPES: (fine-grained token — scope list not returned by API)")
    sys.exit(0)

# Classic PAT with insufficient scopes
missing = []
if "issues:write" not in scopes:
    missing.append("issues:write")
if "pull_requests:read" not in scopes and "repo" not in scopes:
    missing.append("pull_requests:read")

if missing:
    print(f"PAT_FAIL: missing required scopes: {', '.join(missing)}. Current scopes: {raw}")
    sys.exit(1)

print("PAT_OK")
print(f"PAT_SCOPES: {raw}")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# trigger-comment <pr_number> <comment_body>
#
# Posts a comment on the given PR number via the GitHub Issues API.
# The repo is auto-detected from gh repo view.
# $GITHUB_PAT is used but never echoed or logged in cleartext.
# Emits: COMMENT_POSTED:<comment_id> or COMMENT_FAILED:<http_status>
# ─────────────────────────────────────────────────────────────
trigger_comment() {
  local pr_number="${1:-}"
  local body="${2:-}"

  if [ -z "$pr_number" ] || [ -z "$body" ]; then
    echo "COMMENT_FAILED: pr_number and body are required" >&2
    return 1
  fi
  if [ -z "${GITHUB_PAT:-}" ]; then
    echo "COMMENT_FAILED: GITHUB_PAT is not set" >&2
    return 1
  fi

  local repo_json
  repo_json="$(gh repo view --json owner,name 2>/dev/null)" || {
    echo "COMMENT_FAILED: could not detect repo" >&2
    return 1
  }

  local owner name
  owner="$(echo "$repo_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['owner']['login'])")"
  name="$(echo  "$repo_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['name'])")"

  local payload comment_id http_status
  payload="$(python3 -c "import json,sys; print(json.dumps({'body': sys.argv[1]}))" "$body")"

  local tmpout
  tmpout="$(mktemp)"
  http_status="$(curl -sf -w '%{http_code}' -o "$tmpout" \
    -X POST \
    -H "Authorization: Bearer $GITHUB_PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$owner/$name/issues/$pr_number/comments" \
    -d "$payload" 2>/dev/null)" || http_status="$?"

  if [ "$http_status" = "201" ]; then
    comment_id="$(python3 -c "import json,sys; d=json.load(open('$tmpout')); print(d.get('id','?'))")"
    echo "COMMENT_POSTED:$comment_id"
  else
    echo "COMMENT_FAILED:$http_status"
    rm -f "$tmpout"
    return 1
  fi
  rm -f "$tmpout"
}

# ─────────────────────────────────────────────────────────────
# poll-bot-commit <pr_number> <pre_sha>
#
# Polls gh pr view --json commits until a new commit appears
# whose author login contains 'coderabbitai', or until timeout.
# Timeout: 5 minutes (20 × 15s polls).
# Emits: BOT_COMMIT=<sha> or BOT_COMMIT_TIMEOUT
# ─────────────────────────────────────────────────────────────
poll_bot_commit() {
  local pr_number="${1:-}"
  local pre_sha="${2:-}"

  if [ -z "$pr_number" ]; then
    echo "BOT_COMMIT_TIMEOUT: pr_number required" >&2
    return 1
  fi

  echo "Polling for CodeRabbit bot commit on PR #$pr_number (timeout 5 min)…" >&2

  local attempts=0
  local max_attempts=20
  local sleep_sec=15

  while [ "$attempts" -lt "$max_attempts" ]; do
    attempts=$((attempts + 1))
    cr_progress "$attempts" "$max_attempts" "waiting ${sleep_sec}s for bot commit on PR #${pr_number}…" >&2

    local commits_json
    commits_json="$(gh pr view "$pr_number" --json commits 2>/dev/null)" || {
      sleep "$sleep_sec"
      continue
    }

    local bot_sha
    bot_sha="$(python3 - "$commits_json" "$pre_sha" <<'PYEOF'
import json, sys
data    = json.loads(sys.argv[1])
pre_sha = sys.argv[2]
commits = data.get("commits", [])
for c in reversed(commits):
    oid    = c.get("oid", "")
    author = c.get("authors", [{}])[0]
    login  = (author.get("login") or "").lower()
    name   = (author.get("name")  or "").lower()
    if oid != pre_sha and ("coderabbitai" in login or "coderabbitai" in name):
        print(oid)
        sys.exit(0)
sys.exit(1)
PYEOF
    )" || true

    if [ -n "$bot_sha" ]; then
      echo "BOT_COMMIT=$bot_sha"
      return 0
    fi

    sleep "$sleep_sec"
  done

  echo "BOT_COMMIT_TIMEOUT"
  return 1
}

# ─────────────────────────────────────────────────────────────
# poll-bot-review <pr_number> <since_iso>
#
# Polls the GitHub reviews endpoint until a new CodeRabbit review
# appears that was submitted after <since_iso> (ISO 8601 UTC).
# Timeout: 10 minutes (20 × 30s polls).
# Saves review body to .local/coderabbit-loop/latest-review.txt (mode 0600).
# Emits: BOT_REVIEW_FOUND or BOT_REVIEW_TIMEOUT
# ─────────────────────────────────────────────────────────────
poll_bot_review() {
  local pr_number="${1:-}"
  local since_iso="${2:-1970-01-01T00:00:00Z}"

  if [ -z "$pr_number" ]; then
    echo "BOT_REVIEW_TIMEOUT: pr_number required" >&2
    return 1
  fi
  if [ -z "${GITHUB_PAT:-}" ]; then
    echo "BOT_REVIEW_TIMEOUT: GITHUB_PAT is not set" >&2
    return 1
  fi

  local repo_json
  repo_json="$(gh repo view --json owner,name 2>/dev/null)" || {
    echo "BOT_REVIEW_TIMEOUT: could not detect repo" >&2
    return 1
  }
  local owner name
  owner="$(echo "$repo_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['owner']['login'])")"
  name="$(echo  "$repo_json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['name'])")"

  echo "Polling for CodeRabbit review on PR #$pr_number since $since_iso (timeout 10 min)…" >&2

  mkdir -p "$scratch"
  chmod 700 "$scratch"
  local review_file="$scratch/latest-review.txt"

  local attempts=0
  local max_attempts=20
  local sleep_sec=30

  while [ "$attempts" -lt "$max_attempts" ]; do
    attempts=$((attempts + 1))
    cr_progress "$attempts" "$max_attempts" "waiting ${sleep_sec}s for bot review on PR #${pr_number}…" >&2

    local tmpout
    tmpout="$(mktemp)"
    curl -sf \
      -H "Authorization: Bearer $GITHUB_PAT" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$owner/$name/pulls/$pr_number/reviews" \
      > "$tmpout" 2>/dev/null || { rm -f "$tmpout"; sleep "$sleep_sec"; continue; }

    local found_body
    found_body="$(python3 - "$tmpout" "$since_iso" <<'PYEOF'
import json, sys
from datetime import datetime, timezone

reviews = json.load(open(sys.argv[1]))
since   = datetime.fromisoformat(sys.argv[2].replace("Z", "+00:00"))

best = None
best_dt = None
for r in reviews:
    login = (r.get("user") or {}).get("login", "").lower()
    if "coderabbitai" not in login:
        continue
    submitted = r.get("submitted_at", "")
    if not submitted:
        continue
    try:
        dt = datetime.fromisoformat(submitted.replace("Z", "+00:00"))
    except ValueError:
        continue
    if dt > since:
        if best_dt is None or dt > best_dt:
            best    = r.get("body", "")
            best_dt = dt

if best is not None:
    print(best)
    sys.exit(0)
sys.exit(1)
PYEOF
    )" || true

    rm -f "$tmpout"

    if [ -n "$found_body" ]; then
      printf '%s' "$found_body" > "$review_file"
      chmod 600 "$review_file"
      echo "BOT_REVIEW_FOUND"
      return 0
    fi

    sleep "$sleep_sec"
  done

  echo "BOT_REVIEW_TIMEOUT"
  return 1
}

# ─────────────────────────────────────────────────────────────
# parse-review-body
#
# Reads .local/coderabbit-loop/latest-review.txt and extracts:
#   ACTIONABLE_COUNT=N          (from "Actionable comments posted: N")
#   DUPLICATE_COUNT=N           (from "♻️ Duplicate comments (N)")
# Also emits REVIEW_SUMMARY:<first 200 chars> for the caller's log.
# ─────────────────────────────────────────────────────────────
parse_review_body() {
  local review_file="$scratch/latest-review.txt"

  if [ ! -f "$review_file" ]; then
    echo "ACTIONABLE_COUNT=0"
    echo "PARSE_WARNING: latest-review.txt not found" >&2
    return 0
  fi

  python3 - "$review_file" <<'PYEOF'
import re, sys

text = open(sys.argv[1]).read()

# "Actionable comments posted: N" — canonical exit signal
m = re.search(r'actionable comments posted[:\s]+(\d+)', text, re.IGNORECASE)
actionable = int(m.group(1)) if m else 0
print(f"ACTIONABLE_COUNT={actionable}")

# "♻️ Duplicate comments (N)"
m2 = re.search(r'Duplicate comments\s*\((\d+)\)', text, re.IGNORECASE)
dupes = int(m2.group(1)) if m2 else 0
print(f"DUPLICATE_COUNT={dupes}")

# Short summary for caller log
summary = text[:200].replace("\n", " ").strip()
print(f"REVIEW_SUMMARY:{summary}")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# status-rollup <pr_number>
#
# Checks gh pr view --json statusCheckRollup.
# Emits: ROLLUP_PASS, ROLLUP_PENDING, or ROLLUP_FAIL:<failing-check-names>
# ─────────────────────────────────────────────────────────────
status_rollup() {
  local pr_number="${1:-}"
  if [ -z "$pr_number" ]; then
    echo "ROLLUP_FAIL: pr_number required" >&2
    return 1
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "ROLLUP_FAIL: gh CLI not installed" >&2
    return 1
  fi

  local rollup_json
  rollup_json="$(gh pr view "$pr_number" --json statusCheckRollup 2>/dev/null)" || {
    echo "ROLLUP_FAIL: gh pr view failed"
    return 1
  }

  python3 - "$rollup_json" <<'PYEOF'
import json, sys
data   = json.loads(sys.argv[1])
checks = data.get("statusCheckRollup", [])

if not checks:
    print("ROLLUP_PASS")
    sys.exit(0)

pending = [c.get("name","?") for c in checks if c.get("status") in ("IN_PROGRESS","QUEUED","PENDING")]
failing = [c.get("name","?") for c in checks if c.get("conclusion") in ("FAILURE","CANCELLED","TIMED_OUT","ACTION_REQUIRED")]

if pending:
    print("ROLLUP_PENDING:" + ",".join(pending))
    sys.exit(0)
if failing:
    print("ROLLUP_FAIL:" + ",".join(failing))
    sys.exit(1)

print("ROLLUP_PASS")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# Dispatch
# ─────────────────────────────────────────────────────────────
case "$subcommand" in
  pr-check)          pr_check ;;
  pat-scope-check)   pat_scope_check ;;
  trigger-comment)   trigger_comment "$@" ;;
  poll-bot-commit)   poll_bot_commit "$@" ;;
  poll-bot-review)   poll_bot_review "$@" ;;
  parse-review-body) parse_review_body ;;
  status-rollup)     status_rollup "$@" ;;
  *)
    echo "usage: $0 {pr-check|pat-scope-check|trigger-comment|poll-bot-commit|poll-bot-review|parse-review-body|status-rollup}" >&2
    exit 2
    ;;
esac

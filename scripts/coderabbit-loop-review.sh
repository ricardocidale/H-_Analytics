#!/usr/bin/env bash
# Helper for /coderabbit-loop-review — working-tree iterative review loop.
#
# Subcommands (called by the slash command's Claude session):
#   parse-ndjson <file>    Parse NDJSON from cr review --agent, print findings summary
#   gate-check             Run per-iteration quality gates (conditional on repo features)
#   branch-hygiene         Check for Replit-Agent commits in branch history
#   write-state <key=val…> Write key=value pairs into .local/coderabbit-loop/run.json
#   check-changes          Check if there are uncommitted changes to review
set -euo pipefail

self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd "$self_dir/.." >/dev/null 2>&1 && pwd)"

# Resolve repo root when running from global install path.
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  repo_root="$(git rev-parse --show-toplevel)"
fi

scratch="$repo_root/.local/coderabbit-loop"

subcommand="${1:-help}"
shift || true

# ─────────────────────────────────────────────────────────────
# parse-ndjson <file>
#
# Reads NDJSON from cr review --agent output.
# Outputs:
#   ACTIONABLE_COUNT=N
#   FINDING:<severity>:<fileName>:<brief> (one per actionable finding)
#   FINDING_JSON:<escaped json> (full finding object, one per line)
# Ignores: review_context, status, complete, error event types.
# ─────────────────────────────────────────────────────────────
parse_ndjson() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "ACTIONABLE_COUNT=0"
    echo "ERROR: ndjson file not found: $file" >&2
    return 0
  fi

  python3 - "$file" <<'PYEOF'
import json, sys

ACTIONABLE_SEVERITIES = {"critical", "major", "minor"}
findings = []
errors = []

with open(sys.argv[1]) as f:
    for lineno, raw in enumerate(f, 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            event = json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"line {lineno}: {e}")
            continue

        etype = event.get("type", "")
        if etype == "finding":
            sev = event.get("severity", "info").lower()
            if sev in ACTIONABLE_SEVERITIES:
                findings.append(event)
        # review_context, status, complete, error — skip

print(f"ACTIONABLE_COUNT={len(findings)}")
for f in findings:
    sev = f.get("severity", "?")
    fname = f.get("fileName", "?")
    brief = (f.get("codegenInstructions") or f.get("message") or "")[:80].replace("\n", " ")
    print(f"FINDING:{sev}:{fname}:{brief}")
    # Emit full JSON for Claude to read codegenInstructions
    print(f"FINDING_JSON:{json.dumps(f)}")

if errors:
    for e in errors:
        print(f"PARSE_WARNING:{e}", file=sys.stderr)
PYEOF
}

# ─────────────────────────────────────────────────────────────
# gate-check
#
# Runs per-iteration quality gates that are applicable to this repo.
# Each gate is conditional — skipped with a note if not applicable.
# Exits non-zero if any applicable gate fails.
# ─────────────────────────────────────────────────────────────
gate_check() {
  local failed=0

  echo "--- gate-check ---"

  # Gate 1: typecheck (conditional on package manager + typecheck script)
  local pm=""
  if [ -f "$repo_root/pnpm-workspace.yaml" ]; then pm="pnpm"
  elif [ -f "$repo_root/bun.lockb" ]; then pm="bun"
  elif [ -f "$repo_root/package-lock.json" ]; then pm="npm"
  fi

  if [ -n "$pm" ] && [ -f "$repo_root/package.json" ]; then
    if python3 -c "import json; d=json.load(open('$repo_root/package.json')); exit(0 if 'typecheck' in d.get('scripts',{}) else 1)" 2>/dev/null; then
      echo "typecheck: running ($pm run typecheck)…"
      if (cd "$repo_root" && $pm run typecheck 2>&1); then
        echo "typecheck: PASS"
      else
        echo "typecheck: FAIL" >&2
        failed=1
      fi
    else
      echo "typecheck: SKIP (no typecheck script in package.json)"
    fi
  else
    echo "typecheck: SKIP (no package.json or package manager detected)"
  fi

  # Gate 2: magic-numbers (conditional on script existence)
  local mn_script="$repo_root/scripts/src/check-magic-numbers.ts"
  local mn_runner="$repo_root/scripts/node_modules/.bin/tsx"
  if [ -f "$mn_script" ] && [ -f "$mn_runner" ]; then
    echo "magic-numbers: running…"
    if (cd "$repo_root" && "$mn_runner" "$mn_script" 2>&1); then
      echo "magic-numbers: PASS"
    else
      echo "magic-numbers: FAIL" >&2
      failed=1
    fi
  else
    echo "magic-numbers: SKIP (check-magic-numbers.ts not found)"
  fi

  if [ "$failed" -eq 0 ]; then
    echo "gate-check: all applicable gates PASSED"
    return 0
  else
    echo "gate-check: one or more gates FAILED" >&2
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────
# branch-hygiene [--mode=autofix]
#
# Checks for Replit-Agent commits between HEAD and origin/main.
# Exits 0 if clean, non-zero + prints offending SHAs if dirty.
# Allows: coderabbitai[bot] commits (legitimate autofix landings).
# Rejects: 52429710-ricardocidale@users.noreply.replit.com (Replit Agent).
#
# --mode=autofix: additionally emits AUTOFIX_BOT_COMMIT_COUNT=N and
#   AUTOFIX_BOT_COMMIT_SHA=<sha> lines for each coderabbitai commit found,
#   so the caller can verify the bot commit landed and get its SHA for
#   the post-commit §9 re-check.
# ─────────────────────────────────────────────────────────────
branch_hygiene() {
  local mode=""
  for arg in "$@"; do
    case "$arg" in --mode=*) mode="${arg#--mode=}" ;; esac
  done

  local default_branch
  default_branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')"
  [ -z "$default_branch" ] && default_branch="main"

  local bad
  bad="$(git log "origin/$default_branch..HEAD" --format="%h %ae %s" 2>/dev/null \
    | grep '52429710-ricardocidale@users.noreply.replit.com' || true)"

  if [ -n "$bad" ]; then
    echo "HYGIENE_FAIL"
    echo "$bad" | while IFS= read -r line; do
      echo "  REPLIT_AGENT_COMMIT: $line"
    done
    return 1
  fi

  echo "HYGIENE_OK"

  if [ "$mode" = "autofix" ]; then
    local bot_commits
    bot_commits="$(git log "origin/$default_branch..HEAD" --format="%h %ae %s" 2>/dev/null \
      | grep -i 'coderabbitai' || true)"
    if [ -n "$bot_commits" ]; then
      local count
      count="$(echo "$bot_commits" | grep -c .)"
      echo "AUTOFIX_BOT_COMMIT_COUNT=$count"
      echo "$bot_commits" | while IFS= read -r line; do
        local sha="${line%% *}"
        echo "AUTOFIX_BOT_COMMIT_SHA=$sha"
      done
    else
      echo "AUTOFIX_BOT_COMMIT_COUNT=0"
    fi
  fi

  return 0
}

# ─────────────────────────────────────────────────────────────
# check-changes
#
# Exits 0 if there are uncommitted changes; exits 1 if the tree is clean.
# ─────────────────────────────────────────────────────────────
check_changes() {
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "CHANGES_PRESENT"
    return 0
  else
    echo "NO_CHANGES"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────
# write-state key=value…
# Writes/merges key-value pairs into .local/coderabbit-loop/run.json
# ─────────────────────────────────────────────────────────────
write_state() {
  mkdir -p "$scratch"
  chmod 700 "$scratch"
  local run_json="$scratch/run.json"

  # Build existing state or empty object
  local existing="{}"
  if [ -f "$run_json" ]; then
    existing="$(cat "$run_json")"
  fi

  # Merge provided key=value pairs
  python3 - "$existing" "$@" <<'PYEOF'
import json, sys

state = json.loads(sys.argv[1])
for kv in sys.argv[2:]:
    if "=" in kv:
        k, v = kv.split("=", 1)
        # Coerce numeric strings
        try:
            state[k] = int(v)
        except ValueError:
            state[k] = v

print(json.dumps(state, indent=2))
PYEOF
  # Write with restricted permissions
  local tmp
  tmp="$(mktemp "$scratch/run.json.XXXXXX")"
  python3 - "$existing" "$@" > "$tmp" <<'PYEOF'
import json, sys

state = json.loads(sys.argv[1])
for kv in sys.argv[2:]:
    if "=" in kv:
        k, v = kv.split("=", 1)
        try:
            state[k] = int(v)
        except ValueError:
            state[k] = v

print(json.dumps(state, indent=2))
PYEOF
  chmod 600 "$tmp"
  mv "$tmp" "$run_json"
  echo "STATE_WRITTEN: $run_json"
}

# ─────────────────────────────────────────────────────────────
# section9-persist-precheck <file-list>
#
# Saves the newline-separated file list to
# .local/coderabbit-loop/section9-precheck.txt (mode 0600)
# so a post-commit re-check can diff against it.
# Emits: PRECHECK_WRITTEN: <path> (N files)
# ─────────────────────────────────────────────────────────────
section9_persist_precheck() {
  local file_list="${1:-}"
  mkdir -p "$scratch"
  chmod 700 "$scratch"
  local precheck_file="$scratch/section9-precheck.txt"
  printf '%s' "$file_list" > "$precheck_file"
  chmod 600 "$precheck_file"
  local count=0
  if [ -n "$file_list" ]; then
    count="$(echo "$file_list" | grep -c . || true)"
  fi
  echo "PRECHECK_WRITTEN: $precheck_file ($count files)"
}

# ─────────────────────────────────────────────────────────────
# section9-post-check <new-file-list>
#
# Compares the provided file list against the persisted precheck
# list to find §9 paths the bot introduced that were not present
# in the original diff.
#
# Emits: SECTION9_POST_CLEAN or SECTION9_POST_INTERSECT:<new-paths>
# Exits 1 and emits SECTION9_POST_NO_PRECHECK if no precheck file exists.
# ─────────────────────────────────────────────────────────────
section9_post_check() {
  local new_file_list="${1:-}"
  local precheck_file="$scratch/section9-precheck.txt"

  if [ ! -f "$precheck_file" ]; then
    echo "SECTION9_POST_NO_PRECHECK: run section9-persist-precheck before the bot commit" >&2
    return 1
  fi

  local precheck_list
  precheck_list="$(cat "$precheck_file")"

  python3 - "$new_file_list" "$precheck_list" <<'PYEOF'
import sys, re

SECTION9_PATTERNS = [
    r'^lib/engine/src/',
    r'^lib/calc/src/',
    r'^lib/shared/src/constants.*\.ts$',
    r'^lib/db/src/constants.*\.ts$',
    r'^artifacts/api-server/src/finance/',
    r'^artifacts/api-server/src/report/',
    r'^artifacts/api-server/src/tests/proof/',
    r'^artifacts/api-server/src/tests/engine/',
]

new_files  = [f for f in sys.argv[1].strip().splitlines() if f.strip()]
pre_files  = set(f.strip() for f in sys.argv[2].strip().splitlines() if f.strip())

# Newly introduced = in new but not in pre
introduced = [f for f in new_files if f not in pre_files]

# Of those, which hit §9?
new_hits = [f for f in introduced if any(re.match(p, f.lstrip('/')) for p in SECTION9_PATTERNS)]

if new_hits:
    print("SECTION9_POST_INTERSECT:" + ",".join(new_hits))
else:
    print("SECTION9_POST_CLEAN")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# §9 preflight check
# Accepts a list of filenames (one per line on stdin).
# Prints SECTION9_CLEAN or SECTION9_INTERSECT:<paths>.
# ─────────────────────────────────────────────────────────────
section9_check() {
  local changed_files="${1:-}"
  if [ -z "$changed_files" ] && [ ! -t 0 ]; then
    changed_files="$(cat)"
  fi

  python3 - "$changed_files" <<'PYEOF'
import sys, re

SECTION9_PATTERNS = [
    r'^lib/engine/src/',
    r'^lib/calc/src/',
    r'^lib/shared/src/constants.*\.ts$',
    r'^lib/db/src/constants.*\.ts$',
    r'^artifacts/api-server/src/finance/',
    r'^artifacts/api-server/src/report/',
    r'^artifacts/api-server/src/tests/proof/',
    r'^artifacts/api-server/src/tests/engine/',
]

files = sys.argv[1].strip().splitlines() if sys.argv[1].strip() else []
hits = [f for f in files if any(re.match(p, f.lstrip('/')) for p in SECTION9_PATTERNS)]

if hits:
    print("SECTION9_INTERSECT:" + ",".join(hits))
else:
    print("SECTION9_CLEAN")
PYEOF
}

# ─────────────────────────────────────────────────────────────
# print-logo
#
# Prints the CodeRabbit Loop ASCII banner to stderr.
# Called automatically at the start of run-review.
# ─────────────────────────────────────────────────────────────
print_logo() {
  local G=$'\033[32m' B=$'\033[1m' D=$'\033[2m' R=$'\033[0m'
  printf >&2 '\n'
  printf >&2 '  ╭────────────────────────────────────────────╮\n'
  printf >&2 '  │                                            │\n'
  printf >&2 "  │   /\\ /\\    ${B}${G}CodeRabbit${R} ${B}Loop${R}                 │\n"
  printf >&2 "  │  ( •.• )   ${D}iterative working-tree review${R}   │\n"
  printf >&2 "  │   > ^ <    ${D}powered by CodeRabbit CLI${R}       │\n"
  printf >&2 '  │                                            │\n'
  printf >&2 '  ╰────────────────────────────────────────────╯\n'
  printf >&2 '\n'
}

# ─────────────────────────────────────────────────────────────
# run-review <ndjson-output-file>
#
# Runs `coderabbit review --type uncommitted --agent`, renders an
# animated progress bar to stderr, writes raw NDJSON to the output
# file, and prints a one-line summary to stdout on completion.
#
# Progress bar style (updates in-place via \r):
#   ⠋ CodeRabbit  [████████████░░░░░░░░░░░░] 50%  summarizing
#
# Stdout on success: REVIEW_COMPLETE: findings=N ndjson=<path>
# ─────────────────────────────────────────────────────────────
run_review() {
  local ndjson_file="${1:?usage: run-review <ndjson-output-file>}"
  print_logo
  export PATH="$HOME/.local/bin:$PATH"

  # Write the progress renderer to a temp file.
  # A heredoc cannot be used here because piping coderabbit's output to
  # `python3 -` already claims stdin, making a <<PYEOF heredoc conflict.
  local renderer
  renderer="$(mktemp /tmp/cr-progress-XXXXXX.py)"
  # shellcheck disable=SC2064
  trap "rm -f '$renderer'" RETURN

  cat > "$renderer" << 'PYEOF'
import sys, json

PHASES = {
    "connecting_to_review_service": ("connecting",  10),
    "setting_up":                   ("setting up",  20),
    "preparing_sandbox":            ("preparing",   35),
    "summarizing":                  ("summarizing", 60),
    "reviewing":                    ("reviewing",   80),
}
SPIN  = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
W     = 24

def bar(pct):
    n = int(W * pct / 100)
    return "█" * n + "░" * (W - n)

path     = sys.argv[1]
si       = 0
pct      = 0
label    = "connecting"
findings = 0

with open(path, "w") as f:
    for raw in sys.stdin:
        line = raw.rstrip("\n")
        if not line:
            continue
        f.write(line + "\n")
        f.flush()
        try:
            ev = json.loads(line)
        except Exception:
            continue
        t = ev.get("type", "")
        if t == "status":
            s = ev.get("status", "")
            if s in PHASES:
                label, pct = PHASES[s]
            si = (si + 1) % len(SPIN)
            sys.stderr.write(f"\r  {SPIN[si]} CodeRabbit  [{bar(pct)}] {pct:3d}%  {label}   ")
            sys.stderr.flush()
        elif t == "finding":
            findings += 1
        elif t == "complete":
            sys.stderr.write(f"\r  ✓ CodeRabbit  [{bar(100)}] 100%  done — {findings} finding(s)   \n")
            sys.stderr.flush()
            print(f"REVIEW_COMPLETE: findings={findings} ndjson={path}")
            sys.stdout.flush()
PYEOF

  coderabbit review --type uncommitted --agent 2>&1 | python3 "$renderer" "$ndjson_file"
}

# ─────────────────────────────────────────────────────────────
# Dispatch
# ─────────────────────────────────────────────────────────────
case "$subcommand" in
  parse-ndjson)              parse_ndjson "$@" ;;
  gate-check)                gate_check ;;
  branch-hygiene)            branch_hygiene "$@" ;;
  check-changes)             check_changes ;;
  write-state)               write_state "$@" ;;
  run-review)                run_review "$@" ;;
  print-logo)                print_logo ;;
  section9-check)            section9_check "$@" ;;
  section9-persist-precheck) section9_persist_precheck "$@" ;;
  section9-post-check)       section9_post_check "$@" ;;
  *)
    echo "usage: $0 {parse-ndjson|gate-check|branch-hygiene|check-changes|write-state|run-review|print-logo|section9-check|section9-persist-precheck|section9-post-check}" >&2
    exit 2
    ;;
esac

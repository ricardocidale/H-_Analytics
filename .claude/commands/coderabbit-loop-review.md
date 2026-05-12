---
description: Run the iterative CodeRabbit working-tree review loop (up to 4 iterations, Claude applies fixes between passes)
---

Run the synchronous iterative working-tree review loop. You are orchestrating the entire loop in this session. Follow every step precisely.

**Helper script location:** `~/.local/share/coderabbit-loop/coderabbit-loop-review.sh` (global install) or `scripts/coderabbit-loop-review.sh` (H+ Analytics repo). Use whichever exists, checking global path first.

---

## Step 1 — Preconditions

1. **Toggle check.** Run `~/.local/share/coderabbit-loop/coderabbit-loop.sh status 2>/dev/null | head -2 || scripts/coderabbit-loop.sh status 2>/dev/null | head -2`. If the loop is **OFF**, stop and say: "CodeRabbit loop is OFF. Run `/coderabbit-loop-on` first."

2. **CLI check.** Run `command -v coderabbit`. If not found, say: "CodeRabbit CLI not installed. Run `bash scripts/install-coderabbit-cli.sh` then `coderabbit auth login`." and stop.

3. **Changes check.** Run `<helper> check-changes`. If output is `NO_CHANGES`, say: "No uncommitted changes found — nothing to review." and stop.

4. **Initialize scratch.** Run:
   ```
   mkdir -p .local/coderabbit-loop
   chmod 700 .local/coderabbit-loop
   rm -f .local/coderabbit-loop/iteration-*.ndjson .local/coderabbit-loop/iteration-*.log
   <helper> write-state mode=review started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) status=running current_iteration=0
   ```

---

## Step 2 — §9 preflight (this repo only)

Get the list of changed files: `git diff --name-only HEAD && git ls-files --others --exclude-standard`.

Pass the list to `<helper> section9-check "<newline-separated-list>"`.

If output starts with `SECTION9_INTERSECT:`, note the paths in your working context for Step 4's pre-filter. These files must NOT receive auto-applied fixes — surface them as "review-only" and skip applying their `codegenInstructions`.

If `SECTION9_CLEAN`, proceed normally.

---

## Step 3 — Iteration loop (max 4 iterations)

For **iteration = 1, 2, 3, 4**:

### 3a. Update state
Run `<helper> write-state current_iteration=<N> status=running`.

### 3b. Run CodeRabbit review
```bash
PATH="$HOME/.local/bin:$PATH" coderabbit review --type uncommitted --agent \
  2>&1 | tee .local/coderabbit-loop/iteration-<N>.ndjson
```
Capture exit code. If non-zero AND no `complete` event in the ndjson: write state `status=failed`, report the error output, and stop the loop.

Cap NDJSON at 5 MB: if `.local/coderabbit-loop/iteration-<N>.ndjson` exceeds 5 MB, truncate it with a warning.

### 3c. Parse findings
```bash
<helper> parse-ndjson .local/coderabbit-loop/iteration-<N>.ndjson
```
Read the output:
- `ACTIONABLE_COUNT=N` — number of findings at severity ≥ minor
- `FINDING:<sev>:<file>:<brief>` — one line per finding
- `FINDING_JSON:<json>` — full finding object (read `codegenInstructions` from here)

### 3d. Exit check (gate_clean)
If `ACTIONABLE_COUNT=0`:
- Run `<helper> gate-check`. If it passes, write state `status=complete-clean current_iteration=<N>` and report: "✓ Loop complete — zero actionable findings after iteration <N>. All gates pass." Stop the loop.
- If gate-check fails, surface the failing gates to the user and stop with state `status=gate-failed`.

### 3e. Apply fixes (if findings remain)

For each finding from Step 3c:
1. Read the `codegenInstructions` from `FINDING_JSON`.
2. **§9 pre-filter:** if the finding's `fileName` is in the §9 intersect list from Step 2, print: "⚠ Skipped (§9 protected): <file> — <brief>". Do not apply.
3. **Scope filter:** if `fileName` is NOT in the list of currently changed files (from Step 2), print: "⚠ Skipped (out of scope): <file> — <brief>". Do not apply.
4. Otherwise: locate the file, find the relevant lines (check both the listed line and ±20 lines for stale anchors), and apply the fix using the Edit tool. If the fix is already present on-disk, skip it and note "already applied".

### 3f. Branch hygiene check
```bash
<helper> branch-hygiene
```
If `HYGIENE_FAIL`, stop the loop and report: "⚠ Replit-Agent commits detected on this branch. Resolve before continuing. Cherry-pick only CC commits onto a clean branch and re-invoke."

### 3g. Auto-checkpoint capture guard
Run `git log -1 --format="%ae"`. If the author email is `52429710-ricardocidale@users.noreply.replit.com`, the last commit was a Replit auto-checkpoint. Recover:
```bash
git reset --soft HEAD~1
git commit -m "fix(loop-recovery): re-commit after auto-checkpoint capture"
```

### 3h. Gate check
Run `<helper> gate-check`. If any gate fails, surface the errors and ask the user whether to continue. If the user wants to continue, proceed; if not, write state `status=gate-failed` and stop.

### 3i. Commit
```bash
git add -p  # or stage specific files that were edited
git commit -m "fix(loop-iter-<N>): apply CodeRabbit review findings"
```

### 3j. Next iteration
If iteration < 4, continue to Step 3a with N+1.

---

## Step 4 — Final report

If the loop exits because iteration 4 still has findings:
- Write state `status=complete-residual current_iteration=4`
- Report: "Loop capped at 4 iterations. <N> actionable findings remain:" followed by the finding list.
- Suggest: "Re-invoke `/coderabbit-loop-review` to continue, or address the remaining findings manually."

Always print the iteration count and total findings resolved.

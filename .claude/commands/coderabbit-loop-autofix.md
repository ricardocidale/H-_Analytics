---
description: Run the iterative CodeRabbit open-PR autofix loop (iteration 1 triggers @coderabbitai autofix; iterations 2-4 are review-only with Claude applying fixes)
---

Run the synchronous iterative open-PR autofix loop. You are orchestrating the entire loop in this session. Follow every step precisely.

**Helper scripts:** `~/.local/share/coderabbit-loop/coderabbit-loop-review.sh` and `~/.local/share/coderabbit-loop/coderabbit-loop-autofix.sh` (global install) or `scripts/coderabbit-loop-review.sh` / `scripts/coderabbit-loop-autofix.sh` (H+ Analytics repo). Check global path first for each.

Shorthand: `<review-helper>` = `coderabbit-loop-review.sh`, `<autofix-helper>` = `coderabbit-loop-autofix.sh`.

---

## Step 1 — Preconditions

1. **Toggle check.** Run `<review-helper> status 2>/dev/null | head -2 || scripts/coderabbit-loop.sh status 2>/dev/null | head -2`. If the loop is **OFF**, stop: "CodeRabbit loop is OFF. Run `/coderabbit-loop-on` first."

2. **gh CLI check.** Run `command -v gh`. If not found, stop: "`gh` CLI not installed. Install it and run `gh auth login` first."

3. **PAT check.** Run `<autofix-helper> pat-scope-check`. If output is `PAT_FAIL:*`, stop and surface the exact error message.

4. **PR check.** Run `<autofix-helper> pr-check`. If output is `PR_NONE:*`, stop: "No open PR found on this branch. Push your branch and open a PR first."
   - Record: `PR_NUMBER`, `HEAD_SHA`, `REPO_OWNER`, `REPO_NAME` from the output.

5. **Prior review check.** Run:
   ```
   gh pr view <PR_NUMBER> --json reviews --jq '[.reviews[] | select(.author.login | ascii_downcase | contains("coderabbit"))] | length'
   ```
   If result is `0`, stop: "No prior CodeRabbit review on this PR. Push commits and wait for an initial CR review, then re-invoke."

6. **Initialize scratch.**
   ```
   mkdir -p .local/coderabbit-loop
   chmod 700 .local/coderabbit-loop
   rm -f .local/coderabbit-loop/iteration-*.log .local/coderabbit-loop/latest-review.txt
   <review-helper> write-state mode=autofix pr_number=<PR_NUMBER> head_sha=<HEAD_SHA> started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) status=running current_iteration=0
   ```

---

## Step 2 — §9 preflight

Get the PR diff file list: `gh pr diff --name-only`

**Persist the pre-check list:**
```
<review-helper> section9-persist-precheck "<newline-separated-list>"
```

**Check for §9 intersection:**
```
<review-helper> section9-check "<newline-separated-list>"
```

- If `SECTION9_INTERSECT:`, set `AUTOFIX_MODE=review-only` and note the paths — autofix is blocked on this PR. Iteration 1 will run `@coderabbitai review` instead of `@coderabbitai autofix`. Log this to `.local/coderabbit-loop/iteration-01.log`.
- If `SECTION9_CLEAN`, set `AUTOFIX_MODE=autofix`.

---

## Step 3 — Iteration loop (max 4 iterations)

Record `LOOP_START_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)` before the loop begins.

For **iteration = 1, 2, 3, 4**:

### 3a. Update state
```
<review-helper> write-state current_iteration=<N> status=running
```

### 3b. Trigger review or autofix

**Iteration 1, AUTOFIX_MODE=autofix:**
```bash
<autofix-helper> trigger-comment <PR_NUMBER> "@coderabbitai autofix"
```
If `COMMENT_FAILED:*`, write state `status=failed`, surface the error, stop.

Record `PRE_BOT_SHA=<HEAD_SHA from Step 1>`.

**Iteration 1, AUTOFIX_MODE=review-only** (§9 intersect or fallback):
```bash
<autofix-helper> trigger-comment <PR_NUMBER> "@coderabbitai review"
```
Skip Step 3c (no bot commit to wait for); jump to Step 3d.

**Iterations 2–4** (always review-only):
```bash
<autofix-helper> trigger-comment <PR_NUMBER> "@coderabbitai review"
```
Skip Step 3c; jump to Step 3d.

### 3c. Wait for bot commit (iteration 1, autofix mode only)

```bash
<autofix-helper> poll-bot-commit <PR_NUMBER> <PRE_BOT_SHA>
```

- If `BOT_COMMIT=<sha>`: record `BOT_SHA=<sha>`.
  - **§9 post-commit re-check:**
    ```
    NEW_FILES=$(gh pr diff --name-only)
    <review-helper> section9-post-check "$NEW_FILES"
    ```
    If `SECTION9_POST_INTERSECT:`, the bot introduced new §9 edits. Hard-fail:
    ```bash
    git revert <BOT_SHA> --no-edit
    git push
    ```
    Write state `status=autofix-section9-revert`. Report: "⚠ CodeRabbit autofix introduced §9-protected edits: <paths>. Commit reverted. Continuing in review-only mode." Set `AUTOFIX_MODE=review-only` for all remaining iterations.

  - **Branch hygiene check:**
    ```
    <review-helper> branch-hygiene --mode=autofix
    ```
    Verify `HYGIENE_OK` is present. If `HYGIENE_FAIL`, stop: "⚠ Replit-Agent commits detected after bot commit. Resolve before continuing."
    Record `AUTOFIX_BOT_COMMIT_COUNT` and `AUTOFIX_BOT_COMMIT_SHA` lines from the output.

- If `BOT_COMMIT_TIMEOUT`: write state `status=autofix-timeout`. Report: "⚠ CodeRabbit autofix timed out (no bot commit after 5 min). Falling back to review-only for remaining iterations." Set `AUTOFIX_MODE=review-only`. Jump to Step 3d — the bot may still post a review.

### 3d. Wait for bot review

Record `REVIEW_TRIGGER_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)` just before polling.

```bash
<autofix-helper> poll-bot-review <PR_NUMBER> <REVIEW_TRIGGER_ISO>
```

If `BOT_REVIEW_TIMEOUT`: write state `status=review-timeout`. Report: "⚠ CodeRabbit review timed out (no new review after 10 min)." Stop the loop.

If `BOT_REVIEW_FOUND`: the review body is saved to `.local/coderabbit-loop/latest-review.txt`.

### 3e. Parse review

```bash
<autofix-helper> parse-review-body
```
Read:
- `ACTIONABLE_COUNT=N`
- `DUPLICATE_COUNT=N`
- `REVIEW_SUMMARY:<text>`

### 3f. Exit check

If `ACTIONABLE_COUNT=0`:
- Run `<autofix-helper> status-rollup <PR_NUMBER>`.
  - If `ROLLUP_PASS`: write state `status=complete-clean`. Report: "✓ Loop complete — zero actionable findings after iteration <N>. All CI checks pass." Stop the loop.
  - If `ROLLUP_PENDING`: report: "Zero actionable findings but CI checks are still running. Wait for checks to settle, then re-invoke to confirm clean state." Write state `status=ci-pending`. Stop the loop.
  - If `ROLLUP_FAIL:`: write state `status=gate-failed`. Surface the failing check names. Stop the loop.

### 3g. Fetch and apply fixes

If findings remain (`ACTIONABLE_COUNT > 0`):

Fetch inline comments:
```bash
gh api repos/<REPO_OWNER>/<REPO_NAME>/pulls/<PR_NUMBER>/comments \
  --paginate --jq '[.[] | select(.user.login | ascii_downcase | contains("coderabbit"))]'
```

For each comment/finding:
1. Read the `body` field (the finding's instruction).
2. Read `path` (file name) and `line`/`position` (line anchor).
3. **§9 pre-filter:** if `path` matches any §9 pattern, print: "⚠ Skipped (§9 protected): <path> — <brief>". Do not apply.
4. **Scope filter:** if `path` is NOT in the PR diff file list, print: "⚠ Skipped (out of scope): <path> — <brief>". Do not apply.
5. **Duplicate-comment filter:** if the review body contains a `♻️ Duplicate comments` block that names this path/line as already resolved (verified on disk), post `@coderabbitai resolve` via `<autofix-helper> trigger-comment <PR_NUMBER> "@coderabbitai resolve"` instead of re-editing.
6. Otherwise: open the file, check the listed line and ±20 lines for stale anchors, apply the fix using the Edit tool. If the fix is already present on disk, skip and note "already applied."

### 3h. Branch hygiene check
```bash
<review-helper> branch-hygiene
```
If `HYGIENE_FAIL`, stop: "⚠ Replit-Agent commits detected. Resolve before continuing."

### 3i. Auto-checkpoint capture guard
Run `git log -1 --format="%ae"`. If the email is `52429710-ricardocidale@users.noreply.replit.com`, the last commit was a Replit auto-checkpoint. Recover:
```bash
git reset --soft HEAD~1
git commit -m "fix(loop-iter-<N>): re-commit after auto-checkpoint capture"
```

### 3j. Gate check
```bash
<review-helper> gate-check
```
If any gate fails, surface the errors and ask the user whether to continue. If user wants to continue, proceed; if not, write state `status=gate-failed` and stop.

### 3k. Push and update state
```bash
git push
<review-helper> write-state current_iteration=<N> status=running
```
Update `HEAD_SHA` to the new head: `git rev-parse HEAD`

### 3l. Next iteration
If iteration < 4, update `REVIEW_TRIGGER_ISO` and continue to Step 3a with N+1.

---

## Step 4 — Final report

If the loop exits because iteration 4 still has findings:
- Run `<autofix-helper> status-rollup <PR_NUMBER>` one final time.
- Write state `status=complete-residual current_iteration=4`
- Report: "Loop capped at 4 iterations. <N> actionable findings remain. CI rollup: <PASS/PENDING/FAIL>."
- Suggest: "Re-invoke `/coderabbit-loop-autofix` to continue, or address remaining findings manually."

Always print the iteration count, total findings resolved, and whether autofix ran on iteration 1.

---
title: "CodeRabbit iterative review loop on Replit Agent: triggering, polling, and clearing stale duplicates"
date: 2026-05-09
category: docs/solutions/workflow-issues
module: development_workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Driving multiple CodeRabbit re-reviews on the same PR from a Replit Agent session
  - Agent has just edited files that the user expects to commit and push
  - A CodeRabbit re-review re-flags findings that the agent already addressed
  - User asks the agent to "trigger CodeRabbit again" or "wait for the verdict"
related_components:
  - tooling
  - documentation
tags:
  - coderabbit
  - github-pr
  - replit-agent
  - auto-checkpoint
  - review-workflow
---

# CodeRabbit iterative review loop on Replit Agent: triggering, polling, and clearing stale duplicates

## Context

Driving CodeRabbit through several rounds of feedback on a single PR from inside a Replit Agent session combines two systems with non-obvious interactions:

1. **Replit Agent auto-commits.** The platform auto-checkpoints file edits into git commits at loop boundaries — the agent does not need to (and frequently cannot) call `git commit` itself. Destructive git ops are sandbox-blocked.
2. **CodeRabbit's GitHub API surface uses snapshot line numbers.** Re-reviews that re-list previously-flagged threads use the **pre-edit** line numbers from when the thread was first opened, even after the file has shifted.

Hitting both in the same loop produced two avoidable confusions in this session: (a) the user ran `git commit` after the agent reported "edits applied" and got `nothing to commit, working tree clean`; (b) a follow-up CodeRabbit review re-listed three findings the agent had already fixed, triggering a tempting (but wasted) re-edit pass.

This doc captures the working pattern and the two gotchas so the next session does not re-derive them.

## Guidance

### 1. Triggering a re-review

Use the GitHub Issues Comments API with the `GITHUB_PAT` secret. CodeRabbit listens for `@coderabbitai review` (case-insensitive) on PR comments:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/<org>/<repo>/issues/<pr-number>/comments" \
  -d '{"body":"@coderabbitai review"}'
```

CodeRabbit typically posts a fresh review within 60–120 seconds. Only trigger a re-review *after* the user confirms the fix commits are pushed to `origin/<branch>` — CodeRabbit reviews `head_sha`, not local state.

### 2. Polling for the verdict

Two endpoints together give the full picture:

- `GET /repos/<org>/<repo>/pulls/<pr>/reviews` — top-level review summaries (`Actionable comments posted: N`, duplicate counts, stat blocks)
- `GET /repos/<org>/<repo>/pulls/<pr>/comments?since=<ISO>` — inline comments anchored to file/line

Filter both by `c['user']['login']` containing `coderabbit`. The `since` param keeps the response small on long-lived PRs.

`sleep 90; curl …` is enough wall time for most reviews. If polling returns no new content, wait another 60s before re-polling — CodeRabbit's queue can spike under load.

### 3. Reading "♻️ Duplicate comments" correctly

When CodeRabbit's review body opens with a `<details><summary>♻️ Duplicate comments (N)</summary>` block, it is **re-listing** prior threads, not opening new ones. Two key behaviors:

- **Line numbers are stale.** A thread opened against `line 117` keeps that anchor even if the file edit shifted that block to `line 125`. Always `read` the current file at *both* the listed line and the likely-new line before assuming the fix is missing.
- **The reviewer often acknowledges partial resolution in prose.** Re-reads of the duplicate body usually contain a phrase like *"Two others (lines 214 and 417) have been correctly fixed since the previous review"* — this is CodeRabbit telling you which fixes landed and which it still believes are missing. Trust the prose over the line numbers.

If verification confirms the fixes did land but CodeRabbit's anchors are stale, do **not** re-edit. Instead, ask the user to allow `@coderabbitai resolve` (or `@coderabbitai pause` then re-trigger after the next push) — see step 4.

### 4. Clearing stale duplicate threads

A PR comment with body `@coderabbitai resolve` tells CodeRabbit to mark addressed threads as resolved on the GitHub UI side, clearing the duplicate noise from the next review. Same API as step 1, just a different body.

This is the right tool when:

- The agent has verified the underlying fix is on disk and pushed
- CodeRabbit's re-review re-lists the thread under "♻️ Duplicate comments"
- The user does not want a fresh full review, only the cleanup

It is the wrong tool when the fix really is missing — `resolve` will hide the thread without addressing the finding.

### 5. The auto-checkpoint commit gotcha

Replit Agent's platform writes `Replit-Helium-Checkpoint-Created: true` commits at loop boundaries that bundle whatever files the agent edited during that loop. By the time the user runs `git commit -F .local/.commit_message`, those edits are usually already on `HEAD`.

**What this means for the agent's workflow:**

- Do not stage commit messages that assume an unstaged working tree. Either (a) tell the user the edits are already committed and they only need `git push`, or (b) write the commit message file but explicitly note "if `git commit` says nothing to commit, the auto-checkpoint already did it — just push."
- Look for the `<checkpoint_created commit_id="…">` automatic-update messages between turns — that confirms the commit happened.
- Auto-checkpoint commit messages are platform-generated and may be vague (e.g., "Update documentation with new details"). They are **not** the message in `.local/.commit_message`. If commit-message quality matters for the PR, the user has to amend manually.

## Why This Matters

Without this pattern, an iterative review loop wastes a turn-or-two per round on the two gotchas. Across 3 rounds that's 4–6 wasted turns per PR — and worse, re-editing on stale line numbers can introduce regressions or churn the diff for the human reviewer. With it, each CodeRabbit round is: trigger → 90s sleep → poll → verify → (fix or resolve). Fully tractable.

The auto-checkpoint piece in particular is non-obvious because most non-Replit dev environments require explicit commits. Future agents working on PRs will hit "nothing to commit, tree is clean" and try to debug it as a tooling failure unless this doc surfaces the cause.

## When to Apply

- Any PR with active CodeRabbit reviews that needs multiple fix rounds
- Agent sessions that involve file edits the user expects to push — even if CodeRabbit is not in the loop, the auto-checkpoint behavior applies
- Debugging "nothing to commit" reports from the user after the agent claims to have edited files
- Interpreting any GitHub PR review API response that uses `original_line` vs `line` (the latter is current-file, the former is at-comment-creation)

## Examples

### Triggering and polling in one shell loop

```bash
# Trigger
curl -s -X POST -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/Norfolk-Group/H-Analytics/issues/48/comments" \
  -d '{"body":"@coderabbitai review"}' >/dev/null

# Wait + poll reviews + inline comments
sleep 90
curl -s -H "Authorization: Bearer $GITHUB_PAT" \
  "https://api.github.com/repos/Norfolk-Group/H-Analytics/pulls/48/reviews" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d[-2:]:
    print(f\"[{r['submitted_at']}] {r['state']}\")
    print((r.get('body') or '')[:300])
"
```

### Disambiguating a stale duplicate

CodeRabbit re-review claims line 117 still needs `text` language tag. Verify before re-editing:

```bash
# Read the file at the claimed line AND the likely shifted location
sed -n '115,140p' docs/plans/2026-05-09-005-feat-agent-native-parity-improvements-plan.md
# If the fix is visibly present (e.g., ```text at line 125), do not re-edit.
# Ask the user to allow @coderabbitai resolve.
```

### The auto-checkpoint message exchange that triggered this doc

> Agent: "Commit and push when ready: `git add -A && git commit -F .local/.commit_message && git push`"
> User: "nothing to commit, tree is clean. Explain that message"
> Agent: "The doc edits I made were already committed automatically — Replit's auto-checkpoint system bundled them into commit `ca58d473` right after I finished editing. You just need to push."

The fix going forward is to phrase the handoff as `git push` alone (or `git push; if anything to commit then commit first`) rather than assuming an unstaged tree.

## Related

- `.local/handoff.md` — current-session state-of-the-world memo capturing this exact PR (#48) loop
- `.agents/ce-agents/REPLIT-ADAPTATION.md` — broader Replit Agent quirks (no worktrees, no `gh` CLI, blocked git ops)
- `replit.md` § "Inviolable Rules" — secrets parity, dev-login server-gating, why the agent cannot directly push

---
title: "Replit IDE auto-checkpoint captures CC's in-progress edits with Replit-Commit-Author header"
date: 2026-05-11
category: integration-issues
module: replit-ide/branch-hygiene
problem_type: integration_issue
component: dev-tooling
severity: medium
symptoms:
  - "CC is editing files in a Claude Code worktree or main workspace"
  - "Before CC commits, a new commit appears on the branch authored by `52429710-ricardocidale@users.noreply.replit.com` with a `Replit-Commit-Author: Agent` header"
  - "The Replit-Agent commit contains some or all of CC's in-progress file changes"
  - "CC's subsequent `git commit` either lands a smaller diff than expected OR fails with `nothing to commit`"
root_cause: replit_ide_auto_checkpoint
resolution_type: soft_reset_recovery
tags: [replit, claude-code, branch-hygiene, attribution, dev-environment]
---

# Replit IDE auto-checkpoint captures CC's in-progress edits

## The behavior

The Replit IDE running in the shared workspace periodically auto-commits all dirty files in the working tree, attributing the commit to the Replit Agent identity (`52429710-ricardocidale@users.noreply.replit.com`) with metadata headers like:

```
Replit-Commit-Author: Agent
Replit-Commit-Session-Id: <uuid>
Replit-Commit-Checkpoint-Type: full_checkpoint
Replit-Commit-Event-Id: <uuid>
Replit-Commit-Screenshot-Url: <url>
Replit-Helium-Checkpoint-Created: true
```

When Claude Code (CC) is mid-edit on the same workspace — having modified files but not yet staged or committed — the auto-checkpoint will capture CC's edits in a Replit-Agent-authored commit. This causes three problems:

1. **Attribution inversion.** Work that CC did gets credited to the Replit Agent. The commit message is a generic Replit Agent summary, not the descriptive commit message CC would have written.
2. **Scope contamination.** The auto-checkpoint may bundle CC's in-progress edits with other unrelated dirty files that happened to be in the workspace at checkpoint time.
3. **Diff confusion at PR review.** Reviewers see a Replit-Agent commit in the middle of a CC PR with code changes that don't match the commit's description, making the PR's intent harder to parse.

## Recovery

When CC notices an auto-checkpoint commit on its branch that contains its in-progress work:

```bash
# 1. Identify the rogue commit
git log --format='%h | %ae | %s' -1     # see if Replit-Agent authored the latest

# 2. Soft-reset to undo the commit while keeping the file changes staged
git reset --soft HEAD~1

# 3. Inspect the staged changes — confirm they're what you expected to commit
git status
git diff --cached

# 4. If desired, also stage any remaining unstaged changes that should have been in your commit
git add <paths>

# 5. Commit cleanly under CC attribution with a proper message
git commit -m "fix(scope): proper descriptive message"

# 6. If the rogue commit was already pushed, force-push (only safe if no reviews have started)
git push --force-with-lease origin <branch-name>
```

## When force-push is NOT safe

- The branch has open PR reviews — force-push removes the commit reviewers were responding to.
- Other contributors have pulled the branch — force-push will conflict with their local state.

In those cases, accept the rogue commit's attribution and add a follow-up commit explaining the situation. This is suboptimal but safer than rewriting shared history.

## Prevention

- **Stage early, commit often.** The auto-checkpoint only captures unstaged + uncommitted changes. CC commits land before the next checkpoint runs.
- **Subagent dispatch prompts can include the warning:** "If you see a commit on your branch you didn't make with a `Replit-Commit-Author: Agent` header, soft-reset and re-commit under CC attribution."
- **Avoid leaving edits dirty across user pauses.** When stepping away or switching tasks, either commit or stash.

## Path-confusion compound effect

When the worktree's `.git` gitdir-pointer file is missing (see `docs/solutions/integration-issues/claude-worktree-gitdir-pointer-missing-2026-05-11.md`), the auto-checkpoint captures edits in the main workspace instead of the intended worktree. This compounds the auto-checkpoint issue with branch-target confusion — the rogue commit can land on `main` (or whatever the main checkout's HEAD points at) rather than the subagent's branch.

Mitigation: reconstruct the gitdir-pointer immediately on worktree entry, before any edits.

## Encountered

- Factory v2 §9 fix on PR #122 — Replit IDE captured the in-progress edits to `minion-self-test-constants.ts` and `scheduler-run-tracker.ts` as commit `44b06e8c` (\"Add constants for automated minion self-testing background jobs\"). Soft-reset + clean re-commit folded the work into a single CC-authored commit `3cd1c4cc`. Branch was force-pushed since no reviews had started.
- Factory v2 U8 subagent dispatch — auto-checkpoint affected the main workspace branch through the gitdir-pointer-missing compound effect. Branch had to be renamed back to its intended target before the orchestrator could push.

## Related

- `docs/solutions/integration-issues/claude-worktree-gitdir-pointer-missing-2026-05-11.md` — the path-confusion bug that amplifies this issue.
- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` — another subagent-prompt discipline learning from the same session.
- CLAUDE.md "CC branch hygiene — Replit agent staging risk" — the canonical statement of the underlying problem (Replit Agent committing to whatever branch is checked out). The auto-checkpoint pattern is a specific instance of this.

---
title: ".claude/worktrees/ gitdir-pointer file missing on subagent / orchestrator entry"
date: 2026-05-11
category: integration-issues
module: claude-code/worktrees
problem_type: integration_issue
component: dev-tooling
severity: low
symptoms:
  - "Inside .claude/worktrees/agent-<id>/, git status reports `On branch main` (or a stale branch) while pwd shows the worktree path"
  - "git commit lands on main (or whatever the main repo's HEAD is) instead of the worktree branch"
  - "Edits to files in the worktree dir don't appear in `git diff` from the worktree's perspective"
root_cause: missing_gitdir_pointer
resolution_type: file_reconstruction
tags: [claude-code, worktrees, git, subagent, isolation, dev-environment]
---

# `.claude/worktrees/` gitdir-pointer file missing on entry

## Symptom

A Claude Code subagent launched with `isolation: "worktree"` (or the orchestrator entering an existing worktree) finds that the per-worktree `.git` file at `<worktree-path>/.git` is absent, even though git's worktree metadata under `<main-repo>/.git/worktrees/agent-<id>/` is intact and `git worktree list` shows the worktree as registered.

Without the `.git` pointer file, `git` commands run from inside the worktree directory fall back to the parent repo, so they operate on the main checkout's branch — not the worktree's branch. Effects: commits land on the wrong branch, file edits don't appear in worktree-scoped diffs, `git branch -m` renames the parent repo's current branch, etc.

## Cause

The Claude Code harness's worktree provisioning sometimes creates the worktree directory and the `git/worktrees/<id>/` metadata but does not write the `<worktree-dir>/.git` file that git needs to associate the working tree with the metadata. Both subagents in the Factory v2 U6/U7 dispatch and the orchestrator entering a worktree to commit a follow-up have hit this.

## Resolution

Reconstruct the pointer file in one line:

```bash
echo "gitdir: /home/runner/workspace/.git/worktrees/agent-<id>" > .git
```

After this, `git status` correctly reports the worktree's branch, and all git operations are isolated. No data is lost because the worktree metadata under the main repo's `.git/worktrees/<id>/` was intact the whole time.

## Detection

Before editing files in a worktree, verify:

```bash
pwd                  # confirms you're in the worktree directory
git branch --show-current   # should show worktree-agent-<id> or your renamed branch
cat .git              # should print "gitdir: /home/runner/workspace/.git/worktrees/agent-<id>"
```

If `cat .git` fails ("No such file or directory") OR `git branch --show-current` shows `main` while pwd shows the worktree path, reconstruct immediately.

## Prevention

Subagent dispatch prompts can include this check as a first action:

```text
Verify worktree state before editing:
  pwd
  ls -la .git || echo "gitdir-pointer missing — reconstruct with:
    echo 'gitdir: /home/runner/workspace/.git/worktrees/<this-agent-id>' > .git"
```

The U7 dispatch prompt already does this; future dispatches should mirror it.

## Encountered

- U6 subagent (PR #120) — did not hit it; gitdir-pointer was present.
- U7 subagent (PR #121) — encountered + reconstructed silently; mentioned in subagent's final report.
- Orchestrator at merge time for U6 — `.git` was absent on cold entry; reconstructed before committing the FIXME.
- U8 subagent (PR not yet open at write time) — appeared to hit the same issue with downstream effects on the orchestrator's branch state.

## Related

- See `docs/solutions/integration-issues/libreoffice-headless-railway-install-2026-05-11.md` for an unrelated environmental issue in the same Factory v2 session.
- `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md` is the work that surfaced this pattern.

---
title: "CC branch hygiene: Replit Agent stages unreviewed commits on CC PR branches"
date: 2026-05-10
category: docs/solutions/workflow-issues
module: cc-replit-branch-hygiene
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - Claude Code creates a PR branch and pushes it to the shared remote repository
  - The Replit Agent is running concurrently in the same workspace
  - A CC PR branch remains on remote while waiting for CI or CodeRabbit review
  - A PR is being prepared for merge and its commit scope needs verification
tags:
  - git-hygiene
  - branch-management
  - cc-replit-collaboration
  - pr-scope
  - cherry-pick
  - agent-coordination
---

# CC branch hygiene: Replit Agent stages unreviewed commits on CC PR branches

## Context

In this monorepo, Claude Code (CC) and the Replit Agent share a live workspace. The Replit Agent commits to whatever branch is currently checked out. When CC creates a fix or feature branch, pushes it to remote, and leaves it open while waiting for CI or CodeRabbit review, the Replit Agent treats the active remote branch as a valid staging target and pushes its own unrelated work onto it. Those commits travel invisibly inside the CC PR's squash merge and ship on `main` under the CC PR's stated title without scoped review of the extra content.

Three successive PRs (#63, #64, #65) hit this pattern. In the most complete instance (PR #65), CC created `fix/coderabbit-64` to fix 8 specific CodeRabbit findings. While CI ran, the Replit Agent pushed 9 files — a new `check-timing-report.ts` tool (213 lines), cache-busting changes to 6 check scripts, output sorting in `check-selective.ts`, and a new `check:timing-report` entry in `scripts/package.json`. The squash commit shipped all 15 files under "fix(coderabbit): 8 findings from PR #64". The extra content was benign, but it shipped without scoped review and its provenance was invisible in the PR description.

## Guidance

**Identify Replit Agent commits by author email, not a special header.** The commits carry no distinguishing git trailer. The two email patterns in this repo:

| Author | Email |
|---|---|
| Claude Code (shell CC) | `ricardo.cidale@norfolkgroup.io` |
| Replit Agent | `52429710-ricardocidale@users.noreply.replit.com` |

**Mandatory pre-merge scope check for every CC PR:**

```bash
# Step 1 — List all commits on the branch with author email
git log origin/main..origin/<branch> --format="%h %ae %s"

# Step 2 — List all files in the branch diff
git diff origin/main...origin/<branch> --name-only
```

If Step 1 shows any line whose email is `52429710-ricardocidale@users.noreply.replit.com`, the branch has Replit Agent commits. Compare Step 2's file list against the PR description. Files outside the stated scope that arrived via Replit commits require explicit handling.

**Cherry-pick workflow when Replit Agent commits are present:**

```bash
# Find CC-only commit SHAs (filter by CC email)
git log origin/main..origin/<branch> \
  --format="%h %ae %s" \
  | grep "ricardo.cidale@norfolkgroup.io" \
  | awk '{print $1}'

# Create a clean branch from main
git checkout -b <branch>-clean origin/main

# Cherry-pick only the CC commits (oldest-first order)
git cherry-pick <cc-sha1> <cc-sha2>

# Push clean branch and open the PR from it
git push -u origin <branch>-clean
gh pr create --title "..." --body "..."
```

**Rule:** Never merge a PR whose diff contains files outside the stated scope without explicitly naming them in the PR description. If the extra files are intentional and benign, acknowledge them: "This PR also includes [X, Y] staged by the Replit Agent — reviewed and in scope."

## Why This Matters

`git log --oneline` hides author email, so the scope violation is invisible unless the reviewer explicitly checks author metadata or scans the full file diff. A squash merge erases the commit-level distinction permanently on `main`. The result is that changes nobody explicitly approved for a given PR become unattributed work on `main` with no review trail.

The practical risk is not malicious — the Replit Agent's additions have been benign. The risk is loss of review discipline: if a Replit Agent commit contained a regression or a magic-number violation, it would ship under the CC PR's stated verification gates (typecheck, check-magic-numbers, tests) without anyone confirming those gates apply to the new files. PR #66 — a `DEFAULT_STAFF_SALARY` shadow declaration fix surfaced by Vito — was merged cleanly in the same session because the scope check was applied immediately after the rule was added.

## When to Apply

- Before merging any CC PR where the branch has been live on remote for more than a few minutes
- Whenever CI takes more than ~2 minutes — this is the primary window where the Replit Agent stages commits
- Before using `gh pr merge --squash` or `gh pr merge --auto` — auto-merge gives no natural pause to run the scope check
- When the PR file count in the CodeRabbit summary is higher than expected
- When `git log origin/main..origin/<branch> --oneline` shows more commits than the CC session authored

## Examples

**Detecting Replit Agent commits on a CC branch:**

```bash
git log origin/main..origin/fix-coderabbit-64 --format="%h %ae %s"
# 3a9f1bc  ricardo.cidale@norfolkgroup.io                              fix(tools): remove duplicate tool registrations
# 7d22a01  52429710-ricardocidale@users.noreply.replit.com  feat(scripts): add timing report tool
# 1f08c44  52429710-ricardocidale@users.noreply.replit.com  fix(check-cache): bust cache on pnpm-lock.yaml
# ↑ Two Replit Agent commits on what should be a CC-only fix branch
```

**Confirming the file scope matches the scope violation:**

```bash
git diff origin/main...origin/fix-coderabbit-64 --name-only
# artifacts/api-server/src/routes/tools.ts        ← CC commit (in scope)
# scripts/src/check-timing-report.ts              ← Replit Agent (out of scope)
# scripts/src/check-magic-numbers.ts              ← Replit Agent (out of scope)
# ...
```

**Clean-branch cherry-pick in practice:**

```bash
# Only CC commit: 3a9f1bc
git checkout -b fix-coderabbit-64-clean origin/main
git cherry-pick 3a9f1bc
git push -u origin fix-coderabbit-64-clean
gh pr create --title "fix(coderabbit): 8 findings from PR #64"
# git diff origin/main...origin/fix-coderabbit-64-clean --name-only
# now shows only the CC-authored file — scope is clean
```

**Acknowledging benign out-of-scope files instead of cherry-picking:**

When the Replit Agent's additions are small and harmless, acknowledge them explicitly in the PR description rather than cherry-picking:

```
## Scope note
This PR also includes 3 script files staged by the Replit Agent
(check-timing-report.ts, check-selective.ts sort order, package.json entry).
Reviewed and safe to ship alongside the CodeRabbit fixes.
```

## Related

- `CLAUDE.md` § "CC branch hygiene — Replit agent staging risk" — the live enforcement rule (added PR #67, 2026-05-10)
- `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` — covers the Replit auto-checkpoint mechanism that enables this staging pattern
- `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md` — the existing pre-merge gate sequence that the new scope-check gate extends

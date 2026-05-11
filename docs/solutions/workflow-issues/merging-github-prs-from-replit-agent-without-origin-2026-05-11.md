---
title: "Merging GitHub PRs from Replit Agent when the local repo has no GitHub remote"
date: 2026-05-11
category: workflow-issues
module: development_workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "The Replit project's git remote does not point at the GitHub repo (or has no remote at all)"
  - "An external agent (Claude Code, a teammate) has pushed PRs to the GitHub repo and the user asks the Replit Agent to merge them"
  - "`gh` CLI is unavailable (Replit Agent sandbox blocks it) but `GITHUB_PAT` is in environment secrets"
  - "The repo's owner/name is not obvious from local config and you need to discover it"
tags:
  - github
  - pr-merge
  - replit-agent
  - github-pat
  - rest-api
related_components:
  - tooling
  - authentication
---

# Merging GitHub PRs from Replit Agent when the local repo has no GitHub remote

## Context

Replit Agent sessions often run on a `main` branch that is not wired to any GitHub remote — the platform manages commits via checkpoints, not via `git push`. When an external agent (commonly Claude Code working in a separate worktree on the user's laptop) has pushed PRs to the GitHub repo, the user expects the Replit Agent to be able to "go merge those PRs."

Three things conspire against the obvious approach:

1. **No `gh` CLI.** The Replit Agent sandbox does not include the GitHub CLI. `gh pr merge` is not an option.
2. **No origin to `git pull` from.** Even if you knew the repo, `git push` and most write-side `git` operations are blocked by the sandbox, so a "pull then merge then push" loop is not available.
3. **The repo identity is not obvious.** `git remote -v` returns nothing useful, and the directory name (`workspace/`) does not encode owner/name.

What does work: the GitHub REST API, called with `curl` and the `GITHUB_PAT` secret.

## Guidance

**Step 1 — Discover the repo via the search API, not by guessing.**

The `GITHUB_PAT` belongs to a user; that user has access to a finite set of repos. Use the issues search endpoint (which returns repository metadata) instead of trying to guess the org/name:

```bash
curl -s -H "Authorization: Bearer $GITHUB_PAT" \
  "https://api.github.com/search/issues?q=type:pr+state:open+author:@me" \
  | jq -r '.items[].repository_url' | sort -u
```

The `repository_url` values reveal which repos the PAT owner is active on. Pick the one that matches the project (here: `Norfolk-Group/H-Analytics`).

**Step 2 — List open PRs.**

```bash
OWNER=Norfolk-Group; REPO=H-Analytics
curl -s -H "Authorization: Bearer $GITHUB_PAT" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls?state=open" \
  | jq -r '.[] | "\(.number)\t\(.title)\t\(.head.ref) → \(.base.ref)"'
```

**Step 3 — Squash-merge each PR.**

```bash
PR=110
curl -s -X PUT \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/$PR/merge" \
  -d '{"merge_method":"squash"}' \
  | jq '{merged, sha, message}'
```

A successful response returns `{ "merged": true, "sha": "<commit-sha>", "message": "Pull Request successfully merged" }`. Confirm by re-listing open PRs (count should drop).

**Step 4 — Tell the user the SHAs you merged.**

The Replit Agent's local `HEAD` is now behind `origin/main`. The user typically reconciles this on their laptop (or via the `inspect-cc-github-divergence` task pattern). Reporting the merged SHAs makes that next step explicit.

## Why This Matters

- **No reflexive "let me try `gh` first" turn wasted.** `gh` is not installed; trying it costs a turn and returns the same answer every time.
- **No guessing the repo from the directory name.** The search-API discovery is two seconds and unambiguous.
- **No silent failure.** The merge endpoint returns `merged: true/false` explicitly. Compare to `gh pr merge`, which exits non-zero on the same kind of failure but with less structured output.
- **Auditable.** The merge SHAs returned by the API are what the user needs to fetch on their laptop to reconcile.

## When to Apply

- Any time the user says "merge that PR / merge all the PRs / clean up the PR queue" and the Replit Agent doesn't already have a working `git remote` for GitHub.
- Any time you're tempted to ask "what's the GitHub repo?" — try the search API first.
- Any time `gh` would be the obvious tool but you're inside a Replit Agent sandbox.

## Examples

**Discovering the repo and merging two PRs in one shell call:**

```bash
GITHUB_PAT_HEADER="Authorization: Bearer $GITHUB_PAT"
ACCEPT="Accept: application/vnd.github+json"

# 1. Discover repo
REPO_URL=$(curl -s -H "$GITHUB_PAT_HEADER" \
  "https://api.github.com/search/issues?q=type:pr+state:open+author:@me" \
  | jq -r '.items[0].repository_url')
OWNER_REPO=${REPO_URL#https://api.github.com/repos/}

# 2. List open PRs
curl -s -H "$GITHUB_PAT_HEADER" \
  "https://api.github.com/repos/$OWNER_REPO/pulls?state=open" \
  | jq -r '.[] | "\(.number) \(.title)"'

# 3. Squash-merge each
for PR in 110 111; do
  curl -s -X PUT -H "$GITHUB_PAT_HEADER" -H "$ACCEPT" \
    "https://api.github.com/repos/$OWNER_REPO/pulls/$PR/merge" \
    -d '{"merge_method":"squash"}' \
    | jq "{pr: $PR, merged, sha}"
done
```

## Related

- `docs/solutions/workflow-issues/coderabbit-iterative-review-loop-on-replit-agent-2026-05-09.md` — driving CodeRabbit re-reviews from the same kind of session
- `.local/tasks/inspect-cc-github-divergence.md` — read-only inspection pattern for reconciling Replit Agent ↔ GitHub
- `.agents/ce-agents/REPLIT-ADAPTATION.md` § "No GitHub CLI (`gh`)"

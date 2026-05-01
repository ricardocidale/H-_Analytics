---
title: Git worktree parallel agents commit to worktree-relative paths, not project root
date: 2026-05-01
category: workflow-issues
module: git-worktrees
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Dispatching multiple CE agents in parallel worktrees
  - Using Agent tool with isolation:worktree
  - Expecting worktree commits to land in canonical project paths
tags:
  - git-worktree
  - parallel-agents
  - ce-agents
  - path-isolation
  - agent-orchestration
---

# Git worktree parallel agents commit to worktree-relative paths, not project root

## Context

When CE agents are dispatched with `isolation: "worktree"` or into manually-created worktrees under `.claude/worktrees/agent-*/`, their `git add` and `git commit` record file paths relative to **the worktree root**, not the main project root.

This means a commit from `agent-ac4c14f451ad43331` adding `lib/db/src/schema/properties.ts` actually records the path as:

```
.claude/worktrees/agent-ac4c14f451ad43331/lib/db/src/schema/properties.ts
```

That path is committed into the main git object store but points to a location **inside** the `.claude/worktrees/` subtree — not the canonical project path. The live project file is untouched.

## Guidance

There are two valid strategies for orchestrating parallel worktree agents:

### Strategy A: Orchestrator applies changes directly (recommended for CC-lane work)

The orchestrator agent holds the durable changes. After receiving text from worktree agents (diffs, new file contents, etc.), the orchestrator writes to the **main workspace** using the standard Write/Edit tools. No worktree commit ever claims to be in the project root.

```
Orchestrator (main workspace)
  → dispatches Agent 1 (worktree) — returns text diff
  → dispatches Agent 2 (worktree) — returns text diff
  → applies diffs to main workspace files
  → commits once with all changes
```

### Strategy B: Copy from worktree directories after agents commit

If agents have already committed to their worktrees, extract by copying files manually from `.claude/worktrees/agent-*/` into the project:

```bash
# Read the path mapping from git show --name-status <commit>
# Then copy each file, stripping the worktree prefix:
cp .claude/worktrees/agent-ac4c14f451ad43331/lib/db/src/schema/properties.ts \
   lib/db/src/schema/properties.ts
```

When two agents both created the same filename with different content (e.g., `apply-0030.mjs`), resolve the naming conflict before copying — rename one to avoid overwriting the other.

## Why This Matters

Without awareness of this pattern, the orchestrator may:

- Believe changes have landed on main (commits exist in `git log`) when project files are actually unchanged
- Silently lose one agent's work when two agents create the same file
- Spend time debugging "why isn't the server seeing the schema change?" when the schema file was never modified in the real project tree

The `git show <commit> --name-status` command reveals the actual paths in a commit and is the fastest way to diagnose whether a worktree commit landed in the right place.

## When to Apply

- Any time the task summary says "committed in worktree" for a CC agent
- After parallel agents complete: run `git show <commit> --name-status` on each agent's commit to verify paths before declaring the work done
- When you see `git log lib/db/some/file.ts` returns a commit, but `git show <commit>:lib/db/some/file.ts` fails with "not in tree" — the commit touched the worktree path, not the project path

## Examples

**Detecting the problem:**

```bash
git show a337d0f7 --name-status
# Shows:
# M  .claude/worktrees/agent-ac4c14f451ad43331/lib/db/src/schema/properties.ts
# ← NOT: lib/db/src/schema/properties.ts
```

**Verifying a file is in the commit (vs worktree copy):**

```bash
git show <commit>:lib/db/src/schema/properties.ts
# fatal: path 'lib/db/src/schema/properties.ts' exists on disk, but not in '<commit>'
# → The file in the commit lives under .claude/worktrees/..., not the project root
```

**Resolving a filename conflict between two agents:**

Agent 2 created `lib/db/script/apply-0030.mjs` (waterfall DDL script).
Agent 3 also created `lib/db/script/apply-0030.mjs` (migration pre-mark script).
Resolution: keep the first agent's name; rename the second to `apply-0030-phase-c-premark.mjs`.

## Related

- `.agents/skills/ce-worktree/SKILL.md` — the CE worktree skill, which describes the isolation model
- `lib/db/script/apply-0030.mjs` and `apply-0030-phase-c-premark.mjs` — the files that triggered this discovery

# Operating Mode — Large-repo Shell + CodeRabbit + Compound

## What this is + when it applies

A behavioral operating mode for a coding agent working in this repo through the
Replit Shell, using Every's Compound Engineering (CE) skills as the outer loop
and CodeRabbit as the inner review loop. It codifies small-batch, scope-narrow
work so a large pnpm monorepo stays reviewable.

It is **off by default**. Turn it on per-clone with the toggle below when you
want a session (and its workflows) to be bound by it. When it is off, this repo
behaves exactly as it does today.

This document is doc-only. The companion task wires up the scripts, the
workflow banner, and the `.coderabbit.yaml` integration described in the
*Toggle contract* section below.

---

## Toggle: ON / OFF / current state

```bash
# Turn ON
mkdir -p .local/opmode && touch .local/opmode/active

# Turn OFF
rm -f .local/opmode/active

# Show current state
test -f .local/opmode/active && echo ON || echo OFF
```

State lives in `.local/opmode/active` (presence = ON, absence = OFF). The
`.local/opmode/` directory is gitignored, so toggle state is per-clone and
never ships in commits.

For non-shell contexts (e.g., a workflow command line that needs to read the
toggle without touching the filesystem), the equivalent signal is the env var:

```bash
export OPMODE_LARGE_REPO_SHELL=1   # ON
unset OPMODE_LARGE_REPO_SHELL      # OFF
```

**Resolution order:** either signal counts as ON. The marker file is checked
first; the env var is the fallback. If both are absent, the mode is OFF.

### Toggle contract (binding for the companion task)

The companion task (Task #1386) implements the behaviors gated by this toggle.
This section is the contract those behaviors must respect — wording is
deliberately precise.

| Field | Value |
|---|---|
| Marker file | `.local/opmode/active` |
| Marker semantics | File present = ON; file absent = OFF |
| Env var | `OPMODE_LARGE_REPO_SHELL=1` |
| Env var semantics | Value `1` = ON; unset or any other value = OFF |
| Resolution order | Marker file first; env var as fallback. Either signal ON ⇒ mode ON |
| State scope | Per-clone, per-shell. Never committed |

**Behaviors the companion task must gate behind the toggle:**

1. **Workflow start banner.** When any artifact workflow boots with the toggle
   ON, it prints a short banner naming this operating mode and pointing at this
   doc. When the toggle is OFF, no banner prints — workflows behave exactly as
   they do today.
2. **`pnpm review:uncommitted`** — runs CodeRabbit on the current uncommitted
   diff (smallest scope first). When OFF, the script exits 0 with a single
   line: `operating mode is OFF`.
3. **`pnpm review:branch`** — runs CodeRabbit against the default branch base
   for the current branch's full diff. Same OFF semantics.
4. **`pnpm review:scoped <dir>`** — runs CodeRabbit limited to a directory
   (the `--dir`-style scope reduction). Same OFF semantics.
5. **`pnpm validate:scoped <package-or-dir>`** — runs the canonical
   `pnpm run check:*` set scoped to the affected package or directory (lint +
   typecheck + magic-numbers at minimum). Same OFF semantics.
6. **Agent-binding.** When ON, agent sessions in this repo treat the
   *Source prompt (verbatim)* section below as binding instructions in addition
   to the standing rules in `CLAUDE.md` and `replit.md`. When OFF, only the
   standing rules apply.

The companion task must not introduce any other behavior gated by this toggle
without amending this contract first.

---

## How this maps to our repo

This repo is a **pnpm monorepo** (`pnpm-workspace.yaml`) with `artifacts/*`
deployable apps and `lib/*` shared libraries. Long-running services run as
Replit **workflows**, not via root-level `pnpm dev`. The operating mode's
"inspect monorepo tooling" step is therefore pre-answered:

- Package manager: `pnpm` (catalog pinned in `pnpm-workspace.yaml`).
- Monorepo tooling: pnpm workspaces + per-package `tsconfig.json` (lib
  packages composite, artifacts/scripts leaf with `--noEmit`).
- Run/preview: `restart_workflow <artifact-name>` — never `pnpm dev` at the
  root. See the `pnpm-workspace` skill, "Common pitfalls".
- Default validation surface: the canonical `pnpm run check:*` scripts listed
  below.

### Skill mapping (route into existing CE skills, do not compete with them)

| Operating-mode step | CE skill that owns the work |
|---|---|
| Plan: restate task, inspect repo, identify files & success criteria | `ce-plan` |
| Execute: small safe changes in batches, one sub-task at a time | `ce-work` |
| Review: human/architect review of the changeset before PR | `ce-code-review` |
| Inner review loop: CodeRabbit findings → fix → re-review | `ce-resolve-pr-feedback` |
| Compound: capture recurring patterns and learnings into `docs/solutions/` | `ce-compound` |
| Commit + push + PR description with adaptive depth | `ce-commit-push-pr` |

Every CE skill in this repo carries a banner pointing at
`.agents/ce-agents/REPLIT-ADAPTATION.md`. **Future sessions running this
operating mode must read both the relevant CE skill and `REPLIT-ADAPTATION.md`
before acting.** The adaptation file maps Claude-Code-only tool names
(`AskUserQuestion`, `Task`, etc.) onto Replit equivalents (`user_query`, the
`delegation` skill, `restart_workflow`, etc.) and is the single source of
truth for those mappings.

### Canonical scoped-validation surface

Use these existing scripts as the targeted-validation commands the operating
mode prescribes. Do not invent new ones.

```text
pnpm run check:lint                  # ESLint across the workspace
pnpm run check:lint:libs             # ESLint for lib/* only
pnpm run typecheck                   # full pipeline (libs build → leaf checks)
pnpm --filter @workspace/scripts run check:magic-numbers
pnpm --filter @workspace/scripts run check:schema-drift
pnpm --filter @workspace/scripts run check:replit-independence
pnpm --filter @workspace/scripts run check:direct-run-guards
pnpm --filter @workspace/scripts run check:migration-guards
pnpm --filter @workspace/scripts run check:production-image
pnpm --filter @workspace/scripts run check:spinner-contrast
pnpm --filter @workspace/scripts run check:taxonomy-mirror
pnpm --filter @workspace/scripts run check:types-mirror
pnpm --filter @workspace/calc   run test
```

For a single package, prefer `pnpm --filter @workspace/<slug> run typecheck`
over `build` (build needs workflow-provided `PORT` and `BASE_PATH`).

### Where this operating mode is stricter than the source prompt

The verbatim source prompt below is preserved unchanged for fidelity, but a
few of its lines are weaker than this repo's standing rules. When they
disagree, the standing rules win.

- **"Avoid `any` unless clearly justified"** — this repo is stricter. See
  `CLAUDE.md` § 1 (No Hardcoded Values gate) and the `no-magic-numbers` and
  `hplus-variable-taxonomy` skills. Numeric literals AND integration
  identifiers (LLM model names, API/MCP slugs, endpoint URLs) are forbidden
  outside their sanctioned homes — a stricter constraint than "avoid `any`".
- **"Preserve existing logging and error handling patterns"** — this repo
  forbids `console.log` in server code outright. Use `req.log` in route
  handlers and the singleton `logger` elsewhere. See the `pnpm-workspace`
  skill, "Logging".
- **"Avoid changing `.replit` or deployment settings unless necessary and
  approved"** — this repo bans certain operations entirely. Never run
  `git commit`, `git push`, `git checkout`, `git rebase`, `git worktree`,
  `bun`, or `gh` from the agent shell. Workflow restarts go through
  `restart_workflow`, not raw shell. See `replit.md` § "Run & Operate" and
  the `pnpm-workspace` skill, "Proxy & service routing".
- **"Detect the actual default branch"** — the default branch is `main`.
  Do not branch off other refs without an explicit instruction.

---

## Reverting to today's behavior

To return the repo to its current behavior at any time:

```bash
rm -f .local/opmode/active
unset OPMODE_LARGE_REPO_SHELL
```

When the toggle is OFF:

- No workflow banner is printed at workflow start.
- `pnpm review:uncommitted`, `pnpm review:branch`, `pnpm review:scoped`, and
  `pnpm validate:scoped` exit 0 with `operating mode is OFF` and do nothing.
- Agent sessions are bound only by `CLAUDE.md`, `replit.md`, and the standing
  skills — the *Source prompt (verbatim)* section below is informational only.

The only on-disk artifact created by enabling the mode is the marker file
`.local/opmode/active`. Removing it (or just deleting `.local/opmode/`)
returns the repo to a clean, today's-behavior state. The marker path is
gitignored, so there is nothing to revert in version control.

---

## Source prompt (verbatim)

The text below is preserved exactly as pasted by the project owner. Where it
disagrees with the standing rules above, the standing rules win.

```text
You are my autonomous coding agent running inside Claude Code in the Replit Shell for a large repository.

Environment:
- Interface: Claude Code in Replit Shell
- Workspace host: Replit
- Workflow layer: Every’s Compound Engineering plugin/skills
- Review gate: CodeRabbit
- Repo profile: large codebase, many directories, potentially expensive reviews
- Preferred operating style: inspect repo -> plan -> implement -> review -> fix -> repeat

Mission:
Implement requested changes safely in a large repo by working in small scoped batches, reviewing only the relevant diff, and repeating until the changed code has no remaining critical or major issues.

Core workflow:
Use Compound Engineering as the outer loop:
Plan -> Execute -> Review -> Compound -> Repeat

Use CodeRabbit as the inner review/fix loop:
Implement -> review scoped changes -> fix -> review again

Shell-first rules:
1. Assume all work happens through the shell unless I explicitly ask to use a different interface.
2. Prefer terminal commands, existing package scripts, and repo tooling over IDE-like assumptions.
3. Inspect the repository before acting:
   - list top-level files and directories
   - inspect package.json or equivalent manifests
   - identify framework, package manager, monorepo tooling, test runner, lint, typecheck, and build commands
4. Before editing code, summarize:
   - task objective
   - impacted subsystem/package/app/service
   - likely files to change
   - risks
   - assumptions
   - execution plan
5. Keep changes localized. Do not refactor unrelated files.
6. After each meaningful batch of edits, run a CodeRabbit review on the current diff and wait for results before the next fix batch.
7. Repeat until CodeRabbit reports no critical or major issues in the changed code.
8. After each full cycle, record concise compound learnings for future tasks.

Large-repo operating rules:
1. Never treat the whole repository as the task.
2. First identify the smallest affected subsystem, app, package, service, or directory.
3. Break large requests into sub-tasks with explicit scope boundaries.
4. Review only the currently changed scope whenever possible.
5. Prefer multiple small CodeRabbit passes over one massive review.
6. Keep diffs narrow, staged logically, and easy to validate.
7. Do not wander into adjacent cleanup unless I explicitly approve it.
8. If a review payload is too large, reduce scope immediately instead of retrying the same broad review.
9. Prefer package-level or directory-level review and validation over repo-wide commands during iteration.

Repository discovery behavior:
Before coding:
- inspect top-level directories
- identify monorepo tooling if present (turbo, nx, pnpm workspaces, yarn workspaces, lerna, rush, justfile, makefile, etc.)
- identify package manager
- identify package/app boundaries
- identify lint, typecheck, test, and build scripts for the affected area
- identify the likely default branch
- identify the smallest reviewable directory for this task

Planning behavior:
For each task, produce:
- objective
- affected subsystem(s)
- files likely to change
- risks
- commands to validate changes
- proposed sub-task sequence
- recommended CodeRabbit review scope for each sub-task

Execution behavior:
- implement only one sub-task at a time
- after each sub-task, run validation for that area only
- then run CodeRabbit on the smallest possible scope
- only move to the next sub-task after the current one is clean or explicitly accepted with known follow-ups

CodeRabbit rules:
Preferred order of review:
1. /coderabbit:review uncommitted
2. if needed, /coderabbit:review --base <default-branch>
3. final broader validation only when the scoped batches are clean

If plugin review is unavailable, fall back to CLI behavior.

For CLI-style review in a large repo:
- prefer uncommitted review of current changes
- if payload is too large, reduce scope by directory
- use --dir to limit review scope when supported
- do not ask CodeRabbit to review the whole repo
- detect the actual default branch and use it instead of main if different

CLI/plugin fallback rules:
1. First preference: Claude Code native plugin review commands.
2. If plugin is unavailable, check CLI availability.
3. If needed, instruct me to run:
   coderabbit auth status
   coderabbit auth login
4. If installation is missing, tell me the exact install/auth gap before continuing.
5. If using CodeRabbit CLI directly, prefer reviewing uncommitted changes first.

Compound Engineering behavior:
For every task:
- Plan:
  restate the task, inspect the repo, identify relevant files, constraints, and success criteria
- Execute:
  make small safe changes in batches
- Review:
  run CodeRabbit plus the repo’s lint/typecheck/tests where available
- Compound:
  write a short note capturing:
  - recurring review issues
  - repo-specific patterns
  - fixes that worked well
  - suggestions rejected and why
  - commands that worked for targeted validation
  - things to avoid next time
  - follow-up risks outside current scope
- Repeat until the task is clean

Checklist format for each CodeRabbit pass:
- id
- severity
- file
- line range
- subsystem/package
- issue summary
- root cause
- planned fix
- status: todo | doing | fixed | skipped
- skip reason if skipped

Priority order:
1. Critical
2. Major
3. Medium
4. Minor only if trivial and low-risk

Required validation after each fix batch:
- run or recommend the repo’s targeted lint command
- run or recommend the repo’s targeted typecheck command
- run or recommend targeted tests for changed code
- run package-local build if relevant
- include failures in the checklist if they block completion
- if only repo-wide scripts exist, note that explicitly before running expensive commands
- if the repo has no script for one of these, say that explicitly

Safety stop conditions:
Ask me before making:
- cross-package refactors
- schema or migration changes
- auth or permissions changes
- billing or payment changes
- breaking API contract changes
- significant build, deployment, or runtime config changes
- environment variable changes
- behavior changes that alter user-facing product decisions
- touching unrelated packages “while we are here”

TypeScript / React / Node standards:
- prefer explicit types and narrow interfaces
- avoid any unless clearly justified
- preserve existing React patterns and hook usage
- preserve existing framework and folder conventions
- validate backend inputs consistently
- preserve existing logging and error handling patterns
- update tests when changing non-trivial behavior
- avoid architecture churn and broad renames in large repos

Replit shell awareness:
- use existing scripts from package.json, turbo, nx, makefile, justfile, or language-specific equivalents
- tell me whether preview/run behavior depends on Replit’s Run button or a shell command
- avoid changing .replit or deployment settings unless necessary and approved
- assume preview may be available separately, but shell is the command authority
- when possible, show the exact shell commands you plan to run before executing them

Reporting after each loop:
1. current sub-task
2. changed files and subsystem
3. CodeRabbit findings by severity
4. checklist progress
5. targeted validation status
6. compound learnings captured
7. next smallest safe step

Default autonomous behavior:
If I say “build this,” “fix this,” “implement this,” or “review this,” automatically:
1. inspect repo structure
2. identify the smallest affected subsystem
3. break work into sub-tasks
4. implement the first sub-task only
5. run targeted validation
6. run /coderabbit:review uncommitted
7. create checklist
8. fix issues by severity
9. rerun targeted review
10. repeat until the current sub-task is clean
11. continue to the next sub-task
12. only near the end, run broader final validation

Initialization response:
When you adopt this mode, respond exactly with:
Large-repo Shell CodeRabbit + Compound loop armed.
Then list:
- detected repo shape
- missing prerequisites
- recommended first scoped task
```

---

## Local CodeRabbit findings → `ce-resolve-pr-feedback`

Task #1386 wires the inner-loop plumbing for this mode. With the toggle ON, four root `pnpm` scripts and a workflow start banner become active; with the toggle OFF, every piece no-ops with `operating mode is OFF — …` and exits 0.

**Scripts** (all toggle-aware, all backed by `scripts/coderabbit-review.sh`):

- `pnpm review:uncommitted` — `coderabbit review --type uncommitted` against the working tree.
- `pnpm review:branch` — `coderabbit review --base origin/<default>` (default branch auto-detected).
- `pnpm review:scoped <dir>` — same as `review:uncommitted` but chdir'd into `<dir>`. Use this when the broad payload is too large.
- `pnpm validate:scoped <pkg>` — `pnpm --filter <pkg> run typecheck && pnpm --filter <pkg> run lint`.

**Banner** — `scripts/print-opmode-banner.sh` is wrapped into the dev `run` command of three artifact tomls (`api-server`, `hospitality-business-portal`, `mockup-sandbox`). It prints a fixed plain-text reminder of the four scripts on workflow start when the toggle is ON, and exits 0 silently when OFF. The 13 `check:*` workflows are intentionally NOT wrapped.

**Feeding findings into `ce-resolve-pr-feedback`** — capture the CLI output from `pnpm review:uncommitted` (e.g. `pnpm review:uncommitted | tee .local/coderabbit-findings.txt`), then trigger `ce-resolve-pr-feedback` per its SKILL.md and supply the captured findings as the source. The skill evaluates each finding's validity, fixes the valid ones in parallel, and leaves a justification trail for any deliberately not-fixed. Re-run `pnpm review:uncommitted` afterwards to confirm zero remaining findings.

**Operator runbook:** `docs/runbooks/coderabbit-shell-workflow.md` — toggle ON/OFF/revert, install, auth, four-script reference, decision flow, expected banner log lines, smoke test.

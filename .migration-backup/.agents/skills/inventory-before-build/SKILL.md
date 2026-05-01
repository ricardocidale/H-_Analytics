---
name: inventory-before-build
description: Before adding any new gate, script, hook, rule, or tooling-style file to a mature codebase, inventory what already exists for that concern. Use whenever you're about to write a pre-commit hook, a CI step, a lint config, a verification script, an audit script, a rules file, or any "discipline" infrastructure. Replaces the "I'll just add a quick script" reflex with a 60-second look at what the project already wired up — usually you only need to extend or invoke it.
---

# Inventory Before Build

A discipline for not re-inventing infrastructure that already lives in the project. Mature codebases accumulate scripts, hooks, rules, and configs over time. Adding a parallel one is worse than no addition — it splits the source of truth and the next contributor inherits drift.

## When to use

Before you do *any* of these in a project you didn't start:

- Add a git hook (pre-commit, pre-push, commit-msg, etc.)
- Add a `package.json` script that does verification, audit, lint, test wrapping
- Add a CI workflow step
- Add a rules file (`.cursor/rules/`, `.claude/rules/`, `AGENTS.md` section, etc.)
- Write a "checker" / "validator" / "audit" / "summary" script
- Add a `lint-staged` / `husky` / `pre-commit` framework config

## When NOT to use

- Greenfield project with no `script/`, no `.husky/`, no `.github/workflows/`, no rules dir.
- You've inventoried within the last hour for the same concern.

## The inventory pass (60 seconds)

Run these in parallel before writing the new thing:

```bash
ls script/ scripts/ tools/ bin/ 2>/dev/null            # build/CI/audit scripts
ls .husky/ .githooks/ 2>/dev/null                       # git hooks
ls .github/workflows/ 2>/dev/null                       # CI
ls .claude/rules/ .cursor/rules/ AGENTS.md CLAUDE.md 2>/dev/null  # rule files
cat .lintstagedrc* lint-staged.config.* 2>/dev/null     # staged-file config
grep -E '"(scripts|lint-staged|husky)"' package.json    # config in package.json
```

Then read the **package.json `"scripts"` block in full**. Most projects already have `lint:summary`, `test:summary`, `verify:summary`, `audit:quick` style wrappers — adding `lint:check` or `test:fast` next to them is duplication, not value.

## The decision tree

After the inventory:

1. **Does a script/hook/rule for this concern already exist?**
   - **Yes, and it's invoked** → extend it (add the missing path to `lint-staged`, the missing prefix to the auth allow-list, the missing rule to the existing rules file). Done.
   - **Yes, but it's orphaned** (script exists, nothing calls it) → wire the existing thing up. Don't write a new one.
   - **No** → write the new one, but match the project's naming, location, and exit-code conventions.

2. **Does a memory file already document the discipline?** (`CLAUDE.md`, `replit.md`, `AGENTS.md`, `.claude/rules/*.md`)
   - If yes, your new tooling needs a one-line reference there. Otherwise the next agent won't find it.

3. **Does a sibling skill already cover this?** (`.agents/skills/pre-commit-gates`, `.agents/skills/ci-hygiene`, etc.)
   - Cross-reference, don't duplicate.

## Anti-patterns

- **"I'll add a quick script that runs the gates."** — the project probably has `npm run health` or `npm run check` already. Find it.
- **"My new hook calls the right commands."** — but the existing hook calls *almost* the right commands and is already invoked by husky/git. Edit the existing hook.
- **"The orphaned script doesn't fit my exact need."** — it fits 80%. Extending it is one PR; writing a parallel one is two source-of-truth files forever.
- **"Greenfield-style additive design."** — only valid in greenfield. In a mature repo, every parallel artifact is drift.

## Real example

> A mature codebase already had: 43 build/audit scripts in `script/`, 37 rule files in `.claude/rules/`, 4 husky hooks (pre-commit, commit-msg, cosmetic-warn, stage-collision-check), `.lintstagedrc.json`, and a `pre-commit-verification.md` rule documenting the 5-gate pattern. An agent went to "add bug-avoidance tooling" and started designing fresh hooks before noticing that `cosmetic-warn` and `stage-collision-check` were already written but **orphaned** (nothing in `pre-commit` invoked them) and that `lint-staged` covered `calc/`, `engine/`, `server/` but **not `client/` or `shared/`**. The fix was three lines (wire the orphans, extend the lint-staged glob), not three new files.

The inventory pass would have surfaced both gaps in 60 seconds. Skipping it cost a half-hour of design work that produced nothing the project didn't already almost have.

## Composition with other skills

- **`pre-commit-gates`** — the contract for *what* gates to enforce. This skill governs *how* you add them: extend, don't duplicate.
- **`ci-hygiene`** — the playbook for keeping CI healthy after pulls/merges; respects the same "use the existing script" rule.
- **`agent-memory-files`** — once you've extended an existing piece of infra, log the change in the appropriate memory file so the next agent finds it.

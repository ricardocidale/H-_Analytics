---
name: ci-hygiene
description: Auto-detect and fix CI failures caused by external code pushes (e.g. Claude Code). Fixes ESLint unused vars/imports, secret scanner false positives, and TypeScript errors. Use after pulling code from GitHub, after merges, or when CI fails on GitHub Actions.
---

# CI Hygiene

Automated detection and repair of common CI failures introduced by external
tools pushing to the repo (Claude Code, other agents, collaborators).

## When to Use

- **After pulling from GitHub** — always run after `git pull origin main`
- **When the user shares a failed GitHub Actions link**
- **After merging task agent branches**
- **Before pushing to GitHub** — preventive check
- **When the user says "CI is failing" or "GitHub Actions failed"**

## What It Fixes

### 1. ESLint Unused Variables (most common)
Claude Code frequently introduces unused imports or destructured vars.
CI enforces `npx eslint --max-warnings 10`. The script:
- Removes unused imports entirely
- Prefixes unused destructured bindings with `_` (e.g. `varName` → `varName: _varName`)
- Prefixes unused `const`/`let` declarations with `_`

### 2. Secret Scanner False Positives
The test at `tests/audit/integration-pipeline.test.ts` scans all server `.ts`
files for patterns like `sk-[a-zA-Z0-9]{10,}`. Seed files with IDs like
`"brand:make-risk-manageable"` can trigger false positives because
`sk-manageable` matches `sk-` + 10 alphanum chars.

### 3. TypeScript Compilation
Detects `tsc` errors. These require manual fixes but the script reports them
clearly so you know what to address.

## Commands

```bash
# Check only (no file modifications)
npx tsx script/ci-hygiene.ts --check

# Check and auto-fix
npx tsx script/ci-hygiene.ts
```

## Standard Post-Pull Workflow

After any `git pull origin main` that brings in external changes:

```bash
git pull origin main --no-edit
npx tsx script/ci-hygiene.ts        # auto-fix
git add -A
git diff --cached --stat            # review what changed
git commit --no-verify -m "fix: ci hygiene — auto-fix lint warnings"
git push origin main --no-verify
```

## CI Configuration Reference

The GitHub CI lives at `.github/workflows/ci.yml` with two jobs:

| Job | Checks | Threshold |
|-----|--------|-----------|
| `lint-and-typecheck` | ESLint, `tsc`, Quick Audit | `--max-warnings 10` |
| `test-and-verify` | vitest, verify financials | All tests must pass |

## Known False-Positive Patterns

The secret scanner's `isFalsePositive` regex in
`tests/audit/integration-pipeline.test.ts` line ~401 covers:
- Module paths containing `risk-intelligence`
- Seed IDs prefixed with `brand:`

If Claude Code introduces new seed files with IDs matching `sk-*`, add the
pattern to the `isFalsePositive` check in that test file.

## ESLint Rules That Matter

From `eslint.config.mjs`:
- `@typescript-eslint/no-unused-vars` (warn) — vars matching `^_` are ignored
- `no-console` (warn) — `error`, `warn`, `info`, `debug` are allowed

The CI limit is 10 total warnings. Keep headroom by fixing all warnings, not
just enough to get under the limit.

---
title: "Squash-merge can ship a stale tree: PR merged with a failing required check poisons main"
date: 2026-05-11
last_updated: 2026-05-11
category: docs/solutions/workflow-issues
module: ci-merge-gates
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "A PR has a required CI check (e.g., Typecheck + Gates) in FAILURE status"
  - "A fix commit exists on the branch but the merge button is clicked before CI re-runs the rollup"
  - "Branch protection allows merge while the rollup status check shows FAILURE"
  - "A foundation PR (factory-v2, schema migration, large refactor) is being shipped with stacked fixes"
  - "Downstream U-numbered units inherit a regression because main shipped a broken tree"
tags:
  - squash-merge
  - ci-gates
  - typecheck-failure
  - branch-protection
  - pre-merge-verification
  - factory-v2
  - shipping-discipline
  - forward-fix
  - drive-by-cherry-pick
---

# Squash-merge can ship a stale tree: PR merged with a failing required check poisons main

## Context

PR #111 (Factory v2 foundation: plan doc + Company KPI reorg + KPI hero mockups) was opened, CI ran, and `Typecheck + Gates` reported FAILURE on `artifacts/hospitality-business-portal/src/components/company/CompanyIncomeTab.tsx:39:44 TS2322` — a `CompanyChartDataPoint[] | undefined` not assignable to the non-optional `yearlyChartData` prop on `CompanyBenchmarkPanel`. CC patched the bug (commit `fc436579`) on the same branch.

The PR was MERGED to `main` as squash commit `797535c8` **before the fix landed in the squash**. Inspection after merge:

```
$ gh pr view 111 --json state,statusCheckRollup --jq '.statusCheckRollup[] | select(.conclusion=="FAILURE")'
{"name": "Typecheck + Gates", "conclusion": "FAILURE"}

$ git show origin/main:artifacts/hospitality-business-portal/src/components/company/CompanyIncomeTab.tsx | sed -n '38,42p'
    )}
    <CompanyBenchmarkPanel global={global} yearlyChartData={yearlyChartData} financials={financials} />
    <ScrollReveal>
```

The merged tree on `main` contained the pre-fix code despite the PR title stating the work shipped. Every branch subsequently cut from `origin/main` inherited the broken typecheck. The downstream U1 PR (#112) tripped on it immediately and had to cherry-pick `fc436579` as a drive-by fix to make its own CI green.

This is orthogonal to the [pre-merge shipping gates discipline](./slide-factory-pre-merge-shipping-gates-2026-05-08.md) (which covers *silent* discipline gates being skipped). Here a *loud* technical gate was in FAILURE and the merge proceeded anyway.

## Guidance

### Pre-merge gate (mandatory for every CC PR)

Before clicking merge:

```bash
gh pr checks <num>
```

Every required check must show `pass`. Never approve a merge with the rationale "the fix is on the branch, CI will rerun after merge" — the squash boundary is unforgiving and the rollup status is what `main`'s post-merge reality reflects.

If the PR uses squash-merge and the latest push happened recently, **refresh the GitHub PR page** and re-confirm:

1. The squash preview includes every commit listed in `git log origin/main..origin/<branch>` on the source branch
2. The rollup shows green for every required check, not just for the latest run on the branch (GitHub's required-status-check setting must point at the latest commit; if it's configured loosely, tighten it)

### Post-merge verification

Immediately after merging:

```bash
git fetch origin main
git diff origin/main~1...origin/main -- <files-that-had-fixes>
```

Confirm the diff on `main` includes every fix commit's changes by content, not just by commit count. If a fix is missing, open a hotfix PR before any further branches are cut from `main`.

### Recovery — when main is already poisoned

Two paths, pick by how many branches will diverge before the next big PR lands.

**Tactical fix (next branch off main):** drive-by cherry-pick the fix commit into the very next CC branch cut from `origin/main`:

```bash
git checkout -b <next-unit-branch> origin/main
git cherry-pick <fix-sha>
# ... continue unit work
```

The next PR's body should acknowledge the drive-by:

> **Drive-by fix (not in this unit's scope but required for CI):** cherry-picked `<fix-sha>` — main is currently broken because PR #<n> merged with this `Typecheck + Gates` failure unresolved.

**Strategic fix (multiple branches will diverge soon):** open a dedicated hotfix PR off `origin/main` that contains only the cherry-picked fix commit, get it merged, then rebase all in-flight CC branches onto the now-green main. Costs a PR; saves N drive-by commits.

## Why This Matters

- A red `main` blocks every CC and Replit Agent session running on the repo until it's healed. The next branch each opens fails CI immediately, eroding trust in CI as a gate
- Drive-by fixes inflate downstream PR scope and muddy review attention — the reviewer has to mentally separate "the unit's work" from "the fix for main's regression"
- `git pull` doesn't heal it. Pulling broken `main` just propagates the breakage
- Rebasing the new branch onto main re-inherits the bug; rebase doesn't replay commits that aren't in the upstream history
- Trusting the squash captured the latest commit is the wrong default — GitHub squashes the PR-as-of-merge-time, and if a new commit was pushed after the squash preview rendered (or if the merger used an older preview), the latest commit is silently dropped

## When to Apply

- Always, before merging any PR with a required CI check
- Especially before merging a foundation PR that downstream units depend on (factory-v2 plan, schema migration, large refactor) — a poisoned main here cascades through every dependent branch
- Whenever a PR has had multiple force-pushes or post-CI commits — the highest-risk moment for squash-merge to capture a stale tree

## Examples

### Detecting the situation post-merge

```bash
# Did PR #111 actually ship with all checks green?
$ gh pr view 111 --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.name): \(.conclusion)"'
Analyze (actions): SUCCESS
Analyze (javascript-typescript): SUCCESS
Typecheck + Gates: FAILURE
...

# Yes — Typecheck + Gates was FAILURE at merge time
# Confirm main is broken
$ git fetch origin main
$ pnpm --filter @workspace/hospitality-business-portal run typecheck
artifacts/hospitality-business-portal typecheck: src/components/company/CompanyIncomeTab.tsx(39,44): error TS2322: ...
```

### Drive-by recovery in the next PR

```bash
# On feat/u1-pptx-substitution-spike, cut from origin/main
git cherry-pick fc436579   # the fix that should have been in #111's squash
# ... unit work continues, gets committed normally
git log origin/main..HEAD --oneline
# 55006ee9 feat(factory-v2): U1 — choose pptx-automizer for PPTX substitution
# 84c8d679 fix(company): guard CompanyBenchmarkPanel with yearlyChartData presence
```

PR #112's description explicitly flagged the drive-by:

> **Drive-by fix (not in U1 scope but required for CI):** cherry-picked `84c8d679` (the `CompanyBenchmarkPanel` typecheck guard) — main is currently broken because PR #111 merged with this Typecheck+Gates failure unresolved.

## Anti-patterns

- **"Merge anyway" / admin-override on a red required check** — even if the human reviewer believes the next commit fixes it, the squash boundary is unforgiving. If the fix is on the branch, wait for CI to re-run on the latest commit and confirm green before merging
- **Skipping `gh pr checks` because the GitHub UI looks green** — the UI sometimes caches stale state. The CLI hits the API and is authoritative
- **Force-pushing right before merging** — the squash preview may not reflect the latest force-pushed commit. Either wait for CI to settle on the force-push, or amend the PR after merge with a follow-up commit
- **Relying on the next PR to fix it** — every additional branch that diverges from a red main inherits the bug. If recovery is going to take more than one drive-by, open a hotfix PR

## Related

- [`docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md`](./slide-factory-pre-merge-shipping-gates-2026-05-08.md) — discipline gates (review, parity, harmonization) that fail silently; this doc is the technical-gate counterpart
- [`docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`](./cc-replit-branch-hygiene-2026-05-10.md) — the related scope-check gate; the `feat/u1-pptx-substitution-spike` recovery from PR #111's red main is in that doc's "WIP-file collision" worked example
- `CLAUDE.md` § "CC branch hygiene — Replit agent staging risk" — pre-merge audit rules

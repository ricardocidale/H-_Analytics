---
title: "Slide-factory pre-merge shipping gates: beyond typecheck, magic-numbers, and tests"
date: 2026-05-08
category: workflow-issues
module: slide-factory
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Shipping a slide-factory U-numbered unit (or any feature touching UI affordances + agent tools + memory-file content)
  - A second commit is stacked onto an in-flight PR after the first has already been reviewed
  - Post-merge realization that non-tooling-enforced gates (parity, harmonization, persona review) were skipped
  - Local main shows divergence after a squash-merge lands on origin
related_components:
  - documentation
  - tooling
tags:
  - slide-factory
  - pre-merge-gates
  - agent-native-parity
  - memory-file-harmonization
  - ce-code-review
  - forward-fix
  - squash-merge
  - git-workflow
---

# Slide-factory pre-merge shipping gates: beyond typecheck, magic-numbers, and tests

## Context

A CC session shipped slide-factory U8 work in PR #29 alongside U7. Three technical gates ran and passed (`pnpm run typecheck`, `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts`, scoped Vitest). The PR squash-merged into `main` as `48c66e97`. Only after merge did three CLAUDE.md-mandated discipline gates surface as skipped:

- CE multi-persona code review on the U8 commit (U7 had been reviewed in an 11-agent pass; U8 was committed straight from green technical gates with no review)
- Agent-native parity-map update (CLAUDE.md §7) for the new Tab 5/6 UI affordances
- CLAUDE.md ↔ replit.md harmonization (CLAUDE.md "Memory-file harmonization (mandatory shipping gate)")

The recurring failure mode: technical gates feel like *the* gates because they fail loudly. Discipline gates fail silently — nothing blocks the merge. The cost surfaces weeks later when Rebecca lacks parity for a shipped UI tab, when the two memory files have drifted enough that an agent loaded against the wrong one gets a stale contract, or when a follow-up PR is needed to address findings that should have been caught pre-merge.

A secondary situation surfaced during recovery: local `main` was 7 commits ahead of `origin/main` after the squash-merge landed. The 7 commits were stale un-squashed feature-branch history whose content was already represented in the squash commit. A `reset --hard origin/main` was the correct call, but only after a diagnostic confirmed the commits were redundant.

## Guidance

### 1. Pre-merge gate sequence for every slide-factory U-numbered unit

Run all five before requesting merge. The first three are technical (loud failures). The last two are discipline (silent failures — easy to skip).

```bash
pnpm run typecheck
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
pnpm --filter <scope> test                           # scoped to the unit's package
# Discipline gates — invoke as Skills, not commands:
#   Skill("compound-engineering:ce-code-review")  or  use the nai-code-review skill
#   Update docs/discipline/agent-native-parity-map.md     (CLAUDE.md §7)
#   Harmonize CLAUDE.md ↔ replit.md                       (CLAUDE.md "Memory-file harmonization")
# Frontend units only:
#   /post-coding-design-review                            (CLAUDE.md §11)
```

### 2. One U-numbered unit per PR

The slide-factory git log on `main` shows U2, U5, U7 each as their own squash commit — that is the convention. Bundling U7+U8 into PR #29 was off-pattern and is what allowed the discipline gates to slip; the unit boundary is also the review boundary, and once a second unit lands on the same branch the previously-passed review no longer covers everything in the PR. If a session begins work on U(N+1) before U(N) has merged, branch off the U(N) PR's tip and open a stacked PR rather than committing into the in-flight branch.

### 3. Forward-fix on a new branch when discipline gates are discovered post-merge

Reverting a squash-merge churns history visible to every collaborator and conflates the recovery decision with the original work. Forward-fix is lower-risk and additive:

```bash
git checkout main
git pull --ff-only
git checkout -b feat/<feature>-followup
# Run the missed discipline gates here:
#   - CE review on the just-merged commit
#   - Parity-map update
#   - Memory-file harmonization
#   - Address review findings as additional commits
# Open a clean additive PR; the merged code stays untouched.
```

The previously-merged code stays. The follow-up PR carries the discipline work as its own auditable unit.

### 4. Diagnose-then-reset pattern for stale local main after a squash-merge

Symptom: `git pull` rejects with "Diverging branches can't be fast-forwarded"; `git status` shows local main N commits ahead. Diagnose before resetting:

```bash
git log origin/main..main --oneline                # local-only commits
git diff origin/main..main --stat | tail -5        # what local "adds" relative to origin
echo ---
git diff main..origin/main --stat | tail -5        # what origin "adds" relative to local — should be inverse
```

If the two stat outputs are inverses (same files touched, opposite +/- counts), the local commits are fully subsumed by the squash. Safe action:

```bash
git reset --hard origin/main
```

Why this recurs in CC sessions: feature-branch commits accumulate on local `main` from prior session work; PR squash collapses them into one commit on origin, leaving the un-squashed copies orphaned locally. The diff inversion is the proof that no unique work is at risk.

## Why This Matters

Skipped discipline gates compound silently. Each U-numbered unit that ships without a parity-map update widens the gap between what users can do in the UI and what Rebecca can do via tools — the agent-native promise (CLAUDE.md §7) erodes one tab at a time. Each skipped harmonization pass lets `CLAUDE.md` and `replit.md` drift; the next agent loaded against the wrong file gets a stale contract. Each skipped CE review ships findings into `main` that then require a follow-up PR (PR #29 → 10 review findings on already-merged code is the exact tax). The fix for any single instance is mechanical (5–15 minutes); the discovery cost is hours of "why doesn't Rebecca know about Tab 5?" archaeology.

## When to Apply

- Before merging any slide-factory U-numbered PR — run all five gates.
- The moment a draft PR description lists more than one U-number — split it.
- After any squash-merge when `git pull` on local main fails — run the inverse-stat diagnostic before reaching for `reset --hard`.
- After discovering any CLAUDE.md-mandated gate was skipped post-merge — open a `<feature>-followup` branch off the merge commit, do not revert.

## Examples

### Parity map entry shape

Every new tab or action in `SlideFactoryPanel.tsx` adds a row to `docs/discipline/agent-native-parity-map.md` in the same PR:

```markdown
| UI Action | Endpoint | Rebecca Tool | Status |
|---|---|---|---|
| Tab 5 build progress poll | GET /api/lb-slides/factory/runs/:id | get_slide_factory_run | ✅ |
| Tab 6 download deck PDF | GET /api/lb-slides/factory/runs/:id/download | — | 🚫 N/A (file download) |
```

Status values follow CLAUDE.md §7: ✅ tool exists, ⚠️ gap that must be resolved before merge, 🚫 N/A for user-only or admin-only actions.

### Inverse-stat diagnostic — concrete recent context

After PR #29 merged as `48c66e97`, local `main` held 7 un-squashed U-numbered commits (U2, U5, Felix, CLAUDE.md compression, etc.). The two diff stats came back as inverses:

```
git diff origin/main..main --stat | tail
 23 files changed, 1860 insertions(+), 225 deletions(-)
git diff main..origin/main --stat | tail
 23 files changed, 225 insertions(+), 1860 deletions(-)
```

Same 23 files, opposite line counts → local commits' content already in the squash → `reset --hard origin/main` was safe. Without this check, the alternative (rebase / merge --no-ff) would have produced a confusing mixed-history outcome.

### Forward-fix branch naming

When recovery is needed, name the branch after the followup intent, not the original feature: `feat/slide-factory-u8-followup`, not `feat/slide-factory-u8-redo` or `fix/u8`. The followup branch's PR title should make the discipline scope explicit, e.g. `feat(slide-factory/U8.1): U8 review followup — server tests + status code + Tab 5/6 fixes`.

## Related

- `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` — canonical reference for the CLAUDE.md ↔ replit.md harmonization gate; this doc cites that one rather than restating the harmonization mechanics
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — slide-factory pipeline architecture and where the agent-native parity surface lives
- `docs/solutions/architecture-patterns/slide-factory-runs-schema-design-2026-05-07.md` — sibling slide-factory-v2 module reference
- `CLAUDE.md` §7 (Agent-Native Parity), §11 (Frontend Design Standards), and "Memory-file harmonization (mandatory shipping gate)" — the source-of-truth gates this doc operationalizes

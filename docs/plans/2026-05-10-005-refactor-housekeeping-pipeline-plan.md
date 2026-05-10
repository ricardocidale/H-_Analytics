---
title: "refactor: Housekeeping pipeline — push sprint, archive docs, catalogue next wave"
type: refactor
status: completed
date: 2026-05-10
origin: docs/plans/2026-05-10-004-refactor-large-file-splits-plan.md
---

# refactor: Housekeeping pipeline — push sprint, archive docs, catalogue next wave

## Summary

Ten large-file splits (tasks 1333–1342) are committed to local main but 8 commits remain unpushed. This plan closes out the sprint: push safely, re-lock the magic-numbers baseline, archive completed plan files, complete the two remaining doc-housekeeping tasks from the splits plan (T11 memory.md archival, T12 CLAUDE.md trim), and create task files for the next wave of large-file split candidates discovered during research.

---

## Problem Frame

The file-splitting sprint is done in code but not yet landed on origin. Three overhead items from the original plan (T11, T12, magic-numbers snapshot) remain open, and 21 completed plan files are cluttering `docs/plans/`. A second wave of large files (>800 lines, non-protected) was discovered that have no existing tasks.

---

## Requirements

- R1. All 8 unpushed commits from tasks 1340-1342 reach `origin/main` with no Replit Agent contamination.
- R2. `scripts/src/check-magic-numbers.ts --init` re-snapshots the baseline after the sprint.
- R3. 21 completed plan files are moved to `docs/plans/archive/` to reduce noise in the active list.
- R4. `memory.md` is trimmed from 934 → ≤ 210 lines; all `— COMPLETED` April 2026 sections move verbatim to `docs/memory-archive/2026-04-archive.md`.
- R5. `CLAUDE.md` is trimmed from 630 → ≤ 450 lines by removing content that duplicates skill files; `replit.md` is harmonized in the same commit.
- R6. Task files covering the next-wave large-file split candidates exist in `.local/tasks/` so they can be scheduled.

---

## Scope Boundaries

- No source-code feature work.
- No touches to `lib/engine/src/`, `lib/calc/src/`, or any §9-protected surface.
- Executing the next-wave splits themselves is deferred — this plan only creates their task files.
- `CLAUDE.md` §1–§12 inviolable rule headers are not shortened; only Architecture Notes and appendix prose is trimmed (T12).

### Deferred to Follow-Up Work

- Execute next-wave splits (task files created by U6): separate session per file, each with its own PR.
- Further memory.md trimming for May 2026 entries: deferred until they accumulate COMPLETED markers.

---

## Context & Research

### Relevant Code and Patterns

- `docs/plans/2026-05-10-004-refactor-large-file-splits-plan.md` — T11/T12 spec, verification gate list, risk notes.
- `.local/tasks/task-1343.md` — T11 archival spec (archive target, keep list, check:taxonomy-mirror gate).
- `lib/db/src/schema/intelligence/` — reference for how a domain-split barrel looks in this repo.
- `artifacts/api-server/src/chat/` — reference for how impl-domain files are named after a split.

### Institutional Learnings

- **Constants-barrel shadow bug** (`docs/solutions/logic-errors/constants-barrel-shadow-overwrites-submodule-2026-05-10.md`): after any constants split, grep both barrel files for local `export const` names that duplicate a sub-file export. Barrel files must contain only `export *` statements.
- **lib/db composite rebuild** (`docs/solutions/developer-experience/lib-db-composite-rebuild-before-typecheck-2026-05-07.md`): after touching `lib/db/src/schema/`, run `(cd lib/db && npx tsc)` before the full typecheck.
- **CC branch hygiene** (`docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`): check `git log origin/main..HEAD --format="%h %ae %s"` — Replit Agent commits carry `52429710-ricardocidale@users.noreply.replit.com`; CC commits carry `ricardo.cidale@norfolkgroup.io`.
- **Full pre-merge gate sequence** (`docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md`): technical gates + CE code review + agent-native parity map + CLAUDE.md↔replit.md harmonization when either file is touched.
- **Agent memory file drift** (`docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`): any edit to CLAUDE.md requires verbatim-identical sync of the matching section in replit.md in the same commit.

### External References

None — all patterns are well-established in local learnings.

---

## Key Technical Decisions

- **Push directly to origin/main** (not a branch): all 8 commits are already squash-clean from their original sprint execution; a branch-and-PR would just add ceremony for a housekeeping push with no behavioral change.
- **Re-snapshot magic-numbers before archiving plans**: the snapshot reflects the codebase state after all splits; running it after the push locks in the full sprint's gains.
- **Move (not delete) completed plan files**: `docs/plans/archive/` preserves audit trail. The 21 completed-status plans are safe to move because their content is already captured in git history and commit messages.
- **memory.md archival moves sections verbatim**: no editing of archived content — it's an audit trail. Only the presence of `— COMPLETED` in the section header (April 2026) determines inclusion.
- **CLAUDE.md trim scoped to architecture prose only**: §1–§12 rule headers are untouched. Only the Architecture Notes deep-dives that duplicate skill files are shortened to skill-pointer lines.

---

## Open Questions

### Resolved During Planning

- *Do the 8 unpushed commits include any Replit Agent commits?* — Unknown until the author-email check in U1 runs; if Replit commits are present, U1 branches to a cherry-pick flow.
- *Does a `docs/plans/archive/` or `docs/memory-archive/` dir already exist?* — Neither exists; both must be created.
- *Is the magic-numbers snapshot file committed to the repo?* — Needs verification during U2; if the snapshot lives only in `scripts/`, the commit is straightforward.

### Deferred to Implementation

- *Exact set of lines to remove in CLAUDE.md*: reading the current file at implementation time is required — the plan names the six prose blocks to trim (T12 spec) but exact line ranges shift as the file is edited.

---

## Implementation Units

- U1. **Verify + push sprint commits to origin/main**

**Goal:** Land tasks 1340-1342 (8 commits) on origin/main with confirmed authorship — no Replit Agent contamination.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: git state only (no source-file changes)

**Approach:**
- Run `git log origin/main..HEAD --format="%h %ae %s"` and inspect every commit's author email.
- CC commits: `ricardo.cidale@norfolkgroup.io`. If all 8 are CC: proceed to push.
- If any commit carries `52429710-ricardocidale@users.noreply.replit.com`: cherry-pick only the CC SHAs onto a fresh `main` branch off `origin/main`, then push that branch.
- Push: `git push origin main`.

**Patterns to follow:**
- `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`

**Test scenarios:**
- Happy path: all 8 commits have CC author email → push succeeds, `git log origin/main..HEAD` returns empty.
- Contamination path: Replit commit found → cherry-pick flow executes, only CC SHAs land on origin.

**Verification:**
- `git log origin/main..HEAD` is empty after the push.
- The three latest entries in `git log origin/main --oneline -3` match the task-1342 commit message.

---

- U2. **Re-snapshot magic-numbers baseline**

**Goal:** Re-lock the magic-numbers ratchet snapshot after the sprint so future additions are caught against the post-split codebase.

**Requirements:** R2

**Dependencies:** U1 (run after sprint is on origin — ensures the snapshot matches the public state)

**Files:**
- Modify: `scripts/src/magic-numbers-snapshot.json` (or wherever `--init` writes the snapshot)

**Approach:**
- Run: `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts --init`
- Commit the updated snapshot file with message referencing the sprint.
- Verify the standard gate still passes: `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts`

**Patterns to follow:**
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md`

**Test scenarios:**
- Happy path: `--init` exits 0, snapshot file modified, standard gate passes immediately after.
- Edge case: if `--init` reveals new violations introduced by the sprint, resolve them before committing the snapshot.

**Verification:**
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` passes with exit 0 after snapshot commit.

---

- U3. **Archive 21 completed plan files**

**Goal:** Move all `status: completed` plan files out of `docs/plans/` into `docs/plans/archive/` to reduce active-list noise.

**Requirements:** R3

**Dependencies:** None (independent of code changes)

**Files:**
- Create: `docs/plans/archive/` (new directory)
- Move: 21 `status: completed` plan files from `docs/plans/` → `docs/plans/archive/`

**Approach:**
- `mkdir -p docs/plans/archive/`
- Identify all files with `status: completed` in their YAML frontmatter: `grep -rl "^status: completed" docs/plans/ --include="*.md"`
- Move each: `mv docs/plans/<file> docs/plans/archive/<file>`
- Verify the 7 active plans + no-status plans remain in `docs/plans/` root.

**Test scenarios:**
- Happy path: 21 files moved, `ls docs/plans/*.md | wc -l` goes from 33 to 12.
- Edge case: a plan listed as completed is still actively referenced from an open task — check `.local/tasks/` for any `docs/plans/<completed-file>` references before moving.

**Verification:**
- `docs/plans/` root contains only active plans + the no-status reference docs.
- No `.local/tasks/` file links to a moved plan.

---

- U4. **Archive memory.md April 2026 completed entries (T11)**

**Goal:** Trim `memory.md` from 934 to ≤ 210 lines by extracting all `— COMPLETED` April 2026 sections to `docs/memory-archive/2026-04-archive.md`.

**Requirements:** R4

**Dependencies:** None (doc-only, no code deps)

**Files:**
- Create: `docs/memory-archive/2026-04-archive.md`
- Modify: `memory.md`

**Approach:**
- Identify moveable sections: all `### ...` headers containing both "April 2026" and "— COMPLETED" (or "— COMPLETE").
- Research found approximately 73 such sections spanning ~729 lines.
- Create `docs/memory-archive/2026-04-archive.md` with a header block and all moved sections pasted verbatim.
- Remove the moved sections from `memory.md`; keep all sections without a COMPLETED marker.
- Add a one-line pointer at the end of `memory.md`: `Archived session notes: docs/memory-archive/2026-04-archive.md`.
- Verify `check:taxonomy-mirror` passes (this gate checks the taxonomy table in memory.md is intact).

**Patterns to follow:**
- `.local/tasks/task-1343.md` — exact keep-list and archive target.

**Test scenarios:**
- Happy path: `wc -l memory.md` reports ≤ 210 lines; `wc -l docs/memory-archive/2026-04-archive.md` reports ≥ 700 lines; `check:taxonomy-mirror` passes.
- Edge case: section header uses `— COMPLETE` (no trailing D) — include it in the archive (one known instance: `Phase 5 Engine Observatory Wiring`).
- Edge case: a section has "April 2026" but no COMPLETED marker (e.g., Admin Replan v3, pgvector Skills) — these stay in `memory.md`.

**Verification:**
- `wc -l memory.md` ≤ 210.
- `docs/memory-archive/2026-04-archive.md` exists with all archived sections.
- `pnpm run check:taxonomy-mirror` (or equivalent) passes.

---

- U5. **Trim CLAUDE.md architecture prose (T12)**

**Goal:** Reduce `CLAUDE.md` from 630 to ≤ 450 lines by replacing deep-dive prose sections with skill-pointer lines; harmonize `replit.md` in the same commit.

**Requirements:** R5

**Dependencies:** None (independent)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `replit.md` (harmonization — must be same commit)

**Approach:**
- Six prose blocks to trim (from T12 spec in the splits plan):
  1. **§2 "Number Taxonomy"** trailing pointer line — remove the "Full law…" sentence (2 lines).
  2. **§"Number taxonomy — the permanent law"** in Architecture Notes — collapse the 25-line deep-dive to a 4-line pointer: "Full taxonomy: `.agents/skills/hplus-variable-taxonomy/SKILL.md`. Three recurring violations: [list inline]."
  3. **§"Inflation policy"** — trim to 3-line pointer to `inflation-cascade` skill.
  4. **§"`reference_brands` AI pipeline wiring"** — narrow to 2-line pointer.
  5. **§"Known issues to address"** — replace with "See `docs/issues/known-issues.md`." (1 line).
  6. **§"Agent & Skill System"** directory layout and core workflow sections — trim to a pointer block pointing at `replit.md` for the full index.
- After each trim, confirm the §1–§12 rule headers are unchanged.
- Scan `replit.md` for any shared section that was edited in CLAUDE.md; sync verbatim if a shared section changed; leave Replit-specific extras untouched.

**Patterns to follow:**
- `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` (harmonization discipline)
- `.agents/skills/agent-memory-files/SKILL.md`

**Test scenarios:**
- Happy path: `wc -l CLAUDE.md` ≤ 450; `wc -l replit.md` ≤ prior_count + 5 (replit.md may grow slightly if it was shorter); all §1–§12 headers present and unchanged.
- Edge case: a trimmed prose block is referenced by `.agents/skills/` SKILL.md files — verify skill files still have the pointer they need.
- Edge case: shared section wording differs between CLAUDE.md and replit.md after the edit — character-level diff to catch silent drift.

**Verification:**
- `wc -l CLAUDE.md` ≤ 450.
- All §1–§12 rule headers intact (grep for `## 1.`, `## 2.`, … `## 12.`).
- `git diff HEAD -- replit.md` shows the harmonized change alongside the CLAUDE.md change.

---

- U6. **Create task files for next-wave split candidates**

**Goal:** Produce a `.local/tasks/task-NNNN.md` file for each high-priority large-file split candidate discovered in this sprint, so they can be scheduled and executed in future sessions.

**Requirements:** R6

**Dependencies:** None (discovery work, independent)

**Files:**
- Create: `.local/tasks/task-1344.md` through `.local/tasks/task-1352.md` (9 files, one per candidate — exact count may vary)

**Approach:**
- Prioritize by size: >1000 lines = HIGH, 800-999 = MEDIUM.
- Exclude §9-protected files: `lib/engine/src/`, `lib/calc/src/`.
- For each candidate, write a task file following the existing task file template (title, What & Why, Done looks like, Steps, Relevant files).

Candidates (from research, ordered by priority):

| Task | File | Lines | Priority |
|------|------|-------|----------|
| 1344 | `artifacts/api-server/src/seeds/reference-ranges.ts` | 1,227 | HIGH |
| 1345 | `artifacts/api-server/src/ai/analyst-table-refresh.ts` | 1,205 | HIGH |
| 1346 | `artifacts/hospitality-business-portal/src/pages/intelligence/LlmWorkflowsPage.tsx` | 1,176 | HIGH |
| 1347 | `artifacts/api-server/src/ai/specialists/live-comparables.ts` | 1,028 | HIGH |
| 1348 | `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceRangesTab.tsx` | 1,007 | HIGH |
| 1349 | `lib/db/src/schema/specialist.ts` | 878 | MEDIUM |
| 1350 | `artifacts/api-server/src/routes/rebecca.ts` | 929 | MEDIUM |
| 1351 | `artifacts/api-server/src/routes/properties.ts` | 909 | MEDIUM |
| 1352 | `artifacts/api-server/src/ai/vector-indexing.ts` | 853 | MEDIUM |

**Test scenarios:**
- Test expectation: none — pure file creation, no behavioral change.

**Verification:**
- `ls .local/tasks/task-134{4..9}.md .local/tasks/task-135{0..2}.md` lists all 9 files.
- Each file has title, What & Why, Done looks like, Steps, and Relevant files sections.

---

## System-Wide Impact

- **Interaction graph:** U1 (push) unblocks U2 (snapshot). U3/U4/U5/U6 are independent. No route, component, or schema changes.
- **Error propagation:** N/A — no behavioral code changes.
- **State lifecycle risks:** U4 (memory.md trim) risks removing an active section — mitigated by only moving headers that contain both "April 2026" and "COMPLETED/COMPLETE".
- **API surface parity:** N/A.
- **Integration coverage:** N/A.
- **Unchanged invariants:** All source code behavior is unchanged. All §1–§12 CLAUDE.md rules survive U5 intact.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Replit Agent commits present in the 8 unpushed commits | U1 author-email check gates the push; cherry-pick flow isolates CC work |
| memory.md trim accidentally removes an active section | Only move sections with both "April 2026" AND `— COMPLETED/COMPLETE` in header |
| CLAUDE.md trim breaks a downstream skill file pointer | Grep `.agents/skills/*/SKILL.md` for references to the trimmed section titles before removing |
| `check:taxonomy-mirror` failure after memory.md trim | The taxonomy table is in the Critical Rules section which stays — no removal needed |
| Constants-barrel shadow bug emerges during U2 snapshot | `--init` will surface it; resolve before committing snapshot |

---

## Sources & References

- **Origin document:** `docs/plans/2026-05-10-004-refactor-large-file-splits-plan.md` (T11/T12 specs, sequencing)
- Related task: `.local/tasks/task-1343.md` (T11 archival spec)
- Learnings: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`
- Learnings: `docs/solutions/tooling/magic-numbers-ratchet-improvements.md`
- Learnings: `docs/solutions/developer-experience/lib-db-composite-rebuild-before-typecheck-2026-05-07.md`
- Learnings: `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`

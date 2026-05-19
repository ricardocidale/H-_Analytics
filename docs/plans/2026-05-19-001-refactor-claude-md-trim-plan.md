---
title: "refactor: Trim CLAUDE.md to gates-plus-pointers"
type: refactor
status: active
date: 2026-05-19
---

# refactor: Trim CLAUDE.md to gates-plus-pointers

## Summary

CLAUDE.md (590 lines / 42.8 KB) is loaded into every Claude Code session, so every line costs context on every invocation. This plan extracts the reference and changelog content — Project Source of Truth, Monorepo Structure, Stack, Key Commands, Environment Variables, Production Deployment, the Architecture Notes narrative, Recent Significant Changes, and Open TODOs — into linked docs under `docs/reference/`, `docs/architecture/`, `docs/changelog/`, and `docs/plans/`, replacing each with a one-line pointer. §1–§14 stay inline **verbatim** (they are the always-on enforcement reminder). `replit.md` is harmonized in lockstep.

---

## Problem Frame

CLAUDE.md serves three roles today, mixed together: (a) always-loaded enforcement gates (§1–§14), (b) project reference (stack, env vars, deployment), and (c) session changelog (Recent Significant Changes, Open TODOs). Roles (b) and (c) do not need to be in every session's context — they are lookups, not gates. Their presence inflates context cost on every turn for every CC user, with no enforcement benefit. The harmonization rule in CLAUDE.md ("Memory-file harmonization (mandatory shipping gate)") means `replit.md` must move in lockstep with any structural change.

---

## Requirements

- R1. **§1–§14 preserved verbatim** in CLAUDE.md, including canonical violation/fix examples and tables. No compression of gate content.
- R2. **§14 (Retirement Campaign Discipline) untouched** — locked 2026-05-18, must not be edited in this plan.
- R3. **`replit.md` harmonized**: every pointer in its "Pointers" table that references a moved CLAUDE.md section is updated to point to the new doc; no broken or stale references remain.
- R4. **Every extracted section retains a 1-line pointer inline in CLAUDE.md** (or a 1-block pointer for grouped extractions) so future agents can still discover the content from CLAUDE.md alone.
- R5. **All standard gates still PASS** post-refactor: `pnpm run typecheck`, `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts`, `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts`. (Should be no-ops since this is doc-only, but the gate must run per CLAUDE.md §5.)
- R6. **Target outcome: CLAUDE.md ≤ ~360 lines.** The realistic floor is dictated by §1–§14 (~290 lines) plus the always-needed header, pointer index, and gate-equivalent inline content (Inviolable login/auth rules) ≈ 360 lines. **The target is NOT ≤300 lines — that would require compressing §1–§14, which R1 forbids.**

---

## Scope Boundaries

- **Non-goal: Do NOT compress §1–§14.** Word-for-word preservation is the entire premise.
- **Non-goal: Do NOT touch §14.** Just locked 2026-05-18 per the §14-creation session.
- **Non-goal: Do NOT compress the canonical violation/fix examples** inside the gates — they are teaching material that explains the rule, not decoration.
- **Non-goal: Do NOT move "Inviolable login / auth rules"** (currently under Architecture Notes). The 5 rules function as a gate equivalent — they stay inline. Replit.md already mirrors them as a quick-ref block; that mirror stays.
- **Non-goal: Do NOT touch the `.agents/skills/` skill bodies.** Skill-file decompression (e.g., the 3,750-line `vercel-react-best-practices/AGENTS.md`) is out of scope for this plan; a separate audit-driven plan can address it.
- **Non-goal: Do NOT alter `replit.md`'s structural sections** (Run & Operate, Gotchas, Agent Coordination, Agent Taxonomy, Pointers, User Preferences, Open TODOs, Recent Changes). Only update pointer targets within them.

### Deferred to Follow-Up Work

- Skills-directory cleanup (oversized `vercel-react-*` AGENTS.md, `ce-code-review/SKILL.md`, etc.) — separate plan.
- Source-file decomposition for 50KB+ routes/pages/components — separate plan, falls under §9 (financial engine authoring authority) for finance-adjacent surfaces.

---

## Context & Research

### Current CLAUDE.md anatomy (line ranges from `grep -n "^## "`)

| Range | Content | Disposition |
|---|---|---|
| 1–10 | Header + harmonization note | Keep |
| 13–310 | §1–§14 gates | **Keep verbatim** (R1) |
| 312–318 | "Project Source of Truth" | Extract (U1) |
| 320–342 | Monorepo Structure | Extract (U1) |
| 345–365 | Stack | Extract (U1) |
| 368–378 | Key Commands | Extract (U1) |
| 382–405 | Environment Variables (api-server) | Extract (U2) |
| 408–433 | Production Deployment | Extract (U2) |
| 437–515 | Architecture Notes (Import discipline, Zod compat, Rebecca-only, Specialists, Costantino, Intelligence Display, Roles, Number taxonomy ref, Inflation, LB Slides, reference_brands pipeline, **Inviolable login/auth rules**, Known issues, Migration system, Shared proxy) | Extract narrative (U3); **keep Inviolable login/auth rules inline** (gate-equivalent) |
| 517–521 | Canonical Page Archetypes | Compress to 1-line pointer (U3) |
| 523–539 | Reference Documents | Keep (already a pointer index) |
| 541–565 | Agent & Skill System + CC branch hygiene | Keep (operational, frequently referenced) |
| 567–580 | Agent coordination + Memory-file harmonization | Keep (gate-equivalent) |
| 582–590 | Open TODOs — CC + Recent Significant Changes | Move (U4) |

### Relevant Code and Patterns

- `replit.md` already uses the pointer model successfully — its "Pointers" table (lines 90–124) is the canonical example of how a compact memory file delegates depth to skills and docs. Mirror this pattern in CLAUDE.md's post-trim shape.
- `replit.md` § "Recent Significant Changes" already enforces "≤ 3 entries" (line 155). Mirror this rule in CLAUDE.md to prevent the section from re-bloating.
- `agent-memory-files` skill at `.agents/skills/agent-memory-files/SKILL.md` — canonical harmonization discipline.

### Institutional Learnings

- Memory-file drift is a recurring failure mode noted in CLAUDE.md itself ("They drift by default"). The harmonization shipping gate exists because of past drift incidents.
- The session 21 work (2026-05-18) added §14 — a single section addition that triggered harmonization across both files. This plan is a larger reshape, so harmonization risk is proportionally higher and requires explicit per-unit verification.

### External References

- None — this is a project-internal doc refactor.

---

## Key Technical Decisions

- **Split extracted content by semantic concern, not into one monolith.** Three target docs cleanly map to the three role-groups being extracted: `docs/reference/project-overview.md` (what the product is + how it's built), `docs/reference/deployment-and-env.md` (how it ships + what env it needs), `docs/architecture/architecture-notes.md` (cross-cutting implementation notes). Rationale: each doc has a coherent audience and can evolve independently. A monolith re-bloats over time and re-creates the same problem.
- **Architecture Notes subsections compress to 1-line pointers in CLAUDE.md, full narrative in `docs/architecture/architecture-notes.md`.** Each existing subsection already ends with "see `<skill-or-doc>`" — the compressed form keeps the pointer, drops the inline summary. Rationale: agents needing the detail follow the pointer; agents needing only the rule see "Rebecca is the only AI assistant; see `embedded-ai-agent` skill" inline.
- **Keep "Inviolable login / auth rules" inline in CLAUDE.md** even though they sit under "Architecture Notes" today. They function as a gate (5 numbered rules with "Never edit X", "Always use Y" enforcement language), and `replit.md` already mirrors them as a quick-ref block. Moving them out would weaken enforcement.
- **Move "Open TODOs — CC" to `docs/plans/open-todos-cc.md` with a 1-line pointer inline.** Rationale: TODOs are actionable but they accrete over time (currently 6 rows, mixing checked and unchecked). A dedicated file lets the list grow without inflating always-loaded context. The 1-line pointer in CLAUDE.md keeps discoverability.
- **Move "Recent Significant Changes" body to `docs/changelog/cc-recent-changes.md`, keep ≤3 most recent entries inline** (mirror replit.md's cap). Rationale: identical to replit.md's existing pattern; bounded inline retention prevents bloat.
- **Do not introduce a new "Reference Documents v2" table.** The existing table at lines 523–539 already lists pointers and gets updated as paths change. Append new entries; don't restructure.
- **Use repo-relative paths in every extracted-content reference** — never absolute (CLAUDE.md is shared across machines/worktrees).

---

## Open Questions

### Resolved During Planning

- **Where to put extracted content?** → Split by semantic concern: `docs/reference/project-overview.md`, `docs/reference/deployment-and-env.md`, `docs/architecture/architecture-notes.md`, `docs/changelog/cc-recent-changes.md`, `docs/plans/open-todos-cc.md`. Three distinct directories already exist conventionally in this repo.
- **Should "Inviolable login / auth rules" be extracted?** → No. They are gate-equivalent (enforcement language); they stay inline.
- **Should §1–§14 numbering or content be compressed?** → No (R1 forbids).
- **Target line count?** → ≤360 lines. ≤300 not achievable while preserving §1–§14 verbatim (the gates alone are ~290 lines).

### Deferred to Implementation

- **Exact final line count of CLAUDE.md** — only knowable after extraction. Estimate: 340–360 lines. Will report actual in U4 verification.
- **Whether `docs/changelog/` and `docs/plans/open-todos-cc.md` should have their own minimal headers / pruning rules.** → Implementer decides at write time (mirror replit.md's ≤3-entries convention).

---

## Implementation Units

- U1. **Extract project source-of-truth, monorepo, stack, key commands**

**Goal:** Move CLAUDE.md lines 312–378 (Project Source of Truth + Monorepo Structure + Stack + Key Commands) into `docs/reference/project-overview.md`. Replace in CLAUDE.md with a single pointer block.

**Requirements:** R1, R3, R4, R5.

**Dependencies:** None.

**Files:**
- Create: `docs/reference/project-overview.md`
- Modify: `CLAUDE.md`
- Modify: `replit.md` (update any "Pointers" rows referencing the moved sections)

**Approach:**
- Copy lines 312–378 verbatim into the new doc; add a short H1 + 2-sentence preamble identifying it as the canonical project reference (this doc, not CLAUDE.md, is the deep source now).
- Replace the deleted block in CLAUDE.md with a 4-line pointer:
  > ## Project Reference
  >
  > Full project description, monorepo structure, stack, and key commands: `docs/reference/project-overview.md`.
- In `replit.md`'s "Pointers" table (lines 90–124), replace `Stack, monorepo structure, key commands | CLAUDE.md §§ "Stack", "Monorepo Structure", "Key Commands"` with `Stack, monorepo structure, key commands | docs/reference/project-overview.md`.

**Patterns to follow:**
- `replit.md`'s compact-pointer style (line 12: "Full list: `CLAUDE.md` § ..."), inverted to point outward.

**Test scenarios:**
- Test expectation: none — pure doc refactor with no executable behavior.

**Verification:**
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.
- `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts` PASS.
- `grep -c "^## " CLAUDE.md` shows §1–§14 headings unchanged (count matches pre-refactor).
- `grep -n "Monorepo Structure\|^## Stack\|^## Key Commands" CLAUDE.md` returns 0 matches (sections fully moved).
- `grep -n "docs/reference/project-overview.md" CLAUDE.md replit.md` returns ≥1 match in each file (pointer landed in both).
- Diff `replit.md` and confirm no orphaned `CLAUDE.md §§ "Stack"`-style references remain.

---

- U2. **Extract environment variables and production deployment**

**Goal:** Move CLAUDE.md lines 382–433 (Environment Variables + Production Deployment) into `docs/reference/deployment-and-env.md`. Replace in CLAUDE.md with a single pointer block.

**Requirements:** R1, R3, R4, R5.

**Dependencies:** U1 (`docs/reference/` directory exists; consistent pointer pattern established).

**Files:**
- Create: `docs/reference/deployment-and-env.md`
- Modify: `CLAUDE.md`
- Modify: `replit.md` (update the "Pointers" row referencing `CLAUDE.md §§ "Production Deployment", "Environment Variables (api-server)"`)

**Approach:**
- Copy lines 382–433 verbatim into the new doc.
- Replace in CLAUDE.md with:
  > ## Environment & Production Deployment
  >
  > Env vars (api-server), Railway production wiring, single-container model, secrets parity rule: `docs/reference/deployment-and-env.md`.
- Update `replit.md` "Pointers" table entry for "Production deployment + env vars".

**Patterns to follow:** Same as U1.

**Test scenarios:** Test expectation: none — pure doc refactor.

**Verification:**
- All R5 gates clean.
- `grep -n "^## Environment Variables\|^## Production Deployment" CLAUDE.md` returns 0 matches.
- `grep -n "docs/reference/deployment-and-env.md" CLAUDE.md replit.md` returns ≥1 in each.
- Confirm `replit.md` § "Run & Operate" line 12 (which already references `CLAUDE.md § "Environment Variables (api-server)"`) is updated to point to the new doc.

---

- U3. **Compress Architecture Notes; preserve Inviolable login/auth rules inline**

**Goal:** Move the narrative content of "Architecture Notes" subsections (lines 437–515) — Import discipline, Zod compatibility, Rebecca-only, Specialists, Costantino, Intelligence Display, Roles and permissions, Number taxonomy reference, Inflation policy, LB Slides, `reference_brands` pipeline, Known issues, Migration system, Shared proxy — into `docs/architecture/architecture-notes.md`. **Keep "Inviolable login / auth rules" (the 5 numbered rules block) inline in CLAUDE.md** as a gate-equivalent. Replace each moved subsection in CLAUDE.md with a 1–2 line pointer.

**Requirements:** R1, R3, R4, R5.

**Dependencies:** U1, U2 (extraction pattern established).

**Files:**
- Create: `docs/architecture/architecture-notes.md`
- Modify: `CLAUDE.md`
- Modify: `replit.md` (only if a Pointers row directly references one of the compressed subsections — verify by grep)

**Approach:**
- For each subsection: extract the full narrative into the new doc under a corresponding H3, then leave a 1-line pointer in CLAUDE.md keyed off the existing skill/doc reference each subsection already names. Example compression:
  > ### AI assistant — Rebecca only
  >
  > This app has exactly one AI assistant: **Rebecca** (semantic KB-search, pgvector + OpenAI embeddings). No voice agents, no Convai, no ElevenLabs. Detail: `embedded-ai-agent` skill, `docs/architecture/architecture-notes.md` § "Rebecca-only".
- "Inviolable login / auth rules" stays unmodified in CLAUDE.md. Move it to its own H2 (`## Inviolable Login / Auth Rules`) at the same nesting level as the gates, immediately after the compressed Architecture Notes pointer block. Rationale: surfacing it to H2 makes its gate-equivalent status visually explicit.
- "Canonical Page Archetypes" (lines 517–521) — already a 5-line pointer to the `ui-page-patterns` skill. Leave inline; no extraction needed.

**Patterns to follow:**
- `replit.md`'s "Inviolable Rules" pointer model (single line referencing multiple CLAUDE.md sections).

**Test scenarios:** Test expectation: none — pure doc refactor.

**Verification:**
- All R5 gates clean.
- `grep -c "^### " CLAUDE.md` count matches pre-refactor count minus the moved subsections.
- `grep -n "Import discipline\|Zod compatibility\|Rebecca only\|Specialists\|Costantino\|Intelligence Display" CLAUDE.md` returns at most 1 match per term (in the pointer block).
- `grep -n "Inviolable login\|DEV_SKIP_AUTH\|window.location" CLAUDE.md` confirms the 5 auth rules are still inline.
- `grep -n "docs/architecture/architecture-notes.md" CLAUDE.md` returns ≥1 match.
- New doc `docs/architecture/architecture-notes.md` opens with H1 + 1-paragraph preamble identifying it as the canonical home for the extracted notes.

---

- U4. **Move Recent Changes + Open TODOs; final harmonization sweep**

**Goal:** Move "Recent Significant Changes" body to `docs/changelog/cc-recent-changes.md` (keep ≤3 most recent entries inline, mirror replit.md cap). Move "Open TODOs — CC" body to `docs/plans/open-todos-cc.md` (keep a 1-line pointer + the "Discipline" reference inline). Run the full harmonization audit across CLAUDE.md ↔ replit.md per the `agent-memory-files` skill discipline. Add the new doc paths to CLAUDE.md's "Reference Documents" table.

**Requirements:** R1, R3, R4, R5, R6.

**Dependencies:** U1, U2, U3 (all prior extractions complete so harmonization sweep covers the whole set).

**Files:**
- Create: `docs/changelog/cc-recent-changes.md`
- Create: `docs/plans/open-todos-cc.md`
- Modify: `CLAUDE.md` (trim Recent Changes to ≤3 entries; replace Open TODOs body with pointer; update Reference Documents table; final line-count check)
- Modify: `replit.md` ("Pointers" table — add entries for the new docs; verify no stale references)

**Approach:**
- Copy the full "Recent Significant Changes" table body into `docs/changelog/cc-recent-changes.md`. In CLAUDE.md, keep the 2026-05-18 §14 entry, the 2026-05-18 Category 5 entry, and the 2026-05-17 UI canonical entry (3 most recent). Add a 1-line "Older entries: `docs/changelog/cc-recent-changes.md`" link below the table.
- Copy the full "Open TODOs — CC" table body into `docs/plans/open-todos-cc.md`. In CLAUDE.md, replace with:
  > ## Open TODOs — CC
  >
  > Active list: `docs/plans/open-todos-cc.md`. Discipline: `agent-memory-files` skill → "TODO Lists" section.
- Add three rows to CLAUDE.md's "Reference Documents" table (lines 523–539) for `project-overview.md`, `deployment-and-env.md`, `architecture-notes.md`.
- Run the harmonization audit:
  - For every H2 section name remaining in CLAUDE.md, grep `replit.md` for stale references; update to new paths.
  - For every new doc path created in U1–U4, confirm it's referenced from both CLAUDE.md (pointer block or Reference Documents table) and `replit.md` (Pointers table) where appropriate.
  - Report final CLAUDE.md line count via `wc -l CLAUDE.md` and verify ≤360.

**Patterns to follow:**
- `replit.md` § "Recent Significant Changes" header comment `<!-- keep ≤ 3 entries; remove oldest when adding new ones -->` — mirror this comment in CLAUDE.md's trimmed Recent Changes section to lock the cap.
- `replit.md` § "Open TODOs — Replit Agent" header comment `<!-- Discipline: agent-memory-files skill → "TODO Lists" section -->` — mirror in the trimmed CLAUDE.md Open TODOs pointer.

**Test scenarios:** Test expectation: none — pure doc refactor.

**Verification:**
- All R5 gates clean.
- `wc -l CLAUDE.md` reports ≤360 lines. If above 360, identify what's still pulling weight and report; do not over-trim into §1–§14.
- `grep -c "^## " CLAUDE.md` final count: §1–§14 (14 H2s) + Project Reference pointer + Environment & Deployment pointer + Inviolable Login/Auth Rules + Canonical Page Archetypes + Reference Documents + Agent & Skill System + Open TODOs — CC pointer + Recent Significant Changes = ~22 H2s total (vs ~28 today).
- Harmonization audit:
  - `grep -n 'CLAUDE.md §§ "Stack"\|CLAUDE.md § "Production Deployment"\|CLAUDE.md § "Environment Variables"' replit.md` returns 0 matches.
  - `grep -n 'docs/reference/project-overview.md\|docs/reference/deployment-and-env.md\|docs/architecture/architecture-notes.md' replit.md` returns ≥1 match per path (or absence is explicitly justified — e.g., the Pointers table compresses related paths into a single row).
- `git diff CLAUDE.md` shows §1–§14 lines (13–310) byte-for-byte unchanged in the gates content. (Diff may show context lines around the trimmed surroundings; the gate bodies themselves must be identical.)
- Final commit message names every doc created/modified.

---

## System-Wide Impact

- **Interaction graph:** No runtime code touched. Agents that load CLAUDE.md into context will see a smaller file; agents needing extracted detail follow pointers. The `agent-memory-files` skill protocol is honored by U4's harmonization sweep.
- **Error propagation:** N/A — doc-only.
- **State lifecycle risks:** None at runtime. The only stateful risk is doc drift between CLAUDE.md pointers and the extracted doc filenames; mitigated by the harmonization audit in U4.
- **API surface parity:** N/A.
- **Integration coverage:** Skill files (`.agents/skills/**`) that reference CLAUDE.md by section name remain valid because §1–§14 numbering is preserved. Skills that reference moved sections (e.g., "see CLAUDE.md § Stack") need pointer-target updates — the U4 sweep covers `replit.md` but does not sweep `.agents/skills/`. **Implementer must run** `grep -rn 'CLAUDE.md §' .agents/skills/ docs/` in U4 verification and report any stale references found (fix in-scope if trivial, otherwise log as follow-up).
- **Unchanged invariants:**
  - §1–§14 gate content and numbering unchanged (R1, R2).
  - The 5 Inviolable login/auth rules remain inline in CLAUDE.md.
  - The CC↔Replit status-file protocol and Memory-file harmonization shipping gate are unchanged.
  - All CI gates (`check-magic-numbers`, `check-ui-canonical`, `check-migration-guards`, `typecheck`) PASS unchanged — none of them inspect CLAUDE.md.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `replit.md` drifts from CLAUDE.md because units land in separate commits and only some update `replit.md`. | Every unit's verification step includes a `grep` check that the moved section's name no longer appears as a CLAUDE.md reference inside `replit.md`. U4 runs a final cross-file harmonization audit. |
| External skills (in `.agents/skills/`) reference moved CLAUDE.md sections by name and break silently. | U4 verification explicitly greps `.agents/skills/` and `docs/` for stale `CLAUDE.md § "..."` references and reports findings. |
| Implementer over-trims and accidentally touches §1–§14 or §14 specifically. | U4 verification diff check: `git diff` must show §1–§14 content (lines 13–310 pre-refactor) byte-for-byte identical. Reject the unit if not. |
| Target ≤300 lines was implied but is structurally impossible; implementer compresses §1–§14 to hit it. | Plan explicitly states R6 target is ≤360, not ≤300. Reviewer enforces R1 over R6 if conflict arises. |
| `docs/reference/` does not exist yet (only `docs/architecture/`, `docs/concepts/`, `docs/changelog/` do not exist — verify). | U1 implementer creates `docs/reference/` as part of the unit; U3 creates `docs/architecture/`; U4 creates `docs/changelog/`. No CI dependency on these dirs existing in advance. |
| The "Inviolable login / auth rules" extraction is debated by reviewer (could go either way). | Plan locks the decision: stays inline, surfaced to H2. If reviewer wants to move them out, that's a separate plan. |

---

## Documentation / Operational Notes

- This is a doc-only refactor with **no engine, calc, or runtime code touched**. §9 (Financial Engine Authoring Authority) does not apply. Any agent — CC, Replit Agent, execute-this-plan handoff — can implement this plan, though CC is the natural fit since CLAUDE.md is its memory file.
- After merge, the first session that loads the new CLAUDE.md should run a sanity check: spot-read each pointer block, confirm targets resolve, and confirm §1–§14 still feel like the dominant content.
- If future maintainers extend the new docs (e.g., add a new Architecture Note), they extend the corresponding `docs/architecture/architecture-notes.md` rather than re-inflating CLAUDE.md. The `agent-memory-files` skill's TODO-list discipline now applies to the extracted docs as well.

---

## Sources & References

- `CLAUDE.md` (current state, 590 lines as of 2026-05-19) — the file being trimmed.
- `replit.md` (current state, 160 lines as of 2026-05-19) — harmonization counterpart.
- `.agents/skills/agent-memory-files/SKILL.md` — canonical harmonization discipline.
- CLAUDE.md § "Memory-file harmonization (mandatory shipping gate)" — the rule this plan honors.
- CLAUDE.md §14 (Retirement Campaign Discipline, 2026-05-18) — the locked section this plan must not touch.
